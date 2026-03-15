import os
from celery import Celery

celery_app = Celery(
    "ai_worker",
    broker=os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@rabbitmq:5672//"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
)

celery_app.conf.beat_schedule = {
    "check-crawls-every-minute": {
        "task": "ai.check_platforms_for_crawl",
        "schedule": 60.0,
        "options": {"queue": "ai_queue"},
    },
}
