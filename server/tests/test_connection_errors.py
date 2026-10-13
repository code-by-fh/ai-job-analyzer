import smtplib
import socket
from unittest.mock import MagicMock

import httpx
import openai
import pytest
import requests

from core.auth import get_current_admin_user
from core.connection_errors import (
    MSG_AUTH_FAILED, MSG_FAILED, MSG_NOT_FOUND, MSG_TIMEOUT, MSG_UNREACHABLE,
    message_for_error, message_for_status, reason_for_error, reason_for_status,
)
from database.core import SystemSettings
from main import app

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
RAW_TEXT = "https://user:hunter2@internal-host/secret"
REASON_OF_MESSAGE = {
    MSG_AUTH_FAILED: "auth", MSG_NOT_FOUND: "not_found", MSG_UNREACHABLE: "unreachable",
    MSG_TIMEOUT: "timeout", MSG_FAILED: "failed",
}


def _status_error(cls, status):
    response = httpx.Response(status, request=httpx.Request("POST", "https://x.example"))
    return cls(RAW_TEXT, response=response, body=None)


def _http_error(status):
    response = requests.Response()
    response.status_code = status
    return requests.HTTPError(RAW_TEXT, response=response)


CASES = [
    (_status_error(openai.AuthenticationError, 401), MSG_AUTH_FAILED),
    (_status_error(openai.PermissionDeniedError, 403), MSG_AUTH_FAILED),
    (_http_error(401), MSG_AUTH_FAILED),
    (smtplib.SMTPAuthenticationError(535, b"bad"), MSG_AUTH_FAILED),
    (_status_error(openai.NotFoundError, 404), MSG_NOT_FOUND),
    (_http_error(404), MSG_NOT_FOUND),
    (openai.APIConnectionError(request=httpx.Request("POST", "https://x.example")), MSG_UNREACHABLE),
    (requests.ConnectionError(RAW_TEXT), MSG_UNREACHABLE),
    (httpx.ConnectError(RAW_TEXT), MSG_UNREACHABLE),
    (ConnectionRefusedError(RAW_TEXT), MSG_UNREACHABLE),
    (socket.gaierror(RAW_TEXT), MSG_UNREACHABLE),
    (smtplib.SMTPConnectError(421, b"down"), MSG_UNREACHABLE),
    (openai.APITimeoutError(request=httpx.Request("POST", "https://x.example")), MSG_TIMEOUT),
    (requests.Timeout(RAW_TEXT), MSG_TIMEOUT),
    (requests.ConnectTimeout(RAW_TEXT), MSG_TIMEOUT),
    (httpx.ReadTimeout(RAW_TEXT), MSG_TIMEOUT),
    (socket.timeout(RAW_TEXT), MSG_TIMEOUT),
    (RuntimeError(RAW_TEXT), MSG_FAILED),
    (_status_error(openai.InternalServerError, 500), MSG_FAILED),
]


@pytest.mark.parametrize("error,expected", CASES, ids=lambda v: type(v).__name__ if isinstance(v, Exception) else None)
def test_message_for_error_maps_type_to_fixed_message(error, expected):
    assert message_for_error(error) == expected


@pytest.mark.parametrize("status,expected", [
    (401, MSG_AUTH_FAILED), (403, MSG_AUTH_FAILED), (404, MSG_NOT_FOUND), (500, MSG_FAILED),
])
def test_message_for_status(status, expected):
    assert message_for_status(status) == expected


@pytest.mark.parametrize("error,expected", CASES, ids=lambda v: type(v).__name__ if isinstance(v, Exception) else None)
def test_reason_for_error_maps_like_message_for_error(error, expected):
    assert reason_for_error(error) == REASON_OF_MESSAGE[expected]


@pytest.mark.parametrize("status,expected", [(401, "auth"), (403, "auth"), (404, "not_found"), (500, "failed")])
def test_reason_for_status(status, expected):
    assert reason_for_status(status) == expected


def _admin_client(api_client, seed, monkeypatch, session_factory):
    monkeypatch.setattr("routers.admin.SessionLocal", session_factory)
    seed(SystemSettings(openrouter_api_key="key", openrouter_model="m", ollama_base_url="http://ollama.local"))
    app.dependency_overrides[get_current_admin_user] = lambda: None
    return api_client


@pytest.mark.parametrize("error,expected", [CASES[0], CASES[4], CASES[6], CASES[12], CASES[18]])
def test_admin_openrouter_test_returns_fixed_reason(api_client, seed, monkeypatch, session_factory, error, expected):
    client = _admin_client(api_client, seed, monkeypatch, session_factory)
    fake = MagicMock()
    fake.return_value.chat.completions.create.side_effect = error
    monkeypatch.setattr("openai.OpenAI", fake)
    try:
        response = client.post("/admin/test/openrouter")
    finally:
        app.dependency_overrides.pop(get_current_admin_user, None)
    assert (response.status_code, response.json()) == (200, {"ok": False, "reason": REASON_OF_MESSAGE[expected]})
    assert "hunter2" not in response.text


def test_admin_ollama_test_maps_http_status_and_connection_errors(api_client, seed, monkeypatch, session_factory):
    client = _admin_client(api_client, seed, monkeypatch, session_factory)
    monkeypatch.setattr("intelligence.service.get_ollama_base_url", lambda db: "http://ollama.local")
    monkeypatch.setattr("intelligence.service.get_ollama_model", lambda db: "m")
    try:
        monkeypatch.setattr("routers.admin.requests.get", MagicMock(return_value=MagicMock(ok=False, status_code=401)))
        assert client.post("/admin/test/ollama").json() == {"ok": False, "reason": "auth"}
        monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW_TEXT)))
        response = client.post("/admin/test/ollama")
    finally:
        app.dependency_overrides.pop(get_current_admin_user, None)
    assert (response.status_code, response.json()) == (200, {"ok": False, "reason": "unreachable"})
