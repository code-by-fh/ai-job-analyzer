import os

# Point the app at a throwaway SQLite DB *before* importing database.core,
# so importing it never tries to reach the real Postgres at import time.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
# Set SECRET_KEY for auth module before importing main app
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.core import Base


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
