from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from core.job_status import GenerationOutcome, finish_generation, mark_generation_running, start_generation
from database.core import JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
from workers.tasks.application import generate_application_task
from workers.tasks.generation_sweep import fail_stuck_generations
from workers.tasks.package import generate_application_package_task
from workers.tasks.time_limits import (
    GENERATION_HARD_TIME_LIMIT_SECONDS,
    GENERATION_SWEEP_MARGIN_SECONDS,
    GENERATION_TIMEOUT_ERROR,
)

STUCK_AGE = timedelta(seconds=GENERATION_HARD_TIME_LIMIT_SECONDS + GENERATION_SWEEP_MARGIN_SECONDS + 60)
FRESH_AGE = timedelta(seconds=GENERATION_HARD_TIME_LIMIT_SECONDS - 60)


def _started(age: timedelta) -> datetime:
    return datetime.now(timezone.utc) - age


def _sweep(session_factory, fake_redis):
    with patch("workers.tasks.generation_sweep.SessionLocal", session_factory), \
         patch("workers.tasks.generation_sweep.redis.from_url", return_value=fake_redis):
        fail_stuck_generations()


def test_stuck_early_job_is_failed_with_the_timeout_error(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING", generation_started_at=_started(STUCK_AGE)))
    _sweep(session_factory, fake_redis)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.generation_error, job.generation_started_at) == ("FAILED", GENERATION_TIMEOUT_ERROR, None)
    assert events_of_type(fake_redis, "job_update")[0]["user_id"] == TEST_USER_ID


def test_stuck_advanced_job_is_restored_to_its_status(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING", pre_generation_status="APPLIED",
                               generation_started_at=_started(STUCK_AGE)))
    _sweep(session_factory, fake_redis)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.pre_generation_status, job.generation_error) == ("APPLIED", None, GENERATION_TIMEOUT_ERROR)


def test_fresh_generation_is_left_alone(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING", generation_started_at=_started(FRESH_AGE)))
    _sweep(session_factory, fake_redis)
    assert fetch(session_factory, JobEntry, "job-1").status == "GENERATING"
    assert events_of_type(fake_redis, "job_update") == []


def test_job_that_is_not_generating_is_left_alone(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="DRAFTED", generation_started_at=_started(STUCK_AGE)))
    _sweep(session_factory, fake_redis)
    assert fetch(session_factory, JobEntry, "job-1").status == "DRAFTED"


def test_start_generation_leaves_the_start_time_to_the_worker_and_finish_clears_it():
    job = make_job()
    start_generation(job)
    assert job.generation_started_at is None
    job.generation_started_at = _started(FRESH_AGE)
    finish_generation(job, GenerationOutcome.COMPLETED)
    assert job.generation_started_at is None


def test_job_still_queued_without_a_worker_start_is_never_swept(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING", generation_started_at=None))
    _sweep(session_factory, fake_redis)
    assert fetch(session_factory, JobEntry, "job-1").status == "GENERATING"


def _run_package(session_factory, fake_redis, build_cv):
    with patch("workers.tasks.package.SessionLocal", session_factory), \
         patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.package.get_client_and_model", return_value=(None, "m")), \
         patch("workers.tasks.package._build_cv", side_effect=build_cv), \
         patch("workers.tasks.package._build_letter", return_value=("t", "<p>t</p>", b"%PDF")):
        generate_application_package_task("job-1", TEST_USER_ID, False)


def test_package_worker_stamps_its_start_before_doing_the_work(session_factory, seed, fake_redis):
    seed(make_user(), make_profile(), make_job(status="GENERATING"))
    seen = []

    def _build(*_args):
        seen.append(fetch(session_factory, JobEntry, "job-1").generation_started_at)
        return ("<p>cv</p>", b"%PDF", {})
    _run_package(session_factory, fake_redis, _build)
    assert seen[0] is not None


def test_letter_worker_stamps_its_start_before_doing_the_work(session_factory, seed, fake_redis):
    seed(make_user(), make_profile(), make_job(status="GENERATING"))
    seen = []

    def _generate(**_kwargs):
        seen.append(fetch(session_factory, JobEntry, "job-1").generation_started_at)
        return "Dear team"
    with patch("workers.tasks.application.SessionLocal", session_factory), \
         patch("workers.tasks.application.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.application.get_client_and_model", return_value=(None, "m")), \
         patch("workers.tasks.application.get_storage_service", return_value=None), \
         patch("workers.tasks.application.generate_application", side_effect=_generate), \
         patch("workers.tasks.application.render_cover_letter_html", return_value="<p>x</p>"), \
         patch("workers.tasks.application.render_cover_letter_pdf", return_value=b"%PDF"):
        generate_application_task("job-1", TEST_USER_ID)
    assert seen[0] is not None


def test_task_that_starts_late_after_a_sweep_keeps_its_result(session_factory, seed, fake_redis):
    seed(make_user(), make_profile(), make_job(status="GENERATING", pre_generation_status="OPEN"))
    _sweep(session_factory, fake_redis)
    _run_package(session_factory, fake_redis, lambda *_: ("<p>cv</p>", b"%PDF", {}))
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.generation_error, job.cv_html) == ("DRAFTED", None, "<p>cv</p>")


def test_cancelled_job_is_not_stamped_by_a_late_worker(session_factory, seed, fake_redis):
    seed(make_user(), make_profile(), make_job(status="DRAFTED"))
    _run_package(session_factory, fake_redis, lambda *_: ("<p>cv</p>", b"%PDF", {}))
    assert fetch(session_factory, JobEntry, "job-1").generation_started_at is None


def test_start_generation_clears_a_leftover_stamp():
    job = make_job(generation_started_at=_started(STUCK_AGE))
    start_generation(job)
    assert job.generation_started_at is None


def test_stale_worker_copy_cannot_stamp_a_job_cancelled_in_between(session_factory, seed):
    seed(make_user(), make_job(status="GENERATING"))
    with session_factory() as worker_db:
        stale_job = worker_db.get(JobEntry, "job-1")
        with session_factory() as other:
            other.get(JobEntry, "job-1").status = "DRAFTED"
            other.commit()
        mark_generation_running(worker_db, stale_job)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.generation_started_at) == ("DRAFTED", None)


def test_next_generation_after_such_a_cancel_is_not_swept(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="DRAFTED"))
    with session_factory() as db:
        job = db.get(JobEntry, "job-1")
        start_generation(job)
        db.commit()
    _sweep(session_factory, fake_redis)
    assert fetch(session_factory, JobEntry, "job-1").status == "GENERATING"
