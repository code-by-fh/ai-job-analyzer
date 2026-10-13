"""Push notification adapter (Pushover) and the notification dispatcher."""

from typing import Optional

import requests

from core.logger import get_logger
from database.core import User
from workers.notifications.templates import substitute_variables

logger = get_logger(__name__)


PUSH_DEFAULT_REASONING_LENGTH = 100


def render_push_message(job, template: Optional[str]) -> str:
    """The Pushover text for *job*: the template with its variables filled, or the built-in line."""
    if not template:
        reasoning = (job.reasoning or "")[:PUSH_DEFAULT_REASONING_LENGTH]
        return f"{job.company} - Score: {int(job.match_score)}%\n\n{reasoning}..."
    values = {
        "title": job.title or "",
        "company": job.company or "",
        "match_score": str(int(job.match_score)) if job.match_score else "0",
        "reasoning": job.reasoning or "",
        "url": job.url or "",
    }
    return substitute_variables(template, values)


def _send_via_pushover(job, profile, platform=None):
    """Send a notification via Pushover. Returns True on success."""
    if not profile.pushover_user_key or not profile.pushover_api_token:
        logger.warning("Pushover notification enabled but credentials missing.")
        return False

    template = getattr(platform, "pushover_template", None) if platform else None
    message = render_push_message(job, template)

    payload = {
        "token": profile.pushover_api_token,
        "user": profile.pushover_user_key,
        "title": f"{job.title}",
        "message": message,
        "url": job.url,
        "url_title": "View details",
    }

    resp = requests.post(
        "https://api.pushover.net/1/messages.json", data=payload, timeout=10
    )
    if resp.status_code == 200:
        logger.info(f" Pushover notification sent for job {job.id}")
        return True
    else:
        logger.error(f"Pushover error {resp.status_code}")
        return False


def send_notification(job, profile, db, adapters=None, platform=None):
    """
    Sends notifications via the specified adapters (e.g. ['PUSHOVER']).
    If adapters is None or empty, falls back to profile.active_notification_service.
    Sends via all specified adapters and returns True if at least one succeeded.
    """
    user_obj = (
        db.query(User).filter(User.id == profile.user_id).first()
        if hasattr(profile, "user_id")
        else None
    )
    userName = user_obj.username if user_obj else "Candidate"

    _adapter_fns = {
        "PUSHOVER": lambda j, p: _send_via_pushover(j, p, platform=platform),
    }

    # Determine which adapters to use
    if adapters:
        services = [a.upper() for a in adapters if a.upper() in _adapter_fns]
    else:
        # Fallback: use all adapters that have credentials configured
        services = []
        if profile.pushover_user_key and profile.pushover_api_token:
            services.append("PUSHOVER")

    if not services:
        return False

    any_sent = False
    for service in services:
        try:
            if _adapter_fns[service](job, profile):
                any_sent = True
        except Exception as e:
            logger.error(f"Notification via {service} failed: {type(e).__name__}")

    return any_sent
