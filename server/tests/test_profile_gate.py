"""Sources need a maintained profile: setup and crawl start answer 409 profile_required, the scheduler skips."""

from unittest.mock import patch

import pytest

from core.profile_rules import PROFILE_REQUIRED
from database.core import JobPlatform
from tests.factories import TEST_PLATFORM_ID, fetch, make_platform, make_profile, make_user

SETUP_BODY = {
    "url": "https://jobs.example.com/search",
    "selected_urls": ["https://jobs.example.com/job/1", "https://jobs.example.com/job/2"],
}
EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
INCOMPLETE_PROFILES = {
    "no profile": None,
    "no role": make_profile(role=""),
    "blank skills": make_profile(skills="   "),
}


@pytest.fixture(params=list(INCOMPLETE_PROFILES))
def incomplete_profile(request, seed):
    profile = INCOMPLETE_PROFILES[request.param]
    if profile is not None:
        seed(make_profile(role=profile.role, skills=profile.skills))


def test_setup_is_refused_and_creates_nothing(api_client, incomplete_profile, session_factory):
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post("/platforms/setup", json=SETUP_BODY)
    assert (response.status_code, response.json()["detail"]) == (409, PROFILE_REQUIRED)
    trigger.assert_not_called()
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_crawl_start_is_refused(api_client, incomplete_profile, seed):
    seed(make_platform())
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post(f"/platforms/{TEST_PLATFORM_ID}/crawl")
    assert (response.status_code, response.json()["detail"]) == (409, PROFILE_REQUIRED)
    trigger.assert_not_called()


def test_legacy_setup_is_refused_and_starts_no_crawl(api_client, incomplete_profile, seed, session_factory):
    seed(make_platform(setup_status="pending_setup"))
    with patch("routers.platforms._start_first_crawl") as start:
        response = api_client.post(f"/platforms/{TEST_PLATFORM_ID}/setup", json={"selected_urls": SETUP_BODY["selected_urls"]})
    assert (response.status_code, response.json()["detail"]) == (409, PROFILE_REQUIRED)
    start.assert_not_called()
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).setup_status == "pending_setup"


def test_setup_with_a_complete_profile_is_accepted(api_client, seed):
    seed(make_profile())
    with patch("routers.platforms._trigger_scraper_search", return_value={"status": "Started"}) as trigger:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "initial_run": "analyze"})
    assert response.status_code == 200
    trigger.assert_called_once()


def _scheduled_check(session_factory, seed, profile):
    from workers.tasks.scheduling import check_platforms_for_crawl

    seed(make_user(), make_platform(is_active=True, schedule_times=["00:00"], schedule_days=EVERY_DAY))
    if profile:
        seed(profile)
    with patch("workers.tasks.scheduling.SessionLocal", session_factory), \
         patch("workers.tasks.scheduling.requests.post") as post, \
         patch("workers.tasks.scheduling.logger") as log:
        check_platforms_for_crawl()
    return post, log


def test_the_scheduler_skips_a_user_without_a_complete_profile_and_logs_it_at_debug(session_factory, seed):
    post, log = _scheduled_check(session_factory, seed, make_profile(role="Secret Role", skills=""))
    post.assert_not_called()
    messages = [call.args[0] for call in log.debug.call_args_list]
    assert any("profile is not complete" in message for message in messages)
    assert not any("Secret Role" in message for message in messages)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


def test_the_scheduler_crawls_for_a_user_with_a_complete_profile(session_factory, seed):
    post, _ = _scheduled_check(session_factory, seed, make_profile())
    post.assert_called_once()
