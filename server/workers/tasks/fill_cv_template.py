"""Celery task: annotate an uploaded CV HTML template with Jinja2 variables via AI."""

import json
import os
from typing import Optional

import redis

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, DocumentTemplate
from intelligence.service import get_client_and_model, annotate_cv_template_with_jinja2
from services.template_filler import TemplateRejected, CV_DOC_TYPE, has_jinja2_syntax, validate_template
from workers.tasks.time_limits import FILL_HARD_TIME_LIMIT_SECONDS, FILL_SOFT_TIME_LIMIT_SECONDS

logger = get_logger(__name__)

TEMPLATE_READY_EVENT = "template_ready"
# The AI output failed the save-time check; the unannotated template stays and remains usable.
TEMPLATE_STATUS_ANNOTATION_REJECTED = "annotation_rejected"
# The AI call failed or timed out, or storing its result failed; the unannotated template stays usable.
TEMPLATE_STATUS_ANNOTATION_FAILED = "annotation_failed"


def _publish_template_ready(template_id: int, user_id: int) -> None:
    """Tell the owner's browser the fill ended, so the gallery need not poll."""
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    redis.from_url(redis_url).publish(
        "job_updates",
        json.dumps({"type": TEMPLATE_READY_EVENT, "template_id": template_id, "user_id": user_id}),
    )


def _end(template_id: int, user_id: int, status: str) -> None:
    """Every end except a hard kill leaves a visible state and tells the browser."""
    _set_status(template_id, user_id, status)
    _publish_template_ready(template_id, user_id)


@celery_app.task(
    name="ai.fill_cv_template",
    soft_time_limit=FILL_SOFT_TIME_LIMIT_SECONDS,
    time_limit=FILL_HARD_TIME_LIMIT_SECONDS,
)
def fill_cv_template_task(template_id: int, user_id: int):
    """Annotate a user-uploaded CV template with Jinja2 variables (one-time, on upload).

    If the template already contains Jinja2 syntax it is saved as-is; otherwise the AI adds
    {{ name }}, {% for exp in experience %}, etc. Profile data is injected at render time.
    """
    logger.info(f"[TASK] annotate_cv_template template={template_id} user={user_id}")
    try:
        annotated_html = _annotated(template_id, user_id)
    except Exception as e:  # DB and AI errors and SoftTimeLimitExceeded alike: the original stays usable
        logger.error(f"Annotation failed for template {template_id}: {e}", exc_info=True)
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_FAILED)
        return
    if annotated_html is not None:
        _finish(template_id, user_id, annotated_html)


def _load(template_id: int, user_id: int):
    """(html, client, model) of the owner's CV template, read before the AI call so no session is held."""
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.doc_type == "CV",
            DocumentTemplate.user_id == user_id,
        ).first()
        if not template:
            logger.error(f"CV template {template_id} not found for user {user_id}")
            return None
        client, model = get_client_and_model("cv_tailoring", db)
        return template.html, client, model
    finally:
        db.close()


def _annotated(template_id: int, user_id: int) -> Optional[str]:
    """The owner's template with Jinja2 variables, None when it is gone; raises when the DB or AI fails."""
    loaded = _load(template_id, user_id)
    if loaded is None:
        return None
    template_html, client, model = loaded
    if has_jinja2_syntax(template_html):
        logger.info(f"Template {template_id} already has Jinja2 syntax, skipping annotation")
        return template_html
    return annotate_cv_template_with_jinja2(template_html, model=model, client=client)


def _finish(template_id: int, user_id: int, annotated_html: str) -> None:
    """Check and store the annotation; a refused or unstorable one keeps the original."""
    try:
        # AI output is untrusted like the upload: strip scripts and on* handlers, then check the Jinja.
        checked_html = validate_template(annotated_html, CV_DOC_TYPE)
    except TemplateRejected:
        logger.error(f"AI annotation of template {template_id} rejected, keeping the original", exc_info=True)
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_REJECTED)
        return
    if _store_annotation(template_id, user_id, checked_html):
        _publish_template_ready(template_id, user_id)
    else:
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_FAILED)


def _store_annotation(template_id: int, user_id: int, html: str) -> bool:
    """Store the annotated HTML as ready; False when the database refused (a deleted template counts as stored)."""
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id, DocumentTemplate.user_id == user_id,
        ).first()
        if template:
            template.html, template.status = html, None
            db.commit()
        logger.info(f"annotate_cv_template complete template={template_id}")
        return True
    except Exception as e:  # any DB error: the caller marks the template failed instead of leaving "processing"
        # Type only: the error text and traceback of a failed statement carry the bound HTML.
        logger.error(f"annotate_cv_template DB write failed for template {template_id}: {type(e).__name__}")
        db.rollback()
        return False
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
