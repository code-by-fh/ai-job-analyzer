import os
from celery import Celery
from celery.signals import worker_process_init

from core import process_hardening
from core.celery_broker import BROKER_URL

process_hardening.disable_process_dump()

celery_app = Celery(
    "ai_worker",
    broker=BROKER_URL,
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0"),
)

celery_app.conf.beat_schedule = {
    "check-crawls-every-minute": {
        "task": "ai.check_platforms_for_crawl",
        "schedule": 60.0,
        "options": {"queue": "ai_queue"},
    },
    "fail-stuck-generations": {
        "task": "ai.fail_stuck_generations",
        "schedule": 60.0,
        "options": {"queue": "ai_queue"},
    },
    "cleanup-stale-redis-jobs": {
        "task": "ai.cleanup_stale_redis_jobs",
        "schedule": 60.0,
        "options": {"queue": "ai_queue"},
    },
}


@worker_process_init.connect(weak=False)
def _harden_worker_process(**_kwargs):
    process_hardening.disable_process_dump()
