"""Celery beat task: finish generations, interview preps, company research, posting details runs, CV imports and deep dives whose process died before it could record an outcome."""

import os
from datetime import datetime, timedelta, timezone

import redis

from core.celery_config import celery_app
from core.cv_import_state import CV_PARSE_FAILED, fail_import
from core.deep_dive_state import DEEP_DIVE_ERROR, fail_deep_dive
from core.job_status import STATUS_GENERATING
from core.logger import get_logger
from database.core import SessionLocal, CompanyDeepDive, JobEntry, UserProfile
from services.run_events import publish_cv_import_ended, publish_deep_dive_ended
from workers.tasks.generation_failure import TaskContext, fail_generation
from workers.tasks.posting_details import end_posting_details
from workers.tasks.research import record_prep_failure, record_research_failure
from workers.tasks.time_limits import (
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SWEEP_MARGIN_SECONDS,
    GENERATION_TIMEOUT_ERROR,
    POSTING_DETAILS_FAILED,
    POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS,
    POSTING_DETAILS_QUEUE_WAIT_SECONDS,
    PREP_HARD_TIME_LIMIT_SECONDS,
    RESEARCH_FAILED,
    RESEARCH_HARD_TIME_LIMIT_SECONDS,
    SYNC_AI_RUN_LIMIT_SECONDS,
)

logger = get_logger(__name__)


def _cutoff(hard_time_limit_seconds: int, queue_wait_seconds: int = 0) -> datetime:
    allowance = hard_time_limit_seconds + queue_wait_seconds + GENERATION_SWEEP_MARGIN_SECONDS
    return datetime.now(timezone.utc) - timedelta(seconds=allowance)


def _fail_stuck_generations(ctx: TaskContext) -> int:
    stuck = ctx.db.query(JobEntry).filter(
        JobEntry.status == STATUS_GENERATING,
        JobEntry.generation_started_at < _cutoff(GENERATION_HARD_TIME_LIMIT_SECONDS),
    ).all()
    return sum(fail_generation(ctx, job, GENERATION_TIMEOUT_ERROR) for job in stuck)


def _fail_stuck_preps(ctx: TaskContext) -> int:
    """The prep stamp is set when the prep is queued, so a prep lost in the queue ends here too."""
    stuck = ctx.db.query(JobEntry).filter(
        JobEntry.interview_prep_started_at < _cutoff(PREP_HARD_TIME_LIMIT_SECONDS),
    ).all()
    for job in stuck:
        record_prep_failure(ctx, job, GENERATION_TIMEOUT_ERROR)
    return len(stuck)


def _fail_stuck_research(ctx: TaskContext) -> int:
    """Like the prep stamp, the research stamp is set when the research is queued."""
    stuck = ctx.db.query(JobEntry).filter(
        JobEntry.company_research_started_at < _cutoff(RESEARCH_HARD_TIME_LIMIT_SECONDS),
    ).all()
    for job in stuck:
        record_research_failure(ctx, job, RESEARCH_FAILED)
    return len(stuck)


def _fail_stuck_posting_details(ctx: TaskContext) -> int:
    """The stamp is set when the extraction is queued, so the cutoff also covers the queue wait."""
    cutoff = _cutoff(POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS, POSTING_DETAILS_QUEUE_WAIT_SECONDS)
    stuck = ctx.db.query(JobEntry).filter(
        JobEntry.posting_details_started_at < cutoff,
    ).all()
    for job in stuck:
        end_posting_details(ctx, job, POSTING_DETAILS_FAILED)
    return len(stuck)


def _fail_stuck_cv_imports(ctx: TaskContext) -> int:
    """The request that ran the import died with its server process (restart, crash)."""
    stuck = ctx.db.query(UserProfile).filter(
        UserProfile.cv_import_started_at < _cutoff(SYNC_AI_RUN_LIMIT_SECONDS),
    ).all()
    for profile in stuck:
        fail_import(profile, CV_PARSE_FAILED)
    ctx.db.commit()
    for profile in stuck:
        publish_cv_import_ended(ctx.redis, profile.user_id)
    return len(stuck)


def _fail_stuck_deep_dives(ctx: TaskContext) -> int:
    """Like the CV import, a deep dive runs inside its request."""
    stuck = ctx.db.query(CompanyDeepDive).filter(
        CompanyDeepDive.started_at < _cutoff(SYNC_AI_RUN_LIMIT_SECONDS),
    ).all()
    for run in stuck:
        fail_deep_dive(run, DEEP_DIVE_ERROR)
    ctx.db.commit()
    for run in stuck:
        publish_deep_dive_ended(ctx.redis, run.user_id, run.domain)
    return len(stuck)


def _fail_stuck_request_runs(ctx: TaskContext) -> int:
    return _fail_stuck_cv_imports(ctx) + _fail_stuck_deep_dives(ctx)


@celery_app.task(name="ai.fail_stuck_generations")
def fail_stuck_generations() -> int:
    """Fail every job GENERATING, preparing an interview or researching its company for longer than its hard time limit plus a margin,
    and every CV import and deep dive running longer than SYNC_AI_RUN_LIMIT_SECONDS plus that margin.

    A hard-killed task never reaches its failure handler, so without this the job would
    stay GENERATING (or its prep or research running) and block the user forever. For a generation only the
    worker's own start stamp counts, so a job that merely waited in the queue is never failed; jobs
    without a stamp (still queued, or started before the column existed) are left alone. Returns the
    number failed.
    """
    db = SessionLocal()
    ctx = TaskContext(db, redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")))
    try:
        failed = (
            _fail_stuck_generations(ctx) + _fail_stuck_preps(ctx) + _fail_stuck_research(ctx)
            + _fail_stuck_posting_details(ctx)
            + _fail_stuck_request_runs(ctx)
        )
        logger.info(f"Failed {failed} stuck generation(s), interview prep(s), company research(es), posting details run(s), CV import(s) and deep dive(s)")
        return failed
    finally:
        db.close()
