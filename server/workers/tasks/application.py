"""Celery task: generate (or refine) a cover letter draft for a job."""

import os
import json

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
from database.core import SessionLocal, JobEntry, UserProfile
from intelligence.service import get_model, get_api_key, format_cv_for_prompt, generate_application
from services.storage import get_storage_service

logger = get_logger(__name__)


@celery_app.task(name="ai.generate_application")
def generate_application_task(job_id, user_id=None, improvement_notes=None):
    logger.info(
        f"[TASK] Generating application letter for Job ID: {job_id}, User ID: {user_id}"
    )
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))

    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job ID {job_id} not found in DB.")
            return

        target_user_id = user_id if user_id else job.user_id
        profile = None
        if target_user_id:
            profile = (
                db.query(UserProfile)
                .filter(UserProfile.user_id == target_user_id)
                .first()
            )

        # Fallback
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if not profile:
            error_msg = "Profile incomplete. Please add your resume in the settings."
            logger.error(f"Application generation failed: {error_msg}")

            job.status = "FAILED"
            job.generation_error = error_msg
            db.commit()

            r.publish(
                "job_updates",
                json.dumps(
                    {
                        "type": "job_update",
                        "job_id": job.id,
                        "status": "FAILED",
                        "error": error_msg,
                        "user_id": job.user_id,
                    }
                ),
            )

            r.publish(
                "job_updates",
                json.dumps({"type": "global_error", "message": error_msg}),
            )
            return

        logger.info(f"Data loaded. Job: {job.title}, User: {profile.role}")

        user_language = getattr(profile, "language", "de") if profile else "de"
        cv_text = format_cv_for_prompt(profile.cv_data)

        logger.info(" Sende Anfrage an OpenAI für Anschreiben...")
        model = get_model(db)
        api_key = get_api_key(db)
        # When improvement notes are given, pass the existing draft so the AI
        # only applies the requested changes instead of rewriting from scratch.
        existing_draft = job.application_draft if improvement_notes else None

        application_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=job.description[:10000],
            profile_role=profile.role,
            cv_text=cv_text,
            user_language=user_language,
            model=model,
            api_key=api_key,
            improvement_notes=improvement_notes,
            existing_draft=existing_draft,
        )
        logger.info("Received AI response for application letter.")

        # Check if job was cancelled before saving
        db.refresh(job)
        if job.status != "GENERATING":
            logger.info(
                f"Job {job_id} was cancelled (status: {job.status}), discarding generated result."
            )
            return

        job.application_draft = application_text
        job.status = "DRAFTED"
        db.commit()
        logger.info(f"Application letter for job {job_id} saved to DB.")
        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_update",
                    "job_id": job.id,
                    "status": "DRAFTED",
                    "application_draft": job.application_draft,
                    "user_id": job.user_id,
                }
            ),
        )
        logger.info(f" WebSocket Event 'job_update' für {job.id} gesendet.")

        # --- AUTO-UPLOAD (External Storage) ---
        if profile and profile.active_storage_service != "NONE":
            storage = get_storage_service(profile)
            if storage:
                try:
                    import asyncio
                    filename = f"Anschreiben_{job.company.replace(' ', '_')}_{job.title.replace(' ', '_')}.txt"
                    # Using run_until_complete is tricky in worker threads,
                    # but for MVP we wrap the call if we are not in an loop
                    success = asyncio.run(storage.upload_file(
                        content=application_text,
                        filename=filename
                    ))
                    if success:
                        logger.info(f"Auto-Upload to {profile.active_storage_service} successful: {filename}")
                    else:
                        logger.warning(f"Auto-Upload to {profile.active_storage_service} failed")
                except Exception as upload_err:
                    logger.error(f"External storage upload error: {upload_err}")

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ) as e:
        logger.error(
            f"OpenRouter API error in generate_application_task for Job {job_id}: {e}"
        )
        db.rollback()
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = "OpenRouter model not found (404)"
                db.commit()
                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_update",
                            "job_id": job.id,
                            "status": "FAILED",
                            "error": "OpenRouter model not found (404)",
                            "user_id": job.user_id,
                        }
                    ),
                )
        except Exception as db_e:
            logger.error(f"Failed to save 404 error status: {db_e}")
    except Exception as e:
        logger.error(f"Generation failed for job {job_id}: {e}", exc_info=True)
        db.rollback()

        # Try to set status to FAILED in DB
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = str(e)
                db.commit()

                r.publish(
                    "job_updates",
                    json.dumps(
                        {
                            "type": "job_update",
                            "job_id": job.id,
                            "status": "FAILED",
                            "error": str(e),
                            "user_id": job.user_id,
                        }
                    ),
                )
        except Exception as db_e:
            logger.error(f"Failed to save error status to DB: {db_e}")
    finally:
        db.close()
