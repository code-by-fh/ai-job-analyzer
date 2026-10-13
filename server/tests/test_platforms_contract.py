"""Phase 5 contract of the platforms API (SSRF guard, crawl start, runs, writes, delete, channels)."""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import redis

from core import url_safety
from core.crawl_registry import ALREADY_RUNNING
from database.core import JobEntry, JobPlatform, PlatformRun
from tests.factories import (
    OTHER_USER_ID,
    TEST_PLATFORM_ID,
    fetch,
    make_job,
    make_platform,
    make_profile,
    make_user,
    TEST_USER_ID,
)

PRIVATE_URL = "http://169.254.169.254/latest"
PRIVATE_NAME_URL = "https://intranet.example.com/jobs"
PRIVATE_RESOLVED_ADDRESS = "10.0.0.7"
SETUP_BODY = {
    "url": "https://jobs.example.com/search",
    "selected_urls": ["https://jobs.example.com/job/1", "https://jobs.example.com/job/2"],
}


def _loc(response) -> list:
    return response.json()["detail"][0]["loc"]


def _resolve_to_private(monkeypatch) -> None:
    monkeypatch.setattr(url_safety, "_resolve", lambda host: [PRIVATE_RESOLVED_ADDRESS])


def test_preview_links_refuses_a_private_url(api_client):
    with patch("routers.platforms.requests.post") as post:
        response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    post.assert_not_called()


def test_preview_links_refuses_a_name_resolving_to_a_private_address(api_client, monkeypatch):
    _resolve_to_private(monkeypatch)
    with patch("routers.platforms.requests.post") as post:
        response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_NAME_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    post.assert_not_called()


def test_setup_refuses_a_private_url_and_creates_nothing(api_client, session_factory):
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "url": PRIVATE_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    trigger.assert_not_called()
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_setup_refuses_a_name_resolving_to_a_private_address(api_client, session_factory, monkeypatch):
    _resolve_to_private(monkeypatch)
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "url": PRIVATE_NAME_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    trigger.assert_not_called()
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_patch_refuses_a_private_url(api_client, seed, session_factory):
    seed(make_platform())
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"url": "http://127.0.0.1/jobs"})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.example.com/search"


def test_patch_refuses_a_name_resolving_to_a_private_address(api_client, seed, session_factory, monkeypatch):
    seed(make_platform())
    _resolve_to_private(monkeypatch)
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"url": "https://jobs.example.com/other"})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.example.com/search"


def test_create_refuses_a_private_url_and_stores_nothing(api_client, session_factory):
    response = api_client.post("/platforms", json={"url": PRIVATE_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_create_refuses_a_name_resolving_to_a_private_address(api_client, session_factory, monkeypatch):
    _resolve_to_private(monkeypatch)
    response = api_client.post("/platforms", json={"url": PRIVATE_NAME_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_the_refusal_never_echoes_the_url(api_client):
    response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_URL})
    assert "169.254" not in response.text


def test_the_resolved_refusal_never_echoes_the_url_or_address(api_client, monkeypatch):
    _resolve_to_private(monkeypatch)
    response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_NAME_URL})
    assert "intranet" not in response.text
    assert PRIVATE_RESOLVED_ADDRESS not in response.text


def _crawl(api_client, answer):
    with patch("routers.platforms._trigger_scraper_search", return_value=answer):
        return api_client.post(f"/platforms/{TEST_PLATFORM_ID}/crawl")


def test_an_accepted_crawl_returns_its_id_and_stamps_last_crawl_at(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Started", "job_id": "crawl-9"})
    assert (response.status_code, response.json()["job_id"]) == (200, "crawl-9")
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is not None


def test_second_crawl_of_the_same_platform_is_refused(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Error", "code": "already_running", "message": "x"})
    assert response.status_code == 409
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


def test_any_other_refusal_is_a_bad_gateway_and_keeps_last_crawl_at(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Error", "message": "URL muss mit http(s) beginnen."})
    assert response.status_code == 502
    assert "http(s)" not in response.text
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


def test_a_200_without_status_is_not_an_accepted_start(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"job_id": "crawl-9"})
    assert response.status_code == 502
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]


def _run_check(session_factory, answer: dict, checks: int = 1):
    """Run the periodic check `checks` times; the scraper answers 200 with `answer`. Returns the POST mock."""
    from workers.tasks.scheduling import check_platforms_for_crawl

    response = type("Response", (), {"status_code": 200, "json": lambda self: answer})()
    with patch("workers.tasks.scheduling.SessionLocal", session_factory), \
         patch("workers.tasks.platform_runs.SessionLocal", session_factory), \
         patch("core.auth.create_access_token", return_value="token"), \
         patch("workers.tasks.scheduling.requests.post", return_value=response) as post:
        for _ in range(checks):
            check_platforms_for_crawl()
    return post


def _scheduled_check(session_factory, seed, answer: dict):
    seed(make_user(), make_platform(is_active=True, schedule_time="00:00", schedule_days=EVERY_DAY))
    _run_check(session_factory, answer)
    return fetch(session_factory, JobPlatform, TEST_PLATFORM_ID)


def test_the_scheduler_stamps_last_crawl_at_for_an_accepted_start(session_factory, seed):
    platform = _scheduled_check(session_factory, seed, {"status": "Started", "job_id": "crawl-9"})
    assert platform.last_crawl_at is not None


def test_the_scheduler_does_not_stamp_a_refused_start_and_shows_a_failed_run(session_factory, seed):
    platform = _scheduled_check(session_factory, seed, {"status": "Error", "message": "x"})
    assert platform.last_crawl_at is None
    assert platform.last_run["error"] == "failed"


def test_the_scheduler_leaves_the_last_run_when_a_crawl_is_already_running(session_factory, seed):
    platform = _scheduled_check(session_factory, seed, {"status": "Error", "code": "already_running"})
    assert (platform.last_crawl_at, platform.last_run) == (None, None)


def test_a_refused_scheduled_start_appears_in_the_run_history(session_factory, seed):
    _scheduled_check(session_factory, seed, {"status": "Error", "message": "x"})
    with session_factory() as db:
        assert [run.error for run in db.query(PlatformRun).all()] == ["failed"]


def test_an_already_running_scheduled_start_records_no_run(session_factory, seed):
    _scheduled_check(session_factory, seed, {"status": "Error", "code": ALREADY_RUNNING})
    with session_factory() as db:
        assert db.query(PlatformRun).count() == 0


def _run(day: int, **fields) -> PlatformRun:
    return PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=datetime(2026, 10, day, 9, 0, tzinfo=timezone.utc),
                       found=fields.get("found", 0), new=0, matched=0, seeded=False, error=fields.get("error"))


def test_runs_are_listed_newest_first_with_a_limit(api_client, seed):
    seed(make_platform(), _run(1, found=5), _run(3, error="unreachable"), _run(2, found=7))
    runs = api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs", params={"limit": 2}).json()
    assert [(run["finished_at"][:10], run["error"]) for run in runs] == [("2026-10-03", "unreachable"), ("2026-10-02", None)]
    assert set(runs[0]) == {"started_at", "finished_at", "found", "new", "matched", "seeded", "error"}


def test_runs_of_another_users_platform_are_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID), _run(1))
    assert api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs").status_code == 404


def test_runs_limit_is_bounded(api_client, seed):
    seed(make_platform())
    assert api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs", params={"limit": 51}).status_code == 422


def _patch(api_client, body):
    return api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json=body)


def test_patch_writes_the_url_pattern(api_client, seed, session_factory):
    seed(make_platform())
    assert _patch(api_client, {"url_pattern": " /job/ "}).status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url_pattern == "/job/"


@pytest.mark.parametrize("body,field", [
    ({"schedule_time": "24:00", "schedule_days": [0]}, "schedule_time"),
    ({"schedule_time": "8:00", "schedule_days": [0]}, "schedule_time"),
    ({"schedule_time": "08:00", "schedule_days": [7]}, "schedule_days"),
    ({"schedule_time": "08:00", "schedule_days": [1, 1]}, "schedule_days"),
    ({"schedule_time": "08:00", "schedule_days": []}, "schedule_days"),
    ({"name": "   "}, "name"),
    ({"url_pattern": "/"}, "url_pattern"),
])
def test_patch_rejects_schedule_time_out_of_range_and_other_bad_values(api_client, seed, body, field):
    seed(make_platform())
    response = _patch(api_client, body)
    assert (response.status_code, _loc(response)) == (422, ["body", field])


def test_patch_rejects_a_time_without_days(api_client, seed):
    seed(make_platform())
    response = _patch(api_client, {"schedule_time": "08:00"})
    assert (response.status_code, _loc(response)) == (422, ["body", "schedule_days"])


def test_patch_clears_the_schedule(api_client, seed, session_factory):
    seed(make_platform(schedule_time="08:00", schedule_days=[0, 1]))
    assert _patch(api_client, {"schedule_time": None, "schedule_days": None}).status_code == 200
    platform = fetch(session_factory, JobPlatform, TEST_PLATFORM_ID)
    assert (platform.schedule_time, platform.schedule_days) == (None, None)


OWN_FAVICON = "https://cdn.example.com/icon.png"


def test_patch_url_keeps_the_name(api_client, seed, session_factory):
    seed(make_platform(favicon_url=OWN_FAVICON))
    assert _patch(api_client, {"url": "https://jobs.example.com/other"}).status_code == 200
    platform = fetch(session_factory, JobPlatform, TEST_PLATFORM_ID)
    assert (platform.url, platform.name, platform.favicon_url) == (
        "https://jobs.example.com/other", "Example Jobs", OWN_FAVICON,
    )


def test_patch_of_another_users_platform_is_not_found(api_client, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID))
    assert _patch(api_client, {"name": "Taken over"}).status_code == 404
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).name == "Example Jobs"


def _setup(api_client, **fields):
    with patch("routers.platforms._trigger_scraper_search", return_value={"status": "Started", "job_id": "c"}), \
         patch("routers.platforms.generate_platform_name", return_value="AI Name") as name:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "initial_run": "none", **fields})
    return response, name


def test_setup_takes_name_schedule_and_pattern_without_asking_the_ai(api_client):
    response, name = _setup(api_client, name="Kotlin Hamburg", schedule_time="07:30",
                            schedule_days=[0, 2, 4], url_pattern="/job/")
    body = response.json()
    assert (body["name"], body["schedule_time"], body["schedule_days"], body["url_pattern"]) == (
        "Kotlin Hamburg", "07:30", [0, 2, 4], "/job/",
    )
    name.assert_not_called()


def test_setup_without_name_asks_the_ai_and_infers_the_pattern(api_client):
    response, name = _setup(api_client)
    assert (response.json()["name"], response.json()["url_pattern"]) == ("AI Name", "/job/")
    name.assert_called_once()


def test_setup_rejects_an_incomplete_schedule_and_an_empty_selection(api_client):
    incomplete, _ = _setup(api_client, schedule_time="07:30")
    empty, _ = _setup(api_client, selected_urls=[])
    assert (_loc(incomplete), _loc(empty)) == (["body", "schedule_days"], ["body", "selected_urls"])


def test_setup_with_an_invalid_time_reports_only_the_time(api_client):
    response, _ = _setup(api_client, schedule_time="25:00", schedule_days=[1])
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "schedule_time"]]


def test_setup_days_without_a_time_are_refused_on_the_time(api_client, session_factory):
    response, _ = _setup(api_client, schedule_days=[1])
    assert (response.status_code, _loc(response)) == (422, ["body", "schedule_time"])
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_patch_days_without_a_time_are_refused_on_the_time(api_client, seed):
    seed(make_platform())
    response = _patch(api_client, {"schedule_days": [1]})
    assert (response.status_code, _loc(response)) == (422, ["body", "schedule_time"])


def test_a_legacy_half_schedule_still_accepts_a_rename(api_client, seed, session_factory):
    seed(make_platform(schedule_time="08:00", schedule_days=None))
    assert _patch(api_client, {"name": "Renamed"}).status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).name == "Renamed"


def test_patch_treats_a_www_label_inside_the_host_as_another_site(api_client, seed, session_factory):
    seed(make_platform(url="https://jobs.com/search"))
    response = _patch(api_client, {"url": "https://jobs.www.com/search"})
    assert response.status_code == 400
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.com/search"


def test_patch_still_treats_a_leading_www_as_the_same_site(api_client, seed, session_factory):
    seed(make_platform(url="https://www.jobs.com/search"))
    assert _patch(api_client, {"url": "https://jobs.com/other"}).status_code == 200


CALLER_LOCK_KEY = f"crawl_lock:{TEST_USER_ID}:{TEST_PLATFORM_ID}"
CALLER_CRAWLS_KEY = f"user:{TEST_USER_ID}:active_crawls"


@pytest.fixture()
def no_crawl(fake_redis, monkeypatch):
    """A reachable crawl registry with nothing running: no lock and no active crawl."""
    fake_redis.exists.side_effect = None
    fake_redis.exists.return_value = 0
    fake_redis.smembers.return_value = set()
    monkeypatch.setattr("routers.platforms._crawl_redis", lambda: fake_redis)
    return fake_redis


def test_delete_keeps_jobs_and_drops_placeholders_and_runs(api_client, seed, session_factory, no_crawl):
    seed(
        make_platform(),
        make_job(id="applied", status="APPLIED", platform_id=TEST_PLATFORM_ID),
        make_job(id="seen", status="SEEN", platform_id=TEST_PLATFORM_ID),
        _run(1),
    )
    response = api_client.delete(f"/platforms/{TEST_PLATFORM_ID}")
    assert response.json() == {"status": "deleted", "kept_jobs": 1}
    assert fetch(session_factory, JobEntry, "applied").platform_id is None
    assert fetch(session_factory, JobEntry, "seen") is None
    with session_factory() as db:
        assert (db.query(PlatformRun).count(), db.query(JobPlatform).count()) == (0, 0)


def test_delete_during_a_crawl_is_refused(api_client, seed, session_factory, no_crawl):
    seed(make_platform())
    no_crawl.smembers.return_value = {b"crawl-1"}
    no_crawl.hget.return_value = str(TEST_PLATFORM_ID).encode()
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").status_code == 409
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID) is not None
    no_crawl.smembers.assert_called_with(CALLER_CRAWLS_KEY)


def test_delete_while_the_crawl_lock_is_held_is_refused(api_client, seed, session_factory, no_crawl):
    seed(make_platform())
    no_crawl.exists.side_effect = lambda key: int(key == CALLER_LOCK_KEY)
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").status_code == 409
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID) is not None


def test_delete_goes_ahead_when_redis_is_down(api_client, seed, session_factory, no_crawl):
    seed(make_platform())
    no_crawl.exists.side_effect = redis.ConnectionError("down")
    no_crawl.smembers.side_effect = redis.ConnectionError("down")
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").json() == {"status": "deleted", "kept_jobs": 0}
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID) is None


def test_kept_jobs_counts_only_the_callers_jobs(api_client, seed, session_factory, no_crawl):
    seed(
        make_user(OTHER_USER_ID),
        make_platform(),
        make_job(id="own", platform_id=TEST_PLATFORM_ID),
        make_job(id="foreign", user_id=OTHER_USER_ID, platform_id=TEST_PLATFORM_ID),
    )
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").json()["kept_jobs"] == 1
    assert fetch(session_factory, JobEntry, "foreign").platform_id is None


def test_delete_of_another_users_platform_is_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID))
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").status_code == 404


SECRET_TOKEN = "SECRET_TOKEN_4711"
SECRET_PASSWORD = "SECRET_PASSWORD_4711"
SMTP_USER = "smtp-user-4711"
PUSHOVER_USER_KEY = "pushover-user-4711"
SMTP_HOST = "smtp.example.com"


def test_channel_status_is_booleans_only(api_client, seed):
    seed(make_profile(pushover_user_key=PUSHOVER_USER_KEY, pushover_api_token=SECRET_TOKEN,
                      smtp_host=SMTP_HOST, smtp_user=SMTP_USER, smtp_password=SECRET_PASSWORD,
                      resend_api_key=SECRET_TOKEN))
    response = api_client.get("/notification-settings/channels")
    assert response.json() == {"PUSHOVER": True, "RESEND": False, "MAILJET": False, "SMTP": True}
    leaked = [value for value in (SECRET_TOKEN, SECRET_PASSWORD, PUSHOVER_USER_KEY, SMTP_HOST, SMTP_USER)
              if value in response.text]
    assert leaked == []


def test_channel_status_without_profile_is_all_false(api_client):
    assert api_client.get("/notification-settings/channels").json() == {
        "PUSHOVER": False, "RESEND": False, "MAILJET": False, "SMTP": False,
    }


IDN_URL = "https://jobs.münchen.de/suche"
IDN_CANONICAL_URL = "https://jobs.xn--mnchen-3ya.de/suche"
B1_URL = "http://1.1.1.1%2elocalhost/latest"
LOGGED_SECRET_PATH = "/private/path"
LOGGED_SECRET_QUERY = "token=abc"


def test_setup_refuses_a_percent_escaped_host_before_anything_else(api_client, session_factory):
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "url": B1_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    trigger.assert_not_called()
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_preview_links_refuses_a_percent_escaped_host_without_calling_the_scraper(api_client):
    with patch("routers.platforms.requests.post") as post:
        response = api_client.post("/platforms/preview-links", json={"url": B1_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    post.assert_not_called()


def test_setup_stores_the_normalised_url(api_client, session_factory):
    body = {"url": IDN_URL, "selected_urls": [f"{IDN_CANONICAL_URL}/job/1"], "initial_run": "none", "name": "Muenchen"}
    response = api_client.post("/platforms/setup", json=body)
    assert response.status_code == 200
    assert response.json()["url"] == IDN_CANONICAL_URL
    assert fetch(session_factory, JobPlatform, response.json()["id"]).url == IDN_CANONICAL_URL


def test_create_stores_the_normalised_url(api_client, session_factory):
    response = api_client.post("/platforms", json={"url": IDN_URL})
    assert response.status_code == 200
    assert fetch(session_factory, JobPlatform, response.json()["id"]).url == IDN_CANONICAL_URL


def test_patch_stores_the_normalised_url(api_client, seed, session_factory):
    seed(make_platform())
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"url": "https://JOBS.Example.com/other"})
    assert response.status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.example.com/other"


def test_preview_failure_logs_the_host_only(api_client):
    url = f"https://jobs.example.com{LOGGED_SECRET_PATH}?{LOGGED_SECRET_QUERY}"
    with patch("routers.platforms.requests.post", side_effect=ConnectionError("down")), \
         patch("routers.platforms.logger") as logger:
        api_client.post("/platforms/preview-links", json={"url": url})
    logged = str(logger.error.call_args_list)
    assert "jobs.example.com" in logged
    assert LOGGED_SECRET_PATH not in logged
    assert LOGGED_SECRET_QUERY not in logged


def test_starting_a_crawl_waits_longer_than_the_scraper_dns_check():
    from core.crawl_registry import SCRAPER_START_TIMEOUT_SECONDS

    assert SCRAPER_START_TIMEOUT_SECONDS > url_safety.DNS_TIMEOUT_SECONDS


def test_a_refused_slot_is_not_retried_every_check(session_factory, seed):
    seed(make_user(), make_platform(is_active=True, schedule_time="00:00", schedule_days=EVERY_DAY))
    post = _run_check(session_factory, {"status": "Error", "message": "x"}, checks=2)
    assert post.call_count == 1
    with session_factory() as db:
        assert db.query(PlatformRun).filter_by(platform_id=TEST_PLATFORM_ID).count() == 1


def test_a_200_without_status_is_a_refusal_for_the_scheduler(session_factory, seed):
    platform = _scheduled_check(session_factory, seed, {"job_id": "crawl-9"})
    assert (platform.last_crawl_at, platform.last_run["error"]) == (None, "failed")


def _messages(log_method) -> list:
    return [call.args[0] for call in log_method.call_args_list]


def test_an_already_running_answer_is_logged_as_info_not_error(session_factory, seed):
    with patch("workers.tasks.scheduling.logger") as log:
        _scheduled_check(session_factory, seed, {"status": "Error", "code": "already_running"})
    assert any("already running" in message for message in _messages(log.info))
    assert not any("already running" in message for message in _messages(log.error))


def test_no_platforms_due_is_only_logged_when_nothing_was_attempted(session_factory, seed):
    with patch("workers.tasks.scheduling.logger") as log:
        _scheduled_check(session_factory, seed, {"status": "Started", "job_id": "c"})
        assert "No platforms due for crawl." not in _messages(log.info)
        _run_check(session_factory, {"status": "Started", "job_id": "c"})
    assert "No platforms due for crawl." in _messages(log.info)


def test_patch_accepts_its_own_domain_for_a_legacy_mixed_case_url(api_client, seed, session_factory):
    seed(make_platform(url="https://Jobs.Example.com/search"))
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"url": "https://jobs.example.com/other"})
    assert response.status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.example.com/other"


def test_a_naive_legacy_finished_at_does_not_abort_the_scheduler_run(session_factory, seed):
    seed(make_user(), make_platform(
        is_active=True, schedule_time="00:00", schedule_days=EVERY_DAY,
        last_run={"finished_at": "2020-01-01T00:00:00", "started_at": None, "found": 0, "new": 0, "matched": 0},
    ))
    post = _run_check(session_factory, {"status": "Started", "job_id": "crawl-9"})
    assert post.call_count == 1


def test_legacy_setup_does_not_stamp_the_last_crawl_when_the_scraper_refuses(api_client, seed, session_factory):
    seed(make_platform(setup_status="pending"))
    refusal = {"status": "Error", "code": ALREADY_RUNNING}
    with patch("routers.platforms._trigger_scraper_search", return_value=refusal):
        response = api_client.post(f"/platforms/{TEST_PLATFORM_ID}/setup", json={"selected_urls": SETUP_BODY["selected_urls"]})
    assert response.status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


def test_legacy_setup_stamps_the_last_crawl_when_the_scraper_starts(api_client, seed, session_factory):
    seed(make_platform(setup_status="pending"))
    with patch("routers.platforms._trigger_scraper_search", return_value={"status": "Started", "job_id": "c"}) as trigger:
        api_client.post(f"/platforms/{TEST_PLATFORM_ID}/setup", json={"selected_urls": SETUP_BODY["selected_urls"]})
    assert trigger.call_args.kwargs["is_initial_run"] is True
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is not None


def test_the_scheduler_waits_for_a_crawl_start_as_long_as_the_api(session_factory, seed):
    from core.crawl_registry import SCRAPER_START_TIMEOUT_SECONDS

    seed(make_user(), make_platform(is_active=True, schedule_time="00:00", schedule_days=EVERY_DAY))
    post = _run_check(session_factory, {"status": "Started", "job_id": "c"})
    assert post.call_args.kwargs["timeout"] == SCRAPER_START_TIMEOUT_SECONDS


def test_the_preview_proxy_waits_longer_than_the_render_call_and_two_dns_checks(api_client):
    from services import render_client

    with patch("routers.platforms.requests.post") as post:
        api_client.post("/platforms/preview-links", json={"url": SETUP_BODY["url"]})
    assert post.call_args.kwargs["timeout"] > render_client.HTTP_TIMEOUT_SECONDS + 2 * url_safety.DNS_TIMEOUT_SECONDS
