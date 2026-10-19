"""GET /v1/channel-types describes every supported type and its field schema."""

from fastapi.testclient import TestClient


def _types(client: TestClient) -> dict:
    response = client.get("/v1/channel-types")
    assert response.status_code == 200
    return {item["id"]: item for item in response.json()["items"]}


def _field(channel_type: dict, name: str) -> dict:
    return next(field for field in channel_type["fields"] if field["name"] == name)


def test_the_four_supported_types_are_listed(client: TestClient):
    assert set(_types(client)) == {"pushover", "resend", "mailjet", "smtp"}


def test_a_type_carries_german_and_english_labels(client: TestClient):
    smtp = _types(client)["smtp"]
    assert smtp["label"] == {"de": "E-Mail (SMTP)", "en": "Email (SMTP)"}


def test_a_secret_field_is_flagged_as_secret(client: TestClient):
    password = _field(_types(client)["smtp"], "password")
    assert password == {
        "name": "password",
        "label": {"de": "Passwort", "en": "Password"},
        "kind": "ascii_text",
        "required": True,
        "secret": True,
        "max_length": 256,
        "max_items": None,
        "default": None,
    }


def test_the_recipient_list_declares_its_bounds(client: TestClient):
    recipients = _field(_types(client)["resend"], "recipients")
    assert (recipients["kind"], recipients["secret"], recipients["max_items"]) == ("email_list", False, 50)


def test_the_smtp_port_is_optional_with_a_default(client: TestClient):
    port = _field(_types(client)["smtp"], "port")
    assert (port["kind"], port["required"], port["default"]) == ("port", False, 587)


def test_every_pushover_field_is_secret(client: TestClient):
    assert all(field["secret"] for field in _types(client)["pushover"]["fields"])
