from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from database.core import JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
from workers.tasks.posting_details import extract_posting_details_task
from workers.tasks.time_limits import (
    POSTING_DETAILS_FAILED,
    POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS,
    POSTING_DETAILS_NOTHING_NEW,
    POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS,
)

EARLIER_START = datetime(2026, 10, 16, 8, 0, tzinfo=timezone.utc)
ANSWER = (
    '{"contact_persons": [{"name": "Eva Muster", "role": "HR", "email": "eva@acme.de", "phone": ""}],'
    ' "recruiter_info": null,'
    ' "salary_benchmark": {"min": 60000, "max": 70000, "currency": "EUR", "period": "year", "note": ""}}'
)
NOTHING_FOUND_ANSWER = '{"contact_persons": [], "recruiter_info": null, "salary_benchmark": null}'


def _client_answering(content):
    client = MagicMock()
    client.chat.completions.create.return_value.choices = [MagicMock(message=MagicMock(content=content))]
    return client


def _client_raising(error):
    client = MagicMock()
    client.chat.completions.create.side_effect = error
    return client


@pytest.fixture()
def run_extraction(session_factory, seed, fake_redis):
    """Run worker.extract_posting_details_task with only the AI client faked (the system boundary)."""
    def _run(client, job=None):
        seed(make_user(), job or make_job(posting_details_started_at=EARLIER_START), make_profile())
        with patch("workers.tasks.posting_details.SessionLocal", session_factory), \
             patch("workers.tasks.posting_details.redis.from_url", return_value=fake_redis), \
             patch("intelligence.service._get_redis", return_value=fake_redis), \
             patch("workers.tasks.posting_details.get_client_and_model", return_value=(client, "test-model")):
            extract_posting_details_task("job-1", TEST_USER_ID)
    return _run


def _state(session_factory) -> tuple:
    job = fetch(session_factory, JobEntry, "job-1")
    return job.posting_details_started_at, job.posting_details_error


def test_task_is_bounded_by_soft_and_hard_time_limits():
    assert extract_posting_details_task.soft_time_limit == POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS
    assert extract_posting_details_task.time_limit == POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS


def test_success_fills_the_fields_marks_them_and_ends_the_run_with_an_event(run_extraction, session_factory, fake_redis):
    run_extraction(_client_answering(ANSWER))
    job = fetch(session_factory, JobEntry, "job-1")
    assert job.contact_persons[0]["name"] == "Eva Muster"
    assert job.salary_benchmark["min"] == 60000
    assert sorted(job.posting_extracted) == ["contact_persons", "salary_benchmark"]
    assert _state(session_factory) == (None, None)
    assert events_of_type(fake_redis, "posting_details_ended") == [
        {"type": "posting_details_ended", "user_id": TEST_USER_ID, "job_id": "job-1"}
    ]


def test_a_field_the_user_filled_meanwhile_is_kept(run_extraction, session_factory):
    own_salary = {"min": 90000, "max": 95000, "currency": "EUR", "period": "year", "note": ""}
    run_extraction(_client_answering(ANSWER), make_job(salary_benchmark=own_salary))
    job = fetch(session_factory, JobEntry, "job-1")
    assert job.salary_benchmark == own_salary
    assert job.posting_extracted == ["contact_persons"]


def test_an_answer_without_details_ends_with_the_nothing_new_code(run_extraction, session_factory, fake_redis):
    run_extraction(_client_answering(NOTHING_FOUND_ANSWER))
    assert _state(session_factory) == (None, POSTING_DETAILS_NOTHING_NEW)
    assert len(events_of_type(fake_redis, "posting_details_ended")) == 1


def test_an_answer_that_is_not_json_ends_with_the_nothing_new_code(run_extraction, session_factory):
    run_extraction(_client_answering("Sorry, no JSON"))
    assert _state(session_factory) == (None, POSTING_DETAILS_NOTHING_NEW)


def test_ai_failure_ends_with_the_fixed_failure_code_and_an_event(run_extraction, session_factory, fake_redis):
    with pytest.raises(SoftTimeLimitExceeded):
        run_extraction(_client_raising(SoftTimeLimitExceeded()))
    assert _state(session_factory) == (None, POSTING_DETAILS_FAILED)
    assert len(events_of_type(fake_redis, "posting_details_ended")) == 1


def test_success_clears_the_error_of_an_earlier_run(run_extraction, session_factory):
    run_extraction(_client_answering(ANSWER), make_job(posting_details_error=POSTING_DETAILS_FAILED))
    assert _state(session_factory) == (None, None)
