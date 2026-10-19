import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from database.core import CompanyProfile, JobEntry, UserProfile
from tests.factories import TEST_USER_ID, make_job, make_profile

SERVER_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = SERVER_DIR / "database" / "migrations"
PHASE0_REVISION = "r0s1t2u3v4w5"
PREVIOUS_HEAD = "q9r0s1t2u3v4"
INTERVIEW_AT_REVISION = "t2u3v4w5x6y7"
GENERATION_STARTED_AT_REVISION = "u3v4w5x6y7z8"
PLATFORM_RUNS_REVISION = "v4w5x6y7z8a9"
INTERVIEW_PREP_STATE_REVISION = "w5x6y7z8a9b0"
COMPANY_RESEARCH_STATE_REVISION = "x6y7z8a9b0c1"
SCHEDULE_TIMES_REVISION = "y7z8a9b0c1d2"
POSTING_EXTRACTED_REVISION = "z8a9b0c1d2e3"
OFFER_OUTCOME_REVISION = "a9b0c1d2e3f4"
NOTIFICATION_CHANNELS_REVISION = "b0c1d2e3f4a5"
RUN_STATE_REVISION = "c1d2e3f4a5b6"
POSTING_DETAILS_STATE_REVISION = "d2e3f4a5b6c7"
DRIVE_REMOVAL_REVISION = "e3f4a5b6c7d8"
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


def test_migration_chain_has_single_head_at_drive_removal_revision():
    assert _script_directory().get_heads() == [DRIVE_REMOVAL_REVISION]


def test_drive_removal_revision_follows_posting_details_state_revision():
    assert _script_directory().get_revision(DRIVE_REMOVAL_REVISION).down_revision == POSTING_DETAILS_STATE_REVISION


def _drive_removal_migration():
    path = MIGRATIONS_DIR / "versions" / f"{DRIVE_REMOVAL_REVISION}_remove_google_drive.py"
    spec = importlib.util.spec_from_file_location("drive_removal_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_drive_removal_deletes_only_documents_whose_file_lives_in_drive():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        for table in ("job_documents", "profile_documents"):
            connection.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, filename TEXT, content BLOB)"))
            connection.execute(text(
                f"INSERT INTO {table} (id, filename, content) VALUES "
                "(1, 'gdrive://Zeugnis.pdf', NULL), (2, 'db://Zeugnis.pdf', x'01'), (3, 'legacy.pdf', NULL)"
            ))
        deleted = sum(connection.execute(statement).rowcount
                      for statement in _drive_removal_migration().drive_only_document_deletes())
        remaining = {
            table: [row[0] for row in connection.execute(text(f"SELECT id FROM {table} ORDER BY id"))]
            for table in ("job_documents", "profile_documents")
        }
    assert (deleted, remaining) == (2, {"job_documents": [2, 3], "profile_documents": [2, 3]})


def test_the_profile_model_has_no_storage_columns_left():
    assert {"active_storage_service", "google_drive_refresh_token", "google_drive_email"}.isdisjoint(
        UserProfile.__table__.columns.keys()
    )


def test_posting_details_state_revision_follows_run_state_revision():
    revision = _script_directory().get_revision(POSTING_DETAILS_STATE_REVISION)
    assert revision.down_revision == RUN_STATE_REVISION


def test_run_state_revision_follows_notification_channels_revision():
    revision = _script_directory().get_revision(RUN_STATE_REVISION)
    assert revision.down_revision == NOTIFICATION_CHANNELS_REVISION


def test_notification_channels_revision_follows_offer_outcome_revision():
    revision = _script_directory().get_revision(NOTIFICATION_CHANNELS_REVISION)
    assert revision.down_revision == OFFER_OUTCOME_REVISION


def test_offer_outcome_revision_follows_posting_extracted_revision():
    revision = _script_directory().get_revision(OFFER_OUTCOME_REVISION)
    assert revision.down_revision == POSTING_EXTRACTED_REVISION


def test_posting_extracted_revision_follows_schedule_times_revision():
    revision = _script_directory().get_revision(POSTING_EXTRACTED_REVISION)
    assert revision.down_revision == SCHEDULE_TIMES_REVISION


def test_company_research_state_revision_follows_interview_prep_state_revision():
    revision = _script_directory().get_revision(COMPANY_RESEARCH_STATE_REVISION)
    assert revision.down_revision == INTERVIEW_PREP_STATE_REVISION


def _company_research_migration():
    path = MIGRATIONS_DIR / "versions" / f"{COMPANY_RESEARCH_STATE_REVISION}_add_jobs_company_research_state.py"
    spec = importlib.util.spec_from_file_location("company_research_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_company_research_migration_clears_only_unresearched_domains_guessed_from_the_posting_url(db_session):
    db_session.add_all([
        make_job(id="guessed", url="https://www.google.com/url?q=x", company_domain="google.com"),
        make_job(id="researched", url="https://www.acme.de/jobs/1", company_domain="acme.de"),
        make_job(id="typed", url="https://www.google.com/url?q=y", company_domain="bahn.de"),
        CompanyProfile(domain="acme.de", name="Acme"),
    ])
    db_session.commit()
    cleared = _company_research_migration().clear_guessed_company_domains(db_session.connection())
    db_session.commit()
    domains = {job_id: db_session.get(JobEntry, job_id).company_domain for job_id in ("guessed", "researched", "typed")}
    assert (cleared, domains) == (1, {"guessed": None, "researched": "acme.de", "typed": "bahn.de"})


def test_interview_prep_state_revision_follows_platform_runs_revision():
    assert _script_directory().get_revision(INTERVIEW_PREP_STATE_REVISION).down_revision == PLATFORM_RUNS_REVISION


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


def test_schedule_times_revision_follows_company_research_state_revision():
    assert _script_directory().get_revision(SCHEDULE_TIMES_REVISION).down_revision == COMPANY_RESEARCH_STATE_REVISION


def test_schedule_times_migration_wraps_each_single_time_in_a_list():
    path = MIGRATIONS_DIR / "versions" / f"{SCHEDULE_TIMES_REVISION}_schedule_times_list.py"
    spec = importlib.util.spec_from_file_location("schedule_times_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE job_platforms (id INTEGER PRIMARY KEY, schedule_time TEXT, schedule_times JSON)"))
        connection.execute(text("INSERT INTO job_platforms (id, schedule_time) VALUES (1, '08:00'), (2, NULL)"))
        assert migration.backfill_schedule_times(connection) == 1
        rows = connection.execute(text("SELECT id, schedule_times FROM job_platforms ORDER BY id")).fetchall()
    assert [(row[0], row[1]) for row in rows] == [(1, '["08:00"]'), (2, None)]


def test_schedule_times_downgrade_restores_the_first_time_and_tolerates_json_null_and_empty_lists():
    path = MIGRATIONS_DIR / "versions" / f"{SCHEDULE_TIMES_REVISION}_schedule_times_list.py"
    spec = importlib.util.spec_from_file_location("schedule_times_migration_down", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE job_platforms (id INTEGER PRIMARY KEY, schedule_time TEXT, schedule_times JSON)"))
        connection.execute(text(
            "INSERT INTO job_platforms (id, schedule_times) VALUES (1, '[\"08:00\", \"17:30\"]'), (2, 'null'), (3, '[]'), (4, NULL)"
        ))
        migration.restore_schedule_time(connection)
        rows = connection.execute(text("SELECT id, schedule_time FROM job_platforms ORDER BY id")).fetchall()
    assert [(row[0], row[1]) for row in rows] == [(1, "08:00"), (2, None), (3, None), (4, None)]
