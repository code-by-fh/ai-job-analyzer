from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.core import Base, User, UserProfile, JobPlatform, JobEntry
from core.auth import get_current_user, get_db
from core.platform_rules import url_matches_pattern
from routers.platforms import _infer_url_pattern

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
test_user = User(id=99, username="testuser", is_admin=False, token_version=0)

def override_get_current_user():
    return test_user

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    db = TestingSessionLocal()
    # Add test user to database
    db.merge(test_user)
    # Sources need a maintained profile (role and skills).
    db.merge(UserProfile(user_id=test_user.id, role="Engineer", skills="Python"))
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


def _matches(pattern, url):
    """The crawl filter's own test."""
    return bool(pattern) and url_matches_pattern(url, pattern)


def test_infer_pattern_single_segment_slug_recognises_siblings():
    """Regression: StepStone-style URLs put the id inside a single path segment.

    The old segment-level common prefix collapsed to '/' and fell back to the
    full path of the first job, so the pattern matched only that one URL and the
    first crawl found nothing. The inferred pattern must recognise every job.
    """
    jobs = [
        "https://www.stepstone.de/stellenangebote--Software-Architekt-Oberkochen-HENSOLDT--14104364-inline.html",
        "https://www.stepstone.de/stellenangebote--Werkstudent-Software-Developer-Hamburg-CHECK24--14107253-inline.html",
        "https://www.stepstone.de/stellenangebote--Integration-Developer-Bremen-Cordes-Graefe--13986552-inline.html",
    ]
    nav = [
        "https://www.stepstone.de/jobs/app-development",
        "https://www.stepstone.de/cmp/de/interhome-group-266152/jobs",
        "https://www.stepstone.de/e-recruiting/impressum",
        "https://www.stepstone.de/jobs/software?page=1",
    ]

    # Infer from just the first two selected jobs (as the wizard would).
    pattern = _infer_url_pattern(jobs[:2])

    assert pattern, "pattern must not be empty"
    # Every job — including ones not used to derive the pattern — must match.
    for job in jobs:
        assert _matches(pattern, job), f"pattern {pattern!r} should match {job}"
    # Navigation / category links must not match.
    for link in nav:
        assert not _matches(pattern, link), f"pattern {pattern!r} wrongly matched {link}"


def test_infer_pattern_multi_segment_paths():
    jobs = [
        "https://indeed.com/jobs/view/123",
        "https://indeed.com/jobs/view/456",
        "https://indeed.com/jobs/view/789",
    ]
    pattern = _infer_url_pattern(jobs[:2])
    for job in jobs:
        assert _matches(pattern, job)
    assert not _matches(pattern, "https://indeed.com/about")


def test_infer_pattern_query_param_jobs():
    jobs = [
        "https://de.indeed.com/rc/clk?jk=aaa111",
        "https://de.indeed.com/rc/clk?jk=bbb222",
    ]
    pattern = _infer_url_pattern(jobs)
    for job in jobs:
        assert _matches(pattern, job)
    assert not _matches(pattern, "https://de.indeed.com/about")


def test_infer_pattern_single_url_recognises_siblings():
    sibling_a = "https://www.stepstone.de/stellenangebote--Foo-Engineer-Berlin--14104364-inline.html"
    sibling_b = "https://www.stepstone.de/stellenangebote--Bar-Manager-Munich--14107253-inline.html"
    pattern = _infer_url_pattern([sibling_a])
    assert _matches(pattern, sibling_a)
    assert _matches(pattern, sibling_b)


def test_infer_pattern_empty():
    assert _infer_url_pattern([]) == ""


def test_get_platforms_empty():
    response = client.get("/platforms")
    assert response.status_code == 200
    assert response.json() == []


def test_create_platform():
    payload = {"url": "https://indeed.com/jobs", "crawl_interval_minutes": 60}
    response = client.post("/platforms", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://indeed.com/jobs"
    assert data["name"] == "indeed.com"  # Generated default domain-name
    assert data["setup_status"] == "pending_setup"
    assert data["job_count"] == 0
    assert data["seen_count"] == 0


def test_setup_creates_active_platform():
    # Deferred creation: the platform only comes into existence on setup.
    payload = {
        "url": "https://indeed.com/jobs",
        "selected_urls": [
            "https://indeed.com/jobs/view/1",
            "https://indeed.com/jobs/view/2",
        ],
        "initial_run": "none",
    }
    response = client.post("/platforms/setup", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://indeed.com/jobs"
    assert data["setup_status"] == "active"
    assert data["url_pattern"]  # inferred from selected_urls

    # And it is now listed.
    listed = client.get("/platforms").json()
    assert len(listed) == 1
    assert listed[0]["setup_status"] == "active"


def test_setup_reuses_pending_platform():
    # A legacy row still awaiting setup is finished in place, not duplicated.
    db = TestingSessionLocal()
    p = JobPlatform(
        id=26,
        user_id=99,
        url="https://indeed.com/jobs",
        name="Indeed",
        setup_status="pending_setup",
    )
    db.add(p)
    db.commit()
    db.close()

    payload = {
        "url": "https://indeed.com/jobs",
        "selected_urls": ["https://indeed.com/jobs/view/1"],
        "initial_run": "none",
    }
    response = client.post("/platforms/setup", json=payload)
    assert response.status_code == 200
    assert response.json()["id"] == 26
    assert response.json()["setup_status"] == "active"

    listed = client.get("/platforms").json()
    assert len(listed) == 1  # reused, not duplicated


def test_setup_rejects_active_duplicate():
    db = TestingSessionLocal()
    p = JobPlatform(
        id=27,
        user_id=99,
        url="https://indeed.com/jobs",
        name="Indeed",
        setup_status="active",
    )
    db.add(p)
    db.commit()
    db.close()

    payload = {
        "url": "https://indeed.com/jobs",
        "selected_urls": ["https://indeed.com/jobs/view/1"],
        "initial_run": "none",
    }
    response = client.post("/platforms/setup", json=payload)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_create_platform_duplicate():
    payload = {"url": "https://indeed.com/jobs", "crawl_interval_minutes": 60}
    response1 = client.post("/platforms", json=payload)
    assert response1.status_code == 200
    
    response2 = client.post("/platforms", json=payload)
    assert response2.status_code == 400
    assert "already exists" in response2.json()["detail"]


def test_update_platform():
    # Setup: create platform
    db = TestingSessionLocal()
    p = JobPlatform(
        id=12,
        user_id=99,
        url="https://indeed.com/jobs",
        name="Indeed",
        crawl_interval_minutes=60,
    )
    db.add(p)
    db.commit()
    db.close()

    # Test updating details
    payload = {"name": "Indeed Custom", "crawl_interval_minutes": 120}
    response = client.patch("/platforms/12", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Indeed Custom"
    assert data["crawl_interval_minutes"] == 120


def test_update_platform_domain_change_forbidden():
    # Setup: create platform
    db = TestingSessionLocal()
    p = JobPlatform(
        id=12,
        user_id=99,
        url="https://indeed.com/jobs",
        name="Indeed",
    )
    db.add(p)
    db.commit()
    db.close()

    # Try changing domain
    payload = {"url": "https://linkedin.com/jobs"}
    response = client.patch("/platforms/12", json=payload)
    assert response.status_code == 400
    assert "Domain change not allowed" in response.json()["detail"]


def test_delete_platform():
    # Setup: create platform
    db = TestingSessionLocal()
    p = JobPlatform(
        id=12,
        user_id=99,
        url="https://indeed.com/jobs",
        name="Indeed",
    )
    db.add(p)
    db.commit()
    db.close()

    # Test delete, with a reachable crawl registry that has nothing running
    registry = MagicMock()
    registry.exists.return_value = 0
    registry.smembers.return_value = set()
    with patch("routers.platforms._crawl_redis", return_value=registry):
        response = client.delete("/platforms/12")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "kept_jobs": 0}

    # Check is deleted
    db = TestingSessionLocal()
    p_deleted = db.query(JobPlatform).filter(JobPlatform.id == 12).first()
    assert p_deleted is None
    db.close()


def test_delete_platform_jobs_filtering():
    # Setup: create platform and multiple jobs with different statuses
    db = TestingSessionLocal()
    p = JobPlatform(id=12, user_id=99, url="https://indeed.com/jobs", name="Indeed")
    db.add(p)

    # Job 1: Normal seen job
    j1 = JobEntry(id="job-1", platform_id=12, user_id=99, title="Normal seen job", is_favorite=False, status="SEEN")
    # Job 2: Favorite job (status SEEN, so not in APPLICATION_STATUSES)
    j2 = JobEntry(id="job-2", platform_id=12, user_id=99, title="Favorite job", is_favorite=True, status="SEEN")
    # Job 3: Applied job (application status)
    j3 = JobEntry(id="job-3", platform_id=12, user_id=99, title="Applied job", is_favorite=False, status="APPLIED")
    # Job 4: Favorite + Applied job
    j4 = JobEntry(id="job-4", platform_id=12, user_id=99, title="Fav + Applied job", is_favorite=True, status="APPLIED")
    
    db.add_all([j1, j2, j3, j4])
    db.commit()
    db.close()

    # Test 1: keep_favorites=True, keep_applications=True (only job-1 should be deleted)
    response = client.delete("/platforms/12/jobs?keep_favorites=true&keep_applications=true")
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 1

    db = TestingSessionLocal()
    remaining_ids = [j.id for j in db.query(JobEntry).all()]
    assert "job-1" not in remaining_ids
    assert "job-2" in remaining_ids
    assert "job-3" in remaining_ids
    assert "job-4" in remaining_ids

    # Test 2: keep_favorites=True, keep_applications=False (should delete job-3 but keep job-2 and job-4)
    response2 = client.delete("/platforms/12/jobs?keep_favorites=true&keep_applications=false")
    assert response2.status_code == 200
    assert response2.json()["deleted_count"] == 1  # job-3 deleted

    remaining_ids = [j.id for j in db.query(JobEntry).all()]
    assert "job-3" not in remaining_ids
    assert "job-2" in remaining_ids
    assert "job-4" in remaining_ids

    # Test 3: keep_favorites=False, keep_applications=True (should delete job-2 but keep job-4)
    response3 = client.delete("/platforms/12/jobs?keep_favorites=false&keep_applications=true")
    assert response3.status_code == 200
    assert response3.json()["deleted_count"] == 1  # job-2 deleted

    remaining_ids = [j.id for j in db.query(JobEntry).all()]
    assert "job-2" not in remaining_ids
    assert "job-4" in remaining_ids

    # Test 4: keep_favorites=False, keep_applications=False (should delete job-4)
    response4 = client.delete("/platforms/12/jobs?keep_favorites=false&keep_applications=false")
    assert response4.status_code == 200
    assert response4.json()["deleted_count"] == 1  # job-4 deleted

    remaining_ids = [j.id for j in db.query(JobEntry).all()]
    assert remaining_ids == []
    db.close()


SETUP_PAYLOAD = {
    "url": "https://indeed.com/jobs",
    "selected_urls": ["https://indeed.com/jobs/view/1", "https://indeed.com/jobs/view/2"],
}


def _setup(initial_run, **trigger_kwargs):
    trigger_kwargs.setdefault("return_value", {"status": "Started"})
    with patch("routers.platforms._trigger_scraper_search", **trigger_kwargs) as trigger:
        response = client.post("/platforms/setup", json={**SETUP_PAYLOAD, "initial_run": initial_run})
    return response, trigger


def test_setup_analyze_triggers_regular_crawl():
    response, trigger = _setup("analyze")
    assert trigger.call_args.kwargs["is_initial_run"] is False
    assert response.json()["last_crawl_at"].endswith("+00:00")
    assert response.json()["initial_crawl_started"] is True


def test_setup_seed_triggers_initial_run():
    response, trigger = _setup("seed")
    assert trigger.call_args.kwargs["is_initial_run"] is True
    assert response.json()["last_crawl_at"] is not None
    assert response.json()["initial_crawl_started"] is False


def _manual_crawl_is_initial(platform_id) -> bool:
    with patch("routers.platforms._trigger_scraper_search", return_value={"status": "Started"}) as trigger:
        client.post(f"/platforms/{platform_id}/crawl")
    _, _, is_initial_run = trigger.call_args.args
    return is_initial_run


def test_setup_none_skips_crawl():
    response, trigger = _setup("none")
    trigger.assert_not_called()
    assert response.json()["last_crawl_at"] is not None


def test_crawl_after_setup_none_does_not_seed():
    response, _ = _setup("none")
    assert _manual_crawl_is_initial(response.json()["id"]) is False


def test_crawl_after_failed_analyze_setup_does_not_seed():
    response, _ = _setup("analyze", side_effect=requests.RequestException("down"))
    assert _manual_crawl_is_initial(response.json()["id"]) is False


def test_crawl_after_failed_seed_setup_still_seeds():
    response, _ = _setup("seed", side_effect=requests.RequestException("down"))
    assert response.json()["last_crawl_at"] is None
    assert _manual_crawl_is_initial(response.json()["id"]) is True


def test_get_platforms_items_omit_setup_only_fields():
    _setup("analyze")
    assert "initial_crawl_started" not in client.get("/platforms").json()[0]


def test_setup_rejects_unknown_initial_run():
    response, trigger = _setup("later")
    assert response.status_code == 422
    trigger.assert_not_called()


def test_get_platforms_returns_last_run():
    last_run = {"started_at": None, "finished_at": "2026-10-08T09:30:00+00:00", "found": 8, "new": 3, "matched": 2}
    db = TestingSessionLocal()
    db.add(JobPlatform(id=30, user_id=99, url="https://indeed.com/jobs", name="Indeed",
                       setup_status="active", last_run=last_run))
    db.commit()
    db.close()
    assert client.get("/platforms").json()[0]["last_run"] == last_run


def test_setup_analyze_reports_unreachable_scraper():
    response, _ = _setup("analyze", side_effect=requests.RequestException("down"))
    assert response.status_code == 200
    assert response.json()["initial_crawl_started"] is False


def test_setup_analyze_reports_scraper_error_status():
    response, _ = _setup("analyze", return_value={"status": "Error", "message": "x"})
    assert response.status_code == 200
    assert response.json()["initial_crawl_started"] is False
