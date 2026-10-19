"""The supported channel types, their field schemas and the validation of field values.

One table drives both ``GET /v1/channel-types`` and the validation of ``POST``/``PATCH /v1/channels``,
so what a client is told and what the service enforces cannot drift apart.
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Mapping, Optional, Tuple

from app.errors import FieldIssue
from app.limits import EMAIL_MAX_LENGTH, MAX_RECIPIENTS
from app.net_safety import HOST_MAX_LENGTH, is_valid_host

FIELD_PREFIX = "fields"
DEFAULT_SMTP_PORT = 587
MIN_PORT = 1
MAX_PORT = 65_535
REQUIRED = "required"
UNKNOWN_FIELD = "contains an unknown field"
# Local part per RFC 5322 atext, domain as dot-separated LDH labels; no quoting, no whitespace, no CR/LF.
_EMAIL = re.compile(r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+")
# API keys: printable ASCII without spaces.
_TOKEN = re.compile(r"[\x21-\x7e]+")
# SMTP credentials: smtplib encodes AUTH as ASCII, so printable ASCII (spaces allowed).
_ASCII_TEXT = re.compile(r"[\x20-\x7e]+")


class FieldKind(str, Enum):
    TOKEN = "token"
    TEXT = "text"
    ASCII_TEXT = "ascii_text"
    EMAIL = "email"
    EMAIL_LIST = "email_list"
    HOST = "host"
    PORT = "port"


@dataclass(frozen=True)
class Label:
    de: str
    en: str


@dataclass(frozen=True)
class FieldSpec:
    """One configurable field of a channel type."""

    name: str
    label: Label
    kind: FieldKind
    required: bool
    secret: bool = False
    max_length: Optional[int] = None
    max_items: Optional[int] = None
    default: Optional[int] = None


@dataclass(frozen=True)
class ChannelType:
    id: str
    label: Label
    fields: Tuple[FieldSpec, ...]
    is_email: bool

    def field(self, name: str) -> Optional[FieldSpec]:
        return next((spec for spec in self.fields if spec.name == name), None)


API_KEY_MAX_LENGTH = 200
PUSHOVER_KEY_MAX_LENGTH = 100
SMTP_USERNAME_MAX_LENGTH = 254
SMTP_PASSWORD_MAX_LENGTH = 256
_API_KEY_LABEL = Label("API-Schlüssel", "API key")


def _api_key(name: str = "api_key", label: Label = _API_KEY_LABEL) -> FieldSpec:
    return FieldSpec(name, label, FieldKind.TOKEN, required=True, secret=True, max_length=API_KEY_MAX_LENGTH)


_FROM_EMAIL = FieldSpec("from_email", Label("Absender-Adresse", "Sender address"), FieldKind.EMAIL, True, max_length=EMAIL_MAX_LENGTH)
_RECIPIENTS = FieldSpec(
    "recipients", Label("Empfänger", "Recipients"), FieldKind.EMAIL_LIST, True, max_length=EMAIL_MAX_LENGTH, max_items=MAX_RECIPIENTS
)

CHANNEL_TYPES: Dict[str, ChannelType] = {
    channel_type.id: channel_type
    for channel_type in (
        ChannelType("pushover", Label("Pushover", "Pushover"), (
            FieldSpec("api_token", Label("API-Token", "API token"), FieldKind.TOKEN, True, secret=True, max_length=PUSHOVER_KEY_MAX_LENGTH),
            FieldSpec("user_key", Label("User- oder Gruppen-Key", "User or group key"), FieldKind.TOKEN, True, secret=True, max_length=PUSHOVER_KEY_MAX_LENGTH),
        ), is_email=False),
        ChannelType("resend", Label("E-Mail (Resend)", "Email (Resend)"), (_api_key(), _FROM_EMAIL, _RECIPIENTS), is_email=True),
        ChannelType("mailjet", Label("E-Mail (Mailjet)", "Email (Mailjet)"), (
            _api_key(),
            _api_key("secret_key", Label("Secret Key", "Secret key")),
            _FROM_EMAIL,
            _RECIPIENTS,
        ), is_email=True),
        ChannelType("smtp", Label("E-Mail (SMTP)", "Email (SMTP)"), (
            FieldSpec("host", Label("SMTP-Server", "SMTP server"), FieldKind.HOST, True, max_length=HOST_MAX_LENGTH),
            FieldSpec("port", Label("Port (STARTTLS)", "Port (STARTTLS)"), FieldKind.PORT, False, default=DEFAULT_SMTP_PORT),
            FieldSpec("username", Label("Benutzername", "Username"), FieldKind.ASCII_TEXT, True, max_length=SMTP_USERNAME_MAX_LENGTH),
            FieldSpec("password", Label("Passwort", "Password"), FieldKind.ASCII_TEXT, True, secret=True, max_length=SMTP_PASSWORD_MAX_LENGTH),
            _FROM_EMAIL,
            _RECIPIENTS,
        ), is_email=True),
    )
}


def is_email_address(value: Any) -> bool:
    return isinstance(value, str) and len(value) <= EMAIL_MAX_LENGTH and _EMAIL.fullmatch(value) is not None


def _has_control_characters(value: str) -> bool:
    return any(ord(char) < 0x20 or ord(char) == 0x7F for char in value)


def _string_issue(spec: FieldSpec, value: Any) -> Optional[str]:
    if not isinstance(value, str) or not value.strip():
        return "must be a non-empty string"
    if spec.max_length is not None and len(value) > spec.max_length:
        return f"must be at most {spec.max_length} characters"
    if spec.kind is FieldKind.TOKEN and not _TOKEN.fullmatch(value):
        return "must be printable characters without spaces"
    if spec.kind is FieldKind.ASCII_TEXT and not _ASCII_TEXT.fullmatch(value):
        return "must be printable ASCII characters"
    if _has_control_characters(value):
        return "must not contain control characters"
    return None


def _email_list_issue(spec: FieldSpec, value: Any) -> Optional[str]:
    if not isinstance(value, list) or not value:
        return REQUIRED
    if len(value) > (spec.max_items or 0):
        return f"must hold at most {spec.max_items} addresses"
    return None if all(is_email_address(item) for item in value) else "must be email addresses"


def _value_issue(spec: FieldSpec, value: Any) -> Optional[str]:
    """A fixed message for an invalid value, else None; never contains the value itself."""
    if spec.kind is FieldKind.PORT:
        valid = isinstance(value, int) and not isinstance(value, bool) and MIN_PORT <= value <= MAX_PORT
        return None if valid else f"must be an integer from {MIN_PORT} to {MAX_PORT}"
    if spec.kind is FieldKind.EMAIL_LIST:
        return _email_list_issue(spec, value)
    issue = _string_issue(spec, value)
    if issue is None and spec.kind is FieldKind.EMAIL and not is_email_address(value):
        return "must be an email address"
    if issue is None and spec.kind is FieldKind.HOST and not is_valid_host(value):
        return "must be a host name or IP address"
    return issue


def check_fields(channel_type: ChannelType, current: Mapping[str, Any], changes: Mapping[str, Any]) -> Tuple[Dict[str, Any], List[FieldIssue]]:
    """The merged field values (a None change clears a field) and every issue found in them."""
    if any(channel_type.field(name) is None for name in changes):
        return {}, [FieldIssue(FIELD_PREFIX, UNKNOWN_FIELD)]
    merged = {name: value for name, value in {**current, **changes}.items() if value is not None}
    issues = []
    for spec in channel_type.fields:
        message = _value_issue(spec, merged[spec.name]) if spec.name in merged else (REQUIRED if spec.required else None)
        if message is not None:
            issues.append(FieldIssue(f"{FIELD_PREFIX}.{spec.name}", message))
    return merged, issues
