"""Celery task: fill an uploaded HTML template with profile data to produce the master CV."""

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, DocumentTemplate, UserProfile, User
from intelligence.service import get_client_and_model, fill_html_cv_with_ai

logger = get_logger(__name__)


@celery_app.task(name="ai.generate_master_cv")
def generate_master_cv_task(template_id: int, user_id: int):
    logger.info(f"[TASK] generate_master_cv template={template_id} user={user_id}")
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.doc_type == "MASTER_CV",
            DocumentTemplate.user_id == user_id,
        ).first()
        if not template:
            logger.error(f"Master CV template {template_id} not found for user {user_id}")
            return

        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            logger.error(f"Profile not found for user {user_id}")
            return

        user = db.query(User).filter(User.id == user_id).first()
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
        filled_html = fill_html_cv_with_ai(
            template.html, cv_data, language,
            model=model, client=client,
        )

        old_master_id = profile.master_cv_template_id

        template.html = filled_html
        profile.master_cv_template_id = template_id
        profile.master_cv_status = "ready"
        db.commit()

        if old_master_id and old_master_id != template_id:
            old = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == old_master_id,
                DocumentTemplate.doc_type == "MASTER_CV",
                DocumentTemplate.user_id == user_id,
            ).first()
            if old:
                db.delete(old)
                db.commit()

        logger.info(f"generate_master_cv complete template={template_id} user={user_id}")

    except Exception as e:
        logger.error(f"generate_master_cv_task failed: {e}", exc_info=True)
        db.rollback()
        try:
            tmpl = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == template_id,
                DocumentTemplate.user_id == user_id,
            ).first()
            if tmpl:
                db.delete(tmpl)
            prof = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            if prof:
                prof.master_cv_status = "error"
            db.commit()
        except Exception as cleanup_e:
            logger.error(f"generate_master_cv cleanup failed: {cleanup_e}")
    finally:
        db.close()
