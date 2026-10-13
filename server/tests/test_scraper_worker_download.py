import inspect

import pytest
from unittest.mock import patch

from database.core import JobPlatform
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_user
from workers import scraper_worker

CRAWL_ID = "crawl-1"
JOB_URL = "https://unreachable.example/job/1"


def test_download_failure_records_unreachable_code(session_factory, seed, fake_redis):
    seed(make_user(), make_platform())
    fake_redis.hgetall.return_value = {
        b"user_id": str(TEST_USER_ID).encode(), b"platform_id": str(TEST_PLATFORM_ID).encode(),
    }
    fake_redis.hget.return_value = b"crawling"
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.SessionLocal", session_factory), \
         patch("workers.scraper_worker.get_html", return_value=None):
        scraper_worker.scrape_job_detail_task(JOB_URL, TEST_USER_ID, CRAWL_ID)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "unreachable"


@pytest.mark.parametrize("task", [scraper_worker.fetch_links_task, scraper_worker.scrape_job_detail_task])
def test_scraper_tasks_require_the_owning_user(task):
    assert inspect.signature(task.run).parameters["user_id"].default is inspect.Parameter.empty
