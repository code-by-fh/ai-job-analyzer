"""Celery task: read contact, recruiter and salary details out of the posting of an existing job."""

import os

import redis

from core.celery_config import celery_app
from core.logger import get_logger
from core.posting_details_state import finish_posting_details, start_posting_details
from database.core import SessionLocal, JobEntry
from intelligence.posting_details import apply_posting_details
from intelligence.service import extract_posting_details, get_client_and_model
from services.run_events import publish_posting_details_ended
from workers.tasks.generation_failure import TaskContext
from workers.tasks.time_limits import (
    POSTING_DETAILS_FAILED,
    POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS,
    POSTING_DETAILS_NOTHING_NEW,
    POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS,
)

logger = get_logger(__name__)

# The posting text is routed like the analysis it normally comes from.
AI_TASK_NAME = "job_analysis"


def end_posting_details(ctx: TaskContext, job, error_code=None) -> None:
    """End the job's run (with a fixed code on failure or an empty result) and tell its owner."""
    finish_posting_details(job, error_code)
    ctx.db.commit()
    publish_posting_details_ended(ctx.redis, job.user_id, job.id)


def _extract(ctx: TaskContext, job_id: str, user_id: int) -> None:
    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == user_id).first()
    if not job:
        logger.error(f"Job {job_id} not found for posting details")
        return
    start_posting_details(job)
    ctx.db.commit()
    client, model = get_client_and_model(AI_TASK_NAME, ctx.db)
    data = extract_posting_details(job.title or "", job.description or "", model, client)
    # The AI call took a while: re-read the row so a user edit committed meanwhile is seen and kept.
    ctx.db.refresh(job, with_for_update=True)
    before = list(job.posting_extracted or [])
    apply_posting_details(job, data)
    found_something = list(job.posting_extracted or []) != before
    end_posting_details(ctx, job, None if found_something else POSTING_DETAILS_NOTHING_NEW)
    logger.info(f"Posting details extracted for job {job_id}")


def _record_task_failure(ctx: TaskContext, job_id: str) -> None:
    ctx.db.rollback()
    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id).first()
    if job:
        end_posting_details(ctx, job, POSTING_DETAILS_FAILED)


@celery_app.task(
    name="worker.extract_posting_details_task",
    soft_time_limit=POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS,
    time_limit=POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS,
)
def extract_posting_details_task(job_id: str, user_id: int):
    """Fill the empty contact/recruiter/salary fields of a job from its posting. Every failure ends the run."""
    db = SessionLocal()
    ctx = TaskContext(db, redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")))
    try:
        _extract(ctx, job_id, user_id)
    except Exception:
        logger.exception(f"Posting details extraction failed for {job_id}")
        _record_task_failure(ctx, job_id)
        raise
    finally:
        db.close()
