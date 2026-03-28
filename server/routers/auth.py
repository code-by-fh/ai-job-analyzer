from typing import List

from fastapi import APIRouter, HTTPException, Request, Response, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from database.core import SessionLocal, User, JobEntry, UserProfile, JobPlatform
from core.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_admin_user,
    verify_password,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from routers.deps import limiter, COOKIE_SECURE

router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool


class Token(BaseModel):
    access_token: str
    token_type: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class FactoryResetRequest(BaseModel):
    password: str


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
        token_data = {"sub": user.username, "tv": user.token_version}
        access_token = create_access_token(data=token_data)
        refresh_token = create_refresh_token(data=token_data)
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        )
        return {"status": "ok"}
    finally:
        db.close()


@router.post("/auth/refresh")
@limiter.limit("20/minute")
async def refresh_access_token(request: Request, response: Response):
    from jose import JWTError, jwt
    from core.auth import SECRET_KEY, ALGORITHM

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
    )
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise credentials_exception
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_exception
        username: str = payload.get("sub")
        token_version: int = payload.get("tv", 0)
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or user.token_version != token_version:
            raise credentials_exception
        token_data = {"sub": user.username, "tv": user.token_version}
        access_token = create_access_token(data=token_data)
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
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
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")

        user.hashed_password = get_password_hash(body.new_password)
        db.commit()
        return {"status": "password updated"}
    finally:
        db.close()


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=List[UserResponse])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        users = db.query(User).offset(skip).limit(limit).all()
        return users
    finally:
        db.close()


@router.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.username == user.username).first()
        if db_user:
            raise HTTPException(status_code=400, detail="Username already registered")
        hashed_password = get_password_hash(user.password)
        new_user = User(
            username=user.username, hashed_password=hashed_password, is_admin=False
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    finally:
        db.close()


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Delete dependent data first to avoid IntegrityError
        # 1. Delete Jobs (depend on User and Platform)
        db.query(JobEntry).filter(JobEntry.user_id == user_id).delete()

        # 2. Delete Profile (depends on User)
        db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()

        # 3. Delete Platforms (depend on User)
        # Note: Jobs referring to these platforms are already deleted above
        db.query(JobPlatform).filter(JobPlatform.user_id == user_id).delete()

        db.delete(user)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@router.delete("/user/reset")
def reset_user_data(request: FactoryResetRequest, current_user: User = Depends(get_current_user)):
    from core.logger import get_logger
    logger = get_logger(__name__)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user or not verify_password(request.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect password")

        jobs_deleted = (
            db.query(JobEntry).filter(JobEntry.user_id == current_user.id).delete()
        )
        platforms_deleted = (
            db.query(JobPlatform).filter(JobPlatform.user_id == current_user.id).delete()
        )
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        profile_deleted = False
        if profile:
            db.delete(profile)
            profile_deleted = True
        db.commit()
        return {
            "status": "reset complete",
            "jobs_deleted": jobs_deleted,
            "platforms_deleted": platforms_deleted,
            "profile_deleted": profile_deleted,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Fehler beim Reset der Benutzerdaten: {e}")
        raise HTTPException(status_code=500, detail="Datenbankfehler")
    finally:
        db.close()
