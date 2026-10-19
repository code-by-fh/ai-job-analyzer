"""The one client of the notification service (notification-service/README.md).

Every notification the server sends, and every channel a user manages, goes through this module. URL and
key come from ``NOTIFY_API_URL`` / ``NOTIFY_API_KEY``; :func:`get_client` raises :class:`NotifyConfigError`
when either is missing, and the API and the worker call it at start-up so a misconfigured process fails
fast. Logs name the method, the route without its query (the owner), the status and the error code;
never a key, a field value, a recipient or the service's message text.
"""

import hashlib
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import requests

from core.logger import get_logger

logger = get_logger(__name__)

NOTIFY_API_URL_ENV = "NOTIFY_API_URL"
NOTIFY_API_KEY_ENV = "NOTIFY_API_KEY"
# The service refuses shorter keys (notification-service/app/config.py).
MIN_API_KEY_LENGTH = 32
CONNECT_TIMEOUT_SECONDS = 3
# Channel CRUD: an SMTP host is resolved on create/update with a 3 s DNS timeout.
READ_TIMEOUT_SECONDS = 15
# A test send waits for one provider (15 s each, SMTP connect, STARTTLS and login included).
TEST_READ_TIMEOUT_SECONDS = 45
# A digest goes to up to 20 channels one after the other.
SEND_READ_TIMEOUT_SECONDS = 120
# An owner has at most 20 channels; one page of the service's maximum holds them all.
CHANNEL_PAGE_SIZE = 100
OWNER_PREFIX = "u_"
OWNER_HASH_CONTEXT = "ai-job-agent/notification-owner/"
OWNER_HASH_LENGTH = 32

UNAVAILABLE = "UNAVAILABLE"
NOT_FOUND = "NOT_FOUND"
VALIDATION_ERROR = "VALIDATION_ERROR"
CHANNEL_LIMIT_REACHED = "CHANNEL_LIMIT_REACHED"
RATE_LIMITED = "RATE_LIMITED"
REJECTED = "REJECTED"
_CODE_BY_STATUS = {404: NOT_FOUND, 409: CHANNEL_LIMIT_REACHED, 422: VALIDATION_ERROR, 429: RATE_LIMITED}
_SERVER_ERROR = 500
_NO_CONTENT = 204


class NotifyConfigError(RuntimeError):
    """NOTIFY_API_URL or NOTIFY_API_KEY is unset or unusable; the message names the variable, never a value."""


class NotifyError(Exception):
    """A failed call, reduced to a fixed ``code`` (the constants above).

    ``fields`` holds the service's per-field refusals of a 422 as ``(path, message)`` pairs, where the
    path is dotted (``fields.host``) and the message is one of the service's fixed texts.
    ``retry_after`` is the seconds of a 429.
    """

    def __init__(self, code: str, fields: Tuple[Tuple[str, str], ...] = (), retry_after: Optional[str] = None):
        super().__init__(code)
        self.code = code
        self.fields = fields
        self.retry_after = retry_after


@dataclass(frozen=True)
class NotifyConfig:
    base_url: str
    api_key: str


def owner_for(user_id: int) -> str:
    """The service owner of a user: stable, derived only from the id, and not the id itself."""
    digest = hashlib.sha256(f"{OWNER_HASH_CONTEXT}{user_id}".encode()).hexdigest()
    return OWNER_PREFIX + digest[:OWNER_HASH_LENGTH]


def load_config(environ=os.environ) -> NotifyConfig:
    """The service address and key from the environment, or NotifyConfigError."""
    base_url = (environ.get(NOTIFY_API_URL_ENV) or "").strip().rstrip("/")
    api_key = (environ.get(NOTIFY_API_KEY_ENV) or "").strip()
    if not base_url.startswith(("http://", "https://")):
        raise NotifyConfigError(f"{NOTIFY_API_URL_ENV} must be set to the notification service's http(s) address")
    if len(api_key) < MIN_API_KEY_LENGTH:
        raise NotifyConfigError(f"{NOTIFY_API_KEY_ENV} must be set (at least {MIN_API_KEY_LENGTH} characters)")
    return NotifyConfig(base_url, api_key)


def _refusal_fields(response: requests.Response) -> Tuple[Tuple[str, str], ...]:
    try:
        fields = response.json()["error"].get("fields") or []
        return tuple((str(item["field"]), str(item["message"])) for item in fields)
    except (ValueError, KeyError, TypeError, AttributeError):
        return ()


def _error_for(response: requests.Response) -> NotifyError:
    code = _CODE_BY_STATUS.get(response.status_code)
    if code is None:
        code = UNAVAILABLE if response.status_code >= _SERVER_ERROR else REJECTED
    fields = _refusal_fields(response) if code == VALIDATION_ERROR else ()
    return NotifyError(code, fields, response.headers.get("Retry-After"))


class NotificationsClient:
    """Thin typed wrapper over the service's /v1 routes; every method raises NotifyError on failure."""

    def __init__(self, config: NotifyConfig, session: Optional[requests.Session] = None):
        self._config = config
        self._session = session or requests.Session()

    def _request(self, method: str, path: str, *, params=None, json=None, read_timeout=READ_TIMEOUT_SECONDS) -> Any:
        try:
            response = self._session.request(
                method, self._config.base_url + path, params=params, json=json,
                headers={"Authorization": f"Bearer {self._config.api_key}"},
                timeout=(CONNECT_TIMEOUT_SECONDS, read_timeout), allow_redirects=False,
            )
        except requests.RequestException as error:
            logger.warning("Notification service %s %s unreachable (%s)", method, path, type(error).__name__)
            raise NotifyError(UNAVAILABLE) from error
        if response.status_code >= 400:
            error = _error_for(response)
            logger.warning("Notification service %s %s answered %s (%s)", method, path, response.status_code, error.code)
            raise error
        if response.status_code == _NO_CONTENT:
            return None
        try:
            return response.json()
        except ValueError as error:
            # A success that is no JSON (a proxy page, a cut connection) is as unusable as no answer.
            logger.warning("Notification service %s %s answered %s without JSON", method, path, response.status_code)
            raise NotifyError(UNAVAILABLE) from error

    def channel_types(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/v1/channel-types")["items"]

    def list_channels(self, owner: str) -> List[Dict[str, Any]]:
        """All of the owner's channels, oldest first."""
        params = {"owner": owner, "limit": CHANNEL_PAGE_SIZE}
        return self._request("GET", "/v1/channels", params=params)["items"]

    def get_channel(self, owner: str, channel_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/v1/channels/{channel_id}", params={"owner": owner})

    def create_channel(self, owner: str, channel: Dict[str, Any]) -> Dict[str, Any]:
        """``channel`` is ``{"type", "name", "fields"}``."""
        return self._request("POST", "/v1/channels", json={"owner": owner, **channel})

    def update_channel(self, owner: str, channel_id: str, change: Dict[str, Any]) -> Dict[str, Any]:
        """``change`` is ``{"name"?, "fields"?}``: omitted keys stay, a null field is cleared."""
        return self._request("PATCH", f"/v1/channels/{channel_id}", params={"owner": owner}, json=change)

    def delete_channel(self, owner: str, channel_id: str) -> None:
        self._request("DELETE", f"/v1/channels/{channel_id}", params={"owner": owner})

    def test_channel(self, owner: str, channel_id: str) -> Dict[str, Any]:
        """``{"channel_id", "delivered", "reason"}`` of a fixed test message to the channel's own recipients."""
        path = f"/v1/channels/{channel_id}/test"
        return self._request("POST", path, params={"owner": owner}, read_timeout=TEST_READ_TIMEOUT_SECONDS)

    def send(self, owner: str, notification: Dict[str, Any]) -> List[Dict[str, Any]]:
        """One ``{"channel_id", "delivered", "reason"}`` per channel of a ``POST /v1/notifications`` body."""
        body = {"owner": owner, **notification}
        return self._request("POST", "/v1/notifications", json=body, read_timeout=SEND_READ_TIMEOUT_SECONDS)["results"]

    def preview(self, template: Dict[str, Any]) -> Dict[str, Any]:
        """``{"subject", "html", "push_text"}`` of a job digest template; nothing is sent."""
        return self._request("POST", "/v1/previews", json={"template": template})

    def delete_owner_channels(self, owner: str) -> int:
        """Delete every channel of the owner (account reset and delete); returns how many there were."""
        channels = self.list_channels(owner)
        for channel in channels:
            try:
                self.delete_channel(owner, channel["id"])
            except NotifyError as error:
                if error.code != NOT_FOUND:
                    raise
        return len(channels)


@lru_cache(maxsize=1)
def get_client() -> NotificationsClient:
    """The process-wide client; raises NotifyConfigError when the environment lacks the service settings."""
    return NotificationsClient(load_config())
