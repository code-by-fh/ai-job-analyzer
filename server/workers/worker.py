"""Celery worker entrypoint and backwards-compatible aggregator.

Celery is launched via ``-A workers.worker.celery_app`` (see ``supervisord.conf``),
so importing this module must (a) expose ``celery_app`` and (b) import every task
module so the ``@celery_app.task`` decorators register their tasks.

The tasks live in ``workers.tasks``; notifications go through the notification service
(``services/notifications_client.py``), whose settings are checked when a worker starts.
"""

from celery.signals import worker_init

from core.celery_config import celery_app
from services import notifications_client

# Re-exported helper imported by routers and scripts.
from intelligence.service import format_cv_for_prompt

# Importing the task modules registers their @celery_app.task tasks.
from workers.tasks.urls import filter_urls_task
from workers.tasks.analyze import analyze_job_task, save_job_basic_task
from workers.tasks.application import generate_application_task
from workers.tasks.research import (
    generate_interview_prep_task,
    generate_company_profile,
    research_job_company_task,
)
from workers.tasks.scheduling import (
    check_follow_ups,
    check_platforms_for_crawl,
    cleanup_stale_redis_jobs,
)
from workers.tasks.package import generate_application_package_task  # noqa: F401
from workers.tasks.fill_cv_template import fill_cv_template_task  # noqa: F401
from workers.tasks.generation_sweep import fail_stuck_generations  # noqa: F401
from workers.tasks.posting_details import extract_posting_details_task  # noqa: F401


@worker_init.connect
def _require_notification_service(**_kwargs) -> None:
    """Fail fast: a worker without NOTIFY_API_URL / NOTIFY_API_KEY would drop every match notification."""
    notifications_client.get_client()


__all__ = [
    "celery_app",
    # helpers
    "format_cv_for_prompt",
    # tasks
    "filter_urls_task",
    "analyze_job_task",
    "save_job_basic_task",
    "generate_application_task",
    "generate_interview_prep_task",
    "generate_company_profile",
    "research_job_company_task",
    "check_follow_ups",
    "check_platforms_for_crawl",
    "cleanup_stale_redis_jobs",
    "generate_application_package_task",
]
