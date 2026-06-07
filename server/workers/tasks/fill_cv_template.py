"""Celery task: fill an uploaded CV HTML template with profile data via AI."""

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, DocumentTemplate, UserProfile, User
from intelligence.service import get_client_and_model, fill_html_cv_with_ai

logger = get_logger(__name__)


@celery_app.task(name="ai.fill_cv_template")
def fill_cv_template_task(template_id: int, user_id: int):
    logger.info(f"[TASK] fill_cv_template template={template_id} user={user_id}")

    # --- Phase 1: read all data, then close the session before the AI call ---
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.doc_type == "CV",
            DocumentTemplate.user_id == user_id,
        ).first()
        if not template:
            logger.error(f"CV template {template_id} not found for user {user_id}")
            return

        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            logger.error(f"Profile not found for user {user_id}")
            return

        user = db.query(User).filter(User.id == user_id).first()

        template_html = template.html
        cv_data = dict(profile.cv_data or {})
        cv_data.setdefault("experience", [])
        cv_data.setdefault("projects", [])
        cv_data.setdefault("education", "")
        cv_data["name"] = user.username if user else ""
        cv_data["role"] = profile.role or ""
        cv_data["skills"] = profile.skills or ""
        cv_data["location"] = profile.location or ""
        if profile.spoken_languages:
            cv_data["spoken_languages"] = profile.spoken_languages

        language = getattr(profile, "language", "de") or "de"
        client, model = get_client_and_model("cv_tailoring", db)
    finally:
        db.close()

    # --- Phase 2: AI call (no DB connection held) ---
    try:
        filled_html = fill_html_cv_with_ai(
            template_html, cv_data, language,
            model=model, client=client,
        )
    except Exception as e:
        logger.error(f"fill_cv_template AI call failed: {e}", exc_info=True)
        _set_status(template_id, user_id, None)
        return

    # --- Phase 3: write result in a fresh session ---
    db = SessionLocal()
    try:
        tmpl = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == user_id,
        ).first()
        if tmpl:
            tmpl.html = filled_html
            tmpl.status = None
            db.commit()
        logger.info(f"fill_cv_template complete template={template_id} user={user_id}")
    except Exception as e:
        logger.error(f"fill_cv_template DB write failed: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def _set_status(template_id: int, user_id: int, status):
    db = SessionLocal()
    try:
        tmpl = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == user_id,
        ).first()
        if tmpl:
            tmpl.status = status
            db.commit()
    except Exception as e:
        logger.error(f"fill_cv_template _set_status failed: {e}")
        db.rollback()
    finally:
        db.close()
