"""Every route except GET /health needs a valid API key; oversized bodies are refused."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.limits import MAX_BODY_BYTES
from tests.conftest import API_KEY, auth, pushover_channel

PROTECTED = [
    ("GET", "/v1/channel-types"),
    ("GET", "/v1/channels?owner=user-1"),
    ("POST", "/v1/channels"),
    ("POST", "/v1/notifications"),
    ("GET", "/v1/openapi.json"),
    ("GET", "/docs"),
    ("GET", "/does-not-exist"),
]


def test_health_answers_without_a_key(raw_client: TestClient):
    response = raw_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("method, path", PROTECTED)
def test_a_request_without_a_key_is_refused_before_routing(raw_client: TestClient, method, path):
    response = raw_client.request(method, path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    [f"Bearer {API_KEY}x", f"Bearer {API_KEY[:-1]}", f"Basic {API_KEY}", API_KEY, "Bearer ", f"Bearer  {API_KEY}"],
)
def test_a_wrong_or_malformed_key_is_refused(raw_client: TestClient, header):
    response = raw_client.get("/v1/channel-types", headers={"Authorization": header})
    assert response.status_code == 401


def test_malformed_json_without_a_key_gets_401_not_a_validation_error(raw_client: TestClient):
    response = raw_client.post("/v1/channels", content=b"{not json", headers={"Content-Type": "application/json"})
    assert response.status_code == 401


def test_a_valid_key_is_accepted(raw_client: TestClient):
    assert raw_client.get("/v1/channel-types", headers=auth()).status_code == 200


def test_the_api_description_is_served_behind_the_key(client: TestClient):
    response = client.get("/v1/openapi.json")
    assert response.status_code == 200
    assert "/v1/channels" in response.json()["paths"]


def test_an_unknown_route_with_a_key_is_a_404_envelope(client: TestClient):
    response = client.get("/v1/nothing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_a_body_above_the_limit_is_refused(client: TestClient):
    oversized = pushover_channel(name="x" * MAX_BODY_BYTES)
    response = client.post("/v1/channels", json=oversized)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_a_chunked_body_above_the_limit_is_refused(client: TestClient):
    def chunks():
        yield b"{" + b" " * MAX_BODY_BYTES
        yield b"}"

    response = client.post("/v1/channels", content=chunks(), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_a_websocket_is_refused_even_with_a_key(client: TestClient):
    with pytest.raises(WebSocketDisconnect) as refusal:
        with client.websocket_connect("/v1/channels"):
            pass
    assert refusal.value.code == 1008
