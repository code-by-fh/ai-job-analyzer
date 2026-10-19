import os
from functools import lru_cache
from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional
from urllib.parse import urlparse
from uuid import UUID

import redis
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, TypeAdapter, ValidationError, field_validator
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from core.auth import create_access_token, get_current_user, get_db, token_claims
from database.core import (
    iso_utc,
    MAX_SOURCE_CHANNELS,
    JobDocument,
    JobEntry,
    JobPlatform,
    JobStatusHistory,
    NotificationTemplateCopy,
    PlatformCreate,
    PlatformResponse,
    PlatformRun,
    PlatformRunResponse,
    PlatformSetupResponse,
    PlatformUpdate,
    RecipientList,
    User,
)
from core.crawl_registry import (
    ALREADY_RUNNING,
    SCRAPER_START_TIMEOUT_SECONDS,
    active_crawl_for_platform,
    crawl_lock_held,
    has_live_crawl,
    is_started,
)
from core.job_status import STATUS_SEEN
from core.logger import get_logger
from core.profile_rules import PROFILE_REQUIRED, user_profile_complete
from core.platform_rules import (
    SCHEDULE_INCOMPLETE,
    check_name,
    check_schedule_days,
    check_schedule_times,
    check_url_pattern,
    incomplete_schedule_field,
)
from core.url_safety import (
    DNS_TIMEOUT_SECONDS,
    NOT_PUBLIC,
    canonical_http_url,
    ensure_public_http_url,
    host_for_log,
    is_public_http_url,
)
from intelligence.service import generate_platform_name, get_client_and_model
from routers.deps import APPLICATION_STATUSES, CRAWL_RUNNING
from services import page_rendering
from routers.notifications import http_error
from services import notifications_client
from services.notifications_client import NotifyError, owner_for

logger = get_logger(__name__)

router = APIRouter()


# Same shape as a pydantic refusal on "url", so the client maps both onto the URL field alike.
_URL_NOT_PUBLIC_DETAIL = [{"type": "value_error", "loc": ["body", "url"], "msg": NOT_PUBLIC}]


def _require_public_url(url: str) -> None:
    """422 unless every address of the URL's host is public.

    Validators skip DNS (they run on the event loop); sync endpoints run in the threadpool, so the
    blocking lookup belongs here. The detail never echoes the URL.
    """
    if not is_public_http_url(url):
        raise HTTPException(status_code=422, detail=_URL_NOT_PUBLIC_DETAIL)


def _selected_types(platform: JobPlatform) -> List[str]:
    """The old switch names of the selected channels, for the old drawer (one per type, in order)."""
    return list(dict.fromkeys(entry["type"].upper() for entry in platform.notification_channels or []))


def _serialize_platform(platform: JobPlatform, job_count: int = 0, seen_count: int = 0) -> dict:
    """Helper to convert a JobPlatform model and related counters to a PlatformResponse dictionary."""
    return {
        "id": platform.id,
        "url": platform.url,
        "name": platform.name,
        "favicon_url": platform.favicon_url,
        "crawl_interval_minutes": platform.crawl_interval_minutes,
        "schedule_times": platform.schedule_times,
        "schedule_days": platform.schedule_days,
        "last_crawl_at": iso_utc(platform.last_crawl_at),
        "is_active": platform.is_active,
        "is_notification_enabled": platform.is_notification_enabled,
        "notification_adapters": _selected_types(platform),
        "notification_channel_ids": [entry["id"] for entry in platform.notification_channels or []],
        "pushover_template": platform.pushover_template,
        "resend_template": platform.resend_template,
        "resend_recipients": platform.resend_recipients,
        "mailjet_template": platform.mailjet_template,
        "mailjet_recipients": platform.mailjet_recipients,
        "smtp_template": platform.smtp_template,
        "smtp_recipients": platform.smtp_recipients,
        "job_count": job_count,
        "seen_count": seen_count,
        "setup_status": platform.setup_status or "active",
        "url_pattern": platform.url_pattern,
        "last_run": platform.last_run,
    }


# The scraper's preview runs up to two DNS checks and one render call, then parses the page; waiting less
# answers "Failed to fetch links" while the scraper still finishes.
PREVIEW_PARSE_MARGIN_SECONDS = 5
PREVIEW_TIMEOUT_SECONDS = page_rendering.HTTP_TIMEOUT_SECONDS + 2 * DNS_TIMEOUT_SECONDS + PREVIEW_PARSE_MARGIN_SECONDS


def _trigger_scraper_search(platform: JobPlatform, current_user: User, is_initial_run: bool) -> dict:
    """Helper to trigger search on the scraper service with internal auth token."""
    SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    logger.info(f"Triggering scraper at: {SCRAPER_URL}/search for platform {platform.id}")
    _internal_token = create_access_token(token_claims(current_user))
    
    resp = requests.post(
        f"{SCRAPER_URL}/search",
        json={
            "query": platform.url,
            "location": "Remote",
            "platform_id": platform.id,
            "is_initial_run": is_initial_run,
        },
        headers={"Cookie": f"access_token={_internal_token}"},
        timeout=SCRAPER_START_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()


def _crawl_refusal(result: dict) -> Optional[HTTPException]:
    """The scraper refuses with 200 + {status: "Error"}; the API turns that into a real status."""
    if is_started(result):
        return None
    if result.get("code") == ALREADY_RUNNING:
        return HTTPException(status_code=409, detail="Crawl already running")
    return HTTPException(status_code=502, detail="Crawler refused the crawl")


DEFAULT_RUNS_PAGE = 10
MAX_RUNS_PAGE = 50


def _require_profile(db: Session, user_id: int) -> None:
    """Sources need a maintained profile: without one nothing they find could be matched."""
    if not user_profile_complete(db, user_id):
        raise HTTPException(status_code=409, detail=PROFILE_REQUIRED)


def _owned_platform(db: Session, platform_id: int, user_id: int) -> JobPlatform:
    platform = db.query(JobPlatform).filter(JobPlatform.id == platform_id, JobPlatform.user_id == user_id).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


def _serialize_run(run: PlatformRun) -> dict:
    return {
        "started_at": iso_utc(run.started_at),
        "finished_at": iso_utc(run.finished_at),
        "found": run.found,
        "new": run.new,
        "matched": run.matched,
        "seeded": run.seeded,
        "error": run.error,
    }


@router.get("/platforms/{platform_id}/runs", response_model=List[PlatformRunResponse])
def list_platform_runs(
    platform_id: int,
    limit: int = Query(DEFAULT_RUNS_PAGE, ge=1, le=MAX_RUNS_PAGE),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_platform(db, platform_id, current_user.id)
    runs = (
        db.query(PlatformRun)
        .filter(PlatformRun.platform_id == platform_id)
        .order_by(PlatformRun.finished_at.desc(), PlatformRun.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_run(run) for run in runs]


@router.get("/platforms", response_model=List[PlatformResponse])
def get_platforms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Subquery to count jobs per platform (excludes SEEN placeholders)
    job_counts = (
        db.query(JobEntry.platform_id, func.count(JobEntry.id).label("job_count"))
        .filter(JobEntry.user_id == current_user.id, JobEntry.status != "SEEN")
        .group_by(JobEntry.platform_id)
        .subquery()
    )

    # Subquery to count SEEN placeholder jobs per platform
    seen_counts = (
        db.query(JobEntry.platform_id, func.count(JobEntry.id).label("seen_count"))
        .filter(JobEntry.user_id == current_user.id, JobEntry.status == "SEEN")
        .group_by(JobEntry.platform_id)
        .subquery()
    )

    platforms_query = (
        db.query(
            JobPlatform,
            func.coalesce(job_counts.c.job_count, 0).label("job_count"),
            func.coalesce(seen_counts.c.seen_count, 0).label("seen_count"),
        )
        .outerjoin(job_counts, JobPlatform.id == job_counts.c.platform_id)
        .outerjoin(seen_counts, JobPlatform.id == seen_counts.c.platform_id)
        .filter(JobPlatform.user_id == current_user.id)
        .all()
    )

    return [
        _serialize_platform(p, job_count, seen_count)
        for p, job_count, seen_count in platforms_query
    ]


@router.post("/platforms", response_model=PlatformResponse)
def create_platform(
    platform: PlatformCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_public_url(platform.url)
    # Check for duplicates
    existing = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.user_id == current_user.id,
            JobPlatform.url == platform.url
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Platform URL already exists")

    domain = urlparse(platform.url).netloc
    client, model = get_client_and_model("platform_name", db)
    name = generate_platform_name(url=platform.url, db=db, model=model, client=client)

    # Favicon URL (using Google's service)
    favicon_url = f"https://www.google.com/s2/favicons?sz=64&domain={domain}"

    db_platform = JobPlatform(
        user_id=current_user.id,
        url=platform.url,
        name=name,
        favicon_url=favicon_url,
        crawl_interval_minutes=platform.crawl_interval_minutes,
        setup_status='pending_setup',
    )
    db.add(db_platform)
    db.commit()
    db.refresh(db_platform)

    return _serialize_platform(db_platform, job_count=0, seen_count=0)


# Only a leading label: "jobs.www.com" is another site than "jobs.com".
_WWW_LABEL = "www."


def _site_of(url: str) -> str:
    """The host the same-site rule compares; a legacy stored URL (e.g. mixed case) is canonicalised first."""
    return urlparse(canonical_http_url(url) or url).netloc.removeprefix(_WWW_LABEL)


def _change_url(db: Session, platform: JobPlatform, new_url: str) -> None:
    """Move the source to another page of the same site. The name stays: only a sent name renames it."""
    _require_public_url(new_url)
    new_domain = _site_of(new_url)
    old_domain = _site_of(platform.url)
    if new_domain != old_domain:
        raise HTTPException(
            status_code=400,
            detail=f"Domain change not allowed. Must remain on {old_domain}"
        )
    duplicate = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.user_id == platform.user_id,
            JobPlatform.url == new_url,
            JobPlatform.id != platform.id
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Platform URL already exists")
    platform.url = new_url


def _check_schedule_pair(times: Optional[List[str]], days: Optional[List[int]]) -> None:
    """422 on the missing half of a schedule; PATCH and setup share it so both name the same field."""
    missing = incomplete_schedule_field(times, days)
    if missing:
        detail = [{"loc": ["body", missing], "msg": SCHEDULE_INCOMPLETE, "type": "value_error"}]
        raise HTTPException(status_code=422, detail=detail)


_COPY_ADAPTERS = {
    **dict.fromkeys(
        ("pushover_template", "resend_template", "mailjet_template", "smtp_template"),
        TypeAdapter(Optional[NotificationTemplateCopy]),
    ),
    **dict.fromkeys(
        ("resend_recipients", "mailjet_recipients", "smtp_recipients"), TypeAdapter(Optional[RecipientList]),
    ),
}


def _checked_copy(platform: JobPlatform, field: str, sent):
    """The sent template copy or recipient list, bounded unless it equals the stored value.

    The drawer sends a switched-off channel's stored values back verbatim, so a legacy value saved before
    the bounds existed must not refuse every later save. Errors keep the request-validation 422 shape.
    """
    if sent == getattr(platform, field):
        return sent
    try:
        return _COPY_ADAPTERS[field].validate_python(sent)
    except ValidationError as error:
        raise RequestValidationError([{**item, "loc": ("body", field, *item["loc"])} for item in error.errors()])


def _apply_copies(platform: JobPlatform, platform_update: PlatformUpdate) -> None:
    for field in _COPY_ADAPTERS.keys() & platform_update.model_fields_set:
        setattr(platform, field, _checked_copy(platform, field, getattr(platform_update, field)) or None)


UNKNOWN_CHANNEL = "unknown channel"


def _selection_from_ids(channel_ids, channels) -> List[dict]:
    """Entries for the given ids in their order (repeats dropped); 422 on an id that is not the user's."""
    by_id = {channel["id"]: channel for channel in channels}
    errors = [
        {"type": "value_error", "loc": ["body", "notification_channel_ids", index], "msg": UNKNOWN_CHANNEL}
        for index, channel_id in enumerate(channel_ids) if str(channel_id) not in by_id
    ]
    if errors:
        raise RequestValidationError(errors)
    return [{"id": channel_id, "type": by_id[channel_id]["type"]} for channel_id in dict.fromkeys(map(str, channel_ids))]


def _channel_selection(channel_ids, user_id: int) -> List[dict]:
    """The entries for the given ids, checked against the user's channels in the service."""
    try:
        channels = notifications_client.get_client().list_channels(owner_for(user_id))
    except NotifyError as error:
        raise http_error(error) from error
    return _selection_from_ids(channel_ids, channels)


def _store_selection(platform: JobPlatform, selection: List[dict]) -> None:
    platform.notification_channels = selection
    platform.is_notification_enabled = bool(selection)


def _apply_channel_selection(platform: JobPlatform, platform_update: PlatformUpdate, user_id: int) -> None:
    """``notification_channel_ids`` selects channels, checked against the user's channels in the service."""
    if "notification_channel_ids" not in platform_update.model_fields_set:
        return
    _store_selection(platform, _channel_selection(platform_update.notification_channel_ids or [], user_id))


@router.patch("/platforms/{platform_id}", response_model=PlatformResponse)
def update_platform(
    platform_id: int,
    platform_update: PlatformUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_platform = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        )
        .first()
    )
    if not db_platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    if platform_update.url is not None:
        _change_url(db, db_platform, platform_update.url)

    if platform_update.name is not None:
        db_platform.name = platform_update.name

    if platform_update.crawl_interval_minutes is not None:
        db_platform.crawl_interval_minutes = platform_update.crawl_interval_minutes
        
    if "schedule_times" in platform_update.model_fields_set:
        db_platform.schedule_times = platform_update.schedule_times or None
    if "schedule_days" in platform_update.model_fields_set:
        db_platform.schedule_days = platform_update.schedule_days or None
    if platform_update.is_active is not None:
        db_platform.is_active = platform_update.is_active
        
    if platform_update.is_notification_enabled is not None:
        db_platform.is_notification_enabled = platform_update.is_notification_enabled
        
    _apply_channel_selection(db_platform, platform_update, current_user.id)

    _apply_copies(db_platform, platform_update)
    if platform_update.url_pattern is not None:
        db_platform.url_pattern = platform_update.url_pattern
    # Only a schedule edit is checked, so a legacy half-schedule row can still be renamed.
    # Raised before the commit, so the half-applied change is discarded with the session.
    if {"schedule_times", "schedule_days"} & platform_update.model_fields_set:
        _check_schedule_pair(db_platform.schedule_times, db_platform.schedule_days)

    db.commit()
    db.refresh(db_platform)

    # Get job count (excludes SEEN placeholders)
    job_count = (
        db.query(JobEntry).filter(
            JobEntry.platform_id == db_platform.id,
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == False,
            JobEntry.status != "SEEN",
        ).count()
    )

    return _serialize_platform(db_platform, job_count=job_count, seen_count=0)


@router.post("/platforms/{platform_id}/generate-name")
def trigger_platform_name_generation(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_platform = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        )
        .first()
    )
    if not db_platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    client, model = get_client_and_model("platform_name", db)
    new_name = generate_platform_name(url=db_platform.url, db=db, model=model, client=client)
    db_platform.name = new_name
    db.commit()
    return {"id": platform_id, "name": new_name}


_REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
# A delete must answer quickly; an unreachable Redis is treated as "no crawl" (see _crawl_running).
_REDIS_TIMEOUT_SECONDS = 2


@lru_cache(maxsize=1)
def _crawl_redis() -> redis.Redis:
    # One client (and connection pool) for the process; redis-py reconnects on its own after an outage.
    return redis.from_url(
        _REDIS_URL, socket_connect_timeout=_REDIS_TIMEOUT_SECONDS, socket_timeout=_REDIS_TIMEOUT_SECONDS,
    )


def _crawl_running(user_id: int, platform_id: int) -> bool:
    """A held crawl lock or a registered crawl of the platform; the lock also covers a start in progress."""
    client = _crawl_redis()
    try:
        return crawl_lock_held(client, user_id, platform_id) or (
            active_crawl_for_platform(client, user_id, platform_id) is not None
        )
    except redis.RedisError as error:
        # Fail open: without Redis no new crawl can start (the scraper's claim and lock live there), and a
        # late insert naming the deleted platform is rejected by the job_entries foreign key on PostgreSQL.
        logger.warning(f"Crawl registry unavailable while deleting platform {platform_id}: {error}")
        return False


def any_crawl_running(user_id: int, platform_ids: List[int]) -> bool:
    """A live registered crawl of the user (any or no platform) or a held lock on one of these platforms.

    Fails open like _crawl_running, once for the whole check, so a dead Redis costs one timeout.
    """
    client = _crawl_redis()
    try:
        return has_live_crawl(client, user_id) or any(
            crawl_lock_held(client, user_id, platform_id) for platform_id in platform_ids
        )
    except redis.RedisError as error:
        logger.warning(f"Crawl registry unavailable while checking the crawls of user {user_id}: {error}")
        return False


def _detach_jobs(db: Session, platform_id: int, user_id: int) -> int:
    """Jobs outlive their source; dedup placeholders and run history do not. Returns the caller's kept jobs.

    The detach is filtered by platform only, not owner: /scraper/search accepts any platform_id, so a
    foreign job may point here, and the foreign key forbids leaving it behind. It is not counted.
    """
    db.query(JobEntry).filter(
        JobEntry.platform_id == platform_id, JobEntry.status == STATUS_SEEN,
    ).delete(synchronize_session=False)
    kept = db.query(JobEntry).filter(JobEntry.platform_id == platform_id, JobEntry.user_id == user_id).count()
    db.query(JobEntry).filter(JobEntry.platform_id == platform_id).update(
        {JobEntry.platform_id: None}, synchronize_session=False,
    )
    db.query(PlatformRun).filter(PlatformRun.platform_id == platform_id).delete(synchronize_session=False)
    return kept


@router.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    platform = _owned_platform(db, platform_id, current_user.id)
    # A running crawl would still save jobs that point at the deleted source.
    if _crawl_running(current_user.id, platform_id):
        raise HTTPException(status_code=409, detail=CRAWL_RUNNING)
    kept = _detach_jobs(db, platform_id, current_user.id)
    db.delete(platform)
    db.commit()
    return {"status": "deleted", "kept_jobs": kept}


@router.delete("/platforms/{platform_id}/jobs")
def delete_platform_jobs(
    platform_id: int,
    keep_favorites: bool = True,
    keep_applications: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify platform belongs to user
    db_platform = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        )
        .first()
    )
    if not db_platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    query = db.query(JobEntry).filter(JobEntry.platform_id == platform_id)
    
    if keep_favorites:
        query = query.filter(JobEntry.is_favorite == False)
    if keep_applications:
        query = query.filter(~JobEntry.status.in_(APPLICATION_STATUSES))

    # Get job IDs to delete associated history and documents
    job_ids = [r[0] for r in query.with_entities(JobEntry.id).all()]
    if job_ids:
        db.query(JobStatusHistory).filter(
            JobStatusHistory.job_id.in_(job_ids)
        ).delete(synchronize_session=False)
        db.query(JobDocument).filter(
            JobDocument.job_id.in_(job_ids)
        ).delete(synchronize_session=False)

    deleted_count = query.delete(synchronize_session=False)
    db.commit()
    return {"status": "deleted", "deleted_count": deleted_count}


@router.post("/platforms/{platform_id}/crawl")
def trigger_platform_crawl(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_platform = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.id == platform_id,
            JobPlatform.user_id == current_user.id
        )
        .first()
    )
    if not db_platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    if not db_platform.is_active:
        raise HTTPException(status_code=400, detail="Platform is deactivated")

    if db_platform.setup_status == 'pending_setup':
        raise HTTPException(status_code=400, detail="Platform setup not completed")

    _require_profile(db, current_user.id)
    is_initial_run = db_platform.last_crawl_at is None

    try:
        resp_data = _trigger_scraper_search(db_platform, current_user, is_initial_run)
    except Exception as e:
        logger.error(f"Failed to trigger scraper: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to trigger crawler service"
        )
    refusal = _crawl_refusal(resp_data)
    if refusal:
        raise refusal
    # Only an accepted start counts: a stamp after a refusal would turn the next run into a non-seed run.
    db_platform.last_crawl_at = func.now()
    db.commit()
    return resp_data


@router.get("/platforms/{platform_id}/preview-links")
def get_preview_links(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    platform = db.query(JobPlatform).filter(
        JobPlatform.id == platform_id,
        JobPlatform.user_id == current_user.id,
    ).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")

    SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    _internal_token = create_access_token(token_claims(current_user))
    try:
        resp = requests.post(
            f"{SCRAPER_URL}/preview-links",
            json={"url": platform.url},
            headers={"Cookie": f"access_token={_internal_token}"},
            timeout=PREVIEW_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch preview links for platform {platform_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch links from platform")


class PlatformSetupRequest(BaseModel):
    selected_urls: List[str]
    run_initial_crawl: bool = True


@router.post("/platforms/{platform_id}/setup")
def complete_platform_setup(
    platform_id: int,
    setup: PlatformSetupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    platform = db.query(JobPlatform).filter(
        JobPlatform.id == platform_id,
        JobPlatform.user_id == current_user.id,
    ).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    _require_profile(db, current_user.id)

    url_pattern = _infer_url_pattern(setup.selected_urls)
    platform.url_pattern = url_pattern
    platform.setup_status = 'active'
    db.commit()

    # Same rule as the new setup: only a crawl the scraper started stamps last_crawl_at, or the next run skips the seed.
    if setup.run_initial_crawl and _start_first_crawl(platform, current_user, seed_only=True):
        db.commit()

    return {"status": "ok", "url_pattern": url_pattern}


class PreviewUrlRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: str) -> str:
        return ensure_public_http_url(value)


def _validate_http_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL")
    return parsed.netloc


@router.post("/platforms/preview-links")
def preview_links_for_url(
    request: PreviewUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch candidate links for a URL during the setup wizard.

    No platform row is persisted — the platform is only created once setup is
    completed via POST /platforms/setup.
    """
    _validate_http_url(request.url)
    _require_public_url(request.url)

    SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    _internal_token = create_access_token(token_claims(current_user))
    try:
        resp = requests.post(
            f"{SCRAPER_URL}/preview-links",
            json={"url": request.url},
            headers={"Cookie": f"access_token={_internal_token}"},
            timeout=PREVIEW_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch preview links for host {host_for_log(request.url)}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch links from platform")


# Bounds of the pattern preview: a results page lists far fewer links, and browsers cap URLs near 2 KB.
MAX_SELECTED_LINKS = 1000
MAX_LINK_LENGTH = 2048


class UrlPatternRequest(BaseModel):
    selected_urls: List[Annotated[str, Field(max_length=MAX_LINK_LENGTH)]] = Field(
        min_length=1, max_length=MAX_SELECTED_LINKS,
    )


@router.post("/platforms/url-pattern")
def derive_url_pattern(
    request: UrlPatternRequest,
    current_user: User = Depends(get_current_user),
):
    """The pattern the setup would infer from these example links, so the wizard can show it first.

    Nothing is fetched or stored; the links are only parsed.
    """
    return {"url_pattern": _infer_url_pattern(request.selected_urls)}


class PlatformSetupCreateRequest(BaseModel):
    url: str
    selected_urls: List[str] = Field(min_length=1)
    # "analyze" crawls now and scores every job found; "seed" only records today's
    # postings as known, so later runs report just the new ones; "none" starts nothing.
    initial_run: Literal["analyze", "seed", "none"] = "seed"
    crawl_interval_minutes: int = 60
    name: Optional[str] = None
    schedule_times: Optional[List[str]] = None
    schedule_days: Optional[List[int]] = None
    url_pattern: Optional[str] = None
    notification_channel_ids: Optional[List[UUID]] = Field(None, max_length=MAX_SOURCE_CHANNELS)

    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: str) -> str:
        return ensure_public_http_url(value)

    @field_validator("name")
    @classmethod
    def _name_text(cls, value: Optional[str]) -> Optional[str]:
        return check_name(value)

    @field_validator("schedule_times")
    @classmethod
    def _times_format(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return check_schedule_times(value)

    @field_validator("schedule_days")
    @classmethod
    def _days_range(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        # The time/days pair is checked in the endpoint (_check_schedule_pair), like PATCH, so a refused
        # time list is reported once and "days without times" lands on schedule_times in both.
        return check_schedule_days(value)

    @field_validator("url_pattern")
    @classmethod
    def _pattern_text(cls, value: Optional[str]) -> Optional[str]:
        return check_url_pattern(value)


def _start_first_crawl(platform: JobPlatform, current_user: User, seed_only: bool) -> bool:
    """Trigger the first crawl; True only if the scraper accepted it."""
    try:
        result = _trigger_scraper_search(platform, current_user, is_initial_run=seed_only)
    except Exception as e:
        logger.warning(f"Failed to trigger initial crawl after setup for platform {platform.id}: {e}")
        return False
    if _crawl_refusal(result):
        logger.warning(f"Scraper rejected initial crawl for platform {platform.id}: {result}")
        return False
    platform.last_crawl_at = datetime.now(timezone.utc)
    return True


def _ai_name(db: Session, url: str) -> str:
    client, model = get_client_and_model("platform_name", db)
    return generate_platform_name(url=url, db=db, model=model, client=client)


def _apply_setup_choices(platform: JobPlatform, request: PlatformSetupCreateRequest) -> None:
    if request.name:
        platform.name = request.name
    platform.schedule_times = request.schedule_times
    platform.schedule_days = request.schedule_days
    platform.url_pattern = request.url_pattern or _infer_url_pattern(request.selected_urls)


@router.post("/platforms/setup", response_model=PlatformSetupResponse)
def create_platform_with_setup(
    request: PlatformSetupCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a platform only once the setup wizard is completed.

    Abandoning the wizard therefore never leaves a half-configured platform
    behind. A legacy row still in 'pending_setup' for the same URL is reused so
    it can be finished cleanly; an already-active duplicate is rejected.
    """
    _require_profile(db, current_user.id)
    _check_schedule_pair(request.schedule_times, request.schedule_days)
    domain = _validate_http_url(request.url)
    _require_public_url(request.url)
    # Checked before anything is stored, so a refused channel (422) or a service outage (502) creates no source.
    chosen = request.notification_channel_ids
    selection = _channel_selection(chosen, current_user.id) if chosen else None

    existing = (
        db.query(JobPlatform)
        .filter(
            JobPlatform.user_id == current_user.id,
            JobPlatform.url == request.url,
        )
        .first()
    )
    if existing and existing.setup_status != "pending_setup":
        raise HTTPException(status_code=400, detail="Platform URL already exists")

    if existing:
        platform = existing
        if request.crawl_interval_minutes is not None:
            platform.crawl_interval_minutes = request.crawl_interval_minutes
    else:
        platform = JobPlatform(
            user_id=current_user.id,
            url=request.url,
            name=request.name or _ai_name(db, request.url),
            favicon_url=f"https://www.google.com/s2/favicons?sz=64&domain={domain}",
            crawl_interval_minutes=request.crawl_interval_minutes,
        )
        db.add(platform)

    _apply_setup_choices(platform, request)
    if selection is not None:
        _store_selection(platform, selection)
    platform.setup_status = "active"
    db.commit()
    db.refresh(platform)

    started = False
    if request.initial_run != "none":
        started = _start_first_crawl(platform, current_user, seed_only=request.initial_run == "seed")
    if not started and request.initial_run != "seed":
        # Later crawls seed while last_crawl_at is empty, and only an explicit "seed" choice may seed.
        platform.last_crawl_at = datetime.now(timezone.utc)
    db.commit()

    # Only an "analyze" run is something the user waits for; seeding is silent bookkeeping.
    return {
        **_serialize_platform(platform, job_count=0, seen_count=0),
        "initial_crawl_started": started and request.initial_run == "analyze",
    }


# Characters that mark a natural boundary inside a URL path/query. The inferred
# pattern is always trimmed back to one of these so it never cuts through the
# middle of a variable id/slug — which would make the pattern match only the one
# example job it was derived from.
_PATTERN_DELIMS = "/-_=?&."


def _infer_url_pattern(selected_urls: List[str]) -> str:
    """Infer the start (path plus query) that recognises a platform's job-detail URLs.

    The crawl filter (``url_matches_pattern``) requires a link's path plus query
    to begin with this pattern, so it must be a prefix shared by *every* job URL
    on the platform, including ones the user has not selected yet.

    Many boards encode the job id inside a single path segment, e.g. StepStone's
    ``/stellenangebote--<title>--<id>-inline.html``. A segment-level common
    prefix collapses to ``/`` for those and is useless, so we work at the
    character level and trim the result back to the last natural delimiter.
    """
    urls = [u for u in selected_urls if u]
    if not urls:
        return ""

    def _key(u: str) -> str:
        parsed = urlparse(u)
        return parsed.path + (f"?{parsed.query}" if parsed.query else "")

    keys = [_key(u) for u in urls]

    if len(keys) == 1:
        # A single example offers no divergence point, so cut at the first
        # delimiter after the leading slash to drop the unique id/slug tail.
        key = keys[0]
        cut = next(
            (i for i, ch in enumerate(key) if i > 0 and ch in _PATTERN_DELIMS),
            -1,
        )
        pattern = key[:cut] if cut > 0 else key
    else:
        # Character-level longest common prefix across all selected URLs.
        pattern = os.path.commonprefix(keys)
        # Trim a partial trailing token back to the last delimiter so siblings
        # whose id/slug diverges earlier are still recognised.
        if pattern and pattern[-1] not in _PATTERN_DELIMS:
            cut = max(pattern.rfind(d) for d in _PATTERN_DELIMS)
            if cut > 0:
                pattern = pattern[: cut + 1]

    # Never return a root-only / empty pattern (would match every link or none).
    if len(pattern.strip("/")) < 1:
        segs = [s for s in urlparse(urls[0]).path.split("/") if s]
        pattern = f"/{segs[0]}" if segs else keys[0]

    return pattern
