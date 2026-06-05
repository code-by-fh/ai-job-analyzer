"""Celery task: generate the full application package for a job (sequential)."""

import os
import json
import datetime

import redis

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, ProfileDocument, User
from intelligence.service import (
    get_model,
    get_api_key,
    get_ollama_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
)
from services.document_renderer import render_cv_pdf, render_cover_letter_pdf, html_to_pdf
from services.job_documents import store_generated_document
from services.storage import get_storage_service
from services.template_filler import fill_template
from database.core import DocumentTemplate

logger = get_logger(__name__)

_ATTACH_KIND = {"REFERENCE": "ATTACHED_REFERENCE", "CERTIFICATE": "ATTACHED_CERT"}


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
def generate_application_package_task(job_id, user_id=None, include_profile_documents=True, cv_notes=None):
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

        # --- 1. Tailored CV (Ollama, local) ---
        tailored = generate_tailored_cv(
            cv_data=profile.cv_data,
            job_title=job.title,
            job_description=(job.description or "")[:10000],
            candidate_name=candidate_name,
            candidate_role=profile.role,
            language=language,
            model=get_ollama_model(db),
            db=db,
            skills=profile.skills or "",
            spoken_languages=profile.spoken_languages or [],
            location=profile.location or "",
            cv_notes=cv_notes or "",
        )
        job.cv_draft = _cv_dict_to_markdown(tailored)
        cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
        if cv_template_html:
            job.cv_html = fill_template(cv_template_html, tailored)
            cv_pdf = html_to_pdf(job.cv_html)
        else:
            cv_pdf = render_cv_pdf(tailored, template_key=profile.cv_template or "classic")
        store_generated_document(
            db, job.id, target_user_id, cv_pdf,
            original_filename=f"Lebenslauf_{_safe(job.company)}.pdf",
            mime_type="application/pdf", kind="GENERATED_CV", storage=storage,
        )

        # --- 2. Cover letter (OpenRouter) ---
        letter_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=(job.description or "")[:10000],
            profile_role=profile.role,
            cv_text=format_cv_for_prompt(profile.cv_data),
            user_language=language,
            model=get_model(db),
            api_key=get_api_key(db),
            candidate_name=candidate_name,
            candidate_location=profile.location or "",
            candidate_skills=profile.skills or "",
            candidate_languages=profile.spoken_languages or [],
            candidate_preferences=profile.preferences or "",
        )
        job.application_draft = letter_text
        letter_template_html = _resolve_template_html(db, profile.cover_letter_template, "COVER_LETTER")
        if letter_template_html:
            letter_data = {
                "sender_name": candidate_name,
                "company": job.company or "",
                "body": letter_text,
                "location": profile.location or "",
                "date": datetime.date.today().strftime("%d.%m.%Y"),
                "role": profile.role or "",
                "skills": profile.skills or "",
            }
            job.cover_letter_html = fill_template(letter_template_html, letter_data)
            letter_pdf = html_to_pdf(job.cover_letter_html)
        else:
            letter_pdf = render_cover_letter_pdf(
                letter_markdown=letter_text,
                template_key=profile.cover_letter_template or "classic",
                sender_name=candidate_name,
                company=job.company or "",
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
        _publish(r, job, "DRAFTED", application_draft=job.application_draft, cv_draft=job.cv_draft)
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


def _cv_dict_to_markdown(cv: dict) -> str:
    parts = []
    if cv.get("name"):
        parts.append(f"# {cv['name']}")
    if cv.get("role"):
        parts.append(f"**{cv['role']}**\n")
    for exp in cv.get("experience", []):
        if not exp:
            continue
        if not parts or parts[-1] != "## Berufserfahrung":
            parts.append("## Berufserfahrung")
        parts.append(f"### {exp.get('role', '')} — {exp.get('company', '')} ({exp.get('duration', '')})")
        if exp.get("description"):
            parts.append(exp["description"])
        parts.append("")
    for proj in cv.get("projects", []):
        if not proj:
            continue
        if not parts or parts[-1] != "## Projekte":
            parts.append("## Projekte")
        parts.append(f"### {proj.get('name', '')} ({proj.get('tech_stack', '')})")
        if proj.get("description"):
            parts.append(proj["description"])
        parts.append("")
    if cv.get("education"):
        parts.append("## Ausbildung")
        parts.append(cv["education"])
    skills = cv.get("skills", [])
    if skills:
        parts.append("\n## Skills")
        parts.append(", ".join(skills) if isinstance(skills, list) else str(skills))
    return "\n".join(parts)


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
