"""Map connection-test failures to fixed, actionable messages.

Raw exception text can contain URLs, credentials or hostnames, so it is only
logged; the client receives one of these fixed messages instead. The mapping
uses exception types and HTTP status codes, never message text.
"""

import smtplib
import socket

import httpx
import openai
import requests
from fastapi import HTTPException

from core.logger import get_logger

logger = get_logger(__name__)

MSG_AUTH_FAILED = "Anmeldung abgelehnt (API-Schlüssel prüfen)"
MSG_NOT_FOUND = "Modell nicht gefunden"
MSG_UNREACHABLE = "Server nicht erreichbar"
MSG_TIMEOUT = "Zeitüberschreitung"
MSG_FAILED = "Verbindungstest fehlgeschlagen"

_AUTH_STATUSES = frozenset({401, 403})
_NOT_FOUND_STATUS = 404

# Checked before the unreachable group because several timeout types also
# derive from the connection or OS error classes.
_TIMEOUT_TYPES = (
    openai.APITimeoutError,
    requests.Timeout,
    httpx.TimeoutException,
    socket.timeout,
    TimeoutError,
)
_AUTH_TYPES = (
    openai.AuthenticationError,
    openai.PermissionDeniedError,
    smtplib.SMTPAuthenticationError,
)
_UNREACHABLE_TYPES = (
    openai.APIConnectionError,
    requests.ConnectionError,
    httpx.ConnectError,
    smtplib.SMTPConnectError,
    smtplib.SMTPServerDisconnected,
    socket.gaierror,
    ConnectionError,
)


REASON_AUTH = "auth"
REASON_NOT_FOUND = "not_found"
REASON_UNREACHABLE = "unreachable"
REASON_TIMEOUT = "timeout"
REASON_FAILED = "failed"

_MESSAGE_OF_REASON = {
    REASON_AUTH: MSG_AUTH_FAILED,
    REASON_NOT_FOUND: MSG_NOT_FOUND,
    REASON_UNREACHABLE: MSG_UNREACHABLE,
    REASON_TIMEOUT: MSG_TIMEOUT,
    REASON_FAILED: MSG_FAILED,
}


def reason_for_status(status_code: int) -> str:
    """Fixed reason code for an HTTP status of the tested service (the web words it)."""
    if status_code in _AUTH_STATUSES:
        return REASON_AUTH
    return REASON_NOT_FOUND if status_code == _NOT_FOUND_STATUS else REASON_FAILED


def _status_of(error: Exception):
    if isinstance(error, openai.APIStatusError):
        return error.status_code
    response = getattr(error, "response", None)
    return getattr(response, "status_code", None)


def reason_for_error(error: Exception) -> str:
    """Fixed reason code for an exception raised while testing a connection; the one classifier."""
    if isinstance(error, _TIMEOUT_TYPES):
        return REASON_TIMEOUT
    if isinstance(error, _AUTH_TYPES):
        return REASON_AUTH
    if isinstance(error, _UNREACHABLE_TYPES):
        return REASON_UNREACHABLE
    status = _status_of(error)
    return reason_for_status(status) if status is not None else REASON_FAILED


def message_for_status(status_code: int) -> str:
    """Fixed message for an HTTP status returned by the tested service."""
    return _MESSAGE_OF_REASON[reason_for_status(status_code)]


def message_for_error(error: Exception) -> str:
    """Fixed message for an exception raised while testing a connection."""
    return _MESSAGE_OF_REASON[reason_for_error(error)]


def connection_test_error(error: Exception, status_code: int, context: str) -> HTTPException:
    """Log the real error with its stack trace and build the client-safe response."""
    logger.error("%s failed", context, exc_info=error)
    return HTTPException(status_code=status_code, detail=message_for_error(error))
