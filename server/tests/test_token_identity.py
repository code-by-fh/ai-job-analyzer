"""Session tokens name the account by id and carry their type (ruling R9).

A deleted account's tokens never revive when its username is reused, and an access token never works as a
refresh token or the other way round.
"""

import pytest
from jose import jwt
from starlette.websockets import WebSocketDisconnect

from core.auth import ALGORITHM, SECRET_KEY, create_access_token, get_current_admin_user, get_current_user, get_password_hash
from database.core import User
from main import app
from tests.factories import OTHER_USER_ID, TEST_USER_ID

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
USERNAME = "jonas"
PASSWORD = "richtig-langes-passwort"
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
LATER_USER_ID = OTHER_USER_ID + 1
CLIENT_IP = "203.0.113.7"
FAR_FUTURE = 4102444800  # 2100-01-01
ADMIN = User(id=TEST_USER_ID, username="root", is_admin=True, token_version=0)


@pytest.fixture()
def client(api_client, monkeypatch, session_factory, seed):
    """api_client without its user override, so the cookies decide who calls."""
    for module in ("routers.auth", "routers.websocket"):
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)
    monkeypatch.setattr("routers.platforms.any_crawl_running", lambda user_id, platform_ids: False)
    app.dependency_overrides.pop(get_current_user, None)
    seed(User(id=OTHER_USER_ID, username=USERNAME, is_admin=False, token_version=0,
              hashed_password=get_password_hash(PASSWORD)))
    return api_client


def _sign_in(client) -> dict:
    response = client.post("/auth/login", data={"username": USERNAME, "password": PASSWORD})
    assert response.status_code == 200
    return {ACCESS_COOKIE: response.cookies[ACCESS_COOKIE], REFRESH_COOKIE: response.cookies[REFRESH_COOKIE]}


def _use_cookies(client, cookies: dict) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


def _ws_accepted(client) -> bool:
    try:
        with client.websocket_connect("/ws"):
            return True
    except WebSocketDisconnect:
        return False


def _replace_the_account(client, seed) -> None:
    """An admin deletes "jonas" and creates a new account under the same name, with a new id."""
    # PostgreSQL sequences never hand out an id twice; SQLite reuses the highest one unless a later row exists.
    seed(User(id=LATER_USER_ID, username="later", is_admin=False, token_version=0))
    app.dependency_overrides[get_current_admin_user] = lambda: ADMIN
    try:
        assert client.delete(f"/users/{OTHER_USER_ID}").status_code == 200
        created = client.post("/users", json={"username": USERNAME, "password": PASSWORD})
        assert created.json()["id"] not in (OTHER_USER_ID, LATER_USER_ID)
    finally:
        app.dependency_overrides.pop(get_current_admin_user, None)


def test_the_tokens_name_the_account_by_id_and_type(client):
    cookies = _sign_in(client)
    claims = [jwt.decode(cookies[name], SECRET_KEY, algorithms=[ALGORITHM]) for name in (ACCESS_COOKIE, REFRESH_COOKIE)]
    assert [(claim["sub"], claim["type"]) for claim in claims] == [
        (str(OTHER_USER_ID), "access"), (str(OTHER_USER_ID), "refresh"),
    ]


def test_a_signed_in_session_reaches_me_refresh_and_the_websocket(client):
    _use_cookies(client, _sign_in(client))
    assert client.get("/me").json()["id"] == OTHER_USER_ID
    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    client.cookies.set(ACCESS_COOKIE, refreshed.cookies[ACCESS_COOKIE])
    assert client.get("/me").status_code == 200
    assert _ws_accepted(client)


def test_a_deleted_accounts_access_token_does_not_revive_with_a_reused_name(client, seed):
    old = _sign_in(client)
    _replace_the_account(client, seed)
    _use_cookies(client, old)
    assert client.get("/me").status_code == 401
    assert not _ws_accepted(client)


def test_a_deleted_accounts_refresh_token_does_not_revive_with_a_reused_name(client, seed):
    old = _sign_in(client)
    _replace_the_account(client, seed)
    _use_cookies(client, old)
    assert client.post("/auth/refresh").status_code == 401


def test_a_refresh_token_in_the_access_cookie_is_refused(client):
    refresh = _sign_in(client)[REFRESH_COOKIE]
    _use_cookies(client, {ACCESS_COOKIE: refresh})
    assert client.get("/me").status_code == 401
    assert not _ws_accepted(client)


def test_an_access_token_at_refresh_is_refused(client):
    access = _sign_in(client)[ACCESS_COOKIE]
    _use_cookies(client, {REFRESH_COOKIE: access})
    assert client.post("/auth/refresh").status_code == 401


def test_a_token_naming_the_account_by_username_is_refused(client):
    legacy = create_access_token({"sub": USERNAME, "tv": 0, "type": "access"})
    _use_cookies(client, {ACCESS_COOKIE: legacy})
    assert client.get("/me").status_code == 401
    assert not _ws_accepted(client)


POLICY_VIOLATION = 1008
OVERSIZED_SUBJECT = "9" * 30
# Arabic-Indic digits for OTHER_USER_ID: str.isdecimal() and int() accept them.
NON_ASCII_SUBJECT = "".join(chr(ord("٠") + int(digit)) for digit in str(OTHER_USER_ID))


def _signed(claims: dict) -> str:
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)


def _ws_close_code(client) -> int:
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect("/ws") as socket:
            socket.receive_text()
    return refused.value.code


def test_an_oversized_subject_is_refused_at_me_and_the_websocket(client):
    _use_cookies(client, {ACCESS_COOKIE: create_access_token({"sub": OVERSIZED_SUBJECT, "tv": 0})})
    assert client.get("/me").status_code == 401
    assert _ws_close_code(client) == POLICY_VIOLATION


def test_a_subject_in_non_ascii_digits_is_refused(client):
    _use_cookies(client, {ACCESS_COOKIE: create_access_token({"sub": NON_ASCII_SUBJECT, "tv": 0})})
    assert client.get("/me").status_code == 401


def test_a_signed_token_without_expiry_is_refused(client):
    _use_cookies(client, {ACCESS_COOKIE: _signed({"sub": str(OTHER_USER_ID), "tv": 0, "type": "access"})})
    assert client.get("/me").status_code == 401
    assert _ws_close_code(client) == POLICY_VIOLATION


def _bucket(token: str) -> str:
    from starlette.requests import Request

    from routers.deps import user_or_ip_key
    cookie = f"{ACCESS_COOKIE}={token}".encode()
    return user_or_ip_key(Request({"type": "http", "headers": [(b"cookie", cookie)], "client": (CLIENT_IP, 1)}))


@pytest.mark.parametrize("claims", [
    {"sub": str(TEST_USER_ID), "type": "access"},  # no exp
    {"sub": USERNAME, "type": "access", "exp": FAR_FUTURE},  # a pre-R9 username subject
])
def test_the_rate_limit_bucket_follows_the_session_token_rules(claims):
    assert _bucket(jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)) == CLIENT_IP


def test_a_valid_access_token_picks_the_users_bucket():
    assert _bucket(create_access_token({"sub": str(TEST_USER_ID)})) == f"user:{TEST_USER_ID}"
