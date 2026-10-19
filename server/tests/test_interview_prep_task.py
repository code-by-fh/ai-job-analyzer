from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest
from celery.exceptions import SoftTimeLimitExceeded
from openai import APITimeoutError

from database.core import JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
from workers.tasks.research import generate_interview_prep_task
from workers.tasks.time_limits import (
    GENERATION_FAILED_ERROR,
    PREP_HARD_TIME_LIMIT_SECONDS,
    PREP_SOFT_TIME_LIMIT_SECONDS,
)

PREP_ANSWER = '```json\n{"report_output": {"executive_summary": "Du passt."}, "deep_dive_buttons": []}\n```'
EARLIER_START = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)
OPENROUTER_REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")


def _client_answering(content):
    client = MagicMock()
    client.chat.completions.create.return_value.choices = [MagicMock(message=MagicMock(content=content))]
    return client


def _client_raising(error):
    client = MagicMock()
    client.chat.completions.create.side_effect = error
    return client


def _client_without_choices():
    """OpenRouter answers 200 OK with an error body: the SDK yields a completion without choices."""
    client = MagicMock()
    client.chat.completions.create.return_value.choices = None
    return client


@pytest.fixture()
def run_prep(session_factory, seed, fake_redis):
    """Run worker.generate_interview_prep_task with only the AI client faked (the system boundary)."""
    def _run(client, job=None):
        seed(make_user(), job or make_job(interview_prep_started_at=EARLIER_START), make_profile())
        with patch("workers.tasks.research.SessionLocal", session_factory), \
             patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
             patch("intelligence.service._get_redis", return_value=fake_redis), \
             patch("workers.tasks.research.get_client_and_model", return_value=(client, "test-model")):
            generate_interview_prep_task("job-1", TEST_USER_ID)
    return _run


def _prep_state(session_factory) -> tuple:
    job = fetch(session_factory, JobEntry, "job-1")
    return job.interview_prep_started_at, job.interview_prep_error


def test_prep_task_is_bounded_by_soft_and_hard_time_limits():
    assert generate_interview_prep_task.soft_time_limit == PREP_SOFT_TIME_LIMIT_SECONDS
    assert generate_interview_prep_task.time_limit == PREP_HARD_TIME_LIMIT_SECONDS


def test_prep_success_stores_material_ends_running_state_and_publishes_ready(run_prep, session_factory, fake_redis):
    run_prep(_client_answering(PREP_ANSWER))
    assert '"executive_summary": "Du passt."' in fetch(session_factory, JobEntry, "job-1").interview_prep_material
    assert _prep_state(session_factory) == (None, None)
    assert events_of_type(fake_redis, "interview_prep_ready") == [
        {"type": "interview_prep_ready", "job_id": "job-1", "user_id": TEST_USER_ID}
    ]


def test_prep_success_clears_the_error_of_an_earlier_failed_run(run_prep, session_factory):
    run_prep(_client_answering(PREP_ANSWER), make_job(interview_prep_error=GENERATION_FAILED_ERROR))
    assert _prep_state(session_factory) == (None, None)


def test_prep_hitting_the_soft_time_limit_ends_with_the_fixed_error(run_prep, session_factory, fake_redis):
    with pytest.raises(SoftTimeLimitExceeded):
        run_prep(_client_raising(SoftTimeLimitExceeded()))
    assert _prep_state(session_factory) == (None, GENERATION_FAILED_ERROR)
    assert len(events_of_type(fake_redis, "interview_prep_ready")) == 1


def test_prep_ai_timeout_ends_with_the_fixed_error_without_retry(run_prep, session_factory, fake_redis):
    with pytest.raises(APITimeoutError):
        run_prep(_client_raising(APITimeoutError(request=OPENROUTER_REQUEST)))
    assert _prep_state(session_factory) == (None, GENERATION_FAILED_ERROR)
    assert len(events_of_type(fake_redis, "interview_prep_ready")) == 1


def test_prep_answer_without_choices_ends_with_the_fixed_error(run_prep, session_factory):
    with pytest.raises(ValueError, match="no choices"):
        run_prep(_client_without_choices())
    assert _prep_state(session_factory) == (None, GENERATION_FAILED_ERROR)
    assert fetch(session_factory, JobEntry, "job-1").interview_prep_material is None


def test_prep_failure_keeps_an_existing_prep(run_prep, session_factory):
    with pytest.raises(APITimeoutError):
        run_prep(_client_raising(APITimeoutError(request=OPENROUTER_REQUEST)),
                 make_job(interview_prep_material='{"report_output": {}}'))
    assert fetch(session_factory, JobEntry, "job-1").interview_prep_material == '{"report_output": {}}'


def test_prep_worker_restamps_the_running_state_when_it_starts(run_prep, session_factory):
    seen = {}

    def _record_state(**_kwargs):
        seen["state"] = _prep_state(session_factory)
        raise APITimeoutError(request=OPENROUTER_REQUEST)

    with pytest.raises(APITimeoutError):
        run_prep(_client_raising(_record_state), make_job(interview_prep_error=GENERATION_FAILED_ERROR))
    started_at, error = seen["state"]
    assert started_at is not None
    assert error is None
