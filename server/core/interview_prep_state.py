"""Durable "interview prep running" state of a job, so a running prep survives a browser reload.

The pattern: a start stamp plus a fixed error. The endpoint stamps the start when it queues the task,
the worker re-stamps it when it begins, and the run's end clears it (a failure also stores a fixed
error). A stamp older than the prep's hard time limit plus the sweep margin belongs to a lost or killed
run; workers/tasks/generation_sweep.py fails it.
"""

from datetime import datetime, timezone


def start_prep(job) -> None:
    """Mark the prep as running; an error of an earlier run no longer applies."""
    job.interview_prep_started_at = datetime.now(timezone.utc)
    job.interview_prep_error = None


def finish_prep(job) -> None:
    job.interview_prep_started_at = None


def fail_prep(job, error: str) -> None:
    """End the run with a fixed error text (never model or exception output)."""
    job.interview_prep_started_at = None
    job.interview_prep_error = error


def prep_running(job) -> bool:
    return job.interview_prep_started_at is not None
