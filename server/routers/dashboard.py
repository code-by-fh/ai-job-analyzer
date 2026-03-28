import os
from typing import Optional

import redis as redis_sync
import requests
from fastapi import APIRouter, Depends

from database.core import SessionLocal, User, JobEntry, UserProfile, JobPlatform
from core.auth import get_current_user, create_access_token
from routers.deps import _mask_profile
from core.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("/status")
async def get_system_status():
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    r = redis_sync.from_url(redis_url, decode_responses=True)
    is_crawling = r.get("system:crawling")
    ai_error = r.get("system:ai_404_error")
    return {"crawling": bool(is_crawling), "ai_error": ai_error}


@router.get("/statistics")
def get_statistics(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        q = db.query(JobEntry).filter(JobEntry.user_id == current_user.id)
        total_jobs = q.filter(JobEntry.title.isnot(None), JobEntry.is_archived == False, JobEntry.status != "SEEN").count()
        applied_jobs = q.filter(JobEntry.status == "APPLIED").count()
        interviews = q.filter(JobEntry.status == "INTERVIEW").count()
        offers = q.filter(JobEntry.status == "OFFER").count()
        rejected = q.filter(JobEntry.status == "REJECTED").count()
        return {
            "total_jobs": total_jobs,
            "applied_jobs": applied_jobs,
            "interviews": interviews,
            "offers": offers,
            "rejected": rejected,
        }
    finally:
        db.close()


@router.get("/dashboard-data")
def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    limit: Optional[int] = 10,
    offset: int = 0,
    filter_type: Optional[str] = "all",
    sort_by: Optional[str] = "score",
    has_application: Optional[bool] = None,
    status_filter: Optional[str] = None,
):
    """
    Combined endpoint for Dashboard:
    1. Jobs list
    2. System status (crawling boolean)
    3. Active crawls (from scraper-service)
    """
    db = SessionLocal()
    try:
        # 1. Fetch Jobs
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == False,
        )
        if filter_type == "favorite":
            query = query.filter(JobEntry.is_favorite == True)
        elif filter_type == "no_favorite":
            query = query.filter(JobEntry.is_favorite == False)
        elif filter_type == "applications":
            query = query.filter(JobEntry.application_draft.isnot(None))

        if has_application is True:
            query = query.filter(JobEntry.application_draft.isnot(None))
        elif has_application is False:
            query = query.filter(JobEntry.application_draft.is_(None))

        if status_filter:
            query = query.filter(JobEntry.status == status_filter)

        if sort_by == "date":
            query = query.order_by(JobEntry.created_at.desc())
        else:
            query = query.order_by(JobEntry.match_score.desc())
        jobs = query.offset(offset).limit(limit).all()

        # 2. Fetch System Status
        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
        try:
            r = redis_sync.from_url(redis_url, decode_responses=True)
            is_crawling = bool(r.get("system:crawling"))
        except Exception as e:
            logger.error(f"Redis error: {e}")
            is_crawling = False

        # 3. Fetch Scraper Status (Active Crawls)
        active_crawls = []
        try:
            SCRAPER_URL = os.getenv(
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:8002/scraper"
            )
            _tok = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
            res = requests.get(
                f"{SCRAPER_URL}/crawl-status", timeout=2,
                headers={"Cookie": f"access_token={_tok}"},
            )
            if res.ok:
                data = res.json()
                if "jobs" in data:
                    active_crawls = data["jobs"]
        except Exception as e:
            logger.error(f"Scraper service error: {e}")

        ai_error = None
        try:
            ai_error = r.get("system:ai_404_error")
        except Exception:
            pass

        return {
            "jobs": jobs,
            "system_crawling": is_crawling,
            "active_crawls": active_crawls,
            "ai_error": ai_error,
        }
    finally:
        db.close()


@router.get("/settings-view")
def get_settings_view(current_user: User = Depends(get_current_user)):
    """
    Combined endpoint for Settings Page:
    1. User Profile
    2. Platforms list (with counts)
    3. Crawl Status
    """
    db = SessionLocal()
    try:
        # 1. Profile
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )
        if not profile:
            # Create default if missing
            profile = UserProfile(
                user_id=current_user.id,
                role="",
                skills="",
                min_salary="",
                location="",
                preferences="",
                cv_data={"experience": [], "projects": [], "education": ""},
                job_urls=[],
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)

        # 2. Platforms
        from sqlalchemy import func

        job_counts = (
            db.query(JobEntry.platform_id, func.count(JobEntry.id).label("job_count"))
            .filter(JobEntry.user_id == current_user.id, JobEntry.status != "SEEN")
            .group_by(JobEntry.platform_id)
            .subquery()
        )

        platforms_query = (
            db.query(
                JobPlatform, func.coalesce(job_counts.c.job_count, 0).label("job_count")
            )
            .outerjoin(job_counts, JobPlatform.id == job_counts.c.platform_id)
            .filter(JobPlatform.user_id == current_user.id)
            .all()
        )

        platforms_data = []
        for p, count in platforms_query:
            platforms_data.append(
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
                }
            )

        # 3. Crawl Status (Active Crawls)
        active_crawls = []
        try:
            SCRAPER_URL = os.getenv(
                "SCRAPER_SERVICE_URL", "http://127.0.0.1:8002/scraper"
            )
            _tok = create_access_token({"sub": current_user.username, "tv": current_user.token_version})
            res = requests.get(
                f"{SCRAPER_URL}/crawl-status", timeout=2,
                headers={"Cookie": f"access_token={_tok}"},
            )
            if res.ok:
                data = res.json()
                if "jobs" in data:
                    active_crawls = data["jobs"]
        except Exception as e:
            logger.error(f"Scraper service error: {e}")

        return {
            "profile": _mask_profile(profile),
            "platforms": platforms_data,
            "active_crawls": active_crawls,
        }
    finally:
        db.close()
