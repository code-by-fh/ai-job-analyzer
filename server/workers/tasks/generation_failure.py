"""Shared way for the generation tasks to record a failed run."""

import json
from dataclasses import dataclass

from core.job_status import GenerationOutcome, finish_generation, generation_cancelled
from core.logger import get_logger
from database.core import JobEntry

logger = get_logger(__name__)


@dataclass(frozen=True)
class TaskContext:
    """The DB session and Redis client a generation task works with."""

    db: object
    redis: object


def fail_generation(ctx: TaskContext, job, error: str) -> bool:
    """Record a failed generation and publish it to the job owner.

    An advanced application status survives, the error stays visible. Returns
    False and writes nothing when the job is no longer GENERATING, so a cancel
    is never overwritten.
    """
    if generation_cancelled(ctx.db, job):
        logger.info(f"Job {job.id} is no longer GENERATING; not recording the failure.")
        return False
    job.generation_error = error
    status = finish_generation(job, GenerationOutcome.FAILED)
    ctx.db.commit()
    ctx.redis.publish(
        "job_updates",
        json.dumps({"type": "job_update", "job_id": job.id, "status": status, "error": error, "user_id": job.user_id}),
    )
    return True


def record_failure(ctx: TaskContext, job_id, error: str) -> None:
    """Roll back the failed attempt and record the failure on the freshly loaded job."""
    ctx.db.rollback()
    try:
        job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if job:
            fail_generation(ctx, job, error)
    except Exception as db_e:
        logger.error(f"Failed to persist FAILED status: {db_e}")
