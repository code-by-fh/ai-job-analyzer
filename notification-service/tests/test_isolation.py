"""Every channel route refuses a channel of another owner (same app) and of another app (same owner)."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import OTHER_OWNER, OWNER, pushover_channel

ROUTES = [
    ("GET", "/v1/channels/{id}", None),
    ("PATCH", "/v1/channels/{id}", {"name": "Fremd"}),
    ("DELETE", "/v1/channels/{id}", None),
    ("POST", "/v1/channels/{id}/test", None),
]


@pytest.fixture()
def channel(create_channel) -> dict:
    return create_channel(pushover_channel())


def _call(client: TestClient, route: tuple, channel_id: str, owner: str):
    method, path, body = route
    return client.request(method, path.format(id=channel_id), params={"owner": owner}, json=body)


def _unchanged(client: TestClient, channel: dict) -> bool:
    current = client.get(f"/v1/channels/{channel['id']}", params={"owner": OWNER})
    return current.status_code == 200 and current.json()["name"] == channel["name"]


@pytest.mark.parametrize("route", ROUTES, ids=[f"{method} {path}" for method, path, _ in ROUTES])
def test_another_owner_of_the_same_app_is_refused(client, channel, provider, route):
    response = _call(client, route, channel["id"], OTHER_OWNER)
    assert response.status_code == 404
    assert _unchanged(client, channel)
    assert provider.calls == []


@pytest.mark.parametrize("route", ROUTES, ids=[f"{method} {path}" for method, path, _ in ROUTES])
def test_another_app_with_the_same_owner_is_refused(client, other_app_client, channel, provider, route):
    response = _call(other_app_client, route, channel["id"], OWNER)
    assert response.status_code == 404
    assert _unchanged(client, channel)
    assert provider.calls == []


def test_another_app_cannot_list_or_notify_the_channel(other_app_client, channel, provider):
    assert other_app_client.get("/v1/channels", params={"owner": OWNER}).json()["items"] == []
    body = {"owner": OWNER, "channel_ids": [channel["id"]], "subject": "x", "body": "y"}
    assert other_app_client.post("/v1/notifications", json=body).status_code == 404
    assert provider.calls == []
