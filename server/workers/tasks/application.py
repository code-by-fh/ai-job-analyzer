"""Celery task: generate (or refine) a cover letter draft for a job."""

import os
import json
import datetime

import redis
from celery.exceptions import SoftTimeLimitExceeded
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)

from core.celery_config import celery_app
from core.job_status import GenerationOutcome, finish_generation, mark_generation_running
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, User
from intelligence.service import get_client_and_model, format_cv_for_prompt, generate_application
from services.storage import get_storage_service
from services.template_access import TemplateRef, find_usable_template
from services.template_filler import TemplateRejected, fill_template
from workers.tasks.time_limits import (
    GENERATION_FAILED_ERROR,
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SOFT_TIME_LIMIT_SECONDS,
    GENERATION_TIMEOUT_ERROR,
)
from services.document_renderer import render_cover_letter_pdf, render_cover_letter_html, html_to_pdf
from services.job_documents import store_generated_document
from workers.tasks.generation_failure import TaskContext, fail_generation, record_failure


def _resolve_letter_template_html(db, template_ref, user_id):
    """Return the HTML of a cover-letter template the user may use, or None for the file-based template."""
    template = find_usable_template(db, user_id, TemplateRef("COVER_LETTER", template_ref))
    return template.html if template else None


def _safe_name(value):
    cleaned = "".join(c for c in (value or "Job") if c.isalnum() or c in " -_")
    return cleaned.replace(" ", "_") or "Job"


logger = get_logger(__name__)
OPENROUTER_ERROR = "OpenRouter model not found (404)"


@celery_app.task(
    name="ai.generate_application",
    soft_time_limit=GENERATION_SOFT_TIME_LIMIT_SECONDS,
    time_limit=GENERATION_HARD_TIME_LIMIT_SECONDS,
)
def generate_application_task(job_id, user_id=None, improvement_notes=None):
    logger.info(
        f"[TASK] Generating application letter for Job ID: {job_id}, User ID: {user_id}"
    )
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))

    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job ID {job_id} not found in DB.")
            return

        mark_generation_running(db, job)

        target_user_id = user_id if user_id else job.user_id
        profile = None
        if target_user_id:
            profile = (
                db.query(UserProfile)
                .filter(UserProfile.user_id == target_user_id)
                .first()
            )

        if not profile:
            error_msg = "Profile incomplete. Please add your resume in the settings."
            logger.error(f"Application generation failed: {error_msg}")
            if not fail_generation(TaskContext(db, r), job, error_msg):
                return

            r.publish(
                "job_updates",
                json.dumps({"type": "global_error", "message": error_msg, "user_id": job.user_id}),
            )
            return

        logger.info(f"Data loaded. Job: {job.title}, User: {profile.role}")

        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        user_language = getattr(profile, "language", "de") if profile else "de"
        cv_text = format_cv_for_prompt(profile.cv_data)

        logger.info("Sending request to AI for cover letter...")
        client, model = get_client_and_model("cover_letter", db)
        existing_draft = job.application_draft if improvement_notes else None

        application_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=job.description[:10000],
            profile_role=profile.role,
            cv_text=cv_text,
            user_language=user_language,
            model=model,
            client=client,
            improvement_notes=improvement_notes,
            existing_draft=existing_draft,
            candidate_name=candidate_name,
            candidate_location=profile.location or "",
            candidate_skills=profile.skills or "",
            candidate_languages=profile.spoken_languages or [],
            candidate_preferences=profile.preferences or "",
        )
        logger.info("Received AI response for cover letter.")

        db.refresh(job)
        if job.status != "GENERATING":
            logger.info(f"Job {job_id} cancelled, discarding result.")
            return

        job.application_draft = application_text

        # --- Render cover letter PDF from template ---
        letter_template_html = _resolve_letter_template_html(db, profile.cover_letter_template, target_user_id)
        letter_data = {
            "sender_name": candidate_name,
            "company": job.company or "",
            "body": application_text,
            "location": profile.location or "",
            "date": datetime.date.today().strftime("%d.%m.%Y"),
            "role": profile.role or "",
            "skills": profile.skills or "",
        }
        if letter_template_html:
            job.cover_letter_html = fill_template(letter_template_html, letter_data)
            try:
                letter_pdf = html_to_pdf(job.cover_letter_html)
            except OSError as e:
                logger.warning(f"html_to_pdf failed, falling back to classic renderer: {e}")
                letter_pdf = render_cover_letter_pdf(
                    letter_markdown=application_text,
                    template_key="classic",
                    sender_name=candidate_name,
                    company=job.company or "",
                )
        else:
            job.cover_letter_html = render_cover_letter_html(
                letter_markdown=application_text,
                template_key=profile.cover_letter_template or "classic",
                sender_name=candidate_name,
                company=job.company or "",
            )
            letter_pdf = render_cover_letter_pdf(
                letter_markdown=application_text,
                template_key=profile.cover_letter_template or "classic",
                sender_name=candidate_name,
                company=job.company or "",
            )

        storage = get_storage_service(profile) if profile.active_storage_service != "NONE" else None
        store_generated_document(
            db, job.id, target_user_id, letter_pdf,
            original_filename=f"Anschreiben_{_safe_name(job.company)}.pdf",
            mime_type="application/pdf",
            kind="GENERATED_LETTER",
            storage=storage,
        )

        status = finish_generation(job, GenerationOutcome.COMPLETED)
        db.commit()
        logger.info(f"Application letter for job {job_id} saved to DB.")
        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_update",
                    "job_id": job.id,
                    "status": status,
                    "application_draft": job.application_draft,
                    "cover_letter_generated": True,
                    "user_id": job.user_id,
                }
            ),
        )
        logger.info(f" WebSocket Event 'job_update' für {job.id} gesendet.")

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
        record_failure(TaskContext(db, r), job_id, OPENROUTER_ERROR)
    except SoftTimeLimitExceeded:
        logger.error(f"Generation for job {job_id} hit the time limit", exc_info=True)
        record_failure(TaskContext(db, r), job_id, GENERATION_TIMEOUT_ERROR)
    except TemplateRejected as e:
        logger.error(f"Generation failed for job {job_id}: {e}", exc_info=True)
        record_failure(TaskContext(db, r), job_id, str(e))
    except Exception as e:
        logger.error(f"Generation failed for job {job_id}: {e}", exc_info=True)
        record_failure(TaskContext(db, r), job_id, GENERATION_FAILED_ERROR)
    finally:
        db.close()
