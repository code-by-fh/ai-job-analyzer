"""Admin AI contract: validated settings, one answer shape, tests as data, rate limits, error codes."""

from unittest.mock import MagicMock, patch

import httpx
import openai
import pytest
import redis
import requests
from fastapi.testclient import TestClient

from core.auth import get_current_admin_user, get_password_hash
from database.core import JobPlatform, SystemSettings, User
from main import app
from routers.admin import MAX_AVAILABLE_MODELS
from routers.deps import CRAWL_RUNNING
from services.notifications_client import UNAVAILABLE, NotifyError, owner_for
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_platform, make_user
from tests.test_connection_errors import CASES, REASON_OF_MESSAGE

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
RAW = "postgres://user:hunter2@internal-host/db"
ADMIN_TEST_RATE_LIMIT = 10
WIPE_RATE_LIMIT = 5
HTTP_SERVER_ERROR = 500
ADMIN_PASSWORD = "richtig-langes-passwort"
LOCAL_MODEL = "llama3.1:8b"
UPSTREAM_MODEL_COUNT = 300
OVERLONG_MODEL_ID = "x" * 500
# Under the limit each route answers its normal status for an unreachable provider.
LIMITED_ROUTES = [
    ("post", "/admin/test/ollama", 200),
    ("post", "/admin/test/openrouter", 200),
    ("get", "/admin/openrouter/models", 502),
]
# The OpenRouter test classifies only provider and HTTP-client failures; anything else is a bug (500).
PROVIDER_CASES = [case for case in CASES if isinstance(case[0], (openai.APIError, requests.RequestException, httpx.HTTPError))]
T1_ADMIN_ROUTES = [
    ("get", "/admin/settings", None),
    ("post", "/admin/settings", {}),
    ("post", "/admin/test/openrouter", None),
    ("post", "/admin/test/ollama", None),
    ("get", "/admin/openrouter/models", None),
    ("get", "/admin/system-status", None),
    ("post", "/admin/database/wipe", {"password": ADMIN_PASSWORD}),
]


@pytest.fixture()
def admin(api_client, seed, monkeypatch, session_factory):
    monkeypatch.setattr("routers.admin.SessionLocal", session_factory)
    seed(SystemSettings(openrouter_api_key="KEY_SECRET", openrouter_model="m", ollama_base_url="http://llm.lan:1234/v1"))
    app.dependency_overrides[get_current_admin_user] = lambda: User(id=TEST_USER_ID, username="root", is_admin=True)
    yield api_client
    app.dependency_overrides.pop(get_current_admin_user, None)


def _upstream(status_code: int, body=None) -> MagicMock:
    return MagicMock(return_value=MagicMock(ok=status_code < 400, status_code=status_code, json=lambda: body, text=RAW))


@pytest.mark.parametrize("method,path,body", T1_ADMIN_ROUTES)
def test_admin_ai_routes_refuse_a_member(api_client, method, path, body):
    response = getattr(api_client, method)(path, **({"json": body} if body is not None else {}))
    assert response.status_code == 403


@pytest.mark.parametrize("routing", [{"jobs": "cloud"}, {"job_analysis": "gpu"}])
def test_routing_refuses_unknown_tasks_and_providers(admin, routing):
    response = admin.post("/admin/settings", json={"ai_task_routing": routing})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:2] == ["body", "ai_task_routing"]


def test_get_and_post_answer_the_same_merged_routing(admin):
    saved = admin.post("/admin/settings", json={"ai_task_routing": {"job_analysis": "local"}}).json()
    read = admin.get("/admin/settings").json()
    assert saved["ai_task_routing"] == read["ai_task_routing"]
    assert read["ai_task_routing"]["job_analysis"] == "local"
    assert read["ai_task_routing"]["cover_letter"] == "cloud"
    assert "KEY_SECRET" not in str(read) and read["openrouter_api_key_set"] is True


def test_post_answers_the_settings_shape_with_its_status(admin):
    saved = admin.post("/admin/settings", json={"ollama_model": "qwen"}).json()
    assert saved == {"status": "updated", **admin.get("/admin/settings").json()}
    assert saved["ollama_model"] == "qwen" and "KEY_SECRET" not in str(saved)


def test_an_env_only_local_address_is_flagged_but_never_answered(admin, monkeypatch, session_factory):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://llm.lan:11434/v1")
    with session_factory() as db:
        db.query(SystemSettings).update({"ollama_base_url": None})
        db.commit()
    response = admin.get("/admin/settings")
    answer = response.json()
    assert (answer["ollama_base_url"], answer["ollama_base_url_from_env"]) == ("", True)
    assert "llm.lan" not in response.text


def test_without_the_env_address_the_flag_is_false(admin, monkeypatch):
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    assert admin.get("/admin/settings").json()["ollama_base_url_from_env"] is False


@pytest.mark.parametrize("body,field", [
    ({"openrouter_model": "m" * 201}, "openrouter_model"),
    ({"openrouter_api_key": "k" * 501}, "openrouter_api_key"),
    ({"ollama_base_url": "ftp://llm.lan"}, "ollama_base_url"),
    ({"ollama_base_url": "llm.lan:1234"}, "ollama_base_url"),
    ({"ollama_base_url": "http://:1234/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://admin:hunter2@llm.lan:1234/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://admin@llm.lan:1234/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://169.254.169.254/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://[fe80::1]:1234/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://[::ffff:169.254.169.254]/v1"}, "ollama_base_url"),
    # The same link-local address in the other forms an HTTP client resolves numerically.
    ({"ollama_base_url": "http://2852039166/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://0xa9fea9fe/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://0xa9.0xfe.0xa9.0xfe/v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://169.254.169.254./v1"}, "ollama_base_url"),
    ({"ollama_base_url": "http://[fe80::1%25eth0]/v1"}, "ollama_base_url"),
])
def test_provider_fields_are_bounded(admin, body, field):
    response = admin.post("/admin/settings", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


@pytest.mark.parametrize("url", [
    "http://localhost:11434/v1", "http://127.0.0.1:1234/v1", "http://192.168.1.20:1234/v1",
    "http://host.docker.internal:1234/v1", "https://llm.lan/v1", "http://[fd00::5]:1234/v1",
    "http://3232235796:1234/v1", "http://llm.lan.:1234/v1",
])
def test_lan_and_local_model_servers_are_allowed(admin, url):
    response = admin.post("/admin/settings", json={"ollama_base_url": url})
    assert (response.status_code, response.json()["ollama_base_url"]) == (200, url)


def test_the_answer_ignores_stored_unknown_tasks_and_bad_providers(admin, session_factory):
    with session_factory() as db:
        db.query(SystemSettings).update({"ai_task_routing": {"jobs": "cloud", "job_analysis": "gpu", "deep_dive": "local"}})
        db.commit()
    routing = admin.get("/admin/settings").json()["ai_task_routing"]
    assert "jobs" not in routing
    assert (routing["job_analysis"], routing["deep_dive"]) == ("cloud", "local")


def test_a_refused_routing_stores_nothing(admin):
    admin.post("/admin/settings", json={"ai_task_routing": {"job_analysis": "local", "jobs": "cloud"}})
    assert admin.get("/admin/settings").json()["ai_task_routing"]["job_analysis"] == "cloud"


# The SDK error objects are built with real httpx responses in test_connection_errors.CASES.
@pytest.mark.parametrize("error,message", PROVIDER_CASES)
def test_openrouter_test_answers_a_reason_without_raw_text(admin, monkeypatch, error, message):
    reason = REASON_OF_MESSAGE[message]
    fake = MagicMock()
    fake.return_value.chat.completions.create.side_effect = error
    monkeypatch.setattr("openai.OpenAI", fake)
    response = admin.post("/admin/test/openrouter")
    assert (response.status_code, response.json()) == (200, {"ok": False, "reason": reason})
    assert "hunter2" not in response.text and "secret" not in response.text


def test_an_unexpected_openrouter_test_error_reaches_the_global_handler(admin, monkeypatch):
    fake = MagicMock()
    fake.return_value.chat.completions.create.side_effect = RuntimeError(RAW)
    monkeypatch.setattr("openai.OpenAI", fake)
    response = TestClient(app, raise_server_exceptions=False).post("/admin/test/openrouter")
    assert (response.status_code, response.json()) == (500, {"detail": "Internal server error"})


def test_openrouter_test_succeeds_with_the_stored_model(admin, monkeypatch):
    monkeypatch.setattr("openai.OpenAI", MagicMock())
    assert admin.post("/admin/test/openrouter").json() == {"ok": True, "model": "m"}


def test_openrouter_test_without_a_key(admin, session_factory):
    with session_factory() as db:
        db.query(SystemSettings).update({"openrouter_api_key": None})
        db.commit()
    assert admin.post("/admin/test/openrouter").json() == {"ok": False, "reason": "no_key"}


def test_openrouter_test_without_a_model(admin, session_factory):
    with session_factory() as db:
        db.query(SystemSettings).update({"openrouter_model": None})
        db.commit()
    assert admin.post("/admin/test/openrouter").json() == {"ok": False, "reason": "no_model"}


def test_ollama_test_maps_status_and_connection_errors(admin, monkeypatch):
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(return_value=MagicMock(ok=False, status_code=401)))
    assert admin.post("/admin/test/ollama").json() == {"ok": False, "reason": "auth"}
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW)))
    response = admin.post("/admin/test/ollama")
    assert response.json() == {"ok": False, "reason": "unreachable"} and "hunter2" not in response.text


def test_ollama_test_without_an_address(admin, monkeypatch, session_factory):
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    with session_factory() as db:
        db.query(SystemSettings).update({"ollama_base_url": None})
        db.commit()
    assert admin.post("/admin/test/ollama").json() == {"ok": False, "reason": "no_url"}


@pytest.mark.parametrize("body", [None, 7, {"data": None}, {"data": {"id": "m"}}, {"models": []}, "text"])
def test_ollama_test_of_an_answer_without_a_model_list_fails_plainly(admin, monkeypatch, body):
    monkeypatch.setattr("routers.admin.requests.get", _upstream(200, body))
    response = admin.post("/admin/test/ollama")
    assert (response.status_code, response.json()) == (200, {"ok": False, "reason": "failed"})


def test_ollama_test_logs_the_refused_status_without_the_body(admin, monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("routers.admin.logger", logger)
    monkeypatch.setattr("routers.admin.requests.get", _upstream(503, {"error": RAW}))
    assert admin.post("/admin/test/ollama").json() == {"ok": False, "reason": "failed"}
    assert 503 in logger.warning.call_args.args and RAW not in str(logger.warning.call_args_list)


def test_ollama_available_models_are_bounded(admin, monkeypatch):
    ids = [f"model-{index}" for index in range(UPSTREAM_MODEL_COUNT - 2)] + [OVERLONG_MODEL_ID, LOCAL_MODEL]
    monkeypatch.setattr("routers.admin.requests.get", _upstream(200, {"data": [{"id": i} for i in ids]}))
    answer = admin.post("/admin/test/ollama").json()
    assert (answer["ok"], answer["model"], answer["model_found"]) == (True, LOCAL_MODEL, True)
    assert len(answer["available_models"]) == MAX_AVAILABLE_MODELS
    assert OVERLONG_MODEL_ID not in answer["available_models"]


@pytest.mark.parametrize("method,path,expected", LIMITED_ROUTES)
def test_ai_tests_and_the_model_list_are_rate_limited(admin, monkeypatch, method, path, expected):
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW)))
    monkeypatch.setattr("openai.OpenAI", MagicMock(side_effect=requests.ConnectionError(RAW)))
    codes = [getattr(admin, method)(path).status_code for _ in range(ADMIN_TEST_RATE_LIMIT + 1)]
    assert codes == [expected] * ADMIN_TEST_RATE_LIMIT + [429]


def test_models_never_answer_the_upstream_status(admin, monkeypatch):
    monkeypatch.setattr("routers.admin.requests.get", _upstream(401, {"error": RAW}))
    response = admin.get("/admin/openrouter/models")
    assert (response.status_code, response.json()) == (502, {"detail": "openrouter_failed"})
    assert "hunter2" not in response.text and "KEY_SECRET" not in response.text


def test_models_answer_502_when_openrouter_is_unreachable(admin, monkeypatch):
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW)))
    response = admin.get("/admin/openrouter/models")
    assert (response.status_code, response.json()) == (502, {"detail": "openrouter_failed"})


@pytest.mark.parametrize("body", [None, [], {"data": None}, {"data": {"id": "m"}}, {"data": [7, {"id": 5}]}])
def test_models_of_an_answer_without_a_model_list_are_empty(admin, monkeypatch, body):
    monkeypatch.setattr("routers.admin.requests.get", _upstream(200, body))
    response = admin.get("/admin/openrouter/models")
    assert (response.status_code, response.json()) == (200, [])


def test_models_without_a_key_are_400_no_key(admin, session_factory):
    with session_factory() as db:
        db.query(SystemSettings).update({"openrouter_api_key": None})
        db.commit()
    response = admin.get("/admin/openrouter/models")
    assert (response.status_code, response.json()) == (400, {"detail": "no_key"})


def test_system_status_answers_the_code_not_the_text(admin, monkeypatch, fake_redis):
    stored = {"system:ai_404_error": "OpenRouter API-Schlüssel ungültig (401).", "system:ai_error_code": "auth"}
    fake_redis.get.side_effect = stored.get
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    assert admin.get("/admin/system-status").json() == {"ai_error": "auth"}


def test_system_status_of_an_old_text_without_code_is_unknown(admin, monkeypatch, fake_redis):
    fake_redis.get.side_effect = {"system:ai_404_error": "alt"}.get
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    assert admin.get("/admin/system-status").json() == {"ai_error": "unknown"}


def test_system_status_during_a_redis_outage_is_503(admin, monkeypatch, fake_redis):
    fake_redis.get.side_effect = redis.ConnectionError(RAW)
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    response = admin.get("/admin/system-status")
    assert (response.status_code, response.json()) == (503, {"detail": "status_unavailable"})
    assert "hunter2" not in response.text


def test_system_status_without_an_error_is_null(admin, monkeypatch, fake_redis):
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    assert admin.get("/admin/system-status").json() == {"ai_error": None}


def test_store_and_clear_keep_text_and_code_together(monkeypatch, fake_redis):
    from intelligence import service
    monkeypatch.setattr(service, "_get_redis", lambda: fake_redis)
    service.store_ai_404_error("Text", service.AI_ERROR_RATE_LIMIT)
    fake_redis.set.assert_any_call(service.AI_ERROR_CODE_KEY, "rate_limit")
    service.clear_ai_404_error()
    fake_redis.delete.assert_called_with(service.AI_404_REDIS_KEY, service.AI_ERROR_CODE_KEY)


def _provider_error(cls):
    response = httpx.Response(HTTP_SERVER_ERROR, request=httpx.Request("POST", "https://x.example"))
    return cls(RAW, response=response, body=None)


@pytest.mark.parametrize("error,code", [
    (_provider_error(openai.AuthenticationError), "auth"),
    (_provider_error(openai.RateLimitError), "rate_limit"),
    (_provider_error(openai.NotFoundError), "model_not_found"),
    (openai.APIConnectionError(request=httpx.Request("POST", "https://x.example")), "connection"),
    (_provider_error(openai.InternalServerError), "server"),
])
def test_a_failed_ai_call_stores_its_code(monkeypatch, fake_redis, error, code):
    from intelligence import service
    monkeypatch.setattr(service, "_get_redis", lambda: fake_redis)
    client = MagicMock()
    client.chat.completions.create.side_effect = error
    with pytest.raises(type(error)):
        service._call_openrouter(client, "m", [], func_name="test")
    fake_redis.set.assert_any_call(service.AI_ERROR_CODE_KEY, code)


def test_wipe_with_a_wrong_password_is_400_not_401(admin, session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(ADMIN_PASSWORD)
        db.commit()
    response = admin.post("/admin/database/wipe", json={"password": "falsch"})
    assert (response.status_code, response.json()) == (400, {"detail": "wrong_password"})


def test_wipe_is_rate_limited(admin, session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(ADMIN_PASSWORD)
        db.commit()
    codes = [admin.post("/admin/database/wipe", json={"password": "falsch"}).status_code for _ in range(WIPE_RATE_LIMIT + 1)]
    assert codes == [400] * WIPE_RATE_LIMIT + [429]


@pytest.mark.parametrize("wipe_all_users,owner_id", [(False, TEST_USER_ID), (True, OTHER_USER_ID)])
def test_wipe_is_refused_while_a_source_owners_crawl_runs(
    admin, seed, session_factory, monkeypatch, wipe_all_users, owner_id
):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(ADMIN_PASSWORD)
        db.commit()
    seed(make_platform(user_id=owner_id))
    monkeypatch.setattr("routers.platforms.any_crawl_running", lambda user_id, platform_ids: user_id == owner_id)
    response = admin.post("/admin/database/wipe", json={"password": ADMIN_PASSWORD, "wipe_all_users": wipe_all_users})
    with session_factory() as db:
        remaining = db.query(JobPlatform).count()
    assert (response.status_code, response.json(), remaining) == (409, {"detail": CRAWL_RUNNING}, 1)


def _admin_password(session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(ADMIN_PASSWORD)
        db.commit()


def test_the_wipe_of_all_accounts_deletes_their_channels_after_the_commit(admin, seed, session_factory, notify):
    _admin_password(session_factory)
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID))
    notify.add(owner_for(OTHER_USER_ID), "pushover", {"user_key": "u", "api_token": "t"})
    response = admin.post("/admin/database/wipe", json={"password": ADMIN_PASSWORD, "wipe_all_users": True})
    assert response.status_code == 200
    assert notify.channels == {}


def test_the_wipe_of_all_accounts_survives_a_down_service_and_logs_user_ids_only(admin, seed, session_factory, notify):
    _admin_password(session_factory)
    seed(make_platform(user_id=TEST_USER_ID))
    notify.add(owner_for(TEST_USER_ID), "pushover", {"user_key": "u", "api_token": "t"})
    notify.fail_with(NotifyError(UNAVAILABLE))
    # core.logger loggers do not propagate, so caplog cannot see them.
    with patch("services.user_data.logger") as logger:
        response = admin.post("/admin/database/wipe", json={"password": ADMIN_PASSWORD, "wipe_all_users": True})
    assert response.status_code == 200
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0
    logger.error.assert_called_once_with(
        "Notification channels of user %s not deleted after the wipe (%s)", TEST_USER_ID, UNAVAILABLE
    )


def test_the_own_wipe_while_the_service_is_down_is_a_502_and_deletes_nothing(admin, seed, session_factory, notify):
    _admin_password(session_factory)
    seed(make_platform(user_id=TEST_USER_ID))
    notify.fail_with(NotifyError(UNAVAILABLE))
    response = admin.post("/admin/database/wipe", json={"password": ADMIN_PASSWORD, "wipe_all_users": False})
    assert (response.status_code, response.json()) == (502, {"detail": "notification_service_unavailable"})
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 1
