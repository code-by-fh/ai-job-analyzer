"""A source's channel selection references service channels; account resets delete the channels."""

from fastapi import status

from core.auth import get_password_hash
from database.core import JobPlatform, User
from services.notifications_client import UNAVAILABLE, NotifyError, owner_for
from tests.factories import OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, make_platform, make_profile, make_user

OWNER = owner_for(TEST_USER_ID)
PUSH = {"user_key": "u", "api_token": "t"}
PATH = f"/platforms/{TEST_PLATFORM_ID}"
PASSWORD = "correct-horse-battery"


def _stored_selection(session_factory):
    with session_factory() as db:
        source = db.query(JobPlatform).one()
        return source.notification_channels, source.is_notification_enabled


def test_channel_ids_select_the_users_channels_in_order(api_client, seed, notify, session_factory):
    seed(make_platform())
    push = notify.add(OWNER, "pushover", PUSH)
    mail = notify.add(OWNER, "smtp", {"host": "smtp.example.com"})
    response = api_client.patch(PATH, json={"notification_channel_ids": [mail, push, mail]})
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert (body["notification_channel_ids"], body["notification_adapters"], body["is_notification_enabled"]) == (
        [mail, push], ["SMTP", "PUSHOVER"], True)
    assert _stored_selection(session_factory) == ([{"id": mail, "type": "smtp"}, {"id": push, "type": "pushover"}], True)


def test_another_users_channel_cannot_be_selected(api_client, seed, notify, session_factory):
    seed(make_platform())
    foreign = notify.add(owner_for(OTHER_USER_ID), "pushover", PUSH)
    response = api_client.patch(PATH, json={"notification_channel_ids": [foreign]})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", "notification_channel_ids", 0]
    assert _stored_selection(session_factory)[0] is None


def test_an_empty_selection_switches_notifications_off(api_client, seed, notify, session_factory):
    push = notify.add(OWNER, "pushover", PUSH)
    seed(make_platform(notification_channels=[{"id": push, "type": "pushover"}], is_notification_enabled=True))
    api_client.patch(PATH, json={"notification_channel_ids": []})
    assert _stored_selection(session_factory) == ([], False)


def test_too_many_or_malformed_ids_are_refused(api_client, seed, notify):
    seed(make_platform())
    too_many = ["00000000-0000-0000-0000-%012d" % index for index in range(21)]
    assert api_client.patch(PATH, json={"notification_channel_ids": too_many}).status_code == 422
    assert api_client.patch(PATH, json={"notification_channel_ids": ["no-uuid"]}).status_code == 422


def test_the_old_switch_list_no_longer_selects_channels(api_client, seed, notify, session_factory):
    seed(make_platform())
    notify.add(OWNER, "pushover", PUSH)
    response = api_client.patch(PATH, json={"notification_adapters": ["PUSHOVER"]})
    assert response.json()["notification_channel_ids"] == []
    assert _stored_selection(session_factory) == (None, False)


def test_a_save_without_selection_never_calls_the_service(api_client, seed, notify):
    seed(make_platform())
    notify.fail_with(NotifyError(UNAVAILABLE))
    assert api_client.patch(PATH, json={"name": "Neu"}).status_code == status.HTTP_200_OK


def test_a_selection_while_the_service_is_down_is_a_502(api_client, seed, notify, session_factory):
    seed(make_platform())
    notify.fail_with(NotifyError(UNAVAILABLE))
    response = api_client.patch(PATH, json={"notification_channel_ids": []})
    assert (response.status_code, response.json()) == (502, {"detail": "notification_service_unavailable"})
    assert _stored_selection(session_factory)[0] is None


def _with_password(session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(PASSWORD)
        db.commit()


def test_the_factory_reset_deletes_the_users_channels(api_client, notify, session_factory, monkeypatch, fresh_rate_limits):
    monkeypatch.setattr("routers.auth.SessionLocal", session_factory)
    _with_password(session_factory)
    notify.add(OWNER, "pushover", PUSH)
    other = notify.add(owner_for(OTHER_USER_ID), "pushover", PUSH)
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == status.HTTP_200_OK
    assert list(notify.channels) == [other]


def test_a_reset_while_the_service_is_down_deletes_nothing(api_client, seed, notify, session_factory, monkeypatch, fresh_rate_limits):
    monkeypatch.setattr("routers.auth.SessionLocal", session_factory)
    _with_password(session_factory)
    seed(make_platform())
    notify.fail_with(NotifyError(UNAVAILABLE))
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert (response.status_code, response.json()) == (502, {"detail": "notification_service_unavailable"})
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 1


def test_an_admin_delete_while_the_service_is_down_is_a_502_and_deletes_nothing(api_client, seed, notify, session_factory, monkeypatch):
    from core.auth import get_current_admin_user
    from main import app

    monkeypatch.setattr("routers.auth.SessionLocal", session_factory)
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID))
    notify.fail_with(NotifyError(UNAVAILABLE))
    app.dependency_overrides[get_current_admin_user] = lambda: make_user()
    try:
        response = api_client.delete(f"/users/{OTHER_USER_ID}")
    finally:
        app.dependency_overrides.pop(get_current_admin_user, None)
    assert (response.status_code, response.json()) == (502, {"detail": "notification_service_unavailable"})
    with session_factory() as db:
        assert db.get(User, OTHER_USER_ID) is not None and db.query(JobPlatform).count() == 1



SETUP = {
    "url": "https://indeed.com/jobs",
    "selected_urls": ["https://indeed.com/jobs/view/1"],
    "name": "Indeed",
    "initial_run": "none",
}


def test_setup_stores_the_chosen_channels(api_client, seed, notify, session_factory):
    seed(make_profile())
    push = notify.add(OWNER, "pushover", PUSH)
    response = api_client.post("/platforms/setup", json={**SETUP, "notification_channel_ids": [push]})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["notification_channel_ids"] == [push]
    assert _stored_selection(session_factory) == ([{"id": push, "type": "pushover"}], True)


def test_setup_refuses_another_users_channel_and_creates_nothing(api_client, seed, notify, session_factory):
    seed(make_profile())
    foreign = notify.add(owner_for(OTHER_USER_ID), "pushover", PUSH)
    response = api_client.post("/platforms/setup", json={**SETUP, "notification_channel_ids": [foreign]})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["detail"][0]["loc"] == ["body", "notification_channel_ids", 0]
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_setup_without_channels_never_calls_the_service(api_client, seed, notify):
    seed(make_profile())
    notify.fail_with(NotifyError(UNAVAILABLE))
    assert api_client.post("/platforms/setup", json=SETUP).status_code == status.HTTP_200_OK


def test_setup_with_channels_while_the_service_is_down_is_a_502_and_creates_nothing(
    api_client, seed, notify, session_factory
):
    seed(make_profile())
    notify.fail_with(NotifyError(UNAVAILABLE))
    response = api_client.post(
        "/platforms/setup", json={**SETUP, "notification_channel_ids": ["00000000-0000-0000-0000-000000000001"]}
    )
    assert response.status_code == 502
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0
