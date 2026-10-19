"""Durable "CV import running" state of a profile, so a running import survives a browser reload.

Same pattern as core/interview_prep_state.py, for a synchronous run: POST /settings/upload-cv claims
and commits the start before its AI call, and the run's end clears it (a failure also stores a fixed
error code). A stamp older than SYNC_AI_RUN_LIMIT_SECONDS plus the sweep margin belongs to a run whose
server process died; workers/tasks/generation_sweep.py fails it.
"""

from datetime import datetime, timezone

from sqlalchemy import or_

from database.core import UserProfile

# The one fixed code of a failed run, also the 502 detail of the request that ran it.
CV_PARSE_FAILED = "cv_parse_failed"


def claim_import(db, profile_id: int, stale_before: datetime) -> bool:
    """Mark the import as running unless one runs (a conditional UPDATE, so two starts cannot both win).

    A stamp older than `stale_before` belongs to a run whose request died and is replaced. An error of an
    earlier run no longer applies. The caller commits. Returns False when another import runs.
    """
    claimed = db.query(UserProfile).filter(
        UserProfile.id == profile_id,
        or_(UserProfile.cv_import_started_at.is_(None), UserProfile.cv_import_started_at < stale_before),
    ).update(
        {UserProfile.cv_import_started_at: datetime.now(timezone.utc), UserProfile.cv_import_error: None},
        synchronize_session=False,
    )
    return claimed == 1


def finish_import(profile) -> None:
    profile.cv_import_started_at = None


def fail_import(profile, error_code: str) -> None:
    """End the run with a fixed error code (never model or exception output)."""
    profile.cv_import_started_at = None
    profile.cv_import_error = error_code


def import_running(profile) -> bool:
    return profile.cv_import_started_at is not None
