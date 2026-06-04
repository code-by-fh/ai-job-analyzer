import os
from typing import Optional

import redis as redis_sync
import requests
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database.core import (
    SessionLocal,
    User,
    SystemSettings,
    JobEntry,
    JobPlatform,
    CompanyProfile,
    JobStatusHistory,
    JobDocument,
    NotificationTemplate,
    NotificationTemplateCreate,
    NotificationTemplateUpdate,
    NotificationTemplateResponse,
)
from core.auth import get_current_admin_user, verify_password
from routers.deps import _template_to_dict
from core.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


class SystemSettingsUpdate(BaseModel):
    openrouter_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_base_url: Optional[str] = None


class AdminWipeRequest(BaseModel):
    password: str
    wipe_all_users: bool = False


@router.get("/admin/settings")
def get_admin_settings(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        if not settings:
            return {
                "openrouter_model": "tngtech/deepseek-r1t2-chimera:free",
                "openrouter_api_key_set": False,
                "ollama_model": "llama3.1:8b",
                "ollama_base_url": "",
            }
        return {
            "openrouter_model": settings.openrouter_model,
            "openrouter_api_key_set": bool(settings.openrouter_api_key),
            "ollama_model": settings.ollama_model or "llama3.1:8b",
            "ollama_base_url": settings.ollama_base_url or "",
        }
    finally:
        db.close()


@router.post("/admin/settings")
def update_admin_settings(
    settings: SystemSettingsUpdate, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        db_settings = db.query(SystemSettings).first()
        if not db_settings:
            model_val = settings.openrouter_model or "tngtech/deepseek-r1t2-chimera:free"
            db_settings = SystemSettings(openrouter_model=model_val)
            db.add(db_settings)
        elif settings.openrouter_model is not None:
            db_settings.openrouter_model = settings.openrouter_model
        if settings.openrouter_api_key is not None:
            db_settings.openrouter_api_key = settings.openrouter_api_key or None
        if settings.ollama_model is not None:
            db_settings.ollama_model = settings.ollama_model or "llama3.1:8b"
        if settings.ollama_base_url is not None:
            db_settings.ollama_base_url = settings.ollama_base_url or None
        db.commit()
        return {
            "status": "updated",
            "openrouter_model": db_settings.openrouter_model,
            "openrouter_api_key_set": bool(db_settings.openrouter_api_key),
            "ollama_model": db_settings.ollama_model or "llama3.1:8b",
            "ollama_base_url": db_settings.ollama_base_url or "",
        }
    finally:
        db.close()


@router.delete("/admin/clear-ai-error")
def clear_ai_error_endpoint(current_user: User = Depends(get_current_admin_user)):
    from intelligence.service import clear_ai_404_error
    clear_ai_404_error()
    return {"status": "cleared"}


@router.post("/admin/redis/cleanup")
def cleanup_stale_redis_jobs_endpoint(current_user: User = Depends(get_current_admin_user)):
    """Immediately remove crawl jobs from Redis that are older than 5 minutes."""
    import time as time_module

    STALE_THRESHOLD_MS = 5 * 60 * 1000
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    r = redis_sync.from_url(redis_url, decode_responses=True)

    now_ms = int(time_module.time() * 1000)
    removed = 0

    job_keys = r.keys("crawl_job:*")
    job_keys = [k for k in job_keys if k.count(":") == 1]

    for key in job_keys:
        job_data = r.hgetall(key)
        if not job_data:
            continue
        started_at = job_data.get("started_at")
        if not started_at:
            continue
        age_ms = now_ms - int(started_at)
        if age_ms < STALE_THRESHOLD_MS:
            continue
        status = job_data.get("status", "")
        if status == "completed":
            continue
        job_id = key.split(":", 1)[1]
        user_id = job_data.get("user_id")
        r.delete(key)
        r.delete(f"crawl_job:{job_id}:all_job_titles")
        if user_id:
            r.srem(f"user:{user_id}:active_crawls", job_id)
        removed += 1

    if removed:
        r.delete("system:crawling")

    return {"removed": removed}


@router.get("/admin/openrouter/models")
def get_openrouter_models(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        api_key = settings.openrouter_api_key if settings else None
    finally:
        db.close()

    if not api_key:
        raise HTTPException(status_code=400, detail="No OpenRouter API key configured")

    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"output_modalities": "text"},
            timeout=10,
        )
        if not response.ok:
            raise HTTPException(status_code=response.status_code, detail="OpenRouter API error")
        data = response.json().get("data", [])
        models = [
            {
                "id": m["id"],
                "name": m.get("name", m["id"]),
                "context_length": m.get("context_length"),
                "pricing": m.get("pricing", {}),
            }
            for m in data
            if m.get("id")
        ]
        models.sort(key=lambda m: m["name"].lower())
        return models
    except requests.RequestException as e:
        logger.error(f"Failed to fetch OpenRouter models: {e}")
        raise HTTPException(status_code=502, detail="Could not reach OpenRouter API")


@router.post("/admin/test/openrouter")
def test_openrouter_connection(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        api_key = settings.openrouter_api_key if settings else None
        model = settings.openrouter_model if settings else None
    finally:
        db.close()

    if not api_key:
        raise HTTPException(status_code=400, detail="No OpenRouter API key configured")
    if not model:
        raise HTTPException(status_code=400, detail="No model configured")

    try:
        from openai import OpenAI as _OpenAI
        client = _OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            default_headers={"HTTP-Referer": "https://github.com/ai-job-analyzer"},
        )
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=1,
        )
        return {"ok": True, "model": model}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/admin/test/ollama")
def test_ollama_connection(current_user: User = Depends(get_current_admin_user)):
    from intelligence.service import get_ollama_base_url, get_ollama_model
    db = SessionLocal()
    try:
        base_url = get_ollama_base_url(db)
        model = get_ollama_model(db)
    finally:
        db.close()

    try:
        response = requests.get(
            f"{base_url.rstrip('/')}/models",
            timeout=5,
        )
        if response.ok:
            body = response.json()
            # Handle both {"data": [...]} and top-level list formats
            items = body.get("data", body) if isinstance(body, dict) else body
            available = [m.get("id") or m.get("key", "") for m in items if isinstance(m, dict)]
            available = [a for a in available if a]
            # Prefix-match: "google/gemma-4-e4b" matches "google/gemma-4-e4b@q4_k_m"
            model_found = any(a == model or a.startswith(model + "@") for a in available)
            return {"ok": True, "model": model, "model_found": model_found, "available_models": available}
        raise HTTPException(status_code=502, detail=f"Server returned {response.status_code}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach server: {e}")


@router.post("/admin/database/wipe")
def wipe_database(
    request: AdminWipeRequest, current_user: User = Depends(get_current_admin_user)
):
    from sqlalchemy import func

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(request.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Falsches Passwort")

        if request.wipe_all_users:
            # Delete EVERYTHING (Jobs, History, Platforms, Companies, Patterns)
            db.query(JobStatusHistory).delete(synchronize_session=False)
            db.query(JobDocument).delete(synchronize_session=False)
            db.query(JobEntry).delete(synchronize_session=False)
            db.query(JobPlatform).delete(synchronize_session=False)
            db.query(CompanyProfile).delete(synchronize_session=False)
        else:
            # Delete ONLY for admin user
            admin_id = current_user.id
            logger.info(f"Wiping data for user {admin_id}")

            # History & Documents
            job_ids_query = db.query(JobEntry.id).filter(JobEntry.user_id == admin_id)
            job_ids = [r[0] for r in job_ids_query.all()]
            logger.info(f"Found {len(job_ids)} jobs to delete")

            if job_ids:
                h_del = db.query(JobStatusHistory).filter(
                    JobStatusHistory.job_id.in_(job_ids)
                ).delete(synchronize_session=False)
                d_del = db.query(JobDocument).filter(
                    JobDocument.job_id.in_(job_ids)
                ).delete(synchronize_session=False)
                logger.info(f"Deleted {h_del} history entries and {d_del} documents")

            # Jobs
            j_del = db.query(JobEntry).filter(JobEntry.user_id == admin_id).delete(
                synchronize_session=False
            )
            logger.info(f"Deleted {j_del} jobs")

            # Platforms
            db.query(JobPlatform).filter(JobPlatform.user_id == admin_id).delete(
                synchronize_session=False
            )

            # Delete unused companies
            active_domains = db.query(JobEntry.company_domain).distinct()
            db.query(CompanyProfile).filter(
                CompanyProfile.domain.notin_(active_domains)
            ).delete(synchronize_session=False)

        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Wipe Error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Datenbankfehler beim Löschen")
    finally:
        db.close()


# Admin notification template endpoints

@router.post("/admin/notification-templates", response_model=NotificationTemplateResponse)
def admin_create_notification_template(
    body: NotificationTemplateCreate,
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        if body.type.upper() not in ("PUSHOVER", "RESEND", "MAILJET"):
            raise HTTPException(status_code=400, detail="type must be PUSHOVER, RESEND or MAILJET")
        t = NotificationTemplate(
            name=body.name,
            type=body.type.upper(),
            content=body.content,
            is_admin=True,
            user_id=None,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return _template_to_dict(t)
    finally:
        db.close()


@router.put("/admin/notification-templates/{template_id}", response_model=NotificationTemplateResponse)
def admin_update_notification_template(
    template_id: int,
    body: NotificationTemplateUpdate,
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        t = db.query(NotificationTemplate).filter(
            NotificationTemplate.id == template_id,
            NotificationTemplate.is_admin == True,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Admin template not found")
        if body.name is not None:
            t.name = body.name
        if body.content is not None:
            t.content = body.content
        db.commit()
        db.refresh(t)
        return _template_to_dict(t)
    finally:
        db.close()


@router.delete("/admin/notification-templates/{template_id}")
def admin_delete_notification_template(
    template_id: int,
    current_user: User = Depends(get_current_admin_user),
):
    db = SessionLocal()
    try:
        t = db.query(NotificationTemplate).filter(
            NotificationTemplate.id == template_id,
            NotificationTemplate.is_admin == True,
        ).first()
        if not t:
            raise HTTPException(status_code=404, detail="Admin template not found")
        db.delete(t)
        db.commit()
        return {"ok": True}
    finally:
        db.close()
