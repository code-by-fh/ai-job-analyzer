"""Celery tasks: interview preparation and company profile research."""

import os
import json
import time
from typing import Callable, TypeVar

import redis
from openai import (
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)

from core.celery_config import celery_app
from core.company_research_state import fail_research, finish_research, start_research
from core.interview_prep_state import fail_prep, finish_prep, start_prep
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile
from intelligence.service import get_client_and_model, format_cv_for_prompt
from services.company_identification import identify_job_company_domain
from workers.tasks.generation_failure import TaskContext
from workers.tasks.time_limits import (
    GENERATION_FAILED_ERROR,
    PREP_HARD_TIME_LIMIT_SECONDS,
    PREP_SOFT_TIME_LIMIT_SECONDS,
    RESEARCH_AI_UNREACHABLE,
    RESEARCH_DOMAIN_NOT_FOUND,
    RESEARCH_FAILED,
    RESEARCH_HARD_TIME_LIMIT_SECONDS,
    RESEARCH_SOFT_TIME_LIMIT_SECONDS,
)

logger = get_logger(__name__)

MAX_COMPANY_NAME_LENGTH = 200
# The SDK's own retry (AI_MAX_RETRIES) backs off for about a second; a short network outage
# (DNS hiccup, container network restarting) outlasts that, so the research tries once more a bit later.
AI_CONNECTION_RETRY_DELAY_SECONDS = 5

T = TypeVar("T")


def _shared_company_name(existing, own_job, domain: str) -> str:
    """Name for the shared profile: the stored one wins, so a later user cannot rename it."""
    if existing and existing.name:
        return existing.name
    name = (own_job.company if own_job else None) or domain
    return name[:MAX_COMPANY_NAME_LENGTH]


def _candidate_context(db, user_id: int) -> tuple:
    """The CV summary and answer language of the user the prep is for."""
    user_profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not user_profile:
        return "", "de"
    cv_summary = format_cv_for_prompt(user_profile.cv_data) if user_profile.cv_data else ""
    return cv_summary, getattr(user_profile, "language", "de") or "de"


def _publish_prep_ended(ctx: TaskContext, job_id: str, user_id: int) -> None:
    """One event for both outcomes: the client reloads the job, which tells success from failure."""
    ctx.redis.publish(
        "job_updates",
        json.dumps({"type": "interview_prep_ready", "job_id": job_id, "user_id": user_id}),
    )


def record_prep_failure(ctx: TaskContext, job, error: str) -> None:
    """End the job's prep run with a fixed error and tell its owner."""
    fail_prep(job, error)
    ctx.db.commit()
    _publish_prep_ended(ctx, job.id, job.user_id)


def _generate_prep(ctx: TaskContext, job_id: str, user_id: int) -> None:
    from intelligence.service import generate_interview_prep

    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id).first()
    if not job:
        logger.error(f"Job {job_id} not found for interview prep")
        return
    start_prep(job)
    ctx.db.commit()
    cv_summary, user_language = _candidate_context(ctx.db, user_id)
    client, model = get_client_and_model("interview_prep", ctx.db)
    prep_data = generate_interview_prep(
        job_title=job.title, company_name=job.company, job_description=job.description or "",
        cv_summary=cv_summary, model=model, client=client, language=user_language,
    )
    job.interview_prep_material = json.dumps(prep_data, ensure_ascii=False)
    finish_prep(job)
    ctx.db.commit()
    _publish_prep_ended(ctx, job_id, user_id)
    logger.info(f"Interview prep generated for job {job_id}")


def _record_prep_task_failure(ctx: TaskContext, job_id: str) -> None:
    ctx.db.rollback()
    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id).first()
    if job:
        record_prep_failure(ctx, job, GENERATION_FAILED_ERROR)


@celery_app.task(
    name="worker.generate_interview_prep_task",
    soft_time_limit=PREP_SOFT_TIME_LIMIT_SECONDS,
    time_limit=PREP_HARD_TIME_LIMIT_SECONDS,
)
def generate_interview_prep_task(job_id: str, user_id: int):
    """Generate the interview prep of a job. Every failure ends the run; the user retries by hand."""
    db = SessionLocal()
    ctx = TaskContext(db, redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")))
    try:
        _generate_prep(ctx, job_id, user_id)
    except Exception:
        logger.exception(f"Interview prep generation failed for {job_id}")
        _record_prep_task_failure(ctx, job_id)
        raise
    finally:
        db.close()


def _store_company_profile(db, domain: str, user_id: int, ai: tuple) -> dict:
    """Research *domain* and store the result as its shared profile; the caller commits.

    The profile is shared by all users: only the requester's own job may name the company,
    and no job text at all flows into the prompt.
    """
    from intelligence.service import generate_company_profile_summary
    from database.core import CompanyProfile
    from datetime import datetime, timezone as tz

    own_job = (
        db.query(JobEntry)
        .filter(JobEntry.company_domain == domain, JobEntry.user_id == user_id)
        .order_by(JobEntry.created_at.desc())
        .first()
    )
    existing = db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
    company_name = _shared_company_name(existing, own_job, domain)
    client, model = ai
    profile_data = generate_company_profile_summary(
        company_name=company_name,
        domain=domain,
        model=model,
        client=client,
    )

    company = existing
    if not company:
        company = CompanyProfile(domain=domain, name=company_name)
        db.add(company)

    company.description = profile_data.get("executive_summary", "")[:500] if isinstance(profile_data.get("executive_summary"), str) else ""
    company.culture_summary = ""
    company.tech_stack = []
    company.raw_data = profile_data
    company.analyzed_at = datetime.now(tz.utc)
    return profile_data


@celery_app.task(name="worker.generate_company_profile", bind=True, max_retries=2)
def generate_company_profile(self, domain: str, user_id: int):
    """Generiert ein vollständiges Firmenprofil via generate_company_profile_summary."""
    db = SessionLocal()
    try:
        profile_data = _store_company_profile(db, domain, user_id, get_client_and_model("company_profile", db))
        db.commit()

        redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
        redis.from_url(redis_url).publish(
            "job_updates",
            json.dumps({"type": "company_profile_ready", "domain": domain, "user_id": user_id}),
        )

        logger.info(f"Company profile generated for {domain}")
        return profile_data

    except (
        AuthenticationError,
        RateLimitError,
        NotFoundError,
        APIConnectionError,
        APIStatusError,
    ):
        logger.error(f"OpenRouter API error in generate_company_profile for {domain}, not retrying.")
        db.rollback()
        return {"status": "failed", "reason": "api_error"}
    except Exception as e:
        logger.error(f"Company profile generation failed for {domain}: {e}")
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


def _publish_research_ended(ctx: TaskContext, job) -> None:
    """One event for both outcomes: the client reloads the job, which tells success from failure."""
    ctx.redis.publish(
        "job_updates",
        json.dumps({
            "type": "company_profile_ready", "domain": job.company_domain, "job_id": job.id, "user_id": job.user_id,
        }),
    )


def record_research_failure(ctx: TaskContext, job, error_code: str) -> None:
    """End the job's research run with a fixed error code and tell its owner."""
    fail_research(job, error_code)
    ctx.db.commit()
    _publish_research_ended(ctx, job)


def _retry_dropped_connection(ai_call: Callable[[], T]) -> T:
    """Run *ai_call*, once more after a short pause when the connection to the AI failed.

    A timeout is not retried: its request already waited AI_REQUEST_TIMEOUT_SECONDS per SDK attempt,
    and a third attempt would push the task past its soft time limit.
    """
    try:
        return ai_call()
    except APITimeoutError:
        raise
    except APIConnectionError:
        logger.warning(f"AI connection failed, retrying in {AI_CONNECTION_RETRY_DELAY_SECONDS} s")
        time.sleep(AI_CONNECTION_RETRY_DELAY_SECONDS)
        return ai_call()


def _research_job_company(ctx: TaskContext, job_id: str, user_id: int, force_refresh: bool) -> None:
    from database.core import CompanyProfile

    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == user_id).first()
    if not job:
        logger.error(f"Job {job_id} not found for company research")
        return
    start_research(job)
    ctx.db.commit()
    ai = get_client_and_model("company_profile", ctx.db)
    domain = job.company_domain or _retry_dropped_connection(lambda: identify_job_company_domain(job, ai))
    if domain is None:
        record_research_failure(ctx, job, RESEARCH_DOMAIN_NOT_FOUND)
        return
    job.company_domain = domain
    ctx.db.commit()
    profile_exists = ctx.db.query(CompanyProfile.id).filter(CompanyProfile.domain == domain).first() is not None
    if force_refresh or not profile_exists:
        _retry_dropped_connection(lambda: _store_company_profile(ctx.db, domain, user_id, ai))
    finish_research(job)
    ctx.db.commit()
    _publish_research_ended(ctx, job)
    logger.info(f"Company research finished for job {job_id}")


def _record_research_task_failure(ctx: TaskContext, job_id: str, error_code: str) -> None:
    ctx.db.rollback()
    job = ctx.db.query(JobEntry).filter(JobEntry.id == job_id).first()
    if job:
        record_research_failure(ctx, job, error_code)


@celery_app.task(
    name="worker.research_job_company_task",
    soft_time_limit=RESEARCH_SOFT_TIME_LIMIT_SECONDS,
    time_limit=RESEARCH_HARD_TIME_LIMIT_SECONDS,
)
def research_job_company_task(job_id: str, user_id: int, force_refresh: bool):
    """Research the company of a job, identifying its domain first when the user left it empty.

    Every failure ends the run; the user retries by hand.
    """
    db = SessionLocal()
    ctx = TaskContext(db, redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")))
    try:
        _research_job_company(ctx, job_id, user_id, force_refresh)
    except APIConnectionError:
        logger.exception(f"Company research failed for job {job_id}: AI unreachable")
        _record_research_task_failure(ctx, job_id, RESEARCH_AI_UNREACHABLE)
        raise
    except Exception:
        logger.exception(f"Company research failed for job {job_id}")
        _record_research_task_failure(ctx, job_id, RESEARCH_FAILED)
        raise
    finally:
        db.close()
