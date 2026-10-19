"""/notifications: channel types and the signed-in user's channels, proxied to the notification service."""

import pytest
from fastapi import status

from database.core import JobPlatform
from services.notifications_client import (
    CHANNEL_LIMIT_REACHED,
    RATE_LIMITED,
    UNAVAILABLE,
    VALIDATION_ERROR,
    NotifyError,
    owner_for,
)
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_platform

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

OWNER = owner_for(TEST_USER_ID)
OTHER_OWNER = owner_for(OTHER_USER_ID)
PUSHOVER_FIELDS = {"user_key": "PUSH_USER_SECRET", "api_token": "PUSH_TOKEN_SECRET"}
RESEND_BODY = {"type": "resend", "name": "Mail", "fields": {"api_key": "RESEND_SECRET", "from_email": "a@b.de", "recipients": ["me@b.de"]}}
UNKNOWN_ID = "00000000-0000-0000-0000-000000000000"
TEST_RATE_LIMIT = 5


def test_channel_types_come_from_the_service(api_client):
    response = api_client.get("/notifications/channel-types")
    assert response.status_code == status.HTTP_200_OK
    assert [item["id"] for item in response.json()["items"]] == ["pushover", "resend", "mailjet", "smtp"]


def test_the_list_holds_only_the_users_channels_without_owner_or_secrets(api_client, notify):
    own = notify.add(OWNER, "pushover", PUSHOVER_FIELDS, name="Handy")
    notify.add(OTHER_OWNER, "pushover", PUSHOVER_FIELDS)
    response = api_client.get("/notifications/channels")
    body = response.json()
    assert (body["total"], [item["id"] for item in body["items"]]) == (1, [own])
    assert body["items"][0]["secrets"] == {"api_token": "set", "user_key": "set"}
    assert "owner" not in body["items"][0]
    assert "PUSH_TOKEN_SECRET" not in response.text and OWNER not in response.text


def test_create_answers_201_with_location_and_derives_the_owner(api_client, notify):
    response = api_client.post("/notifications/channels", json=RESEND_BODY)
    assert response.status_code == status.HTTP_201_CREATED
    channel_id = response.json()["id"]
    assert response.headers["location"] == f"/notifications/channels/{channel_id}"
    assert notify.channels[channel_id]["owner"] == OWNER
    assert "RESEND_SECRET" not in response.text


@pytest.mark.parametrize("body", [
    {**RESEND_BODY, "owner": "someone-else"},
    {**RESEND_BODY, "type": "fax"},
    {**RESEND_BODY, "name": " "},
    {**RESEND_BODY, "fields": {f"field_{index}": "x" for index in range(21)}},
    {**RESEND_BODY, "fields": {"api_key": "k" * 1001}},
    {**RESEND_BODY, "fields": {"recipients": ["a@b.de"] * 51}},
])
def test_create_bounds_the_request_before_the_service(api_client, notify, body):
    response = api_client.post("/notifications/channels", json=body)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert notify.channels == {}


def test_a_service_field_refusal_keeps_its_field(api_client, notify):
    notify.fail_with(NotifyError(VALIDATION_ERROR, (("fields.host", "must resolve to public addresses"),)))
    response = api_client.post("/notifications/channels", json={**RESEND_BODY, "type": "smtp"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"] == [
        {"type": "value_error", "loc": ["body", "fields", "host"], "msg": "must resolve to public addresses"}
    ]


@pytest.mark.parametrize("error,status_code,detail", [
    (NotifyError(CHANNEL_LIMIT_REACHED), status.HTTP_409_CONFLICT, "channel_limit_reached"),
    (NotifyError(UNAVAILABLE), status.HTTP_502_BAD_GATEWAY, "notification_service_unavailable"),
    (NotifyError(RATE_LIMITED, retry_after="30"), status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests"),
])
def test_service_failures_become_fixed_answers(api_client, notify, error, status_code, detail):
    notify.fail_with(error)
    response = api_client.post("/notifications/channels", json=RESEND_BODY)
    assert (response.status_code, response.json()) == (status_code, {"detail": detail})


def test_a_rate_limit_passes_retry_after_on(api_client, notify):
    notify.fail_with(NotifyError(RATE_LIMITED, retry_after="30"))
    assert api_client.post("/notifications/channels", json=RESEND_BODY).headers["retry-after"] == "30"


def test_patch_passes_nulls_and_keeps_omitted_secrets(api_client, notify):
    channel_id = notify.add(OWNER, "smtp", {"host": "smtp.example.com", "password": "SECRET", "port": 2525})
    response = api_client.patch(f"/notifications/channels/{channel_id}", json={"name": "Neu", "fields": {"port": None}})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Neu"
    assert notify.values(channel_id) == {"host": "smtp.example.com", "password": "SECRET"}


@pytest.mark.parametrize("method,suffix", [("get", ""), ("patch", ""), ("delete", ""), ("post", "/test")])
def test_another_users_channel_is_a_404(api_client, notify, method, suffix):
    foreign = notify.add(OTHER_OWNER, "pushover", PUSHOVER_FIELDS)
    kwargs = {"json": {}} if method == "patch" else {}
    response = getattr(api_client, method)(f"/notifications/channels/{foreign}{suffix}", **kwargs)
    assert (response.status_code, response.json()) == (status.HTTP_404_NOT_FOUND, {"detail": "Channel not found"})
    assert foreign in notify.channels and notify.tested == []


def test_a_channel_id_must_be_a_uuid(api_client):
    assert api_client.get("/notifications/channels/not-a-uuid").status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_delete_also_drops_the_channel_from_the_users_sources(api_client, notify, seed, session_factory):
    channel_id = notify.add(OWNER, "pushover", PUSHOVER_FIELDS)
    other_id = notify.add(OWNER, "resend", {"api_key": "x"})
    seed(make_platform(notification_channels=[{"id": channel_id, "type": "pushover"}, {"id": other_id, "type": "resend"}],
                       is_notification_enabled=True))
    assert api_client.delete(f"/notifications/channels/{channel_id}").status_code == status.HTTP_204_NO_CONTENT
    with session_factory() as db:
        source = db.query(JobPlatform).one()
        assert (source.notification_channels, source.is_notification_enabled) == ([{"id": other_id, "type": "resend"}], True)
    assert channel_id not in notify.channels


def test_deleting_the_last_channel_of_a_source_switches_it_off(api_client, notify, seed, session_factory):
    channel_id = notify.add(OWNER, "pushover", PUSHOVER_FIELDS)
    seed(make_platform(notification_channels=[{"id": channel_id, "type": "pushover"}], is_notification_enabled=True))
    api_client.delete(f"/notifications/channels/{channel_id}")
    with session_factory() as db:
        assert db.query(JobPlatform).one().is_notification_enabled is False


def test_a_test_send_answers_the_services_result(api_client, notify):
    channel_id = notify.add(OWNER, "pushover", PUSHOVER_FIELDS)
    response = api_client.post(f"/notifications/channels/{channel_id}/test")
    assert response.json() == {"channel_id": channel_id, "delivered": True, "reason": None}
    assert notify.tested == [channel_id]


def test_test_sends_are_limited_per_user(api_client, notify):
    channel_id = notify.add(OWNER, "pushover", PUSHOVER_FIELDS)
    answers = [api_client.post(f"/notifications/channels/{channel_id}/test").status_code for _ in range(TEST_RATE_LIMIT + 1)]
    assert answers[TEST_RATE_LIMIT] == status.HTTP_429_TOO_MANY_REQUESTS
    assert len(notify.tested) == TEST_RATE_LIMIT


def test_an_unknown_channel_is_a_404(api_client):
    assert api_client.get(f"/notifications/channels/{UNKNOWN_ID}").status_code == status.HTTP_404_NOT_FOUND
