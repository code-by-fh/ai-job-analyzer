from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import event

from database.core import JobPlatform, PlatformRun
from tests.factories import (
    OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_user,
)
from workers.tasks.crawl_status import maybe_complete_crawl
from workers.tasks.platform_runs import (
    ERROR_CANCELLED, ERROR_FAILED, ERROR_UNREACHABLE, RUN_HISTORY_LIMIT, _prune_runs, build_last_run,
    record_failed_run, record_platform_run,
)

CRAWL_ID = "crawl-1"
STARTED_AT_MS = b"1791450000000"
STARTED_AT_ISO = "2026-10-08T09:00:00+00:00"
FINISHED_AT = datetime(2026, 10, 8, 9, 30, tzinfo=timezone.utc)
CRAWL_HASH = {
    b"user_id": str(TEST_USER_ID).encode(),
    b"platform_id": str(TEST_PLATFORM_ID).encode(),
    b"started_at": STARTED_AT_MS,
    b"total": b"3",
    b"total_found": b"8",
    b"jobs_saved": b"3",
    b"jobs_skipped": b"0",
    b"jobs_matched": b"2",
}


def test_build_last_run_summarises_crawl_counters():
    assert build_last_run(CRAWL_HASH, FINISHED_AT, None) == {
        "started_at": STARTED_AT_ISO,
        "finished_at": FINISHED_AT.isoformat(),
        "found": 8,
        "new": 3,
        "matched": 2,
        "seeded": False,
    }


def test_build_last_run_includes_error():
    assert build_last_run(CRAWL_HASH, FINISHED_AT, ERROR_UNREACHABLE)["error"] == ERROR_UNREACHABLE


def test_build_last_run_maps_unknown_error_to_failed_code():
    last_run = build_last_run(CRAWL_HASH, FINISHED_AT, "Failed to fetch https://secret.example/jobs")
    assert last_run["error"] == ERROR_FAILED


def test_build_last_run_without_start_time_or_counters():
    assert build_last_run({}, FINISHED_AT, None) == {
        "started_at": None, "finished_at": FINISHED_AT.isoformat(), "found": 0, "new": 0, "matched": 0,
        "seeded": False,
    }


@pytest.fixture()
def platform_db(session_factory, seed):
    seed(make_user(), make_platform())
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        yield session_factory


def test_record_platform_run_saves_summary_on_platform(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["new"] == 3


def test_record_platform_run_skips_crawls_without_platform(platform_db, fake_redis):
    fake_redis.hgetall.return_value = {b"total": b"1"}
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run is None


def test_record_platform_run_ignores_platform_of_another_user(platform_db, seed, fake_redis):
    seed(make_user(OTHER_USER_ID))
    fake_redis.hgetall.return_value = {**CRAWL_HASH, b"user_id": str(OTHER_USER_ID).encode()}
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run is None


def test_record_platform_run_never_raises(platform_db, fake_redis):
    fake_redis.hgetall.side_effect = ConnectionError("redis down")
    assert record_platform_run(fake_redis, CRAWL_ID) is None
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run is None


def test_completed_crawl_records_last_run(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    with patch("workers.tasks.crawl_status.flush_all_digests"):
        maybe_complete_crawl(CRAWL_ID, TEST_USER_ID, None, fake_redis)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["matched"] == 2


@pytest.fixture()
def stateful_redis(fake_redis):
    """hsetnx behaves like Redis: only the first call per field wins."""
    seen = set()

    def hsetnx(key, field, value):
        if (key, field) in seen:
            return 0
        seen.add((key, field))
        return 1
    fake_redis.hsetnx.side_effect = hsetnx
    fake_redis.hgetall.return_value = CRAWL_HASH
    return fake_redis


def test_cancelled_run_stores_cancelled_code(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID, error=ERROR_CANCELLED)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == ERROR_CANCELLED


def test_first_recorded_run_wins(platform_db, stateful_redis):
    record_platform_run(stateful_redis, CRAWL_ID, error=ERROR_UNREACHABLE)
    with patch("workers.tasks.crawl_status.flush_all_digests"):
        maybe_complete_crawl(CRAWL_ID, TEST_USER_ID, None, stateful_redis)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == ERROR_UNREACHABLE


SEED_HASH = {**CRAWL_HASH, b"is_initial_run": b"1"}


def _history(session_factory) -> list:
    with session_factory() as db:
        return db.query(PlatformRun).order_by(PlatformRun.finished_at.desc()).all()


def test_record_platform_run_adds_a_history_row(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID, error=ERROR_UNREACHABLE)
    [run] = _history(platform_db)
    assert (run.platform_id, run.found, run.new, run.matched, run.seeded, run.error) == (
        TEST_PLATFORM_ID, 8, 3, 2, False, ERROR_UNREACHABLE,
    )


def test_a_seed_run_is_marked_on_summary_and_history(platform_db, fake_redis):
    fake_redis.hgetall.return_value = SEED_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["seeded"] is True
    assert _history(platform_db)[0].seeded is True


def test_history_keeps_the_newest_twenty_runs(platform_db, seed, fake_redis):
    today = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    older = [
        PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=today - timedelta(days=age))
        for age in range(1, 21)
    ]
    seed(*older)
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    runs = _history(platform_db)
    assert len(runs) == 20
    assert runs[-1].finished_at.replace(tzinfo=timezone.utc) == today - timedelta(days=19)  # the oldest was dropped


def _statements_of_prune(session_factory) -> list:
    statements = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.split()[0].upper())

    with session_factory() as db:
        bind = db.get_bind()
        event.listen(bind, "before_cursor_execute", _capture)
        try:
            _prune_runs(db, TEST_PLATFORM_ID)
            db.commit()
        finally:
            event.remove(bind, "before_cursor_execute", _capture)
    return statements


def test_pruning_is_one_delete_so_a_run_saved_meanwhile_is_never_lost(platform_db, seed):
    # A separate "which to keep" read would let a run committed before the delete fall outside the kept set.
    today = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    seed(*[
        PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=today - timedelta(days=age))
        for age in range(RUN_HISTORY_LIMIT + 1)
    ])
    statements = _statements_of_prune(platform_db)
    assert (statements, len(_history(platform_db))) == (["DELETE"], RUN_HISTORY_LIMIT)


def test_a_failed_run_is_recorded_without_a_crawl_hash(platform_db):
    record_failed_run(TEST_PLATFORM_ID, TEST_USER_ID)
    [run] = _history(platform_db)
    assert (run.error, run.found, run.started_at) == (ERROR_FAILED, 0, None)
