"""Job match notifications through the notification service.

A source names its channels in ``notification_channels``; templates and recipients stay per type on the
source (``pushover_template``, ``resend_template`` + ``resend_recipients``, ...). Timing is as before:
Pushover gets one push per match at once; e-mail channels get one digest per type when the crawl ends
(queued in Redis), or at once for a match outside a crawl. Source recipients replace a channel's own
default recipients; an empty list keeps them.
"""

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from core.logger import get_logger
from database.core import JobEntry, JobPlatform, User
from services import notifications_client
from services.notification_channels import EMAIL_TYPES, PUSHOVER
from services.notifications_client import NotifyError, owner_for

logger = get_logger(__name__)

PENDING_DIGEST_KEY = "crawl:{crawl_job_id}:pending_digest"
PENDING_DIGEST_TTL_SECONDS = 3600
DIGEST_TEMPLATE = "job_digest"
# The service's bounds (notification-service/app/limits.py); longer text is cut, never refused.
MAX_JOBS_PER_DIGEST = 100
JOB_TEXT_MAX_LENGTH = 300
JOB_REASONING_MAX_LENGTH = 5000
JOB_URL_MAX_LENGTH = 2048
USER_NAME_MAX_LENGTH = 100
PLATFORM_NAME_MAX_LENGTH = 200
PUSH_TEMPLATE_MAX_LENGTH = 2000
MAX_MATCH_SCORE = 100
FOLLOW_UP_SUBJECT = "Job Follow-up Reminder"
BODY_MAX_LENGTH = 10_000
DEFAULT_USER_NAME = "Candidate"
DEFAULT_PLATFORM_NAME = "Job Platform"
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]+")


@dataclass(frozen=True)
class DigestContext:
    """What every digest of one source shares: the service owner, the source (name, templates, recipients)
    and the user's name."""

    owner: str
    platform: Any
    user_name: str


def _single_line(text: Optional[str], limit: int, fallback: str) -> str:
    return _CONTROL_CHARACTERS.sub(" ", text or "")[:limit].strip() or fallback


def _score(value: Optional[float]) -> Optional[float]:
    return None if value is None else min(max(float(value), 0), MAX_MATCH_SCORE)


def job_item(job) -> Dict[str, Any]:
    """A job as the digest's variables, cut to the service's bounds; a too long link is dropped."""
    url = job.url or ""
    return {
        "title": (job.title or "")[:JOB_TEXT_MAX_LENGTH],
        "company": (job.company or "")[:JOB_TEXT_MAX_LENGTH],
        "match_score": _score(job.match_score),
        "reasoning": (job.reasoning or "")[:JOB_REASONING_MAX_LENGTH],
        "url": url if len(url) <= JOB_URL_MAX_LENGTH else "",
    }


def _push_text(platform) -> Optional[str]:
    template = getattr(platform, "pushover_template", None) or None
    if template and len(template) > PUSH_TEMPLATE_MAX_LENGTH:
        logger.warning("Push template over %d characters: the built-in text is sent", PUSH_TEMPLATE_MAX_LENGTH)
        return None
    return template


def digest_template(jobs: Sequence[Any], context: DigestContext, channel_type: str) -> Dict[str, Any]:
    """The ``job_digest`` template for one channel type, with the source's template of that type."""
    platform = context.platform
    template: Dict[str, Any] = {
        "name": DIGEST_TEMPLATE,
        "variables": {
            "user_name": _single_line(context.user_name, USER_NAME_MAX_LENGTH, DEFAULT_USER_NAME),
            "platform_name": _single_line(getattr(platform, "name", None), PLATFORM_NAME_MAX_LENGTH, DEFAULT_PLATFORM_NAME),
            "jobs": [job_item(job) for job in jobs],
        },
    }
    if channel_type == PUSHOVER:
        template["push_text"] = _push_text(platform)
    else:
        template["html"] = getattr(platform, f"{channel_type}_template", None) or None
    return template


def selected_channels(owner: str, platform) -> Dict[str, List[str]]:
    """The source's channels that still exist, grouped by type (one service call; deleted ones drop out)."""
    wanted = {entry["id"] for entry in platform.notification_channels or []}
    if not wanted:
        return {}
    groups: Dict[str, List[str]] = {}
    for channel in notifications_client.get_client().list_channels(owner):
        if channel["id"] in wanted:
            groups.setdefault(channel["type"], []).append(channel["id"])
    return groups


def _notification(channel_ids: List[str], template: Dict[str, Any], recipients) -> Dict[str, Any]:
    body: Dict[str, Any] = {"channel_ids": channel_ids, "template": template}
    if recipients:
        body["recipients"] = list(recipients)
    return body


def _send(owner: str, notification: Dict[str, Any]) -> None:
    results = notifications_client.get_client().send(owner, notification)
    reasons = sorted({result["reason"] for result in results if not result["delivered"]})
    delivered = sum(1 for result in results if result["delivered"])
    logger.info("Match notification: %d of %d channel(s) delivered, reasons %s", delivered, len(results), reasons)


def send_digests(groups: Dict[str, List[str]], jobs: Sequence[Any], context: DigestContext) -> None:
    """One notification per channel type in ``groups``, in chunks the service accepts."""
    for channel_type, channel_ids in groups.items():
        recipients = None if channel_type == PUSHOVER else getattr(context.platform, f"{channel_type}_recipients", None)
        for start in range(0, len(jobs), MAX_JOBS_PER_DIGEST):
            template = digest_template(jobs[start:start + MAX_JOBS_PER_DIGEST], context, channel_type)
            _send(context.owner, _notification(channel_ids, template, recipients))


def _user_name(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    return user.username if user else DEFAULT_USER_NAME


def _email_groups(groups: Dict[str, List[str]]) -> Dict[str, List[str]]:
    return {channel_type: ids for channel_type, ids in groups.items() if channel_type in EMAIL_TYPES}


def notify_match(db: Session, redis_client, job: JobEntry, platform: JobPlatform, crawl_job_id: Optional[str]) -> bool:
    """Notify one new match; True when the source has a channel to notify (so the job counts as notified)."""
    owner = owner_for(job.user_id)
    groups = selected_channels(owner, platform)
    if not groups:
        return False
    context = DigestContext(owner, platform, _user_name(db, job.user_id))
    if PUSHOVER in groups:
        send_digests({PUSHOVER: groups[PUSHOVER]}, [job], context)
    email_groups = _email_groups(groups)
    if email_groups and crawl_job_id:
        key = PENDING_DIGEST_KEY.format(crawl_job_id=crawl_job_id)
        redis_client.rpush(key, job.id)
        redis_client.expire(key, PENDING_DIGEST_TTL_SECONDS)
    elif email_groups:
        send_digests(email_groups, [job], context)
    return True


def _queued_jobs(db: Session, redis_client, crawl_job_id: str) -> List[JobEntry]:
    key = PENDING_DIGEST_KEY.format(crawl_job_id=crawl_job_id)
    raw_ids = redis_client.lrange(key, 0, -1)
    if not raw_ids:
        return []
    redis_client.delete(key)
    job_ids = [raw.decode("utf-8") if isinstance(raw, bytes) else str(raw) for raw in raw_ids]
    return db.query(JobEntry).filter(JobEntry.id.in_(job_ids)).all()


def flush_digest(crawl_job_id: str, user_id: int, db: Session, redis_client) -> None:
    """Send the e-mail digests of the matches queued during a finished crawl, if any.

    A failure is logged and never fails the crawl's completion.
    """
    jobs = _queued_jobs(db, redis_client, crawl_job_id)
    if not jobs or not jobs[0].platform_id:
        return
    platform = db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()
    if platform is None:
        return
    owner = owner_for(user_id)
    try:
        groups = _email_groups(selected_channels(owner, platform))
        send_digests(groups, jobs, DigestContext(owner, platform, _user_name(db, user_id)))
    except NotifyError as error:
        logger.error("Match digest not sent (%s)", error.code)


def send_follow_up_reminder(user_id: int, message: str) -> bool:
    """A plain reminder to the user's Pushover channels (the old reminder went to Pushover only).

    Returns whether at least one channel delivered it; raises NotifyError when the service fails.
    """
    owner = owner_for(user_id)
    client = notifications_client.get_client()
    channel_ids = [channel["id"] for channel in client.list_channels(owner) if channel["type"] == PUSHOVER]
    if not channel_ids:
        return False
    body = {"channel_ids": channel_ids, "subject": FOLLOW_UP_SUBJECT, "body": message[:BODY_MAX_LENGTH]}
    return any(result["delivered"] for result in client.send(owner, body))
