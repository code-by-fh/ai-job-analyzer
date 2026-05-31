"""Push notification adapter (Pushover) and the notification dispatcher."""

import requests

from core.logger import get_logger
from database.core import User

logger = get_logger(__name__)


def _send_via_pushover(job, profile, platform=None):
    """Send a notification via Pushover. Returns True on success."""
    if not profile.pushover_user_key or not profile.pushover_api_token:
        logger.warning("Pushover notification enabled but credentials missing.")
        return False

    template = getattr(platform, "pushover_template", None) if platform else None
    if template:
        message = template
        message = message.replace("$title", job.title or "")
        message = message.replace("$company", job.company or "")
        message = message.replace(
            "$match_score", str(int(job.match_score)) if job.match_score else "0"
        )
        message = message.replace("$reasoning", job.reasoning or "")
        message = message.replace("$url", job.url or "")
    else:
        message = f"{job.company} - Score: {int(job.match_score)}%\n\n{job.reasoning[:100]}..."

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
        logger.error(f"Pushover Error: {resp.text}")
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
            logger.error(f"Notification via {service} failed: {e}")

    return any_sent
