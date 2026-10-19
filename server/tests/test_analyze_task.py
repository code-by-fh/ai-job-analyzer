from unittest.mock import call, patch

import pytest

from database.core import JobEntry
from services.notifications_client import owner_for
from tests.factories import (
    OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, events_of_type, fetch, make_job, make_platform, make_profile, make_user,
)
from workers.tasks.analyze import analyze_job_task

THRESHOLD = 60
LOW_SCORE = 40
HIGH_SCORE = 85
CRAWL_ID = "crawl-1"


def _job_data(**overrides) -> dict:
    data = {
        "id": "job-1",
        "title": "Backend Engineer",
        "company": "acme.example",
        "description": "Build APIs",
        "url": "https://acme.example/jobs/1",
        "user_id": TEST_USER_ID,
        "platform_id": None,
    }
    data.update(overrides)
    return data


@pytest.fixture()
def run_analysis(session_factory, seed, fake_redis):
    """Run ai.analyze_job synchronously; the LLM (system boundary) returns the given score."""
    seed(make_user(), make_profile(match_threshold=THRESHOLD))

    def _run(score: float, **job_overrides):
        with patch("workers.tasks.analyze.SessionLocal", session_factory), \
             patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "test-model")), \
             patch("workers.tasks.analyze.analyze_job", return_value={"score": score, "reasoning": "Fit"}):
            analyze_job_task(_job_data(**job_overrides))
    return _run


def test_auto_archived_job_gets_threshold_reason(run_analysis, session_factory):
    run_analysis(LOW_SCORE)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.is_archived, job.archive_reason) == (True, "THRESHOLD")


def test_job_above_threshold_is_not_archived(run_analysis, session_factory):
    run_analysis(HIGH_SCORE)
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.is_archived, job.archive_reason) == (False, None)


def test_new_job_event_carries_top_level_user_id(run_analysis, fake_redis):
    run_analysis(HIGH_SCORE)
    assert events_of_type(fake_redis, "new_job")[0]["user_id"] == TEST_USER_ID


def test_job_updated_event_carries_top_level_user_id(run_analysis, seed, fake_redis):
    seed(make_job())
    run_analysis(HIGH_SCORE, force_reanalyze=True)
    assert events_of_type(fake_redis, "job_updated")[0]["user_id"] == TEST_USER_ID


def test_matched_job_is_counted_on_the_crawl(run_analysis, fake_redis):
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert call(f"crawl_job:{CRAWL_ID}", "jobs_matched", 1) in fake_redis.hincrby.call_args_list


def test_auto_archived_job_is_not_counted_as_matched(run_analysis, fake_redis):
    run_analysis(LOW_SCORE, crawl_job_id=CRAWL_ID)
    assert call(f"crawl_job:{CRAWL_ID}", "jobs_matched", 1) not in fake_redis.hincrby.call_args_list


FOREIGN_ROLE = "Other user's secret role"
FIRST_PROFILE_ID = 1
FOREIGN_USER_ID = 502


def test_analysis_never_uses_another_users_profile(session_factory, seed, fake_redis):
    seed(make_user(), make_user(FOREIGN_USER_ID),
         make_profile(id=FIRST_PROFILE_ID, user_id=FOREIGN_USER_ID, role=FOREIGN_ROLE))
    with patch("workers.tasks.analyze.SessionLocal", session_factory), \
         patch("workers.tasks.analyze.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.analyze.get_client_and_model", return_value=(None, "test-model")), \
         patch("workers.tasks.analyze.analyze_job", return_value={"score": HIGH_SCORE, "reasoning": "Fit"}) as analyze:
        analyze_job_task(_job_data())
    assert FOREIGN_ROLE not in analyze.call_args.kwargs["profile_str"]


def test_skipped_job_event_names_the_existing_job(run_analysis, seed, fake_redis):
    seed(make_job())
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert events_of_type(fake_redis, "job_skipped")[0]["existing_job_id"] == "job-1"


def test_skipped_job_event_hides_a_foreign_job_id(run_analysis, seed, fake_redis):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert events_of_type(fake_redis, "job_skipped")[0]["existing_job_id"] is None


def _notifying_source(seed, notify) -> str:
    channel_id = notify.add(owner_for(TEST_USER_ID), "pushover", {"user_key": "u", "api_token": "t"})
    seed(make_platform(notification_channels=[{"id": channel_id, "type": "pushover"}], is_notification_enabled=True))
    return channel_id


def test_a_match_of_a_notifying_source_is_pushed_and_marked(run_analysis, seed, notify, session_factory):
    channel_id = _notifying_source(seed, notify)
    run_analysis(HIGH_SCORE, platform_id=TEST_PLATFORM_ID)
    assert notify.sent[0]["channel_ids"] == [channel_id]
    assert fetch(session_factory, JobEntry, "job-1").notification_sent is True


def test_an_auto_archived_match_notifies_nobody(run_analysis, seed, notify, session_factory):
    _notifying_source(seed, notify)
    run_analysis(LOW_SCORE, platform_id=TEST_PLATFORM_ID)
    assert notify.sent == []
    assert not fetch(session_factory, JobEntry, "job-1").notification_sent
