"""Celery tasks: analyze a scraped job (LLM scoring) and the no-AI basic save."""

import os
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

import redis
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, JobPlatform, User
from intelligence.service import get_client_and_model, format_cv_for_prompt, analyze_job

from workers.notifications.push import send_notification
from workers.notifications.email import (
    _send_via_resend_batch,
    _send_via_mailjet_batch,
    _send_via_smtp_batch,
)
from workers.tasks.crawl_status import maybe_complete_crawl

logger = get_logger(__name__)


@celery_app.task(name="ai.analyze_job")
def analyze_job_task(job_data):
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    logger.info(
        f"[TASK] Starting Job Analysis for ID: {job_id}, Title: {job_title}, User: {user_id}"
    )

    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    # Bail out immediately if the crawl job was cancelled.
    # Check the dedicated cancellation marker (resurrection-safe) as well as the
    # main key, so a job cancelled mid-pipeline never gets analyzed or notified.
    crawl_job_id = job_data.get("crawl_job_id")
    if crawl_job_id and (
        r.exists(f"crawl_job:{crawl_job_id}:cancelled")
        or not r.exists(f"crawl_job:{crawl_job_id}")
    ):
        logger.info(f"[TASK] Crawl job {crawl_job_id} cancelled — skipping analysis for {job_id}")
        return

    # Notify frontend that analysis is starting
    crawl_job_id = job_data.get("crawl_job_id")
    if crawl_job_id:
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
                        }
                    ),
                )

                # Check completion
                maybe_complete_crawl(crawl_job_id, user_id, db, r)
            return

        # Determine profile to use (User Specific or Admin/Default)
        profile = None
        if user_id:
            profile = (
                db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            )

        # Fallback to Admin (ID=1) or default if no user speciifed
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

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
        company_domain = None
        if job_url:
            try:
                parsed = urlparse(job_url)
                company_domain = parsed.netloc.removeprefix("www.")
            except Exception:
                pass

        if existing_job and force_reanalyze:
            existing_job.match_score = float(data.get("score", 0))
            existing_job.reasoning = data.get("reasoning", "")
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
                company_domain=company_domain,
                is_archived=auto_archive,
            )
            db.add(db_job)
            db.commit()
            logger.info(f"Job {job_id} saved to database.")

        event_type = "job_updated" if (existing_job and force_reanalyze) else "new_job"
        payload = json.dumps(
            {
                "type": event_type,
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
                        db_job.created_at.isoformat() if db_job.created_at else None
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
            jobs_saved = int(r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1))

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
                ):
                    settings_profile = (
                        db.query(UserProfile)
                        .filter(UserProfile.user_id == user_id)
                        .first()
                    )

                    if settings_profile:
                        platform_adapters = [
                            a.upper() for a in (platform.notification_adapters or [])
                        ]
                        non_batch = [a for a in platform_adapters if a not in ("RESEND", "MAILJET", "SMTP")]
                        has_resend = "RESEND" in platform_adapters
                        has_mailjet = "MAILJET" in platform_adapters
                        has_smtp = "SMTP" in platform_adapters

                        sent = False
                        if non_batch:
                            sent = send_notification(
                                db_job,
                                settings_profile,
                                db,
                                adapters=non_batch,
                                platform=platform,
                            )

                        # Resend: queue per-job for batch digest at crawl completion
                        if has_resend:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_resend", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_resend", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_resend_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        # Mailjet: same batch pattern
                        if has_mailjet:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_mailjet", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_mailjet", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_mailjet_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        # SMTP: same batch pattern
                        if has_smtp:
                            if crawl_job_id:
                                r.rpush(f"crawl:{crawl_job_id}:pending_smtp", db_job.id)
                                r.expire(f"crawl:{crawl_job_id}:pending_smtp", 3600)
                            else:
                                user_obj = db.query(User).filter(User.id == user_id).first()
                                uname = user_obj.username if user_obj else "Candidate"
                                sent = _send_via_smtp_batch(
                                    [db_job], settings_profile, platform=platform, userName=uname
                                ) or sent

                        if sent or has_resend or has_mailjet or has_smtp:
                            db_job.notification_sent = True
                            db.commit()
        except Exception as notif_e:
            logger.error(f"Error in notification logic: {notif_e}")
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
        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            try:
                import requests as _req

                SCRAPER_URL = os.getenv(
                    "SCRAPER_SERVICE_URL", "http://127.0.0.1:8081"
                )
                _req.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "error_message": str(e),
                    },
                    timeout=5,
                )
            except Exception as cleanup_e:
                logger.error(f"Failed to trigger cleanup: {cleanup_e}")
    except Exception as e:
        logger.error(f"Analyze Error for Job {job_id}: {e}", exc_info=True)
        db.rollback()

        crawl_job_id = job_data.get("crawl_job_id")
        if crawl_job_id:
            try:
                import requests

                SCRAPER_URL = os.getenv(
                    "SCRAPER_SERVICE_URL", "http://127.0.0.1:8081"
                )
                requests.post(
                    f"{SCRAPER_URL}/fail-crawl",
                    json={
                        "job_id": crawl_job_id,
                        "user_id": user_id,
                        "error_message": str(e),
                    },
                    timeout=5,
                )
            except Exception as cleanup_e:
                logger.error(
                    f"Failed to trigger cleanup for job {crawl_job_id}: {cleanup_e}"
                )
    finally:
        db.close()


@celery_app.task(name="ai.save_job_basic")
def save_job_basic_task(job_data):
    """Save a job to DB without AI analysis (used for initial platform run)."""
    job_id = job_data.get("id", "unknown")
    job_title = job_data.get("title", "unknown")
    user_id = job_data.get("user_id")
    crawl_job_id = job_data.get("crawl_job_id")

    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    try:
        if crawl_job_id:
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
                }),
            )

        if db.query(JobEntry).filter(JobEntry.id == job_data["id"]).first():
            logger.info(f"Job {job_id} already exists. Skipping basic save.")
            if crawl_job_id:
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
                    }),
                )
                maybe_complete_crawl(crawl_job_id, user_id, db, r)
            return

        job_url = job_data.get("url")
        company_domain = None
        if job_url:
            try:
                parsed = urlparse(job_url)
                company_domain = parsed.netloc.removeprefix("www.")
            except Exception:
                pass

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
            company_domain=company_domain,
        )
        db.add(db_job)
        db.commit()
        logger.info(f"Job {job_id} saved (no AI analysis) to database.")

        r.publish(
            "job_updates",
            json.dumps({
                "type": "new_job",
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
                        db_job.created_at.isoformat() if db_job.created_at else None
                    ),
                    "user_id": user_id,
                },
            }),
        )

        if crawl_job_id:
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
                }),
            )
            maybe_complete_crawl(crawl_job_id, user_id, db, r)

    except Exception as e:
        logger.error(f"Error in save_job_basic_task for {job_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
