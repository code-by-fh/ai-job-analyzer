"""Celery task: generate the full application package for a job."""

import os
import json
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import redis

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, ProfileDocument, User
from intelligence.service import (
    get_client_and_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
    fill_html_cv_with_ai,
    tailor_master_cv_for_job,
)
from services.document_renderer import render_cv_pdf, render_cv_html, render_cover_letter_pdf, render_cover_letter_html, html_to_pdf
from services.job_documents import store_generated_document
from services.storage import get_storage_service
from services.template_filler import fill_template
from database.core import DocumentTemplate

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
    is_master_cv: bool = False,
) -> tuple[str, bytes, dict]:
    """Return (cv_html, cv_pdf_bytes, cv_data). Pure computation — no DB writes."""
    if cv_template_html:
        cv_data = dict(cv_data_raw or {})
        cv_data.setdefault("experience", [])
        cv_data.setdefault("projects", [])
        cv_data.setdefault("education", "")
        cv_data["name"] = candidate_name
        cv_data["role"] = role
        cv_data["skills"] = skills
        cv_data["location"] = location
        if spoken_languages:
            cv_data["spoken_languages"] = spoken_languages

        if is_master_cv:
            # Master CV is already filled — tailor it for this specific job
            cv_html = tailor_master_cv_for_job(
                master_cv_html=cv_template_html,
                job_title=job_title,
                job_description=job_description[:6000],
                language=language,
                cv_notes=cv_notes,
                model=cv_model,
                client=cv_client,
            )
        else:
            # Blank DocumentTemplate → AI fills with profile data + job context
            cv_html = fill_html_cv_with_ai(
                cv_template_html, cv_data, language,
                job_title=job_title,
                job_description=job_description[:6000],
                cv_notes=cv_notes,
                model=cv_model, client=cv_client,
            )
    else:
        # No template → JSON tailoring + Jinja2 classic renderer
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
        )
        cv_html = render_cv_html(cv_data, template_key=cv_template_key or "classic")

    try:
        cv_pdf = html_to_pdf(cv_html)
    except OSError as e:
        logger.warning(f"html_to_pdf failed for CV, falling back to classic renderer: {e}")
        cv_pdf = render_cv_pdf(cv_data, template_key="classic")
    return cv_html, cv_pdf, cv_data


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
) -> tuple[str, str, bytes]:
    """Return (letter_text, letter_html, letter_pdf_bytes). Runs AI + render, no DB writes."""
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
        try:
            letter_pdf = html_to_pdf(letter_html)
        except OSError as e:
            logger.warning(f"html_to_pdf failed for cover letter, falling back: {e}")
            letter_pdf = render_cover_letter_pdf(
                letter_markdown=letter_text, template_key="classic",
                sender_name=candidate_name, company=job_company or "",
            )
    else:
        letter_html = render_cover_letter_html(
            letter_markdown=letter_text,
            template_key=letter_template_key or "classic",
            sender_name=candidate_name,
            company=job_company or "",
        )
        letter_pdf = render_cover_letter_pdf(
            letter_markdown=letter_text,
            template_key=letter_template_key or "classic",
            sender_name=candidate_name,
            company=job_company or "",
        )
    return letter_text, letter_html, letter_pdf


def _publish(r, job, status, **extra):
    payload = {"type": "job_update", "job_id": job.id, "status": status, "user_id": job.user_id}
    payload.update(extra)
    r.publish("job_updates", json.dumps(payload))


def _resolve_template_html(db, template_ref: str | None, doc_type: str) -> str | None:
    """Return the HTML for a template reference, or None to use the legacy path.

    A numeric string → look up DocumentTemplate by id.
    Non-numeric or None → legacy file-based path (return None).
    """
    if not template_ref:
        return None
    if not template_ref.isdigit():
        return None  # "classic" or other file-key → legacy
    t = db.query(DocumentTemplate).filter(
        DocumentTemplate.id == int(template_ref),
        DocumentTemplate.doc_type == doc_type,
    ).first()
    return t.html if t else None


@celery_app.task(name="ai.generate_application_package")
def generate_application_package_task(job_id, user_id=None, include_profile_documents=True):
    logger.info(f"[TASK] Generating application package for Job {job_id}, User {user_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        target_user_id = user_id or job.user_id
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == target_user_id).first()
            if target_user_id else None
        )
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if not profile or not profile.cv_data:
            msg = "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen."
            job.status = "FAILED"
            job.generation_error = msg
            db.commit()
            _publish(r, job, "FAILED", error=msg)
            return

        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        language = getattr(profile, "language", "de") or "de"
        storage = get_storage_service(profile) if profile.active_storage_service != "NONE" else None

        # --- 1+2. CV and cover letter — generated in parallel ---
        cv_client, cv_model = get_client_and_model("cv_tailoring", db)
        letter_client, letter_model = get_client_and_model("cover_letter", db)

        is_master_cv = False
        if profile.master_cv_template_id:
            master_t = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == profile.master_cv_template_id,
                DocumentTemplate.doc_type == "MASTER_CV",
            ).first()
            if master_t:
                cv_template_html = master_t.html
                is_master_cv = True
            else:
                cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
        else:
            cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
        cv_notes = getattr(job, "cv_draft", "") or ""

        letter_template_html = _resolve_template_html(db, profile.cover_letter_template, "COVER_LETTER")

        with ThreadPoolExecutor(max_workers=2) as pool:
            cv_future = pool.submit(
                _build_cv,
                profile.cv_data, cv_template_html, profile.cv_template,
                candidate_name, profile.role or "", profile.skills or "",
                profile.location or "", profile.spoken_languages or [],
                job.title or "", job.description or "", language,
                cv_client, cv_model,
                cv_notes,
                is_master_cv,
            )
            letter_future = pool.submit(
                _build_letter,
                profile.cv_data, letter_template_html, profile.cover_letter_template,
                candidate_name, profile.role or "", profile.skills or "",
                profile.location or "", profile.spoken_languages or [],
                profile.preferences or "",
                job.title or "", job.company or "", job.description or "",
                language, letter_client, letter_model,
            )
            cv_html, cv_pdf, cv_data = cv_future.result()
            letter_text, letter_html, letter_pdf = letter_future.result()

        job.cv_html = cv_html
        job.application_draft = letter_text
        job.cover_letter_html = letter_html

        store_generated_document(
            db, job.id, target_user_id, cv_pdf,
            original_filename=f"Lebenslauf_{_safe(job.company)}.pdf",
            mime_type="application/pdf", kind="GENERATED_CV", storage=storage,
        )
        store_generated_document(
            db, job.id, target_user_id, letter_pdf,
            original_filename=f"Anschreiben_{_safe(job.company)}.pdf",
            mime_type="application/pdf", kind="GENERATED_LETTER", storage=storage,
        )

        # --- 3. Profile documents (optional, whole set) ---
        if include_profile_documents:
            pdocs = db.query(ProfileDocument).filter(
                ProfileDocument.user_id == target_user_id
            ).all()
            for pd in pdocs:
                if pd.content is None:
                    continue  # only DB-stored blobs can be copied for MVP
                store_generated_document(
                    db, job.id, target_user_id, pd.content,
                    original_filename=pd.original_filename,
                    mime_type=pd.mime_type or "application/octet-stream",
                    kind=_ATTACH_KIND.get(pd.doc_type, "ATTACHED_CERT"),
                    storage=storage,
                )

        job.status = "DRAFTED"
        db.commit()
        _publish(r, job, "DRAFTED", application_draft=job.application_draft)
        logger.info(f"Application package for job {job_id} complete.")

    except Exception as e:
        logger.error(f"Package generation failed for job {job_id}: {e}", exc_info=True)
        db.rollback()
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = str(e)
                db.commit()
                _publish(r, job, "FAILED", error=str(e))
        except Exception as db_e:
            logger.error(f"Failed to persist FAILED status: {db_e}")
    finally:
        db.close()



def _safe(value):
    cleaned = "".join(c for c in (value or "Job") if c.isalnum() or c in " -_")
    return cleaned.replace(" ", "_") or "Job"


@celery_app.task(name="ai.render_document_pdf")
def render_document_pdf_task(job_id: str, kind: str, user_id: int):
    """Re-render edited HTML for a job to PDF and replace the JobDocument."""
    logger.info(f"[TASK] render_document_pdf job={job_id} kind={kind} user={user_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    try:
        job = db.query(JobEntry).filter(
            JobEntry.id == job_id,
            JobEntry.user_id == user_id,
        ).first()
        if not job:
            logger.error(f"Job {job_id} not found for user {user_id}")
            return

        html = job.cv_html if kind == "cv" else job.cover_letter_html
        if not html:
            logger.error(f"No HTML stored for job {job_id} kind={kind}")
            return

        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        storage = (
            get_storage_service(profile)
            if profile and profile.active_storage_service != "NONE"
            else None
        )

        pdf = html_to_pdf(html)
        doc_kind = "GENERATED_CV" if kind == "cv" else "GENERATED_LETTER"
        prefix = "Lebenslauf" if kind == "cv" else "Anschreiben"
        store_generated_document(
            db, job_id, user_id, pdf,
            original_filename=f"{prefix}_{_safe(job.company)}.pdf",
            mime_type="application/pdf",
            kind=doc_kind,
            storage=storage,
        )
        db.commit()
        _publish(r, job, "DRAFTED", rendered_kind=kind)
        logger.info(f"render_document_pdf complete job={job_id} kind={kind}")
    except Exception as e:
        logger.error(f"render_document_pdf failed job={job_id}: {e}", exc_info=True)
        _publish(r, job, "FAILED", error=str(e))
    finally:
        db.close()
