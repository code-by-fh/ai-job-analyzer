"""Delivery of rendered content to one channel, ending in delivered or one fixed reason."""

import logging
from typing import Any, Callable, Dict, List, Mapping, Optional

from app.channels import Channel
from app.delivery.content import Content
from app.delivery.http_providers import send_mailjet, send_pushover, send_resend
from app.delivery.reasons import FAILED, DeliveryError
from app.delivery.smtp import send_smtp
from app.schemas import DeliveryOut

logger = logging.getLogger("notify.delivery")

Sender = Callable[[Mapping[str, Any], Content, List[str]], None]
SENDERS: Dict[str, Sender] = {
    "pushover": send_pushover,
    "resend": send_resend,
    "mailjet": send_mailjet,
    "smtp": send_smtp,
}


def deliver(channel: Channel, content: Content, recipients: Optional[List[str]]) -> DeliveryOut:
    """Send *content* through *channel*; request *recipients* replace an e-mail channel's default list."""
    targets = recipients or channel.fields.get("recipients", [])
    try:
        SENDERS[channel.type.id](channel.fields, content, targets)
    except DeliveryError as error:
        logger.warning("Channel %s (%s) not delivered: %s", channel.id, channel.type.id, error.reason)
        return DeliveryOut(channel_id=channel.id, delivered=False, reason=error.reason)
    # One channel's unexpected failure must not stop the others: logged with its stack trace, answered "failed".
    except Exception:
        logger.exception("Channel %s (%s) failed unexpectedly", channel.id, channel.type.id)
        return DeliveryOut(channel_id=channel.id, delivered=False, reason=FAILED)
    return DeliveryOut(channel_id=channel.id, delivered=True)
