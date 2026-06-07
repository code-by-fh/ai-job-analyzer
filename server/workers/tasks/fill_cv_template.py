"""Celery task: annotate an uploaded CV HTML template with Jinja2 variables via AI."""

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, DocumentTemplate
from intelligence.service import get_client_and_model, annotate_cv_template_with_jinja2
from services.template_filler import has_jinja2_syntax

logger = get_logger(__name__)


@celery_app.task(name="ai.fill_cv_template")
def fill_cv_template_task(template_id: int, user_id: int):
    """Annotate a user-uploaded CV template with Jinja2 variables (one-time, on upload).

    If the template already contains Jinja2 syntax it is saved as-is.
    Otherwise AI adds {{ name }}, {% for exp in experience %}, etc.
    After this task completes the template is a reusable Jinja2 layout —
    actual profile data is injected at render time with no AI call.
    """
    logger.info(f"[TASK] annotate_cv_template template={template_id} user={user_id}")

    # Phase 1: read template, then close session before AI call
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

        template_html = template.html
        client, model = get_client_and_model("cv_tailoring", db)
    finally:
        db.close()

    # Phase 2: annotate if needed (no DB connection held during AI call)
    if has_jinja2_syntax(template_html):
        logger.info(f"Template {template_id} already has Jinja2 syntax — skipping annotation")
        annotated_html = template_html
    else:
        try:
            annotated_html = annotate_cv_template_with_jinja2(
                template_html, model=model, client=client
            )
        except Exception as e:
            logger.error(f"Annotation failed for template {template_id}: {e}", exc_info=True)
            _set_status(template_id, user_id, None)
            return

    # Phase 3: save annotated template in a fresh session
    db = SessionLocal()
    try:
        tmpl = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == user_id,
        ).first()
        if tmpl:
            tmpl.html = annotated_html
            tmpl.status = None
            db.commit()
        logger.info(f"annotate_cv_template complete template={template_id}")
    except Exception as e:
        logger.error(f"annotate_cv_template DB write failed: {e}", exc_info=True)
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
        logger.error(f"annotate_cv_template _set_status failed: {e}")
        db.rollback()
    finally:
        db.close()
