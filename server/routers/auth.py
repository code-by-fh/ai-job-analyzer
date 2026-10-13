from typing import Annotated, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import AfterValidator, BaseModel, StringConstraints
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.core import SessionLocal, User
from services.user_data import delete_user, delete_user_content
from core.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_admin_user,
    verify_password,
    get_password_hash,
    token_claims,
    user_from_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    REFRESH_TOKEN_TYPE,
)
from routers.deps import (
    ACCESS_TOKEN_COOKIE, PASSWORD_CHECK_RATE, limiter, COOKIE_SECURE, refuse_while_crawling, user_or_ip_key,
)
from core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
# bcrypt reads only the first 72 bytes: passlib with bcrypt 3 silently ignores the rest, bcrypt 5 raises.
BCRYPT_MAX_PASSWORD_BYTES = 72
PASSWORD_TOO_MANY_BYTES = f"must be at most {BCRYPT_MAX_PASSWORD_BYTES} bytes in UTF-8"


def _within_bcrypt_bytes(password: str) -> str:
    # A longer password would be accepted but only partly checked, so it is refused instead.
    if len(password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(PASSWORD_TOO_MANY_BYTES)
    return password


NewPassword = Annotated[
    str,
    StringConstraints(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH),
    AfterValidator(_within_bcrypt_bytes),
]
CHANGE_PASSWORD_RATE = "5/minute"
REFRESH_TOKEN_COOKIE = "refresh_token"
MIN_USERNAME_LENGTH = 3
MAX_USERNAME_LENGTH = 50
USERNAME_PATTERN = r"^[A-Za-z0-9._@-]+$"
USERNAME_TAKEN = "username_taken"
CANNOT_DELETE_SELF = "cannot_delete_self"
CANNOT_DELETE_ADMIN = "cannot_delete_admin"
DEFAULT_USERS_PAGE = 100
MAX_USERS_PAGE = 200
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=MIN_USERNAME_LENGTH, max_length=MAX_USERNAME_LENGTH,
        pattern=USERNAME_PATTERN,
    ),
]


class UserCreate(BaseModel):
    username: Username
    password: NewPassword


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool


class Token(BaseModel):
    access_token: str
    token_type: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class FactoryResetRequest(BaseModel):
    password: str


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _start_session(response: Response, user: User) -> None:
    """Sets both session cookies for the user's current token version."""
    _set_access_cookie(response, create_access_token(data=token_claims(user)))
    _set_refresh_cookie(response, create_refresh_token(data=token_claims(user)))


@router.post("/auth/login")
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == form_data.username).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
            )
        _start_session(response, user)
        return {"status": "ok"}
    finally:
        db.close()


@router.post("/auth/refresh")
@limiter.limit("20/minute")
async def refresh_access_token(request: Request, response: Response):
    db = SessionLocal()
    try:
        user = user_from_token(db, request.cookies.get(REFRESH_TOKEN_COOKIE), REFRESH_TOKEN_TYPE)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate refresh token",
            )
        _set_access_cookie(response, create_access_token(data=token_claims(user)))
        return {"status": "ok"}
    finally:
        db.close()


@router.post("/auth/logout")
async def logout(response: Response, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if user:
            user.token_version += 1
            db.commit()
    finally:
        db.close()
    response.delete_cookie(
        key="access_token", httponly=True, secure=COOKIE_SECURE, samesite="lax"
    )
    response.delete_cookie(
        key="refresh_token", httponly=True, secure=COOKIE_SECURE, samesite="lax"
    )
    return {"status": "logged out"}


@router.post("/auth/change-password")
@limiter.limit(CHANGE_PASSWORD_RATE, key_func=user_or_ip_key)
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    """Sets the new password and revokes every other session; the caller gets fresh cookies."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")

        user.hashed_password = get_password_hash(body.new_password)
        user.token_version += 1
        db.commit()
        response = JSONResponse({"status": "password updated"})
        _start_session(response, user)
        return response
    finally:
        db.close()


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=List[UserResponse])
async def read_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_USERS_PAGE, ge=1, le=MAX_USERS_PAGE),
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.username).offset(skip).limit(limit).all()
        return users
    finally:
        db.close()


def _username_taken(db: Session, username: str) -> bool:
    """Case-insensitive, so "Jonas" and "jonas" never become two accounts; login itself stays exact."""
    return db.query(User.id).filter(func.lower(User.username) == username.lower()).first() is not None


def _insert_user(db: Session, user: UserCreate) -> User:
    """Commits the new member; a duplicate that slipped past the check is refused by the unique index."""
    new_user = User(username=user.username, hashed_password=get_password_hash(user.password), is_admin=False)
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN)
    db.refresh(new_user)
    return new_user


@router.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        if _username_taken(db, user.username):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN)
        return _insert_user(db, user)
    finally:
        db.close()


def _ensure_deletable(target: Optional[User], current_user: User) -> None:
    """Refuses an admin delete unless the target exists, is not the caller, and is not another admin."""
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CANNOT_DELETE_SELF)
    if target.is_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CANNOT_DELETE_ADMIN)


@router.delete("/users/{user_id}")
def delete_user_endpoint(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Deletes a member with everything they own; refuses self, admins, and a member whose crawl runs."""
    db = SessionLocal()
    try:
        _ensure_deletable(db.query(User).filter(User.id == user_id).first(), current_user)
        refuse_while_crawling(db, user_id)
        delete_user(db, user_id)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@router.delete("/user/reset")
@limiter.limit(PASSWORD_CHECK_RATE, key_func=user_or_ip_key)
def reset_user_data(request: Request, body: FactoryResetRequest, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user or not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect password")
        refuse_while_crawling(db, current_user.id)
        counts = delete_user_content(db, current_user.id)
        db.commit()
        return {"status": "reset complete", **counts}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Reset der Benutzerdaten: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()
