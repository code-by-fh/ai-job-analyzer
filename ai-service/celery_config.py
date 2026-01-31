import os
from celery import Celery

celery_app = Celery(
    'ai_worker',
    broker=os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@rabbitmq:5672//"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
)

celery_app.conf.beat_schedule = {
    'check-crawls-every-5-min': {
        'task': 'ai.check_periodic_crawls',
        'schedule': 300.0, # 5 minutes
    },
}
