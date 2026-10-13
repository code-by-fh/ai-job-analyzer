"""Which crawls a user is running, read from the scraper's Redis bookkeeping (scraper_api._init_crawl_job)."""

import time
from typing import Optional

from core.logger import get_logger
from core.url_safety import DNS_TIMEOUT_SECONDS

logger = get_logger(__name__)

ALREADY_RUNNING = "already_running"
STARTED = "Started"
# The scraper re-checks the URL (DNS bounded by DNS_TIMEOUT_SECONDS) before it answers a crawl start, so the API
# and the scheduler waiting less would report a failure for a crawl the scraper still starts.
SCRAPER_START_TIMEOUT_SECONDS = DNS_TIMEOUT_SECONDS + 2

# One TTL for the crawl hash and its lock, refreshed on every progress; a crawl that died without cleanup frees both.
CRAWL_TTL_SECONDS = 3600
# A crawl with no progress for this long is dead: the reaper may remove it and free its platform.
STALE_NO_PROGRESS_SECONDS = 15 * 60
MILLISECONDS_PER_SECOND = 1000
PROGRESS_FIELD = "last_progress_at"

RELEASE_SCRIPT = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0"
# Atomic, and a no-op once the crawl hash is gone, so a late task cannot resurrect a cancelled crawl.
# KEYS: crawl hash, crawl lock. ARGV: now (ms), ttl (s), crawl id, progress field name.
PROGRESS_SCRIPT = """
if redis.call('exists',KEYS[1])==0 then return 0 end
redis.call('hset',KEYS[1],ARGV[4],ARGV[1])
redis.call('expire',KEYS[1],ARGV[2])
if redis.call('get',KEYS[2])==ARGV[3] then redis.call('expire',KEYS[2],ARGV[2]) end
return 1
"""
# A crawl no worker step has started yet; it may wait behind a busy queue, which is not a stall.
QUEUED_STATUS = "starting"
NO_LOCK_KEY = "crawl_lock:none"


def _text(raw) -> str:
    # The scraper's client returns bytes, decoded clients return str.
    return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)


def _lock_key(user_id: int, platform_id: int) -> str:
    return f"crawl_lock:{user_id}:{platform_id}"


def active_crawl_for_platform(redis_client, user_id: int, platform_id: int) -> Optional[str]:
    """The user's running crawl of this platform, or None. A crawl whose hash expired counts as ended."""
    for raw_id in redis_client.smembers(f"user:{user_id}:active_crawls"):
        crawl_id = _text(raw_id)
        stored = redis_client.hget(f"crawl_job:{crawl_id}", "platform_id")
        if stored is not None and _text(stored) == str(platform_id):
            return crawl_id
    return None


def has_live_crawl(redis_client, user_id: int) -> bool:
    """Any registered crawl of the user, whatever its platform; a member whose hash expired has ended."""
    return any(
        redis_client.exists(f"crawl_job:{_text(raw_id)}")
        for raw_id in redis_client.smembers(f"user:{user_id}:active_crawls")
    )


def crawl_lock_held(redis_client, user_id: int, platform_id: int) -> bool:
    """Whether a crawl holds this platform's lock, also in the moment before it is registered as active."""
    return bool(redis_client.exists(_lock_key(user_id, platform_id)))


def is_started(scraper_answer: dict) -> bool:
    """The one rule for an accepted crawl start: the scraper answers {"status": "Started"}, nothing else."""
    return scraper_answer.get("status") == STARTED


def acquire_crawl_lock(redis_client, user_id: int, platform_id: int, crawl_id: str) -> bool:
    """Atomically claim the platform for one crawl (SET NX), so two concurrent starts cannot both pass."""
    return bool(redis_client.set(_lock_key(user_id, platform_id), crawl_id, nx=True, ex=CRAWL_TTL_SECONDS))


def release_crawl_lock(redis_client, user_id: int, platform_id: int, crawl_id: str) -> None:
    """Free the platform, unless a newer crawl already holds the lock (compare-and-delete in one step)."""
    redis_client.eval(RELEASE_SCRIPT, 1, _lock_key(user_id, platform_id), crawl_id)


def _lock_key_of(redis_client, crawl_id: str) -> str:
    user_id, platform_id = redis_client.hmget(f"crawl_job:{crawl_id}", ["user_id", "platform_id"])
    if user_id is None or platform_id is None:
        return NO_LOCK_KEY
    return _lock_key(int(_text(user_id)), int(_text(platform_id)))


def touch_crawl_progress(redis_client, crawl_id: str) -> None:
    """Stamp progress on the crawl and push out the TTL of its hash and lock."""
    now_ms = int(time.time() * MILLISECONDS_PER_SECOND)
    try:
        redis_client.eval(
            PROGRESS_SCRIPT, 2, f"crawl_job:{crawl_id}", _lock_key_of(redis_client, crawl_id),
            now_ms, CRAWL_TTL_SECONDS, crawl_id, PROGRESS_FIELD,
        )
    except Exception as exc:
        # Broad on purpose: progress bookkeeping must never break the crawl itself.
        logger.error(f"Could not record progress of crawl {crawl_id}: {exc}")
