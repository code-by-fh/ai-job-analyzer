from unittest.mock import MagicMock

import pytest
from openai import APIConnectionError

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
DEEP_DIVE_BODY = {
    "focus": "culture", "how_to_proceed": "short", "company_name": "ACME", "title": "Dev",
}
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
