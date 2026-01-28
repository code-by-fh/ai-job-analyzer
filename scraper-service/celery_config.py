import os
from celery import Celery

REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")

celery_app = Celery(
    'scraper_worker',
    broker=BROKER_URL,
    backend=REDIS_URL
)
