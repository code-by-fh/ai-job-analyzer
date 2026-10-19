"""Channel types and the mapping between the old per-user credential columns and service channels.

The old model had one channel per type with its credentials on ``user_settings``. The start-up migration
translates them through :data:`LEGACY_FIELDS`; ``GET /settings`` leaves those columns out.
"""

import re
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from database.core import EMAIL_PATTERN, MAX_EMAIL_LENGTH, JobPlatform

PUSHOVER = "pushover"
RESEND = "resend"
MAILJET = "mailjet"
SMTP = "smtp"
CHANNEL_TYPES = (PUSHOVER, RESEND, MAILJET, SMTP)
EMAIL_TYPES = (RESEND, MAILJET, SMTP)
CHANNEL_NAMES = {PUSHOVER: "Pushover", RESEND: "Resend", MAILJET: "Mailjet", SMTP: "SMTP"}
RECIPIENTS_FIELD = "recipients"
FROM_EMAIL_FIELD = "from_email"
SMTP_USERNAME_FIELD = "username"

# Old profile column -> service field, per type.
LEGACY_FIELDS: Dict[str, Dict[str, str]] = {
    PUSHOVER: {"pushover_user_key": "user_key", "pushover_api_token": "api_token"},
    RESEND: {"resend_api_key": "api_key", "resend_from_email": FROM_EMAIL_FIELD},
    MAILJET: {"mailjet_api_key": "api_key", "mailjet_secret_key": "secret_key", "mailjet_from_email": FROM_EMAIL_FIELD},
    SMTP: {
        "smtp_host": "host", "smtp_port": "port", "smtp_user": SMTP_USERNAME_FIELD,
        "smtp_password": "password", "smtp_from_email": FROM_EMAIL_FIELD,
    },
}
# What made an old channel sendable (the old routers/settings.py _channel_status); clearing one removes it.
LEGACY_REQUIRED: Dict[str, tuple] = {
    PUSHOVER: ("pushover_user_key", "pushover_api_token"),
    RESEND: ("resend_api_key", "resend_from_email"),
    MAILJET: ("mailjet_api_key", "mailjet_secret_key", "mailjet_from_email"),
    SMTP: ("smtp_host", "smtp_user", "smtp_password"),
}
LEGACY_CREDENTIAL_FIELDS = tuple(name for fields in LEGACY_FIELDS.values() for name in fields)
_EMAIL_ADDRESS = re.compile(EMAIL_PATTERN)


def legacy_type(adapter: str) -> Optional[str]:
    """``"PUSHOVER"`` -> ``"pushover"``; None for a name that is no channel type."""
    channel_type = (adapter or "").lower()
    return channel_type if channel_type in CHANNEL_TYPES else None


def first_by_type(channels: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """The oldest channel of each type: the one the old one-per-type pages show and edit."""
    first: Dict[str, Dict[str, Any]] = {}
    for channel in channels:
        first.setdefault(channel["type"], channel)
    return first


def is_email_address(value: Optional[str]) -> bool:
    return bool(value) and len(value) <= MAX_EMAIL_LENGTH and _EMAIL_ADDRESS.match(value) is not None


def service_fields(channel_type: str, legacy_values: Dict[str, Any]) -> Dict[str, Any]:
    """The service fields named by the given old columns (only those present)."""
    mapping = LEGACY_FIELDS[channel_type]
    return {mapping[name]: value for name, value in legacy_values.items() if name in mapping}


def default_recipients(fields: Dict[str, Any], global_recipient: Optional[str]) -> List[str]:
    """An e-mail channel needs recipients: the old default recipient, else the sender's own address."""
    if is_email_address(global_recipient):
        return [global_recipient]
    sender = fields.get(FROM_EMAIL_FIELD)
    return [sender] if is_email_address(sender) else []


def new_channel(channel_type: str, legacy_values: Dict[str, Any], global_recipient: Optional[str]) -> Dict[str, Any]:
    """A create body from old values. SMTP without a sender uses the login when it is an address."""
    fields = {name: value for name, value in service_fields(channel_type, legacy_values).items() if value is not None}
    if channel_type == SMTP and not fields.get(FROM_EMAIL_FIELD) and is_email_address(fields.get(SMTP_USERNAME_FIELD)):
        fields[FROM_EMAIL_FIELD] = fields[SMTP_USERNAME_FIELD]
    if channel_type in EMAIL_TYPES:
        recipients = default_recipients(fields, global_recipient)
        if recipients:
            fields[RECIPIENTS_FIELD] = recipients
    return {"type": channel_type, "name": CHANNEL_NAMES[channel_type], "fields": fields}


def forget_channel(db: Session, user_id: int, channel_id: str) -> None:
    """Drop a deleted channel from the user's sources (the caller commits).

    No source keeps a dead reference; a source left without channels is switched off, and a channel created
    later (also of the same type) is not selected by itself.
    """
    sources = db.query(JobPlatform).filter(JobPlatform.user_id == user_id, JobPlatform.notification_channels.isnot(None))
    for source in sources:
        kept = [entry for entry in source.notification_channels if entry["id"] != channel_id]
        if len(kept) != len(source.notification_channels):
            source.notification_channels = kept
            source.is_notification_enabled = bool(kept)
