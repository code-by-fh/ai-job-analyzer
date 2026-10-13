"""Admin user management: bounded creation, fixed 409 codes, and a guarded delete through `delete_user`.

Every test here runs on SQLite with foreign keys enforced, as PostgreSQL does.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
import redis

from core.auth import get_current_admin_user
from database.core import JobEntry, JobPlatform, JobStatusHistory, PlatformRun, User, UserProfile
from main import app
from routers.auth import (
    BCRYPT_MAX_PASSWORD_BYTES, CANNOT_DELETE_ADMIN, CANNOT_DELETE_SELF, MAX_PASSWORD_LENGTH,
    MAX_USERNAME_LENGTH, MAX_USERS_PAGE, MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH, USERNAME_TAKEN,
)
from routers.deps import CRAWL_RUNNING
from tests.factories import (
    OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, make_job, make_platform, make_profile, make_template,
)

ADMIN = User(id=TEST_USER_ID, username="root", is_admin=True, token_version=0)
PASSWORD = "lang-genug"
UMLAUT = "ä"  # two bytes in UTF-8
UNKNOWN_USER_ID = 999
RUN_FINISHED_AT = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
MEMBER_REQUESTS = [
    ("GET", "/users", None),
    ("POST", "/users", {"username": "jonas", "password": PASSWORD}),
    ("DELETE", f"/users/{OTHER_USER_ID}", None),
]


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
    connect = MagicMock(return_value=registry)
    monkeypatch.setattr("routers.platforms._crawl_redis", connect)
    return connect


@pytest.fixture()
def member(api_client, monkeypatch, session_factory):
    monkeypatch.setattr("routers.auth.SessionLocal", session_factory)
    return api_client


@pytest.fixture()
def admin(member):
    app.dependency_overrides[get_current_admin_user] = lambda: ADMIN
    yield member
    app.dependency_overrides.pop(get_current_admin_user, None)


@pytest.fixture()
def other_member(seed):
    seed(User(id=OTHER_USER_ID, username="member", is_admin=False, token_version=0))


def _user_exists(session_factory, user_id: int) -> bool:
    with session_factory() as db:
        return db.get(User, user_id) is not None


@pytest.mark.parametrize("body,field", [
    ({"username": "u" * (MIN_USERNAME_LENGTH - 1), "password": PASSWORD}, "username"),
    ({"username": "jo nas", "password": PASSWORD}, "username"),
    ({"username": "jonas<script>", "password": PASSWORD}, "username"),
    ({"username": "u" * (MAX_USERNAME_LENGTH + 1), "password": PASSWORD}, "username"),
    ({"username": "   ab   ", "password": PASSWORD}, "username"),
    ({"username": "jonas", "password": "k" * (MIN_PASSWORD_LENGTH - 1)}, "password"),
    ({"username": "jonas", "password": "k" * (MAX_PASSWORD_LENGTH + 1)}, "password"),
    ({"username": "jonas", "password": UMLAUT * (BCRYPT_MAX_PASSWORD_BYTES // 2 + 1)}, "password"),
])
def test_create_user_is_bounded(admin, session_factory, body, field):
    response = admin.post("/users", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert body["password"] not in response.text
    with session_factory() as db:
        assert db.query(User).count() == 1


@pytest.mark.parametrize("username", [
    "u" * MIN_USERNAME_LENGTH, "u" * MAX_USERNAME_LENGTH, "Jo.Nas_1@firma-x.de",
])
def test_create_user_accepts_the_bounds(admin, username):
    response = admin.post("/users", json={"username": username, "password": PASSWORD})
    assert (response.status_code, response.json()["username"], response.json()["is_admin"]) == (200, username, False)
    assert PASSWORD not in response.text


def test_create_user_stores_the_stripped_name(admin, session_factory):
    response = admin.post("/users", json={"username": "  jonas  ", "password": PASSWORD})
    with session_factory() as db:
        stored = db.query(User).filter(User.id == response.json()["id"]).one()
    assert (response.json()["username"], stored.username) == ("jonas", "jonas")


def test_duplicate_username_is_409_with_a_code(admin):
    admin.post("/users", json={"username": "jonas", "password": PASSWORD})
    response = admin.post("/users", json={"username": "jonas", "password": PASSWORD})
    assert (response.status_code, response.json()) == (409, {"detail": USERNAME_TAKEN})


def test_a_name_differing_only_in_case_is_taken(admin, session_factory):
    admin.post("/users", json={"username": "jonas", "password": PASSWORD})
    response = admin.post("/users", json={"username": "Jonas", "password": PASSWORD})
    assert (response.status_code, response.json()) == (409, {"detail": USERNAME_TAKEN})
    with session_factory() as db:
        assert [user.username for user in db.query(User).filter(User.id != TEST_USER_ID)] == ["jonas"]


def test_a_duplicate_that_slips_past_the_check_is_409(admin, seed, monkeypatch):
    """Two creates racing: both pass the check, and the unique index refuses the second insert."""
    seed(User(id=OTHER_USER_ID, username="jonas", is_admin=False, token_version=0))
    monkeypatch.setattr("routers.auth._username_taken", lambda db, username: False)
    response = admin.post("/users", json={"username": "jonas", "password": PASSWORD})
    assert (response.status_code, response.json()) == (409, {"detail": USERNAME_TAKEN})


@pytest.mark.parametrize("query,field", [
    ("skip=-1", "skip"), ("limit=0", "limit"), (f"limit={MAX_USERS_PAGE + 1}", "limit"),
])
def test_the_user_list_page_is_bounded(admin, query, field):
    response = admin.get(f"/users?{query}")
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", field]


def test_the_user_list_accepts_the_largest_page(admin):
    assert admin.get(f"/users?limit={MAX_USERS_PAGE}").status_code == 200


def test_cannot_delete_self(admin, session_factory):
    response = admin.delete(f"/users/{TEST_USER_ID}")
    assert (response.status_code, response.json()) == (409, {"detail": CANNOT_DELETE_SELF})
    assert _user_exists(session_factory, TEST_USER_ID)


def test_cannot_delete_an_admin(admin, seed, session_factory):
    seed(User(id=OTHER_USER_ID, username="chef", is_admin=True, token_version=0))
    response = admin.delete(f"/users/{OTHER_USER_ID}")
    assert (response.status_code, response.json()) == (409, {"detail": CANNOT_DELETE_ADMIN})
    assert _user_exists(session_factory, OTHER_USER_ID)


def test_deleting_an_unknown_user_is_404(admin):
    assert admin.delete(f"/users/{UNKNOWN_USER_ID}").status_code == 404


def test_cannot_delete_a_user_while_their_crawl_runs(admin, other_member, session_factory, monkeypatch):
    monkeypatch.setattr("routers.platforms.any_crawl_running", lambda user_id, platform_ids: True)
    response = admin.delete(f"/users/{OTHER_USER_ID}")
    assert (response.status_code, response.json()) == (409, {"detail": CRAWL_RUNNING})
    assert _user_exists(session_factory, OTHER_USER_ID)


def test_a_held_lock_on_the_targets_source_refuses_the_delete(admin, other_member, seed, crawl_registry):
    seed(make_platform(user_id=OTHER_USER_ID))
    crawl_registry.return_value.exists.side_effect = lambda key: str(TEST_PLATFORM_ID) in key
    response = admin.delete(f"/users/{OTHER_USER_ID}")
    assert (response.status_code, response.json()) == (409, {"detail": CRAWL_RUNNING})


def test_the_delete_proceeds_when_the_crawl_registry_is_unreachable(
    admin, other_member, session_factory, crawl_registry
):
    crawl_registry.return_value.smembers.side_effect = redis.ConnectionError("down")
    response = admin.delete(f"/users/{OTHER_USER_ID}")
    assert (response.status_code, crawl_registry.call_count) == (200, 1)
    assert not _user_exists(session_factory, OTHER_USER_ID)


def _seed_owned_rows(session_factory) -> None:
    with session_factory() as db:
        db.add_all([
            make_platform(user_id=OTHER_USER_ID), make_profile(user_id=OTHER_USER_ID),
            make_template(user_id=OTHER_USER_ID), make_job(id="mine"),
        ])
        db.flush()
        db.add_all([
            PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=RUN_FINISHED_AT),
            make_job(id="theirs", user_id=OTHER_USER_ID, platform_id=TEST_PLATFORM_ID),
        ])
        db.flush()
        db.add_all([
            JobStatusHistory(job_id="theirs", from_status="OPEN", to_status="DRAFTED", changed_by=OTHER_USER_ID),
            JobStatusHistory(job_id="mine", from_status="OPEN", to_status="DRAFTED", changed_by=OTHER_USER_ID),
        ])
        db.commit()


def test_delete_user_removes_owned_rows(admin, other_member, session_factory):
    _seed_owned_rows(session_factory)
    assert admin.delete(f"/users/{OTHER_USER_ID}").json() == {"status": "deleted"}
    with session_factory() as db:
        assert db.get(User, OTHER_USER_ID) is None
        assert [db.query(model).count() for model in (JobPlatform, PlatformRun, UserProfile)] == [0, 0, 0]
        assert [job.id for job in db.query(JobEntry)] == ["mine"]
        assert [(row.job_id, row.changed_by) for row in db.query(JobStatusHistory)] == [("mine", None)]


def test_users_are_listed_by_name(admin, seed):
    seed(User(id=OTHER_USER_ID, username="anna", is_admin=False, token_version=0))
    names = [user["username"] for user in admin.get("/users").json()]
    assert names == ["anna", f"user{TEST_USER_ID}"]


@pytest.mark.parametrize("method,path,body", MEMBER_REQUESTS)
def test_every_user_route_refuses_a_member(member, other_member, session_factory, method, path, body):
    response = member.request(method, path, json=body)
    assert response.status_code == 403
    with session_factory() as db:
        assert db.query(User).count() == 2
