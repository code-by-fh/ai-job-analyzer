"""platform_runs rows go with their platform, also on the bulk deletes that bypass the ORM (PostgreSQL enforces the FK)."""

import importlib.util
import io
from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient

from core.auth import get_current_admin_user, get_current_user, get_password_hash
from database.core import (
    CompanyProfile, DocumentTemplate, JobEntry, JobPlatform, NotificationTemplate, PlatformRun, ProfileDocument,
    User, UserProfile,
)
from tests.factories import OTHER_USER_ID, TEST_PLATFORM_ID, TEST_USER_ID, make_job, make_platform

# The wipe and the reset are rate limited per process.
pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
PASSWORD = "correct-horse-4711"
PASSWORD_HASH = get_password_hash(PASSWORD)
REFERENCED_DOMAIN = "kept.example"
UNREFERENCED_DOMAIN = "gone.example"
RUN_FINISHED_AT = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
PLATFORM_RUNS_MIGRATION = (
    Path(__file__).resolve().parents[1] / "database" / "migrations" / "versions" / "v4w5x6y7z8a9_add_platform_runs.py"
)


def _admin() -> User:
    return User(id=TEST_USER_ID, username="admin", is_admin=True, token_version=0, hashed_password=PASSWORD_HASH)


@pytest.fixture()
def strict_client(strict_session_factory, monkeypatch):
    from main import app

    monkeypatch.setattr("routers.auth.SessionLocal", strict_session_factory)
    monkeypatch.setattr("routers.admin.SessionLocal", strict_session_factory)
    app.dependency_overrides[get_current_user] = _admin
    app.dependency_overrides[get_current_admin_user] = _admin
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_admin_user, None)


def _seed_platform_with_run(session_factory, owner_id: int) -> None:
    with session_factory() as db:
        db.add_all([_admin(), User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0)])
        db.flush()
        db.add(make_platform(user_id=owner_id))
        db.flush()
        db.add(PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=RUN_FINISHED_AT))
        db.commit()


def test_the_run_foreign_key_cascades_on_platform_delete():
    [foreign_key] = PlatformRun.__table__.c.platform_id.foreign_keys
    assert foreign_key.ondelete == "CASCADE"


@pytest.mark.parametrize("method,path,body,owner_id", [
    ("DELETE", f"/users/{OTHER_USER_ID}", None, OTHER_USER_ID),
    ("DELETE", "/user/reset", {"password": PASSWORD}, TEST_USER_ID),
    ("POST", "/admin/database/wipe", {"password": PASSWORD, "wipe_all_users": True}, OTHER_USER_ID),
    ("POST", "/admin/database/wipe", {"password": PASSWORD, "wipe_all_users": False}, TEST_USER_ID),
])
def test_bulk_platform_deletes_take_the_runs_along(strict_client, strict_session_factory, method, path, body, owner_id):
    _seed_platform_with_run(strict_session_factory, owner_id)
    response = strict_client.request(method, path, json=body)
    with strict_session_factory() as db:
        remaining = (db.query(JobPlatform).count(), db.query(PlatformRun).count())
    assert (response.status_code, remaining) == (200, (0, 0))


def _postgres_upgrade_sql() -> str:
    spec = importlib.util.spec_from_file_location("platform_runs_migration", PLATFORM_RUNS_MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    buffer = io.StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": buffer})
    with Operations.context(context):
        migration.upgrade()
    return buffer.getvalue()


def test_the_migration_creates_the_run_foreign_key_with_cascade_on_postgresql():
    assert "REFERENCES job_platforms (id) ON DELETE CASCADE" in _postgres_upgrade_sql()


def _own_wipe(client):
    return client.post("/admin/database/wipe", json={"password": PASSWORD, "wipe_all_users": False})


def test_the_own_wipe_detaches_another_accounts_job_on_the_admins_source(strict_client, strict_session_factory):
    _seed_platform_with_run(strict_session_factory, TEST_USER_ID)
    with strict_session_factory() as db:
        db.add(make_job(id="foreign", user_id=OTHER_USER_ID, platform_id=TEST_PLATFORM_ID))
        db.commit()
    response = _own_wipe(strict_client)
    with strict_session_factory() as db:
        kept = db.get(JobEntry, "foreign")
        assert (response.status_code, kept.platform_id, db.query(JobPlatform).count()) == (200, None, 0)


def test_the_own_wipe_deletes_unreferenced_profiles_next_to_a_job_without_domain(strict_client, strict_session_factory):
    _seed_platform_with_run(strict_session_factory, TEST_USER_ID)
    with strict_session_factory() as db:
        db.add_all([
            make_job(id="no-domain", user_id=OTHER_USER_ID, company_domain=None),
            make_job(id="referenced", user_id=OTHER_USER_ID, company_domain=REFERENCED_DOMAIN),
            CompanyProfile(domain=REFERENCED_DOMAIN, name="Referenced"),
            CompanyProfile(domain=UNREFERENCED_DOMAIN, name="Unreferenced"),
        ])
        db.commit()
    response = _own_wipe(strict_client)
    with strict_session_factory() as db:
        domains = {domain for (domain,) in db.query(CompanyProfile.domain)}
    assert (response.status_code, domains) == (200, {REFERENCED_DOMAIN})


def _seed_profile_data(session_factory) -> None:
    with session_factory() as db:
        db.add_all([
            ProfileDocument(user_id=user_id, doc_type="REFERENCE", filename="db://p", original_filename="p.pdf")
            for user_id in (TEST_USER_ID, OTHER_USER_ID)
        ] + [
            DocumentTemplate(user_id=user_id, doc_type="CV", name="cv", html="<p>cv</p>")
            for user_id in (TEST_USER_ID, OTHER_USER_ID)
        ] + [
            NotificationTemplate(user_id=user_id, name="n", type="PUSHOVER", content="c")
            for user_id in (TEST_USER_ID, OTHER_USER_ID)
        ] + [
            NotificationTemplate(user_id=None, is_admin=True, name="system", type="PUSHOVER", content="c"),
            UserProfile(user_id=TEST_USER_ID),
            UserProfile(user_id=OTHER_USER_ID),
        ])
        db.commit()


def _profile_rows(session_factory) -> dict:
    with session_factory() as db:
        return {
            "proofs": sorted(user_id for (user_id,) in db.query(ProfileDocument.user_id)),
            "cv_templates": sorted(user_id for (user_id,) in db.query(DocumentTemplate.user_id)),
            "notification_templates": sorted(
                -1 if user_id is None else user_id for (user_id,) in db.query(NotificationTemplate.user_id)
            ),
            "profiles": sorted(user_id for (user_id,) in db.query(UserProfile.user_id)),
            "users": db.query(User).count(),
        }


def test_the_own_wipe_deletes_the_admins_profile_data_and_keeps_the_others(strict_client, strict_session_factory):
    _seed_platform_with_run(strict_session_factory, TEST_USER_ID)
    _seed_profile_data(strict_session_factory)
    response = _own_wipe(strict_client)
    assert (response.status_code, _profile_rows(strict_session_factory)) == (200, {
        "proofs": [OTHER_USER_ID],
        "cv_templates": [OTHER_USER_ID],
        "notification_templates": [-1, OTHER_USER_ID],
        "profiles": [OTHER_USER_ID],
        "users": 2,
    })


def test_the_all_wipe_deletes_every_users_profile_data_and_keeps_accounts_and_admin_templates(
    strict_client, strict_session_factory
):
    _seed_platform_with_run(strict_session_factory, OTHER_USER_ID)
    _seed_profile_data(strict_session_factory)
    with strict_session_factory() as db:
        db.add(CompanyProfile(domain=REFERENCED_DOMAIN, name="Referenced"))
        db.commit()
    response = strict_client.post("/admin/database/wipe", json={"password": PASSWORD, "wipe_all_users": True})
    with strict_session_factory() as db:
        profiles = db.query(CompanyProfile).count()
    assert (response.status_code, profiles, _profile_rows(strict_session_factory)) == (200, 0, {
        "proofs": [], "cv_templates": [], "notification_templates": [-1], "profiles": [], "users": 2,
    })
