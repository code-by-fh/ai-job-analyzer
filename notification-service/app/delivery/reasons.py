"""The fixed failure reasons a delivery can end with; nothing a provider says ever reaches a client."""

from fastapi import status

AUTH_REJECTED = "auth_rejected"
REJECTED = "rejected"
UNREACHABLE = "unreachable"
TIMEOUT = "timeout"
TLS_FAILED = "tls_failed"
HOST_NOT_PUBLIC = "host_not_public"
FAILED = "failed"

_AUTH_STATUSES = {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}
_CLIENT_ERROR_RANGE = range(400, 500)


class DeliveryError(Exception):
    """A delivery that did not go through, with one of the fixed reasons above."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def reason_for_status(status_code: int) -> str:
    """The reason for a provider's non-success HTTP status."""
    if status_code in _AUTH_STATUSES:
        return AUTH_REJECTED
    if status_code in _CLIENT_ERROR_RANGE:
        return REJECTED
    return FAILED
