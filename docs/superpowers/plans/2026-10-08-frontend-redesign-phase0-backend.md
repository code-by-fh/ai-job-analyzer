# Frontend Redesign Phase 0 (Backend B1-B11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eleven backend changes (B1-B11) the new `web/` UI needs: server-validated status transitions, partial settings saves, user-scoped WebSocket events, archive reasons, threshold preview/apply, server-side job search, checklist/to-dos, a working "start now" crawl, per-platform last-run summaries, an honoured package cancel and a complete job detail.

**Architecture:** One forward Alembic migration lands all new columns first (Task 1). Job lifecycle rules (status transition table, archive/restore) live in one new pure module `server/core/job_status.py` that routers and Celery workers import. Crawl summaries are written by one new bookkeeping module `server/workers/tasks/platform_runs.py`, called from every place a crawl finishes. Everything else is a surgical edit of the existing router or task.

**Tech Stack:** Python 3.11 (prod) / 3.13 (local QA venv), FastAPI 0.135, Pydantic 2.12, SQLAlchemy 2.0, Alembic, Celery, redis-py, pytest on in-memory SQLite.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 3 is the scope; sections 4.4 and 6 explain how the UI consumes it). Current API facts: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md`, Part A.

## Global Constraints

- **Coding standards:** invoke the `coding-standards` skill before the first edit (user's global `CLAUDE.md`). Functions <= 20 lines and <= 3 parameters for new code; named constants, no magic literals; comments explain *why*, in English; no emoji anywhere; no dead code; validate every boundary input.
- **Error style:** keep FastAPI's existing shapes (`{"detail": "<string>"}` from `HTTPException`, Pydantic's 422 `{"detail": [...]}`). Do NOT introduce the per-field 400 envelope, `/api/v1` or UUID ids (spec 2.4).
- **No git:** run no git command and add no commit step. The user commits himself. Every task ends with a checkpoint that runs the full suite.
- **Surgical changes:** change only what the task needs; follow the existing style of the file you touch (e.g. `routers/jobs.py` opens `SessionLocal()` directly, `routers/settings.py` uses `Depends(get_db)`). Remove only code that your change makes unused.
- **Migrations:** written for PostgreSQL production, chained onto the single current head `q9r0s1t2u3v4` (verified: exactly one head; startup runs `command.upgrade(cfg, "heads")` in `main.py`). Tests build the schema from the models, so every column goes into both `database/core.py` and the migration.
- **Old frontend:** `frontend/` stays in the repo until phase 9 and is knowingly broken by B1 and B6 (user decision; the API may change freely). Do not patch it.
- **Run the tests exactly like this** (the QA env gives the venv, SQLite and `SECRET_KEY`; `-o addopts=""` is needed because `pytest.ini` already sets `-q`, and `-q -q` hides the "N passed" line):

  ```bash
  . /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts=""
  ```

  Append a path or node id for a subset. Baseline before Task 1: `75 passed`.

## Review Focus

1. **A job whose stored status is free text** (the removed `PATCH /jobs/{id}/update-status` accepted any string, e.g. `"Beworben"`): the user must still be able to move it to a valid status. Pinned in Task 5 (`test_legacy_free_text_status_may_move_to_any_user_state`, `test_change_status_from_legacy_value_is_allowed`).
2. **Changing the status of an archived job** (e.g. "Vormerken" from "Unter Schwellwert"): the job must come back into the active lists and stay out of later threshold runs. Pinned in Task 5 (`test_change_status_of_archived_job_restores_it`).
3. **Jobs archived before this migration** have no reason and would appear in neither inbox tab. Pinned in Task 1 (backfill tests).
4. **Saving one settings form must not wipe the other** (profile save vs. notification credentials, masked secrets sent back unchanged, explicit `null` on a profile field). Pinned in Task 8.
5. **Threshold apply must never move favourites, kept jobs, non-`OPEN` applications or another user's jobs**, and re-applying the old threshold must undo it. Pinned in Task 6.

---

## File Map

| File | Responsibility | Tasks |
|---|---|---|
| `server/database/migrations/versions/r0s1t2u3v4w5_add_redesign_phase0_columns.py` (new) | Columns `jobs.archive_reason`, `jobs.kept_by_user`, `jobs.checklist`, `jobs.todos`, `job_platforms.last_run`; backfill of `archive_reason` | 1 |
| `server/database/core.py` | ORM columns; `JobChecklist`, `JobTodo`; `JobPatchRequest` (-status/-note, +checklist/+todos); partial `SettingsData`; `PlatformResponse.last_run` | 1, 5, 7, 8, 11 |
| `server/core/job_status.py` (new) | `ArchiveReason`, archive/restore helpers and bulk values, status constants, `ALLOWED_TRANSITIONS`, `check_transition` | 4, 5, 6, 12 |
| `server/routers/jobs.py` | Job detail/list serialisers, `JobListQuery`, `POST /jobs/{id}/status`, archive reasons, checklist/todos | 2, 3, 4, 5, 7 |
| `server/routers/dashboard.py` | `/dashboard-data` excludes `SEEN` | 3 |
| `server/routers/settings.py` | Partial updates, threshold preview/apply | 6, 8 |
| `server/routers/platforms.py` | Wizard `initial_run`, `last_run` in responses | 10, 11 |
| `server/core/connection_manager.py` | Owner-only delivery, global whitelist, drop unscoped | 9 |
| `server/workers/tasks/analyze.py` | `archive_reason=THRESHOLD`, top-level `user_id`, `jobs_matched` counter | 4, 9, 11 |
| `server/workers/tasks/research.py`, `application.py`, `crawl_status.py`, `server/workers/scraper_worker.py` | Top-level `user_id` on events; last-run recording | 9, 11 |
| `server/workers/tasks/fill_cv_template.py` | `template_ready` event | 9 |
| `server/workers/tasks/platform_runs.py` (new) | Build and persist `job_platforms.last_run` | 11 |
| `server/scraper_api.py` | Store `platform_id` on the crawl hash; record failed/cancelled runs | 11 |
| `server/workers/tasks/package.py` | Discard results when no longer `GENERATING` | 12 |
| `server/tests/factories.py` (new) | Row builders and fake-Redis helpers | 1 |
| `server/tests/conftest.py` | `session_factory`, `seed`, `fake_redis`, `api_client` fixtures | 2 |
| `server/tests/test_phase0_schema.py`, `test_jobs_router.py`, `test_dashboard_router.py`, `test_job_status.py`, `test_analyze_task.py`, `test_matching_threshold.py`, `test_connection_manager.py`, `test_ws_publishers.py`, `test_platform_runs.py`, `test_scraper_api.py`, `test_package_cancel.py` (new) | Tests | 1-12 |
| `server/tests/test_settings_router.py`, `test_platforms_router.py` | Extended / adjusted for B2, B5, B8, B9 | 6, 8, 10, 11 |
| `context/progress-tracker.md`, `context/architecture.md` | Docs | 13 |

## Old-frontend callers that break (accepted, removed in phase 9)

- **B1:** `frontend/app/hooks/useJobs.ts:257` and `frontend/app/jobs/[id]/page.tsx:58` call `PATCH /jobs/{id}/update-status` (now 404). Any `PATCH /jobs/{id}` payload carrying `status` (via `onUpdateJob`) is silently ignored.
- **B6:** `frontend/app/hooks/useJobs.ts:76-97` treats the `GET /jobs` body as an array (`data.map`, `data.length`), so the Dashboard and Listings lists crash. List items also no longer carry `description`, `cv_html`, `cover_letter_html`, `application_draft`, `cv_draft`, `interview_prep_material`.
- **B8:** `frontend/app/(dashboard)/components/JobPlatforms/PlatformSetupModal.tsx:175` sends `run_initial_crawl`; it is ignored and the default `initial_run="seed"` (today's behaviour) applies, so an unchecked box now also seeds.
- Not breaking: B2 (fixes the credential wipe), B3 (old UI still receives its own events), B5 (`apply_to_existing` defaults to false).

---

### Task 1: Migration, model columns and test factories

**Files:**
- Create: `server/database/migrations/versions/r0s1t2u3v4w5_add_redesign_phase0_columns.py`
- Create: `server/tests/factories.py`
- Modify: `server/database/core.py:2-14` (import), `:66` (after `notes`), `:152` (after `url_pattern`)
- Test: `server/tests/test_phase0_schema.py`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `JobEntry.archive_reason: str|None`, `JobEntry.kept_by_user: bool` (non-null, default False), `JobEntry.checklist: JSON|None`, `JobEntry.todos: JSON|None`, `JobPlatform.last_run: JSON|None`; migration revision `r0s1t2u3v4w5` (down `q9r0s1t2u3v4`) with module constant `BACKFILL_ARCHIVE_REASON_SQL`; `tests/factories.py` with `TEST_USER_ID=501`, `OTHER_USER_ID=502`, `TEST_PLATFORM_ID=12`, `make_user(user_id=TEST_USER_ID) -> User`, `make_job(**overrides) -> JobEntry`, `make_profile(**overrides) -> UserProfile`, `make_platform(**overrides) -> JobPlatform`, `fetch(session_factory, model, key)`, `published_events(fake_redis) -> list[dict]`, `events_of_type(fake_redis, event_type) -> list[dict]`.

- [ ] **Step 1: Write the factories**

Create `server/tests/factories.py`:

```python
"""Builders for test rows and helpers for inspecting fakes, so tests carry no magic inline values."""

import json

from database.core import JobEntry, JobPlatform, User, UserProfile

TEST_USER_ID = 501
OTHER_USER_ID = 502
TEST_PLATFORM_ID = 12


def make_user(user_id: int = TEST_USER_ID) -> User:
    return User(id=user_id, username=f"user{user_id}", is_admin=False, token_version=0)


def make_job(**overrides) -> JobEntry:
    fields = {
        "id": "job-1",
        "user_id": TEST_USER_ID,
        "title": "Backend Engineer",
        "company": "Acme",
        "description": "Build APIs",
        "match_score": 80.0,
        "reasoning": "Strong Python fit",
        "status": "OPEN",
        "is_archived": False,
        "is_favorite": False,
        "kept_by_user": False,
    }
    fields.update(overrides)
    return JobEntry(**fields)


def make_profile(**overrides) -> UserProfile:
    fields = {
        "user_id": TEST_USER_ID,
        "role": "Backend Engineer",
        "skills": "Python",
        "cv_data": {"experience": [], "projects": [], "education": "BSc"},
        "match_threshold": 0,
    }
    fields.update(overrides)
    return UserProfile(**fields)


def make_platform(**overrides) -> JobPlatform:
    fields = {
        "id": TEST_PLATFORM_ID,
        "user_id": TEST_USER_ID,
        "url": "https://jobs.example.com/search",
        "name": "Example Jobs",
        "setup_status": "active",
    }
    fields.update(overrides)
    return JobPlatform(**fields)


def fetch(session_factory, model, key):
    """Load one row in a short-lived session; its loaded attributes stay readable after close."""
    with session_factory() as db:
        return db.get(model, key)


def published_events(fake_redis) -> list:
    """Decode every payload the code under test published on the job_updates channel."""
    return [json.loads(call.args[1]) for call in fake_redis.publish.call_args_list]


def events_of_type(fake_redis, event_type: str) -> list:
    return [event for event in published_events(fake_redis) if event.get("type") == event_type]
```

- [ ] **Step 2: Write the failing schema tests**

Create `server/tests/test_phase0_schema.py`:

```python
import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from database.core import JobEntry
from tests.factories import TEST_USER_ID, make_job, make_profile

SERVER_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = SERVER_DIR / "database" / "migrations"
PHASE0_REVISION = "r0s1t2u3v4w5"
PREVIOUS_HEAD = "q9r0s1t2u3v4"
THRESHOLD = 60


def _script_directory() -> ScriptDirectory:
    config = Config(str(SERVER_DIR / "database" / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    return ScriptDirectory.from_config(config)


def _backfill_sql() -> str:
    path = MIGRATIONS_DIR / "versions" / f"{PHASE0_REVISION}_add_redesign_phase0_columns.py"
    spec = importlib.util.spec_from_file_location("phase0_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL_ARCHIVE_REASON_SQL


def _run_backfill(db_session, job) -> str:
    db_session.add_all([make_profile(match_threshold=THRESHOLD), job])
    db_session.commit()
    db_session.execute(text(_backfill_sql()))
    db_session.commit()
    return db_session.get(JobEntry, job.id).archive_reason


def test_migration_chain_has_single_head_at_phase0_revision():
    assert _script_directory().get_heads() == [PHASE0_REVISION]


def test_phase0_revision_follows_previous_head():
    assert _script_directory().get_revision(PHASE0_REVISION).down_revision == PREVIOUS_HEAD


def test_backfill_marks_archived_job_below_owner_threshold_as_threshold(db_session):
    job = make_job(id="low", match_score=THRESHOLD - 1, is_archived=True)
    assert _run_backfill(db_session, job) == "THRESHOLD"


def test_backfill_marks_other_archived_jobs_as_user(db_session):
    job = make_job(id="high", match_score=THRESHOLD + 1, is_archived=True)
    assert _run_backfill(db_session, job) == "USER"


def test_backfill_leaves_active_jobs_without_reason(db_session):
    job = make_job(id="active", match_score=THRESHOLD - 1)
    assert _run_backfill(db_session, job) is None


def test_new_job_defaults_kept_by_user_to_false(db_session):
    db_session.add(JobEntry(id="plain", user_id=TEST_USER_ID))
    db_session.commit()
    assert db_session.get(JobEntry, "plain").kept_by_user is False
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_phase0_schema.py
```

Expected: FAIL. The head is still `q9r0s1t2u3v4`, `make_job` raises `TypeError: 'kept_by_user' is an invalid keyword argument for JobEntry`, and the migration file is missing.

- [ ] **Step 4: Add the model columns**

In `server/database/core.py`, extend the `sqlalchemy` import (lines 2-14) with `false`:

```python
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    Float,
    Integer,
    JSON,
    DateTime,
    Boolean,
    ForeignKey,
    LargeBinary,
    false,
)
```

In `class JobEntry`, directly after `notes = Column(Text, nullable=True)`:

```python
    archive_reason = Column(String, nullable=True)  # "THRESHOLD" | "USER", see core/job_status.py
    kept_by_user = Column(Boolean, default=False, nullable=False, server_default=false())
    checklist = Column(JSON, nullable=True)
    todos = Column(JSON, nullable=True)
```

In `class JobPlatform`, directly after `url_pattern = Column(String, nullable=True)`:

```python
    last_run = Column(JSON, nullable=True)
```

- [ ] **Step 5: Write the migration**

Create `server/database/migrations/versions/r0s1t2u3v4w5_add_redesign_phase0_columns.py`:

```python
"""add archive_reason, kept_by_user, checklist, todos to jobs and last_run to job_platforms

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = "r0s1t2u3v4w5"
down_revision = "q9r0s1t2u3v4"
branch_labels = None
depends_on = None

# Jobs archived before this migration carry no reason and would show up in
# neither inbox tab. A row scoring below its owner's active threshold was
# almost certainly archived automatically; every other archived row was
# discarded by hand.
BACKFILL_ARCHIVE_REASON_SQL = """
UPDATE jobs SET archive_reason = CASE
    WHEN EXISTS (
        SELECT 1 FROM user_settings s
        WHERE s.user_id = jobs.user_id
          AND s.match_threshold > 0
          AND jobs.match_score < s.match_threshold
    ) THEN 'THRESHOLD'
    ELSE 'USER'
END
WHERE is_archived = true
"""


def upgrade():
    op.add_column("jobs", sa.Column("archive_reason", sa.String(), nullable=True))
    op.add_column(
        "jobs",
        sa.Column("kept_by_user", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("jobs", sa.Column("checklist", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("todos", sa.JSON(), nullable=True))
    op.add_column("job_platforms", sa.Column("last_run", sa.JSON(), nullable=True))
    op.execute(BACKFILL_ARCHIVE_REASON_SQL)


def downgrade():
    op.drop_column("job_platforms", "last_run")
    op.drop_column("jobs", "todos")
    op.drop_column("jobs", "checklist")
    op.drop_column("jobs", "kept_by_user")
    op.drop_column("jobs", "archive_reason")
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_phase0_schema.py
```

Expected: `6 passed`.

- [ ] **Step 7: Checkpoint: run the full suite**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts=""
```

Expected: `81 passed`. (The migration is verified on Postgres only by the startup `upgrade heads`; if a Postgres container is at hand, run `alembic -c database/alembic.ini upgrade head` against it once and expect no error.)

---

### Task 2: Shared API test fixtures and complete job detail (B11)

**Files:**
- Modify: `server/tests/conftest.py`
- Modify: `server/routers/jobs.py:1-10` (imports), insert helpers after `class SaveHtmlRequest` (line 60-61), replace `get_single_job` (lines 176-211)
- Test: `server/tests/test_jobs_router.py` (new)

**Interfaces:**
- Consumes: Task 1 columns and factories.
- Produces: fixtures `session_factory`, `seed(*rows)`, `fake_redis`, `api_client` (authenticated as `TEST_USER_ID`; `routers.jobs.SessionLocal` and `routers.dashboard.SessionLocal` patched; `get_db` overridden). In `routers/jobs.py`: `_iso(value) -> str|None`, `_derived_job_fields(job) -> dict` (keys `created_at`, `next_follow_up_at`, `cv_html_present`, `cover_letter_html_present`), `_job_detail(job) -> dict`, `_get_owned_job(db, job_id, user_id) -> JobEntry` (404 "Job not found").

- [ ] **Step 1: Add the fixtures to `server/tests/conftest.py`**

Replace the whole file with:

```python
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
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.core import Base
from tests.factories import make_user

_MODULES_WITH_OWN_SESSIONS = ("routers.jobs", "routers.dashboard")


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


@pytest.fixture()
def seed(session_factory):
    """Return a function that persists the given rows in one committed session."""
    def _seed(*rows):
        with session_factory() as db:
            db.add_all(rows)
            db.commit()
    return _seed


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
```

- [ ] **Step 2: Write the failing detail tests**

Create `server/tests/test_jobs_router.py`:

```python
from database.core import JobEntry
from tests.factories import OTHER_USER_ID, TEST_PLATFORM_ID, fetch, make_job, make_platform, make_user

TODO = {"id": "t1", "text": "Call recruiter", "done": False}


def test_get_job_returns_redesign_fields(api_client, seed):
    seed(make_platform(), make_job(
        platform_id=TEST_PLATFORM_ID, generation_error="AI timeout", is_archived=True,
        archive_reason="USER", checklist={"sent": True}, todos=[TODO],
    ))
    body = api_client.get("/jobs/job-1").json()
    assert (body["is_archived"], body["archive_reason"], body["platform_id"]) == (True, "USER", TEST_PLATFORM_ID)
    assert (body["generation_error"], body["checklist"], body["todos"]) == ("AI timeout", {"sent": True}, [TODO])


def test_get_job_reports_document_html_presence(api_client, seed):
    seed(make_job(cv_html="<p>CV</p>", cover_letter_html=None))
    body = api_client.get("/jobs/job-1").json()
    assert (body["cv_html_present"], body["cover_letter_html_present"]) == (True, False)
    assert "cv_html" not in body


def test_get_job_of_other_user_returns_404(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    response = api_client.get("/jobs/job-1")
    assert response.status_code == 404
```

(`JobEntry` and `fetch` are imported now because the tests that Tasks 4-5 append to this file use them.)

- [ ] **Step 3: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py
```

Expected: 2 FAIL with `KeyError: 'is_archived'` / `KeyError: 'cv_html_present'`; the 404 test passes already.

- [ ] **Step 4: Implement the detail serialiser**

In `server/routers/jobs.py`, insert directly after `class SaveHtmlRequest` (keep two blank lines around):

```python
_JOB_DETAIL_COLUMNS = (
    "id", "title", "company", "company_domain", "description", "match_score",
    "reasoning", "application_draft", "cv_draft", "interview_prep_material",
    "status", "url", "is_favorite", "contact_persons", "recruiter_info",
    "salary_benchmark", "notes", "is_archived", "archive_reason", "platform_id",
    "generation_error", "checklist", "todos",
)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _derived_job_fields(job: JobEntry) -> dict:
    """ISO timestamps plus presence flags, so clients never need the large HTML bodies."""
    return {
        "created_at": _iso(job.created_at),
        "next_follow_up_at": _iso(job.next_follow_up_at),
        "cv_html_present": bool(job.cv_html),
        "cover_letter_html_present": bool(job.cover_letter_html),
    }


def _job_detail(job: JobEntry) -> dict:
    detail = {column: getattr(job, column) for column in _JOB_DETAIL_COLUMNS}
    detail.update(_derived_job_fields(job))
    return detail


def _get_owned_job(db, job_id: str, user_id: int) -> JobEntry:
    job = db.query(JobEntry).filter(JobEntry.id == job_id, JobEntry.user_id == user_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
```

Replace the whole body of `get_single_job` (the `@router.get("/jobs/{job_id}")` handler) with:

```python
@router.get("/jobs/{job_id}")
def get_single_job(job_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        return _job_detail(_get_owned_job(db, job_id, current_user.id))
    finally:
        db.close()
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py
```

Expected: `3 passed`.

- [ ] **Step 6: Checkpoint: run the full suite**

Run the full-suite command from Global Constraints. Expected: `84 passed`.

---

### Task 3: Server-side search, counts and lighter list items (B6)

**Files:**
- Modify: `server/routers/jobs.py` imports, add `JobListQuery` and list helpers after the Task 2 helpers, replace `get_jobs` (lines 120-173)
- Modify: `server/routers/dashboard.py:67-70` (base filter of `/dashboard-data`)
- Test: `server/tests/test_jobs_router.py`, `server/tests/test_dashboard_router.py` (new)

**Interfaces:**
- Consumes: `_derived_job_fields`, `api_client`, `seed`, `fake_redis`.
- Produces: `MAX_PAGE_SIZE = 100`, `MAX_SEARCH_LENGTH = 200`, `class JobListQuery(BaseModel)`, `_apply_legacy_filters(query, filters)`, `_apply_search_filters(query, filters)` (Task 4 adds the `archive_reason` filter here), `_apply_sort(query, sort_by)`, `_job_list_item(job) -> dict`. `GET /jobs` returns `{"items": [...], "total": int}`.

- [ ] **Step 1: Write the failing list tests**

Append to `server/tests/test_jobs_router.py` (and add `from routers.jobs import MAX_PAGE_SIZE, MAX_SEARCH_LENGTH` to its imports):

```python
def _listed_ids(api_client, **params) -> list:
    return sorted(item["id"] for item in api_client.get("/jobs", params=params).json()["items"])


def test_list_jobs_returns_items_and_total(api_client, seed):
    seed(make_job(id="a"), make_job(id="b"))
    body = api_client.get("/jobs").json()
    assert body["total"] == 2
    assert sorted(item["id"] for item in body["items"]) == ["a", "b"]


def test_list_jobs_paginates_but_total_counts_all(api_client, seed):
    seed(make_job(id="a"), make_job(id="b"), make_job(id="c"))
    body = api_client.get("/jobs", params={"limit": 2}).json()
    assert (body["total"], len(body["items"])) == (3, 2)


def test_list_jobs_rejects_page_size_above_cap(api_client):
    response = api_client.get("/jobs", params={"limit": MAX_PAGE_SIZE + 1})
    assert response.status_code == 422


def test_list_jobs_search_matches_title_or_company_case_insensitive(api_client, seed):
    seed(
        make_job(id="by-title", title="Senior Python Developer", company="Acme"),
        make_job(id="by-company", title="Engineer", company="PyCorp"),
        make_job(id="no-match", title="Designer", company="Studio"),
    )
    assert _listed_ids(api_client, q="PY") == ["by-company", "by-title"]


def test_list_jobs_filters_by_company(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex"))
    assert _listed_ids(api_client, company="Acme") == ["acme"]


def test_list_jobs_filters_by_status_list(api_client, seed):
    seed(
        make_job(id="applied", status="APPLIED"),
        make_job(id="interview", status="INTERVIEW"),
        make_job(id="open"),
    )
    assert _listed_ids(api_client, statuses="APPLIED, INTERVIEW") == ["applied", "interview"]


def test_list_jobs_items_omit_large_columns(api_client, seed):
    seed(make_job(cv_html="<p>CV</p>", cover_letter_html="<p>Letter</p>",
                  application_draft="Dear team", interview_prep_material="{}"))
    item = api_client.get("/jobs").json()["items"][0]
    large = {"description", "cv_html", "cover_letter_html", "application_draft", "cv_draft", "interview_prep_material"}
    assert large.isdisjoint(item)
    assert (item["cv_html_present"], item["cover_letter_html_present"]) == (True, True)


def test_list_jobs_excludes_seen_placeholders(api_client, seed):
    seed(make_job(id="real"), make_job(id="seen", status="SEEN"))
    assert api_client.get("/jobs").json()["total"] == 1


def test_list_jobs_rejects_overlong_search(api_client):
    response = api_client.get("/jobs", params={"q": "x" * (MAX_SEARCH_LENGTH + 1)})
    assert response.status_code == 422
```

Create `server/tests/test_dashboard_router.py`:

```python
from unittest.mock import patch

import requests

from tests.factories import make_job


def test_dashboard_data_excludes_seen_placeholders(api_client, seed, fake_redis):
    seed(make_job(id="visible"), make_job(id="placeholder", status="SEEN"))
    with patch("routers.dashboard.redis_sync.from_url", return_value=fake_redis), \
         patch("routers.dashboard.requests.get", side_effect=requests.ConnectionError):
        body = api_client.get("/dashboard-data").json()
    assert [job["id"] for job in body["jobs"]] == ["visible"]
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py tests/test_dashboard_router.py
```

Expected: FAIL with `ImportError: cannot import name 'MAX_PAGE_SIZE'`.

- [ ] **Step 3: Implement the list endpoint**

In `server/routers/jobs.py` change the imports:

```python
from typing import Annotated, List, Optional

import markdown
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from xhtml2pdf import pisa
```

Insert after `_get_owned_job`:

```python
MAX_PAGE_SIZE = 100
MAX_SEARCH_LENGTH = 200

_JOB_LIST_COLUMNS = (
    "id", "title", "company", "company_domain", "match_score", "reasoning", "url",
    "status", "generation_error", "is_favorite", "is_archived", "archive_reason",
    "platform_id", "checklist",
)


class JobListQuery(BaseModel):
    limit: int = Field(MAX_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    offset: int = Field(0, ge=0)
    filter_type: Optional[str] = None
    sort_by: Optional[str] = "date"
    has_application: Optional[bool] = None
    status_filter: Optional[str] = None
    statuses: Optional[str] = None
    platform_id: Optional[int] = None
    is_archived: bool = False
    q: Optional[str] = Field(None, max_length=MAX_SEARCH_LENGTH)
    company: Optional[str] = None


def _job_list_item(job: JobEntry) -> dict:
    item = {column: getattr(job, column) for column in _JOB_LIST_COLUMNS}
    item.update(_derived_job_fields(job))
    return item


def _apply_legacy_filters(query, filters: JobListQuery):
    if filters.filter_type == "favorite":
        query = query.filter(JobEntry.is_favorite == True)
    elif filters.filter_type == "no_favorite":
        query = query.filter(JobEntry.is_favorite == False)
    elif filters.filter_type == "applications":
        query = query.filter(JobEntry.application_draft.isnot(None))
    if filters.has_application is True:
        query = query.filter(JobEntry.application_draft.isnot(None))
    elif filters.has_application is False:
        query = query.filter(JobEntry.application_draft.is_(None))
    if filters.status_filter:
        query = query.filter(JobEntry.status == filters.status_filter)
    if filters.platform_id:
        query = query.filter(JobEntry.platform_id == filters.platform_id)
    return query


def _parse_statuses(raw: Optional[str]) -> List[str]:
    return [status.strip() for status in (raw or "").split(",") if status.strip()]


def _apply_search_filters(query, filters: JobListQuery):
    if filters.q:
        pattern = f"%{filters.q}%"
        query = query.filter(or_(JobEntry.title.ilike(pattern), JobEntry.company.ilike(pattern)))
    if filters.company:
        query = query.filter(JobEntry.company == filters.company)
    statuses = _parse_statuses(filters.statuses)
    if statuses:
        query = query.filter(JobEntry.status.in_(statuses))
    return query


def _apply_sort(query, sort_by: Optional[str]):
    if sort_by == "date":
        return query.order_by(JobEntry.created_at.desc())
    return query.order_by(JobEntry.match_score.desc())
```

Replace the whole `get_jobs` handler with:

```python
@router.get("/jobs")
def get_jobs(
    filters: Annotated[JobListQuery, Query()],
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == filters.is_archived,
            JobEntry.status != "SEEN",
        )
        query = _apply_search_filters(_apply_legacy_filters(query, filters), filters)
        total = query.count()
        page = _apply_sort(query, filters.sort_by).offset(filters.offset).limit(filters.limit).all()
        return {"items": [_job_list_item(job) for job in page], "total": total}
    finally:
        db.close()
```

In `server/routers/dashboard.py`, inside `get_dashboard_data`, change the base filter to:

```python
        query = db.query(JobEntry).filter(
            JobEntry.user_id == current_user.id,
            JobEntry.is_archived == False,
            JobEntry.status != "SEEN",
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py tests/test_dashboard_router.py
```

Expected: `13 passed`.

- [ ] **Step 5: Checkpoint: run the full suite**

Run the full-suite command. Expected: `94 passed`.

---

### Task 4: Archive reason and kept-by-user (B4)

**Files:**
- Create: `server/core/job_status.py`
- Modify: `server/routers/jobs.py` (`JobListQuery`, `_apply_search_filters`, `delete_job`, `delete_bulk_jobs`, `restore_bulk_jobs`, `patch_job`, `delete_all_jobs`)
- Modify: `server/workers/tasks/analyze.py` (import, `JobEntry(...)` in `analyze_job_task`)
- Test: `server/tests/test_job_status.py` (new), `server/tests/test_jobs_router.py`, `server/tests/test_analyze_task.py` (new)

**Interfaces:**
- Consumes: Task 1 columns, Task 3 `JobListQuery` / `_apply_search_filters`.
- Produces in `core/job_status.py`: `class ArchiveReason(str, Enum)` with `THRESHOLD`, `USER`; `ARCHIVE_BY_USER_VALUES`, `RESTORE_BY_USER_VALUES` (read-only mappings for `Query.update(dict(...))`); `archive_job(job, reason: ArchiveReason) -> None`; `restore_job(job) -> None` (clears reason, sets `kept_by_user=True`). In `routers/jobs.py`: `_set_archived(job, archived: bool) -> None`. In `tests/test_analyze_task.py`: fixture `run_analysis(score, **job_overrides)` and helper `_job_data(**overrides)`, constants `THRESHOLD=60`, `LOW_SCORE=40`, `HIGH_SCORE=85`, `CRAWL_ID="crawl-1"`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_job_status.py`:

```python
from core.job_status import ArchiveReason, archive_job, restore_job
from tests.factories import make_job


def test_archive_job_records_reason():
    job = make_job()
    archive_job(job, ArchiveReason.THRESHOLD)
    assert (job.is_archived, job.archive_reason) == (True, "THRESHOLD")


def test_restore_job_clears_reason_and_marks_kept():
    job = make_job(is_archived=True, archive_reason="THRESHOLD")
    restore_job(job)
    assert (job.is_archived, job.archive_reason, job.kept_by_user) == (False, None, True)
```

Append to `server/tests/test_jobs_router.py`:

```python
def _archive_state(session_factory, job_id="job-1") -> tuple:
    job = fetch(session_factory, JobEntry, job_id)
    return job.is_archived, job.archive_reason, job.kept_by_user


def test_delete_job_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.delete("/jobs/job-1")
    assert _archive_state(session_factory) == (True, "USER", False)


def test_bulk_delete_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.post("/jobs/bulk-delete", json={"job_ids": ["job-1"]})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_delete_all_jobs_archives_with_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.delete("/jobs", params={"keep_favorites": False, "keep_applications": False})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_bulk_restore_clears_reason_and_marks_kept(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="THRESHOLD"))
    api_client.post("/jobs/bulk-restore", json={"job_ids": ["job-1"]})
    assert _archive_state(session_factory) == (False, None, True)


def test_patch_unarchive_clears_reason_and_marks_kept(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="USER"))
    api_client.patch("/jobs/job-1", json={"is_archived": False})
    assert _archive_state(session_factory) == (False, None, True)


def test_patch_archive_sets_user_reason(api_client, seed, session_factory):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"is_archived": True})
    assert _archive_state(session_factory) == (True, "USER", False)


def test_list_jobs_filters_by_archive_reason(api_client, seed):
    seed(
        make_job(id="auto", is_archived=True, archive_reason="THRESHOLD"),
        make_job(id="manual", is_archived=True, archive_reason="USER"),
    )
    assert _listed_ids(api_client, is_archived=True, archive_reason="THRESHOLD") == ["auto"]


def test_list_jobs_rejects_unknown_archive_reason(api_client):
    response = api_client.get("/jobs", params={"archive_reason": "SPAM"})
    assert response.status_code == 422
```

Create `server/tests/test_analyze_task.py`:

```python
from unittest.mock import call, patch

import pytest

from database.core import JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
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
```

(`call`, `events_of_type` and `make_job` are used by tests that Tasks 9 and 11 append.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_job_status.py tests/test_jobs_router.py tests/test_analyze_task.py
```

Expected: FAIL with `ModuleNotFoundError: No module named 'core.job_status'`.

- [ ] **Step 3: Create `server/core/job_status.py`**

```python
"""Job lifecycle rules shared by the routers and the Celery workers."""

from enum import Enum
from types import MappingProxyType


class ArchiveReason(str, Enum):
    """Why a job left the inbox: it scored below the user's threshold, or the user discarded it."""

    THRESHOLD = "THRESHOLD"
    USER = "USER"


# Column values for bulk Query.update() calls; read-only so no caller can alter them for the others.
ARCHIVE_BY_USER_VALUES = MappingProxyType(
    {"is_archived": True, "archive_reason": ArchiveReason.USER.value}
)
RESTORE_BY_USER_VALUES = MappingProxyType(
    {"is_archived": False, "archive_reason": None, "kept_by_user": True}
)


def archive_job(job, reason: ArchiveReason) -> None:
    job.is_archived = True
    job.archive_reason = reason.value


def restore_job(job) -> None:
    """Bring a job back on the user's request; kept_by_user stops later threshold runs from hiding it again."""
    job.is_archived = False
    job.archive_reason = None
    job.kept_by_user = True
```

- [ ] **Step 4: Use it in the jobs router**

In `server/routers/jobs.py` add the import:

```python
from core.job_status import (
    ARCHIVE_BY_USER_VALUES,
    RESTORE_BY_USER_VALUES,
    ArchiveReason,
    archive_job,
    restore_job,
)
```

In `JobListQuery` add the last field:

```python
    archive_reason: Optional[ArchiveReason] = None
```

At the end of `_apply_search_filters`, before `return query`:

```python
    if filters.archive_reason:
        query = query.filter(JobEntry.archive_reason == filters.archive_reason.value)
```

Add after `_apply_sort`:

```python
def _set_archived(job: JobEntry, archived: bool) -> None:
    if archived:
        archive_job(job, ArchiveReason.USER)
    else:
        restore_job(job)
```

In `delete_job` replace `job.is_archived = True` (the archive branch) with `archive_job(job, ArchiveReason.USER)`.

In `delete_bulk_jobs` replace `).update({"is_archived": True}, synchronize_session=False)` with:

```python
        ).update(dict(ARCHIVE_BY_USER_VALUES), synchronize_session=False)
```

In `restore_bulk_jobs` replace `).update({"is_archived": False}, synchronize_session=False)` with:

```python
        ).update(dict(RESTORE_BY_USER_VALUES), synchronize_session=False)
```

In `patch_job` replace

```python
        if request.is_archived is not None:
            job.is_archived = request.is_archived
```

with

```python
        if request.is_archived is not None and request.is_archived != job.is_archived:
            _set_archived(job, request.is_archived)
```

In `delete_all_jobs` replace `archived_count = query.update({"is_archived": True}, synchronize_session=False)` with:

```python
            archived_count = query.update(dict(ARCHIVE_BY_USER_VALUES), synchronize_session=False)
```

- [ ] **Step 5: Tag automatic archiving in the analyze task**

In `server/workers/tasks/analyze.py` add `from core.job_status import ArchiveReason` to the imports, and in the `JobEntry(...)` constructor of `analyze_job_task` add directly after `is_archived=auto_archive,`:

```python
                archive_reason=ArchiveReason.THRESHOLD.value if auto_archive else None,
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_job_status.py tests/test_jobs_router.py tests/test_analyze_task.py
```

Expected: `24 passed`.

- [ ] **Step 7: Checkpoint: run the full suite**

Run the full-suite command. Expected: `106 passed`.

---

### Task 5: Server-validated status transitions (B1)

**Files:**
- Modify: `server/core/job_status.py` (transition table)
- Modify: `server/routers/jobs.py` (new endpoint; delete `StatusUpdateRequest` and `update_job_status`; drop the status block of `patch_job`)
- Modify: `server/database/core.py` (`JobPatchRequest`: remove `status` and `note`)
- Test: `server/tests/test_job_status.py`, `server/tests/test_jobs_router.py`

**Interfaces:**
- Consumes: `restore_job` (Task 4), `_get_owned_job`, `_job_detail` (Task 2).
- Produces in `core/job_status.py`: `USER_SETTABLE_STATUSES: frozenset[str]`, `ALLOWED_TRANSITIONS: Mapping[str, frozenset[str]]`, exceptions `InvalidStatusChange(ValueError)`, `StatusNotSettable(InvalidStatusChange)`, `TransitionNotAllowed(InvalidStatusChange)`, `check_transition(current: str|None, target: str) -> None`. Endpoint `POST /jobs/{job_id}/status` body `{"to": str, "note": str|None (<= 2000)}` -> 200 job detail; 400 not settable; 409 not allowed from current; 404 unknown job; 422 overlong note. `MAX_STATUS_NOTE_LENGTH = 2000` in `routers/jobs.py`. The web `domain/` status mirror (phase 1) must copy `ALLOWED_TRANSITIONS`.

- [ ] **Step 1: Write the failing transition-table tests**

Append to `server/tests/test_job_status.py` (merge the import into the existing one):

```python
import pytest

from core.job_status import (
    ALLOWED_TRANSITIONS,
    StatusNotSettable,
    TransitionNotAllowed,
    check_transition,
)

USER_STATES = ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]
SYSTEM_STATES = ["SEEN", "GENERATING", "FAILED"]
EVERY_STATE = USER_STATES + SYSTEM_STATES
LOCKED_SOURCES = ["SEEN", "GENERATING"]
MOVABLE_SOURCES = USER_STATES + ["FAILED"]
LEGACY_FREE_TEXT_STATUS = "Beworben"

ALLOWED_PAIRS = [(current, target) for current in MOVABLE_SOURCES for target in USER_STATES if current != target]
SYSTEM_TARGET_PAIRS = [(current, target) for current in EVERY_STATE for target in SYSTEM_STATES]
LOCKED_PAIRS = [(current, target) for current in LOCKED_SOURCES for target in USER_STATES]


def test_transition_table_covers_every_known_status():
    assert set(ALLOWED_TRANSITIONS) == set(EVERY_STATE)


@pytest.mark.parametrize("current,target", ALLOWED_PAIRS)
def test_user_may_move_between_user_states(current, target):
    assert check_transition(current, target) is None


@pytest.mark.parametrize("current,target", SYSTEM_TARGET_PAIRS)
def test_system_owned_target_is_rejected(current, target):
    with pytest.raises(StatusNotSettable, match="cannot be set manually"):
        check_transition(current, target)


@pytest.mark.parametrize("current,target", LOCKED_PAIRS)
def test_system_owned_source_cannot_be_left_by_hand(current, target):
    with pytest.raises(TransitionNotAllowed, match=f"from '{current}'"):
        check_transition(current, target)


@pytest.mark.parametrize("status", USER_STATES)
def test_same_status_is_rejected(status):
    with pytest.raises(TransitionNotAllowed, match=f"to '{status}'"):
        check_transition(status, status)


@pytest.mark.parametrize("target", USER_STATES)
def test_legacy_free_text_status_may_move_to_any_user_state(target):
    assert check_transition(LEGACY_FREE_TEXT_STATUS, target) is None


def test_unknown_target_is_rejected():
    with pytest.raises(StatusNotSettable, match="'ARCHIVED'"):
        check_transition("OPEN", "ARCHIVED")
```

- [ ] **Step 2: Write the failing endpoint tests**

Append to `server/tests/test_jobs_router.py` (add `MAX_STATUS_NOTE_LENGTH` to the `routers.jobs` import):

```python
def _change_status(api_client, to, note=None):
    return api_client.post("/jobs/job-1/status", json={"to": to, "note": note})


def _history(api_client) -> list:
    return [(h["from_status"], h["to_status"], h["note"]) for h in api_client.get("/jobs/job-1/history").json()]


def test_change_status_updates_job_and_returns_detail(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "DRAFTED")
    assert (response.status_code, response.json()["status"]) == (200, "DRAFTED")


def test_change_status_writes_history_with_note(api_client, seed):
    seed(make_job(status="DRAFTED"))
    _change_status(api_client, "APPLIED", note="Sent via portal")
    assert _history(api_client) == [("DRAFTED", "APPLIED", "Sent via portal")]


def test_change_status_records_backward_move(api_client, seed):
    seed(make_job(status="INTERVIEW"))
    response = _change_status(api_client, "DRAFTED")
    assert response.status_code == 200
    assert _history(api_client) == [("INTERVIEW", "DRAFTED", None)]


def test_change_status_to_system_state_returns_400(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "GENERATING")
    assert response.status_code == 400
    assert "cannot be set manually" in response.json()["detail"]


def test_change_status_from_generating_returns_409(api_client, seed):
    seed(make_job(status="GENERATING"))
    assert _change_status(api_client, "APPLIED").status_code == 409


def test_change_status_to_same_state_returns_409_without_history(api_client, seed):
    seed(make_job(status="APPLIED"))
    response = _change_status(api_client, "APPLIED")
    assert response.status_code == 409
    assert _history(api_client) == []


def test_change_status_of_archived_job_restores_it(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="THRESHOLD"))
    _change_status(api_client, "DRAFTED")
    assert _archive_state(session_factory) == (False, None, True)


def test_change_status_from_legacy_value_is_allowed(api_client, seed):
    seed(make_job(status="Beworben"))
    assert _change_status(api_client, "APPLIED").status_code == 200


def test_change_status_of_unknown_job_returns_404(api_client):
    assert _change_status(api_client, "APPLIED").status_code == 404


def test_change_status_rejects_overlong_note(api_client, seed):
    seed(make_job())
    response = _change_status(api_client, "DRAFTED", note="x" * (MAX_STATUS_NOTE_LENGTH + 1))
    assert response.status_code == 422


def test_removed_update_status_endpoint_returns_404(api_client, seed):
    seed(make_job())
    response = api_client.patch("/jobs/job-1/update-status", json={"status": "APPLIED"})
    assert response.status_code == 404


def test_patch_job_ignores_status_field(api_client, seed, session_factory):
    seed(make_job())
    api_client.patch("/jobs/job-1", json={"status": "APPLIED", "notes": "Call back"})
    assert fetch(session_factory, JobEntry, "job-1").status == "OPEN"
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_job_status.py tests/test_jobs_router.py
```

Expected: FAIL with `ImportError: cannot import name 'ALLOWED_TRANSITIONS'`.

- [ ] **Step 4: Add the transition table to `server/core/job_status.py`**

Add `from typing import Mapping, Optional` to the imports and append:

```python
USER_SETTABLE_STATUSES = frozenset(
    {"OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"}
)

# Deliberately permissive: backward moves and skips are allowed and land in the
# status history, and the UI asks for confirmation instead. Only the states the
# system owns (a running generation, a dedup placeholder) cannot be left by hand,
# and SEEN, GENERATING and FAILED can never be chosen as a target.
ALLOWED_TRANSITIONS: Mapping[str, frozenset] = MappingProxyType({
    "OPEN": USER_SETTABLE_STATUSES - {"OPEN"},
    "DRAFTED": USER_SETTABLE_STATUSES - {"DRAFTED"},
    "APPLIED": USER_SETTABLE_STATUSES - {"APPLIED"},
    "INTERVIEW": USER_SETTABLE_STATUSES - {"INTERVIEW"},
    "OFFER": USER_SETTABLE_STATUSES - {"OFFER"},
    "ACCEPTED": USER_SETTABLE_STATUSES - {"ACCEPTED"},
    "REJECTED": USER_SETTABLE_STATUSES - {"REJECTED"},
    "FAILED": USER_SETTABLE_STATUSES,
    "GENERATING": frozenset(),
    "SEEN": frozenset(),
})


class InvalidStatusChange(ValueError):
    """A status change the server refuses."""


class StatusNotSettable(InvalidStatusChange):
    """The requested target is unknown or owned by the system."""


class TransitionNotAllowed(InvalidStatusChange):
    """The target is valid, but not reachable from the job's current status."""


def check_transition(current: Optional[str], target: str) -> None:
    """Raise unless a user may move a job from ``current`` to ``target``.

    A ``current`` value outside the table (free text written by the removed
    update-status endpoint) may move to any user-settable status, so such a
    job can be repaired.

    Raises:
        StatusNotSettable: ``target`` is not a user-settable status.
        TransitionNotAllowed: ``target`` is not reachable from ``current``.
    """
    if target not in USER_SETTABLE_STATUSES:
        raise StatusNotSettable(f"Status '{target}' cannot be set manually")
    if target not in ALLOWED_TRANSITIONS.get(current, USER_SETTABLE_STATUSES):
        raise TransitionNotAllowed(f"Cannot change status from '{current}' to '{target}'")
```

- [ ] **Step 5: Add the endpoint and remove the old status paths**

In `server/routers/jobs.py`:

1. Delete `class StatusUpdateRequest` and the whole `@router.patch("/jobs/{job_id}/update-status")` handler `update_job_status`.
2. Extend the `core.job_status` import with `StatusNotSettable`, `TransitionNotAllowed`, `check_transition`.
3. Add after `class SaveHtmlRequest`:

```python
MAX_STATUS_NOTE_LENGTH = 2000


class StatusChangeRequest(BaseModel):
    to: str
    note: Optional[str] = Field(None, max_length=MAX_STATUS_NOTE_LENGTH)
```

4. Add after `_set_archived`:

```python
def _check_transition_or_raise(current: Optional[str], target: str) -> None:
    try:
        check_transition(current, target)
    except StatusNotSettable as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except TransitionNotAllowed as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def _apply_status_change(db, job: JobEntry, request: StatusChangeRequest) -> None:
    _check_transition_or_raise(job.status, request.to)
    # job was loaded with an owner filter, so job.user_id is the authenticated actor
    db.add(JobStatusHistory(
        job_id=job.id, from_status=job.status, to_status=request.to,
        changed_by=job.user_id, note=request.note,
    ))
    job.status = request.to
    if job.is_archived:
        restore_job(job)
```

5. Add the endpoint directly before `@router.patch("/jobs/{job_id}")`:

```python
@router.post("/jobs/{job_id}/status")
def change_job_status(
    job_id: str,
    request: StatusChangeRequest,
    current_user: User = Depends(get_current_user),
):
    """Move a job to another status through the transition table; always writes history."""
    db = SessionLocal()
    try:
        job = _get_owned_job(db, job_id, current_user.id)
        _apply_status_change(db, job, request)
        db.commit()
        db.refresh(job)
        return _job_detail(job)
    finally:
        db.close()
```

6. In `patch_job`, delete the block that starts with `# Track status change for history` through `job.status = request.status`.

In `server/database/core.py`, in `class JobPatchRequest`, delete the lines `status: Optional[str] = None` and `note: Optional[str] = None`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_job_status.py tests/test_jobs_router.py
```

Expected: `143 passed` (111 in `test_job_status.py`, 32 in `test_jobs_router.py`).

- [ ] **Step 7: Checkpoint: run the full suite**

Run the full-suite command. Expected: `227 passed`.

---

### Task 6: Threshold preview and apply (B5)

**Files:**
- Modify: `server/core/job_status.py` (status constant, threshold bulk values)
- Modify: `server/routers/settings.py` (imports, `MatchThresholdData`, helpers, preview endpoint, `save_matching_preference`)
- Modify: `server/tests/test_settings_router.py:test_matching_preference` (response shape)
- Test: `server/tests/test_matching_threshold.py` (new)

**Interfaces:**
- Consumes: `ArchiveReason`, `api_client` (its `get_db` override serves `routers/settings.py`).
- Produces: `STATUS_OPEN = "OPEN"`, `ARCHIVE_BY_THRESHOLD_VALUES`, `RESTORE_BY_THRESHOLD_VALUES` in `core/job_status.py`; `MIN_MATCH_THRESHOLD = 0`, `MAX_MATCH_THRESHOLD = 100` in `routers/settings.py`; `GET /matching-preference/preview?threshold=n` -> `{"threshold", "would_archive", "would_restore"}`; `POST /matching-preference {match_threshold, apply_to_existing=false}` -> `{"status": "saved", "match_threshold", "archived", "restored"}`. Undo = POST the previous threshold with `apply_to_existing: true`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_matching_threshold.py`:

```python
import pytest

from database.core import JobEntry
from routers.settings import MAX_MATCH_THRESHOLD, MIN_MATCH_THRESHOLD
from tests.factories import OTHER_USER_ID, fetch, make_job, make_user

THRESHOLD = 60
BELOW = THRESHOLD - 10
ABOVE = THRESHOLD + 10


def _preview(api_client, threshold=THRESHOLD):
    return api_client.get("/matching-preference/preview", params={"threshold": threshold})


def _apply(api_client, threshold=THRESHOLD):
    return api_client.post(
        "/matching-preference", json={"match_threshold": threshold, "apply_to_existing": True}
    ).json()


def _archived(session_factory, job_id) -> tuple:
    job = fetch(session_factory, JobEntry, job_id)
    return job.is_archived, job.archive_reason


def test_preview_counts_jobs_that_would_move_both_ways(api_client, seed):
    seed(
        make_job(id="low", match_score=BELOW),
        make_job(id="high", match_score=ABOVE),
        make_job(id="hidden-high", match_score=ABOVE, is_archived=True, archive_reason="THRESHOLD"),
    )
    assert _preview(api_client).json() == {"threshold": THRESHOLD, "would_archive": 1, "would_restore": 1}


def test_preview_ignores_protected_jobs(api_client, seed):
    seed(
        make_job(id="favourite", match_score=BELOW, is_favorite=True),
        make_job(id="kept", match_score=BELOW, kept_by_user=True),
        make_job(id="drafted", match_score=BELOW, status="DRAFTED"),
        make_job(id="seen", match_score=BELOW, status="SEEN"),
        make_job(id="discarded", match_score=ABOVE, is_archived=True, archive_reason="USER"),
    )
    body = _preview(api_client).json()
    assert (body["would_archive"], body["would_restore"]) == (0, 0)


@pytest.mark.parametrize("threshold", [MIN_MATCH_THRESHOLD - 1, MAX_MATCH_THRESHOLD + 1])
def test_preview_rejects_threshold_out_of_range(api_client, threshold):
    assert _preview(api_client, threshold).status_code == 422


def test_save_without_apply_leaves_jobs_untouched(api_client, seed, session_factory):
    seed(make_job(match_score=BELOW))
    body = api_client.post("/matching-preference", json={"match_threshold": THRESHOLD}).json()
    assert body == {"status": "saved", "match_threshold": THRESHOLD, "archived": 0, "restored": 0}
    assert _archived(session_factory, "job-1") == (False, None)


def test_apply_archives_below_and_restores_above(api_client, seed, session_factory):
    seed(
        make_job(id="low", match_score=BELOW),
        make_job(id="hidden-high", match_score=ABOVE, is_archived=True, archive_reason="THRESHOLD"),
    )
    body = _apply(api_client)
    assert (body["archived"], body["restored"]) == (1, 1)
    assert _archived(session_factory, "low") == (True, "THRESHOLD")
    assert _archived(session_factory, "hidden-high") == (False, None)
    assert fetch(session_factory, JobEntry, "hidden-high").kept_by_user is False


def test_apply_never_touches_protected_jobs(api_client, seed, session_factory):
    seed(
        make_job(id="favourite", match_score=BELOW, is_favorite=True),
        make_job(id="kept", match_score=BELOW, kept_by_user=True),
        make_job(id="drafted", match_score=BELOW, status="DRAFTED"),
    )
    _apply(api_client)
    states = [_archived(session_factory, job_id) for job_id in ("favourite", "kept", "drafted")]
    assert states == [(False, None)] * 3


def test_apply_does_not_touch_other_users_jobs(api_client, seed, session_factory):
    seed(make_user(OTHER_USER_ID), make_job(id="foreign", user_id=OTHER_USER_ID, match_score=BELOW))
    _apply(api_client)
    assert _archived(session_factory, "foreign") == (False, None)


def test_apply_with_previous_threshold_undoes_the_change(api_client, seed, session_factory):
    seed(make_job(match_score=BELOW))
    _apply(api_client, THRESHOLD)
    _apply(api_client, BELOW)
    assert _archived(session_factory, "job-1") == (False, None)
```

In `server/tests/test_settings_router.py`, change the assertion of `test_matching_preference` to:

```python
    assert response.json() == {"status": "saved", "match_threshold": 75, "archived": 0, "restored": 0}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_matching_threshold.py tests/test_settings_router.py
```

Expected: FAIL with `ImportError: cannot import name 'MAX_MATCH_THRESHOLD'`.

- [ ] **Step 3: Add the threshold values to `server/core/job_status.py`**

Append after `RESTORE_BY_USER_VALUES`:

```python
STATUS_OPEN = "OPEN"

ARCHIVE_BY_THRESHOLD_VALUES = MappingProxyType(
    {"is_archived": True, "archive_reason": ArchiveReason.THRESHOLD.value}
)
# Restoring by threshold is not a user decision, so kept_by_user stays unset.
RESTORE_BY_THRESHOLD_VALUES = MappingProxyType({"is_archived": False, "archive_reason": None})
```

- [ ] **Step 4: Implement preview and apply in `server/routers/settings.py`**

Imports: add `Query` to the `fastapi` import, `JobEntry` to the `database.core` import, and

```python
from core.job_status import (
    ARCHIVE_BY_THRESHOLD_VALUES,
    RESTORE_BY_THRESHOLD_VALUES,
    STATUS_OPEN,
    ArchiveReason,
)
```

Replace `class MatchThresholdData` with:

```python
MIN_MATCH_THRESHOLD = 0
MAX_MATCH_THRESHOLD = 100


class MatchThresholdData(BaseModel):
    match_threshold: int = Field(default=0, ge=MIN_MATCH_THRESHOLD, le=MAX_MATCH_THRESHOLD)
    apply_to_existing: bool = False


def _jobs_to_archive(db: Session, user_id: int, threshold: int):
    """Active inbox jobs a threshold would hide; favourites and jobs the user kept are never touched."""
    return db.query(JobEntry).filter(
        JobEntry.user_id == user_id,
        JobEntry.is_archived == False,
        JobEntry.status == STATUS_OPEN,
        JobEntry.is_favorite.isnot(True),
        JobEntry.kept_by_user == False,
        JobEntry.match_score < threshold,
    )


def _jobs_to_restore(db: Session, user_id: int, threshold: int):
    """Jobs an earlier threshold hid that now score at or above the new one."""
    return db.query(JobEntry).filter(
        JobEntry.user_id == user_id,
        JobEntry.is_archived == True,
        JobEntry.archive_reason == ArchiveReason.THRESHOLD.value,
        JobEntry.match_score >= threshold,
    )


def _apply_threshold(db: Session, user_id: int, threshold: int) -> dict:
    archived = _jobs_to_archive(db, user_id, threshold).update(
        dict(ARCHIVE_BY_THRESHOLD_VALUES), synchronize_session=False
    )
    restored = _jobs_to_restore(db, user_id, threshold).update(
        dict(RESTORE_BY_THRESHOLD_VALUES), synchronize_session=False
    )
    return {"archived": archived, "restored": restored}
```

Replace the `@router.post("/matching-preference")` handler with these two handlers:

```python
@router.get("/matching-preference/preview")
def preview_matching_threshold(
    threshold: int = Query(ge=MIN_MATCH_THRESHOLD, le=MAX_MATCH_THRESHOLD),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Count the jobs a threshold would move into and out of 'below threshold', changing nothing."""
    return {
        "threshold": threshold,
        "would_archive": _jobs_to_archive(db, current_user.id, threshold).count(),
        "would_restore": _jobs_to_restore(db, current_user.id, threshold).count(),
    }


@router.post("/matching-preference")
def save_matching_preference(
    data: MatchThresholdData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.match_threshold = data.match_threshold
    moved = (
        _apply_threshold(db, current_user.id, data.match_threshold)
        if data.apply_to_existing
        else {"archived": 0, "restored": 0}
    )
    db.commit()
    return {"status": "saved", "match_threshold": data.match_threshold, **moved}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_matching_threshold.py tests/test_settings_router.py
```

Expected: `17 passed` (9 + 8).

- [ ] **Step 6: Checkpoint: run the full suite**

Run the full-suite command. Expected: `236 passed`.

---

### Task 7: Job checklist and to-dos (B7)

**Files:**
- Modify: `server/database/core.py` (pydantic import, new models, `JobPatchRequest`)
- Modify: `server/routers/jobs.py:patch_job`
- Test: `server/tests/test_jobs_router.py`

**Interfaces:**
- Consumes: Task 1 columns, `_job_detail` already returns `checklist` and `todos`.
- Produces: `MAX_TODOS = 50`, `MAX_TODO_TEXT_LENGTH = 500`, `MAX_TODO_ID_LENGTH = 64`, `class JobChecklist` (keys `posting_opened`, `documents_checked`, `sent`, all bool default False, extra keys forbidden), `class JobTodo` (`id`, `text`, `done`), `JobPatchRequest.checklist: JobChecklist|None`, `JobPatchRequest.todos: list[JobTodo]|None`. Both replace the stored value wholesale.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_jobs_router.py` (add `from database.core import MAX_TODOS, MAX_TODO_TEXT_LENGTH` to the imports):

```python
def _patch(api_client, payload):
    return api_client.patch("/jobs/job-1", json=payload)


def test_patch_checklist_is_stored_and_returned(api_client, seed):
    seed(make_job())
    _patch(api_client, {"checklist": {"sent": True}})
    expected = {"posting_opened": False, "documents_checked": False, "sent": True}
    assert api_client.get("/jobs/job-1").json()["checklist"] == expected


def test_patch_checklist_rejects_unknown_key(api_client, seed):
    seed(make_job())
    assert _patch(api_client, {"checklist": {"called_recruiter": True}}).status_code == 422


def test_patch_todos_replaces_list(api_client, seed):
    seed(make_job(todos=[{"id": "old", "text": "Old", "done": False}]))
    new_todos = [{"id": "t1", "text": "Prepare questions", "done": True}]
    _patch(api_client, {"todos": new_todos})
    assert api_client.get("/jobs/job-1").json()["todos"] == new_todos


def test_patch_todos_rejects_more_than_max_items(api_client, seed):
    seed(make_job())
    todos = [{"id": f"t{index}", "text": "Follow up"} for index in range(MAX_TODOS + 1)]
    assert _patch(api_client, {"todos": todos}).status_code == 422


def test_patch_todos_rejects_overlong_text(api_client, seed):
    seed(make_job())
    todos = [{"id": "t1", "text": "x" * (MAX_TODO_TEXT_LENGTH + 1)}]
    assert _patch(api_client, {"todos": todos}).status_code == 422


def test_patch_todos_rejects_duplicate_ids(api_client, seed):
    seed(make_job())
    todos = [{"id": "t1", "text": "A"}, {"id": "t1", "text": "B"}]
    response = _patch(api_client, {"todos": todos})
    assert response.status_code == 422
    assert "todo ids must be unique" in response.text
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py
```

Expected: FAIL with `ImportError: cannot import name 'MAX_TODOS'`.

- [ ] **Step 3: Add the models in `server/database/core.py`**

Change `from pydantic import BaseModel` to `from pydantic import BaseModel, ConfigDict, Field, field_validator`. Insert directly before `class JobPatchRequest`:

```python
MAX_TODOS = 50
MAX_TODO_TEXT_LENGTH = 500
MAX_TODO_ID_LENGTH = 64


class JobChecklist(BaseModel):
    """Apply checklist of the job page; only these keys exist."""

    model_config = ConfigDict(extra="forbid")
    posting_opened: bool = False
    documents_checked: bool = False
    sent: bool = False


class JobTodo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=MAX_TODO_ID_LENGTH)
    text: str = Field(min_length=1, max_length=MAX_TODO_TEXT_LENGTH)
    done: bool = False
```

Add to `class JobPatchRequest` (after `is_archived`):

```python
    checklist: Optional[JobChecklist] = None
    todos: Optional[List[JobTodo]] = Field(None, max_length=MAX_TODOS)

    @field_validator("todos")
    @classmethod
    def _todo_ids_unique(cls, todos):
        # The UI toggles and deletes to-dos by id, so a duplicate would hit the wrong item.
        if todos is not None and len({todo.id for todo in todos}) != len(todos):
            raise ValueError("todo ids must be unique")
        return todos
```

- [ ] **Step 4: Store them in `patch_job`**

In `server/routers/jobs.py`, in `patch_job`, directly after the `is_archived` block:

```python
        if request.checklist is not None:
            job.checklist = request.checklist.model_dump()
        if request.todos is not None:
            job.todos = [todo.model_dump() for todo in request.todos]
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py
```

Expected: `38 passed`.

- [ ] **Step 6: Checkpoint: run the full suite**

Run the full-suite command. Expected: `242 passed`.

---

### Task 8: Partial settings updates (B2)

**Files:**
- Modify: `server/database/core.py:class SettingsData` (lines 271-301)
- Modify: `server/routers/settings.py` (`save_settings`, `save_notification_settings`, new `_apply_partial_update`, import `_SECRET_FIELDS`)
- Test: `server/tests/test_settings_router.py`

**Interfaces:**
- Consumes: `routers.deps._SECRET_FIELDS`, `_SECRET_MASK`.
- Produces: `_apply_partial_update(profile, update: BaseModel) -> None` in `routers/settings.py`. `POST /settings` and `POST /notification-settings` change only the fields present in the body. In `POST /settings` the profile fields (`role`, `skills`, `min_salary`, `location`, `preferences`, `cv_data`, `job_urls`, `spoken_languages`, `cv_template`, `cover_letter_template`, `active_notification_service`) may be omitted but not sent as `null` (422); credential fields may be `null` (clears them). Fields the endpoint ignored before (`smtp_*`, `language`, `timezone`, `active_storage_service`, `google_drive_email`, `master_cv_*`) are no longer declared and stay ignored.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_settings_router.py` (add `from routers.deps import _SECRET_MASK` to the imports):

```python
def _seed_profile(**fields):
    db = TestingSessionLocal()
    db.add(UserProfile(user_id=101, **fields))
    db.commit()
    db.close()


def _load_profile():
    db = TestingSessionLocal()
    profile = db.query(UserProfile).filter(UserProfile.user_id == 101).first()
    db.close()
    return profile


def test_save_profile_keeps_notification_credentials():
    _seed_profile(role="Dev", pushover_user_key="pk", pushover_api_token="tok",
                  resend_from_email="jobs@example.com", active_notification_service="PUSHOVER")
    response = client.post("/settings", json={"role": "Lead Dev"})
    profile = _load_profile()
    assert response.status_code == 200
    assert (profile.pushover_user_key, profile.pushover_api_token, profile.resend_from_email,
            profile.active_notification_service) == ("pk", "tok", "jobs@example.com", "PUSHOVER")


def test_save_profile_updates_only_sent_fields():
    _seed_profile(role="Dev", skills="Python", location="Berlin")
    client.post("/settings", json={"skills": "Go"})
    profile = _load_profile()
    assert (profile.role, profile.skills, profile.location) == ("Dev", "Go", "Berlin")


def test_save_profile_rejects_explicit_null_for_profile_field():
    response = client.post("/settings", json={"role": None})
    assert response.status_code == 422


def test_notification_settings_partial_update_keeps_other_fields():
    _seed_profile(resend_api_key="rk", email_global_recipient="me@example.com", smtp_host="old.example.com")
    client.post("/notification-settings", json={"smtp_host": "smtp.example.com"})
    profile = _load_profile()
    assert (profile.smtp_host, profile.resend_api_key, profile.email_global_recipient) == (
        "smtp.example.com", "rk", "me@example.com")


def test_notification_settings_masked_secret_is_kept():
    _seed_profile(smtp_password="secret")
    client.post("/notification-settings", json={"smtp_password": _SECRET_MASK, "smtp_user": "mailer"})
    profile = _load_profile()
    assert (profile.smtp_password, profile.smtp_user) == ("secret", "mailer")


def test_notification_settings_explicit_null_clears_field():
    _seed_profile(pushover_user_key="pk")
    client.post("/notification-settings", json={"pushover_user_key": None})
    assert _load_profile().pushover_user_key is None
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_settings_router.py
```

Expected: FAIL. `POST /settings {"role": ...}` returns 422 (required fields missing), and the notification test sees `rk` wiped to `None`.

- [ ] **Step 3: Make `SettingsData` partial**

Replace `class SettingsData` in `server/database/core.py` with:

```python
class SettingsData(BaseModel):
    """Partial profile update: only the fields present in the body are written.

    Profile fields default to None without being Optional, so omitting one is
    fine but an explicit null is rejected. Credential fields stay Optional so a
    client can clear them.
    """

    role: str = None
    skills: str = None
    min_salary: str = None
    location: str = None
    preferences: str = None
    cv_data: CVDataModel = None
    job_urls: List[str] = None
    spoken_languages: List[str] = None
    cv_template: str = None
    cover_letter_template: str = None
    active_notification_service: str = None

    pushover_user_key: Optional[str] = None
    pushover_api_token: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None
    mailjet_api_key: Optional[str] = None
    mailjet_secret_key: Optional[str] = None
    mailjet_from_email: Optional[str] = None
```

- [ ] **Step 4: Apply updates partially in `server/routers/settings.py`**

Add `_SECRET_FIELDS` to the `routers.deps` import. Add after `class _FakeJob`:

```python
def _apply_partial_update(profile: UserProfile, update: BaseModel) -> None:
    """Copy only the fields present in the request body onto the profile.

    Omitted fields keep their stored value, so the profile form and the
    notification form can save independently. A secret sent back as the mask
    sentinel also keeps its stored value.
    """
    for field in update.model_fields_set:
        value = getattr(update, field)
        if field in _SECRET_FIELDS and value == _SECRET_MASK:
            continue
        setattr(profile, field, value.model_dump() if isinstance(value, BaseModel) else value)
```

In `save_settings`, replace everything between the profile get-or-create block and `db.commit()` (from `profile.role = settings.role` through `profile.active_notification_service = settings.active_notification_service`) with:

```python
    _apply_partial_update(profile, settings)
```

In `save_notification_settings`, replace everything from `profile.pushover_user_key = settings.pushover_user_key` through `profile.email_global_recipient = settings.email_global_recipient or profile.email_global_recipient` with:

```python
    _apply_partial_update(profile, settings)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_settings_router.py
```

Expected: `14 passed`.

- [ ] **Step 6: Checkpoint: run the full suite**

Run the full-suite command. Expected: `248 passed`.

---

### Task 9: WebSocket scoping and `template_ready` (B3)

**Files:**
- Modify: `server/core/connection_manager.py` (`broadcast`, new helpers, constant)
- Modify: `server/workers/tasks/analyze.py` (`new_job` / `job_updated` payloads in both tasks)
- Modify: `server/workers/tasks/research.py` (`interview_prep_ready`, `company_profile_ready`)
- Modify: `server/workers/tasks/application.py` (`global_error`)
- Modify: `server/workers/tasks/crawl_status.py`, `server/workers/scraper_worker.py` (`crawl_completed`)
- Modify: `server/workers/tasks/fill_cv_template.py` (publish `template_ready`)
- Test: `server/tests/test_connection_manager.py` (new), `server/tests/test_ws_publishers.py` (new), `server/tests/test_analyze_task.py`

**Interfaces:**
- Consumes: `fake_redis`, `session_factory`, `seed`, `events_of_type`, `run_analysis`.
- Produces: `GLOBAL_EVENT_TYPES = frozenset({"ai_error", "ai_error_cleared"})`; `ConnectionManager.broadcast(message)` delivers to the top-level `user_id` only, to everyone for `GLOBAL_EVENT_TYPES`, and drops everything else (logged as a warning). Every user event now has a top-level `user_id`. New event `{"type": "template_ready", "template_id": int, "user_id": int}`, sent when the AI fill finishes or fails (status is cleared in both cases).

- [ ] **Step 1: Write the failing manager tests**

Create `server/tests/test_connection_manager.py`:

```python
import asyncio
import json

from core.connection_manager import ConnectionManager

OWNER_ID = 7
OTHER_ID = 8


class FakeWebSocket:
    """Records what the manager sends."""

    def __init__(self):
        self.sent = []

    async def send_text(self, message: str) -> None:
        self.sent.append(message)


class BrokenWebSocket:
    """Fails like a socket the browser already closed."""

    async def send_text(self, message: str) -> None:
        raise RuntimeError("socket closed")


def _manager_with(sockets: dict) -> ConnectionManager:
    manager = ConnectionManager()
    manager.active_connections = {user_id: list(conns) for user_id, conns in sockets.items()}
    return manager


def _broadcast(manager: ConnectionManager, message: str) -> None:
    asyncio.run(manager.broadcast(message))


def test_event_with_user_id_reaches_only_that_user():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": OWNER_ID}))
    assert (len(owner.sent), other.sent) == (1, [])


def test_global_event_reaches_every_user():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "ai_error", "message": "Model not found"}))
    assert (len(owner.sent), len(other.sent)) == (1, 1)


def test_unscoped_user_event_is_dropped():
    owner, other = FakeWebSocket(), FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner], OTHER_ID: [other]})
    _broadcast(manager, json.dumps({"type": "interview_prep_ready", "job_id": "job-1"}))
    assert (owner.sent, other.sent) == ([], [])


def test_invalid_json_is_dropped():
    owner = FakeWebSocket()
    manager = _manager_with({OWNER_ID: [owner]})
    _broadcast(manager, "not json")
    assert owner.sent == []


def test_failed_socket_is_disconnected():
    manager = _manager_with({OWNER_ID: [BrokenWebSocket()]})
    _broadcast(manager, json.dumps({"type": "new_job", "user_id": OWNER_ID}))
    assert OWNER_ID not in manager.active_connections
```

- [ ] **Step 2: Write the failing publisher tests**

Append to `server/tests/test_analyze_task.py`:

```python
def test_new_job_event_carries_top_level_user_id(run_analysis, fake_redis):
    run_analysis(HIGH_SCORE)
    assert events_of_type(fake_redis, "new_job")[0]["user_id"] == TEST_USER_ID


def test_job_updated_event_carries_top_level_user_id(run_analysis, seed, fake_redis):
    seed(make_job())
    run_analysis(HIGH_SCORE, force_reanalyze=True)
    assert events_of_type(fake_redis, "job_updated")[0]["user_id"] == TEST_USER_ID
```

Create `server/tests/test_ws_publishers.py`:

```python
from unittest.mock import patch

import pytest

from database.core import DocumentTemplate
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_user
from workers.scraper_worker import schedule_crawls_task
from workers.tasks.application import generate_application_task
from workers.tasks.crawl_status import maybe_complete_crawl
from workers.tasks.fill_cv_template import fill_cv_template_task
from workers.tasks.research import generate_company_profile, generate_interview_prep_task

CRAWL_ID = "crawl-1"
TEMPLATE_ID = 3
COMPANY_DOMAIN = "acme.example"
NO_AI = (None, "test-model")


def test_interview_prep_ready_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user(), make_job())
    with patch("workers.tasks.research.SessionLocal", session_factory), \
         patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.research.get_client_and_model", return_value=NO_AI), \
         patch("intelligence.service.generate_interview_prep", return_value={"report_output": {}}):
        generate_interview_prep_task("job-1", TEST_USER_ID)
    assert events_of_type(fake_redis, "interview_prep_ready")[0]["user_id"] == TEST_USER_ID


def test_company_profile_ready_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user())
    with patch("workers.tasks.research.SessionLocal", session_factory), \
         patch("workers.tasks.research.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.research.get_client_and_model", return_value=NO_AI), \
         patch("intelligence.service.generate_company_profile_summary", return_value={"executive_summary": "Stable"}):
        generate_company_profile(COMPANY_DOMAIN, TEST_USER_ID)
    assert events_of_type(fake_redis, "company_profile_ready")[0]["user_id"] == TEST_USER_ID


def test_global_error_carries_user_id(session_factory, seed, fake_redis):
    seed(make_user(), make_job(status="GENERATING"))
    with patch("workers.tasks.application.SessionLocal", session_factory), \
         patch("workers.tasks.application.redis.from_url", return_value=fake_redis):
        generate_application_task("job-1", TEST_USER_ID)
    assert events_of_type(fake_redis, "global_error")[0]["user_id"] == TEST_USER_ID


def test_crawl_completed_carries_user_id(fake_redis):
    fake_redis.hgetall.return_value = {b"total": b"2", b"jobs_saved": b"1", b"jobs_skipped": b"1"}
    with patch("workers.tasks.crawl_status.flush_all_digests"):
        maybe_complete_crawl(CRAWL_ID, TEST_USER_ID, None, fake_redis)
    assert events_of_type(fake_redis, "crawl_completed") == [{"type": "crawl_completed", "user_id": TEST_USER_ID}]


def test_scraper_crawl_completed_carries_user_id(fake_redis):
    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis):
        schedule_crawls_task([[], TEST_USER_ID, CRAWL_ID, None])
    assert events_of_type(fake_redis, "crawl_completed")[0]["user_id"] == TEST_USER_ID


@pytest.fixture()
def run_template_fill(session_factory, seed, fake_redis):
    """Run ai.fill_cv_template on a 'processing' template; the AI annotator is the patched boundary."""
    def _run(html: str, annotate_error=None):
        seed(make_user(), DocumentTemplate(
            id=TEMPLATE_ID, user_id=TEST_USER_ID, doc_type="CV", name="Mine", html=html, status="processing",
        ))
        with patch("workers.tasks.fill_cv_template.SessionLocal", session_factory), \
             patch("workers.tasks.fill_cv_template.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.fill_cv_template.get_client_and_model", return_value=NO_AI), \
             patch("workers.tasks.fill_cv_template.annotate_cv_template_with_jinja2", side_effect=annotate_error):
            fill_cv_template_task(TEMPLATE_ID, TEST_USER_ID)
    return _run


def test_template_ready_published_after_annotation(run_template_fill, fake_redis, session_factory):
    run_template_fill("<p>{{ name }}</p>")
    expected = [{"type": "template_ready", "template_id": TEMPLATE_ID, "user_id": TEST_USER_ID}]
    assert events_of_type(fake_redis, "template_ready") == expected
    assert fetch(session_factory, DocumentTemplate, TEMPLATE_ID).status is None


def test_template_ready_published_when_annotation_fails(run_template_fill, fake_redis, session_factory):
    run_template_fill("<p>Jane Doe</p>", annotate_error=RuntimeError("model down"))
    assert len(events_of_type(fake_redis, "template_ready")) == 1
    assert fetch(session_factory, DocumentTemplate, TEMPLATE_ID).status is None
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_connection_manager.py tests/test_ws_publishers.py tests/test_analyze_task.py
```

Expected: FAIL. `test_unscoped_user_event_is_dropped` delivers to both users, the publisher tests raise `KeyError: 'user_id'`, and the template tests fail on `AttributeError: ... has no attribute 'redis'`.

- [ ] **Step 4: Scope the broadcast in `server/core/connection_manager.py`**

Add below `logger = get_logger(__name__)`:

```python
# The only events every connected user may see; anything else needs a top-level user_id.
GLOBAL_EVENT_TYPES = frozenset({"ai_error", "ai_error_cleared"})


def _parse_payload(message: str) -> dict:
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}
```

Replace the whole `broadcast` method with:

```python
    async def broadcast(self, message: str):
        """Deliver a pub/sub message to its owner, or to everyone for whitelisted global events.

        Events without a top-level user_id that are not whitelisted are dropped,
        so a publisher that forgets the owner cannot leak data to other users.
        """
        payload = _parse_payload(message)
        target_user_id = payload.get("user_id")
        if target_user_id is not None:
            await self._send_to_user(int(target_user_id), message)
        elif payload.get("type") in GLOBAL_EVENT_TYPES:
            for user_id in list(self.active_connections):
                await self._send_to_user(user_id, message)
        else:
            logger.warning(f"Dropped WebSocket event without user_id: {payload.get('type')}")

    async def _send_to_user(self, user_id: int, message: str):
        for connection in self.active_connections.get(user_id, [])[:]:
            try:
                await connection.send_text(message)
            except Exception:
                # Any send failure means the socket is gone; forget it instead of failing the broadcast.
                self.disconnect(connection, user_id)
```

- [ ] **Step 5: Add `user_id` to every publisher**

`server/workers/tasks/analyze.py`
- In `analyze_job_task`, in the `payload = json.dumps({...})` for `new_job`/`job_updated`, add directly after `"type": event_type,`:

  ```python
                "user_id": user_id,
  ```

- In `save_job_basic_task`, add directly after `"type": "new_job",`:

  ```python
                "user_id": user_id,
  ```

`server/workers/tasks/research.py`
- `json.dumps({"type": "interview_prep_ready", "job_id": job_id})` becomes `json.dumps({"type": "interview_prep_ready", "job_id": job_id, "user_id": user_id})`.
- `json.dumps({"type": "company_profile_ready", "domain": domain})` becomes `json.dumps({"type": "company_profile_ready", "domain": domain, "user_id": user_id})`.

`server/workers/tasks/application.py`
- `json.dumps({"type": "global_error", "message": error_msg})` becomes `json.dumps({"type": "global_error", "message": error_msg, "user_id": job.user_id})`.

`crawl_completed` in `crawl_status.py` and the five places in `scraper_worker.py` (lines 190, 224, 278, 385, 450). Run:

```bash
cd /mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer/server && sed -i 's/json.dumps({"type": "crawl_completed"})/json.dumps({"type": "crawl_completed", "user_id": user_id})/' workers/tasks/crawl_status.py workers/scraper_worker.py && grep -n '"crawl_completed"' workers/tasks/crawl_status.py workers/scraper_worker.py
```

Expected: six lines, each with `"user_id": user_id`. Then in `scraper_worker.py`, inside `_mark_scrape_failed` (the occurrence after `r.srem(f"user:{stored_user_id}:active_crawls", job_id)`), change that one line to use the owner read from the crawl hash:

```python
        r.publish("job_updates", json.dumps({"type": "crawl_completed", "user_id": stored_user_id}))
```

`server/workers/tasks/fill_cv_template.py`: add the imports at the top

```python
import json
import os

import redis
```

add below `logger = get_logger(__name__)`:

```python
TEMPLATE_READY_EVENT = "template_ready"


def _publish_template_ready(template_id: int, user_id: int) -> None:
    """Tell the owner's browser the template is usable again, so the gallery need not poll."""
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    redis.from_url(redis_url).publish(
        "job_updates",
        json.dumps({"type": TEMPLATE_READY_EVENT, "template_id": template_id, "user_id": user_id}),
    )
```

In `fill_cv_template_task`, in the annotation `except` branch replace

```python
            _set_status(template_id, user_id, None)
            return
```

with

```python
            _set_status(template_id, user_id, None)
            _publish_template_ready(template_id, user_id)
            return
```

and in Phase 3 replace

```python
            tmpl.status = None
            db.commit()
```

with

```python
            tmpl.status = None
            db.commit()
            _publish_template_ready(template_id, user_id)
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_connection_manager.py tests/test_ws_publishers.py tests/test_analyze_task.py
```

Expected: `16 passed` (5 + 7 + 4).

- [ ] **Step 7: Verify no user event is left unscoped**

```bash
cd /mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer/server && grep -rn 'publish(' --include=*.py . | grep -v tests | grep -v __pycache__
```

Expected: open every hit that is not already covered above and confirm its payload has a top-level `user_id`, or is `ai_error` / `ai_error_cleared` (`intelligence/service.py`). The `crawl_job_*`, `job_analysis_*`, `job_skipped` and `job_update` events already carry it.

- [ ] **Step 8: Checkpoint: run the full suite**

Run the full-suite command. Expected: `262 passed`.

---

### Task 10: Setup wizard initial run (B8)

**Files:**
- Modify: `server/routers/platforms.py` (`typing` import, `PlatformSetupCreateRequest`, new `_start_first_crawl`, end of `create_platform_with_setup`)
- Modify: `server/tests/test_platforms_router.py` (three existing setup tests + four new tests)

**Interfaces:**
- Consumes: `_trigger_scraper_search(platform, current_user, is_initial_run)` (system boundary to the scraper service, patched in tests).
- Produces: `PlatformSetupCreateRequest.initial_run: Literal["analyze", "seed", "none"] = "seed"` (replaces `run_initial_crawl`); `_start_first_crawl(platform, current_user, seed_only: bool) -> None`. `analyze` triggers a regular crawl (`is_initial_run=False`), so every found job is scraped and scored; `seed` keeps today's placeholder-only run; `none` starts nothing.

- [ ] **Step 1: Update the existing tests and write the failing ones**

In `server/tests/test_platforms_router.py`, in `test_setup_creates_active_platform`, `test_setup_reuses_pending_platform` and `test_setup_rejects_active_duplicate`, replace `"run_initial_crawl": False,` with `"initial_run": "none",`. Add `from unittest.mock import patch` to the imports and append:

```python
SETUP_PAYLOAD = {
    "url": "https://indeed.com/jobs",
    "selected_urls": ["https://indeed.com/jobs/view/1", "https://indeed.com/jobs/view/2"],
}


def _setup(initial_run):
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = client.post("/platforms/setup", json={**SETUP_PAYLOAD, "initial_run": initial_run})
    return response, trigger


def test_setup_analyze_triggers_regular_crawl():
    response, trigger = _setup("analyze")
    assert trigger.call_args.kwargs["is_initial_run"] is False
    assert response.json()["last_crawl_at"] is not None


def test_setup_seed_triggers_initial_run():
    response, trigger = _setup("seed")
    assert trigger.call_args.kwargs["is_initial_run"] is True
    assert response.json()["last_crawl_at"] is not None


def test_setup_none_skips_crawl():
    response, trigger = _setup("none")
    trigger.assert_not_called()
    assert response.json()["last_crawl_at"] is None


def test_setup_rejects_unknown_initial_run():
    response, trigger = _setup("later")
    assert response.status_code == 422
    trigger.assert_not_called()
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platforms_router.py
```

Expected: FAIL. `initial_run` is ignored, `run_initial_crawl` defaults to true, so `analyze` sees `is_initial_run=True`, `none` triggers a crawl, and `later` returns 200.

- [ ] **Step 3: Implement**

In `server/routers/platforms.py` change `from typing import List, Optional` to `from typing import List, Literal, Optional`. Replace `class PlatformSetupCreateRequest` with:

```python
class PlatformSetupCreateRequest(BaseModel):
    url: str
    selected_urls: List[str]
    # "analyze" crawls now and scores every job found; "seed" only records today's
    # postings as known, so later runs report just the new ones; "none" starts nothing.
    initial_run: Literal["analyze", "seed", "none"] = "seed"
    crawl_interval_minutes: int = 60


def _start_first_crawl(platform: JobPlatform, current_user: User, seed_only: bool) -> None:
    try:
        _trigger_scraper_search(platform, current_user, is_initial_run=seed_only)
    except Exception as e:
        logger.warning(f"Failed to trigger initial crawl after setup for platform {platform.id}: {e}")
        return
    platform.last_crawl_at = datetime.now(timezone.utc)
```

At the end of `create_platform_with_setup`, replace

```python
    if request.run_initial_crawl:
        try:
            _trigger_scraper_search(platform, current_user, True)
            platform.last_crawl_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to trigger initial crawl after setup for platform {platform.id}: {e}")
```

with

```python
    if request.initial_run != "none":
        _start_first_crawl(platform, current_user, seed_only=request.initial_run == "seed")
        db.commit()
```

(The legacy `POST /platforms/{id}/setup` and its `PlatformSetupRequest.run_initial_crawl` have no caller and stay unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platforms_router.py
```

Expected: `19 passed`.

- [ ] **Step 5: Checkpoint: run the full suite**

Run the full-suite command. Expected: `266 passed`.

---

### Task 11: Last-run summary per platform (B9)

**Files:**
- Create: `server/workers/tasks/platform_runs.py`
- Modify: `server/scraper_api.py` (import, `_remember_platform`, `/search`, `cleanup_crawl_job`, `fail_crawl_job`)
- Modify: `server/workers/tasks/crawl_status.py` (`maybe_complete_crawl`)
- Modify: `server/workers/scraper_worker.py` (`schedule_crawls_task` x2, `_mark_scrape_failed`, `scrape_job_detail_task` download failure)
- Modify: `server/workers/tasks/analyze.py` (`jobs_matched` counter)
- Modify: `server/database/core.py:PlatformResponse`, `server/routers/platforms.py:_serialize_platform`
- Test: `server/tests/test_platform_runs.py` (new), `server/tests/test_scraper_api.py` (new), `server/tests/test_analyze_task.py`, `server/tests/test_platforms_router.py`

**Interfaces:**
- Consumes: Task 1 `JobPlatform.last_run`, crawl Redis hash `crawl_job:{id}` (fields `started_at` ms string, `total`, `total_found`, `jobs_saved`, `jobs_matched`, `platform_id`).
- Produces: `build_last_run(job_hash: dict, finished_at: datetime, error: str|None) -> dict` with keys `started_at` (ISO or None), `finished_at` (ISO), `found` (`total_found`, else `total`), `new` (`jobs_saved`), `matched` (`jobs_matched`), plus `error` only when set; `record_platform_run(redis_client, crawl_job_id: str, error: str|None = None) -> None` (never raises); `scraper_api._remember_platform(job_id, platform_id) -> None`; `PlatformResponse.last_run: dict|None`; Redis counter `jobs_matched` (new jobs not auto-archived).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_platform_runs.py`:

```python
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from database.core import JobPlatform
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_user
from workers.tasks.crawl_status import maybe_complete_crawl
from workers.tasks.platform_runs import build_last_run, record_platform_run

CRAWL_ID = "crawl-1"
STARTED_AT_MS = b"1791450000000"
STARTED_AT_ISO = "2026-10-08T09:00:00+00:00"
FINISHED_AT = datetime(2026, 10, 8, 9, 30, tzinfo=timezone.utc)
CRAWL_HASH = {
    b"platform_id": str(TEST_PLATFORM_ID).encode(),
    b"started_at": STARTED_AT_MS,
    b"total": b"3",
    b"total_found": b"8",
    b"jobs_saved": b"3",
    b"jobs_skipped": b"0",
    b"jobs_matched": b"2",
}


def test_build_last_run_summarises_crawl_counters():
    assert build_last_run(CRAWL_HASH, FINISHED_AT, None) == {
        "started_at": STARTED_AT_ISO,
        "finished_at": FINISHED_AT.isoformat(),
        "found": 8,
        "new": 3,
        "matched": 2,
    }


def test_build_last_run_includes_error():
    assert build_last_run(CRAWL_HASH, FINISHED_AT, "Scraper unreachable")["error"] == "Scraper unreachable"


def test_build_last_run_without_start_time_or_counters():
    assert build_last_run({}, FINISHED_AT, None) == {
        "started_at": None, "finished_at": FINISHED_AT.isoformat(), "found": 0, "new": 0, "matched": 0,
    }


@pytest.fixture()
def platform_db(session_factory, seed):
    seed(make_user(), make_platform())
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        yield session_factory


def test_record_platform_run_saves_summary_on_platform(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["new"] == 3


def test_record_platform_run_skips_crawls_without_platform(platform_db, fake_redis):
    fake_redis.hgetall.return_value = {b"total": b"1"}
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run is None


def test_record_platform_run_never_raises(platform_db, fake_redis):
    fake_redis.hgetall.side_effect = ConnectionError("redis down")
    assert record_platform_run(fake_redis, CRAWL_ID) is None
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run is None


def test_completed_crawl_records_last_run(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    with patch("workers.tasks.crawl_status.flush_all_digests"):
        maybe_complete_crawl(CRAWL_ID, TEST_USER_ID, None, fake_redis)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["matched"] == 2
```

Create `server/tests/test_scraper_api.py`:

```python
from unittest.mock import patch

import scraper_api
from database.core import JobPlatform
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, fetch, make_platform, make_user

CRAWL_ID = "crawl-1"


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
    fake_redis.hgetall.return_value = {b"platform_id": str(TEST_PLATFORM_ID).encode()}
    monkeypatch.setattr(scraper_api, "r", fake_redis)
    with patch("workers.tasks.platform_runs.SessionLocal", session_factory):
        scraper_api.fail_crawl_job(CRAWL_ID, TEST_USER_ID, "Scraper unreachable")
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_run["error"] == "Scraper unreachable"
```

Append to `server/tests/test_analyze_task.py`:

```python
def test_matched_job_is_counted_on_the_crawl(run_analysis, fake_redis):
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert call(f"crawl_job:{CRAWL_ID}", "jobs_matched", 1) in fake_redis.hincrby.call_args_list


def test_auto_archived_job_is_not_counted_as_matched(run_analysis, fake_redis):
    run_analysis(LOW_SCORE, crawl_job_id=CRAWL_ID)
    assert call(f"crawl_job:{CRAWL_ID}", "jobs_matched", 1) not in fake_redis.hincrby.call_args_list
```

Append to `server/tests/test_platforms_router.py`:

```python
def test_get_platforms_returns_last_run():
    last_run = {"started_at": None, "finished_at": "2026-10-08T09:30:00+00:00", "found": 8, "new": 3, "matched": 2}
    db = TestingSessionLocal()
    db.add(JobPlatform(id=30, user_id=99, url="https://indeed.com/jobs", name="Indeed",
                       setup_status="active", last_run=last_run))
    db.commit()
    db.close()
    assert client.get("/platforms").json()[0]["last_run"] == last_run
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platform_runs.py tests/test_scraper_api.py tests/test_analyze_task.py tests/test_platforms_router.py
```

Expected: FAIL with `ModuleNotFoundError: No module named 'workers.tasks.platform_runs'`.

- [ ] **Step 3: Create `server/workers/tasks/platform_runs.py`**

```python
"""Persist a summary of each finished crawl on its platform (job_platforms.last_run)."""

from datetime import datetime, timezone
from typing import Optional

from core.logger import get_logger
from database.core import JobPlatform, SessionLocal

logger = get_logger(__name__)

MILLISECONDS_PER_SECOND = 1000


def _hash_int(job_hash: dict, field: str) -> int:
    # The crawl hash is read both by byte-mode and by decoded Redis clients.
    raw = job_hash.get(field.encode()) or job_hash.get(field)
    return int(raw) if raw else 0


def _started_at_iso(job_hash: dict) -> Optional[str]:
    started_ms = _hash_int(job_hash, "started_at")
    if not started_ms:
        return None
    return datetime.fromtimestamp(started_ms / MILLISECONDS_PER_SECOND, tz=timezone.utc).isoformat()


def build_last_run(job_hash: dict, finished_at: datetime, error: Optional[str]) -> dict:
    """Summarise a crawl hash as {started_at, finished_at, found, new, matched, error?}."""
    last_run = {
        "started_at": _started_at_iso(job_hash),
        "finished_at": finished_at.isoformat(),
        "found": _hash_int(job_hash, "total_found") or _hash_int(job_hash, "total"),
        "new": _hash_int(job_hash, "jobs_saved"),
        "matched": _hash_int(job_hash, "jobs_matched"),
    }
    if error:
        last_run["error"] = error
    return last_run


def _save_last_run(platform_id: int, last_run: dict) -> None:
    db = SessionLocal()
    try:
        platform = db.query(JobPlatform).filter(JobPlatform.id == platform_id).first()
        if platform:
            platform.last_run = last_run
            db.commit()
    finally:
        db.close()


def record_platform_run(redis_client, crawl_job_id: str, error: Optional[str] = None) -> None:
    """Store the finished crawl's summary on its platform. Call before the crawl hash is deleted."""
    try:
        job_hash = redis_client.hgetall(f"crawl_job:{crawl_job_id}")
        platform_id = _hash_int(job_hash, "platform_id")
        if platform_id:
            _save_last_run(platform_id, build_last_run(job_hash, datetime.now(timezone.utc), error))
    except Exception as exc:
        # Broad on purpose: the summary is bookkeeping and must never break crawl completion.
        logger.error(f"Could not record last run for crawl {crawl_job_id}: {exc}", exc_info=True)
```

- [ ] **Step 4: Expose `last_run` on platforms**

In `server/database/core.py`, `class PlatformResponse`, after `url_pattern: Optional[str] = None` add `last_run: Optional[dict] = None`. In `server/routers/platforms.py`, `_serialize_platform`, after `"url_pattern": platform.url_pattern,` add `"last_run": platform.last_run,`.

- [ ] **Step 5: Store the platform on the crawl and record failures in `server/scraper_api.py`**

Add `from workers.tasks.platform_runs import record_platform_run` to the imports. Add after `_init_crawl_job`:

```python
def _remember_platform(job_id: str, platform_id: Optional[int]) -> None:
    """Keep the platform on the crawl hash so the finished run can be summarised on it."""
    if platform_id is not None:
        r.hset(f"crawl_job:{job_id}", "platform_id", platform_id)
```

In `search_jobs`, directly after the `_init_crawl_job(...)` call, add `_remember_platform(job_id, search.platform_id)`.

In `cleanup_crawl_job`, as the first statement after `logger.info(f"🧹 Cleaning up crawl job ...")`, add:

```python
        record_platform_run(r, job_id, error=reason)
```

In `fail_crawl_job`, directly after `logger.info(f"Failing crawl job {job_id} (error: {error_message})")`, add:

```python
        record_platform_run(r, job_id, error=error_message)
```

- [ ] **Step 6: Record completed and failed runs in the workers**

`server/workers/tasks/crawl_status.py`: add `from workers.tasks.platform_runs import record_platform_run`; in `maybe_complete_crawl`, directly after `r.hset(f"crawl_job:{crawl_job_id}", "status", "completed")`, add `record_platform_run(r, crawl_job_id)`.

`server/workers/scraper_worker.py`: add `from workers.tasks.platform_runs import record_platform_run` to the imports and `URL_UNREACHABLE_MESSAGE = "URL konnte nicht erreicht werden"` below `logger = get_logger(__name__)`. Then:

- In `schedule_crawls_task`, empty-links branch: after `r.hset(f"crawl_job:{job_id}", "status", "completed")` add `record_platform_run(r, job_id)` (same indentation).
- In `schedule_crawls_task`, initial-run branch: after the `r.hset(f"crawl_job:{job_id}", mapping={..., "status": "completed"},)` call add `record_platform_run(r, job_id)`.
- In `_mark_scrape_failed`: after `r.hset(f"crawl_job:{job_id}", "status", "completed")` add `record_platform_run(r, job_id)`.
- In `scrape_job_detail_task`, download-failure branch: replace both literals `"URL konnte nicht erreicht werden"` with `URL_UNREACHABLE_MESSAGE`, and after the `crawl_job_failed` `r.publish(...)` add `record_platform_run(r, job_id, error=URL_UNREACHABLE_MESSAGE)`.

`server/workers/tasks/analyze.py`: in `analyze_job_task`, directly after the single line `jobs_saved = int(r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_saved", 1))`, add:

```python
            if not auto_archive:
                r.hincrby(f"crawl_job:{crawl_job_id}", "jobs_matched", 1)
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platform_runs.py tests/test_scraper_api.py tests/test_analyze_task.py tests/test_platforms_router.py
```

Expected: `36 passed` (7 + 3 + 6 + 20).

- [ ] **Step 8: Checkpoint: run the full suite**

Run the full-suite command. Expected: `279 passed`.

---

### Task 12: Package cancel honoured (B10)

**Files:**
- Modify: `server/core/job_status.py` (`STATUS_GENERATING`)
- Modify: `server/workers/tasks/package.py` (import, new `_generation_cancelled`, result handling in `generate_application_package_task`)
- Test: `server/tests/test_package_cancel.py` (new)

**Interfaces:**
- Consumes: `fake_redis`, `session_factory`, `seed`, factories.
- Produces: `STATUS_GENERATING = "GENERATING"`; `_generation_cancelled(db, job) -> bool`. `ai.generate_application_package` writes nothing (no HTML, no documents, no status, no event) when the job left `GENERATING` while the AI ran.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/test_package_cancel.py`:

```python
from unittest.mock import patch

import pytest

from database.core import JobDocument, JobEntry
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_job, make_profile, make_user
from workers.tasks.package import generate_application_package_task

CV_RESULT = ("<p>Tailored CV</p>", b"%PDF-cv", {})
LETTER_RESULT = ("Dear team", "<p>Dear team</p>", b"%PDF-letter")
WITHOUT_PROFILE_DOCUMENTS = False


@pytest.fixture()
def run_package(session_factory, seed, fake_redis):
    """Run the package task; the AI-plus-render builders are replaced by fixed results."""
    def _run(status: str):
        seed(make_user(), make_profile(), make_job(status=status))
        with patch("workers.tasks.package.SessionLocal", session_factory), \
             patch("workers.tasks.package.redis.from_url", return_value=fake_redis), \
             patch("workers.tasks.package.get_client_and_model", return_value=(None, "test-model")), \
             patch("workers.tasks.package._build_cv", return_value=CV_RESULT), \
             patch("workers.tasks.package._build_letter", return_value=LETTER_RESULT):
            generate_application_package_task("job-1", TEST_USER_ID, WITHOUT_PROFILE_DOCUMENTS)
    return _run


def _document_kinds(session_factory) -> list:
    with session_factory() as db:
        return sorted(doc.kind for doc in db.query(JobDocument).all())


def test_package_results_discarded_when_generation_cancelled(run_package, session_factory, fake_redis):
    run_package("DRAFTED")
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.cv_html, _document_kinds(session_factory)) == ("DRAFTED", None, [])
    assert events_of_type(fake_redis, "job_update") == []


def test_package_results_stored_while_still_generating(run_package, session_factory):
    run_package("GENERATING")
    job = fetch(session_factory, JobEntry, "job-1")
    assert (job.status, job.cv_html) == ("DRAFTED", "<p>Tailored CV</p>")
    assert _document_kinds(session_factory) == ["GENERATED_CV", "GENERATED_LETTER"]
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_package_cancel.py
```

Expected: `test_package_results_discarded_when_generation_cancelled` FAILS (`cv_html` is set and two documents exist); the other passes.

- [ ] **Step 3: Implement**

In `server/core/job_status.py`, below `STATUS_OPEN = "OPEN"`, add `STATUS_GENERATING = "GENERATING"`.

In `server/workers/tasks/package.py` add `from core.job_status import STATUS_GENERATING` to the imports and, directly above `@celery_app.task(name="ai.generate_application_package")`:

```python
def _generation_cancelled(db, job) -> bool:
    """True when the user cancelled (or moved the job on) while the AI was still running."""
    db.refresh(job)
    return job.status != STATUS_GENERATING
```

In `generate_application_package_task`, replace the block inside the `with ThreadPoolExecutor(...)` that starts at `if "cv" in futures:` and ends after the `GENERATED_LETTER` `store_generated_document(...)` call with:

```python
            cv_result = futures["cv"].result() if "cv" in futures else None
            letter_result = futures["letter"].result() if "letter" in futures else None

        if _generation_cancelled(db, job):
            logger.info(f"Job {job_id} is no longer GENERATING; discarding the generated package.")
            return

        if cv_result:
            cv_html, cv_pdf, _ = cv_result
            job.cv_html = cv_html
            store_generated_document(
                db, job.id, target_user_id, cv_pdf,
                original_filename=f"Lebenslauf_{_safe(job.company)}.pdf",
                mime_type="application/pdf", kind="GENERATED_CV", storage=storage,
            )
        if letter_result:
            letter_text, letter_html, letter_pdf = letter_result
            job.application_draft = letter_text
            job.cover_letter_html = letter_html
            store_generated_document(
                db, job.id, target_user_id, letter_pdf,
                original_filename=f"Anschreiben_{_safe(job.company)}.pdf",
                mime_type="application/pdf", kind="GENERATED_LETTER", storage=storage,
            )
```

The `# --- 3. Profile documents` block, `job.status = "DRAFTED"` and the `_publish(...)` that follow stay as they are (now after the cancel check, at the outer indentation they already have).

- [ ] **Step 4: Run the tests to verify they pass**

```bash
. /tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_package_cancel.py
```

Expected: `2 passed`.

- [ ] **Step 5: Checkpoint: run the full suite**

Run the full-suite command. Expected: `281 passed`.

---

### Task 13: Update the context docs

**Files:**
- Modify: `context/progress-tracker.md`
- Modify: `context/architecture.md`

**Interfaces:**
- Consumes: the final state of Tasks 1-12.
- Produces: docs only.

- [ ] **Step 1: Update `context/progress-tracker.md`**

1. Header: `### 1. Current Status (As of 2026-10-08)`.
2. Replace the Phase line with:

   ```markdown
   **Phase:** Frontend Redesign: Phase 0 (backend B1-B11) is done; next is Phase 1, the `web/` scaffold.
   ```

3. Replace the Risk line with:

   ```markdown
   > ⚠️ **Risk:** `routers/auth.py` still has 0% automated test coverage. `routers/jobs.py` is now covered by `tests/test_jobs_router.py` (list, detail, status, archive, checklist/to-dos), but its document upload/download endpoints are not.
   ```

   (The warning emoji is already in the file; keep it or drop it, but add no new ones.)

4. Append this Status Board row:

   ```markdown
   | **Frontend Redesign — Phase 0 backend** | ✅ Completed (`server/core/job_status.py`, `server/workers/tasks/platform_runs.py`, `server/routers/jobs.py`, `server/routers/settings.py`, `server/routers/platforms.py`, `server/routers/dashboard.py`, `server/core/connection_manager.py`, `server/workers/tasks/{analyze,package,research,application,crawl_status,fill_cv_template}.py`, `server/workers/scraper_worker.py`, `server/scraper_api.py`, `server/database/core.py`, migration `r0s1t2u3v4w5`) | Spec `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` B1-B11: `POST /jobs/{id}/status` via the transition table (`update-status` and PATCH `status` removed); partial `POST /settings` and `/notification-settings`; WS events scoped by top-level `user_id` plus `template_ready`; `jobs.archive_reason` / `kept_by_user`; `GET /matching-preference/preview` and `apply_to_existing`; `GET /jobs` returns `{items,total}` with `q`, `company`, `statuses`, `archive_reason`, page cap 100; `/dashboard-data` excludes SEEN; `jobs.checklist` / `jobs.todos`; wizard `initial_run` (`analyze`/`seed`/`none`); `job_platforms.last_run`; package cancel honoured; complete `GET /jobs/{id}`. 281 tests green. Old `frontend/` is knowingly broken on status changes and the jobs list until the cutover. |
   ```

5. Append to section 4 (ADRs):

   ```markdown
   * **Status Transition Table:** `server/core/job_status.py::ALLOWED_TRANSITIONS` is the single source for user status changes. It is permissive (backward moves and skips are allowed and always recorded in `job_status_history`). `SEEN`, `GENERATING` and `FAILED` can never be a target (400); `SEEN` and `GENERATING` cannot be left by hand (409); unknown legacy values may move to any user status. A status change on an archived job restores it. The web `domain/` mirror must match this table.
   * **Archive Reason:** `jobs.archive_reason` (`THRESHOLD` | `USER`) separates "Unter Schwellwert" from "Von dir aussortiert". Any user restore sets `jobs.kept_by_user`, and threshold runs never archive kept, favourite or non-`OPEN` jobs. Rows archived before migration `r0s1t2u3v4w5` were backfilled: `THRESHOLD` if the score is below the owner's active threshold, otherwise `USER`.
   * **API Deviations (Redesign):** no `/api/v1` prefix, no UUID ids, no unified error envelope. The new client normalises the existing error shapes (spec section 2.4).
   ```

6. Append to section 5 (Open Questions), the backend points the spec puts out of scope:

   ```markdown
   * **Deferred backend points (redesign spec section 3):** unified error envelope; `/api/v1` prefix; `crawl_interval_minutes` is stored but unused by the scheduler; password change does not bump `token_version`; Google Drive files cannot be viewed or downloaded in-app; OAuth `state` is the raw user id; notification templates cannot have type `SMTP`.
   ```

- [ ] **Step 2: Update `context/architecture.md`**

1. Section 2, `server/core/` bullet: append `` `job_status.py` (status transition table, archive/restore rules shared by routers and workers) ``.
2. Section 2, `tasks/` bullet: append `` `platform_runs.py` (per-platform last-run summary written when a crawl finishes) `` and `` `fill_cv_template.py` (AI annotation of uploaded CV templates; emits `template_ready`) ``.
3. Section 3: replace the `jobs` bullet with

   ```markdown
   * `jobs` — Crawled postings, matching scores/reasoning, and editable `cv_html` / `cover_letter_html` blocks (the single source of truth for PDF rendering). Lifecycle: `status` (changed by users only through `POST /jobs/{id}/status`), `is_archived` + `archive_reason` (`THRESHOLD` | `USER`), `kept_by_user` (shields a restored job from threshold runs). Job page data: `checklist` (`posting_opened`, `documents_checked`, `sent`), `todos` (max 50 `{id, text, done}`).
   ```

   and the `job_platforms` bullet with

   ```markdown
   * `job_platforms` — Registered sites, cron schedules, matching URL patterns, notification overrides, and `last_run` (`{started_at, finished_at, found, new, matched, error?}` of the latest finished crawl).
   ```

4. Section 4: append

   ```markdown
   5. **WebSocket Scoping:** Every user-related pub/sub event carries a top-level `user_id` and is delivered only to that user's sockets. Only `ai_error` and `ai_error_cleared` (`GLOBAL_EVENT_TYPES` in `core/connection_manager.py`) go to everyone; any other event without `user_id` is dropped and logged.
   6. **Status Transitions:** User status changes go only through `POST /jobs/{id}/status`, are validated against `core/job_status.py::ALLOWED_TRANSITIONS` and always write `job_status_history`. Workers may still set the system states (`GENERATING`, `DRAFTED`, `FAILED`) directly.
   ```

- [ ] **Step 3: Checkpoint: run the full suite**

Run the full-suite command. Expected: `281 passed`.

---

## Self-Review

**Spec coverage (section 3):**

| Item | Task |
|---|---|
| B1 `POST /jobs/{id}/status`, table, always history, returns job, old paths removed, system-only 400 | 5 |
| B2 partial `/settings` and `/notification-settings` | 8 |
| B3 top-level `user_id` on `new_job`, `job_updated`, `interview_prep_ready`, `company_profile_ready`, `global_error`, `crawl_completed`; drop unscoped; whitelist; `template_ready` | 9 |
| B4 `archive_reason`, auto=THRESHOLD, manual=USER, restore clears and sets `kept_by_user`, `GET /jobs?archive_reason` | 1, 4 |
| B5 preview, `apply_to_existing`, exclusions (favourite, kept, non-OPEN), restore above | 6 |
| B6 `q`, `company`, `statuses`, `{items,total}`, cap 100, no large columns, `/dashboard-data` excludes SEEN | 3 |
| B7 `checklist` known keys, `todos` <= 50, text <= 500, PATCH | 1, 7 |
| B8 `initial_run` analyze/seed | 10 |
| B9 `platforms.last_run` written by crawl + analysis, returned by `GET /platforms` | 1, 11 |
| B10 package discards when not `GENERATING` | 12 |
| B11 detail fields | 2 |
| Migrations before code, tests per change, tracker/architecture docs | 1, all, 13 |

**Placeholder scan:** no TBD/TODO; every code step has code; repeated test command written out in full where it is run against a subset; "run the full-suite command" refers to the exact command in Global Constraints.

**Type consistency:** `ArchiveReason` (str Enum, `.value` stored), `restore_job` / `archive_job` (Task 4) are used in Tasks 5 and 6; `STATUS_OPEN` (Task 6) and `STATUS_GENERATING` (Task 12) are defined where first used; `_get_owned_job`, `_job_detail`, `_derived_job_fields` (Task 2) are used in Tasks 3 and 5; `_apply_search_filters` (Task 3) gains the archive filter in Task 4; `record_platform_run(redis_client, crawl_job_id, error=None)` has the same signature at every call site; `run_analysis` (Task 4) is reused in Tasks 9 and 11; `_archive_state` and `_listed_ids` (Tasks 3-4) are reused in Task 5.

**Review Focus:** each of the five lines has a pinning test in its owning task (Tasks 1, 5, 6, 8).

**Test arithmetic:** 75 + 6 + 3 + 10 + 12 + 121 + 9 + 6 + 6 + 14 + 4 + 13 + 2 = 281.
