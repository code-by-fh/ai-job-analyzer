"""Shared crawl-completion bookkeeping.

The "are all jobs accounted for? → mark crawl completed, flush digests, publish
events" block used to be copy-pasted across ``analyze_job_task`` and
``save_job_basic_task`` (in both their skip and save branches). It lives here
once now.
"""

import json

from core.logger import get_logger
from workers.notifications.email import flush_all_digests

logger = get_logger(__name__)


def maybe_complete_crawl(crawl_job_id, user_id, db, r):
    """Mark a crawl as completed once every job is saved or skipped.

    Reads the current counters from the ``crawl_job:{id}`` Redis hash. When
    ``jobs_saved + jobs_skipped >= total`` (and ``total > 0``) it sets the
    status to ``completed``, clears the active-crawl bookkeeping, flushes all
    e-mail digests and publishes the ``crawl_job_completed`` / ``crawl_completed``
    events. Returns ``True`` when the crawl was completed by this call.

    Callers must increment their own counter (``jobs_saved`` / ``jobs_skipped``)
    and publish their per-job event *before* invoking this helper.
    """
    job_hash = r.hgetall(f"crawl_job:{crawl_job_id}")
    if not job_hash:
        return False

    total = int(job_hash.get(b"total", 0))
    jobs_saved = int(job_hash.get(b"jobs_saved", 0))
    jobs_skipped = int(job_hash.get(b"jobs_skipped", 0))

    if (jobs_saved + jobs_skipped) >= total and total > 0:
        logger.info(f"All jobs processed for crawl {crawl_job_id}. Marking as completed.")
        r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")
        r.srem(f"user:{user_id}:active_crawls", crawl_job_id)
        r.delete("system:crawling")

        total_found_raw = job_hash.get(b"total_found")
        total_found = int(total_found_raw) if total_found_raw else total

        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "crawl_job_completed",
                    "job_id": crawl_job_id,
                    "user_id": user_id,
                    "total": total,
                    "total_found": total_found,
                }
            ),
        )
        flush_all_digests(crawl_job_id, user_id, db, r)
        r.publish("job_updates", json.dumps({"type": "crawl_completed"}))
        return True

    return False
