from unittest.mock import MagicMock, patch

import pytest

from database.core import JobDocument, JobEntry, ProfileDocument
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
from workers.tasks.time_limits import GENERATION_FAILED_ERROR
from workers.tasks.package import generate_application_package_task

CV_RESULT = ("<p>Tailored CV</p>", {})
LETTER_RESULT = ("Dear team", "<p>Dear team</p>")
WITHOUT_PROFILE_DOCUMENTS = False
WITH_PROFILE_DOCUMENTS = True
AI_ERROR = "AI timeout"


@pytest.fixture()
def run_package(session_factory, seed, fake_redis):
    """Run the package task on the given job; the AI-plus-render builders are replaced by fakes."""
    def _run(job, build_cv=None, documents=()):
        seed(make_user(), make_profile(), job, *documents)
        cv_fake = {"side_effect": build_cv} if build_cv else {"return_value": CV_RESULT}
        with patch("workers.tasks.package.SessionLocal", session_factory), \
             patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.package.get_client_and_model", return_value=(None, "test-model")), \
             patch("workers.tasks.package._build_cv", **cv_fake), \
             patch("workers.tasks.package._build_letter", return_value=LETTER_RESULT):
            generate_application_package_task("job-1", TEST_USER_ID, WITHOUT_PROFILE_DOCUMENTS)
    return _run


@pytest.fixture()
def cancel_during_build(session_factory):
    """A _build_cv fake that cancels the job from another session, as the cancel endpoint would mid-run."""
    def _cancel():
        with session_factory() as other:
            other.get(JobEntry, "job-1").status = "DRAFTED"
            other.commit()

    def _build_then_cancel(*_args):
        _cancel()
        return CV_RESULT

    def _cancel_then_fail(*_args):
        _cancel()
        raise RuntimeError(AI_ERROR)
    return _build_then_cancel, _cancel_then_fail


def _document_kinds(session_factory) -> list:
    with session_factory() as db:
        return sorted(doc.kind for doc in db.query(JobDocument).all())


def _job_state(session_factory) -> tuple:
    job = fetch(session_factory, JobEntry, "job-1")
    return job.status, job.pre_generation_status, job.generation_error


def test_package_results_discarded_when_cancelled_mid_run(run_package, cancel_during_build, session_factory, fake_redis):
    build_then_cancel, _ = cancel_during_build
    run_package(make_job(status="GENERATING"), build_cv=build_then_cancel)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.cv_html, _document_kinds(session_factory)) == ("DRAFTED", None, [])
    assert events_of_type(fake_redis, "job_update") == []


def test_package_failure_after_cancel_neither_writes_nor_publishes(run_package, cancel_during_build, session_factory, fake_redis):
    _, cancel_then_fail = cancel_during_build
    run_package(make_job(status="GENERATING"), build_cv=cancel_then_fail)
    assert _job_state(session_factory) == ("DRAFTED", None, None)
    assert events_of_type(fake_redis, "job_update") == []


def test_package_results_stored_as_html_only_while_still_generating(run_package, session_factory):
    run_package(make_job(status="GENERATING"))
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.cv_html, job.cover_letter_html) == ("DRAFTED", "<p>Tailored CV</p>", "<p>Dear team</p>")
    assert _document_kinds(session_factory) == []


def _stored_pdf(doc_id, kind) -> JobDocument:
    return JobDocument(
        id=doc_id, job_id="job-1", user_id=TEST_USER_ID, filename="db://old.pdf",
        original_filename="old.pdf", mime_type="application/pdf", content=b"%PDF", kind=kind,
    )


def test_package_regeneration_retires_the_pdfs_an_earlier_generation_stored(run_package, session_factory):
    earlier = (_stored_pdf(1, "GENERATED_CV"), _stored_pdf(2, "GENERATED_LETTER"), _stored_pdf(3, "UPLOADED"))
    run_package(make_job(status="GENERATING"), documents=earlier)
    assert _document_kinds(session_factory) == ["UPLOADED"]


def test_package_completion_restores_advanced_status(run_package, session_factory):
    run_package(make_job(status="GENERATING", pre_generation_status="APPLIED"))
    assert _job_state(session_factory) == ("APPLIED", None, None)


def _fail(*_args):
    raise RuntimeError(AI_ERROR)


def test_package_failure_restores_advanced_status_and_keeps_error(run_package, session_factory, fake_redis):
    run_package(make_job(status="GENERATING", pre_generation_status="INTERVIEW"), build_cv=_fail)
    assert _job_state(session_factory) == ("INTERVIEW", None, GENERATION_FAILED_ERROR)
    assert events_of_type(fake_redis, "job_update")[0]["status"] == "INTERVIEW"


def test_package_failure_from_early_status_marks_failed(run_package, session_factory):
    run_package(make_job(status="GENERATING", pre_generation_status="OPEN"), build_cv=_fail)
    assert _job_state(session_factory) == ("FAILED", None, GENERATION_FAILED_ERROR)


PROFILE_MISSING_ERROR = "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen."
OTHER_USER_ID = 502
FIRST_PROFILE_ID = 1


def _run_without_own_profile(job, session_factory, seed, fake_redis, build_cv):
    seed(make_user(), make_user(OTHER_USER_ID), job,
         make_profile(id=FIRST_PROFILE_ID, user_id=OTHER_USER_ID, role="Other user's role"))
    with patch("workers.tasks.package.SessionLocal", session_factory), \
         patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.package.get_client_and_model", return_value=(None, "test-model")), \
         patch("workers.tasks.package._build_cv", build_cv), \
         patch("workers.tasks.package._build_letter", build_cv):
        generate_application_package_task("job-1", TEST_USER_ID, WITHOUT_PROFILE_DOCUMENTS)


def test_package_never_uses_another_users_profile(session_factory, seed, fake_redis):
    build_cv = MagicMock()
    _run_without_own_profile(make_job(status="GENERATING", pre_generation_status="OPEN"),
                             session_factory, seed, fake_redis, build_cv)
    build_cv.assert_not_called()
    assert _job_state(session_factory) == ("FAILED", None, PROFILE_MISSING_ERROR)
    assert events_of_type(fake_redis, "job_update")[0]["user_id"] == TEST_USER_ID


def test_package_profile_incomplete_after_cancel_keeps_restored_status(session_factory, seed, fake_redis):
    _run_without_own_profile(make_job(status="DRAFTED"), session_factory, seed, fake_redis, MagicMock())
    assert _job_state(session_factory) == ("DRAFTED", None, None)
    assert events_of_type(fake_redis, "job_update") == []


def _attached_names(session_factory) -> list:
    with session_factory() as db:
        docs = db.query(JobDocument).filter(JobDocument.kind.like("ATTACHED_%")).all()
        return sorted((doc.kind, doc.original_filename) for doc in docs)


def _profile_document(doc_id, doc_type, name) -> ProfileDocument:
    return ProfileDocument(
        id=doc_id, user_id=TEST_USER_ID, doc_type=doc_type, filename=f"db://{name}",
        original_filename=name, mime_type="application/pdf", content=b"%PDF",
    )


def _run_with_profile_documents(session_factory, fake_redis):
    with patch("workers.tasks.package.SessionLocal", session_factory), \
         patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.package.get_client_and_model", return_value=(None, "test-model")), \
         patch("workers.tasks.package._build_cv", return_value=CV_RESULT), \
         patch("workers.tasks.package._build_letter", return_value=LETTER_RESULT):
        generate_application_package_task("job-1", TEST_USER_ID, WITH_PROFILE_DOCUMENTS)


EXPECTED_ATTACHED = [
    ("ATTACHED_CERT", "a.pdf"), ("ATTACHED_CERT", "b.pdf"), ("ATTACHED_REFERENCE", "ref.pdf"),
]


def _seed_three_profile_documents(seed):
    seed(make_user(), make_profile(), make_job(status="GENERATING"),
         _profile_document(1, "CERTIFICATE", "a.pdf"), _profile_document(2, "CERTIFICATE", "b.pdf"),
         _profile_document(3, "REFERENCE", "ref.pdf"))


def test_package_keeps_all_attached_documents_of_the_same_kind(session_factory, seed, fake_redis):
    _seed_three_profile_documents(seed)
    _run_with_profile_documents(session_factory, fake_redis)
    assert _attached_names(session_factory) == EXPECTED_ATTACHED


def test_package_regeneration_replaces_attached_documents_without_duplicates(session_factory, seed, fake_redis):
    _seed_three_profile_documents(seed)
    _run_with_profile_documents(session_factory, fake_redis)
    with session_factory() as db:
        db.get(JobEntry, "job-1").status = "GENERATING"
        db.commit()
    _run_with_profile_documents(session_factory, fake_redis)
    assert _attached_names(session_factory) == EXPECTED_ATTACHED


def test_package_keeps_earlier_attachments_when_no_profile_document_is_copyable(session_factory, seed, fake_redis):
    _seed_three_profile_documents(seed)
    _run_with_profile_documents(session_factory, fake_redis)
    with session_factory() as db:
        db.query(ProfileDocument).update({ProfileDocument.content: None})
        db.get(JobEntry, "job-1").status = "GENERATING"
        db.commit()
    _run_with_profile_documents(session_factory, fake_redis)
    assert _attached_names(session_factory) == EXPECTED_ATTACHED
