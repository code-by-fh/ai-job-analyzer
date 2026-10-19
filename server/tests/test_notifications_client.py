"""services/notifications_client.py: env config that fails fast, bounded timeouts, fixed error codes, quiet logs."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest
import requests

from services.notifications_client import (
    CONNECT_TIMEOUT_SECONDS,
    NotificationsClient,
    NotifyConfig,
    NotifyConfigError,
    NotifyError,
    get_client,
    load_config,
    owner_for,
)

BASE_URL = "http://notify.test:8000"
API_KEY = "k" * 40
OWNER = owner_for(7)
SECRET = "PASSWORD-THAT-MUST-NOT-LEAK"
RECIPIENT = "private.person@example.com"
CHANNEL = {"id": "6f1c0000-0000-0000-0000-000000000001", "type": "resend", "name": "Mail", "owner": OWNER}


class FakeSession:
    """The HTTP boundary: records each request and answers with the queued response or error."""

    def __init__(self, status_code=200, body=None, headers=None, error=None):
        self.calls = []
        self._answer = SimpleNamespace(status_code=status_code, headers=headers or {}, json=lambda: body)
        self._error = error

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        if self._error is not None:
            raise self._error
        return self._answer


def _client(session: FakeSession) -> NotificationsClient:
    return NotificationsClient(NotifyConfig(BASE_URL, API_KEY), session)


@pytest.mark.parametrize("environ,variable", [
    ({}, "NOTIFY_API_URL"),
    ({"NOTIFY_API_URL": "notify:8000", "NOTIFY_API_KEY": API_KEY}, "NOTIFY_API_URL"),
    ({"NOTIFY_API_URL": BASE_URL}, "NOTIFY_API_KEY"),
    ({"NOTIFY_API_URL": BASE_URL, "NOTIFY_API_KEY": "short-key"}, "NOTIFY_API_KEY"),
])
def test_missing_or_unusable_settings_fail_naming_the_variable(environ, variable):
    with pytest.raises(NotifyConfigError, match=variable) as raised:
        load_config(environ)
    assert "short-key" not in str(raised.value)


def test_settings_are_read_from_the_environment():
    assert load_config({"NOTIFY_API_URL": BASE_URL + "/", "NOTIFY_API_KEY": API_KEY}) == NotifyConfig(BASE_URL, API_KEY)


def test_get_client_fails_fast_without_settings(monkeypatch):
    # The name imported above is the real function; the autouse fixture only replaces the module attribute.
    monkeypatch.delenv("NOTIFY_API_URL", raising=False)
    get_client.cache_clear()
    with pytest.raises(NotifyConfigError):
        get_client()
    get_client.cache_clear()


def test_the_owner_is_stable_opaque_and_per_user():
    assert owner_for(7) == owner_for(7)
    assert owner_for(7) != owner_for(8)
    assert "7" != owner_for(7) and owner_for(7).startswith("u_") and len(owner_for(7)) == 34


def test_a_request_carries_the_key_a_bounded_timeout_and_no_redirects():
    session = FakeSession(body={"items": [CHANNEL]})
    assert _client(session).list_channels(OWNER) == [CHANNEL]
    call = session.calls[0]
    assert (call["method"], call["url"], call["params"]) == ("GET", BASE_URL + "/v1/channels", {"owner": OWNER, "limit": 100})
    assert call["headers"] == {"Authorization": f"Bearer {API_KEY}"}
    assert call["timeout"][0] == CONNECT_TIMEOUT_SECONDS and call["timeout"][1] <= 120
    assert call["allow_redirects"] is False


def test_create_sends_the_owner_with_the_channel():
    session = FakeSession(status_code=201, body=CHANNEL)
    _client(session).create_channel(OWNER, {"type": "resend", "name": "Mail", "fields": {}})
    assert session.calls[0]["json"] == {"owner": OWNER, "type": "resend", "name": "Mail", "fields": {}}


def test_delete_answers_nothing_on_204():
    assert _client(FakeSession(status_code=204)).delete_channel(OWNER, CHANNEL["id"]) is None


def test_delete_owner_channels_removes_each_channel():
    session = FakeSession(body={"items": [CHANNEL, {**CHANNEL, "id": "other"}]})
    assert _client(session).delete_owner_channels(OWNER) == 2
    assert [call["method"] for call in session.calls] == ["GET", "DELETE", "DELETE"]


def test_delete_owner_channels_ignores_a_channel_deleted_in_the_meantime():
    session = FakeSession(body={"items": [CHANNEL, {**CHANNEL, "id": "other"}]})
    client = _client(session)
    answers = [None, NotifyError("NOT_FOUND")]
    original = client.delete_channel

    def delete(owner, channel_id):
        answer = answers.pop(0)
        if answer:
            raise answer
        original(owner, channel_id)

    client.delete_channel = delete
    assert client.delete_owner_channels(OWNER) == 2


def test_delete_owner_channels_still_raises_other_errors():
    client = _client(FakeSession(body={"items": [CHANNEL]}))

    def delete(owner, channel_id):
        raise NotifyError("UNAVAILABLE")

    client.delete_channel = delete
    with pytest.raises(NotifyError):
        client.delete_owner_channels(OWNER)


@pytest.mark.parametrize("status_code,code", [
    (404, "NOT_FOUND"), (409, "CHANNEL_LIMIT_REACHED"), (429, "RATE_LIMITED"),
    (401, "REJECTED"), (413, "REJECTED"), (500, "UNAVAILABLE"), (503, "UNAVAILABLE"),
])
def test_error_statuses_become_fixed_codes(status_code, code):
    with pytest.raises(NotifyError) as raised:
        _client(FakeSession(status_code=status_code, body={"error": {"code": "X"}})).get_channel(OWNER, CHANNEL["id"])
    assert raised.value.code == code


def _no_json():
    raise ValueError("Expecting value")


def test_a_success_without_json_is_unavailable():
    session = FakeSession(body=None)
    session._answer.json = _no_json
    with pytest.raises(NotifyError) as raised:
        _client(session).list_channels(OWNER)
    assert raised.value.code == "UNAVAILABLE"


def test_a_validation_refusal_keeps_the_per_field_details():
    body = {"error": {"code": "VALIDATION_ERROR", "fields": [{"field": "fields.host", "message": "must resolve to public addresses"}]}}
    with pytest.raises(NotifyError) as raised:
        _client(FakeSession(status_code=422, body=body)).create_channel(OWNER, {})
    assert raised.value.code == "VALIDATION_ERROR"
    assert raised.value.fields == (("fields.host", "must resolve to public addresses"),)


def test_a_rate_limit_keeps_retry_after():
    with pytest.raises(NotifyError) as raised:
        _client(FakeSession(status_code=429, body={}, headers={"Retry-After": "12"})).test_channel(OWNER, CHANNEL["id"])
    assert raised.value.retry_after == "12"


@pytest.mark.parametrize("error", [requests.ConnectionError("refused"), requests.Timeout("slow")])
def test_an_unreachable_service_is_unavailable(error):
    with pytest.raises(NotifyError) as raised:
        _client(FakeSession(error=error)).channel_types()
    assert raised.value.code == "UNAVAILABLE"


def test_logs_name_neither_key_owner_nor_values():
    body = {"error": {"code": "VALIDATION_ERROR", "message": RECIPIENT, "fields": []}}
    session = FakeSession(status_code=422, body=body)
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("services.notifications_client.logger") as logger, pytest.raises(NotifyError):
        _client(session).create_channel(OWNER, {"type": "smtp", "fields": {"password": SECRET, "recipients": [RECIPIENT]}})
    logger.warning.assert_called_once_with(
        "Notification service %s %s answered %s (%s)", "POST", "/v1/channels", 422, "VALIDATION_ERROR"
    )
    for leaked in (API_KEY, OWNER, SECRET, RECIPIENT):
        assert leaked not in str(logger.mock_calls)


def _missing_settings():
    raise NotifyConfigError("NOTIFY_API_URL must be set")


def test_the_api_refuses_to_start_without_the_service_settings(monkeypatch):
    from fastapi.testclient import TestClient

    from main import app

    monkeypatch.setattr("services.notifications_client.get_client", _missing_settings)
    with pytest.raises(NotifyConfigError), TestClient(app):
        pass


def test_a_worker_refuses_to_start_without_the_service_settings(monkeypatch):
    from workers.worker import _require_notification_service

    monkeypatch.setattr("services.notifications_client.get_client", _missing_settings)
    with pytest.raises(NotifyConfigError):
        _require_notification_service()
