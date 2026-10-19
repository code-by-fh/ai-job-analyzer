from unittest.mock import patch

import pytest

from database.core import JobDocument, JobEntry
from tests.factories import (
    OTHER_USER_ID, TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_template, make_user,
)
from workers.tasks.time_limits import GENERATION_FAILED_ERROR
from workers.tasks.application import generate_application_task

LETTER_TEXT = "Dear team"
AI_ERROR = "AI timeout"
NO_PROFILE = False


def _profile_rows(profile) -> list:
    """None seeds the default profile, NO_PROFILE seeds none."""
    if profile is NO_PROFILE:
        return []
    return [make_profile() if profile is None else profile]


@pytest.fixture()
def run_letter(session_factory, seed, fake_redis):
    """Run ai.generate_application on the given job with the AI call and the renderers faked."""
    def _run(job, generate=None, profile=None, documents=()):
        seed(make_user(), job, *_profile_rows(profile), *documents)
        ai_fake = {"side_effect": generate} if generate else {"return_value": LETTER_TEXT}
        with patch("workers.tasks.application.SessionLocal", session_factory), \
             patch("workers.tasks.application.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.application.get_client_and_model", return_value=(None, "test-model")), \
             patch("workers.tasks.application.generate_application", **ai_fake), \
             patch("workers.tasks.application.render_cover_letter_html", return_value="<p>Dear team</p>"):
            generate_application_task("job-1", TEST_USER_ID)
    return _run


def _job_state(session_factory) -> tuple:
    job = fetch(session_factory, JobEntry, "job-1")
    return job.status, job.pre_generation_status, job.generation_error


def _fail(**_kwargs):
    raise RuntimeError(AI_ERROR)


def test_letter_completion_restores_advanced_status(run_letter, session_factory):
    run_letter(make_job(status="GENERATING", pre_generation_status="OFFER"))
    assert _job_state(session_factory) == ("OFFER", None, None)


def test_letter_completion_from_open_drafts(run_letter, session_factory):
    run_letter(make_job(status="GENERATING", pre_generation_status="OPEN"))
    assert _job_state(session_factory) == ("DRAFTED", None, None)


def test_letter_failure_restores_advanced_status_and_keeps_error(run_letter, session_factory):
    run_letter(make_job(status="GENERATING", pre_generation_status="APPLIED"), generate=_fail)
    assert _job_state(session_factory) == ("APPLIED", None, GENERATION_FAILED_ERROR)


def test_letter_failure_from_early_status_marks_failed(run_letter, session_factory):
    run_letter(make_job(status="GENERATING"), generate=_fail)
    assert _job_state(session_factory) == ("FAILED", None, GENERATION_FAILED_ERROR)


FOREIGN_TEMPLATE_ID = 42


def test_letter_ignores_other_users_template(run_letter, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_template(
        id=FOREIGN_TEMPLATE_ID, user_id=OTHER_USER_ID, doc_type="COVER_LETTER", html="<p>foreign</p>",
    ))
    run_letter(make_job(status="GENERATING"), profile=make_profile(cover_letter_template=str(FOREIGN_TEMPLATE_ID)))
    assert fetch(session_factory, JobEntry, "job-1").cover_letter_html == "<p>Dear team</p>"


PROFILE_MISSING_ERROR = "Profile incomplete. Please add your resume in the settings."
FIRST_PROFILE_ID = 1


def _other_users_first_profile():
    return make_profile(id=FIRST_PROFILE_ID, user_id=OTHER_USER_ID, role="Other user's role")


def test_letter_never_uses_another_users_profile(run_letter, seed, session_factory, fake_redis):
    seed(make_user(OTHER_USER_ID), _other_users_first_profile())
    ai_calls = []
    run_letter(
        make_job(status="GENERATING", pre_generation_status="OPEN"),
        generate=lambda **kwargs: ai_calls.append(kwargs), profile=NO_PROFILE,
    )
    assert ai_calls == []
    assert _job_state(session_factory) == ("FAILED", None, PROFILE_MISSING_ERROR)
    assert events_of_type(fake_redis, "job_update")[0]["user_id"] == TEST_USER_ID


def test_letter_profile_missing_after_cancel_keeps_restored_status(run_letter, session_factory, fake_redis):
    run_letter(make_job(status="DRAFTED"), profile=NO_PROFILE)
    assert _job_state(session_factory) == ("DRAFTED", None, None)
    assert events_of_type(fake_redis, "job_update") == []
    assert events_of_type(fake_redis, "global_error") == []


def _cancel_then_fail(session_factory):
    def _generate(**_kwargs):
        with session_factory() as other:
            other.get(JobEntry, "job-1").status = "DRAFTED"
            other.commit()
        raise RuntimeError(AI_ERROR)
    return _generate


def test_letter_failure_after_cancel_keeps_restored_status(run_letter, session_factory, fake_redis):
    run_letter(make_job(status="GENERATING"), generate=_cancel_then_fail(session_factory))
    assert _job_state(session_factory) == ("DRAFTED", None, None)
    assert events_of_type(fake_redis, "job_update") == []


def _stored_pdf(doc_id, kind) -> JobDocument:
    return JobDocument(
        id=doc_id, job_id="job-1", user_id=TEST_USER_ID, filename="db://old.pdf",
        original_filename="old.pdf", mime_type="application/pdf", content=b"%PDF", kind=kind,
    )


def _document_kinds(session_factory) -> list:
    with session_factory() as db:
        return sorted(doc.kind for doc in db.query(JobDocument).all())


def test_letter_is_stored_as_html_only_and_retires_the_earlier_letter_pdf(run_letter, session_factory):
    earlier = (_stored_pdf(1, "GENERATED_CV"), _stored_pdf(2, "GENERATED_LETTER"))
    run_letter(make_job(status="GENERATING"), documents=earlier)
    assert fetch(session_factory, JobEntry, "job-1").cover_letter_html == "<p>Dear team</p>"
    assert _document_kinds(session_factory) == ["GENERATED_CV"]
