import os
from typing import List, Optional

import requests
from fastapi import APIRouter, HTTPException, Depends

from database.core import (
    SessionLocal,
    User,
    JobEntry,
    JobPlatform,
    JobStatusHistory,
    JobDocument,
    CompanyProfile,
    PlatformCreate,
    PlatformUpdate,
    PlatformResponse,
)
from auth import get_current_user, create_access_token
from routers.deps import APPLICATION_STATUSES
from logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("/platforms", response_model=List[PlatformResponse])
def get_platforms(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        from sqlalchemy import func

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

        result = []
        for p, count, s_count in platforms_query:
            result.append(
                {
                    "id": p.id,
                    "url": p.url,
                    "name": p.name,
                    "favicon_url": p.favicon_url,
                    "crawl_interval_minutes": p.crawl_interval_minutes,
                    "schedule_time": p.schedule_time,
                    "schedule_days": p.schedule_days,
                    "last_crawl_at": (
                        p.last_crawl_at.isoformat() if p.last_crawl_at else None
                    ),
                    "is_active": p.is_active,
                    "is_notification_enabled": p.is_notification_enabled,
                    "notification_adapters": p.notification_adapters or [],
                    "pushover_template": p.pushover_template,
                    "resend_template": p.resend_template,
                    "resend_recipients": p.resend_recipients,
                    "mailjet_template": p.mailjet_template,
                    "mailjet_recipients": p.mailjet_recipients,
                    "smtp_template": p.smtp_template,
                    "smtp_recipients": p.smtp_recipients,
                    "job_count": count,
                    "seen_count": s_count,
                }
            )
        return result
    finally:
        db.close()


@router.post("/platforms", response_model=PlatformResponse)
def create_platform(
    platform: PlatformCreate, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        # Check for duplicates
        existing = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.user_id == current_user.id, JobPlatform.url == platform.url
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Platform URL already exists")

        from urllib.parse import urlparse
        domain = urlparse(platform.url).netloc

        from intelligence.service import generate_platform_name
        name = generate_platform_name(platform.url, db=db)

        # Favicon URL (using Google's service)
        favicon_url = f"https://www.google.com/s2/favicons?sz=64&domain={domain}"

        db_platform = JobPlatform(
            user_id=current_user.id,
            url=platform.url,
            name=name,
            favicon_url=favicon_url,
            crawl_interval_minutes=platform.crawl_interval_minutes,
        )
        db.add(db_platform)
        db.commit()
        db.refresh(db_platform)

        # Trigger immediate initial scan (saves URLs as SEEN placeholders, no AI analysis)
        try:
            SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8002/scraper")
            _internal_token = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
            resp = requests.post(
                f"{SCRAPER_URL}/search",
                json={
                    "query": db_platform.url,
                    "location": "Remote",
                    "platform_id": db_platform.id,
                    "is_initial_run": True,
                },
                headers={"Cookie": f"access_token={_internal_token}"},
                timeout=5,
            )
            resp.raise_for_status()
            from datetime import datetime, timezone as tz
            db_platform.last_crawl_at = datetime.now(tz.utc)
            db.commit()
            db.refresh(db_platform)
        except Exception as e:
            logger.warning(f"Failed to trigger initial crawl for new platform {db_platform.id}: {e}")

        return {
            **db_platform.__dict__,
            "job_count": 0,
            "seen_count": 0,
            "notification_adapters": db_platform.notification_adapters or [],
            "last_crawl_at": (
                db_platform.last_crawl_at.isoformat() if db_platform.last_crawl_at else None
            ),
        }
    finally:
        db.close()


@router.patch("/platforms/{platform_id}", response_model=PlatformResponse)
def update_platform(
    platform_id: int,
    platform_update: PlatformUpdate,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        if platform_update.url is not None:
            from urllib.parse import urlparse
            new_domain = urlparse(platform_update.url).netloc.replace("www.", "")
            old_domain = urlparse(db_platform.url).netloc.replace("www.", "")

            if new_domain != old_domain:
                raise HTTPException(status_code=400, detail=f"Domain change not allowed. Must remain on {old_domain}")

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
        if "schedule_time" in platform_update.__fields_set__:
            db_platform.schedule_time = platform_update.schedule_time or None
        if "schedule_days" in platform_update.__fields_set__:
            db_platform.schedule_days = platform_update.schedule_days or None
        if platform_update.is_active is not None:
            db_platform.is_active = platform_update.is_active
        if platform_update.is_notification_enabled is not None:
            db_platform.is_notification_enabled = (
                platform_update.is_notification_enabled
            )
        if platform_update.notification_adapters is not None:
            db_platform.notification_adapters = platform_update.notification_adapters
            db_platform.is_notification_enabled = (
                len(platform_update.notification_adapters) > 0
            )
        if "pushover_template" in platform_update.__fields_set__:
            db_platform.pushover_template = platform_update.pushover_template or None
        if "resend_template" in platform_update.__fields_set__:
            db_platform.resend_template = platform_update.resend_template or None
        if "resend_recipients" in platform_update.__fields_set__:
            db_platform.resend_recipients = platform_update.resend_recipients or None
        if "mailjet_template" in platform_update.__fields_set__:
            db_platform.mailjet_template = platform_update.mailjet_template or None
        if "mailjet_recipients" in platform_update.__fields_set__:
            db_platform.mailjet_recipients = platform_update.mailjet_recipients or None
        if "smtp_template" in platform_update.__fields_set__:
            db_platform.smtp_template = platform_update.smtp_template or None
        if "smtp_recipients" in platform_update.__fields_set__:
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

        return {
            "id": db_platform.id,
            "url": db_platform.url,
            "name": db_platform.name,
            "favicon_url": db_platform.favicon_url,
            "crawl_interval_minutes": db_platform.crawl_interval_minutes,
            "schedule_time": db_platform.schedule_time,
            "schedule_days": db_platform.schedule_days,
            "last_crawl_at": (
                db_platform.last_crawl_at.isoformat()
                if db_platform.last_crawl_at
                else None
            ),
            "is_active": db_platform.is_active,
            "is_notification_enabled": db_platform.is_notification_enabled,
            "notification_adapters": db_platform.notification_adapters or [],
            "pushover_template": db_platform.pushover_template,
            "resend_template": db_platform.resend_template,
            "resend_recipients": db_platform.resend_recipients,
            "mailjet_template": db_platform.mailjet_template,
            "mailjet_recipients": db_platform.mailjet_recipients,
            "smtp_template": db_platform.smtp_template,
            "smtp_recipients": db_platform.smtp_recipients,
            "job_count": job_count,
        }
    finally:
        db.close()


@router.post("/platforms/{platform_id}/generate-name")
def trigger_platform_name_generation(platform_id: int, current_user: User = Depends(get_current_user)):
    from intelligence.service import generate_platform_name
    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        new_name = generate_platform_name(db_platform.url, db=db)
        db_platform.name = new_name
        db.commit()
        return {"id": platform_id, "name": new_name}
    finally:
        db.close()


@router.post("/platforms/{platform_id}/test-pushover")
def test_pushover_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
):
    from worker import _send_via_pushover

    db = SessionLocal()
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

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"

        if not _send_via_pushover(_FakeJob(), profile, platform=platform):
            raise HTTPException(status_code=500, detail="Pushover delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-pushover failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/platforms/{platform_id}/test-resend")
def test_resend_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
):
    from worker import _send_via_resend_batch

    db = SessionLocal()
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

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"
            platform_id = None

        if not _send_via_resend_batch([_FakeJob()], profile, platform=platform, userName=current_user.username):
            raise HTTPException(status_code=500, detail="Resend delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-resend failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/platforms/{platform_id}/test-mailjet")
def test_mailjet_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
):
    from worker import _send_via_mailjet_batch

    db = SessionLocal()
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

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"
            platform_id = None

        if not _send_via_mailjet_batch([_FakeJob()], profile, platform=platform, userName=current_user.username):
            raise HTTPException(status_code=500, detail="Mailjet delivery failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-mailjet failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/platforms/{platform_id}/test-smtp")
def test_smtp_notification(
    platform_id: int,
    current_user: User = Depends(get_current_user),
):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    db = SessionLocal()
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

        smtp_port = profile.smtp_port or 587
        from_email = profile.smtp_from_email or profile.smtp_user
        recipients = platform.smtp_recipients if isinstance(platform.smtp_recipients, list) else [platform.smtp_recipients]

        from worker import _RESEND_DEFAULT_HTML, _RESEND_DEFAULT_JOB_ROW

        class _FakeJob:
            id = 0
            title = "Senior Software Engineer"
            company = "Acme Corp"
            match_score = 87.0
            reasoning = "Strong match based on your Python and FastAPI experience."
            url = "https://example.com/job/123"
            platform_id = None

        fake_jobs = [_FakeJob()]
        platform_name = platform.name or "Job Platform"
        userName = current_user.username
        count = 1

        job_rows_html = _RESEND_DEFAULT_JOB_ROW.format(
            title=_FakeJob.title,
            company=_FakeJob.company,
            match_score=str(int(_FakeJob.match_score)),
            reasoning=_FakeJob.reasoning,
            url_link=f'<a href="{_FakeJob.url}">Details anzeigen</a>',
        )

        raw_template = platform.smtp_template or ""
        if raw_template:
            import re
            if "{{#jobs}}" in raw_template:
                loop_match = re.search(r"\{\{#jobs\}\}(.*?)\{\{/jobs\}\}", raw_template, re.DOTALL)
                if loop_match:
                    loop_block = loop_match.group(1)
                    rendered_jobs = loop_block \
                        .replace("$title", _FakeJob.title) \
                        .replace("$company", _FakeJob.company) \
                        .replace("$match_score", str(int(_FakeJob.match_score))) \
                        .replace("$reasoning", _FakeJob.reasoning) \
                        .replace("$url", _FakeJob.url)
                    html = re.sub(r"\{\{#jobs\}\}.*?\{\{/jobs\}\}", rendered_jobs, raw_template, flags=re.DOTALL)
                else:
                    html = raw_template
                html = html \
                    .replace("$userName", userName) \
                    .replace("$jobCount", str(count)) \
                    .replace("$platform_name", platform_name)
            elif "$jobs_html" in raw_template:
                html = raw_template \
                    .replace("$jobs_html", job_rows_html) \
                    .replace("$userName", userName) \
                    .replace("$jobCount", str(count)) \
                    .replace("$platform_name", platform_name)
            else:
                html = raw_template
        else:
            html = _RESEND_DEFAULT_HTML.format(
                userName=userName,
                count=count,
                plural="",
                platform_name=platform_name,
                job_rows=job_rows_html,
            )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[Job Agent] Test E-Mail – {platform_name}"
        msg["From"] = from_email
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(profile.smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(profile.smtp_user, profile.smtp_password)
            server.sendmail(from_email, recipients, msg.as_string())

        logger.info("test-smtp sent to %s via %s:%s", recipients, profile.smtp_host, smtp_port)
        return {"ok": True}
    except HTTPException:
        raise
    except smtplib.SMTPAuthenticationError as e:
        raise HTTPException(status_code=500, detail=f"SMTP Authentifizierung fehlgeschlagen: {e.smtp_error.decode(errors='replace') if isinstance(e.smtp_error, bytes) else str(e)}")
    except smtplib.SMTPConnectError as e:
        raise HTTPException(status_code=500, detail=f"Verbindung zu {profile.smtp_host}:{smtp_port} fehlgeschlagen: {e}")
    except smtplib.SMTPException as e:
        raise HTTPException(status_code=500, detail=f"SMTP Fehler: {e}")
    except Exception as e:
        logger.error("test-smtp failed for platform %s: %s", platform_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    delete_listings: bool = False,
    keep_favorites: bool = True,
    keep_applications: bool = True,
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func

    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
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
    finally:
        db.close()


@router.delete("/platforms/{platform_id}/jobs")
def delete_platform_jobs(
    platform_id: int,
    keep_favorites: bool = True,
    keep_applications: bool = True,
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_, and_

    db = SessionLocal()
    try:
        # Verify platform belongs to user
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        query = db.query(JobEntry).filter(JobEntry.platform_id == platform_id)
        if keep_favorites and keep_applications:
            query = query.filter(
                and_(
                    JobEntry.is_favorite == False,
                    ~JobEntry.status.in_(APPLICATION_STATUSES),
                )
            )
        elif keep_favorites:
            query = query.filter(
                or_(
                    JobEntry.is_favorite == False,
                    JobEntry.status.in_(APPLICATION_STATUSES),
                )
            )
        elif keep_applications:
            query = query.filter(
                or_(
                    ~JobEntry.status.in_(APPLICATION_STATUSES),
                    JobEntry.is_favorite == True,
                )
            )

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
    finally:
        db.close()


@router.post("/platforms/{platform_id}/crawl")
def trigger_platform_crawl(
    platform_id: int, current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        db_platform = (
            db.query(JobPlatform)
            .filter(
                JobPlatform.id == platform_id, JobPlatform.user_id == current_user.id
            )
            .first()
        )
        if not db_platform:
            raise HTTPException(status_code=404, detail="Platform not found")

        if not db_platform.is_active:
            raise HTTPException(status_code=400, detail="Platform is deactivated")

        is_initial_run = db_platform.last_crawl_at is None

        # Trigger scraper-service
        from sqlalchemy import func

        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8002/scraper")
        logger.info(f"Triggering scraper at: {SCRAPER_URL}/search")
        _internal_token = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
        try:
            resp = requests.post(
                f"{SCRAPER_URL}/search",
                json={
                    "query": db_platform.url,
                    "location": "Remote",
                    "platform_id": db_platform.id,
                    "is_initial_run": is_initial_run,
                },
                headers={"Cookie": f"access_token={_internal_token}"},
                timeout=5,
            )
            resp.raise_for_status()

            # Update last_crawl_at
            db_platform.last_crawl_at = func.now()
            db.commit()

            return resp.json()
        except Exception as e:
            logger.error(f"Failed to trigger scraper: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to trigger crawler service"
            )
    finally:
        db.close()


# Need to import UserProfile for the platform test routes
from database.core import UserProfile
