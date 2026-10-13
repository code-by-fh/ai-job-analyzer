"""Ending a crawl: cancel, fail and reap stalled ones.

No import-time effects, so Celery workers can import it; the scraper API's own startup cleanup lives in scraper_api.
"""

import json
import time
from dataclasses import dataclass

from core.crawl_errors import CRAWL_AI_ERROR_MESSAGE, CRAWL_INTERNAL_ERROR_MESSAGE, URL_UNREACHABLE_MESSAGE
from core.crawl_registry import (
    CRAWL_TTL_SECONDS,
    MILLISECONDS_PER_SECOND,
    PROGRESS_FIELD,
    QUEUED_STATUS,
    STALE_NO_PROGRESS_SECONDS,
)
from core.logger import get_logger
from core.scraper_celery_config import celery_app
from workers.tasks.platform_runs import ERROR_CANCELLED, ERROR_FAILED, ERROR_UNREACHABLE, record_platform_run

logger = get_logger(__name__)


@dataclass(frozen=True)
class CrawlFailure:
    """Why a crawl failed: the fixed text the user sees and the run code stored for it (one of the ERROR_* codes)."""

    message: str
    run_error: str


AI_FAILURE = CrawlFailure(CRAWL_AI_ERROR_MESSAGE, ERROR_FAILED)
INTERNAL_FAILURE = CrawlFailure(CRAWL_INTERNAL_ERROR_MESSAGE, ERROR_FAILED)
UNREACHABLE_FAILURE = CrawlFailure(URL_UNREACHABLE_MESSAGE, ERROR_UNREACHABLE)


def cleanup_crawl_job(r, job_id, user_id, reason="error"):
    """
    Cleanup all Redis data for a crawl job.
    Called on error or cancellation.
    """
    try:
        logger.info(f"🧹 Cleaning up crawl job {job_id} (reason: {reason})")
        record_platform_run(r, job_id, error=ERROR_CANCELLED if reason == "cancelled" else ERROR_FAILED)

        # 1. Set a resurrection-safe cancellation marker FIRST. In-flight tasks
        #    check this marker (never recreated by hincrby/hset), so a task that
        #    finishes after cancellation cannot revive the job and keep crawling.
        r.setex(f"crawl_job:{job_id}:cancelled", 600, "1")

        # 2. Revoke any queued/running scrape_detail tasks by their real Celery
        #    task ids so they are discarded from the broker queue immediately.
        try:
            task_ids = [
                tid.decode("utf-8")
                for tid in r.smembers(f"crawl_job:{job_id}:task_ids")
            ]
            if task_ids:
                # No terminate=True: revoking without terminate discards tasks that
                # are still queued (they never launch a browser), while a task that
                # is mid-navigation is left to finish and close its browser cleanly
                # via its own finally block. The cancellation marker then makes it
                # bail at the post-fetch checkpoint before creating any job.
                celery_app.control.revoke(task_ids)
                logger.info(f"Revoked {len(task_ids)} tasks for crawl job {job_id}")
        except Exception as rev_e:
            logger.error(f"Error revoking tasks for job {job_id}: {rev_e}")

        # 3. Tear down the remaining tracking state.
        r.delete(f"crawl_job:{job_id}")
        r.delete(f"crawl_job:{job_id}:all_job_titles")
        r.delete(f"crawl_job:{job_id}:task_ids")
        r.srem(f"user:{user_id}:active_crawls", job_id)
        r.delete("system:crawling")

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": (
                        "crawl_job_failed"
                        if reason == "error"
                        else "crawl_job_cancelled"
                    ),
                    "job_id": job_id,
                    "user_id": user_id,
                    "reason": reason,
                }
            ),
        )

    except Exception as e:
        logger.error(f"Error during cleanup of job {job_id}: {e}")


def stop_crawl_tasks(r, job_id: str) -> None:
    """Stop any in-flight/queued tasks of a crawl (resurrection-safe marker + revoke)."""
    r.setex(f"crawl_job:{job_id}:cancelled", 600, "1")
    try:
        task_ids = [
            tid.decode("utf-8") if isinstance(tid, bytes) else tid
            for tid in r.smembers(f"crawl_job:{job_id}:task_ids")
        ]
        if task_ids:
            # See cleanup_crawl_job: revoke without terminate so an in-flight
            # browser navigation finishes and closes cleanly.
            celery_app.control.revoke(task_ids)
    except Exception as rev_e:
        logger.error(f"Error revoking tasks for crawl {job_id}: {rev_e}")


def crawl_failed_event(job_id: str, user_id: int) -> dict:
    """The crawl_job_failed payload every crawl end by failure publishes; the web's realtimeEventSchema needs an int user_id."""
    return {"type": "crawl_job_failed", "job_id": job_id, "user_id": user_id, "reason": "error"}


def _drop_crawl_state(r, job_id: str, user_id) -> None:
    r.delete(f"crawl_job:{job_id}")
    r.delete(f"crawl_job:{job_id}:all_job_titles")
    r.delete(f"crawl_job:{job_id}:task_ids")
    if user_id:
        r.srem(f"user:{user_id}:active_crawls", job_id)


def _already_ended(r, job_id: str) -> bool:
    """True for a crawl whose hash is gone (cancelled, failed, reaped or expired; a live hash always has a status)
    and for a completed crawl, whose hash stays until its TTL. Both byte-mode and decoded clients call this."""
    status = r.hget(f"crawl_job:{job_id}", "status")
    return status is None or status in (b"completed", "completed")


def fail_crawl_job(r, job_id: str, user_id: int, failure: CrawlFailure):
    """
    Record the failed run, stop the crawl's tasks, broadcast the failure and clean up all Redis data.
    The run is stored before the event, so the web's refetch on the event already reads it.
    A crawl that already ended (see _already_ended) is left alone: a late sibling error sends no failure event.
    """
    try:
        if _already_ended(r, job_id):
            logger.info(f"Crawl job {job_id} already ended; not failing it")
            return
        logger.info(f"Failing crawl job {job_id} (error: {failure.message})")
        record_platform_run(r, job_id, error=failure.run_error)
        r.delete("system:crawling")
        stop_crawl_tasks(r, job_id)
        event = {**crawl_failed_event(job_id, user_id), "error_message": failure.message}
        r.publish("job_updates", json.dumps(event))
        _drop_crawl_state(r, job_id, user_id)
        logger.info(f" Crawl job {job_id} failed and cleaned up")
    except Exception as e:
        logger.error(f"Error during fail of job {job_id}: {e}")


def _last_progress_ms(job_hash: dict) -> int:
    raw = job_hash.get(PROGRESS_FIELD) or job_hash.get("started_at")
    return int(raw) if raw else 0


def _is_stalled(job_hash: dict, now_ms: int) -> bool:
    """A crawl is stalled only after STALE_NO_PROGRESS_SECONDS without progress; finished crawls are left to their TTL."""
    last_ms = _last_progress_ms(job_hash)
    if not last_ms or job_hash.get("status") == "completed":
        return False
    # A queued crawl may wait behind a busy queue; only its TTL ends it.
    limit = CRAWL_TTL_SECONDS if job_hash.get("status") == QUEUED_STATUS else STALE_NO_PROGRESS_SECONDS
    return now_ms - last_ms >= limit * MILLISECONDS_PER_SECOND


def _remove_stalled(r, key: str, job_hash: dict) -> None:
    job_id = key.split(":", 1)[1]
    # Before the delete: the run recorder needs the hash to find the platform, and it frees the lock by token.
    record_platform_run(r, job_id, error=ERROR_FAILED)
    stop_crawl_tasks(r, job_id)
    _drop_crawl_state(r, job_id, job_hash.get("user_id"))
    # The web learns of a crawl end only from events, so a silent removal would leave the row running.
    if job_hash.get("user_id"):
        r.publish("job_updates", json.dumps(crawl_failed_event(job_id, int(job_hash["user_id"]))))


def reap_stalled_crawls(r) -> int:
    """Remove crawls without progress and record them as failed runs. `r` must decode responses."""
    now_ms = int(time.time() * MILLISECONDS_PER_SECOND)
    removed = 0
    for key in [k for k in r.keys("crawl_job:*") if k.count(":") == 1]:
        job_hash = r.hgetall(key)
        if job_hash and _is_stalled(job_hash, now_ms):
            logger.info(f"Removing stalled Redis job {key.split(':', 1)[1]} (status={job_hash.get('status', '')})")
            _remove_stalled(r, key, job_hash)
            removed += 1
    if removed:
        r.delete("system:crawling")
    return removed
