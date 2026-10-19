"""Durable "company research running" state of a job, so a research started on the job survives a reload.

Same pattern as core/interview_prep_state.py. The state lives on the job, not on the shared company
profile: a research may start without a domain (the worker identifies it first), its error is meant for
the one user who started it, and a profile row exists only once a research succeeded.
"""

from datetime import datetime, timezone


def start_research(job) -> None:
    """Mark the research as running; an error of an earlier run no longer applies."""
    job.company_research_started_at = datetime.now(timezone.utc)
    job.company_research_error = None


def finish_research(job) -> None:
    job.company_research_started_at = None


def fail_research(job, error_code: str) -> None:
    """End the run with a fixed error code (never model or exception output)."""
    job.company_research_started_at = None
    job.company_research_error = error_code


def research_running(job) -> bool:
    return job.company_research_started_at is not None
