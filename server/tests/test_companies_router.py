import hashlib
import threading
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from openai import APIConnectionError

from database.core import CompanyDeepDive, CompanyProfile
from tests.factories import TEST_USER_ID, events_of_type, make_user
from workers.tasks.time_limits import GENERATION_SWEEP_MARGIN_SECONDS, SYNC_AI_RUN_LIMIT_SECONDS

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
DEEP_DIVE_BODY = {
    "focus": "culture", "how_to_proceed": "short", "company_name": "ACME", "title": "Dev",
}
OTHER_USER_ID = 2
SECRET = "postgres://user:hunter2@internal-host/db"


@pytest.fixture()
def failing_ai(api_client, monkeypatch, session_factory):
    monkeypatch.setattr("routers.companies.SessionLocal", session_factory)
    monkeypatch.setattr("routers.companies.get_client_and_model", lambda task, db: (MagicMock(), "m"))

    def _fail(error):
        def _raise(**_kwargs):
            raise error
        monkeypatch.setattr("routers.companies.generate_deep_dive", _raise)
    return _fail


def test_deep_dive_hides_internal_error_text_and_logs_it(api_client, failing_ai, monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("routers.companies.logger", logger)
    failing_ai(RuntimeError(SECRET))
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert response.status_code == 500
    assert response.json() == {"detail": "Deep dive failed"}
    assert logger.error.call_args.kwargs["exc_info"] is True


def test_deep_dive_upstream_ai_error_returns_502_without_details(api_client, failing_ai):
    failing_ai(APIConnectionError(request=MagicMock()))
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert response.status_code == 502
    assert response.json() == {"detail": "Deep dive failed"}


RESULT = "## Culture\nFlat hierarchies."


@pytest.fixture()
def run_events(monkeypatch, fake_redis):
    monkeypatch.setattr("services.run_events.events_redis", lambda: fake_redis)
    return fake_redis


@pytest.fixture()
def answering_ai(failing_ai, monkeypatch, session_factory):
    """The deep dive answers RESULT; records whether its run was committed as running when the AI was asked."""
    seen = {}

    def _answer(**_kwargs):
        seen["running"] = _stored_run(session_factory).started_at is not None
        return RESULT
    monkeypatch.setattr("routers.companies.generate_deep_dive", _answer)
    return seen


def _stored_run(session_factory) -> CompanyDeepDive:
    with session_factory() as db:
        return db.query(CompanyDeepDive).one()


def _runs_shown(api_client, seed) -> list:
    seed(CompanyProfile(domain="acme.de", name="ACME", raw_data={}))
    return api_client.get("/companies/acme.de").json()["deep_dive_runs"]


def test_deep_dive_is_stamped_running_before_the_ai_call_and_stores_its_result(
    api_client, answering_ai, session_factory, run_events,
):
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    run = _stored_run(session_factory)
    assert (response.json(), answering_ai) == ({"result": RESULT}, {"running": True})
    assert (run.started_at, run.error, run.result, run.focus) == (None, None, RESULT, "culture")
    assert events_of_type(run_events, "deep_dive_ended") == [
        {"type": "deep_dive_ended", "user_id": TEST_USER_ID, "domain": "acme.de"}
    ]


def test_company_profile_shows_the_users_deep_dive_runs(api_client, answering_ai, seed, run_events):
    api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert _runs_shown(api_client, seed) == [{
        "focus": "culture", "deep_dive_running": False, "deep_dive_started_at": None,
        "deep_dive_error": None, "deep_dive_result": RESULT,
    }]


def test_company_profile_shows_a_running_deep_dive_with_its_start(api_client, failing_ai, seed):
    seed(_run(started_at=datetime(2026, 10, 16, 9, 30, tzinfo=timezone.utc)))
    run = _runs_shown(api_client, seed)[0]
    assert (run["deep_dive_running"], run["deep_dive_started_at"]) == (True, "2026-10-16T09:30:00+00:00")


def test_company_profile_never_shows_another_users_deep_dives(api_client, failing_ai, seed):
    seed(make_user(OTHER_USER_ID), _run(user_id=OTHER_USER_ID))
    assert _runs_shown(api_client, seed) == []


def test_failed_deep_dive_keeps_the_last_result_and_stores_the_fixed_error(
    api_client, failing_ai, seed, session_factory, run_events,
):
    seed(_run(result=RESULT))
    failing_ai(APIConnectionError(request=MagicMock()))
    api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    run = _stored_run(session_factory)
    assert (run.started_at, run.error, run.result) == (None, "DEEP_DIVE_FAILED", RESULT)
    assert len(events_of_type(run_events, "deep_dive_ended")) == 1


def test_deep_dive_while_the_same_one_runs_is_refused(api_client, failing_ai, seed, session_factory):
    started = datetime.now(timezone.utc)
    seed(_run(started_at=started))
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert (response.status_code, response.json()) == (409, {"detail": "deep_dive_running"})
    assert _stored_run(session_factory).started_at is not None


def test_next_run_of_a_failed_deep_dive_clears_its_error(api_client, answering_ai, seed, session_factory, run_events):
    seed(_run(error="DEEP_DIVE_FAILED"))
    api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert (_stored_run(session_factory).error, _stored_run(session_factory).result) == (None, RESULT)


def _run(**overrides) -> CompanyDeepDive:
    fields = {"user_id": TEST_USER_ID, "domain": "acme.de", "focus": "culture",
              "focus_hash": hashlib.sha256(b"culture").hexdigest()}
    fields.update(overrides)
    return CompanyDeepDive(**fields)


STALE_RUN_AGE = timedelta(seconds=SYNC_AI_RUN_LIMIT_SECONDS + GENERATION_SWEEP_MARGIN_SECONDS + 60)


def test_deep_dive_with_every_ai_slot_taken_is_503_and_starts_no_run(
    api_client, answering_ai, session_factory, monkeypatch,
):
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr("routers.sync_ai_runs._sync_ai_slots", slots)
    slots.acquire()
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert (response.status_code, response.json(), answering_ai) == (503, {"detail": "ai_busy"}, {})
    with session_factory() as db:
        assert db.query(CompanyDeepDive).count() == 0


def test_deep_dive_gives_its_ai_slot_back_after_a_run(api_client, answering_ai, monkeypatch, run_events):
    monkeypatch.setattr("routers.sync_ai_runs._sync_ai_slots", threading.BoundedSemaphore(1))
    statuses = [api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY).status_code for _ in range(2)]
    assert statuses == [200, 200]


def test_deep_dive_replaces_a_stale_run_whose_request_died(api_client, answering_ai, seed, session_factory, run_events):
    seed(_run(started_at=datetime.now(timezone.utc) - STALE_RUN_AGE))
    response = api_client.post("/companies/acme.de/deep-dive", json=DEEP_DIVE_BODY)
    assert (response.status_code, answering_ai) == (200, {"running": True})
    assert _stored_run(session_factory).result == RESULT
