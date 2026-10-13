"""Google Drive OAuth: the callback trusts only a signed, short-lived state bound to the browser that started the login."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.oauth_state import OAUTH_STATE_TTL_SECONDS, sign_oauth_state
from database.core import UserProfile
from routers.storage import DRIVE_OAUTH_NONCE_COOKIE, GOOGLE_TOKEN_URL
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_profile, make_user

FRONTEND_URL = "https://jobs.example.com"
FAILED = f"{FRONTEND_URL}/settings?error=google_auth_failed"
CONNECTED = f"{FRONTEND_URL}/settings?tab=storage&success=google_connected"
CODE = "google-code"
DRIVE_REFRESH_TOKEN = "drive-refresh-token"
DRIVE_EMAIL = "me@example.com"
LONG_EXPIRED = 1
CALLBACK = "/storage/google/callback"
NOT_CONNECTED = (None, None, "NONE")
FAR_FUTURE = 4_102_444_800  # 2100-01-01
NON_ASCII = "é"


class FakeGoogle:
    """Answers the token exchange and the userinfo call the way Google does on a granted consent."""

    def __init__(self):
        self.calls = []
        self.userinfo = {"email": DRIVE_EMAIL}
        self.tokens = {"access_token": "access", "refresh_token": DRIVE_REFRESH_TOKEN}
        self.unreachable = False
        self.html_answer = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(str(request.url))
        if self.unreachable:
            raise httpx.ConnectError("unreachable", request=request)
        if self.html_answer:
            return httpx.Response(200, text="<html>Service unavailable</html>")
        if str(request.url) == GOOGLE_TOKEN_URL:
            return httpx.Response(200, json=self.tokens)
        return httpx.Response(200, json=self.userinfo)


@pytest.fixture()
def google(api_client, seed, session_factory, monkeypatch):
    fake = FakeGoogle()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda: real_client(transport=httpx.MockTransport(fake.handle)))
    monkeypatch.setattr("routers.storage.SessionLocal", session_factory)
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("FRONTEND_URL", FRONTEND_URL)
    seed(make_user(OTHER_USER_ID), make_profile(), make_profile(user_id=OTHER_USER_ID))
    return fake


def _start_login(api_client) -> tuple:
    response = api_client.get("/storage/google/login", follow_redirects=False)
    [state] = parse_qs(urlparse(response.headers["location"]).query)["state"]
    return state, response.cookies[DRIVE_OAUTH_NONCE_COOKIE]


def _callback(api_client, nonce, **params) -> str:
    # A raw UTF-8 header: the cookie jar refuses non-ASCII values, which the junk tests need.
    headers = {"cookie": f"{DRIVE_OAUTH_NONCE_COOKIE}={nonce}".encode()} if nonce else {}
    response = api_client.get(CALLBACK, params=params, headers=headers, follow_redirects=False)
    assert response.status_code == 307
    return response.headers["location"]


def _drive(session_factory, user_id: int) -> tuple:
    with session_factory() as db:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).one()
        return profile.google_drive_refresh_token, profile.google_drive_email, profile.active_storage_service


def test_a_valid_state_connects_the_drive_of_the_user_who_started(api_client, google, session_factory):
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, code=CODE, state=state) == CONNECTED
    assert _drive(session_factory, TEST_USER_ID) == (DRIVE_REFRESH_TOKEN, DRIVE_EMAIL, "GOOGLE_DRIVE")


def test_a_forged_state_for_another_user_is_refused(api_client, google, session_factory):
    state, nonce = _start_login(api_client)
    forged = state.replace(f"{TEST_USER_ID}.", f"{OTHER_USER_ID}.", 1)
    assert _callback(api_client, nonce, code=CODE, state=forged) == FAILED
    assert _drive(session_factory, OTHER_USER_ID) == NOT_CONNECTED
    assert google.calls == []


def test_an_expired_state_is_refused(api_client, google, session_factory):
    expired = sign_oauth_state(TEST_USER_ID, "nonce", LONG_EXPIRED)
    assert _callback(api_client, "nonce", code=CODE, state=expired) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED
    assert google.calls == []


def test_a_state_from_another_browser_is_refused(api_client, google, session_factory):
    state, _ = _start_login(api_client)
    assert _callback(api_client, "other-browser-nonce", code=CODE, state=state) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED


def test_a_cancelled_consent_redirects_with_the_error(api_client, google, session_factory):
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, error="access_denied", state=state) == FAILED
    assert google.calls == []


@pytest.mark.parametrize("params", [{"code": CODE, "state": "abc"}, {"code": CODE}, {}])
def test_a_junk_or_missing_state_redirects_with_the_error(api_client, google, params):
    assert _callback(api_client, None, **params) == FAILED
    assert google.calls == []


def test_an_unreachable_google_is_no_server_error(api_client, google, session_factory):
    google.unreachable = True
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED


@pytest.mark.parametrize("state,nonce", [
    (f"{TEST_USER_ID}.nonce.{FAR_FUTURE}.{NON_ASCII}", "nonce"),
    (sign_oauth_state(TEST_USER_ID, NON_ASCII, FAR_FUTURE), NON_ASCII),
])
def test_a_non_ascii_state_or_nonce_redirects_with_the_error(api_client, google, state, nonce):
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED
    assert google.calls == []


def test_a_non_json_answer_from_google_is_no_server_error(api_client, google, session_factory):
    google.html_answer = True
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED


def test_a_database_error_while_storing_is_no_server_error(api_client, google, monkeypatch):
    state, nonce = _start_login(api_client)
    without_tables = create_engine("sqlite:///:memory:")
    monkeypatch.setattr("routers.storage.SessionLocal", sessionmaker(bind=without_tables))
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED


@pytest.mark.parametrize("answer", ["tokens", "userinfo"])
@pytest.mark.parametrize("body", [[1], "x"])
def test_a_json_answer_that_is_no_object_is_no_server_error(api_client, google, session_factory, answer, body):
    setattr(google, answer, body)
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED


def test_the_nonce_cookie_is_sent_back_on_every_api_path(api_client, google):
    response = api_client.get("/storage/google/login", follow_redirects=False)
    [cookie] = [value for key, value in response.headers.multi_items() if key == "set-cookie"]
    attributes = {part.strip().lower() for part in cookie.split(";")[1:]}
    expected = {"httponly", "samesite=lax", f"max-age={OAUTH_STATE_TTL_SECONDS}", "path=/"}
    assert expected <= attributes


def test_a_userinfo_without_email_is_no_success(api_client, google, session_factory):
    google.userinfo = {}
    state, nonce = _start_login(api_client)
    assert _callback(api_client, nonce, code=CODE, state=state) == FAILED
    assert _drive(session_factory, TEST_USER_ID) == NOT_CONNECTED


@pytest.mark.parametrize("client_id, client_secret", [(None, "client-secret"), ("client-id", None)])
def test_a_login_on_an_unconfigured_server_redirects_with_the_error(
    api_client, google, monkeypatch, client_id, client_secret
):
    # The browser tab navigates here directly: a raw 500 JSON would replace the app.
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", client_id)
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_SECRET", client_secret)
    response = api_client.get("/storage/google/login", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == FAILED
    assert "configured" not in response.text
    assert google.calls == []
