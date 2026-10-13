from datetime import datetime, timedelta
from typing import Optional
import os
import re
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from database.core import SessionLocal, User

# Security Config
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set. Cannot start server.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
_USER_ID_SUBJECT = re.compile(r"[1-9][0-9]{0,17}")


def token_claims(user: User) -> dict:
    """The claims every session token carries: the account id (never the reusable username) and its version."""
    return {"sub": str(user.id), "tv": user.token_version}


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": ACCESS_TOKEN_TYPE})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": REFRESH_TOKEN_TYPE})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def token_subject(token: str, token_type: str) -> Optional[tuple]:
    """(user id, token version) of a validly signed, expiring token of this type, else None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require_exp": True})
    except JWTError:
        return None
    subject = payload.get("sub")
    # A token from before ruling R9 names the username: it is refused, so its holder signs in again.
    # ASCII digits only and bounded: isdecimal() also accepts other scripts' digits, and an id beyond
    # BIGINT overflows in the database driver.
    if payload.get("type") != token_type or not isinstance(subject, str) or not _USER_ID_SUBJECT.fullmatch(subject):
        return None
    return int(subject), payload.get("tv", 0)


def user_from_token(db: Session, token: Optional[str], token_type: str) -> Optional[User]:
    """The account a token of this type names, if it still exists at the token's version; else None."""
    subject = token_subject(token, token_type) if token else None
    if subject is None:
        return None
    user_id, token_version = subject
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.token_version != token_version:
        return None
    return user


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(request: Request, db: Session = Depends(get_db)):
    user = user_from_token(db, request.cookies.get("access_token"), ACCESS_TOKEN_TYPE)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return user


async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
