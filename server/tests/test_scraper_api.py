import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import scraper_api
from workers.crawl_control import INTERNAL_FAILURE, cleanup_crawl_job, fail_crawl_job
from database.core import JobPlatform
from core.crawl_registry import CRAWL_TTL_SECONDS, acquire_crawl_lock
from tests.crawl_locks import Clock, lock_backed
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_profile, make_user

CRAWL_ID = "crawl-1"
CRAWL_HASH = {b"user_id": str(TEST_USER_ID).encode(), b"platform_id": str(TEST_PLATFORM_ID).encode()}
# Every live crawl hash carries a status (_init_crawl_job sets it); fail_crawl_job leaves hashes without one alone.
RUNNING_STATUS = b"crawling"


def test_remember_platform_stores_platform_id(monkeypatch, fake_redis):
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    scraper_api._remember_platform(CRAWL_ID, TEST_PLATFORM_ID)
    fake_redis.hset.assert_called_once_with(f"crawl_job:{CRAWL_ID}", "platform_id", TEST_PLATFORM_ID)


def test_remember_platform_skips_imports_without_platform(monkeypatch, fake_redis):
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    scraper_api._remember_platform(CRAWL_ID, None)
    fake_redis.hset.assert_not_called()


def test_failed_crawl_records_error_on_platform(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    fake_redis.hgetall.return_value = CRAWL_HASH
    fake_redis.hget.return_value = RUNNING_STATUS
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        fail_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, INTERNAL_FAILURE)
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "failed"


def test_cancelled_crawl_records_cancelled_code(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    fake_redis.hgetall.return_value = CRAWL_HASH
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        cleanup_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, reason="cancelled")
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "cancelled"


@pytest.fixture()
def profileless_scraper_client(monkeypatch, fake_redis, session_factory):
    from core.auth import get_current_user, get_db

    def _get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    monkeypatch.setattr(scraper_api, "r", fake_redis)
    scraper_api.app.dependency_overrides[get_current_user] = lambda: make_user()
    scraper_api.app.dependency_overrides[get_db] = _get_db
    yield TestClient(scraper_api.app)
    scraper_api.app.dependency_overrides.pop(get_current_user, None)
    scraper_api.app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def scraper_client(profileless_scraper_client, seed):
    """The scraper client of a user with a maintained profile (a search needs one)."""
    seed(make_profile())
    return profileless_scraper_client


@pytest.mark.parametrize(("path", "body"), [
    ("/search", {"query": "https://intranet.example.com/jobs", "location": "Remote"}),
    ("/import-job", {"url": "https://intranet.example.com/job/1"}),
])
def test_scraper_refuses_a_name_resolving_to_a_private_address_before_queueing(scraper_client, monkeypatch, path, body):
    monkeypatch.setattr("core.url_safety._resolve", lambda host: ["10.0.0.7"])
    with patch("scraper_api._init_crawl_job") as init_crawl:
        response = scraper_client.post(path, json=body)
    assert response.json()["status"] == "Error"
    assert "intranet" not in response.text
    init_crawl.assert_not_called()


def test_scraper_preview_links_refuses_a_private_url_without_render_call(scraper_client):
    with patch("services.page_rendering.fetch_html") as mock_fetch:
        response = scraper_client.post("/preview-links", json={"url": "http://127.0.0.1:8000/"})
    assert response.json() == {"links": []}
    mock_fetch.assert_not_called()


SEARCH_BODY = {"query": "https://jobs.example.com/search", "location": "Remote", "platform_id": TEST_PLATFORM_ID}


def test_second_crawl_of_a_running_platform_is_refused_by_the_scraper(scraper_client, fake_redis):
    fake_redis.smembers.return_value = {b"crawl-1"}
    fake_redis.hget.return_value = str(TEST_PLATFORM_ID).encode()
    with patch.object(scraper_api, "chain") as chain:
        body = scraper_client.post("/search", json=SEARCH_BODY).json()
    assert (body["status"], body["code"]) == ("Error", "already_running")
    chain.assert_not_called()


def test_a_platform_without_running_crawl_starts(scraper_client, fake_redis):
    fake_redis.smembers.return_value = set()
    with patch.object(scraper_api, "chain") as chain:
        body = scraper_client.post("/search", json=SEARCH_BODY).json()
    assert body["status"] == "Started"
    chain.return_value.apply_async.assert_called_once()


def test_a_second_start_while_the_first_holds_the_lock_queues_nothing(scraper_client, fake_redis):
    lock_backed(fake_redis, Clock())
    with patch.object(scraper_api, "chain") as chain:
        first = scraper_client.post("/search", json=SEARCH_BODY).json()
        second = scraper_client.post("/search", json=SEARCH_BODY).json()
    assert (first["status"], second.get("code")) == ("Started", "already_running")
    chain.return_value.apply_async.assert_called_once()


def test_a_start_works_again_once_the_lock_expired(scraper_client, fake_redis):
    clock = Clock()
    lock_backed(fake_redis, clock)
    with patch.object(scraper_api, "chain"):
        scraper_client.post("/search", json=SEARCH_BODY)
        clock.now += CRAWL_TTL_SECONDS + 1
        assert scraper_client.post("/search", json=SEARCH_BODY).json()["status"] == "Started"


def test_the_lock_names_the_crawl_that_holds_it(scraper_client, fake_redis):
    state = lock_backed(fake_redis, Clock())
    with patch.object(scraper_api, "chain"):
        job_id = scraper_client.post("/search", json=SEARCH_BODY).json()["job_id"]
    assert list(state.strings.values()) == [job_id.encode()]


def _locked_crawl(monkeypatch, fake_redis):
    state = lock_backed(fake_redis, Clock())
    state.hset(f"crawl_job:{CRAWL_ID}", mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID, "status": "crawling"})
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, CRAWL_ID)
    return state


def test_a_failed_crawl_releases_the_lock(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _locked_crawl(monkeypatch, fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        fail_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, INTERNAL_FAILURE)
    assert state.strings == {}


def test_a_cancelled_crawl_releases_the_lock(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _locked_crawl(monkeypatch, fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        cleanup_crawl_job(fake_redis, CRAWL_ID, TEST_USER_ID, reason="cancelled")
    assert state.strings == {}


def test_a_start_that_cannot_be_initialised_releases_the_lock(scraper_client, fake_redis):
    state = lock_backed(fake_redis, Clock())
    with patch.object(scraper_api, "_init_crawl_job", side_effect=RuntimeError("redis down")):
        with pytest.raises(RuntimeError):
            scraper_client.post("/search", json=SEARCH_BODY)
    assert state.strings == {}


def test_a_start_that_cannot_be_queued_releases_the_lock(scraper_client, fake_redis):
    state = lock_backed(fake_redis, Clock())
    with patch.object(scraper_api, "chain") as chain:
        chain.return_value.apply_async.side_effect = RuntimeError("broker down")
        with pytest.raises(RuntimeError):
            scraper_client.post("/search", json=SEARCH_BODY)
    assert state.strings == {}


def test_a_new_crawl_stamps_progress_and_uses_the_shared_ttl(scraper_client, fake_redis):
    state = lock_backed(fake_redis, Clock())
    with patch.object(scraper_api, "chain"):
        job_id = scraper_client.post("/search", json=SEARCH_BODY).json()["job_id"]
    crawl = state.hashes[f"crawl_job:{job_id}"]
    assert crawl["last_progress_at"] == crawl["started_at"]
    assert state.expires[f"crawl_job:{job_id}"] == CRAWL_TTL_SECONDS == state.expires[f"crawl_lock:{TEST_USER_ID}:{TEST_PLATFORM_ID}"]


def test_importing_the_scraper_api_deletes_nothing_in_redis():
    import importlib.util

    spec = importlib.util.spec_from_file_location("scraper_api_fresh", scraper_api.__file__)
    with patch("redis.from_url") as from_url:
        spec.loader.exec_module(importlib.util.module_from_spec(spec))
    client = from_url.return_value
    assert client.method_calls == []


def _orphaned_crawl(monkeypatch, fake_redis):
    state = lock_backed(fake_redis, Clock())
    state.hset(f"crawl_job:{CRAWL_ID}", mapping={"user_id": TEST_USER_ID, "platform_id": TEST_PLATFORM_ID})
    state.sets[f"user:{TEST_USER_ID}:active_crawls"] = {CRAWL_ID.encode()}
    acquire_crawl_lock(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID, CRAWL_ID)
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    return state


def test_the_startup_hook_clears_orphaned_crawls_and_frees_their_platform(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _orphaned_crawl(monkeypatch, fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), TestClient(scraper_api.app):
        pass
    assert (f"crawl_job:{CRAWL_ID}" in state.hashes, state.strings) == (False, {})
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "failed"


def test_the_startup_hook_leaves_the_lock_of_a_crawl_it_does_not_own(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _orphaned_crawl(monkeypatch, fake_redis)
    state.set(f"crawl_lock:{TEST_USER_ID}:{TEST_PLATFORM_ID}", "newer-crawl")
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory), TestClient(scraper_api.app):
        pass
    assert list(state.strings.values()) == [b"newer-crawl"]


def test_crawl_status_names_the_platform_and_leaves_imports_without_one(scraper_client, fake_redis):
    hashes = {
        "crawl-1": {b"platform_url": b"https://jobs.example.com/search", b"status": b"crawling",
                    b"platform_id": str(TEST_PLATFORM_ID).encode(), b"total": b"3"},
        "import-1": {b"platform_url": b"https://jobs.example.com/job/9", b"status": b"starting", b"total": b"1"},
    }
    fake_redis.smembers.return_value = {b"crawl-1", b"import-1"}
    fake_redis.hgetall.side_effect = lambda key: hashes[key.split(":")[1]]
    fake_redis.lrange.return_value = []
    jobs = {job["job_id"]: job for job in scraper_client.get("/crawl-status").json()["jobs"]}
    assert (jobs["crawl-1"]["platform_id"], jobs["import-1"]["platform_id"]) == (TEST_PLATFORM_ID, None)


def test_search_queues_the_normalised_url(scraper_client):
    with patch("scraper_api._init_crawl_job") as init_crawl, patch("scraper_api.chain") as workflow, \
         patch("scraper_api.celery_app") as celery:
        response = scraper_client.post("/search", json={"query": "https://Fa\u00df.example/jobs", "location": "Remote"})
    assert response.json()["status"] == "Started"
    assert init_crawl.call_args.args[2] == "https://xn--fa-hia.example/jobs"
    assert celery.signature.call_args_list[0].kwargs["args"][0] == "https://xn--fa-hia.example/jobs"
    workflow.return_value.apply_async.assert_called_once()


def test_import_queues_the_normalised_url(scraper_client, monkeypatch, fake_redis):
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    with patch("scraper_api._init_crawl_job"), patch("scraper_api.celery_app") as celery:
        response = scraper_client.post("/import-job", json={"url": "https://Fa\u00df.example/job/1"})
    assert response.json()["status"] == "Started"
    assert celery.send_task.call_args.kwargs["args"][0] == "https://xn--fa-hia.example/job/1"


def test_the_startup_cleanup_publishes_each_failure_after_the_run_is_stored(monkeypatch, fake_redis, session_factory, seed):
    seed(make_user(), make_platform())
    state = _locked_crawl(monkeypatch, fake_redis)
    state.sets[f"user:{TEST_USER_ID}:active_crawls"] = {CRAWL_ID.encode()}
    stored_at_publish = []
    fake_redis.publish.side_effect = lambda channel, message: stored_at_publish.append(
        (json.loads(message), fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"])
    )
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        scraper_api.cleanup_stale_jobs()
    event = {"type": "crawl_job_failed", "job_id": CRAWL_ID, "user_id": TEST_USER_ID, "reason": "error"}
    assert stored_at_publish == [(event, "failed")]


def test_search_without_a_maintained_profile_is_refused_and_starts_nothing(profileless_scraper_client):
    with patch.object(scraper_api, "chain") as chain:
        response = profileless_scraper_client.post("/search", json=SEARCH_BODY)
    assert (response.status_code, response.json()["detail"]) == (409, "profile_required")
    chain.assert_not_called()
