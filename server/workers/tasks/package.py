"""Celery task: generate the full application package for a job."""

import os
import json
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import redis
from celery.exceptions import SoftTimeLimitExceeded

from core.celery_config import celery_app
from core.job_status import GenerationOutcome, finish_generation, generation_cancelled, mark_generation_running
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, ProfileDocument, User
from intelligence.service import (
    get_client_and_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
)
from services.document_renderer import render_cv_html, render_cover_letter_html
from services.job_documents import add_job_document, delete_attached_documents, delete_generated_pdf
from services.template_access import TemplateRef, find_usable_template
from services.template_filler import TemplateRejected, fill_template, render_jinja2_template
from workers.tasks.time_limits import (
    GENERATION_FAILED_ERROR,
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SOFT_TIME_LIMIT_SECONDS,
    GENERATION_TIMEOUT_ERROR,
)
from workers.tasks.generation_failure import TaskContext, fail_generation, record_failure

logger = get_logger(__name__)

_ATTACH_KIND = {"REFERENCE": "ATTACHED_REFERENCE", "CERTIFICATE": "ATTACHED_CERT"}


def _build_cv(
    cv_data_raw: dict,
    cv_template_html: str | None,
    cv_template_key: str | None,
    candidate_name: str,
    role: str,
    skills: str,
    location: str,
    spoken_languages: list,
    job_title: str,
    job_description: str,
    language: str,
    cv_client,
    cv_model: str,
    cv_notes: str = "",
) -> tuple[str, dict]:
    """Return (cv_html, cv_data). Pure computation — no DB writes; the PDF is rendered on download.

    Always calls generate_tailored_cv so data is tailored to the job regardless
    of which template is used. If a user template (Jinja2 HTML) is selected it
    is rendered deterministically; otherwise the classic file-based template is used.
    """
    cv_data = generate_tailored_cv(
        cv_data=cv_data_raw,
        job_title=job_title,
        job_description=job_description[:10000],
        candidate_name=candidate_name,
        candidate_role=role,
        language=language,
        model=cv_model,
        skills=skills,
        spoken_languages=spoken_languages,
        location=location,
        client=cv_client,
        cv_notes=cv_notes,
    )

    if cv_template_html:
        cv_html = render_jinja2_template(cv_template_html, cv_data)
    else:
        cv_html = render_cv_html(cv_data, template_key=cv_template_key or "classic")
    return cv_html, cv_data


def _build_letter(
    cv_data_raw: dict,
    letter_template_html: str | None,
    letter_template_key: str | None,
    candidate_name: str,
    role: str,
    skills: str,
    location: str,
    spoken_languages: list,
    preferences: str,
    job_title: str,
    job_company: str,
    job_description: str,
    language: str,
    letter_client,
    letter_model: str,
) -> tuple[str, str]:
    """Return (letter_text, letter_html). Runs AI + HTML render, no DB writes."""
    letter_text = generate_application(
        job_title=job_title,
        job_company=job_company,
        job_description=job_description[:10000],
        profile_role=role,
        cv_text=format_cv_for_prompt(cv_data_raw),
        user_language=language,
        model=letter_model,
        client=letter_client,
        candidate_name=candidate_name,
        candidate_location=location,
        candidate_skills=skills,
        candidate_languages=spoken_languages,
        candidate_preferences=preferences,
    )
    if letter_template_html:
        letter_data = {
            "sender_name": candidate_name,
            "company": job_company or "",
            "body": letter_text,
            "location": location,
            "date": datetime.date.today().strftime("%d.%m.%Y"),
            "role": role,
            "skills": skills,
        }
        letter_html = fill_template(letter_template_html, letter_data)
    else:
        letter_html = render_cover_letter_html(
            letter_markdown=letter_text,
            template_key=letter_template_key or "classic",
            sender_name=candidate_name,
            company=job_company or "",
        )
    return letter_text, letter_html


def _publish(r, job, status, **extra):
    payload = {"type": "job_update", "job_id": job.id, "status": status, "user_id": job.user_id}
    payload.update(extra)
    r.publish("job_updates", json.dumps(payload))


def _resolve_template_html(db, template_ref: str | None, doc_type: str, user_id: int) -> str | None:
    """Return the HTML of a DocumentTemplate the user may use, or None to use the file-based template.

    A file key ("classic"), an unknown id and another user's template all fall back to the file path.
    """
    template = find_usable_template(db, user_id, TemplateRef(doc_type, template_ref))
    return template.html if template else None


def _attach_profile_documents(db, job, user_id) -> None:
    """Replace the job's attached documents with the user's profile documents.
    Only a non-empty attach set replaces the old one, so a profile without
    copyable files never wipes earlier attachments. No commit: the caller's
    final commit makes delete and inserts atomic."""
    # A row without stored bytes has nothing to copy.
    copyable = [pd for pd in db.query(ProfileDocument).filter(
        ProfileDocument.user_id == user_id).all() if pd.content is not None]
    if not copyable:
        return
    delete_attached_documents(db, job.id)
    for pd in copyable:
        add_job_document(
            db, job.id, user_id, pd.content, pd.original_filename,
            pd.mime_type or "application/octet-stream",
            _ATTACH_KIND.get(pd.doc_type, "ATTACHED_CERT"),
        )


@celery_app.task(
    name="ai.generate_application_package",
    soft_time_limit=GENERATION_SOFT_TIME_LIMIT_SECONDS,
    time_limit=GENERATION_HARD_TIME_LIMIT_SECONDS,
)
def generate_application_package_task(job_id, user_id=None, include_profile_documents=True, generate_cv=True, generate_letter=True):
    logger.info(f"[TASK] Generating application package for Job {job_id}, User {user_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        mark_generation_running(db, job)

        target_user_id = user_id or job.user_id
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == target_user_id).first()
            if target_user_id else None
        )

        if not profile or not profile.cv_data:
            fail_generation(TaskContext(db, r), job, "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen.")
            return

        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        language = getattr(profile, "language", "de") or "de"

        # --- 1+2. CV and cover letter — generated in parallel ---
        cv_client, cv_model = get_client_and_model("cv_tailoring", db)
        letter_client, letter_model = get_client_and_model("cover_letter", db)

        cv_template_html = _resolve_template_html(db, profile.cv_template, "CV", target_user_id)
        cv_notes = getattr(job, "cv_draft", "") or ""

        letter_template_html = _resolve_template_html(db, profile.cover_letter_template, "COVER_LETTER", target_user_id)

        futures = {}
        # No `with`: its exit waits for the workers and would swallow a soft time limit. A
        # stuck worker is bounded by the render child's own timeout and the hard time limit.
        pool = ThreadPoolExecutor(max_workers=2)
        try:
            if generate_cv:
                futures["cv"] = pool.submit(
                    _build_cv,
                    profile.cv_data, cv_template_html, profile.cv_template,
                    candidate_name, profile.role or "", profile.skills or "",
                    profile.location or "", profile.spoken_languages or [],
                    job.title or "", job.description or "", language,
                    cv_client, cv_model,
                    cv_notes,
                )
            if generate_letter:
                futures["letter"] = pool.submit(
                    _build_letter,
                    profile.cv_data, letter_template_html, profile.cover_letter_template,
                    candidate_name, profile.role or "", profile.skills or "",
                    profile.location or "", profile.spoken_languages or [],
                    profile.preferences or "",
                    job.title or "", job.company or "", job.description or "",
                    language, letter_client, letter_model,
                )
            cv_result = futures["cv"].result() if "cv" in futures else None
            letter_result = futures["letter"].result() if "letter" in futures else None
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        if generation_cancelled(db, job):
            logger.info(f"Job {job_id} is no longer GENERATING; discarding the generated package.")
            return

        if cv_result:
            job.cv_html, _ = cv_result
            delete_generated_pdf(db, job.id, "cv")
        if letter_result:
            job.application_draft, job.cover_letter_html = letter_result
            delete_generated_pdf(db, job.id, "cover_letter")

        # --- 3. Profile documents (optional, whole set) ---
        if include_profile_documents:
            _attach_profile_documents(db, job, target_user_id)

        status = finish_generation(job, GenerationOutcome.COMPLETED)
        db.commit()
        _publish(r, job, status, application_draft=job.application_draft)
        logger.info(f"Application package for job {job_id} complete.")

    except SoftTimeLimitExceeded:
        logger.error(f"Package generation for job {job_id} hit the time limit", exc_info=True)
        record_failure(TaskContext(db, r), job_id, GENERATION_TIMEOUT_ERROR)
    except TemplateRejected as e:
        logger.error(f"Package generation failed for job {job_id}: {e}", exc_info=True)
        record_failure(TaskContext(db, r), job_id, str(e))
    except Exception as e:
        logger.error(f"Package generation failed for job {job_id}: {e}", exc_info=True)
        record_failure(TaskContext(db, r), job_id, GENERATION_FAILED_ERROR)
    finally:
        db.close()
