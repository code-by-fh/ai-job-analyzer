import os
from typing import Optional

from sqlalchemy.orm import Session
from openai import OpenAI
from slowapi import Limiter
from slowapi.util import get_remote_address

from database.core import SystemSettings, SessionLocal

limiter = Limiter(key_func=get_remote_address)

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
    "google_drive_refresh_token",
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
        "created_at": t.created_at.isoformat() if t.created_at else "",
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
