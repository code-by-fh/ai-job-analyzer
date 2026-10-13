import asyncio
from unittest.mock import MagicMock, patch

import pytest
from openai import APIConnectionError

import scraper_api
from core.crawl_errors import CRAWL_AI_ERROR_MESSAGE, CRAWL_INTERNAL_ERROR_MESSAGE
from workers.crawl_control import CrawlFailure
from workers.tasks.platform_runs import ERROR_FAILED
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_platform, make_profile, make_user
from workers.scraper_worker import fetch_links_task, schedule_crawls_task
from workers.tasks.analyze import analyze_job_task
from workers.tasks.urls import filter_urls_task

SECRET = "postgres://user:hunter2@internal-host/db"
CRAWL_ID = "crawl-1"
PLATFORM_ID = 12
JOB_DATA = {
    "id": "job-1", "title": "Engineer", "company": "Acme", "description": "Build",
    "url": "https://acme.example/1", "user_id": TEST_USER_ID, "platform_id": None, "crawl_job_id": CRAWL_ID,
}


def _assert_fixed(message: str, expected: str) -> None:
    assert message == expected
    assert "hunter2" not in message


@pytest.fixture()
def run_analysis(session_factory, seed, fake_redis):
    """Run ai.analyze_job with the LLM raising *error*; returns the message of the failure the crawl is failed with."""
    seed(make_user(), make_profile())

    def _run(error: Exception) -> str:
        with patch("workers.tasks.analyze.SessionLocal", session_factory), \
             patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "m")), \
             patch("workers.tasks.analyze.analyze_job", side_effect=error), \
             patch("workers.tasks.analyze.fail_crawl_job") as fail:
            analyze_job_task(dict(JOB_DATA))
        return fail.call_args.kwargs["failure"].message
    return _run


def test_analysis_ai_error_sends_fixed_ai_message(run_analysis):
    _assert_fixed(run_analysis(APIConnectionError(message=SECRET, request=MagicMock())), CRAWL_AI_ERROR_MESSAGE)


def test_analysis_internal_error_sends_fixed_internal_message(run_analysis):
    _assert_fixed(run_analysis(RuntimeError(SECRET)), CRAWL_INTERNAL_ERROR_MESSAGE)


def test_filter_urls_failure_sends_fixed_internal_message(session_factory, seed, fake_redis):
    seed(make_user(), make_platform(url_pattern="/job/"))
    with patch("workers.tasks.urls.SessionLocal", return_value=MagicMock(query=MagicMock(side_effect=RuntimeError(SECRET)))), \
         patch("workers.tasks.urls.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.urls.fail_crawl_job") as fail:
        filter_urls_task(["https://acme.example", ["https://acme.example/job/1"], TEST_USER_ID, CRAWL_ID, PLATFORM_ID])
    _assert_fixed(fail.call_args.kwargs["failure"].message, CRAWL_INTERNAL_ERROR_MESSAGE)


def test_fetch_links_failure_broadcasts_fixed_internal_message(fake_redis):
    fake_redis.hset.side_effect = RuntimeError(SECRET)
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.fail_crawl_job") as fail:
        fetch_links_task("https://acme.example", TEST_USER_ID, CRAWL_ID)
    _assert_fixed(fail.call_args.kwargs["failure"].message, CRAWL_INTERNAL_ERROR_MESSAGE)


def test_schedule_crawls_failure_broadcasts_fixed_internal_message(fake_redis):
    # The queueing call fails with a secret-bearing error; patched, it fails at once instead of waiting on a broker.
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.celery_app") as celery_app, \
         patch("workers.scraper_worker.fail_crawl_job") as fail:
        celery_app.send_task.side_effect = RuntimeError(SECRET)
        schedule_crawls_task([["https://acme.example/job/1"], TEST_USER_ID, CRAWL_ID, None])
    _assert_fixed(fail.call_args.kwargs["failure"].message, CRAWL_INTERNAL_ERROR_MESSAGE)


def test_fail_crawl_endpoint_hides_exception_text(monkeypatch, fake_redis):
    fake_redis.hgetall.return_value = {b"user_id": str(TEST_USER_ID).encode()}
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    request = scraper_api.FailCrawlRequest(job_id=CRAWL_ID, error_message="x")
    with patch("scraper_api.fail_crawl_job", side_effect=RuntimeError(SECRET)):
        response = asyncio.run(scraper_api.fail_crawl(request, current_user=make_user()))
    assert response == {"status": "error", "message": CRAWL_INTERNAL_ERROR_MESSAGE}


def test_fail_crawl_endpoint_fails_the_crawl_with_the_sent_text_as_a_failed_run(monkeypatch, fake_redis):
    fake_redis.hgetall.return_value = {b"user_id": str(TEST_USER_ID).encode()}
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    request = scraper_api.FailCrawlRequest(job_id=CRAWL_ID, error_message="Abgebrochen")
    with patch("scraper_api.fail_crawl_job") as fail:
        asyncio.run(scraper_api.fail_crawl(request, current_user=make_user()))
    assert fail.call_args.args[3] == CrawlFailure("Abgebrochen", ERROR_FAILED)


def test_cancel_crawl_endpoint_hides_exception_text(monkeypatch, fake_redis):
    fake_redis.hgetall.return_value = {b"user_id": str(TEST_USER_ID).encode()}
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    request = scraper_api.CancelCrawlRequest(job_id=CRAWL_ID)
    with patch("scraper_api.cleanup_crawl_job", side_effect=RuntimeError(SECRET)):
        response = asyncio.run(scraper_api.cancel_crawl(request, current_user=make_user()))
    assert response == {"status": "error", "message": CRAWL_INTERNAL_ERROR_MESSAGE}


def test_filter_urls_failure_logs_the_host_only(session_factory, seed, fake_redis):
    seed(make_user(), make_platform(url_pattern="/job/"))
    with patch("workers.tasks.urls.SessionLocal", return_value=MagicMock(query=MagicMock(side_effect=RuntimeError("x")))), \
         patch("workers.tasks.urls.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.urls.fail_crawl_job"), \
         patch("workers.tasks.urls.logger") as logger:
        filter_urls_task(["https://acme.example/search?token=abc", [], TEST_USER_ID, CRAWL_ID, PLATFORM_ID])
    logged = str(logger.error.call_args_list)
    assert ("acme.example" in logged, "token=abc" in logged, "/search" in logged) == (True, False, False)


def test_filter_urls_with_malformed_args_logs_no_url():
    with patch("workers.tasks.urls.logger") as logger:
        assert filter_urls_task(["https://acme.example/search?token=abc"]) == []
    logged = str(logger.error.call_args_list)
    assert ("1 items" in logged, "acme.example" in logged, "token=abc" in logged) == (True, False, False)


def test_filter_urls_ignores_the_platform_of_another_user(session_factory, seed, fake_redis):
    seed(make_user(), make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID, url_pattern="/job/"))
    with patch("workers.tasks.urls.SessionLocal", session_factory), \
         patch("workers.tasks.urls.redis.from_url", return_value=fake_redis):
        result = filter_urls_task(["https://acme.example", ["https://acme.example/job/1"], TEST_USER_ID, CRAWL_ID, PLATFORM_ID])
    assert result == [[], TEST_USER_ID, CRAWL_ID, PLATFORM_ID]
