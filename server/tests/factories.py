"""Builders for test rows and helpers for inspecting fakes, so tests carry no magic inline values."""

import json

from database.core import DocumentTemplate, JobEntry, JobPlatform, ProfileDocument, User, UserProfile

TEST_USER_ID = 501
OTHER_USER_ID = 502
TEST_PLATFORM_ID = 12
TEST_PROFILE_DOCUMENT_ID = 70
PDF_BYTES = b"%PDF-1.7\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n"
# Globally routable on purpose: the documentation ranges (192.0.2.0/24, ...) are refused by the SSRF guard.
PUBLIC_TEST_ADDRESS = "93.184.216.34"


def make_user(user_id: int = TEST_USER_ID) -> User:
    return User(id=user_id, username=f"user{user_id}", is_admin=False, token_version=0)


def make_job(**overrides) -> JobEntry:
    fields = {
        "id": "job-1",
        "user_id": TEST_USER_ID,
        "title": "Backend Engineer",
        "company": "Acme",
        "description": "Build APIs",
        "match_score": 80.0,
        "reasoning": "Strong Python fit",
        "status": "OPEN",
        "is_archived": False,
        "is_favorite": False,
        "kept_by_user": False,
    }
    fields.update(overrides)
    return JobEntry(**fields)


def make_profile(**overrides) -> UserProfile:
    fields = {
        "user_id": TEST_USER_ID,
        "role": "Backend Engineer",
        "skills": "Python",
        "cv_data": {"experience": [], "projects": [], "education": "BSc"},
        "match_threshold": 0,
    }
    fields.update(overrides)
    return UserProfile(**fields)


def make_platform(**overrides) -> JobPlatform:
    fields = {
        "id": TEST_PLATFORM_ID,
        "user_id": TEST_USER_ID,
        "url": "https://jobs.example.com/search",
        "name": "Example Jobs",
        "setup_status": "active",
    }
    fields.update(overrides)
    return JobPlatform(**fields)


def make_template(**overrides) -> DocumentTemplate:
    fields = {
        "id": 40,
        "user_id": TEST_USER_ID,
        "is_admin": False,
        "doc_type": "CV",
        "name": "My CV",
        "html": "<p>{{ name }}</p>",
    }
    fields.update(overrides)
    return DocumentTemplate(**fields)


def make_profile_document(**overrides) -> ProfileDocument:
    fields = {
        "id": TEST_PROFILE_DOCUMENT_ID,
        "user_id": TEST_USER_ID,
        "doc_type": "CERTIFICATE",
        "label": "Zeugnis.pdf",
        "filename": "db://Zeugnis.pdf",
        "original_filename": "Zeugnis.pdf",
        "file_size": len(PDF_BYTES),
        "mime_type": "application/pdf",
        "content": PDF_BYTES,
    }
    fields.update(overrides)
    return ProfileDocument(**fields)


def fetch(session_factory, model, key):
    """Load one row in a short-lived session; its loaded attributes stay readable after close."""
    with session_factory() as db:
        return db.get(model, key)


def published_events(fake_redis) -> list:
    """Decode every payload the code under test published on the job_updates channel."""
    return [json.loads(call.args[1]) for call in fake_redis.publish.call_args_list]


def events_of_type(fake_redis, event_type: str) -> list:
    return [event for event in published_events(fake_redis) if event.get("type") == event_type]
