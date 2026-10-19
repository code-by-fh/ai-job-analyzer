"""End events of AI runs without a Celery task of their own (CV import, deep dive) and of the posting details run.

One event per run end, for both outcomes: a tab that did not send the request (another tab, or the
same page after a reload) reloads the state, which tells success from failure.
"""

import json
import os

import redis

from core.logger import get_logger

logger = get_logger(__name__)

EVENTS_CHANNEL = "job_updates"
CV_IMPORT_ENDED = "cv_import_ended"
DEEP_DIVE_ENDED = "deep_dive_ended"
POSTING_DETAILS_ENDED = "posting_details_ended"


def events_redis() -> redis.Redis:
    return redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"))


def publish_cv_import_ended(client: redis.Redis, user_id: int) -> None:
    client.publish(EVENTS_CHANNEL, json.dumps({"type": CV_IMPORT_ENDED, "user_id": user_id}))


def publish_deep_dive_ended(client: redis.Redis, user_id: int, domain: str) -> None:
    client.publish(EVENTS_CHANNEL, json.dumps({"type": DEEP_DIVE_ENDED, "user_id": user_id, "domain": domain}))


def publish_posting_details_ended(client: redis.Redis, user_id: int, job_id: str) -> None:
    client.publish(EVENTS_CHANNEL, json.dumps({"type": POSTING_DETAILS_ENDED, "user_id": user_id, "job_id": job_id}))


def announce_end(publish, *args) -> None:
    """Publish from a request: the run's outcome is already stored and answered, so a Redis outage only logs."""
    try:
        publish(events_redis(), *args)
    except redis.RedisError:
        logger.error("Publishing a run end event failed", exc_info=True)
