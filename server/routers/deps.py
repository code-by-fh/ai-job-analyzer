import os
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session
from openai import OpenAI
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.auth import ACCESS_TOKEN_TYPE, token_subject
from database.core import JobPlatform, SystemSettings, SessionLocal, iso_utc

limiter = Limiter(key_func=get_remote_address)
# A channel test sends a real message through a paid or rate-limited provider.
NOTIFICATION_TEST_RATE = "5/minute"
# Each reset or wipe attempt checks the caller's password: unlimited, it would be an oracle for a stolen session.
PASSWORD_CHECK_RATE = "5/minute"
# A running crawl would still save jobs that point at the sources a delete removes.
CRAWL_RUNNING = "Crawl running"
ACCESS_TOKEN_COOKIE = "access_token"


def user_or_ip_key(request: Request) -> str:
    """Rate-limit key: the signed-in user, so users behind one proxy IP never share a bucket; else the IP.

    Only a token route auth would accept by its claims counts (core.auth.token_subject); a missing,
    expired, forged or old-format one falls back to the client IP.
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    subject = token_subject(token, ACCESS_TOKEN_TYPE) if token else None
    return f"user:{subject[0]}" if subject else get_remote_address(request)


def refuse_while_crawling(db: Session, user_id: int) -> None:
    """409 while a crawl runs: it would still save jobs that point at the sources a reset, delete or wipe removes."""
    # Imported here: routers.platforms imports this module, so a top-level import would be circular.
    from routers import platforms

    platform_ids = [platform_id for (platform_id,) in db.query(JobPlatform.id).filter(JobPlatform.user_id == user_id)]
    if platforms.any_crawl_running(user_id, platform_ids):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CRAWL_RUNNING)


COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")

APPLICATION_STATUSES = ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]

_SECRET_MASK = "__masked__"
_SECRET_FIELDS = {
    "pushover_api_token",
    "resend_api_key",
    "mailjet_api_key",
    "mailjet_secret_key",
    "smtp_password",
}


def _mask_profile(profile) -> dict:
    """Return a dict of profile fields with sensitive secrets replaced by the mask sentinel."""
    from sqlalchemy import inspect as sa_inspect
    data = {c.key: getattr(profile, c.key) for c in sa_inspect(profile).mapper.column_attrs}
    for field in _SECRET_FIELDS:
        if data.get(field):
            data[field] = _SECRET_MASK
    return data


def _template_to_dict(t) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "type": t.type,
        "content": t.content,
        "is_admin": t.is_admin,
        "user_id": t.user_id,
        "created_at": iso_utc(t.created_at) or "",
    }


def get_openrouter_client():
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        api_key = settings.openrouter_api_key if settings else ""
    except Exception:
        api_key = ""
    finally:
        db.close()
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)


def get_current_model(db: Session = None):
    # If db is provided, use it. Otherwise create new session.
    local_db = False
    if not db:
        db = SessionLocal()
        local_db = True
    try:
        settings = db.query(SystemSettings).first()
        return (
            settings.openrouter_model
            if settings
            else "tngtech/deepseek-r1t2-chimera:free"
        )
    except Exception:
        return "tngtech/deepseek-r1t2-chimera:free"
    finally:
        if local_db:
            db.close()
