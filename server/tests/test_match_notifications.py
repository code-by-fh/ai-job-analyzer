"""services/match_notifications.py: match pushes at once, e-mail digests per type at the crawl's end."""

from datetime import datetime, timezone
from unittest.mock import patch

from database.core import JobEntry
from services.match_notifications import (
    PENDING_DIGEST_KEY,
    flush_digest,
    job_item,
    notify_match,
    send_follow_up_reminder,
)
from services.notifications_client import UNAVAILABLE, NotifyError, owner_for
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_job, make_platform, make_profile, make_user
from workers.tasks.scheduling import check_follow_ups

OWNER = owner_for(TEST_USER_ID)
CRAWL_ID = "crawl-1"
PUSH = {"user_key": "u", "api_token": "t"}
MAIL = {"api_key": "k", "from_email": "a@b.de", "recipients": ["own@b.de"]}


class FakeRedis:
    def __init__(self):
        self.lists = {}

    def rpush(self, key, value):
        self.lists.setdefault(key, []).append(value)

    def expire(self, key, seconds):
        pass

    def lrange(self, key, start, end):
        return [value.encode() for value in self.lists.get(key, [])]

    def delete(self, key):
        self.lists.pop(key, None)


def _source(notify, *types, **overrides):
    entries = [{"id": notify.add(OWNER, channel_type, PUSH if channel_type == "pushover" else MAIL), "type": channel_type}
               for channel_type in types]
    return make_platform(notification_channels=entries, is_notification_enabled=True, **overrides), entries


def test_a_match_is_pushed_at_once_with_the_push_template(db_session, notify):
    platform, entries = _source(notify, "pushover", pushover_template="$title!")
    db_session.add(make_user())
    db_session.commit()
    job = make_job(platform_id=TEST_PLATFORM_ID)
    assert notify_match(db_session, FakeRedis(), job, platform, CRAWL_ID) is True
    sent = notify.sent[0]
    assert sent["channel_ids"] == [entries[0]["id"]]
    assert sent["template"]["push_text"] == "$title!" and "html" not in sent["template"]
    assert sent["template"]["variables"]["user_name"] == make_user().username


def test_an_email_match_in_a_crawl_is_queued_not_sent(db_session, notify):
    platform, _ = _source(notify, "resend")
    redis_client = FakeRedis()
    job = make_job(platform_id=TEST_PLATFORM_ID)
    assert notify_match(db_session, redis_client, job, platform, CRAWL_ID) is True
    assert notify.sent == []
    assert redis_client.lists[PENDING_DIGEST_KEY.format(crawl_job_id=CRAWL_ID)] == [job.id]


def test_an_email_match_outside_a_crawl_is_sent_at_once(db_session, notify):
    platform, entries = _source(notify, "smtp", smtp_template="<i>$title</i>", smtp_recipients=["src@b.de"])
    assert notify_match(db_session, FakeRedis(), make_job(platform_id=TEST_PLATFORM_ID), platform, None) is True
    sent = notify.sent[0]
    assert (sent["channel_ids"], sent["recipients"], sent["template"]["html"]) == ([entries[0]["id"]], ["src@b.de"], "<i>$title</i>")


def test_a_source_without_live_channels_notifies_nothing(db_session, notify):
    platform, entries = _source(notify, "pushover")
    notify.delete_channel(OWNER, entries[0]["id"])
    assert notify_match(db_session, FakeRedis(), make_job(platform_id=TEST_PLATFORM_ID), platform, None) is False
    assert notify.sent == []


def test_the_crawl_digest_goes_once_per_email_type_with_its_template(db_session, notify):
    platform, entries = _source(notify, "resend", "mailjet", resend_template="<b>R</b>", mailjet_recipients=[])
    jobs = [make_job(id=f"job-{index}", platform_id=TEST_PLATFORM_ID) for index in range(3)]
    db_session.add_all([make_user(), platform, *jobs])
    db_session.commit()
    redis_client = FakeRedis()
    redis_client.lists[PENDING_DIGEST_KEY.format(crawl_job_id=CRAWL_ID)] = [job.id for job in jobs]
    flush_digest(CRAWL_ID, TEST_USER_ID, db_session, redis_client)
    assert [(sent["channel_ids"], sent["template"]["html"]) for sent in notify.sent] == [
        ([entries[0]["id"]], "<b>R</b>"), ([entries[1]["id"]], None),
    ]
    assert all("recipients" not in sent for sent in notify.sent)
    assert len(notify.sent[0]["template"]["variables"]["jobs"]) == 3
    assert redis_client.lists == {}


def test_a_large_digest_is_sent_in_chunks_the_service_accepts(db_session, notify):
    platform, _ = _source(notify, "resend")
    jobs = [make_job(id=f"job-{index}", platform_id=TEST_PLATFORM_ID) for index in range(150)]
    db_session.add_all([make_user(), platform, *jobs])
    db_session.commit()
    redis_client = FakeRedis()
    redis_client.lists[PENDING_DIGEST_KEY.format(crawl_job_id=CRAWL_ID)] = [job.id for job in jobs]
    flush_digest(CRAWL_ID, TEST_USER_ID, db_session, redis_client)
    assert [len(sent["template"]["variables"]["jobs"]) for sent in notify.sent] == [100, 50]


def test_a_failed_digest_is_logged_and_never_raised(db_session, notify):
    platform, _ = _source(notify, "resend")
    job = make_job(platform_id=TEST_PLATFORM_ID)
    db_session.add_all([make_user(), platform, job])
    db_session.commit()
    redis_client = FakeRedis()
    redis_client.lists[PENDING_DIGEST_KEY.format(crawl_job_id=CRAWL_ID)] = [job.id]
    notify.fail_with(NotifyError(UNAVAILABLE))
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("services.match_notifications.logger") as logger:
        flush_digest(CRAWL_ID, TEST_USER_ID, db_session, redis_client)
    logger.error.assert_called_once_with("Match digest not sent (%s)", UNAVAILABLE)


def test_job_text_is_cut_to_the_services_bounds():
    job = make_job(title="t" * 400, reasoning="r" * 6000, url="https://x.example/" + "p" * 3000, match_score=130.0)
    item = job_item(job)
    assert (len(item["title"]), len(item["reasoning"]), item["url"], item["match_score"]) == (300, 5000, "", 100)


def test_a_too_long_push_template_falls_back_to_the_built_in_text(db_session, notify):
    platform, _ = _source(notify, "pushover", pushover_template="x" * 2001)
    notify_match(db_session, FakeRedis(), make_job(platform_id=TEST_PLATFORM_ID), platform, None)
    assert notify.sent[0]["template"]["push_text"] is None


def test_a_multi_line_source_name_becomes_one_line(db_session, notify):
    platform, _ = _source(notify, "pushover", name="Board\r\nBcc: x@y.de")
    notify_match(db_session, FakeRedis(), make_job(platform_id=TEST_PLATFORM_ID), platform, None)
    assert notify.sent[0]["template"]["variables"]["platform_name"] == "Board Bcc: x@y.de"


def test_a_follow_up_reminder_goes_as_plain_text_to_the_pushover_channels(notify):
    push = notify.add(OWNER, "pushover", PUSH)
    notify.add(OWNER, "resend", MAIL)
    assert send_follow_up_reminder(TEST_USER_ID, "Follow-up due: Dev at Acme") is True
    assert notify.sent == [{"owner": OWNER, "channel_ids": [push], "subject": "Job Follow-up Reminder", "body": "Follow-up due: Dev at Acme"}]


def test_no_pushover_channel_means_no_reminder(notify):
    notify.add(OWNER, "resend", MAIL)
    assert send_follow_up_reminder(TEST_USER_ID, "Follow-up due") is False
    assert notify.sent == []


def test_the_follow_up_task_reminds_through_the_service_and_clears_the_date(seed, session_factory, notify):
    notify.add(OWNER, "pushover", PUSH)
    seed(make_user(), make_profile(active_notification_service="PUSHOVER"),
         make_job(status="APPLIED", next_follow_up_at=datetime(2026, 1, 1, tzinfo=timezone.utc)))
    with patch("workers.tasks.scheduling.SessionLocal", session_factory):
        assert check_follow_ups() == {"notified": 1, "due_jobs": 1}
    assert fetch(session_factory, JobEntry, "job-1").next_follow_up_at is None


def test_a_failed_reminder_keeps_the_date_for_the_next_beat(seed, session_factory, notify):
    notify.add(OWNER, "pushover", PUSH)
    due = datetime(2026, 1, 1, tzinfo=timezone.utc)
    seed(make_user(), make_profile(active_notification_service="PUSHOVER"), make_job(status="APPLIED", next_follow_up_at=due))
    notify.fail_with(NotifyError(UNAVAILABLE))
    with patch("workers.tasks.scheduling.SessionLocal", session_factory):
        assert check_follow_ups() == {"notified": 0, "due_jobs": 1}
    assert fetch(session_factory, JobEntry, "job-1").next_follow_up_at is not None
