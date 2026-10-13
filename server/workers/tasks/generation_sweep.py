"""Celery beat task: finish generations whose worker died before it could record an outcome."""

import os
from datetime import datetime, timedelta, timezone

import redis

from core.celery_config import celery_app
from core.job_status import STATUS_GENERATING
from core.logger import get_logger
from database.core import SessionLocal, JobEntry
from workers.tasks.generation_failure import TaskContext, fail_generation
from workers.tasks.time_limits import (
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SWEEP_MARGIN_SECONDS,
    GENERATION_TIMEOUT_ERROR,
)

logger = get_logger(__name__)


@celery_app.task(name="ai.fail_stuck_generations")
def fail_stuck_generations() -> int:
    """Fail every job GENERATING for longer than the hard time limit plus a margin.

    A hard-killed task never reaches its failure handler, so without this the job would
    stay GENERATING and block the user forever. Only the worker's own start stamp counts, so a
    job that merely waited in the queue is never failed; jobs without a stamp (still queued, or
    started before the column existed) are left alone. Returns the number failed.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(
        seconds=GENERATION_HARD_TIME_LIMIT_SECONDS + GENERATION_SWEEP_MARGIN_SECONDS
    )
    db = SessionLocal()
    ctx = TaskContext(db, redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")))
    try:
        stuck = db.query(JobEntry).filter(
            JobEntry.status == STATUS_GENERATING, JobEntry.generation_started_at < cutoff,
        ).all()
        failed = sum(fail_generation(ctx, job, GENERATION_TIMEOUT_ERROR) for job in stuck)
        logger.info(f"Failed {failed} stuck generation(s)")
        return failed
    finally:
        db.close()
