"""Celery task: generate (or refine) a cover letter draft for a job."""

import os
import json
import datetime

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
from database.core import SessionLocal, JobEntry, UserProfile, User, DocumentTemplate
from intelligence.service import get_model, get_api_key, format_cv_for_prompt, generate_application
from services.storage import get_storage_service
from services.template_filler import fill_template
from services.document_renderer import render_cover_letter_pdf, html_to_pdf
from services.job_documents import store_generated_document


def _resolve_letter_template_html(db, template_ref):
    """Return HTML for a numeric template ID, or None for legacy path."""
    if not template_ref or not str(template_ref).isdigit():
        return None
    t = db.query(DocumentTemplate).filter(
        DocumentTemplate.id == int(template_ref),
        DocumentTemplate.doc_type == "COVER_LETTER",
    ).first()
    return t.html if t else None


def _safe_name(value):
    cleaned = "".join(c for c in (value or "Job") if c.isalnum() or c in " -_")
    return cleaned.replace(" ", "_") or "Job"


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

        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        user_language = getattr(profile, "language", "de") if profile else "de"
        cv_text = format_cv_for_prompt(profile.cv_data)

        logger.info("Sending request to AI for cover letter...")
        model = get_model(db)
        api_key = get_api_key(db)
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
        letter_template_html = _resolve_letter_template_html(db, profile.cover_letter_template)
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
