"""Notification contract: bounded fields, rate-limited tests, bounded templates, a preview that sends nothing."""

import pytest
from fastapi import status

from core.auth import create_access_token, token_claims
from database.core import JobPlatform, UserProfile
from tests.factories import OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, make_platform, make_profile, make_user

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

STORED = {
    "pushover_user_key": "push-user", "pushover_api_token": "PUSH_SECRET",
    "resend_api_key": "RESEND_SECRET", "resend_from_email": "jobs@example.com",
    "mailjet_api_key": "MJ_KEY", "mailjet_secret_key": "MJ_SECRET", "mailjet_from_email": "mj@example.com",
    "smtp_host": "smtp.example.com", "smtp_user": "smtp-user", "smtp_password": "SMTP_SECRET",
    "google_drive_refresh_token": "DRIVE_SECRET", "active_storage_service": "GOOGLE_DRIVE",
}
TEST_RATE_LIMIT = 5
PREVIEW_RATE_LIMIT = 30
LONG_ADDRESS = "a" * 250 + "@example.com"
LONG_RECIPIENT = "r" * 288 + "@example.com"
HOSTILE = "<script>alert(1)</script>"
LONG_CREDENTIAL = "k" * 501
LONG_HOST = "h" * 254
TOO_MANY_RECIPIENTS = [f"r{index}@example.com" for index in range(51)]


@pytest.fixture()
def stored(seed):
    seed(make_profile(**STORED))


def _stored_profile(session_factory) -> UserProfile:
    # The profile's primary key is its own id, not the user id, so it is looked up by owner.
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()


def test_saving_one_channel_keeps_every_other_credential(api_client, stored, session_factory):
    response = api_client.post("/notification-settings", json={"smtp_host": "mail.example.org"})
    assert response.status_code == status.HTTP_200_OK
    profile = _stored_profile(session_factory)
    assert profile.smtp_host == "mail.example.org"
    assert {field: getattr(profile, field) for field in STORED if field != "smtp_host"} == {
        field: value for field, value in STORED.items() if field != "smtp_host"
    }


@pytest.mark.parametrize("body,field", [
    ({"resend_from_email": "a@b"}, "resend_from_email"),
    ({"smtp_from_email": LONG_ADDRESS}, "smtp_from_email"),
    ({"email_global_recipient": HOSTILE}, "email_global_recipient"),
    ({"smtp_port": 0}, "smtp_port"),
    ({"smtp_port": 70000}, "smtp_port"),
    ({"resend_api_key": LONG_CREDENTIAL}, "resend_api_key"),
    ({"smtp_host": LONG_HOST}, "smtp_host"),
    ({"resend_api_key": ""}, "resend_api_key"),
    ({"smtp_host": ""}, "smtp_host"),
])
def test_notification_fields_are_bounded_without_echo(api_client, stored, body, field):
    response = api_client.post("/notification-settings", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert f'"{body[field]}"' not in response.text


@pytest.mark.parametrize("body,field", [
    ({"resend_from_email": "a@b"}, "resend_from_email"),
    ({"mailjet_secret_key": LONG_CREDENTIAL}, "mailjet_secret_key"),
])
def test_profile_save_enforces_the_same_credential_bounds(api_client, stored, body, field):
    response = api_client.post("/settings", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert LONG_CREDENTIAL not in response.text


def test_a_cleared_channel_field_is_stored_as_null(api_client, stored, session_factory):
    response = api_client.post("/notification-settings", json={"pushover_user_key": None, "pushover_api_token": None})
    assert response.status_code == status.HTTP_200_OK
    profile = _stored_profile(session_factory)
    assert profile.pushover_user_key is None and profile.pushover_api_token is None
    assert profile.resend_api_key == "RESEND_SECRET"


def test_channel_tests_are_rate_limited(api_client, stored, monkeypatch):
    monkeypatch.setattr("routers.settings._send_via_pushover", lambda *args, **kwargs: True)
    answers = [api_client.post("/notification-settings/test-pushover").status_code for _ in range(TEST_RATE_LIMIT + 1)]
    assert answers[:TEST_RATE_LIMIT] == [status.HTTP_200_OK] * TEST_RATE_LIMIT
    assert answers[TEST_RATE_LIMIT] == status.HTTP_429_TOO_MANY_REQUESTS


def _no_send(*_args, **_kwargs):
    raise AssertionError("a refused or previewed request must not send")


@pytest.fixture()
def no_network(monkeypatch):
    """Every provider transport (HTTP for Pushover, Resend, Mailjet; SMTP) fails the test if it is reached."""
    monkeypatch.setattr("requests.post", _no_send)
    monkeypatch.setattr("smtplib.SMTP", _no_send)


def _sign_in(client, user_id: int) -> None:
    client.cookies.set("access_token", create_access_token(token_claims(make_user(user_id))))


def test_channel_test_limits_count_per_signed_in_user(api_client, stored, monkeypatch):
    monkeypatch.setattr("routers.settings._send_via_pushover", lambda *args, **kwargs: True)
    _sign_in(api_client, TEST_USER_ID)
    answers = [api_client.post("/notification-settings/test-pushover").status_code for _ in range(TEST_RATE_LIMIT + 1)]
    _sign_in(api_client, OTHER_USER_ID)
    other_answer = api_client.post("/notification-settings/test-pushover").status_code
    assert answers[TEST_RATE_LIMIT] == status.HTTP_429_TOO_MANY_REQUESTS
    assert other_answer == status.HTTP_200_OK


def test_test_email_answers_without_the_recipient(api_client, seed, monkeypatch):
    seed(make_profile(**STORED, email_global_recipient="me@example.com"))
    monkeypatch.setattr("routers.settings._send_via_resend_batch", lambda *args, **kwargs: True)
    response = api_client.post("/notification-settings/test-email")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"success": True}


def test_test_recipient_is_bounded_without_echo(api_client, stored, no_network):
    response = api_client.post("/notification-settings/test-resend", json={"recipient": LONG_RECIPIENT})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"][:2] == ["body", "recipient"]
    assert LONG_RECIPIENT not in response.text


def test_test_recipient_must_look_like_an_address(api_client, stored, no_network):
    response = api_client.post("/notification-settings/test-resend", json={"recipient": HOSTILE})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert HOSTILE not in response.text


def test_an_empty_test_recipient_falls_back_to_the_stored_one(api_client, seed, monkeypatch):
    seed(make_profile(**STORED, email_global_recipient="me@example.com"))
    sent_to = []
    monkeypatch.setattr(
        "routers.settings._send_via_resend_batch",
        lambda jobs, profile, platform, userName: sent_to.extend(platform.resend_recipients) or True,
    )
    response = api_client.post("/notification-settings/test-resend", json={"recipient": ""})
    assert response.status_code == status.HTTP_200_OK
    assert sent_to == ["me@example.com"]


@pytest.mark.parametrize("body,field", [
    ({"name": "   ", "type": "PUSHOVER", "content": "x"}, "name"),
    ({"name": "n" * 101, "type": "PUSHOVER", "content": "x"}, "name"),
    ({"name": "Kurz", "type": "PUSHOVER", "content": ""}, "content"),
    ({"name": "Kurz", "type": "PUSHOVER", "content": "c" * 100_001}, "content"),
])
def test_template_name_and_content_are_bounded(api_client, body, field):
    response = api_client.post("/notification-templates", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", field]


@pytest.mark.parametrize("body,field", [
    ({"name": "   "}, "name"),
    ({"content": ""}, "content"),
    ({"content": "c" * 100_001}, "content"),
])
def test_template_update_is_bounded(api_client, body, field):
    created = api_client.post("/notification-templates", json={"name": "Kurz", "type": "PUSHOVER", "content": "x"})
    response = api_client.put(f"/notification-templates/{created.json()['id']}", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", field]


def test_template_name_is_trimmed(api_client):
    response = api_client.post("/notification-templates", json={"name": "  Kurz  ", "type": "PUSHOVER", "content": "x"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Kurz"


@pytest.mark.parametrize("body,field", [
    ({"resend_recipients": ["a@b"]}, "resend_recipients"),
    ({"smtp_recipients": [HOSTILE]}, "smtp_recipients"),
    ({"mailjet_recipients": TOO_MANY_RECIPIENTS}, "mailjet_recipients"),
    ({"resend_template": "c" * 100_001}, "resend_template"),
    ({"pushover_template": "c" * 100_001}, "pushover_template"),
])
def test_source_notification_copies_are_bounded(api_client, seed, body, field):
    seed(make_platform())
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"][:2] == ["body", field]
    assert HOSTILE not in response.text


LEGACY_RECIPIENTS = ["not-an-address", "team"]
LEGACY_TEMPLATE = "c" * 100_001


@pytest.mark.parametrize("field,legacy", [
    ("resend_recipients", LEGACY_RECIPIENTS), ("smtp_recipients", TOO_MANY_RECIPIENTS), ("mailjet_template", LEGACY_TEMPLATE),
])
def test_a_legacy_stored_copy_sent_back_unchanged_is_accepted(api_client, seed, session_factory, field, legacy):
    seed(make_platform(**{field: legacy}))
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={field: legacy, "name": "Neu"})
    assert response.status_code == status.HTTP_200_OK
    with session_factory() as db:
        assert getattr(db.get(JobPlatform, TEST_PLATFORM_ID), field) == legacy


def test_a_changed_copy_is_validated_even_when_the_stored_one_is_legacy(api_client, seed):
    seed(make_platform(resend_recipients=LEGACY_RECIPIENTS))
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"resend_recipients": [*LEGACY_RECIPIENTS, HOSTILE]})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"][:2] == ["body", "resend_recipients"]
    assert HOSTILE not in response.text


def test_source_notification_copies_within_bounds_are_saved(api_client, seed):
    seed(make_platform())
    body = {"resend_recipients": [" me@example.com "], "resend_template": "", "pushover_template": "$title"}
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json=body)
    assert response.status_code == status.HTTP_200_OK
    assert (response.json()["resend_recipients"], response.json()["resend_template"]) == (["me@example.com"], None)


def test_email_preview_renders_the_job_loop_and_sends_nothing(api_client, no_network):
    content = "<p>Hi $userName</p>{{#jobs}}<b>$title</b>{{/jobs}}"
    response = api_client.post("/notification-templates/preview", json={"type": "RESEND", "content": content})
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["html"] is True
    assert "<b>Senior Software Engineer</b>" in body["body"] and "{{#jobs}}" not in body["body"]


def test_push_preview_is_text_with_the_variables_filled(api_client, no_network):
    response = api_client.post("/notification-templates/preview", json={"type": "PUSHOVER", "content": "$company: $match_score"})
    assert response.json() == {"html": False, "body": "Acme Corp: 87"}


def test_preview_accepts_a_lowercase_type_like_create(api_client, no_network):
    response = api_client.post("/notification-templates/preview", json={"type": "mailjet", "content": ""})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["html"] is True


def test_preview_refuses_an_unknown_type(api_client):
    response = api_client.post("/notification-templates/preview", json={"type": "FAX", "content": "x"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", "type"]


def test_preview_is_rate_limited(api_client):
    body = {"type": "PUSHOVER", "content": "x"}
    answers = [api_client.post("/notification-templates/preview", json=body).status_code for _ in range(PREVIEW_RATE_LIMIT + 1)]
    assert answers[:PREVIEW_RATE_LIMIT] == [status.HTTP_200_OK] * PREVIEW_RATE_LIMIT
    assert answers[PREVIEW_RATE_LIMIT] == status.HTTP_429_TOO_MANY_REQUESTS
