"""Durable run state of one user's deep dive (a CompanyDeepDive row), so a running deep dive survives a reload.

Same pattern as core/cv_import_state.py: POST /companies/{domain}/deep-dive stamps and commits the
start before its AI call; success stores the result and clears the stamp, a failure clears it and
stores a fixed error code. The last result stays until the next run succeeds.
"""

from datetime import datetime, timezone

# The one fixed code of a failed run in company_deep_dives.error; the web maps it to its own text.
DEEP_DIVE_ERROR = "DEEP_DIVE_FAILED"


def start_deep_dive(run) -> None:
    """Mark the deep dive as running; an error of an earlier run no longer applies."""
    run.started_at = datetime.now(timezone.utc)
    run.error = None


def finish_deep_dive(run, result: str) -> None:
    run.started_at = None
    run.result = result


def fail_deep_dive(run, error_code: str) -> None:
    """End the run with a fixed error code (never model or exception output); the last result stays."""
    run.started_at = None
    run.error = error_code


def deep_dive_running(run) -> bool:
    return run.started_at is not None
