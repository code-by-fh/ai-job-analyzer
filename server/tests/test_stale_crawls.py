"""The stale-crawl reaper: it removes crawls without progress only, records them as failed and frees the platform."""

import json
import time
from unittest.mock import patch

import pytest

from core.crawl_registry import (
    CRAWL_TTL_SECONDS,
    MILLISECONDS_PER_SECOND,
    STALE_NO_PROGRESS_SECONDS,
    QUEUED_STATUS,
    acquire_crawl_lock,
)
from database.core import JobPlatform, PlatformRun
from tests.crawl_locks import Clock, lock_backed
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_user
from workers.crawl_control import reap_stalled_crawls

CRAWL_ID = "crawl-1"
CRAWL_KEY = f"crawl_job:{CRAWL_ID}"
LOCK_KEY = f"crawl_lock:{TEST_USER_ID}:{TEST_PLATFORM_ID}"
FIVE_MINUTES = 5 * 60
BEYOND_THRESHOLD = STALE_NO_PROGRESS_SECONDS + 60


def _ms_ago(seconds: int) -> str:
    return str(int((time.time() - seconds) * MILLISECONDS_PER_SECOND))


def _crawl(fake_redis, started_ago: int, progress_ago: int = None, status: str = "crawling"):
    state = lock_backed(fake_redis, Clock(), decoded=True)
    fields = {"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID, "status": status, "started_at": _ms_ago(started_ago)}
    if progress_ago is not None:
        fields["last_progress_at"] = _ms_ago(progress_ago)
    state.hset(CRAWL_KEY, mapping=fields)
    state.sets[f"user:{TEST_USER_ID}:active_crawls"] = {CRAWL_ID.encode()}
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, CRAWL_ID)
    return state


def test_a_crawl_with_fresh_progress_is_not_reaped_however_old_it_is(fake_redis):
    state = _crawl(fake_redis, started_ago=CRAWL_TTL_SECONDS // 2, progress_ago=30)
    assert reap_stalled_crawls(fake_redis) == 0
    assert CRAWL_KEY in state.hashes and LOCK_KEY in state.strings


def test_a_crawl_older_than_five_minutes_with_recent_progress_keeps_its_lock(fake_redis):
    state = _crawl(fake_redis, started_ago=FIVE_MINUTES * 2, progress_ago=60)
    assert reap_stalled_crawls(fake_redis) == 0
    assert LOCK_KEY in state.strings


def test_a_crawl_without_progress_past_the_threshold_is_reaped_unlocked_and_recorded(fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=BEYOND_THRESHOLD)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        removed = reap_stalled_crawls(fake_redis)
    assert (removed, CRAWL_KEY in state.hashes, LOCK_KEY in state.strings) == (1, False, False)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "failed"
    with session_factory() as db:
        assert db.query(PlatformRun).filter_by(platform_id=TEST_PLATFORM_ID, error="failed").count() == 1


def test_a_crawl_that_never_reported_progress_falls_back_to_its_start(fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        assert reap_stalled_crawls(fake_redis) == 1
    assert LOCK_KEY not in state.strings


def test_a_completed_crawl_is_left_to_its_ttl(fake_redis):
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=BEYOND_THRESHOLD, status="completed")
    assert reap_stalled_crawls(fake_redis) == 0
    assert CRAWL_KEY in state.hashes


def test_the_scheduled_cleanup_task_reaps_through_the_same_rule(fake_redis, session_factory, seed):
    from workers.tasks.scheduling import cleanup_stale_redis_jobs

    seed(make_user(), make_platform())
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=BEYOND_THRESHOLD)
    with patch("workers.tasks.scheduling.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        assert cleanup_stale_redis_jobs() == {"removed": 1}
    assert LOCK_KEY not in state.strings


@pytest.mark.parametrize(("progress_ago", "removed"), [(60, 0), (BEYOND_THRESHOLD, 1)])
def test_the_admin_cleanup_reaps_through_the_same_rule(fake_redis, session_factory, seed, progress_ago, removed):
    from routers.admin import cleanup_stale_redis_jobs_endpoint

    seed(make_user(), make_platform())
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=progress_ago)
    with patch("routers.admin.redis_sync.from_url", return_value=fake_redis), \
         patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        assert cleanup_stale_redis_jobs_endpoint(current_user=make_user()) == {"removed": removed}
    assert (LOCK_KEY in state.strings) == (not removed)


def test_a_queued_crawl_waiting_behind_a_busy_queue_is_not_reaped_before_the_ttl(fake_redis):
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD, status=QUEUED_STATUS)
    assert reap_stalled_crawls(fake_redis) == 0
    assert CRAWL_KEY in state.hashes and LOCK_KEY in state.strings


def test_a_queued_crawl_older_than_the_ttl_is_reaped(fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    _crawl(fake_redis, started_ago=CRAWL_TTL_SECONDS + 60, status=QUEUED_STATUS)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        assert reap_stalled_crawls(fake_redis) == 1


def test_a_reaped_crawl_is_stopped_for_its_tasks(fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=BEYOND_THRESHOLD)
    state.sets[f"{CRAWL_KEY}:task_ids"] = {b"task-1", b"task-2"}
    fake_redis.smembers.side_effect = state.smembers
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("workers.crawl_control.celery_app") as celery_app:
        reap_stalled_crawls(fake_redis)
    cancelled_key = f"{CRAWL_KEY}:cancelled"
    assert fake_redis.setex.call_args_list[0].args[0] == cancelled_key
    assert sorted(celery_app.control.revoke.call_args.args[0]) == ["task-1", "task-2"]


def test_a_reaped_crawl_publishes_its_failure_after_the_run_is_stored(fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    _crawl(fake_redis, started_ago=BEYOND_THRESHOLD * 2, progress_ago=BEYOND_THRESHOLD)
    stored_at_publish = []
    fake_redis.publish.side_effect = lambda channel, message: stored_at_publish.append(
        (json.loads(message), fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"])
    )
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        reap_stalled_crawls(fake_redis)
    event = {"type": "crawl_job_failed", "job_id": CRAWL_ID, "user_id": TEST_USER_ID, "reason": "error"}
    assert stored_at_publish == [(event, "failed")]
