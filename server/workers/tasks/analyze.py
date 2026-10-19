"""Celery tasks: analyze a scraped job (LLM scoring) and the no-AI basic save."""

import os
import json
from datetime import datetime, timezone
from typing import Optional

import redis
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)

from core.celery_config import celery_app
from core.job_status import ArchiveReason
from core.logger import get_logger
from core.crawl_progress import read_crawl_progress
from core.crawl_registry import touch_crawl_progress
from database.core import SessionLocal, JobEntry, UserProfile, JobPlatform, iso_utc
from intelligence.posting_details import apply_posting_details
from intelligence.service import get_client_and_model, format_cv_for_prompt, analyze_job

from services.match_notifications import notify_match
from workers.crawl_control import AI_FAILURE, INTERNAL_FAILURE, fail_crawl_job
from workers.tasks.crawl_status import maybe_complete_crawl

logger = get_logger(__name__)


def _own_job_id(job: JobEntry, user_id) -> Optional[str]:
    """The duplicate's id, only when it belongs to the crawl's user (events reach that user only)."""
    return job.id if job.user_id == user_id else None


def _crawl_stopped(redis_client, crawl_job_id: Optional[str]) -> bool:
    """A cancelled or vanished crawl: its tasks stop before any Redis write.

    Checks the dedicated cancellation marker (resurrection-safe) as well as the main key: a late
    hincrby would otherwise recreate the hash without TTL or started_at, and the reaper never collects it.
    """
    return bool(crawl_job_id) and bool(
        redis_client.exists(f"crawl_job:{crawl_job_id}:cancelled")
        or not redis_client.exists(f"crawl_job:{crawl_job_id}")
    )


@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    logger.info(
        f"[TASK] Starting Job Analysis for ID: {job_id}, Title: {job_title}, User: {user_id}"
    )

    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))

    crawl_job_id = job_data.get("crawl_job_id")
    if _crawl_stopped(r, crawl_job_id):
        logger.info(f"[TASK] Crawl job {crawl_job_id} cancelled — skipping analysis for {job_id}")
        return

    # Notify frontend that analysis is starting
    crawl_job_id = job_data.get("crawl_job_id")
    if crawl_job_id:
        touch_crawl_progress(r, crawl_job_id)
        analysis_completed = int(
            r.hincrby(f"crawl_job:{crawl_job_id}", "analysis_completed", 1)
        )

        # Add job title to all_job_titles list in Redis
        r.lpush(f"crawl_job:{crawl_job_id}:all_job_titles", job_title)
        list_length = r.llen(f"crawl_job:{crawl_job_id}:all_job_titles")
        logger.info(
            f"Added '{job_title}' to all_job_titles. List now has {list_length} entries."
        )

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_analysis_started",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "analysis_completed": analysis_completed,
                    "progress": read_crawl_progress(r, crawl_job_id),
                }
            ),
        )

    force_reanalyze = job_data.get("force_reanalyze", False)

    try:
        existing_job = db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first()
        # Fallback: check by URL in case UUID differs due to URL normalization
        if not existing_job and job_data.get("url") and user_id:
            existing_job = (
                db.query(JobEntry)
                .filter(JobEntry.user_id == user_id, JobEntry.url == job_data["url"])
                .first()
            )
            if existing_job:
                logger.info(
                    f"Job {job_id} matched by URL (ID mismatch). Skipping re-analysis."
                )
        if existing_job and not force_reanalyze:
            logger.info(f"Job {job_id} already exists in database. Skipping analysis.")

            if crawl_job_id:
                # Increment skipped counter
                touch_crawl_progress(r, crawl_job_id)
                jobs_skipped = int(
                    r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_skipped", 1)
                )

                # Notify frontend about skipped job
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_skipped",
                            "job_id": crawl_job_id,
                            "user_id": user_id,
                            "job_title": job_title,
                            "jobs_skipped": jobs_skipped,
                            "existing_job_id": _own_job_id(existing_job, user_id),
                            "progress": read_crawl_progress(r, crawl_job_id),
                        }
                    ),
                )

                # Check completion
                maybe_complete_crawl(crawl_job_id, user_id, db, r)
            return

        # Only the job owner's own profile may be used, never another user's
        profile = None
        if user_id:
            profile = (
                db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            )

        user_language = getattr(profile, "language", "de") if profile else "de"

        if profile:
            cv_text = format_cv_for_prompt(profile.cv_data)
            spoken = getattr(profile, "spoken_languages", None) or []
            lang_part = f"\nSpoken Languages: {', '.join(spoken)}" if spoken else ""
            profile_str = (
                f"Rolle: {profile.role}, Skills: {profile.skills}{lang_part}\nDetails:\n{cv_text}"
            )
        else:
            logger.warning("No user profile found. Using default fallback profile.")
            profile_str = "Python Dev"

        logger.info(f"Sending analysis request to LLM for Job {job_id}...")
        client, model = get_client_and_model("job_analysis", db)
        data = analyze_job(
            job_title=job_data["title"],
            job_description=job_data["description"][:10000],
            profile_str=profile_str,
            user_language=user_language,
            model=model,
            client=client,
        )
        logger.info(
            f"LLM analysis completed for Job {job_id}. Score: {data.get('score')}"
        )

        # Auto-archive jobs whose score is below the user's matching threshold.
        # Only applies to newly analyzed jobs, never to manual re-analysis.
        threshold = getattr(profile, "match_threshold", 0) or 0
        score_val = float(data.get("score", 0))
        auto_archive = (
            not (existing_job and force_reanalyze)
            and threshold > 0
            and score_val < threshold
        )
        if auto_archive:
            logger.info(
                f"Job {job_id} auto-archived (score {score_val} < threshold {threshold})"
            )

        job_url = job_data.get("url")

        if existing_job and force_reanalyze:
            # The LLM call took a while: re-read the row so a user edit committed meanwhile is seen and kept.
            db.refresh(existing_job, with_for_update=True)
            existing_job.match_score = float(data.get("score", 0))
            existing_job.reasoning = data.get("reasoning", "")
            apply_posting_details(existing_job, data)
            db.commit()
            db.refresh(existing_job)
            db_job = existing_job
            logger.info(f"Job {job_id} re-analyzed and updated in database.")
        else:
            db_job = JobEntry(
                id=job_data["id"],
                title=job_data["title"],
                company=job_data["company"],
                description=job_data["description"],
                match_score=float(data.get("score", 0)),
                url=job_url,
                reasoning=data.get("reasoning", ""),
                application_draft=None,
                status="OPEN",
                user_id=user_id,
                platform_id=job_data.get("platform_id"),
                is_archived=auto_archive,
                archive_reason=ArchiveReason.THRESHOLD.value if auto_archive else None,
            )
            apply_posting_details(db_job, data)
            db.add(db_job)
            db.commit()
            logger.info(f"Job {job_id} saved to database.")

        event_type = "job_updated" if (existing_job and force_reanalyze) else "new_job"
        payload = json.dumps(
            {
                "type": event_type,
                "user_id": user_id,
                "crawl_job_id": crawl_job_id,
                "job": {
                    "id": db_job.id,
                    "title": db_job.title,
                    "company": db_job.company,
                    "description": db_job.description,
                    "match_score": db_job.match_score,
                    "reasoning": db_job.reasoning,
                    "url": db_job.url,
                    "status": db_job.status,
                    "is_archived": db_job.is_archived,
                    "created_at": (
                        iso_utc(db_job.created_at)
                    ),
                    "user_id": user_id,
                },
            }
        )

        r.publish("job_updates", payload)
        logger.info(f" WebSocket Event '{event_type}' published for {db_job.title}")

        # Increment jobs_saved counter
        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            touch_crawl_progress(r, crawl_job_id)
            jobs_saved = int(r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1))
            if not auto_archive:
                r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_matched", 1)

            # Notify that this specific job analysis is finished
            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "job_analysis_finished",
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "job_title": job_title,
                        "jobs_saved": jobs_saved,
                        "progress": read_crawl_progress(r, crawl_job_id),
                    }
                ),
            )

        # --- NOTIFICATION LOGIC ---
        # Auto-archived jobs (below matching threshold) never trigger notifications.
        try:
            if db_job.platform_id and not auto_archive:
                platform = (
                    db.query(JobPlatform)
                    .filter(JobPlatform.id == db_job.platform_id)
                    .first()
                )
                if (
                    platform
                    and platform.is_notification_enabled
                    and not db_job.notification_sent
                    and notify_match(db, r, db_job, platform, crawl_job_id)
                ):
                    db_job.notification_sent = True
                    db.commit()
        except Exception as notif_e:
            logger.error(f"Error in notification logic: {type(notif_e).__name__}", exc_info=notif_e)
        # --------------------------

        # Handle crawl job completion
        if crawl_job_id:
            maybe_complete_crawl(crawl_job_id, user_id, db, r)

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ) as e:
        logger.error(f"OpenRouter API error in analyze_job_task for Job {job_id}: {e}")
        db.rollback()
        if crawl_job_id:
            # Direct call: the worker has no session cookie for the scraper's /fail-crawl endpoint.
            fail_crawl_job(r, crawl_job_id, user_id, failure=AI_FAILURE)
    except Exception as e:
        logger.error(f"Analyze Error for Job {job_id}: {e}", exc_info=True)
        db.rollback()
        if crawl_job_id:
            # Direct call: the worker has no session cookie for the scraper's /fail-crawl endpoint.
            fail_crawl_job(r, crawl_job_id, user_id, failure=INTERNAL_FAILURE)
    finally:
        db.close()


@celery_app.task(name="ai.save_job_basic")
def save_job_basic_task(job_data):
    """Save a job to DB without AI analysis (used for initial platform run)."""
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    crawl_job_id = job_data.get("crawl_job_id")

    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))
    if _crawl_stopped(r, crawl_job_id):
        logger.info(f"[TASK] Crawl job {crawl_job_id} cancelled — skipping basic save for {job_id}")
        return
    db = SessionLocal()

    try:
        if crawl_job_id:
            touch_crawl_progress(r, crawl_job_id)
            analysis_completed = int(
                r.hincrby(f"crawl_job:{crawl_job_id}", "analysis_completed", 1)
            )
            r.lpush(f"crawl_job:{crawl_job_id}:all_job_titles", job_title)
            r.publish(
                "job_updates",
                json.dumps({
                    "type": "job_analysis_started",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "analysis_completed": analysis_completed,
                    "progress": read_crawl_progress(r, crawl_job_id),
                }),
            )

        if db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first():
            logger.info(f"Job {job_id} already exists. Skipping basic save.")
            if crawl_job_id:
                touch_crawl_progress(r, crawl_job_id)
                jobs_skipped = int(
                    r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_skipped", 1)
                )
                r.publish(
                    "job_updates",
                    json.dumps({
                        "type": "job_skipped",
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "job_title": job_title,
                        "jobs_skipped": jobs_skipped,
                        "progress": read_crawl_progress(r, crawl_job_id),
                    }),
                )
                maybe_complete_crawl(crawl_job_id, user_id, db, r)
            return

        job_url = job_data.get("url")

        db_job = JobEntry(
            id=job_data["id"],
            title=job_data["title"],
            company=job_data["company"],
            description=job_data["description"],
            match_score=0.0,
            url=job_url,
            reasoning="",
            application_draft=None,
            status="OPEN",
            user_id=user_id,
            platform_id=job_data.get("platform_id"),
        )
        db.add(db_job)
        db.commit()
        logger.info(f"Job {job_id} saved (no AI analysis) to database.")

        r.publish(
            "job_updates",
            json.dumps({
                "type": "new_job",
                "user_id": user_id,
                "crawl_job_id": crawl_job_id,
                "job": {
                    "id": db_job.id,
                    "title": db_job.title,
                    "company": db_job.company,
                    "description": db_job.description,
                    "match_score": 0.0,
                    "reasoning": "",
                    "url": db_job.url,
                    "status": "OPEN",
                    "created_at": (
                        iso_utc(db_job.created_at)
                    ),
                    "user_id": user_id,
                },
            }),
        )

        if crawl_job_id:
            touch_crawl_progress(r, crawl_job_id)
            jobs_saved = int(
                r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1)
            )
            r.publish(
                "job_updates",
                json.dumps({
                    "type": "job_analysis_finished",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "job_title": job_title,
                    "jobs_saved": jobs_saved,
                    "progress": read_crawl_progress(r, crawl_job_id),
                }),
            )
            maybe_complete_crawl(crawl_job_id, user_id, db, r)

    except Exception as e:
        logger.error(f"Error in save_job_basic_task for {job_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
