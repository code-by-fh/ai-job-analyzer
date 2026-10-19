"""Notification contract: bounded templates and source copies, a preview that sends nothing."""

import pytest
from fastapi import status

from database.core import JobPlatform, UserProfile
from services.notifications_client import VALIDATION_ERROR, NotifyError, owner_for
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, make_platform, make_profile

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

STORED = {
    "pushover_user_key": "push-user", "pushover_api_token": "PUSH_SECRET",
    "resend_api_key": "RESEND_SECRET", "resend_from_email": "jobs@example.com",
    "mailjet_api_key": "MJ_KEY", "mailjet_secret_key": "MJ_SECRET", "mailjet_from_email": "mj@example.com",
    "smtp_host": "smtp.example.com", "smtp_user": "smtp-user", "smtp_password": "SMTP_SECRET",
}
OWNER = owner_for(TEST_USER_ID)
PREVIEW_RATE_LIMIT = 30
HOSTILE = "<script>alert(1)</script>"
TOO_MANY_RECIPIENTS = [f"r{index}@example.com" for index in range(51)]


@pytest.fixture()
def stored(seed):
    seed(make_profile(**STORED))


def _stored_profile(session_factory) -> UserProfile:
    # The profile's primary key is its own id, not the user id, so it is looked up by owner.
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()


def test_a_profile_save_ignores_notification_credentials(api_client, stored, session_factory):
    response = api_client.post("/settings", json={"resend_api_key": "NEW_SECRET", "role": "Lead"})
    assert response.status_code == status.HTTP_200_OK
    assert _stored_profile(session_factory).resend_api_key == "RESEND_SECRET"


def _no_send(*_args, **_kwargs):
    raise AssertionError("a refused or previewed request must not send")


@pytest.fixture()
def no_network(monkeypatch):
    """Every provider transport (HTTP for Pushover, Resend, Mailjet; SMTP) fails the test if it is reached."""
    monkeypatch.setattr("requests.post", _no_send)
    monkeypatch.setattr("smtplib.SMTP", _no_send)


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


def test_email_preview_is_rendered_by_the_service_and_sends_nothing(api_client, no_network, notify):
    content = "<p>Hi $userName</p>{{#jobs}}<b>$title</b>{{/jobs}}"
    response = api_client.post("/notification-templates/preview", json={"type": "RESEND", "content": content})
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"html": True, "body": f"<p>{content}</p>"}
    template = notify.previews[0]
    assert (template["html"], template["variables"]["jobs"][0]["title"]) == (content, "Senior Software Engineer")
    assert "push_text" not in template and notify.sent == []


def test_push_preview_is_the_services_push_text(api_client, no_network, notify):
    response = api_client.post("/notification-templates/preview", json={"type": "PUSHOVER", "content": "$company: $match_score"})
    assert response.json() == {"html": False, "body": "$company: $match_score"}
    assert notify.previews[0]["push_text"] == "$company: $match_score"


def test_a_preview_the_service_refuses_is_a_422_on_the_content(api_client, notify):
    notify.fail_with(NotifyError(VALIDATION_ERROR, (("template.push_text", "String should have at most 2000 characters"),)))
    response = api_client.post("/notification-templates/preview", json={"type": "PUSHOVER", "content": "x" * 2001})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", "content"]


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
