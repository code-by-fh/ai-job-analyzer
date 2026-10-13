import os

# Point the app at a throwaway SQLite DB *before* importing database.core,
# so importing it never tries to reach the real Postgres at import time.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
# Set SECRET_KEY for auth module before importing main app
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
# Modules that open a Redis client at import time fail fast on a closed local
# port instead of waiting for the compose hostname to time out in DNS.
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://127.0.0.1:1/0")

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.core import Base
from tests.factories import PUBLIC_TEST_ADDRESS, make_user

_MODULES_WITH_OWN_SESSIONS = ("routers.jobs", "routers.dashboard", "routers.templates")


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """No test reaches real DNS: host names resolve to one public address unless a test patches _resolve."""
    monkeypatch.setattr("core.url_safety._resolve", lambda host: [PUBLIC_TEST_ADDRESS])


@pytest.fixture()
def db_session():
    """In-memory SQLite session with all tables created from the ORM metadata."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def session_factory():
    """Session factory over one shared in-memory SQLite connection.

    Routers and Celery tasks open their own sessions via SessionLocal(); patching
    that name with this factory lets them see the rows a test seeded.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        yield sessionmaker(bind=engine, autoflush=False, autocommit=False)
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _enforce_foreign_keys(dbapi_connection, connection_record):
    # SQLite ignores foreign keys unless asked per connection; PostgreSQL always enforces them.
    dbapi_connection.execute("PRAGMA foreign_keys=ON")


@pytest.fixture()
def strict_session_factory():
    """Like session_factory, but foreign keys are enforced, so a delete in the wrong order fails as on PostgreSQL."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", _enforce_foreign_keys)
    Base.metadata.create_all(engine)
    try:
        yield sessionmaker(bind=engine, autoflush=False, autocommit=False)
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def seed(session_factory):
    """Return a function that persists the given rows in one committed session."""
    def _seed(*rows):
        with session_factory() as db:
            db.add_all(rows)
            db.commit()
    return _seed


@pytest.fixture()
def fresh_rate_limits():
    """The limiter counts per process: reset it so calls in one test never count against another."""
    from routers.deps import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture()
def fake_redis():
    """Redis stand-in: no crawl is cancelled, counters read as 1, keys and hashes are empty."""
    client = MagicMock()
    client.exists.side_effect = lambda key: not key.endswith(":cancelled")
    client.hincrby.return_value = 1
    client.llen.return_value = 1
    client.get.return_value = None
    client.hget.return_value = None
    client.hgetall.return_value = {}
    return client


@pytest.fixture()
def api_client(session_factory, seed, monkeypatch):
    """TestClient for the main app on the in-memory DB, authenticated as TEST_USER_ID."""
    from core.auth import get_current_user, get_db
    from main import app

    for module in _MODULES_WITH_OWN_SESSIONS:
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)
    seed(make_user())

    def _get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = lambda: make_user()
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
