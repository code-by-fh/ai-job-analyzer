import pytest

from database.core import SystemSettings
from tests.factories import OTHER_USER_ID, make_job, make_platform, make_profile, make_user

OPENROUTER_KEY = "sk-or-test"
OLLAMA_URL = "http://ollama.local:11434/v1"
NOTHING = {"has_source": False, "ai_configured": False, "profile_complete": False, "has_jobs": False}


@pytest.fixture(autouse=True)
def no_env_ai(monkeypatch):
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)


def _status(api_client) -> dict:
    return api_client.get("/setup-status").json()


def test_fresh_account_has_nothing_set_up(api_client):
    assert _status(api_client) == NOTHING


def test_reports_source_profile_and_jobs(api_client, seed):
    seed(make_platform(), make_profile(), make_job())
    body = _status(api_client)
    assert (body["has_source"], body["profile_complete"], body["has_jobs"]) == (True, True, True)


LOCAL_ANALYSIS = {"job_analysis": "local"}


def test_ollama_url_counts_when_analysis_is_routed_local(api_client, seed):
    seed(SystemSettings(id=1, ollama_base_url=OLLAMA_URL, ai_task_routing=LOCAL_ANALYSIS))
    assert _status(api_client)["ai_configured"] is True


def test_ollama_url_alone_does_not_count_with_default_cloud_routing(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key="  ", ollama_base_url=OLLAMA_URL))
    assert _status(api_client)["ai_configured"] is False


def test_openrouter_key_counts_with_default_cloud_routing(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key=OPENROUTER_KEY))
    assert _status(api_client)["ai_configured"] is True


def test_openrouter_key_alone_does_not_count_when_analysis_is_routed_local(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key=OPENROUTER_KEY, ai_task_routing=LOCAL_ANALYSIS))
    assert _status(api_client)["ai_configured"] is False


def test_env_ollama_url_counts_when_analysis_is_routed_local(api_client, seed, monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", OLLAMA_URL)
    seed(SystemSettings(id=1, ai_task_routing=LOCAL_ANALYSIS))
    assert _status(api_client)["ai_configured"] is True


def test_env_ollama_url_alone_does_not_count_without_settings_row(api_client, monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", OLLAMA_URL)
    assert _status(api_client)["ai_configured"] is False


def test_nothing_configured_in_db_or_env(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key=" ", ollama_base_url=""))
    assert _status(api_client)["ai_configured"] is False


def test_response_exposes_booleans_only(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key=OPENROUTER_KEY, ollama_base_url=OLLAMA_URL))
    body = api_client.get("/setup-status").json()
    assert all(isinstance(v, bool) for v in body.values())
    assert OPENROUTER_KEY not in str(body) and OLLAMA_URL not in str(body)


def test_profile_without_skills_is_incomplete(api_client, seed):
    seed(make_profile(skills="  "))
    assert _status(api_client)["profile_complete"] is False


def test_seen_placeholders_and_other_users_do_not_count(api_client, seed):
    seed(
        make_user(OTHER_USER_ID),
        make_job(status="SEEN"),
        make_job(id="foreign", user_id=OTHER_USER_ID),
        make_platform(id=99, user_id=OTHER_USER_ID),
    )
    assert _status(api_client) == NOTHING
