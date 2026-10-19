"""CRUD /v1/channels: scoped by app and owner, bounded input, secrets write-only and encrypted at rest."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import net_safety
from tests.conftest import (
    OTHER_OWNER,
    OWNER,
    PUSHOVER_TOKEN,
    PUSHOVER_USER,
    RECIPIENT,
    RESEND_KEY,
    SMTP_PASSWORD,
    pushover_channel,
    resend_channel,
    smtp_channel,
)

UNKNOWN_ID = "00000000-0000-4000-8000-000000000000"


def _fields_in_error(response) -> dict:
    return {issue["field"]: issue["message"] for issue in response.json()["error"]["fields"]}


def test_a_created_channel_answers_201_with_its_location(client: TestClient):
    response = client.post("/v1/channels", json=resend_channel())
    assert response.status_code == 201
    created = response.json()
    assert response.headers["location"] == f"/v1/channels/{created['id']}"
    assert created["type"] == "resend" and created["owner"] == OWNER and created["name"] == "Mail"


def test_a_response_shows_secrets_only_as_set(client: TestClient):
    response = client.post("/v1/channels", json=resend_channel())
    created = response.json()
    assert created["secrets"] == {"api_key": "set"}
    assert created["fields"] == {"from_email": "jobs@example.com", "recipients": [RECIPIENT]}
    assert RESEND_KEY not in response.text


def test_no_field_value_is_stored_in_plain_text(client: TestClient, database_path: Path):
    client.post("/v1/channels", json=smtp_channel())
    stored = database_path.read_bytes()
    assert SMTP_PASSWORD.encode() not in stored
    assert RECIPIENT.encode() not in stored
    assert b"smtp.example.com" not in stored


def test_a_list_holds_only_the_owners_channels(client: TestClient, create_channel):
    mine = create_channel(pushover_channel())
    create_channel(pushover_channel(owner=OTHER_OWNER))
    response = client.get("/v1/channels", params={"owner": OWNER})
    assert response.status_code == 200
    page = response.json()
    assert [item["id"] for item in page["items"]] == [mine["id"]]
    assert (page["total"], page["limit"], page["offset"]) == (1, 50, 0)


def test_a_list_page_is_capped(client: TestClient):
    response = client.get("/v1/channels", params={"owner": OWNER, "limit": 101})
    assert response.status_code == 422
    assert "limit" in _fields_in_error(response)


def test_another_owner_cannot_read_the_channel(client: TestClient, create_channel):
    created = create_channel(pushover_channel())
    response = client.get(f"/v1/channels/{created['id']}", params={"owner": OTHER_OWNER})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_another_app_cannot_see_the_channel(create_channel, other_app_client: TestClient):
    created = create_channel(pushover_channel())
    assert other_app_client.get(f"/v1/channels/{created['id']}", params={"owner": OWNER}).status_code == 404
    assert other_app_client.get("/v1/channels", params={"owner": OWNER}).json()["items"] == []
    assert other_app_client.delete(f"/v1/channels/{created['id']}", params={"owner": OWNER}).status_code == 404


def test_a_malformed_channel_id_is_a_validation_error(client: TestClient):
    response = client.get("/v1/channels/not-a-uuid", params={"owner": OWNER})
    assert response.status_code == 422


def test_an_unknown_channel_is_not_found(client: TestClient):
    assert client.get(f"/v1/channels/{UNKNOWN_ID}", params={"owner": OWNER}).status_code == 404


def test_the_owner_is_required(client: TestClient):
    response = client.get("/v1/channels")
    assert response.status_code == 422
    assert _fields_in_error(response) == {"owner": "Field required"}


@pytest.mark.parametrize("owner", ["", "a" * 129, "user 1", "user\n1"])
def test_an_owner_outside_the_allowed_form_is_refused(client: TestClient, owner):
    response = client.post("/v1/channels", json=pushover_channel(owner=owner))
    assert response.status_code == 422
    assert "owner" in _fields_in_error(response)


def test_a_missing_required_field_is_reported_per_field(client: TestClient):
    response = client.post("/v1/channels", json=resend_channel(fields={"from_email": "bad", "recipients": []}))
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_ERROR" and body["traceId"]
    assert _fields_in_error(response) == {
        "fields.api_key": "required",
        "fields.from_email": "must be an email address",
        "fields.recipients": "required",
    }


def test_a_validation_error_never_echoes_a_secret(client: TestClient):
    long_secret = "s" * 300
    response = client.post("/v1/channels", json=resend_channel(fields={"api_key": long_secret}))
    assert response.status_code == 422
    assert _fields_in_error(response)["fields.api_key"] == "must be at most 200 characters"
    assert long_secret not in response.text


def test_an_unknown_field_is_refused(client: TestClient):
    fields = {"api_token": PUSHOVER_TOKEN, "user_key": PUSHOVER_USER, "extra": "x"}
    response = client.post("/v1/channels", json=pushover_channel(fields=fields))
    assert response.status_code == 422
    assert _fields_in_error(response) == {"fields": "contains an unknown field"}


def test_an_unknown_type_is_refused(client: TestClient):
    response = client.post("/v1/channels", json=pushover_channel(type="webhook"))
    assert response.status_code == 422
    assert "type" in _fields_in_error(response)


@pytest.mark.parametrize("recipients", [["a@example.com"] * 51, ["a@example.com\r\nBcc: x@example.com"], ["no-at-sign"]])
def test_recipients_are_bounded_and_must_be_addresses(client: TestClient, recipients):
    response = client.post("/v1/channels", json=resend_channel(fields={**resend_channel()["fields"], "recipients": recipients}))
    assert response.status_code == 422
    assert "fields.recipients" in _fields_in_error(response)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "[::1]", "smtp example.com"])
def test_an_smtp_host_that_is_not_public_is_refused(client: TestClient, host):
    response = client.post("/v1/channels", json=smtp_channel(fields={**smtp_channel()["fields"], "host": host}))
    assert response.status_code == 422
    assert _fields_in_error(response)["fields.host"] in {"must resolve to public addresses", "must be a host name or IP address"}


def test_an_smtp_name_resolving_to_a_private_address_is_refused(client: TestClient, monkeypatch):
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: ["192.168.1.10"])
    response = client.post("/v1/channels", json=smtp_channel())
    assert response.status_code == 422
    assert _fields_in_error(response) == {"fields.host": "must resolve to public addresses"}


@pytest.mark.parametrize("port", [0, 65536, "587"])
def test_an_smtp_port_outside_the_range_is_refused(client: TestClient, port):
    response = client.post("/v1/channels", json=smtp_channel(fields={**smtp_channel()["fields"], "port": port}))
    assert response.status_code == 422
    assert "fields.port" in _fields_in_error(response)


def test_an_update_without_a_secret_keeps_it(client: TestClient, create_channel):
    created = create_channel(resend_channel())
    response = client.patch(
        f"/v1/channels/{created['id']}", params={"owner": OWNER}, json={"name": "Neu", "fields": {"recipients": ["b@example.com"]}}
    )
    assert response.status_code == 200
    updated = response.json()
    assert (updated["name"], updated["fields"]["recipients"], updated["secrets"]) == ("Neu", ["b@example.com"], {"api_key": "set"})


def test_an_update_can_clear_an_optional_field(client: TestClient, create_channel):
    created = create_channel(smtp_channel())
    response = client.patch(f"/v1/channels/{created['id']}", params={"owner": OWNER}, json={"fields": {"port": None}})
    assert response.status_code == 200
    assert "port" not in response.json()["fields"]


def test_an_update_cannot_clear_a_required_secret(client: TestClient, create_channel):
    created = create_channel(resend_channel())
    response = client.patch(f"/v1/channels/{created['id']}", params={"owner": OWNER}, json={"fields": {"api_key": None}})
    assert response.status_code == 422
    assert _fields_in_error(response) == {"fields.api_key": "required"}


def test_an_update_cannot_move_a_channel_to_another_owner(client: TestClient, create_channel):
    created = create_channel(resend_channel())
    response = client.patch(f"/v1/channels/{created['id']}", params={"owner": OWNER}, json={"owner": OTHER_OWNER})
    assert response.status_code == 422


def test_a_deleted_channel_is_gone(client: TestClient, create_channel):
    created = create_channel(pushover_channel())
    assert client.delete(f"/v1/channels/{created['id']}", params={"owner": OWNER}).status_code == 204
    assert client.get(f"/v1/channels/{created['id']}", params={"owner": OWNER}).status_code == 404


def test_an_owner_has_a_channel_limit(client: TestClient, create_channel, monkeypatch):
    monkeypatch.setattr("app.channels.MAX_CHANNELS_PER_OWNER", 2)
    create_channel(pushover_channel())
    create_channel(pushover_channel())
    response = client.post("/v1/channels", json=pushover_channel())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CHANNEL_LIMIT_REACHED"


@pytest.mark.parametrize("field", ["username", "password"])
def test_smtp_credentials_must_be_printable_ascii(client: TestClient, field):
    fields = {**smtp_channel()["fields"], field: "p\u00e4sswort"}
    response = client.post("/v1/channels", json=smtp_channel(fields=fields))
    assert response.status_code == 422
    assert _fields_in_error(response) == {f"fields.{field}": "must be printable ASCII characters"}
    assert "p\u00e4sswort" not in response.text


def test_an_smtp_password_may_contain_spaces(client: TestClient):
    fields = {**smtp_channel()["fields"], "password": "correct horse battery"}
    assert client.post("/v1/channels", json=smtp_channel(fields=fields)).status_code == 201
