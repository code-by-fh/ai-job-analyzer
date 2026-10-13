"""A worker failure really ends the crawl: the run is stored, the lock is freed, the hash is gone and the web hears it."""

import json
from unittest.mock import patch

import pytest

from core.crawl_registry import acquire_crawl_lock
from database.core import JobPlatform
from tests.crawl_locks import Clock, lock_backed
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_profile, make_user
from workers import scraper_worker
from workers.crawl_control import AI_FAILURE, fail_crawl_job
from workers.tasks.analyze import analyze_job_task

CRAWL_ID = "crawl-1"
CRAWL_KEY = f"crawl_job:{CRAWL_ID}"
JOB_DATA = {
    "id": "job-1", "title": "Engineer", "company": "Acme", "description": "Build",
    "url": "https://acme.example/1", "user_id": TEST_USER_ID, "platform_id": None, "crawl_job_id": CRAWL_ID,
}


def _published_types(fake_redis) -> list:
    return [json.loads(call.args[1])["type"] for call in fake_redis.publish.call_args_list]


@pytest.fixture()
def running_crawl(fake_redis, seed):
    """A crawl of the test platform that holds its lock, on a stateful byte-mode Redis."""
    seed(make_user(), make_profile(), make_platform())
    state = lock_backed(fake_redis, Clock())
    state.hset(CRAWL_KEY, mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID, "status": "crawling"})
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, CRAWL_ID)
    return state


def test_an_analysis_error_ends_the_crawl(running_crawl, fake_redis, session_factory):
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "m")), \
         patch("workers.tasks.analyze.analyze_job", side_effect=RuntimeError("model down")):
        analyze_job_task(dict(JOB_DATA))
    assert (CRAWL_KEY in running_crawl.hashes, running_crawl.strings) == (False, {})
    assert "crawl_job_failed" in _published_types(fake_redis)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "failed"


def test_failing_a_crawl_that_already_ended_sends_no_second_end_event(fake_redis):
    lock_backed(fake_redis, Clock())
    fail_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, AI_FAILURE)
    assert _published_types(fake_redis) == []


def _scrape_unreachable_detail(fake_redis, session_factory):
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.SessionLocal", session_factory), \
         patch("workers.scraper_worker.get_html", return_value=None):
        scraper_worker.scrape_job_detail_task("https://jobs.example.com/job/1", TEST_USER_ID, CRAWL_ID)


def test_a_dead_detail_link_stops_the_sibling_tasks(running_crawl, fake_redis, session_factory):
    _scrape_unreachable_detail(fake_redis, session_factory)
    fake_redis.setex.assert_any_call(f"{CRAWL_KEY}:cancelled", 600, "1")
    assert (CRAWL_KEY in running_crawl.hashes, running_crawl.strings) == (False, {})


def test_a_dead_detail_link_stores_the_run_before_the_end_event(running_crawl, fake_redis, session_factory):
    stored_at_publish = []
    fake_redis.publish.side_effect = lambda channel, message: stored_at_publish.append(
        fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run
    )
    _scrape_unreachable_detail(fake_redis, session_factory)
    assert [run["error"] for run in stored_at_publish] == ["unreachable"]


def test_an_unreachable_start_page_is_stored_as_unreachable(running_crawl, fake_redis, session_factory):
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=None):
        scraper_worker.fetch_links_task("https://jobs.example.com/search", TEST_USER_ID, CRAWL_ID, TEST_PLATFORM_ID)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "unreachable"


def test_failing_a_completed_crawl_publishes_and_deletes_nothing(fake_redis):
    state = lock_backed(fake_redis, Clock())
    state.hset(CRAWL_KEY, mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID, "status": "completed"})
    fail_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, AI_FAILURE)
    assert (_published_types(fake_redis), CRAWL_KEY in state.hashes) == ([], True)
