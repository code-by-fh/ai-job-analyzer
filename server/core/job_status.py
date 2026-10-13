"""Job lifecycle rules shared by the routers and the Celery workers."""

from datetime import datetime, timezone
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Optional


class ArchiveReason(str, Enum):
    """Why a job left the inbox: it scored below the user's threshold, or the user discarded it."""

    THRESHOLD = "THRESHOLD"
    USER = "USER"


# Column values for bulk Query.update() calls; read-only so no caller can alter them for the others.
ARCHIVE_BY_USER_VALUES = MappingProxyType(
    {"is_archived": True, "archive_reason": ArchiveReason.USER.value}
)
RESTORE_BY_USER_VALUES = MappingProxyType(
    {"is_archived": False, "archive_reason": None, "kept_by_user": True}
)

STATUS_OPEN = "OPEN"
STATUS_DRAFTED = "DRAFTED"
STATUS_GENERATING = "GENERATING"
STATUS_FAILED = "FAILED"
STATUS_SEEN = "SEEN"

# Phases past the draft; a (re)generation must never move a job back out of them.
ADVANCED_STATUSES = frozenset({"APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"})

ARCHIVE_BY_THRESHOLD_VALUES = MappingProxyType(
    {"is_archived": True, "archive_reason": ArchiveReason.THRESHOLD.value}
)
# Restoring by threshold is not a user decision, so kept_by_user stays unset.
RESTORE_BY_THRESHOLD_VALUES = MappingProxyType({"is_archived": False, "archive_reason": None})


def archive_job(job, reason: ArchiveReason) -> None:
    job.is_archived = True
    job.archive_reason = reason.value


def restore_job(job) -> None:
    """Bring a job back on the user's request; kept_by_user stops later threshold runs from hiding it again."""
    job.is_archived = False
    job.archive_reason = None
    job.kept_by_user = True


USER_SETTABLE_STATUSES = frozenset(
    {"OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"}
)

# Deliberately permissive: backward moves and skips are allowed and land in the
# status history, and the UI asks for confirmation instead. Only the states the
# system owns (a running generation, a dedup placeholder) cannot be left by hand,
# and SEEN, GENERATING and FAILED can never be chosen as a target.
ALLOWED_TRANSITIONS: Mapping[str, frozenset] = MappingProxyType({
    "OPEN": USER_SETTABLE_STATUSES - {"OPEN"},
    "DRAFTED": USER_SETTABLE_STATUSES - {"DRAFTED"},
    "APPLIED": USER_SETTABLE_STATUSES - {"APPLIED"},
    "INTERVIEW": USER_SETTABLE_STATUSES - {"INTERVIEW"},
    "OFFER": USER_SETTABLE_STATUSES - {"OFFER"},
    "ACCEPTED": USER_SETTABLE_STATUSES - {"ACCEPTED"},
    "REJECTED": USER_SETTABLE_STATUSES - {"REJECTED"},
    "FAILED": USER_SETTABLE_STATUSES,
    "GENERATING": frozenset(),
    "SEEN": frozenset(),
})


class InvalidStatusChange(ValueError):
    """A status change the server refuses."""


class StatusNotSettable(InvalidStatusChange):
    """The requested target is unknown or owned by the system."""


class TransitionNotAllowed(InvalidStatusChange):
    """The target is valid, but not reachable from the job's current status."""


def check_transition(current: Optional[str], target: str) -> None:
    """Raise unless a user may move a job from ``current`` to ``target``.

    A ``current`` value outside the table (free text written by the removed
    update-status endpoint) may move to any user-settable status, so such a
    job can be repaired.

    Raises:
        StatusNotSettable: ``target`` is not a user-settable status.
        TransitionNotAllowed: ``target`` is not reachable from ``current``.
    """
    if target not in USER_SETTABLE_STATUSES:
        raise StatusNotSettable(f"Status '{target}' cannot be set manually")
    if target not in ALLOWED_TRANSITIONS.get(current, USER_SETTABLE_STATUSES):
        raise TransitionNotAllowed(f"Cannot change status from '{current}' to '{target}'")


class GenerationOutcome(str, Enum):
    """How a CV or cover-letter generation ended."""

    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


def status_after_generation(stored: Optional[str], outcome: GenerationOutcome, has_draft: bool = False) -> str:
    """Return the status a job takes when its generation ends.

    ``stored`` is the status the job had when the generation started. A cancel
    restores it (or, without one, DRAFTED when a letter draft exists, else OPEN).
    Completion and failure keep an advanced status so regenerating documents for
    an application already sent never resets its phase; otherwise completion
    drafts and failure fails.
    """
    if outcome is GenerationOutcome.CANCELLED:
        if stored:
            return stored
        return STATUS_DRAFTED if has_draft else STATUS_OPEN
    if stored in ADVANCED_STATUSES:
        return stored
    return STATUS_DRAFTED if outcome is GenerationOutcome.COMPLETED else STATUS_FAILED


def start_generation(job) -> None:
    """Mark a job GENERATING and remember where it came from.

    A second start while one is still running keeps the first remembered status,
    which would otherwise be overwritten with GENERATING itself.
    """
    if job.status != STATUS_GENERATING:
        job.pre_generation_status = job.status
    job.status = STATUS_GENERATING
    job.generation_started_at = None


def mark_generation_running(db, job) -> None:
    """Stamp the moment a worker really starts, so time spent waiting in the queue never counts.

    The stuck-generation sweep judges only this stamp. A conditional UPDATE is used because the
    worker's copy of the job can be stale: a job cancelled after the worker loaded it must not
    receive a stamp that would make its next generation look old.
    """
    from database.core import JobEntry

    db.query(JobEntry).filter(JobEntry.id == job.id, JobEntry.status == STATUS_GENERATING).update(
        {JobEntry.generation_started_at: datetime.now(timezone.utc)}, synchronize_session=False
    )
    db.commit()


def finish_generation(job, outcome: GenerationOutcome) -> str:
    """Apply status_after_generation to the job, clear the remembered status and return the new status."""
    job.status = status_after_generation(job.pre_generation_status, outcome, bool(job.application_draft))
    job.pre_generation_status = None
    job.generation_started_at = None
    return job.status


def generation_cancelled(db, job) -> bool:
    """Reload the job; True when it is no longer GENERATING (cancelled, or already finished by someone else).

    A task that finds this must neither write nor publish: the job already
    holds the status the cancel or the earlier finish gave it.
    """
    db.refresh(job)
    return job.status != STATUS_GENERATING
