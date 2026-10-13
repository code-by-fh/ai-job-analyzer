import os
from celery import Celery

from core import process_hardening
from core.celery_broker import BROKER_URL

process_hardening.disable_process_dump()

REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")

celery_app = Celery(
    'scraper_worker',
    broker=BROKER_URL,
    backend=REDIS_URL
)
