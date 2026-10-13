"""Account: archive-all scope, a reset without foreign-key errors, the password floor, storage status.

Every test here runs on SQLite with foreign keys enforced, as PostgreSQL does.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
import redis
from fastapi.testclient import TestClient

from core.auth import (
    create_access_token, create_refresh_token, get_current_admin_user, get_current_user, get_password_hash,
    token_claims, verify_password,
)
from database.core import (
    DocumentTemplate, JobDocument, JobEntry, JobPlatform, JobStatusHistory, NotificationTemplate,
    PlatformRun, ProfileDocument, User, UserProfile,
)
from routers.auth import BCRYPT_MAX_PASSWORD_BYTES, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH
from services.user_data import delete_user
from tests.factories import (
    OTHER_USER_ID, TEST_USER_ID, make_job, make_platform, make_profile, make_profile_document, make_template,
    make_user,
)

PASSWORD = "richtig-langes-passwort"
WRONG_PASSWORD = "falsch-falsch"
RESET_LIMIT = 5
RUN_FINISHED_AT = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
UMLAUT = "ä"  # two bytes in UTF-8
NEW_PASSWORD = "ein-ganz-neues-passwort"
SESSION_COOKIES = ("access_token", "refresh_token")
PASSWORD_CHECK_LIMIT = 5
FIRST_ADDRESS = "198.51.100.1"
SECOND_ADDRESS = "198.51.100.2"
CLIENT_PORT = 50000


@pytest.fixture()
def session_factory(strict_session_factory):
    """Overrides the conftest factory so api_client and seed use the foreign-key enforcing database."""
    return strict_session_factory


@pytest.fixture(autouse=True)
def crawl_registry(monkeypatch):
    """The scraper's Redis bookkeeping: no lock held and no crawl registered unless a test says so."""
    registry = MagicMock()
    registry.exists.return_value = False
    registry.smembers.return_value = set()
    monkeypatch.setattr("routers.platforms._crawl_redis", lambda: registry)
    return registry


@pytest.fixture()
def own_sessions(monkeypatch, session_factory):
    for module in ("routers.auth", "routers.storage"):
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)


@pytest.fixture()
def with_password(session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(PASSWORD)
        db.commit()


@pytest.fixture()
def as_admin():
    from main import app

    app.dependency_overrides[get_current_admin_user] = lambda: User(
        id=TEST_USER_ID, username="admin", is_admin=True, token_version=0
    )
    yield
    app.dependency_overrides.pop(get_current_admin_user, None)


def _jobs(session_factory):
    with session_factory() as db:
        return {job.id: (job.is_archived, job.archive_reason) for job in db.query(JobEntry).all()}


def test_archive_all_archives_open_matches_and_keeps_applications(api_client, seed, session_factory):
    seed(
        make_job(id="open"), make_job(id="fav", is_favorite=True), make_job(id="drafted", status="DRAFTED"),
        make_job(id="generating", status="GENERATING"), make_job(id="applied", status="APPLIED"),
    )
    response = api_client.delete("/jobs", params={"keep_favorites": True, "keep_applications": True})
    assert response.json() == {"status": "archived", "count": 1}
    jobs = _jobs(session_factory)
    assert jobs["open"] == (True, "USER")
    assert [jobs[kept][0] for kept in ("fav", "drafted", "generating", "applied")] == [False] * 4


def test_archive_all_never_touches_seen_placeholders(api_client, seed, session_factory):
    seed(make_job(id="seen", status="SEEN"))
    response = api_client.delete("/jobs", params={"keep_favorites": False, "keep_applications": False})
    assert response.json()["count"] == 0
    assert _jobs(session_factory)["seen"][0] is False


def test_archive_all_archives_a_job_without_status(api_client, seed, session_factory):
    seed(make_job(id="legacy"))
    with session_factory() as db:
        # The column default fills in OPEN on insert; a legacy row with NULL needs an explicit update.
        db.query(JobEntry).filter(JobEntry.id == "legacy").update({"status": None})
        db.commit()
    response = api_client.delete("/jobs", params={"keep_favorites": True, "keep_applications": True})
    assert response.json()["count"] == 1
    assert _jobs(session_factory)["legacy"] == (True, "USER")


def test_permanent_delete_takes_history_and_documents_along(api_client, seed, session_factory):
    seed(make_job(id="gone", is_archived=True, archive_reason="USER"))
    seed(
        JobStatusHistory(job_id="gone", from_status="OPEN", to_status="DRAFTED", changed_by=TEST_USER_ID),
        JobDocument(job_id="gone", user_id=TEST_USER_ID, filename="db://cv.pdf", original_filename="cv.pdf"),
    )
    params = {"keep_favorites": False, "keep_applications": False, "permanent": True}
    response = api_client.delete("/jobs", params=params)
    assert (response.status_code, response.json()) == (200, {"status": "deleted", "count": 1})
    assert [_count(session_factory, model) for model in (JobEntry, JobStatusHistory, JobDocument)] == [0, 0, 0]


def _owned_rows(user_id: int, job_id: str, platform_id: int) -> list:
    return [
        make_platform(id=platform_id, user_id=user_id),
        PlatformRun(platform_id=platform_id, finished_at=RUN_FINISHED_AT),
        make_job(id=job_id, user_id=user_id, platform_id=platform_id),
        JobStatusHistory(job_id=job_id, from_status="OPEN", to_status="DRAFTED", changed_by=user_id),
        JobDocument(job_id=job_id, user_id=user_id, filename="db://cv.pdf", original_filename="cv.pdf"),
        make_profile(user_id=user_id),
        make_profile_document(user_id=user_id, id=900 + user_id),
        make_template(user_id=user_id, id=800 + user_id),
        NotificationTemplate(name="Meine", type="PUSHOVER", content="x", user_id=user_id, is_admin=False),
    ]


def _count(session_factory, model, **filters) -> int:
    with session_factory() as db:
        return db.query(model).filter_by(**filters).count()


def _seed_two_accounts(seed) -> None:
    seed(User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0))
    seed(*_owned_rows(TEST_USER_ID, "mine", 1))
    seed(*_owned_rows(OTHER_USER_ID, "theirs", 2))


@pytest.fixture()
def two_accounts(api_client, seed):
    """api_client has seeded TEST_USER_ID; the other account and both owners' rows follow."""
    _seed_two_accounts(seed)


OWNED_MODELS = (JobEntry, JobPlatform, UserProfile, ProfileDocument, DocumentTemplate, NotificationTemplate, JobDocument)


def test_reset_removes_dependent_rows_first(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts
):
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 200
    assert response.json() == {
        "status": "reset complete", "jobs_deleted": 1, "platforms_deleted": 1, "profile_deleted": True,
    }
    assert [_count(session_factory, model, user_id=TEST_USER_ID) for model in OWNED_MODELS] == [0] * 7
    assert [_count(session_factory, model, user_id=OTHER_USER_ID) for model in OWNED_MODELS] == [1] * 7
    assert _count(session_factory, JobStatusHistory, job_id="mine") == 0
    assert _count(session_factory, JobStatusHistory, job_id="theirs") == 1
    assert _count(session_factory, PlatformRun, platform_id=1) == 0
    assert _count(session_factory, PlatformRun, platform_id=2) == 1
    assert _count(session_factory, User, id=TEST_USER_ID) == 1


def test_permanent_delete_keeps_other_accounts_archived_jobs(api_client, seed, session_factory):
    seed(User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0))
    seed(
        make_job(id="mine", is_archived=True, archive_reason="USER"),
        make_job(id="theirs", user_id=OTHER_USER_ID, is_archived=True, archive_reason="USER"),
    )
    params = {"keep_favorites": False, "keep_applications": False, "permanent": True}
    assert api_client.delete("/jobs", params=params).json() == {"status": "deleted", "count": 1}
    assert _count(session_factory, JobEntry, id="theirs") == 1


def test_reset_detaches_foreign_jobs_from_own_sources(
    api_client, seed, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts
):
    seed(make_job(id="foreign", user_id=OTHER_USER_ID, platform_id=1))
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 200
    with session_factory() as db:
        assert db.get(JobEntry, "foreign").platform_id is None
    assert _count(session_factory, JobPlatform, user_id=TEST_USER_ID) == 0


def test_reset_refuses_while_a_crawl_runs(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts, crawl_registry
):
    crawl_registry.exists.return_value = True
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 409
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 1


def test_reset_refuses_while_a_registered_crawl_without_source_runs(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts, crawl_registry
):
    crawl_registry.smembers.return_value = {b"crawl-1"}
    crawl_registry.exists.side_effect = lambda key: key == "crawl_job:crawl-1"
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 409
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 1


def test_reset_ignores_a_stale_registered_crawl(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts, crawl_registry
):
    crawl_registry.smembers.return_value = {b"crawl-1"}
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 200
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 0


def test_reset_proceeds_when_the_crawl_registry_is_unreachable(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, two_accounts, crawl_registry
):
    crawl_registry.exists.side_effect = redis.ConnectionError("down")
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 200
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 0


def test_reset_with_a_wrong_password_deletes_nothing(
    api_client, seed, session_factory, own_sessions, fresh_rate_limits, with_password
):
    seed(make_job(id="mine"))
    response = api_client.request("DELETE", "/user/reset", json={"password": WRONG_PASSWORD})
    assert response.status_code == 400
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 1


def test_reset_is_rate_limited(api_client, seed, session_factory, own_sessions, fresh_rate_limits, with_password):
    seed(make_job(id="mine"))
    statuses = [
        api_client.request("DELETE", "/user/reset", json={"password": WRONG_PASSWORD}).status_code
        for _ in range(RESET_LIMIT + 1)
    ]
    assert statuses == [400] * RESET_LIMIT + [429]
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 1


def test_delete_user_removes_the_account_and_keeps_others_history(session_factory, seed):
    seed(make_user())
    _seed_two_accounts(seed)
    with session_factory() as db:
        db.add(JobStatusHistory(job_id="theirs", from_status="DRAFTED", to_status="APPLIED", changed_by=TEST_USER_ID))
        db.commit()
    with session_factory() as db:
        delete_user(db, TEST_USER_ID)
        db.commit()
    assert _count(session_factory, User, id=TEST_USER_ID) == 0
    assert _count(session_factory, JobEntry, user_id=OTHER_USER_ID) == 1
    assert _count(session_factory, JobStatusHistory, job_id="theirs") == 2


@pytest.mark.parametrize("new_password", [
    "", "x" * (MIN_PASSWORD_LENGTH - 1), "x" * (MAX_PASSWORD_LENGTH + 1), "x" * (BCRYPT_MAX_PASSWORD_BYTES + 1),
    UMLAUT * (BCRYPT_MAX_PASSWORD_BYTES // 2 + 1),
])
def test_password_change_refuses_out_of_bounds(
    api_client, own_sessions, fresh_rate_limits, with_password, new_password
):
    response = api_client.post(
        "/auth/change-password", json={"current_password": PASSWORD, "new_password": new_password}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "new_password"]
    assert PASSWORD not in response.text


def test_a_password_beyond_the_bcrypt_bytes_is_refused_without_echo(
    api_client, own_sessions, fresh_rate_limits, with_password
):
    too_long = UMLAUT * (BCRYPT_MAX_PASSWORD_BYTES // 2 + 1)
    response = api_client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": too_long})
    assert response.json()["detail"][0]["loc"] == ["body", "new_password"]
    assert too_long not in response.text


@pytest.mark.parametrize("new_password", [
    "a" * MIN_PASSWORD_LENGTH, "b" * BCRYPT_MAX_PASSWORD_BYTES, UMLAUT * (BCRYPT_MAX_PASSWORD_BYTES // 2),
])
def test_password_change_accepts_the_bounds(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, new_password
):
    response = api_client.post(
        "/auth/change-password", json={"current_password": PASSWORD, "new_password": new_password}
    )
    assert response.status_code == 200
    with session_factory() as db:
        assert verify_password(new_password, db.get(User, TEST_USER_ID).hashed_password)


def test_new_user_password_below_the_floor_is_refused(api_client, own_sessions, as_admin):
    short = "k" * (MIN_PASSWORD_LENGTH - 1)
    response = api_client.post("/users", json={"username": "neu", "password": short})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "password"]
    assert short not in response.text


def test_new_user_password_at_the_floor_is_accepted(api_client, session_factory, own_sessions, as_admin):
    response = api_client.post("/users", json={"username": "neu", "password": "k" * MIN_PASSWORD_LENGTH})
    assert response.status_code == 200
    assert _count(session_factory, User, username="neu") == 1


def test_storage_status_reports_availability_without_secrets(api_client, seed, own_sessions, monkeypatch):
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_SECRET", "client-secret")
    seed(make_profile(google_drive_refresh_token="DRIVE_SECRET", google_drive_email="me@example.com",
                      active_storage_service="GOOGLE_DRIVE"))
    response = api_client.get("/storage/status")
    assert response.json() == {"available": True, "connected": True, "active": "GOOGLE_DRIVE", "email": "me@example.com"}
    assert "DRIVE_SECRET" not in response.text and "client-secret" not in response.text


def test_storage_status_without_server_configuration(api_client, own_sessions, monkeypatch):
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", None)
    response = api_client.get("/storage/status")
    assert response.json() == {"available": False, "connected": False, "active": "NONE", "email": None}


def _tokens(user_id: int = TEST_USER_ID) -> dict:
    data = token_claims(make_user(user_id))
    return {"access_token": create_access_token(data), "refresh_token": create_refresh_token(data)}


def _use_cookies(client, cookies: dict) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


def _change_password(client, current_password: str):
    return client.post(
        "/auth/change-password", json={"current_password": current_password, "new_password": NEW_PASSWORD}
    )


@pytest.fixture()
def real_auth(api_client):
    """Drops api_client's user override, so the access cookie and its token version decide who calls."""
    from main import app

    app.dependency_overrides.pop(get_current_user, None)


def test_a_password_change_revokes_the_old_access_token(
    api_client, own_sessions, fresh_rate_limits, with_password, real_auth
):
    old = _tokens()
    _use_cookies(api_client, old)
    assert _change_password(api_client, PASSWORD).status_code == 200
    _use_cookies(api_client, old)
    assert api_client.get("/me").status_code == 401


def test_a_password_change_revokes_the_old_refresh_token(
    api_client, own_sessions, fresh_rate_limits, with_password, real_auth
):
    old = _tokens()
    _use_cookies(api_client, old)
    assert _change_password(api_client, PASSWORD).status_code == 200
    _use_cookies(api_client, old)
    assert api_client.post("/auth/refresh").status_code == 401


def test_a_password_change_issues_working_session_cookies(
    api_client, own_sessions, fresh_rate_limits, with_password, real_auth
):
    _use_cookies(api_client, _tokens())
    response = _change_password(api_client, PASSWORD)
    _use_cookies(api_client, {name: response.cookies[name] for name in SESSION_COOKIES})
    assert api_client.get("/me").status_code == 200
    assert api_client.post("/auth/refresh").status_code == 200


def test_a_wrong_current_password_keeps_the_sessions(
    api_client, session_factory, own_sessions, fresh_rate_limits, with_password, real_auth
):
    _use_cookies(api_client, _tokens())
    assert _change_password(api_client, WRONG_PASSWORD).status_code == 400
    with session_factory() as db:
        assert db.get(User, TEST_USER_ID).token_version == 0
    assert api_client.get("/me").status_code == 200


def _client_from(address: str) -> TestClient:
    from main import app

    return TestClient(app, client=(address, CLIENT_PORT))


def _wrong_password_change(client) -> int:
    return _change_password(client, WRONG_PASSWORD).status_code


def _wrong_password_reset(client) -> int:
    return client.request("DELETE", "/user/reset", json={"password": WRONG_PASSWORD}).status_code


PASSWORD_CHECKS = [_wrong_password_change, _wrong_password_reset]


@pytest.mark.parametrize("attempt", PASSWORD_CHECKS)
def test_password_checks_count_per_account_across_addresses(
    api_client, own_sessions, fresh_rate_limits, with_password, attempt
):
    first, second = _client_from(FIRST_ADDRESS), _client_from(SECOND_ADDRESS)
    _use_cookies(first, _tokens())
    _use_cookies(second, _tokens())
    statuses = [attempt(first) for _ in range(PASSWORD_CHECK_LIMIT)] + [attempt(second)]
    assert statuses == [400] * PASSWORD_CHECK_LIMIT + [429]


@pytest.mark.parametrize("attempt", PASSWORD_CHECKS)
def test_password_checks_of_two_accounts_on_one_address_count_apart(
    api_client, own_sessions, fresh_rate_limits, with_password, attempt
):
    _use_cookies(api_client, _tokens())
    statuses = [attempt(api_client) for _ in range(PASSWORD_CHECK_LIMIT)]
    _use_cookies(api_client, _tokens(OTHER_USER_ID))
    assert statuses + [attempt(api_client)] == [400] * (PASSWORD_CHECK_LIMIT + 1)
