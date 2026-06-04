import os
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from core.auth import create_access_token, get_current_user, get_db
from database.core import (
    CompanyProfile,
    JobDocument,
    JobEntry,
    JobPlatform,
    JobStatusHistory,
    PlatformCreate,
    PlatformResponse,
    PlatformUpdate,
    User,
    UserProfile,
)
from core.logger import get_logger
from intelligence.service import generate_platform_name
from routers.deps import APPLICATION_STATUSES
from workers.worker import (
    _send_via_mailjet_batch,
    _send_via_pushover,
    _send_via_resend_batch,
    _send_via_smtp_batch,
)

logger = get_logger(__name__)

router = APIRouter()


class _FakeJob:
    id = 0
    title = "Senior Software Engineer"
    company = "Acme Corp"
    match_score = 87.0
    reasoning = "Strong match based on your Python and FastAPI experience."
    url = "https://example.com/job/123"
    platform_id = None


def _serialize_platform(platform: JobPlatform, job_count: int = 0, seen_count: int = 0) -> dict:
    """Helper to convert a JobPlatform model and related counters to a PlatformResponse dictionary."""
    return {
        "id": platform.id,
        "url": platform.url,
        "name": platform.name,
        "favicon_url": platform.favicon_url,
        "crawl_interval_minutes": platform.crawl_interval_minutes,
        "schedule_time": platform.schedule_time,
        "schedule_days": platform.schedule_days,
        "last_crawl_at": platform.last_crawl_at.isoformat() if platform.last_crawl_at else None,
        "is_active": platform.is_active,
        "is_notification_enabled": platform.is_notification_enabled,
        "notification_adapters": platform.notification_adapters or [],
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
    }


def _trigger_scraper_search(platform: JobPlatform, current_user: User, is_initial_run: bool) -> dict:
    """Helper to trigger search on the scraper service with internal auth token."""
    SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    logger.info(f"Triggering scraper at: {SCRAPER_URL}/search for platform {platform.id}")
    _internal_token = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
    
    resp = requests.post(
        f"{SCRAPER_URL}/search",
        json={
            "query": platform.url,
            "location": "Remote",
            "platform_id": platform.id,
            "is_initial_run": is_initial_run,
        },
        headers={"Cookie": f"access_token={_internal_token}"},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()


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
    name = generate_platform_name(platform.url, db=db)

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
        new_domain = urlparse(platform_update.url).netloc.replace("www.", "")
        old_domain = urlparse(db_platform.url).netloc.replace("www.", "")

        if new_domain != old_domain:
            raise HTTPException(
                status_code=400,
                detail=f"Domain change not allowed. Must remain on {old_domain}"
            )

        # Check for duplicates
        existing = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.user_id == current_user.id,
                JobPlatform.url == platform_update.url,
                JobPlatform.id != platform_id
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Platform URL already exists")

        db_platform.url = platform_update.url
        domain = new_domain
        if domain:
            db_platform.name = domain.replace("www.", "")
            db_platform.favicon_url = f"https://www.google.com/s2/favicons?sz=64&domain={domain}"

    if platform_update.name is not None:
        db_platform.name = platform_update.name

    if platform_update.crawl_interval_minutes is not None:
        db_platform.crawl_interval_minutes = platform_update.crawl_interval_minutes
        
    if "schedule_time" in platform_update.model_fields_set:
        db_platform.schedule_time = platform_update.schedule_time or None
    if "schedule_days" in platform_update.model_fields_set:
        db_platform.schedule_days = platform_update.schedule_days or None
    if platform_update.is_active is not None:
        db_platform.is_active = platform_update.is_active
        
    if platform_update.is_notification_enabled is not None:
        db_platform.is_notification_enabled = platform_update.is_notification_enabled
        
    if platform_update.notification_adapters is not None:
        db_platform.notification_adapters = platform_update.notification_adapters
        db_platform.is_notification_enabled = len(platform_update.notification_adapters) > 0
        
    if "pushover_template" in platform_update.model_fields_set:
        db_platform.pushover_template = platform_update.pushover_template or None
    if "resend_template" in platform_update.model_fields_set:
        db_platform.resend_template = platform_update.resend_template or None
    if "resend_recipients" in platform_update.model_fields_set:
        db_platform.resend_recipients = platform_update.resend_recipients or None
    if "mailjet_template" in platform_update.model_fields_set:
        db_platform.mailjet_template = platform_update.mailjet_template or None
    if "mailjet_recipients" in platform_update.model_fields_set:
        db_platform.mailjet_recipients = platform_update.mailjet_recipients or None
    if "smtp_template" in platform_update.model_fields_set:
        db_platform.smtp_template = platform_update.smtp_template or None
    if "smtp_recipients" in platform_update.model_fields_set:
        db_platform.smtp_recipients = platform_update.smtp_recipients or None

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

    new_name = generate_platform_name(db_platform.url, db=db)
    db_platform.name = new_name
    db.commit()
    return {"id": platform_id, "name": new_name}


@router.post("/platforms/{platform_id}/test-pushover")
def test_pushover_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.pushover_user_key or not profile.pushover_api_token:
            raise HTTPException(status_code=400, detail="Pushover credentials not configured")

        if not _send_via_pushover(_FakeJob(), profile, platform=platform):
            raise HTTPException(status_code=500, detail="Pushover delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-pushover failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/platforms/{platform_id}/test-resend")
def test_resend_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.resend_api_key or not profile.resend_from_email:
            raise HTTPException(status_code=400, detail="Resend credentials not configured")

        if not platform.resend_recipients:
            raise HTTPException(status_code=400, detail="No Resend recipients configured for this platform")

        if not _send_via_resend_batch([_FakeJob()], profile, platform=platform, userName=current_user.username):
            raise HTTPException(status_code=500, detail="Resend delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-resend failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/platforms/{platform_id}/test-mailjet")
def test_mailjet_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.mailjet_api_key or not profile.mailjet_secret_key or not profile.mailjet_from_email:
            raise HTTPException(status_code=400, detail="Mailjet credentials not configured")

        if not platform.mailjet_recipients:
            raise HTTPException(status_code=400, detail="No Mailjet recipients configured for this platform")

        if not _send_via_mailjet_batch([_FakeJob()], profile, platform=platform, userName=current_user.username):
            raise HTTPException(status_code=500, detail="Mailjet delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-mailjet failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/platforms/{platform_id}/test-smtp")
def test_smtp_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        platform = (
            db.query(JobPlatform)
            .filter(JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id)
            .first()
        )
        if not platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile or not profile.smtp_host or not profile.smtp_user or not profile.smtp_password:
            raise HTTPException(status_code=400, detail="SMTP credentials not configured")

        if not platform.smtp_recipients:
            raise HTTPException(status_code=400, detail="No SMTP recipients configured for this platform")

        if not _send_via_smtp_batch([_FakeJob()], profile, platform=platform, userName=current_user.username):
            raise HTTPException(status_code=500, detail="SMTP delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-smtp failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    delete_listings: bool = False,
    keep_favorites: bool = True,
    keep_applications: bool = True,
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

    # Get all domains associated with the platform's jobs
    domains_to_check = [
        row[0]
        for row in db.query(JobEntry.company_domain)
        .filter(JobEntry.platform_id == platform_id)
        .distinct()
        .all()
        if row[0]
    ]

    # Delete job status history and documents for these jobs
    job_ids_subquery = (
        db.query(JobEntry.id).filter(JobEntry.platform_id == platform_id).subquery()
    )
    db.query(JobStatusHistory).filter(
        JobStatusHistory.job_id.in_(job_ids_subquery)
    ).delete(synchronize_session=False)
    db.query(JobDocument).filter(
        JobDocument.job_id.in_(job_ids_subquery)
    ).delete(synchronize_session=False)

    # Delete all jobs of this platform unconditionally
    query = db.query(JobEntry).filter(JobEntry.platform_id == platform_id)
    query.delete(synchronize_session=False)

    # Delete company profiles that were ONLY associated with these jobs
    for domain in domains_to_check:
        other_jobs_using_domain = (
            db.query(func.count(JobEntry.id))
            .filter(JobEntry.company_domain == domain)
            .scalar()
        )
        if other_jobs_using_domain == 0:
            db.query(CompanyProfile).filter(CompanyProfile.domain == domain).delete(
                synchronize_session=False
            )

    db.delete(db_platform)
    db.commit()
    return {"status": "deleted"}


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

    is_initial_run = db_platform.last_crawl_at is None

    try:
        resp_data = _trigger_scraper_search(db_platform, current_user, is_initial_run)
        
        # Update last_crawl_at
        db_platform.last_crawl_at = func.now()
        db.commit()

        return resp_data
    except Exception as e:
        logger.error(f"Failed to trigger scraper: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to trigger crawler service"
        )


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
    _internal_token = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
    try:
        resp = requests.post(
            f"{SCRAPER_URL}/preview-links",
            json={"url": platform.url},
            headers={"Cookie": f"access_token={_internal_token}"},
            timeout=90,
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

    url_pattern = _infer_url_pattern(setup.selected_urls, platform.url)
    platform.url_pattern = url_pattern
    platform.setup_status = 'active'
    db.commit()

    if setup.run_initial_crawl:
        try:
            _trigger_scraper_search(platform, current_user, True)
            platform.last_crawl_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to trigger initial crawl after setup for platform {platform_id}: {e}")

    return {"status": "ok", "url_pattern": url_pattern}


class PreviewUrlRequest(BaseModel):
    url: str


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

    SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    _internal_token = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
    try:
        resp = requests.post(
            f"{SCRAPER_URL}/preview-links",
            json={"url": request.url},
            headers={"Cookie": f"access_token={_internal_token}"},
            timeout=90,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch preview links for url {request.url}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch links from platform")


class PlatformSetupCreateRequest(BaseModel):
    url: str
    selected_urls: List[str]
    run_initial_crawl: bool = True
    crawl_interval_minutes: int = 60


@router.post("/platforms/setup", response_model=PlatformResponse)
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
    domain = _validate_http_url(request.url)

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
            name=generate_platform_name(request.url, db=db),
            favicon_url=f"https://www.google.com/s2/favicons?sz=64&domain={domain}",
            crawl_interval_minutes=request.crawl_interval_minutes,
        )
        db.add(platform)

    platform.url_pattern = _infer_url_pattern(request.selected_urls, request.url)
    platform.setup_status = "active"
    db.commit()
    db.refresh(platform)

    if request.run_initial_crawl:
        try:
            _trigger_scraper_search(platform, current_user, True)
            platform.last_crawl_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to trigger initial crawl after setup for platform {platform.id}: {e}")

    return _serialize_platform(platform, job_count=0, seen_count=0)


# Characters that mark a natural boundary inside a URL path/query. The inferred
# pattern is always trimmed back to one of these so it never cuts through the
# middle of a variable id/slug — which would make the pattern match only the one
# example job it was derived from.
_PATTERN_DELIMS = "/-_=?&."


def _infer_url_pattern(selected_urls: List[str], base_url: str) -> str:
    """Infer a substring that recognises a platform's job-detail URLs.

    The crawl filter applies this as a plain ``pattern in url`` test, so the
    pattern must be a substring shared by *every* job URL on the platform —
    including ones the user has not selected yet.

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
