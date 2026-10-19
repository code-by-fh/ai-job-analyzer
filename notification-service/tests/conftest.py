"""Shared fixtures: an app with ephemeral keys, a fake clock, and fakes for the network boundary."""

from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict, Iterator, List

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import net_safety
from app.config import Settings
from app.main import create_app

APP_ID = "job-agent"
OTHER_APP_ID = "other-app"
# Generated per test run (ephemeral), so no key in this file is usable anywhere else.
API_KEY = Fernet.generate_key().decode()
OTHER_API_KEY = Fernet.generate_key().decode()
OWNER = "user-1"
OTHER_OWNER = "user-2"
PUBLIC_TEST_ADDRESS = "93.184.215.14"
PROVIDER_OK = 200

PUSHOVER_TOKEN = "pushover-token-0123456789"
PUSHOVER_USER = "pushover-user-0123456789"
RESEND_KEY = "re_secret_0123456789"
SMTP_PASSWORD = "smtp-password-0123456789"
RECIPIENT = "private.person@example.com"


class FakeClock:
    """A monotonic clock the test moves by hand, so rate-limit windows never depend on wall time."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@dataclass
class ProviderCalls:
    """Every outbound HTTP call the senders made, and the status code the fake provider answers."""

    status_code: int = PROVIDER_OK
    error: Exception | None = None
    calls: List[Dict[str, Any]] = field(default_factory=list)

    def post(self, url: str, **kwargs: Any) -> SimpleNamespace:
        self.calls.append({"url": url, **kwargs})
        if self.error is not None:
            raise self.error
        return SimpleNamespace(status_code=self.status_code, text="provider-said-something")


@pytest.fixture(autouse=True)
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """No test reaches DNS: every host resolves to one public address unless a test patches it again."""
    monkeypatch.setattr(net_safety, "_resolve", lambda host, port: [PUBLIC_TEST_ADDRESS])


@pytest.fixture()
def provider(monkeypatch: pytest.MonkeyPatch) -> ProviderCalls:
    calls = ProviderCalls()
    monkeypatch.setattr("app.delivery.http_providers.requests.post", calls.post)
    return calls


@pytest.fixture()
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture()
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "notify.sqlite3"


@pytest.fixture()
def settings(database_path: Path) -> Settings:
    return Settings(
        api_keys={APP_ID: API_KEY, OTHER_APP_ID: OTHER_API_KEY},
        encryption_keys=(Fernet.generate_key(),),
        database_path=str(database_path),
    )


@pytest.fixture()
def raw_client(settings: Settings, clock: FakeClock) -> Iterator[TestClient]:
    with TestClient(create_app(settings, clock=clock)) as test_client:
        yield test_client


def auth(key: str = API_KEY) -> Dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


@pytest.fixture()
def client(raw_client: TestClient) -> TestClient:
    raw_client.headers.update(auth())
    return raw_client


@pytest.fixture()
def other_app_client(settings: Settings, clock: FakeClock) -> Iterator[TestClient]:
    with TestClient(create_app(settings, clock=clock), headers=auth(OTHER_API_KEY)) as test_client:
        yield test_client


def pushover_channel(**overrides: Any) -> Dict[str, Any]:
    body = {
        "owner": OWNER,
        "type": "pushover",
        "name": "Handy",
        "fields": {"api_token": PUSHOVER_TOKEN, "user_key": PUSHOVER_USER},
    }
    return {**body, **overrides}


def resend_channel(**overrides: Any) -> Dict[str, Any]:
    body = {
        "owner": OWNER,
        "type": "resend",
        "name": "Mail",
        "fields": {"api_key": RESEND_KEY, "from_email": "jobs@example.com", "recipients": [RECIPIENT]},
    }
    return {**body, **overrides}


def smtp_channel(**overrides: Any) -> Dict[str, Any]:
    body = {
        "owner": OWNER,
        "type": "smtp",
        "name": "SMTP",
        "fields": {
            "host": "smtp.example.com",
            "port": 587,
            "username": "jobs@example.com",
            "password": SMTP_PASSWORD,
            "from_email": "jobs@example.com",
            "recipients": [RECIPIENT],
        },
    }
    return {**body, **overrides}


@pytest.fixture()
def create_channel(client: TestClient) -> Callable[[Dict[str, Any]], Dict[str, Any]]:
    def _create(body: Dict[str, Any]) -> Dict[str, Any]:
        response = client.post("/v1/channels", json=body)
        assert response.status_code == 201, response.text
        return response.json()

    return _create
