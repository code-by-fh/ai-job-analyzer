"""A late ai.save_job_basic of a cancelled or reaped crawl must not recreate the crawl hash (no TTL, never reaped)."""

from unittest.mock import patch

import pytest

from database.core import JobEntry
from tests.factories import TEST_USER_ID, fetch, make_user
from workers.tasks.analyze import save_job_basic_task

CRAWL_ID = "crawl-1"
JOB_DATA = {
    "id": "job-1", "title": "Engineer", "company": "Acme", "description": "Build",
    "url": "https://acme.example/1", "user_id": TEST_USER_ID, "platform_id": None, "crawl_job_id": CRAWL_ID,
}
REDIS_WRITES = ("hincrby", "hset", "lpush", "publish", "eval", "expire", "sadd")


def _cancelled(key: str) -> bool:
    return True


def _hash_missing(key: str) -> bool:
    return False


@pytest.mark.parametrize("exists", [_cancelled, _hash_missing])
def test_a_stopped_crawl_gets_no_redis_write_and_no_job(session_factory, seed, fake_redis, exists):
    seed(make_user())
    fake_redis.exists.side_effect = exists
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis):
        save_job_basic_task(dict(JOB_DATA))
    written = [name for name in REDIS_WRITES if getattr(fake_redis, name).called]
    assert (written, fetch(session_factory, JobEntry, "job-1")) == ([], None)


def test_a_running_crawl_still_saves_the_job(session_factory, seed, fake_redis):
    seed(make_user())
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis):
        save_job_basic_task(dict(JOB_DATA))
    assert fetch(session_factory, JobEntry, "job-1") is not None
