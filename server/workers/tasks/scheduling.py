"""Celery tasks: periodic follow-up checks, scheduled crawls and Redis cleanup."""

import os
import json
from datetime import datetime, timezone

import redis
import requests

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, User

logger = get_logger(__name__)


@celery_app.task(name="worker.check_follow_ups")
def check_follow_ups():
    """
    Periodischer Task: Prüft fällige Follow-ups und sendet Benachrichtigungen.
    Wird von Celery Beat ausgeführt (z.B. alle 6 Stunden).
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due_jobs = (
            db.query(JobEntry)
            .filter(
                JobEntry.next_follow_up_at <= now,
                JobEntry.status.in_(["APPLIED", "INTERVIEW"]),
            )
            .all()
        )

        notified_count = 0
        for job in due_jobs:
            user_profile = (
                db.query(UserProfile).filter(UserProfile.user_id == job.user_id).first()
            )
            if not user_profile:
                continue

            message = f"Follow-up due: {job.title} at {job.company}"

            # Use existing notification adapters (same pattern as worker.py)
            if (
                user_profile.active_notification_service == "PUSHOVER"
                and user_profile.pushover_user_key
            ):
                try:
                    resp = requests.post(
                        "https://api.pushover.net/1/messages.json",
                        data={
                            "token": user_profile.pushover_api_token,
                            "user": user_profile.pushover_user_key,
                            "message": message,
                            "title": "Job Follow-up Reminder",
                        },
                    )
                    if resp.status_code == 200:
                        notified_count += 1
                    else:
                        logger.error(f"Pushover notification failed: {resp.text}")
                except Exception as e:
                    logger.error(f"Pushover notification failed: {e}")

            # Clear follow_up after notifying (so it doesn't repeat)
            job.next_follow_up_at = None

        db.commit()
        logger.info(f"Follow-up check complete: {notified_count} notifications sent")
        return {"notified": notified_count, "due_jobs": len(due_jobs)}

    finally:
        db.close()


@celery_app.task(name="ai.check_platforms_for_crawl")
def check_platforms_for_crawl():
    logger.info(" Checking platforms for scheduled crawls...")
    db = SessionLocal()
    try:
        from datetime import timedelta
        from database.core import JobPlatform

        import zoneinfo
        now_utc = datetime.now(timezone.utc)

        # Load platforms that are active and either never crawled or interval passed
        platforms = db.query(JobPlatform).filter(JobPlatform.is_active == True).all()

        triggered_count = 0
        SCRAPER_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")

        for p in platforms:
            is_due = False

            # Resolve user timezone for this platform
            user_tz_str = "Europe/Berlin"
            try:
                user_profile = db.query(UserProfile).filter(UserProfile.user_id == p.user_id).first()
                if user_profile and user_profile.timezone:
                    user_tz_str = user_profile.timezone
            except Exception:
                pass
            try:
                user_tz = zoneinfo.ZoneInfo(user_tz_str)
            except Exception:
                user_tz = zoneinfo.ZoneInfo("Europe/Berlin")

            now_local = now_utc.astimezone(user_tz)

            logger.info(
                f"[SCHEDULE] Checking '{p.name}' (id={p.id}) | tz={user_tz_str} | "
                f"now_local={now_local.strftime('%H:%M')} | "
                f"schedule_time={p.schedule_time!r} schedule_days={p.schedule_days!r} | "
                f"last_crawl_at={p.last_crawl_at!r}"
            )

            if p.schedule_time and p.schedule_days is not None:
                today_weekday = now_local.weekday()  # 0=Mon, 6=Sun
                if today_weekday in p.schedule_days:
                    try:
                        h, m = map(int, p.schedule_time.split(":"))
                        scheduled_local = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
                        if now_local >= scheduled_local:
                            if not p.last_crawl_at:
                                is_due = True
                            else:
                                last_local = p.last_crawl_at.replace(tzinfo=timezone.utc).astimezone(user_tz)
                                if last_local < scheduled_local:
                                    is_due = True
                                else:
                                    logger.info(f"[SCHEDULE] Skipped: already crawled today at {last_local.strftime('%H:%M')} (after scheduled {p.schedule_time})")
                        else:
                            logger.info(f"[SCHEDULE] Skipped: {p.schedule_time} not yet reached (now_local={now_local.strftime('%H:%M')})")
                    except (ValueError, AttributeError) as e:
                        logger.error(f"[SCHEDULE] Error parsing schedule for {p.name}: {e}")
                else:
                    logger.info(f"[SCHEDULE] Skipped: today={today_weekday} not in {p.schedule_days}")
            else:
                logger.info(f"[SCHEDULE] Skipped '{p.name}': no schedule defined")

            if is_due:
                is_initial_run = not p.last_crawl_at
                logger.info(
                    f"🚀 Platform {p.name} (ID: {p.id}) is due for crawl. Triggering..."
                )
                try:
                    from core.auth import create_access_token
                    platform_user = db.query(User).filter(User.id == p.user_id).first()
                    if not platform_user:
                        logger.error(f"User {p.user_id} not found for platform {p.name}, skipping")
                        continue
                    _internal_token = create_access_token({"sub": platform_user.username, "tv": platform_user.token_version})
                    resp = requests.post(
                        f"{SCRAPER_URL}/search",
                        json={
                            "query": p.url,
                            "location": "Remote",
                            "platform_id": p.id,
                            "is_initial_run": is_initial_run,
                        },
                        headers={"Cookie": f"access_token={_internal_token}"},
                        timeout=5,
                    )
                    if resp.status_code == 200:
                        p.last_crawl_at = now_utc
                        triggered_count += 1
                    else:
                        logger.error(
                            f"Failed to trigger crawl for {p.name}: {resp.status_code}"
                        )
                except Exception as e:
                    logger.error(f"Error triggering periodic crawl for {p.name}: {e}")

        if triggered_count > 0:
            db.commit()
            logger.info(f" Triggered {triggered_count} periodic crawls.")
        else:
            logger.info("No platforms due for crawl.")

    except Exception as e:
        logger.error(f"Error in check_periodic_crawls_task: {e}")
    finally:
        db.close()


@celery_app.task(name="ai.cleanup_stale_redis_jobs")
def cleanup_stale_redis_jobs():
    """Remove crawl jobs from Redis that have been running for more than 5 minutes."""
    import time as time_module

    STALE_THRESHOLD_MS = 5 * 60 * 1000  # 5 minutes in milliseconds
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
    r = redis.from_url(redis_url, decode_responses=True)

    now_ms = int(time_module.time() * 1000)
    removed = 0

    try:
        job_keys = r.keys("crawl_job:*")
        # Filter out sub-keys like crawl_job:{id}:all_job_titles
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

            job_id = key.split(":", 1)[1]
            user_id = job_data.get("user_id")
            status = job_data.get("status", "")

            # Skip jobs that are already completed (they have their own TTL)
            if status == "completed":
                continue

            logger.info(
                f"🧹 Removing stale Redis job {job_id} (age={age_ms // 1000}s, status={status})"
            )
            r.delete(key)
            r.delete(f"crawl_job:{job_id}:all_job_titles")
            if user_id:
                r.srem(f"user:{user_id}:active_crawls", job_id)
            removed += 1

        if removed:
            r.delete("system:crawling")
            logger.info(f" Removed {removed} stale Redis crawl job(s).")
        else:
            logger.debug("No stale Redis crawl jobs found.")

        return {"removed": removed}

    except Exception as e:
        logger.error(f"Error during stale Redis job cleanup: {e}")
        return {"removed": 0, "error": str(e)}
