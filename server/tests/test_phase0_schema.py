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
INTERVIEW_AT_REVISION = "t2u3v4w5x6y7"
GENERATION_STARTED_AT_REVISION = "u3v4w5x6y7z8"
PLATFORM_RUNS_REVISION = "v4w5x6y7z8a9"
PRE_GENERATION_STATUS_REVISION = "s1t2u3v4w5x6"
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


def test_migration_chain_has_single_head_at_platform_runs_revision():
    assert _script_directory().get_heads() == [PLATFORM_RUNS_REVISION]


def test_platform_runs_revision_follows_generation_started_at_revision():
    assert _script_directory().get_revision(PLATFORM_RUNS_REVISION).down_revision == GENERATION_STARTED_AT_REVISION


def test_generation_started_at_revision_follows_interview_at_revision():
    revision = _script_directory().get_revision(GENERATION_STARTED_AT_REVISION)
    assert revision.down_revision == INTERVIEW_AT_REVISION


def test_interview_at_revision_follows_pre_generation_status_revision():
    revision = _script_directory().get_revision(INTERVIEW_AT_REVISION)
    assert revision.down_revision == PRE_GENERATION_STATUS_REVISION


def test_pre_generation_status_revision_follows_phase0_revision():
    revision = _script_directory().get_revision(PRE_GENERATION_STATUS_REVISION)
    assert revision.down_revision == PHASE0_REVISION


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
