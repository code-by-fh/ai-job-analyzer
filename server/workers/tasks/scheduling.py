"""Celery tasks: periodic follow-up checks, scheduled crawls and Redis cleanup."""

import os
import json
import zoneinfo
from datetime import datetime, timezone
from typing import Optional

import redis
import requests

from core.celery_config import celery_app
from core.crawl_registry import ALREADY_RUNNING, SCRAPER_START_TIMEOUT_SECONDS, is_started
from core.logger import get_logger
from core.profile_rules import user_profile_complete
from database.core import SessionLocal, JobEntry, JobPlatform, UserProfile, User, as_utc
from services.match_notifications import send_follow_up_reminder
from services.notifications_client import NotifyError
from workers.crawl_control import reap_stalled_crawls
from workers.tasks.platform_runs import record_failed_run

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

            # The reminder still follows the old "active service" switch; delivery goes through the service.
            if user_profile.active_notification_service == "PUSHOVER":
                try:
                    if send_follow_up_reminder(job.user_id, message):
                        notified_count += 1
                except NotifyError as error:
                    # The date stays, so the next beat tries again.
                    logger.error("Follow-up reminder not sent (%s)", error.code)
                    continue

            # Clear follow_up after notifying (so it doesn't repeat)
            job.next_follow_up_at = None

        db.commit()
        logger.info(f"Follow-up check complete: {notified_count} notifications sent")
        return {"notified": notified_count, "due_jobs": len(due_jobs)}

    finally:
        db.close()


FALLBACK_TIMEZONE = "Europe/Berlin"


def _user_timezone(db, user_id: int) -> tuple:
    """(name, tzinfo) of the user's timezone; an unknown or unreadable one falls back to Berlin."""
    name = FALLBACK_TIMEZONE
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile and profile.timezone:
            name = profile.timezone
    except Exception as e:
        logger.warning(f"[SCHEDULE] Could not read the timezone of user {user_id}: {e}")
    try:
        return name, zoneinfo.ZoneInfo(name)
    except Exception:
        return name, zoneinfo.ZoneInfo(FALLBACK_TIMEZONE)


def _slot_consumed(p, scheduled_local: datetime, user_tz) -> bool:
    """True when the slot already has its run: a crawl started after it, or a run finished after it.

    A refused start records a failed run, so a refusal consumes the slot instead of being retried every minute.
    """
    slot = scheduled_local.strftime("%H:%M")
    if p.last_crawl_at:
        last_local = p.last_crawl_at.replace(tzinfo=timezone.utc).astimezone(user_tz)
        if last_local >= scheduled_local:
            logger.info(f"[SCHEDULE] Skipped: already crawled at {last_local.strftime('%H:%M')} (after slot {slot})")
            return True
    finished_at = (p.last_run or {}).get("finished_at")
    if finished_at and as_utc(datetime.fromisoformat(finished_at)) >= scheduled_local:
        logger.info(f"[SCHEDULE] Skipped '{p.name}': a run already finished after the slot {slot}")
        return True
    return False


def _latest_slot(times: list, now_local: datetime) -> Optional[datetime]:
    """The most recent of today's slots that has passed, or None. Earlier passed slots are superseded by it."""
    slots = []
    for value in times:
        hour, minute = map(int, value.split(":"))
        slots.append(now_local.replace(hour=hour, minute=minute, second=0, microsecond=0))
    passed = [slot for slot in slots if slot <= now_local]
    return max(passed) if passed else None


def _is_due(p, now_local: datetime, user_tz) -> bool:
    if not (p.schedule_times and p.schedule_days is not None):
        logger.info(f"[SCHEDULE] Skipped '{p.name}': no schedule defined")
        return False
    if now_local.weekday() not in p.schedule_days:  # 0=Mon, 6=Sun
        logger.info(f"[SCHEDULE] Skipped: today={now_local.weekday()} not in {p.schedule_days}")
        return False
    try:
        slot = _latest_slot(p.schedule_times, now_local)
    except (ValueError, AttributeError, TypeError) as e:
        logger.error(f"[SCHEDULE] Error parsing schedule for {p.name}: {e}")
        return False
    if slot is None:
        logger.info(f"[SCHEDULE] Skipped: {p.schedule_times} not yet reached (now_local={now_local.strftime('%H:%M')})")
        return False
    return not _slot_consumed(p, slot, user_tz)


def _is_platform_due(db, p, now_utc: datetime) -> bool:
    tz_name, user_tz = _user_timezone(db, p.user_id)
    now_local = now_utc.astimezone(user_tz)
    logger.info(
        f"[SCHEDULE] Checking '{p.name}' (id={p.id}) | tz={tz_name} | "
        f"now_local={now_local.strftime('%H:%M')} | "
        f"schedule_times={p.schedule_times!r} schedule_days={p.schedule_days!r} | "
        f"last_crawl_at={p.last_crawl_at!r}"
    )
    return _is_due(p, now_local, user_tz)


def _post_search(p, platform_user):
    from core.auth import create_access_token, token_claims

    scraper_url = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081")
    token = create_access_token(token_claims(platform_user))
    return requests.post(
        f"{scraper_url}/search",
        json={
            "query": p.url,
            "location": "Remote",
            "platform_id": p.id,
            "is_initial_run": not p.last_crawl_at,
        },
        headers={"Cookie": f"access_token={token}"},
        timeout=SCRAPER_START_TIMEOUT_SECONDS,
    )


def _apply_answer(p, resp, now_utc: datetime) -> bool:
    """True when the scraper started a crawl (the only answer that stamps last_crawl_at)."""
    if resp.status_code != 200:
        logger.error(f"Failed to trigger crawl for {p.name}: {resp.status_code}")
        return False
    answer = resp.json()
    if is_started(answer):
        p.last_crawl_at = now_utc
        return True
    if answer.get("code") == ALREADY_RUNNING:
        # The running crawl reports its own run; it also keeps this slot from starting a second crawl.
        logger.info(f"Scheduled crawl of platform {p.id} skipped: a crawl is already running")
        return False
    logger.error(f"Scraper refused the scheduled crawl of platform {p.id}")
    record_failed_run(p.id, p.user_id)
    return False


def _attempt_crawl(db, p, now_utc: datetime) -> Optional[bool]:
    """None: no request was made. True: a crawl started. False: refused or failed."""
    logger.info(f"Platform {p.name} (ID: {p.id}) is due for crawl. Triggering...")
    platform_user = db.query(User).filter(User.id == p.user_id).first()
    if not platform_user:
        logger.error(f"User {p.user_id} not found for platform {p.name}, skipping")
        return None
    try:
        return _apply_answer(p, _post_search(p, platform_user), now_utc)
    except Exception as e:
        logger.error(f"Error triggering periodic crawl for {p.name}: {e}")
        return False


def _has_profile(db, p) -> bool:
    """A user without a maintained profile gets no scheduled crawl (nothing is stamped, so it runs once the profile is there)."""
    if user_profile_complete(db, p.user_id):
        return True
    logger.debug(f"[SCHEDULE] Skipped platform {p.id}: the owner's profile is not complete")
    return False


@celery_app.task(name="ai.check_platforms_for_crawl")
def check_platforms_for_crawl():
    logger.info(" Checking platforms for scheduled crawls...")
    db = SessionLocal()
    try:
        now_utc = datetime.now(timezone.utc)
        platforms = db.query(JobPlatform).filter(
            JobPlatform.is_active == True,
            JobPlatform.setup_status == 'active',
        ).all()
        outcomes = [
            _attempt_crawl(db, p, now_utc)
            for p in platforms
            if _is_platform_due(db, p, now_utc) and _has_profile(db, p)
        ]
        _finish_check(db, outcomes)
    except Exception as e:
        logger.error(f"Error in check_periodic_crawls_task: {e}")
    finally:
        db.close()


def _finish_check(db, outcomes: list) -> None:
    started = outcomes.count(True)
    if started:
        db.commit()
        logger.info(f" Triggered {started} periodic crawls.")
    elif all(outcome is None for outcome in outcomes):
        logger.info("No platforms due for crawl.")


@celery_app.task(name="ai.cleanup_stale_redis_jobs")
def cleanup_stale_redis_jobs():
    """Remove crawl jobs from Redis that made no progress for STALE_NO_PROGRESS_SECONDS."""
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    r = redis.from_url(redis_url, decode_responses=True)
    try:
        removed = reap_stalled_crawls(r)
        (logger.info if removed else logger.debug)(f" Removed {removed} stalled Redis crawl job(s).")
        return {"removed": removed}
    except Exception as e:
        logger.error(f"Error during stale Redis job cleanup: {e}")
        return {"removed": 0, "error": str(e)}
