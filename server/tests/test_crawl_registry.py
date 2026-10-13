from core import crawl_registry
from core.crawl_registry import (
    CRAWL_TTL_SECONDS,
    RELEASE_SCRIPT,
    acquire_crawl_lock,
    active_crawl_for_platform,
    release_crawl_lock,
    touch_crawl_progress,
)
from tests.crawl_locks import Clock, lock_backed
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID

OTHER_PLATFORM_ID = TEST_PLATFORM_ID + 1
LOCK_KEY = f"crawl_lock:{TEST_USER_ID}:{TEST_PLATFORM_ID}"
HASH_KEY = "crawl_job:crawl-1"


def _hashes(fake_redis, platform_by_crawl: dict) -> None:
    fake_redis.smembers.return_value = {crawl.encode() for crawl in platform_by_crawl}
    fake_redis.hget.side_effect = lambda key, field: platform_by_crawl.get(key.split(":")[1])


def _running_crawl(fake_redis, clock: Clock):
    """A crawl hash that belongs to the platform and holds its lock."""
    state = lock_backed(fake_redis, clock)
    state.hset(HASH_KEY, mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID})
    state.expire(HASH_KEY, CRAWL_TTL_SECONDS)
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    return state


def test_finds_the_running_crawl_of_the_platform(fake_redis):
    _hashes(fake_redis, {"crawl-1": str(OTHER_PLATFORM_ID).encode(), "crawl-2": str(TEST_PLATFORM_ID).encode()})
    assert active_crawl_for_platform(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID) == "crawl-2"


def test_imports_and_expired_crawls_do_not_count(fake_redis):
    _hashes(fake_redis, {"import-1": None, "expired-1": None})
    assert active_crawl_for_platform(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID) is None
    fake_redis.smembers.assert_called_once_with(f"user:{TEST_USER_ID}:active_crawls")


def test_a_second_lock_while_the_first_is_held_is_refused(fake_redis):
    lock_backed(fake_redis, Clock())
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1") is True
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-2") is False


def test_the_lock_is_per_user_and_platform(fake_redis):
    lock_backed(fake_redis, Clock())
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, OTHER_PLATFORM_ID, "crawl-2")
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID + 1, TEST_PLATFORM_ID, "crawl-3")


def test_the_lock_expires(fake_redis):
    clock = Clock()
    lock_backed(fake_redis, clock)
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    clock.now += crawl_registry.CRAWL_TTL_SECONDS + 1
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-2") is True


def test_release_frees_the_platform_for_the_next_crawl(fake_redis):
    lock_backed(fake_redis, Clock())
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    release_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-3") is True


def test_release_leaves_the_lock_of_a_newer_crawl(fake_redis):
    lock_backed(fake_redis, Clock())
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-2")
    release_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    assert acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-3") is False


def test_release_is_one_atomic_compare_and_delete(fake_redis):
    fake_redis.eval.return_value = 1
    release_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, "crawl-1")
    fake_redis.eval.assert_called_once_with(RELEASE_SCRIPT, 1, LOCK_KEY, "crawl-1")
    fake_redis.get.assert_not_called()
    fake_redis.delete.assert_not_called()


def test_progress_refreshes_the_ttl_of_the_crawl_and_its_lock(fake_redis):
    clock = Clock()
    state = _running_crawl(fake_redis, clock)
    clock.now += CRAWL_TTL_SECONDS - 10
    touch_crawl_progress(fake_redis, "crawl-1")
    clock.now += 20
    state.drop_expired()
    assert HASH_KEY in state.hashes and LOCK_KEY in state.strings
    assert state.hashes[HASH_KEY]["last_progress_at"]


def test_without_progress_both_expire_together(fake_redis):
    clock = Clock()
    state = _running_crawl(fake_redis, clock)
    clock.now += CRAWL_TTL_SECONDS + 1
    state.drop_expired()
    assert HASH_KEY not in state.hashes and LOCK_KEY not in state.strings


def test_progress_never_recreates_a_deleted_crawl(fake_redis):
    state = lock_backed(fake_redis, Clock())
    touch_crawl_progress(fake_redis, "gone")
    assert state.hashes == {}


def test_progress_does_not_extend_the_lock_of_another_crawl(fake_redis):
    clock = Clock()
    state = _running_crawl(fake_redis, clock)
    state.set(LOCK_KEY, "crawl-2", ex=5)
    touch_crawl_progress(fake_redis, "crawl-1")
    clock.now += 6
    state.drop_expired()
    assert LOCK_KEY not in state.strings
