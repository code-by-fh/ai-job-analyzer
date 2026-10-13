"""Signed, short-lived OAuth `state` values.

The Drive callback is reached without a session, so the state is the only proof of which account
started the login. It carries the user id, a nonce and an expiry, signed with SECRET_KEY; the nonce
also travels in a cookie, so a state only works in the browser that started the login.
"""

import hashlib
import hmac
import secrets
from typing import Optional

from core.auth import SECRET_KEY

OAUTH_STATE_TTL_SECONDS = 600
OAUTH_NONCE_BYTES = 16
# Keeps these signatures apart from anything else signed with the same key.
_SIGNING_CONTEXT = "drive-oauth-state"
_SEPARATOR = "."
_STATE_PARTS = 4


def new_oauth_nonce() -> str:
    """A URL-safe random nonce; it never contains the separator."""
    return secrets.token_urlsafe(OAUTH_NONCE_BYTES)


def _signature(payload: str) -> str:
    message = f"{_SIGNING_CONTEXT}{_SEPARATOR}{payload}".encode()
    return hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def sign_oauth_state(user_id: int, nonce: str, expires_at: int) -> str:
    """`<user id>.<nonce>.<expiry as unix seconds>.<hex HMAC-SHA256>`."""
    payload = _SEPARATOR.join((str(user_id), nonce, str(expires_at)))
    return f"{payload}{_SEPARATOR}{_signature(payload)}"


def verify_oauth_state(state: Optional[str], nonce: Optional[str], now: float) -> Optional[int]:
    """The user id of a state this server signed, for this nonce and not yet expired; otherwise None."""
    # Everything this server signs is ASCII; hmac.compare_digest raises TypeError on other str input.
    if not state or not nonce or not state.isascii() or not nonce.isascii():
        return None
    parts = state.split(_SEPARATOR)
    if len(parts) != _STATE_PARTS:
        return None
    user_id, state_nonce, expires_at, signature = parts
    expected = _signature(_SEPARATOR.join((user_id, state_nonce, expires_at)))
    if not hmac.compare_digest(signature, expected) or not hmac.compare_digest(state_nonce, nonce):
        return None
    if not expires_at.isdigit() or int(expires_at) < now or not user_id.isdigit():
        return None
    return int(user_id)
