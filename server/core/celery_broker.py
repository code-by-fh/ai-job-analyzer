"""The one Celery broker URL, shared by the ai worker app and the scraper app.

Both apps send tasks to each other's queues (the crawl chain runs ai.filter_urls), so a split default would
leave every crawl hanging on a bare run without CELERY_BROKER_URL. Default: the compose RabbitMQ.
"""

import os

BROKER_URL = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@ai-job-agent-rabbitmq:5672//")
