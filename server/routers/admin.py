import ipaddress
import os
import socket
from typing import Annotated, Dict, Literal, Optional
from urllib.parse import urlparse

import redis as redis_sync
import httpx
import openai
import requests
from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel, StringConstraints, field_validator

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
    PlatformRun,
    NotificationTemplateCreate,
    NotificationTemplateUpdate,
    NotificationTemplateResponse,
)
from core.auth import get_current_admin_user, verify_password
from routers.deps import PASSWORD_CHECK_RATE, _template_to_dict, limiter, refuse_while_crawling, user_or_ip_key
from core.connection_errors import REASON_FAILED, reason_for_error, reason_for_status
from core.logger import get_logger
from services.company_domain import CompanyDomain
from routers.notifications import http_error
from services.notifications_client import NotifyError
from services.user_data import (
    delete_notification_channels,
    delete_notification_channels_best_effort,
    delete_user_content,
)
from workers.crawl_control import reap_stalled_crawls
from workers.tasks.research import MAX_COMPANY_NAME_LENGTH

logger = get_logger(__name__)

router = APIRouter()

# Each test and each model list is a real call to a paid or rate-limited provider.
ADMIN_TEST_RATE = "10/minute"
MAX_MODEL_LENGTH = 200
MAX_API_KEY_LENGTH = 500
MAX_BASE_URL_LENGTH = 500
# The local server's model list is provider data shown to the admin: bounded in count.
MAX_AVAILABLE_MODELS = 200
HTTP_SCHEMES = ("http", "https")
REASON_NO_KEY = "no_key"
REASON_NO_MODEL = "no_model"
REASON_NO_URL = "no_url"
WRONG_PASSWORD = "wrong_password"
OPENROUTER_FAILED = "openrouter_failed"
STATUS_UNAVAILABLE = "status_unavailable"
AI_PROVIDERS = ("cloud", "local")
COMPANY_NOT_FOUND = "Company profile not found"
# The failures a connection test turns into a reason; anything else is a bug for the global handler.
PROVIDER_ERRORS = (openai.APIError, requests.RequestException, httpx.HTTPError)
DEFAULT_OPENROUTER_MODEL = "tngtech/deepseek-r1t2-chimera:free"
DEFAULT_OLLAMA_MODEL = "llama3.1:8b"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_REFERER = "https://github.com/ai-job-analyzer"
OPENROUTER_TIMEOUT_SECONDS = 10
OLLAMA_TEST_TIMEOUT_SECONDS = 5
ModelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_MODEL_LENGTH)]
AiProvider = Literal["cloud", "local"]
CompanyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_COMPANY_NAME_LENGTH)]


def _numeric_address(host: str):
    """The address a numeric host means, or None for a name (no DNS lookup: the field is admin-trusted).

    HTTP clients also resolve decimal, hex, octal and short IPv4 forms ("2852039166", "0xa9fea9fe")
    and a trailing dot, so these are normalised like inet_aton does before the check.
    """
    host = host[:-1] if host.endswith(".") else host
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    try:
        return ipaddress.IPv4Address(socket.inet_aton(host))
    except OSError:
        return None


def _is_link_local_literal(host: str) -> bool:
    """True for a 169.254.0.0/16 or fe80::/10 address in any numeric form (also IPv4-mapped): cloud metadata lives there."""
    address = _numeric_address(host)
    if address is None:
        return False
    mapped = getattr(address, "ipv4_mapped", None)
    return (mapped or address).is_link_local


class SystemSettingsUpdate(BaseModel):
    openrouter_model: Optional[ModelName] = None
    # "" removes the stored key (the web asks first).
    openrouter_api_key: Optional[Annotated[str, StringConstraints(max_length=MAX_API_KEY_LENGTH)]] = None
    ollama_model: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_MODEL_LENGTH)]] = None
    ollama_base_url: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_BASE_URL_LENGTH)]] = None
    ai_task_routing: Optional[Dict[str, AiProvider]] = None

    @field_validator("ollama_base_url")
    @classmethod
    def _http_url_or_empty(cls, value: Optional[str]) -> Optional[str]:
        # Not url_safety-guarded on purpose: an admin points this at a LAN or localhost model server (G1, R8b).
        if value:
            parsed = urlparse(value)
            if parsed.scheme not in HTTP_SCHEMES or not parsed.hostname:
                raise ValueError("must be an http(s) URL with a host")
            if parsed.username or parsed.password:
                raise ValueError("must not carry credentials")
            if _is_link_local_literal(parsed.hostname):
                raise ValueError("must not be a link-local address")
        return value

    @field_validator("ai_task_routing")
    @classmethod
    def _known_tasks(cls, value: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
        from intelligence.service import TASK_DEFAULTS
        if value and not set(value) <= set(TASK_DEFAULTS):
            raise ValueError("unknown task")
        return value


class AdminWipeRequest(BaseModel):
    password: str
    wipe_all_users: bool = False


def _effective_routing(stored) -> Dict[str, str]:
    """Every known task once: the stored provider when it is valid, else the default."""
    from intelligence.service import TASK_DEFAULTS
    routing = stored if isinstance(stored, dict) else {}
    return {
        task: routing[task] if routing.get(task) in AI_PROVIDERS else default
        for task, default in TASK_DEFAULTS.items()
    }


def _settings_answer(settings: Optional[SystemSettings]) -> dict:
    """One shape for GET and POST: the effective routing merged over the defaults; no key, no env address."""
    stored = settings.ai_task_routing if settings else None
    return {
        "openrouter_model": (settings.openrouter_model if settings else None) or DEFAULT_OPENROUTER_MODEL,
        "openrouter_api_key_set": bool(settings and settings.openrouter_api_key),
        "ollama_model": (settings.ollama_model if settings else None) or DEFAULT_OLLAMA_MODEL,
        "ollama_base_url": (settings.ollama_base_url if settings else None) or "",
        "ollama_base_url_from_env": bool(os.getenv("OLLAMA_BASE_URL", "").strip()),
        "ai_task_routing": _effective_routing(stored),
    }


def _apply_settings_update(db_settings: SystemSettings, settings: SystemSettingsUpdate) -> None:
    """Write the sent fields; an empty key, model or address falls back to none or the default."""
    if settings.openrouter_model is not None:
        db_settings.openrouter_model = settings.openrouter_model
    if settings.openrouter_api_key is not None:
        db_settings.openrouter_api_key = settings.openrouter_api_key or None
    if settings.ollama_model is not None:
        db_settings.ollama_model = settings.ollama_model or DEFAULT_OLLAMA_MODEL
    if settings.ollama_base_url is not None:
        db_settings.ollama_base_url = settings.ollama_base_url or None
    if settings.ai_task_routing is not None:
        db_settings.ai_task_routing = settings.ai_task_routing


@router.get("/admin/settings")
def get_admin_settings(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        return _settings_answer(db.query(SystemSettings).first())
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
            db_settings = SystemSettings(openrouter_model=DEFAULT_OPENROUTER_MODEL)
            db.add(db_settings)
        _apply_settings_update(db_settings, settings)
        db.commit()
        return {"status": "updated", **_settings_answer(db_settings)}
    finally:
        db.close()


@router.delete("/admin/clear-ai-error")
def clear_ai_error_endpoint(current_user: User = Depends(get_current_admin_user)):
    from intelligence.service import clear_ai_404_error
    clear_ai_404_error()
    return {"status": "cleared"}


@router.post("/admin/redis/cleanup")
def cleanup_stale_redis_jobs_endpoint(current_user: User = Depends(get_current_admin_user)):
    """Immediately remove crawl jobs from Redis that made no progress for STALE_NO_PROGRESS_SECONDS."""
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    r = redis_sync.from_url(redis_url, decode_responses=True)
    return {"removed": reap_stalled_crawls(r)}


def _openrouter_credentials() -> tuple[Optional[str], Optional[str]]:
    """The stored OpenRouter key and model, either None when unset."""
    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        return (settings.openrouter_api_key, settings.openrouter_model) if settings else (None, None)
    finally:
        db.close()


def _openrouter_client(api_key: str):
    # Imported per call so tests can patch openai.OpenAI.
    from openai import OpenAI
    return OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key, default_headers={"HTTP-Referer": OPENROUTER_REFERER})


def _model_list(body) -> list:
    """OpenRouter models as id, name, context length and pricing, sorted by name; [] for any other shape."""
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, list):
        return []
    entries = [m for m in data if isinstance(m, dict) and isinstance(m.get("id"), str) and m["id"]]
    models = [
        {
            "id": m["id"],
            "name": m["name"] if isinstance(m.get("name"), str) else m["id"],
            "context_length": m.get("context_length"),
            "pricing": m.get("pricing", {}),
        }
        for m in entries
    ]
    models.sort(key=lambda m: m["name"].lower())
    return models


@router.get("/admin/openrouter/models")
@limiter.limit(ADMIN_TEST_RATE, key_func=user_or_ip_key)
def get_openrouter_models(request: Request, current_user: User = Depends(get_current_admin_user)):
    """The model list; an upstream status is never forwarded (a 401 would read as an expired session)."""
    api_key, _model = _openrouter_credentials()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=REASON_NO_KEY)
    try:
        response = requests.get(
            f"{OPENROUTER_BASE_URL}/models",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"output_modalities": "text"},
            timeout=OPENROUTER_TIMEOUT_SECONDS,
        )
        if response.ok:
            return _model_list(response.json())
        logger.warning("OpenRouter model list answered status %s", response.status_code)
    except requests.RequestException as error:
        logger.warning("OpenRouter model list failed: %s", type(error).__name__)
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=OPENROUTER_FAILED)


@router.post("/admin/test/openrouter")
@limiter.limit(ADMIN_TEST_RATE, key_func=user_or_ip_key)
def test_openrouter_connection(request: Request, current_user: User = Depends(get_current_admin_user)):
    """Always 200: {ok: true, model} or {ok: false, reason} with a fixed reason code."""
    api_key, model = _openrouter_credentials()
    if not api_key:
        return {"ok": False, "reason": REASON_NO_KEY}
    if not model:
        return {"ok": False, "reason": REASON_NO_MODEL}
    try:
        _openrouter_client(api_key).chat.completions.create(
            model=model, messages=[{"role": "user", "content": "Hi"}], max_tokens=1,
        )
        return {"ok": True, "model": model}
    except PROVIDER_ERRORS as error:
        logger.warning("OpenRouter connection test failed: %s", type(error).__name__)
        return {"ok": False, "reason": reason_for_error(error)}


def _ollama_target() -> tuple[str, str]:
    """The local server's address ("" when none is stored or set by env) and its model."""
    from intelligence.service import configured_ollama_base_url, get_ollama_model
    db = SessionLocal()
    try:
        return configured_ollama_base_url(db), get_ollama_model(db)
    finally:
        db.close()


def _ollama_result(body, model: str) -> dict:
    """The success answer; model_found looks at the full list, the shown list is bounded."""
    # Handle both {"data": [...]} and top-level list formats
    items = body.get("data") if isinstance(body, dict) else body
    if not isinstance(items, list):
        return {"ok": False, "reason": REASON_FAILED}
    available = [m.get("id") or m.get("key", "") for m in items if isinstance(m, dict)]
    available = [a for a in available if isinstance(a, str) and a]
    # Prefix-match: "google/gemma-4-e4b" matches "google/gemma-4-e4b@q4_k_m"
    model_found = any(a == model or a.startswith(model + "@") for a in available)
    shown = [a for a in available if len(a) <= MAX_MODEL_LENGTH][:MAX_AVAILABLE_MODELS]
    return {"ok": True, "model": model, "model_found": model_found, "available_models": shown}


@router.post("/admin/test/ollama")
@limiter.limit(ADMIN_TEST_RATE, key_func=user_or_ip_key)
def test_ollama_connection(request: Request, current_user: User = Depends(get_current_admin_user)):
    """Always 200: the model list of the local server or {ok: false, reason} with a fixed reason code."""
    base_url, model = _ollama_target()
    if not base_url:
        return {"ok": False, "reason": REASON_NO_URL}
    try:
        response = requests.get(f"{base_url.rstrip('/')}/models", timeout=OLLAMA_TEST_TIMEOUT_SECONDS)
        if not response.ok:
            logger.warning("Ollama connection test answered status %s", response.status_code)
            return {"ok": False, "reason": reason_for_status(response.status_code)}
        return _ollama_result(response.json(), model)
    except requests.RequestException as error:
        logger.warning("Ollama connection test failed: %s", type(error).__name__)
        return {"ok": False, "reason": reason_for_error(error)}


@router.get("/admin/system-status")
def system_status(current_user: User = Depends(get_current_admin_user)):
    """The stored AI error as a fixed code; the German text never leaves the server."""
    from intelligence.service import read_ai_error_code
    try:
        return {"ai_error": read_ai_error_code()}
    except redis_sync.RedisError as error:
        logger.error("Reading the AI error status failed", exc_info=error)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=STATUS_UNAVAILABLE)


def _wipe_all(db) -> list:
    """Every account's content (jobs, sources, runs, profile data) and every company profile; the accounts stay.

    The per-account order is the factory reset's; the bulk deletes after it catch rows no account owns.
    Returns the user ids, whose notification channels the caller deletes once the commit succeeded.
    """
    user_ids = [user_id for (user_id,) in db.query(User.id).all()]
    for user_id in user_ids:
        delete_user_content(db, user_id)
    db.query(JobStatusHistory).delete(synchronize_session=False)
    db.query(JobDocument).delete(synchronize_session=False)
    db.query(JobEntry).delete(synchronize_session=False)
    # The FK cascades on PostgreSQL, but SQLite only with PRAGMA foreign_keys, so the runs go explicitly.
    db.query(PlatformRun).delete(synchronize_session=False)
    db.query(JobPlatform).delete(synchronize_session=False)
    db.query(CompanyProfile).delete(synchronize_session=False)
    return user_ids


def _wipe_own(db, admin_id: int) -> None:
    """Everything the admin owns except the account (the factory reset), then every company profile no remaining job refers to."""
    logger.info(f"Wiping data for user {admin_id}")
    # One account, like the factory reset: the channels first, so a down service deletes nothing (502).
    delete_notification_channels(admin_id)
    delete_user_content(db, admin_id)
    # NOT IN over a list holding a NULL is NULL for every row, so jobs without a domain must stay out of it.
    referenced = db.query(JobEntry.company_domain).filter(JobEntry.company_domain.isnot(None)).distinct()
    db.query(CompanyProfile).filter(CompanyProfile.domain.notin_(referenced)).delete(synchronize_session=False)


def _refuse_wipe_while_crawling(db, admin_id: int, wipe_all_users: bool) -> None:
    """The own scope removes the admin's sources, the all scope every owner's: each owner's crawl must be idle."""
    if not wipe_all_users:
        refuse_while_crawling(db, admin_id)
        return
    owner_ids = db.query(JobPlatform.user_id).filter(JobPlatform.user_id.isnot(None)).distinct()
    for (owner_id,) in owner_ids.all():
        refuse_while_crawling(db, owner_id)


@router.post("/admin/database/wipe")
@limiter.limit(PASSWORD_CHECK_RATE, key_func=user_or_ip_key)
def wipe_database(
    request: Request, body: AdminWipeRequest, current_user: User = Depends(get_current_admin_user)
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not verify_password(body.password, user.hashed_password):
            # 400, never 401: the web treats a 401 as an expired session.
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=WRONG_PASSWORD)
        _refuse_wipe_while_crawling(db, current_user.id, body.wipe_all_users)
        wiped_user_ids = _wipe_all(db) if body.wipe_all_users else []
        if not body.wipe_all_users:
            _wipe_own(db, current_user.id)
        db.commit()
        # Only after the commit: a failed wipe must not leave the accounts without their channels.
        delete_notification_channels_best_effort(wiped_user_ids)
        return {"status": "success"}
    except HTTPException:
        raise
    except NotifyError as error:
        db.rollback()
        raise http_error(error) from error
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


class CompanyRename(BaseModel):
    name: CompanyName


def _profile_or_404(db, domain: str) -> CompanyProfile:
    profile = db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=COMPANY_NOT_FOUND)
    return profile


@router.patch("/admin/companies/{domain}")
def rename_company(domain: CompanyDomain, body: CompanyRename, current_user: User = Depends(get_current_admin_user)):
    """Renames the shared profile for every user; the domain stays the key, so jobs keep pointing at it.

    The stored name wins over later research (_shared_company_name), so a rename sticks.
    """
    db = SessionLocal()
    try:
        profile = _profile_or_404(db, domain)
        profile.name = body.name
        db.commit()
        logger.info("admin %s renamed company profile %s", current_user.id, domain)
        return {"domain": profile.domain, "name": profile.name}
    finally:
        db.close()


@router.delete("/admin/companies/{domain}")
def delete_company_profile(domain: CompanyDomain, current_user: User = Depends(get_current_admin_user)):
    """Deletes only the shared profile; jobs keep their company_domain and the company can be researched again."""
    db = SessionLocal()
    try:
        db.delete(_profile_or_404(db, domain))
        db.commit()
        logger.info("admin %s deleted company profile %s", current_user.id, domain)
        return {"status": "deleted"}
    finally:
        db.close()
