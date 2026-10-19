"""Pushover, Resend and Mailjet over HTTPS to fixed provider addresses (no user-supplied URL).

Logs name the provider, counts and HTTP status codes only: never recipients, keys or provider text.
"""

import logging
from typing import Any, Dict, List, Mapping

import requests

from app.delivery.content import Content, EmailContent, PushContent
from app.delivery.reasons import FAILED, TIMEOUT, UNREACHABLE, DeliveryError, reason_for_status

logger = logging.getLogger("notify.delivery")

PUSHOVER_URL = "https://api.pushover.net/1/messages.json"
RESEND_URL = "https://api.resend.com/emails"
MAILJET_URL = "https://api.mailjet.com/v3.1/send"
SENDER_NAME = "Job Agent"
PUSHOVER_LINK_TITLE = "View details"
TIMEOUT_SECONDS = 15
# Pushover's documented limits; a longer value would be refused as a whole.
PUSHOVER_TITLE_MAX = 250
PUSHOVER_MESSAGE_MAX = 1024
PUSHOVER_URL_MAX = 512
_SUCCESS = {200, 201, 202}


def _post(provider: str, url: str, **kwargs: Any) -> None:
    """One provider call; raises DeliveryError with a fixed reason for every failure."""
    try:
        response = requests.post(url, timeout=TIMEOUT_SECONDS, allow_redirects=False, **kwargs)
    except requests.Timeout as error:
        raise DeliveryError(TIMEOUT) from error
    except requests.ConnectionError as error:
        raise DeliveryError(UNREACHABLE) from error
    except requests.RequestException as error:
        logger.warning("%s request failed: %s", provider, type(error).__name__)
        raise DeliveryError(FAILED) from error
    if response.status_code not in _SUCCESS:
        logger.warning("%s answered HTTP %s", provider, response.status_code)
        raise DeliveryError(reason_for_status(response.status_code))


def _pushover_payload(fields: Mapping[str, Any], push: PushContent) -> Dict[str, str]:
    payload = {
        "token": fields["api_token"],
        "user": fields["user_key"],
        "title": push.title[:PUSHOVER_TITLE_MAX],
        "message": push.message[:PUSHOVER_MESSAGE_MAX],
    }
    if push.url and len(push.url) <= PUSHOVER_URL_MAX:
        payload.update(url=push.url, url_title=PUSHOVER_LINK_TITLE)
    return payload


def send_pushover(fields: Mapping[str, Any], content: Content, _recipients: List[str]) -> None:
    """One push per item; the user key is the recipient, so request recipients do not apply."""
    for push in content.pushes:
        _post("Pushover", PUSHOVER_URL, data=_pushover_payload(fields, push))
    logger.info("Pushover sent %d message(s)", len(content.pushes))


def _resend_body(email: EmailContent) -> Dict[str, str]:
    return {"html": email.html} if email.html is not None else {"text": email.text or ""}


def send_resend(fields: Mapping[str, Any], content: Content, recipients: List[str]) -> None:
    email = content.email
    payload = {"from": fields["from_email"], "to": recipients, "subject": email.subject, **_resend_body(email)}
    _post("Resend", RESEND_URL, json=payload, headers={"Authorization": f"Bearer {fields['api_key']}"})
    logger.info("Resend sent a mail to %d recipient(s)", len(recipients))


def _mailjet_body(email: EmailContent) -> Dict[str, str]:
    return {"HTMLPart": email.html} if email.html is not None else {"TextPart": email.text or ""}


def send_mailjet(fields: Mapping[str, Any], content: Content, recipients: List[str]) -> None:
    email = content.email
    message = {
        "From": {"Email": fields["from_email"], "Name": SENDER_NAME},
        "To": [{"Email": recipient} for recipient in recipients],
        "Subject": email.subject,
        **_mailjet_body(email),
    }
    _post("Mailjet", MAILJET_URL, json={"Messages": [message]}, auth=(fields["api_key"], fields["secret_key"]))
    logger.info("Mailjet sent a mail to %d recipient(s)", len(recipients))
