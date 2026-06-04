import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.core import Base, User, UserProfile
from core.auth import get_current_user, get_db

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
    assert p.role == "Software Engineer"
    assert p.skills == "Python, Docker"
    db.close()


def test_language_preference():
    response = client.post("/language-preference", json={"language": "en"})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "language": "en"}


def test_matching_preference():
    response = client.post("/matching-preference", json={"match_threshold": 75})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "match_threshold": 75}


def test_timezone_preference():
    response = client.post("/timezone-preference", json={"timezone": "Europe/London"})
    assert response.status_code == 200
    assert response.json() == {"status": "saved", "timezone": "Europe/London"}


def test_notification_settings():
    payload = {
        "pushover_user_key": "pk",
        "pushover_api_token": "pat",
        "resend_api_key": "rak",
        "resend_from_email": "rfe",
        "mailjet_api_key": "mak",
        "mailjet_secret_key": "msk",
        "mailjet_from_email": "mfe",
        "smtp_host": "sh",
        "smtp_port": 25,
        "smtp_user": "su",
        "smtp_password": "sp",
        "smtp_from_email": "sfe",
        "email_global_recipient": "egr",
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
