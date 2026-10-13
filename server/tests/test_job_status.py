import pytest

from core.job_status import (
    ALLOWED_TRANSITIONS,
    ArchiveReason,
    GenerationOutcome,
    StatusNotSettable,
    TransitionNotAllowed,
    archive_job,
    check_transition,
    finish_generation,
    restore_job,
    start_generation,
    status_after_generation,
)
from tests.factories import make_job


def test_archive_job_records_reason():
    job = make_job()
    archive_job(job, ArchiveReason.THRESHOLD)
    assert (job.is_archived, job.archive_reason) == (True, "THRESHOLD")


def test_restore_job_clears_reason_and_marks_kept():
    job = make_job(is_archived=True, archive_reason="THRESHOLD")
    restore_job(job)
    assert (job.is_archived, job.archive_reason, job.kept_by_user) == (False, None, True)


USER_STATES = ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]
SYSTEM_STATES = ["SEEN", "GENERATING", "FAILED"]
EVERY_STATE = USER_STATES + SYSTEM_STATES
LOCKED_SOURCES = ["SEEN", "GENERATING"]
MOVABLE_SOURCES = USER_STATES + ["FAILED"]
LEGACY_FREE_TEXT_STATUS = "Beworben"

ALLOWED_PAIRS = [(current, target) for current in MOVABLE_SOURCES for target in USER_STATES if current != target]
SYSTEM_TARGET_PAIRS = [(current, target) for current in EVERY_STATE for target in SYSTEM_STATES]
LOCKED_PAIRS = [(current, target) for current in LOCKED_SOURCES for target in USER_STATES]


def test_transition_table_covers_every_known_status():
    assert set(ALLOWED_TRANSITIONS) == set(EVERY_STATE)


@pytest.mark.parametrize("current,target", ALLOWED_PAIRS)
def test_user_may_move_between_user_states(current, target):
    assert check_transition(current, target) is None


@pytest.mark.parametrize("current,target", SYSTEM_TARGET_PAIRS)
def test_system_owned_target_is_rejected(current, target):
    with pytest.raises(StatusNotSettable, match="cannot be set manually"):
        check_transition(current, target)


@pytest.mark.parametrize("current,target", LOCKED_PAIRS)
def test_system_owned_source_cannot_be_left_by_hand(current, target):
    with pytest.raises(TransitionNotAllowed, match=f"from '{current}'"):
        check_transition(current, target)


@pytest.mark.parametrize("status", USER_STATES)
def test_same_status_is_rejected(status):
    with pytest.raises(TransitionNotAllowed, match=f"to '{status}'"):
        check_transition(status, status)


@pytest.mark.parametrize("target", USER_STATES)
def test_legacy_free_text_status_may_move_to_any_user_state(target):
    assert check_transition(LEGACY_FREE_TEXT_STATUS, target) is None


def test_unknown_target_is_rejected():
    with pytest.raises(StatusNotSettable, match="'ARCHIVED'"):
        check_transition("OPEN", "ARCHIVED")


ADVANCED_STATES = ["APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]
EARLY_STATES = [None, "OPEN", "DRAFTED", "FAILED"]


@pytest.mark.parametrize("stored", ADVANCED_STATES)
@pytest.mark.parametrize("outcome", [GenerationOutcome.COMPLETED, GenerationOutcome.FAILED])
def test_generation_keeps_advanced_status(stored, outcome):
    assert status_after_generation(stored, outcome) == stored


@pytest.mark.parametrize("stored", EARLY_STATES)
def test_completed_generation_from_early_status_drafts(stored):
    assert status_after_generation(stored, GenerationOutcome.COMPLETED) == "DRAFTED"


@pytest.mark.parametrize("stored", EARLY_STATES)
def test_failed_generation_from_early_status_fails(stored):
    assert status_after_generation(stored, GenerationOutcome.FAILED) == "FAILED"


@pytest.mark.parametrize("stored", ADVANCED_STATES + ["OPEN", "DRAFTED", "FAILED"])
def test_cancelled_generation_restores_stored_status(stored):
    assert status_after_generation(stored, GenerationOutcome.CANCELLED, has_draft=True) == stored


@pytest.mark.parametrize(("has_draft", "expected"), [(True, "DRAFTED"), (False, "OPEN")])
def test_cancelled_generation_without_stored_status_falls_back_on_draft(has_draft, expected):
    assert status_after_generation(None, GenerationOutcome.CANCELLED, has_draft=has_draft) == expected


def test_start_generation_remembers_current_status():
    job = make_job(status="INTERVIEW")
    start_generation(job)
    assert (job.status, job.pre_generation_status) == ("GENERATING", "INTERVIEW")


def test_start_generation_twice_keeps_first_stored_status():
    job = make_job(status="INTERVIEW")
    start_generation(job)
    start_generation(job)
    assert job.pre_generation_status == "INTERVIEW"


def test_finish_generation_applies_rule_and_clears_stored_status():
    job = make_job(status="GENERATING", pre_generation_status="OFFER")
    finish_generation(job, GenerationOutcome.COMPLETED)
    assert (job.status, job.pre_generation_status) == ("OFFER", None)
