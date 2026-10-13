import smtplib

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.core import Base, User, UserProfile
from core.auth import get_current_user, get_db
from routers.deps import _SECRET_MASK

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

# Create testing engine and session using StaticPool to share connection
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Override dependencies
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Mock user for testing
test_user = User(id=101, username="settingsuser", is_admin=False, token_version=0)

def override_get_current_user():
    return test_user

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    db = TestingSessionLocal()
    # Add test user
    db.merge(test_user)
    db.commit()
    
    # Register overrides
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    yield
    
    # Cleanup overrides
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    
    db.close()
    Base.metadata.drop_all(engine)


def test_get_settings_default_created():
    response = client.get("/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == 101
    assert data["cv_template"] == "classic"


def test_save_settings():
    payload = {
        "role": "Lead Dev",
        "skills": "Python, Go",
        "min_salary": "90000",
        "location": "Berlin",
        "preferences": "Remote preferred",
        "cv_data": {
            "experience": [],
            "projects": [],
            "education": "BS CS",
        },
        "job_urls": ["https://indeed.com"],
        "cv_template": "modern",
        "cover_letter_template": "modern",
        "pushover_user_key": "user_key_123",
        "pushover_api_token": "api_token_123",
        "resend_api_key": "resend_key_123",
        "resend_from_email": "jobs@example.com",
        "mailjet_api_key": "mj_key_123",
        "mailjet_secret_key": "mj_sec_123",
        "mailjet_from_email": "mj@example.com",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_user": "smtp_user",
        "smtp_password": "smtp_password",
        "smtp_from_email": "smtp@example.com",
        "active_notification_service": "RESEND",
    }
    response = client.post("/settings", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "saved"}

    # Fetch to verify masked keys
    response_get = client.get("/settings")
    data = response_get.json()
    assert data["role"] == "Lead Dev"
    assert data["cv_template"] == "modern"
    assert data["resend_api_key"] == "__masked__"


def test_delete_settings():
    # Setup some values
    db = TestingSessionLocal()
    profile = UserProfile(
        user_id=101,
        role="Lead Dev",
        skills="Python, Go",
    )
    db.add(profile)
    db.commit()
    db.close()

    response = client.delete("/settings")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}

    # Check database to see if reset
    db = TestingSessionLocal()
    p = db.query(UserProfile).filter(UserProfile.user_id == 101).first()
    cleared = (p.role, p.skills, p.min_salary, p.location, p.preferences, p.job_urls, p.spoken_languages)
    assert cleared == ("", "", "", "", "", [], [])
    assert p.cv_data == {"experience": [], "projects": [], "education": ""}
    db.close()
    assert client.get("/setup-status").json()["profile_complete"] is False


def test_language_preference():
    response = client.post("/language-preference", json={"language": "en"})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "language": "en"}


def test_matching_preference():
    response = client.post("/matching-preference", json={"match_threshold": 75})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "match_threshold": 75, "archived": 0, "restored": 0}


def test_timezone_preference():
    response = client.post("/timezone-preference", json={"timezone": "Europe/London"})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "timezone": "Europe/London"}


def test_notification_settings():
    payload = {
        "pushover_user_key": "pk",
        "pushover_api_token": "pat",
        "resend_api_key": "rak",
        "resend_from_email": "rfe@example.com",
        "mailjet_api_key": "mak",
        "mailjet_secret_key": "msk",
        "mailjet_from_email": "mfe@example.com",
        "smtp_host": "sh",
        "smtp_port": 25,
        "smtp_user": "su",
        "smtp_password": "sp",
        "smtp_from_email": "sfe@example.com",
        "email_global_recipient": "egr@example.com",
    }
    response = client.post("/notification-settings", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "saved"}


def test_templates_crud():
    # 1. List initially empty (except for potential admin templates)
    response_list = client.get("/notification-templates")
    assert response_list.status_code == 200
    templates_count = len(response_list.json())

    # 2. Create template
    payload = {
        "name": "My Template",
        "type": "PUSHOVER",
        "content": "Hello $title",
    }
    response_create = client.post("/notification-templates", json=payload)
    assert response_create.status_code == 200
    created = response_create.json()
    assert created["name"] == "My Template"
    template_id = created["id"]

    # 3. Update template
    response_update = client.put(f"/notification-templates/{template_id}", json={"content": "New content"})
    assert response_update.status_code == 200
    assert response_update.json()["content"] == "New content"

    # 4. Delete template
    response_delete = client.delete(f"/notification-templates/{template_id}")
    assert response_delete.status_code == 200
    assert response_delete.json() == {"ok": True}


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


NOTIFICATION_FAILURES = [
    (RuntimeError("secret-internal-detail"), "Verbindungstest fehlgeschlagen"),
    (requests.Timeout("secret-internal-detail"), "Zeitüberschreitung"),
    (requests.ConnectionError("secret-internal-detail"), "Server nicht erreichbar"),
    (smtplib.SMTPAuthenticationError(535, b"secret-internal-detail"), "Anmeldung abgelehnt (API-Schlüssel prüfen)"),
]


@pytest.mark.parametrize("channel,sender", [
    ("pushover", "_send_via_pushover"),
    ("resend", "_send_via_resend_batch"),
    ("mailjet", "_send_via_mailjet_batch"),
    ("smtp", "_send_via_smtp_batch"),
])
@pytest.mark.parametrize("error,message", NOTIFICATION_FAILURES)
def test_notification_test_endpoint_returns_fixed_reason(channel, sender, error, message, monkeypatch):
    _seed_profile(
        pushover_user_key="u", pushover_api_token="t", resend_api_key="r", resend_from_email="a@b.de",
        mailjet_api_key="m", mailjet_secret_key="s", mailjet_from_email="a@b.de", smtp_host="h", smtp_user="u",
        smtp_password="p", email_global_recipient="me@example.com",
    )

    def _boom(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(f"routers.settings.{sender}", _boom)
    response = client.post(f"/notification-settings/test-{channel}", json={})
    assert (response.status_code, response.json()) == (500, {"detail": message})
