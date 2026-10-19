"""Company research started from a job: the typed domain, AI identification of an empty one, durable run state."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest
from openai import APIConnectionError, APIStatusError, APITimeoutError

from database.core import CompanyProfile, JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_platform, make_profile, make_user
from workers.tasks.research import AI_CONNECTION_RETRY_DELAY_SECONDS, research_job_company_task
from workers.tasks.time_limits import (
    RESEARCH_AI_UNREACHABLE,
    RESEARCH_DOMAIN_NOT_FOUND,
    RESEARCH_FAILED,
    RESEARCH_HARD_TIME_LIMIT_SECONDS,
    RESEARCH_SOFT_TIME_LIMIT_SECONDS,
)

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

TYPED_DOMAIN = "wwww.bahn.de"
DERIVED_DOMAIN = "google.com"
IDENTIFIED_DOMAIN = "bahn.de"
POSTING_URL = "https://www.google.com/url?q=https://jobs.bahn.de/1"
PROFILE_ANSWER = '{"executive_summary": {"assessment": "Stabil"}, "deep_dive_buttons": []}'
EARLIER_START = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)
OPENROUTER_REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
RESEARCH_PATH = "/jobs/job-1/company-research"


def _answer(content):
    return MagicMock(choices=[MagicMock(message=MagicMock(content=content))])


def _client_answering(*contents):
    """AI client stand-in (the system boundary): answers each request with the next content."""
    client = MagicMock()
    client.chat.completions.create.side_effect = [_answer(content) for content in contents]
    return client


def _server_error():
    response = httpx.Response(502, request=OPENROUTER_REQUEST)
    return APIStatusError("bad gateway", response=response, body=None)


def _connection_error():
    return APIConnectionError(request=OPENROUTER_REQUEST)


def _timeout_error():
    return APITimeoutError(request=OPENROUTER_REQUEST)


def _client_failing_then_answering(error, *contents):
    """AI client stand-in whose first request fails with *error*, the next ones answer *contents*."""
    client = MagicMock()
    client.chat.completions.create.side_effect = [error, *(_answer(content) for content in contents)]
    return client


def _prompts(client) -> list:
    return [str(call.kwargs["messages"]) for call in client.chat.completions.create.call_args_list]


# --- endpoint ---------------------------------------------------------------------------------------


def test_typed_domain_is_researched_as_typed_never_replaced_by_the_stored_one(api_client, seed, session_factory):
    seed(make_job(company_domain=DERIVED_DOMAIN, url=POSTING_URL))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        response = api_client.post(RESEARCH_PATH, json={"company_domain": TYPED_DOMAIN})
    assert response.json() == {"status": "queued", "domain": TYPED_DOMAIN}
    assert fetch(session_factory, JobEntry, "job-1").company_domain == TYPED_DOMAIN
    assert send_task.call_args.args[0] == "worker.research_job_company_task"
    assert send_task.call_args.kwargs["args"] == ["job-1", TEST_USER_ID, False]


def test_starting_a_research_marks_it_running_and_clears_an_old_error(api_client, seed, session_factory):
    seed(make_job(company_research_error=RESEARCH_FAILED))
    with patch("routers.jobs.celery_app.send_task"):
        api_client.post(RESEARCH_PATH, json={"company_domain": IDENTIFIED_DOMAIN})
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.company_research_started_at is not None, job.company_research_error) == (True, None)


def test_an_empty_domain_clears_the_stored_one_so_the_worker_identifies_it(api_client, seed, session_factory):
    seed(make_job(company_domain=DERIVED_DOMAIN))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        response = api_client.post(RESEARCH_PATH, json={"company_domain": None})
    assert response.json() == {"status": "queued", "domain": None}
    assert fetch(session_factory, JobEntry, "job-1").company_domain is None
    send_task.assert_called_once()


def test_an_invalid_domain_is_a_field_error_and_starts_nothing(api_client, seed, session_factory):
    seed(make_job(company_domain=DERIVED_DOMAIN))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        response = api_client.post(RESEARCH_PATH, json={"company_domain": "1.2.3.4"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "company_domain"]
    assert fetch(session_factory, JobEntry, "job-1").company_domain == DERIVED_DOMAIN
    send_task.assert_not_called()


def test_an_existing_profile_is_linked_without_a_new_research(api_client, seed, session_factory):
    seed(make_job(company_research_error=RESEARCH_FAILED), CompanyProfile(domain=IDENTIFIED_DOMAIN, name="DB"))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        response = api_client.post(RESEARCH_PATH, json={"company_domain": IDENTIFIED_DOMAIN})
    assert response.json() == {"status": "exists", "domain": IDENTIFIED_DOMAIN}
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.company_domain, job.company_research_started_at, job.company_research_error) == (
        IDENTIFIED_DOMAIN, None, None,
    )
    send_task.assert_not_called()


def test_a_refresh_researches_an_existing_profile_again(api_client, seed):
    seed(make_job(), CompanyProfile(domain=IDENTIFIED_DOMAIN, name="DB"))
    body = {"company_domain": IDENTIFIED_DOMAIN, "force_refresh": True}
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post(RESEARCH_PATH, json=body).json()["status"] == "queued"
    assert send_task.call_args.kwargs["args"] == ["job-1", TEST_USER_ID, True]


def test_research_of_another_users_job_is_not_found(api_client, seed):
    seed(make_user(TEST_USER_ID + 1), make_job(user_id=TEST_USER_ID + 1))
    with patch("routers.jobs.celery_app.send_task") as send_task:
        assert api_client.post(RESEARCH_PATH, json={"company_domain": TYPED_DOMAIN}).status_code == 404
    send_task.assert_not_called()


def test_job_detail_exposes_the_research_run_state(api_client, seed):
    seed(make_job(company_research_started_at=EARLIER_START, company_research_error=None))
    body = api_client.get("/jobs/job-1").json()
    assert (body["company_research_running"], body["company_research_error"]) == (True, None)
    assert body["company_research_started_at"] == EARLIER_START.isoformat()


def test_job_detail_exposes_a_failed_research(api_client, seed):
    seed(make_job(company_research_error=RESEARCH_DOMAIN_NOT_FOUND))
    body = api_client.get("/jobs/job-1").json()
    assert (body["company_research_running"], body["company_research_error"]) == (False, RESEARCH_DOMAIN_NOT_FOUND)


# --- worker -----------------------------------------------------------------------------------------


@pytest.fixture()
def run_research(session_factory, seed, fake_redis):
    """Run worker.research_job_company_task with only the AI client faked."""
    def _run(client, job, *rows, force_refresh=False):
        seed(make_user(), make_profile(), job, *rows)
        with patch("workers.tasks.research.SessionLocal", session_factory), \
             patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
             patch("intelligence.service._get_redis", return_value=fake_redis), \
             patch("workers.tasks.research.get_client_and_model", return_value=(client, "test-model")), \
             patch("workers.tasks.research.time.sleep") as pause:
            _run.pauses = pause.call_args_list
            research_job_company_task("job-1", TEST_USER_ID, force_refresh)
        return fetch(session_factory, JobEntry, "job-1")
    return _run


def _stored_profile_domains(session_factory) -> list:
    with session_factory() as db:
        return [profile.domain for profile in db.query(CompanyProfile).all()]


def _ended_events(fake_redis) -> list:
    return events_of_type(fake_redis, "company_profile_ready")


def test_research_task_is_bounded_by_soft_and_hard_time_limits():
    assert research_job_company_task.soft_time_limit == RESEARCH_SOFT_TIME_LIMIT_SECONDS
    assert research_job_company_task.time_limit == RESEARCH_HARD_TIME_LIMIT_SECONDS


def test_typed_domain_is_the_researched_domain(run_research, session_factory, fake_redis):
    client = _client_answering(PROFILE_ANSWER)
    job = run_research(client, make_job(company_domain=TYPED_DOMAIN, url=POSTING_URL,
                                        company_research_started_at=EARLIER_START))
    assert _stored_profile_domains(session_factory) == [TYPED_DOMAIN]
    assert TYPED_DOMAIN in _prompts(client)[0] and DERIVED_DOMAIN not in _prompts(client)[0]
    assert (job.company_domain, job.company_research_started_at, job.company_research_error) == (
        TYPED_DOMAIN, None, None,
    )
    assert _ended_events(fake_redis) == [
        {"type": "company_profile_ready", "domain": TYPED_DOMAIN, "job_id": "job-1", "user_id": TEST_USER_ID}
    ]


def test_empty_domain_is_identified_by_the_ai_and_then_researched(run_research, session_factory):
    client = _client_answering('{"domain": "https://www.Bahn.de/karriere"}', PROFILE_ANSWER)
    job = run_research(client, make_job(company="Deutsche Bahn", title="Fahrdienstleiter", url=POSTING_URL))
    assert job.company_domain == IDENTIFIED_DOMAIN
    assert _stored_profile_domains(session_factory) == [IDENTIFIED_DOMAIN]
    identification_prompt = _prompts(client)[0]
    assert "Deutsche Bahn" in identification_prompt and "Fahrdienstleiter" in identification_prompt
    assert POSTING_URL in identification_prompt


@pytest.mark.parametrize("answer", ['{"domain": null}', '{"domain": "1.2.3.4"}', "keine Ahnung", '{"domain": 7}'])
def test_no_usable_domain_from_the_ai_ends_with_the_enter_domain_error(run_research, session_factory, fake_redis, answer):
    job = run_research(_client_answering(answer), make_job(url=POSTING_URL))
    assert (job.company_domain, job.company_research_started_at, job.company_research_error) == (
        None, None, RESEARCH_DOMAIN_NOT_FOUND,
    )
    assert _stored_profile_domains(session_factory) == []
    assert _ended_events(fake_redis) == [
        {"type": "company_profile_ready", "domain": None, "job_id": "job-1", "user_id": TEST_USER_ID}
    ]


@pytest.mark.parametrize("board_answer", ['{"domain": "google.com"}', '{"domain": "www.stepstone.de"}',
                                          '{"domain": "de.indeed.com"}'])
def test_a_job_board_or_redirect_host_is_never_taken_as_the_company_domain(run_research, session_factory, board_answer):
    job = run_research(_client_answering(board_answer), make_job(url=POSTING_URL))
    assert (job.company_domain, job.company_research_error) == (None, RESEARCH_DOMAIN_NOT_FOUND)
    assert _stored_profile_domains(session_factory) == []


def test_the_employers_own_posting_host_is_accepted(run_research):
    client = _client_answering('{"domain": "acme.de"}', PROFILE_ANSWER)
    job = run_research(client, make_job(url="https://www.acme.de/jobs/1"))
    assert (job.company_domain, job.company_research_error) == ("acme.de", None)


def test_the_employers_careers_page_as_source_host_is_accepted(run_research):
    client = _client_answering('{"domain": "karriere.acme.de"}', PROFILE_ANSWER)
    source = make_platform(url="https://karriere.acme.de/stellen")
    job = run_research(client, make_job(url="https://karriere.acme.de/stellen/1"), source)
    assert (job.company_domain, job.company_research_error) == ("karriere.acme.de", None)


def test_an_identified_domain_with_a_profile_is_linked_without_a_new_profile_call(run_research, session_factory):
    client = _client_answering('{"domain": "bahn.de"}')
    job = run_research(client, make_job(url=POSTING_URL), CompanyProfile(domain=IDENTIFIED_DOMAIN, name="DB"))
    assert (job.company_domain, job.company_research_error) == (IDENTIFIED_DOMAIN, None)
    assert client.chat.completions.create.call_count == 1


def test_a_failing_ai_ends_the_run_with_the_fixed_error_and_tells_the_owner(run_research, session_factory, fake_redis):
    client = MagicMock()
    client.chat.completions.create.side_effect = _server_error()
    with pytest.raises(APIStatusError):
        run_research(client, make_job(company_domain=TYPED_DOMAIN, company_research_started_at=EARLIER_START))
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.company_domain, job.company_research_started_at, job.company_research_error) == (
        TYPED_DOMAIN, None, RESEARCH_FAILED,
    )
    assert _ended_events(fake_redis) == [
        {"type": "company_profile_ready", "domain": TYPED_DOMAIN, "job_id": "job-1", "user_id": TEST_USER_ID}
    ]


def test_a_dropped_connection_on_the_identification_is_retried_once(run_research, session_factory):
    client = _client_failing_then_answering(_connection_error(), '{"domain": "bahn.de"}', PROFILE_ANSWER)
    job = run_research(client, make_job(url=POSTING_URL))
    assert (job.company_domain, job.company_research_error) == (IDENTIFIED_DOMAIN, None)
    assert _stored_profile_domains(session_factory) == [IDENTIFIED_DOMAIN]
    assert client.chat.completions.create.call_count == 3


def test_a_dropped_connection_on_the_profile_is_retried_once(run_research, session_factory):
    client = _client_failing_then_answering(_connection_error(), PROFILE_ANSWER)
    job = run_research(client, make_job(company_domain=TYPED_DOMAIN))
    assert (job.company_domain, job.company_research_error) == (TYPED_DOMAIN, None)
    assert _stored_profile_domains(session_factory) == [TYPED_DOMAIN]
    assert client.chat.completions.create.call_count == 2


def test_the_retry_waits_a_moment_before_the_second_attempt(run_research):
    run_research(_client_failing_then_answering(_connection_error(), PROFILE_ANSWER), make_job(company_domain=TYPED_DOMAIN))
    assert [call.args for call in run_research.pauses] == [(AI_CONNECTION_RETRY_DELAY_SECONDS,)]


def test_an_unreachable_ai_ends_the_run_with_the_ai_unreachable_code(run_research, session_factory, fake_redis):
    client = MagicMock()
    client.chat.completions.create.side_effect = _connection_error()
    with pytest.raises(APIConnectionError):
        run_research(client, make_job(url=POSTING_URL, company_research_started_at=EARLIER_START))
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.company_domain, job.company_research_started_at, job.company_research_error) == (
        None, None, RESEARCH_AI_UNREACHABLE,
    )
    assert client.chat.completions.create.call_count == 2
    assert _ended_events(fake_redis) == [
        {"type": "company_profile_ready", "domain": None, "job_id": "job-1", "user_id": TEST_USER_ID}
    ]


def test_a_timed_out_ai_request_is_not_retried_again_and_counts_as_unreachable(run_research, session_factory):
    client = _client_failing_then_answering(_timeout_error(), PROFILE_ANSWER)
    with pytest.raises(APITimeoutError):
        run_research(client, make_job(company_domain=TYPED_DOMAIN))
    job = fetch(session_factory, JobEntry, "job-1")
    assert job.company_research_error == RESEARCH_AI_UNREACHABLE
    assert client.chat.completions.create.call_count == 1
