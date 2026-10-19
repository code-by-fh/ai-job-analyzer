"""SMTP delivery with STARTTLS, a verified certificate and a connection pinned to a checked address.

The host is resolved and checked right before sending (it may have changed since it was saved), and
the socket goes to exactly that address, so a second DNS answer (rebinding) is never used. TLS still
verifies the certificate against the host name. Credentials are never sent without TLS.
"""

import logging
import smtplib
import socket
import ssl
from email.message import EmailMessage
from typing import Any, List, Mapping, Optional, Tuple

from app import net_safety
from app.channel_types import DEFAULT_SMTP_PORT
from app.delivery.content import Content, EmailContent
from app.delivery.reasons import (
    AUTH_REJECTED,
    FAILED,
    HOST_NOT_PUBLIC,
    REJECTED,
    TIMEOUT,
    TLS_FAILED,
    UNREACHABLE,
    DeliveryError,
)

logger = logging.getLogger("notify.delivery")

TIMEOUT_SECONDS = 15
# Fixed EHLO name: the default would look up the container's own name in DNS.
EHLO_NAME = "ai-job-agent-notify"

# First match wins. Order matters: SMTPException, SSLError and TimeoutError are all OSErrors.
_REASONS: Tuple[Tuple[Tuple[type, ...], str], ...] = (
    # smtplib encodes AUTH as ASCII; a stored credential it cannot encode is a refused login.
    ((smtplib.SMTPAuthenticationError, UnicodeError), AUTH_REJECTED),
    ((smtplib.SMTPNotSupportedError, ssl.SSLError), TLS_FAILED),
    ((smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError), REJECTED),
    ((TimeoutError,), TIMEOUT),
    ((smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected), UNREACHABLE),
    ((smtplib.SMTPException,), FAILED),
    ((OSError,), UNREACHABLE),
)


class PinnedSMTP(smtplib.SMTP):
    """An SMTP client whose socket goes to a fixed address while ``connect(host, ...)`` keeps the
    host name for EHLO/STARTTLS certificate checks."""

    def __init__(self, address: str, timeout: float) -> None:
        super().__init__(local_hostname=EHLO_NAME, timeout=timeout)
        self._pinned_address = address

    def _get_socket(self, host: str, port: int, timeout: float) -> socket.socket:
        return socket.create_connection((self._pinned_address, port), timeout, self.source_address)


def _message(fields: Mapping[str, Any], email: EmailContent, recipients: List[str]) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = email.subject
    message["From"] = fields["from_email"]
    message["To"] = ", ".join(recipients)
    if email.html is not None:
        message.set_content(email.html, subtype="html")
    else:
        message.set_content(email.text or "")
    return message


def _reason_for(error: Exception) -> Optional[str]:
    return next((reason for types, reason in _REASONS if isinstance(error, types)), None)


def _deliver(address: str, fields: Mapping[str, Any], message: EmailMessage, recipients: List[str]) -> None:
    with PinnedSMTP(address, timeout=TIMEOUT_SECONDS) as client:
        client.connect(fields["host"], fields.get("port", DEFAULT_SMTP_PORT))
        client.starttls(context=ssl.create_default_context())
        client.login(fields["username"], fields["password"])
        client.send_message(message, fields["from_email"], recipients)


def send_smtp(fields: Mapping[str, Any], content: Content, recipients: List[str]) -> None:
    """Send the e-mail content; raises DeliveryError with a fixed reason. Logs the error type only."""
    address = net_safety.public_address(fields["host"], fields.get("port", DEFAULT_SMTP_PORT))
    if address is None:
        logger.warning("SMTP host refused: not public")
        raise DeliveryError(HOST_NOT_PUBLIC)
    try:
        _deliver(address, fields, _message(fields, content.email, recipients), recipients)
    except (OSError, UnicodeError) as error:
        # Type name only: a UnicodeError's text quotes the credential it could not encode.
        logger.warning("SMTP delivery failed: %s", type(error).__name__)
        raise DeliveryError(_reason_for(error) or FAILED) from error
    logger.info("SMTP sent a mail to %d recipient(s)", len(recipients))
