"""Durable "posting details running" state of a job, so a started extraction survives a reload.

Same pattern as core/company_research_state.py: a start stamp plus a fixed error code. The endpoint
stamps the start when it queues the task, the worker re-stamps it, and the run's end clears the stamp
(a failure or an empty result also stores a code). A stamp older than the task's hard time limit plus
the sweep margin belongs to a lost run; workers/tasks/generation_sweep.py fails it.
"""

from datetime import datetime, timezone


def start_posting_details(job) -> None:
    """Mark the extraction as running; the error of an earlier run no longer applies."""
    job.posting_details_started_at = datetime.now(timezone.utc)
    job.posting_details_error = None


def finish_posting_details(job, error_code=None) -> None:
    """End the run; *error_code* is a fixed code (never model or exception output), None on success."""
    job.posting_details_started_at = None
    job.posting_details_error = error_code


def posting_details_running(job) -> bool:
    return job.posting_details_started_at is not None
