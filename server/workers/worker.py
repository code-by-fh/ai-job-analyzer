"""Celery worker entrypoint and backwards-compatible aggregator.

Celery is launched via ``-A workers.worker.celery_app`` (see ``supervisord.conf``),
so importing this module must (a) expose ``celery_app`` and (b) import every task
module so the ``@celery_app.task`` decorators register their tasks.

The notification helpers and templates were split into ``workers.notifications``
and the tasks into ``workers.tasks``. They are re-exported here so existing
imports such as ``from workers.worker import _send_via_resend_batch`` (used by
``routers/platforms.py`` and ``routers/settings.py``) keep working unchanged.
"""

from core.celery_config import celery_app

# Re-exported helper imported by routers and scripts.
from intelligence.service import format_cv_for_prompt

from workers.notifications.templates import (
    _RESEND_DEFAULT_HTML,
    _RESEND_DEFAULT_JOB_ROW,
)
from workers.notifications.email import (
    _send_via_resend_batch,
    _send_via_mailjet_batch,
    _send_via_smtp_batch,
    _flush_resend_digest,
    _flush_mailjet_digest,
    _flush_smtp_digest,
    flush_all_digests,
)
from workers.notifications.push import _send_via_pushover, send_notification

# Importing the task modules registers their @celery_app.task tasks.
from workers.tasks.urls import filter_urls_task
from workers.tasks.analyze import analyze_job_task, save_job_basic_task
from workers.tasks.application import generate_application_task
from workers.tasks.research import (
    generate_interview_prep_task,
    generate_company_profile,
)
from workers.tasks.scheduling import (
    check_follow_ups,
    check_platforms_for_crawl,
    cleanup_stale_redis_jobs,
)

__all__ = [
    "celery_app",
    # helpers / templates
    "format_cv_for_prompt",
    "_RESEND_DEFAULT_HTML",
    "_RESEND_DEFAULT_JOB_ROW",
    "_send_via_resend_batch",
    "_send_via_mailjet_batch",
    "_send_via_smtp_batch",
    "_send_via_pushover",
    "send_notification",
    "_flush_resend_digest",
    "_flush_mailjet_digest",
    "_flush_smtp_digest",
    "flush_all_digests",
    # tasks
    "filter_urls_task",
    "analyze_job_task",
    "save_job_basic_task",
    "generate_application_task",
    "generate_interview_prep_task",
    "generate_company_profile",
    "check_follow_ups",
    "check_platforms_for_crawl",
    "cleanup_stale_redis_jobs",
]
