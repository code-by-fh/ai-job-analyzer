"""services/notification_migration.py: old per-user credentials become service channels, once."""

from unittest.mock import patch

from database.core import JobPlatform, UserProfile
from services.notification_migration import STARTUP_ATTEMPTS, migrate_all, run_at_startup
from services.notifications_client import UNAVAILABLE, VALIDATION_ERROR, NotifyError, owner_for
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_platform, make_profile, make_user

OWNER = owner_for(TEST_USER_ID)
OLD_CREDENTIALS = {
    "pushover_user_key": "push-user", "pushover_api_token": "PUSH_SECRET",
    "resend_api_key": "RESEND_SECRET", "resend_from_email": "jobs@example.com",
    "smtp_host": "smtp.example.com", "smtp_port": 2525, "smtp_user": "login@example.com", "smtp_password": "SMTP_SECRET",
}


def _profile(session_factory, user_id=TEST_USER_ID) -> UserProfile:
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == user_id).one()


def _types(notify, owner=OWNER):
    return [channel["type"] for channel in notify.list_channels(owner)]


def test_complete_old_credentials_become_channels(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS, email_global_recipient="me@example.com", mailjet_api_key="only-a-key"))
    assert migrate_all(session_factory, notify) == 1
    channels = {channel["type"]: channel for channel in notify.list_channels(OWNER)}
    assert list(channels) == ["pushover", "resend", "smtp"]
    assert notify.values(channels["pushover"]["id"]) == {"user_key": "push-user", "api_token": "PUSH_SECRET"}
    assert notify.values(channels["smtp"]["id"]) == {
        "host": "smtp.example.com", "port": 2525, "username": "login@example.com", "password": "SMTP_SECRET",
        "from_email": "login@example.com", "recipients": ["me@example.com"],
    }
    assert _profile(session_factory).notification_channels_migrated is True


def test_without_a_default_recipient_the_sender_receives_its_own_mail(seed, session_factory, notify):
    seed(make_user(), make_profile(resend_api_key="RESEND_SECRET", resend_from_email="jobs@example.com"))
    migrate_all(session_factory, notify)
    assert notify.values(notify.list_channels(OWNER)[0]["id"])["recipients"] == ["jobs@example.com"]


def test_sources_get_the_channels_of_their_old_switches(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS),
         make_platform(notification_adapters=["SMTP", "PUSHOVER", "MAILJET", "PUSHOVER"]))
    migrate_all(session_factory, notify)
    ids = {channel["type"]: channel["id"] for channel in notify.list_channels(OWNER)}
    with session_factory() as db:
        assert db.query(JobPlatform).one().notification_channels == [
            {"id": ids["smtp"], "type": "smtp"}, {"id": ids["pushover"], "type": "pushover"},
        ]


def test_a_second_run_changes_nothing(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS), make_platform(notification_adapters=["PUSHOVER"]))
    migrate_all(session_factory, notify)
    notify.delete_channel(OWNER, notify.list_channels(OWNER)[0]["id"])
    assert migrate_all(session_factory, notify) == 0
    assert _types(notify) == ["resend", "smtp"]


def test_a_stopped_run_resumes_without_duplicates(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS))
    existing = notify.add(OWNER, "pushover", {"user_key": "kept", "api_token": "kept"})
    migrate_all(session_factory, notify)
    assert _types(notify) == ["pushover", "resend", "smtp"]
    assert notify.values(existing)["user_key"] == "kept"


def test_an_unreachable_service_leaves_the_profile_for_the_next_start(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS))
    notify.fail_with(NotifyError(UNAVAILABLE))
    run_at_startup(session_factory, sleep=lambda _seconds: None)
    assert _profile(session_factory).notification_channels_migrated is False


def test_start_up_retries_while_the_service_is_starting(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS))
    notify.fail_with(NotifyError(UNAVAILABLE))
    waits = []

    def _service_comes_up(seconds):
        waits.append(seconds)
        notify.fail_with(None)

    run_at_startup(session_factory, sleep=_service_comes_up)
    assert len(waits) == 1 < STARTUP_ATTEMPTS
    assert _profile(session_factory).notification_channels_migrated is True


def test_a_refused_channel_is_skipped_and_logged_without_values(seed, session_factory, notify, monkeypatch):
    seed(make_user(), make_profile(smtp_host="intranet.example.com", smtp_user="login@example.com", smtp_password="SMTP_SECRET"))
    notify.fail_with(NotifyError(VALIDATION_ERROR, (("fields.host", "must resolve to public addresses"),)))
    monkeypatch.setattr(notify, "list_channels", lambda owner: [])
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("services.notification_migration.logger") as logger:
        migrate_all(session_factory, notify)
    logger.warning.assert_called_once_with("Old %s channel not migrated: the service refused %s", "smtp", ["fields.host"])
    assert "SMTP_SECRET" not in str(logger.mock_calls) and "intranet" not in str(logger.mock_calls)
    assert _profile(session_factory).notification_channels_migrated is True


def test_each_user_gets_its_own_owner(seed, session_factory, notify):
    seed(make_user(), make_user(OTHER_USER_ID), make_profile(**OLD_CREDENTIALS),
         make_profile(id=2, user_id=OTHER_USER_ID, pushover_user_key="other", pushover_api_token="OTHER"))
    assert migrate_all(session_factory, notify) == 2
    assert _types(notify, owner_for(OTHER_USER_ID)) == ["pushover"]
    assert _types(notify) == ["pushover", "resend", "smtp"]


def test_the_old_columns_are_only_read(seed, session_factory, notify):
    seed(make_user(), make_profile(**OLD_CREDENTIALS))
    migrate_all(session_factory, notify)
    profile = _profile(session_factory)
    assert {name: getattr(profile, name) for name in OLD_CREDENTIALS} == OLD_CREDENTIALS
