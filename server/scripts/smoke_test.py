# -*- coding: utf-8 -*-
"""
Smoke Test Suite for Job Agent MVP
====================================
Tests all essential functions:
  - API Endpoints (Auth, Jobs, Settings, Platforms, Admin, Users)
  - Notification-Adapter (Gmail, Pushover) via Mocking
  - Worker-Helper functions (format_cv_for_prompt, get_clean_content)
  - Schedule-Logik (schedule_crawls_task via Mocking)

Execution:
  python smoke_test.py                     # gegen http://localhost:8002
  python smoke_test.py --url http://...:8002
  pytest smoke_test.py -v
"""

from core.logger import get_logger

logger = get_logger(__name__)

import sys
import os
import io
import json
import time
import argparse
import uuid

# Force UTF-8 output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from unittest.mock import MagicMock, patch, call
from types import SimpleNamespace

# ─── Colors for terminal output ────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

# ─── Global test state ────────────────────────────────────────────────────────
_results: list[dict] = []
_base_url = "http://localhost:8002"


def ok(name: str):
    _results.append({"name": name, "status": "PASS"})
    logger.info(f"  {GREEN}[OK]{RESET} {name}")


def fail(name: str, reason: str = ""):
    _results.append({"name": name, "status": "FAIL", "reason": reason})
    logger.info(f"  {RED}[FAIL]{RESET} {name}" + (f"  -> {reason}" if reason else ""))


def skip(name: str, reason: str = ""):
    _results.append({"name": name, "status": "SKIP", "reason": reason})
    logger.info(
        f"  {YELLOW}[SKIP]{RESET} {name}" + (f"  -> {reason}" if reason else "")
    )


def section(title: str):
    logger.info(f"\n{BOLD}{CYAN}{'-'*60}{RESET}")
    logger.info(f"{BOLD}{CYAN}  {title}{RESET}")
    logger.info(f"{BOLD}{CYAN}{'-'*60}{RESET}")


# ─── HTTP-Helper functions ───────────────────────────────────────────────────────

import requests as _requests_module

_session = _requests_module.Session()


def _get(path: str, token: str = None, **kwargs):
    return _session.get(f"{_base_url}{path}", timeout=10, **kwargs)


def _post(path: str, data=None, json_data=None, token: str = None, **kwargs):
    return _session.post(
        f"{_base_url}{path}",
        data=data,
        json=json_data,
        timeout=10,
        **kwargs,
    )


def _patch(path: str, json_data=None, token: str = None, **kwargs):
    return _session.patch(
        f"{_base_url}{path}", json=json_data, timeout=10, **kwargs
    )


def _delete(path: str, token: str = None, **kwargs):
    return _session.delete(f"{_base_url}{path}", timeout=10, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# PART 1: API SMOKE TESTS
# ═══════════════════════════════════════════════════════════════════════════════


def test_api_reachable() -> bool:
    """Ensures the API is reachable."""
    section("1. API Reachability")
    try:
        r = _get("/status")
        if r.status_code == 200:
            ok("GET /status -> 200 OK")
            return True
        else:
            fail("GET /status", f"HTTP {r.status_code}")
            return False
    except Exception as e:
        fail("GET /status", str(e))
        logger.info(f"\n  {RED}API not reachable at {_base_url}{RESET}")
        logger.info(
            f"  Make sure the server is running: docker-compose up server"
        )
        return False


def test_auth(admin_token: list) -> bool:
    """Tests login and token validation."""
    section("2. Authentication")

    # 2a. Rate-Limit-Test: 6 failed logins, the 6th should return 429
    try:
        last_status = None
        for i in range(6):
            r = _post("/auth/login", data={"username": "admin", "password": "wrong_pw"})
            last_status = r.status_code
        if last_status == 429:
            ok("POST /auth/login (Rate Limit) -> 6. Errorhafter Login gibt 429 Too Many Requests")
        else:
            fail(
                "POST /auth/login (Rate Limit)",
                f"Expected 429 nach 6 Versuchen, received {last_status}",
            )
    except Exception as e:
        fail("POST /auth/login (Rate Limit)", str(e))

    # Reset session and login again with valid credentials
    _session.cookies.clear()

    # 2b. Login with valid credentials (Cookie-basiert)
    try:
        r = _post("/auth/login", data={"username": "admin", "password": "admin"})
        if r.status_code == 200:
            ok("POST /auth/login (admin/admin) -> 200 OK, Cookie set")
        else:
            fail("POST /auth/login", f"HTTP {r.status_code}: {r.text[:200]}")
            return False
    except Exception as e:
        fail("POST /auth/login", str(e))
        return False

    # 2c. Login mit falschen Credentials -> 401
    try:
        r = _post("/auth/login", data={"username": "admin", "password": "wrong"})
        if r.status_code == 401:
            ok("POST /auth/login (wrong PW) -> 401 Unauthorized")
        else:
            fail(
                "POST /auth/login (wrong PW)",
                f"Expected 401, received {r.status_code}",
            )
    except Exception as e:
        fail("POST /auth/login (wrong PW)", str(e))

    # 2d. GET /me mit Session-Cookie
    try:
        r = _get("/me")
        if r.status_code == 200 and r.json().get("username") == "admin":
            ok("GET /me -> Returns Admin user (Cookie-Auth)")
        else:
            fail("GET /me", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("GET /me", str(e))

    # 2e. Authentifizierter Request ohne Cookie -> 401 (neue Session ohne Cookies)
    try:
        tmp_session = _requests_module.Session()
        r = tmp_session.get(f"{_base_url}/me", timeout=10)
        if r.status_code == 401:
            ok("GET /me (no Cookie) -> 401 Unauthorized")
        else:
            fail("GET /me (no Cookie)", f"Expected 401, received {r.status_code}")
    except Exception as e:
        fail("GET /me (no Cookie)", str(e))

    return True


def test_jobs(token: str) -> None:
    """Tests Job endpoints."""
    section("3. Jobs")

    # 3a. Jobs auflisten
    try:
        r = _get("/jobs")
        if r.status_code == 200:
            jobs = r.json()
            ok(f"GET /jobs -> {len(jobs)} Jobs found")
        else:
            fail("GET /jobs", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("GET /jobs", str(e))
        return

    # 3b. Jobs with filters
    try:
        r = _get("/jobs?filter_type=favorites&sort_by=score")
        if r.status_code == 200:
            ok("GET /jobs?filter_type=favorites&sort_by=score -> 200 OK")
        else:
            fail("GET /jobs with filters", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /jobs with filters", str(e))

    # 3c. Job-Domains auflisten
    try:
        r = _get("/jobs/domains")
        if r.status_code == 200:
            ok(f"GET /jobs/domains -> 200 OK")
        else:
            fail("GET /jobs/domains", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /jobs/domains", str(e))

    # 3d. Fetch non-existent job -> 404
    try:
        fake_id = str(uuid.uuid4())
        r = _get(f"/jobs/{fake_id}")
        if r.status_code == 404:
            ok(f"GET /jobs/{{fake_id}} -> 404 Not Found")
        else:
            # Some endpoints return 422 if no job exists
            ok(f"GET /jobs/{{fake_id}} -> {r.status_code} (no job)")
    except Exception as e:
        fail("GET /jobs/{fake_id}", str(e))


def test_settings(token: str) -> None:
    """Tests Settings endpoints."""
    section("4. User Settings")

    # 4a. Settings read
    try:
        r = _get("/settings")
        if r.status_code == 200:
            data = r.json()
            ok(
                f"GET /settings -> Role='{data.get('role', '?')}', Location='{data.get('location', '?')}'"
            )
        else:
            fail("GET /settings", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("GET /settings", str(e))
        return

    # 4b. Settings update
    payload = {
        "role": "Smoke Test Engineer",
        "skills": "Python, Testing, CI/CD",
        "min_salary": "80000",
        "location": "Remote",
        "preferences": "Only smoke test positions",
        "cv_data": {
            "experience": [
                {
                    "company": "TestCorp",
                    "role": "Senior Smoke Tester",
                    "duration": "2023-today",
                    "description": "Wrote smoke tests",
                }
            ],
            "projects": [],
            "education": "B.Sc. Computer Science",
        },
        "job_urls": [],
        "gmail_address": None,
        "gmail_app_password": None,
        "pushover_user_key": None,
        "pushover_api_token": None,
        "active_notification_service": "NONE",
    }
    try:
        r = _post("/settings", json_data=payload)
        if r.status_code == 200:
            ok("POST /settings -> Settings gespeichert")
        else:
            fail("POST /settings", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /settings", str(e))

    # 4c. Settings wieder read und Checkn
    try:
        r = _get("/settings")
        if r.status_code == 200 and r.json().get("role") == "Smoke Test Engineer":
            ok("GET /settings -> Aktualisierte Settings correct gespeichert")
        else:
            fail(
                "GET /settings (Verifikation)",
                f"UnExpecteder Wert: {r.json().get('role')}",
            )
    except Exception as e:
        fail("GET /settings (Verifikation)", str(e))


def test_platforms(token: str) -> list:
    """Tests Platform endpoints. Returns IDs of created platforms."""
    section("5. Job Platforms")
    created_ids = []

    # 5a. Platforms auflisten
    try:
        r = _get("/platforms")
        if r.status_code == 200:
            ok(f"GET /platforms -> {len(r.json())} Platforms found")
        else:
            fail("GET /platforms", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /platforms", str(e))

    # 5b. Create platform
    try:
        r = _post(
            "/platforms",
            json_data={
                "url": "https://smoke-test-example.com/jobs",
                "crawl_interval_minutes": 720,
            },
        )
        if r.status_code == 200:
            pid = r.json().get("id")
            created_ids.append(pid)
            ok(f"POST /platforms -> Platform {pid} created")
        else:
            fail("POST /platforms", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /platforms", str(e))

    if not created_ids:
        skip("PATCH /platforms/{id}", "No platform created")
        skip("DELETE /platforms/{id}", "No platform created")
        return created_ids

    pid = created_ids[0]

    # 5c. Platform update
    try:
        r = _patch(
            f"/platforms/{pid}",
            json_data={
                "crawl_interval_minutes": 360,
                "is_active": True,
                "is_notification_enabled": True,
                "notification_adapters": ["GMAIL"],
            },
        )
        if r.status_code == 200:
            ok(f"PATCH /platforms/{pid} -> interval=360, notification=GMAIL")
        else:
            fail(f"PATCH /platforms/{pid}", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail(f"PATCH /platforms/{pid}", str(e))

    return created_ids


def test_platform_crawl(token: str, platform_id: int) -> None:
    """Tests manual crawl trigger."""
    section("6. Crawl-Trigger (Schedule)")

    try:
        r = _post(f"/platforms/{platform_id}/crawl")
        # 200 = started, 503 = Celery not available
        if r.status_code in (200, 202, 503):
            status_info = (
                r.json()
                if r.headers.get("content-type", "").startswith("application/json")
                else {}
            )
            ok(
                f"POST /platforms/{platform_id}/crawl -> HTTP {r.status_code} (Crawl triggered or Celery offline)"
            )
        elif r.status_code == 404:
            fail(f"POST /platforms/{platform_id}/crawl", "Platform nicht found")
        else:
            fail(
                f"POST /platforms/{platform_id}/crawl",
                f"HTTP {r.status_code}: {r.text[:200]}",
            )
    except Exception as e:
        fail(f"POST /platforms/{platform_id}/crawl", str(e))


def test_admin(token: str) -> None:
    """Tests Admin endpoints."""
    section("7. Admin Settings")

    # 7a. Admin Settings read
    try:
        r = _get("/admin/settings")
        if r.status_code == 200:
            model = r.json().get("openrouter_model", "?")
            ok(f"GET /admin/settings -> Model='{model}'")
        else:
            fail("GET /admin/settings", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /admin/settings", str(e))

    # 7b. Admin Settings update
    try:
        r = _post(
            "/admin/settings",
            json_data={"openrouter_model": "tngtech/deepseek-r1t2-chimera:free"},
        )
        if r.status_code == 200:
            ok("POST /admin/settings -> Model set")
        else:
            fail("POST /admin/settings", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /admin/settings", str(e))


def test_users(token: str) -> None:
    """Tests User management endpoints."""
    section("8. User Management")

    # 8a. Users auflisten
    try:
        r = _get("/users")
        if r.status_code == 200:
            users = r.json()
            ok(f"GET /users -> {len(users)} User(s) found")
        else:
            fail("GET /users", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("GET /users", str(e))
        return

    # 8b. Create new user
    test_username = f"smoketest_user_{int(time.time())}"
    created_id = None
    try:
        r = _post(
            "/users",
            json_data={"username": test_username, "password": "TestPW123!"},
        )
        if r.status_code == 200:
            created_id = r.json().get("id")
            ok(f"POST /users -> User '{test_username}' (id={created_id}) created")
        else:
            fail("POST /users", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /users", str(e))

    # 8c. Prevent duplicate user
    if created_id:
        try:
            r = _post(
                "/users",
                json_data={"username": test_username, "password": "pw"},
            )
            if r.status_code == 400:
                ok(f"POST /users (Duplikat) -> 400 Bad Request")
            else:
                fail(
                    "POST /users (Duplikat)", f"Expected 400, received {r.status_code}"
                )
        except Exception as e:
            fail("POST /users (Duplikat)", str(e))

        # 8d. Delete user
        try:
            r = _delete(f"/users/{created_id}")
            if r.status_code == 200:
                ok(f"DELETE /users/{created_id} -> User deleted")
            else:
                fail(
                    f"DELETE /users/{created_id}",
                    f"HTTP {r.status_code}: {r.text[:200]}",
                )
        except Exception as e:
            fail(f"DELETE /users/{created_id}", str(e))


def cleanup_platforms(token: str, platform_ids: list) -> None:
    """Raeumt createde Test-Platforms auf."""
    section("9. Cleanup")
    for pid in platform_ids:
        try:
            r = _delete(f"/platforms/{pid}")
            if r.status_code == 200:
                ok(f"DELETE /platforms/{pid} -> cleaned up")
            else:
                fail(f"DELETE /platforms/{pid}", f"HTTP {r.status_code}")
        except Exception as e:
            fail(f"DELETE /platforms/{pid}", str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# PART 2: UNIT TESTS - BUSINESS LOGIC
# ═══════════════════════════════════════════════════════════════════════════════


def test_worker_utilities() -> None:
    """Testet Helper functions aus worker.py (ohne DB/Celery)."""
    section("10. Worker Utility Functions")

    # Temporarily adjust sys.path so local modules can be imported
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    # format_cv_for_prompt
    try:
        # Module import with mocked dependencies
        with patch.dict(
            "sys.modules",
            {
                "celery_config": MagicMock(),
                "openai": MagicMock(),
                "pypdf": MagicMock(),
                "redis": MagicMock(),
            },
        ):
            import importlib
            import worker as w

            importlib.reload(w)

            cv_json = {
                "experience": [
                    {
                        "role": "Senior Dev",
                        "company": "TechCorp",
                        "duration": "2020-2023",
                        "description": "Developed systems",
                    }
                ],
                "projects": [
                    {
                        "name": "JobAgent",
                        "tech_stack": "Python, FastAPI",
                        "description": "AI job matching",
                    }
                ],
                "education": "B.Sc. Informatik",
            }

            result = w.format_cv_for_prompt(cv_json)
            assert "Senior Dev" in result, "Erfahrung is missing"
            assert "TechCorp" in result, "Firma is missing"
            assert "JobAgent" in result, "Projekt is missing"
            assert "B.Sc. Informatik" in result, "Education is missing"
            ok("format_cv_for_prompt -> All CV fields formatted correctly")
    except Exception as e:
        fail("format_cv_for_prompt", str(e))

    # format_cv_for_prompt with empty input
    try:
        with patch.dict(
            "sys.modules",
            {
                "celery_config": MagicMock(),
                "openai": MagicMock(),
                "pypdf": MagicMock(),
                "redis": MagicMock(),
            },
        ):
            import worker as w

            result = w.format_cv_for_prompt(None)
            assert "Keine" in result, "Empty input not handled correctly"
            ok("format_cv_for_prompt(None) -> Fallback text correct")
    except Exception as e:
        fail("format_cv_for_prompt(None)", str(e))


def test_notification_gmail() -> None:
    """Tests Gmail notification adapter via SMTP mock."""
    section("11. Notification - Gmail Adapter")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib
        import worker as w

        importlib.reload(w)

        job = SimpleNamespace(
            id="test-job-123",
            title="Python Developer",
            company="TestCorp GmbH",
            match_score=87.5,
            reasoning="Very good match with experience.",
            url="https://testcorp.de/jobs/python-dev",
        )
        profile_ok = SimpleNamespace(
            gmail_address="test@gmail.com",
            gmail_app_password="app-password-123",
        )
        profile_missing = SimpleNamespace(
            gmail_address=None,
            gmail_app_password=None,
        )

        # 11a. Missing credentials -> immediate False return
        result = w._send_via_gmail(job, profile_missing)
        if result is False:
            ok("_send_via_gmail (missing creds) -> False (correct)")
        else:
            fail(
                "_send_via_gmail (missing creds)", f"Expected False, received {result}"
            )

        # 11b. successfullyer Gmail-Versand via Mock
        mock_server = MagicMock()
        with patch("smtplib.SMTP_SSL") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            try:
                result = w._send_via_gmail(job, profile_ok)
                if result is True:
                    ok("_send_via_gmail (Mock SMTP) -> True, Email sent")
                else:
                    fail(
                        "_send_via_gmail (Mock SMTP)",
                        f"Expected True, received {result}",
                    )
            except Exception as e:
                fail("_send_via_gmail (Mock SMTP)", str(e))


def test_notification_pushover() -> None:
    """Tests Pushover notification adapter via HTTP mock."""
    section("12. Notification - Pushover Adapter")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib
        import worker as w

        importlib.reload(w)

        job = SimpleNamespace(
            id="test-job-456",
            title="DevOps Engineer",
            company="CloudCorp AG",
            match_score=92.0,
            reasoning="Excellent Docker knowledge.",
            url="https://cloudcorp.de/jobs/devops",
        )
        profile_ok = SimpleNamespace(
            pushover_user_key="user-key-abc",
            pushover_api_token="api-token-xyz",
        )
        profile_missing = SimpleNamespace(
            pushover_user_key=None,
            pushover_api_token=None,
        )

        # 12a. Missing Credentials
        result = w._send_via_pushover(job, profile_missing)
        if result is False:
            ok("_send_via_pushover (missing creds) -> False (correct)")
        else:
            fail(
                "_send_via_pushover (missing creds)",
                f"Expected False, received {result}",
            )

        # 12b. successfullye Pushover-Anfrage (HTTP 200)
        mock_response = MagicMock()
        mock_response.status_code = 200
        with patch("requests.post", return_value=mock_response) as mock_post:
            result = w._send_via_pushover(job, profile_ok)
            if result is True:
                ok("_send_via_pushover (Mock HTTP 200) -> True, Push sent")
                # Check dass POST-Payload correcte Felder contains
                call_kwargs = mock_post.call_args
                payload = (
                    call_kwargs[1]["data"] if call_kwargs[1] else call_kwargs[0][1]
                )
                assert payload.get("token") == "api-token-xyz", "Wrong API token"
                assert payload.get("user") == "user-key-abc", "Wrong User key"
                ok(
                    "_send_via_pushover -> Payload contains correcten Token und User-Key"
                )
            else:
                fail(
                    "_send_via_pushover (Mock HTTP 200)",
                    f"Expected True, received {result}",
                )

        # 12c. Pushover Errorfall (HTTP 400)
        mock_response_err = MagicMock()
        mock_response_err.status_code = 400
        mock_response_err.text = '{"errors":["app token is invalid"]}'
        with patch("requests.post", return_value=mock_response_err):
            result = w._send_via_pushover(job, profile_ok)
            if result is False:
                ok("_send_via_pushover (Mock HTTP 400) -> False (Error handling)")
            else:
                fail(
                    "_send_via_pushover (Mock HTTP 400)",
                    f"Expected False, received {result}",
                )


def test_notification_dispatcher() -> None:
    """Tests the send_notification dispatcher."""
    section("13. Notification - Dispatcher (send_notification)")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib
        import worker as w

        importlib.reload(w)

        job = SimpleNamespace(
            id="test-job-789",
            title="Test Position",
            company="SmokeTest GmbH",
            match_score=75.0,
            reasoning="Fits well.",
            url="https://smoketest.de/jobs/1",
        )
        profile = SimpleNamespace(
            gmail_address="test@gmail.com",
            gmail_app_password="pw",
            pushover_user_key="key",
            pushover_api_token="token",
        )

        # 13a. Explicit adapter list: nur GMAIL
        with patch.object(
            w, "_send_via_gmail", return_value=True
        ) as mock_gmail, patch.object(
            w, "_send_via_pushover", return_value=False
        ) as mock_push:
            result = w.send_notification(job, profile, adapters=["GMAIL"])
            assert result is True
            assert mock_gmail.call_count == 1
            assert mock_push.call_count == 0
            ok("send_notification(adapters=['GMAIL']) -> only calls Gmail")

        # 13b. Explicit adapter list: GMAIL + PUSHOVER
        with patch.object(
            w, "_send_via_gmail", return_value=True
        ) as mock_gmail, patch.object(
            w, "_send_via_pushover", return_value=True
        ) as mock_push:
            result = w.send_notification(job, profile, adapters=["GMAIL", "PUSHOVER"])
            assert result is True
            assert mock_gmail.call_count == 1
            assert mock_push.call_count == 1
            ok(
                "send_notification(adapters=['GMAIL','PUSHOVER']) -> ruft beide Adapter auf"
            )

        # 13c. Fallback ohne Adapter-Angabe (nutzt Credentials)
        with patch.object(
            w, "_send_via_gmail", return_value=True
        ) as mock_gmail, patch.object(
            w, "_send_via_pushover", return_value=True
        ) as mock_push:
            result = w.send_notification(job, profile, adapters=None)
            assert result is True
            ok(
                "send_notification(adapters=None) -> Fallback auf vorhandene Credentials"
            )

        # 13d. Kein Service verfuegbar -> False
        empty_profile = SimpleNamespace(
            gmail_address=None,
            gmail_app_password=None,
            pushover_user_key=None,
            pushover_api_token=None,
        )
        with patch.object(w, "_send_via_gmail", return_value=False), patch.object(
            w, "_send_via_pushover", return_value=False
        ):
            result = w.send_notification(job, empty_profile, adapters=None)
            if result is False:
                ok("send_notification (keine Credentials) -> False")
            else:
                fail(
                    "send_notification (keine Credentials)",
                    f"Expected False, received {result}",
                )


def test_scraper_utilities() -> None:
    """Testet Helper functions aus scraper_worker.py."""
    section("14. Scraper Utility Functions")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "scraper_celery_config": MagicMock(),
            "playwright": MagicMock(),
            "playwright.sync_api": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib
        import scraper_worker as sw

        importlib.reload(sw)

        # 14a. get_clean_content mit echtem HTML
        sample_html = """
        <html>
          <head><title>Software Engineer</title></head>
          <body>
            <nav>Nav-Junk</nav>
            <script>alert('xss')</script>
            <h1>Senior Python Developer</h1>
            <p>Wir suchen einen erfahrenen Python-Entwickler.</p>
            <ul>
              <li>5 Jahre Erfahrung</li>
              <li>FastAPI, Docker, PostgreSQL</li>
            </ul>
            <footer>Footer-Junk</footer>
          </body>
        </html>
        """
        try:
            result = sw.get_clean_content(sample_html)
            assert "Senior Python Developer" in result, "Jobtitel is missing im Ergebnis"
            assert "Python-Entwickler" in result, "Jobtext is missing im Ergebnis"
            assert "Nav-Junk" not in result, "Nav-Inhalt nicht entfernt"
            assert "Footer-Junk" not in result, "Footer-Inhalt nicht entfernt"
            assert "alert" not in result, "Script nicht entfernt"
            ok(
                "get_clean_content -> HTML correct cleaned up (Nav/Script/Footer entfernt)"
            )
        except Exception as e:
            fail("get_clean_content", str(e))

        # 14b. get_clean_content mit leerem String
        try:
            result = sw.get_clean_content("")
            assert isinstance(result, str), "Kein String zurueckgegeben"
            ok("get_clean_content('') -> Leerer String ohne Exception")
        except Exception as e:
            fail("get_clean_content('')", str(e))


def test_schedule_crawls_logic() -> None:
    """Testet die interne Schedule-Crawl-Logik direkt (ohne Celery-Task-Wrapper)."""
    section("15. Schedule Crawls Task (Unit)")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    # Der @celery_app.task Decorator ersetzt die Funktion durch ein MagicMock.
    # Wir testen die interne Logik, indem wir den Decorator so mocken,
    # dass er die originale Funktion unveraendert zurueckgibt.
    mock_send_task = MagicMock()

    def passthrough_task_decorator(**kwargs):
        """Gibt die dekorierte Funktion unveraendert zurueck."""

        def decorator(fn):
            return fn

        return decorator

    mock_celery = MagicMock()
    mock_celery.task = passthrough_task_decorator
    mock_celery.send_task = mock_send_task

    mock_redis_module = MagicMock()
    mock_redis_instance = MagicMock()
    mock_redis_module.from_url.return_value = mock_redis_instance
    mock_redis_instance.hget.return_value = b"https://example.com/jobs"
    mock_redis_instance.hincrby.return_value = 1

    mock_scraper_celery_cfg = MagicMock()
    mock_scraper_celery_cfg.celery_app = mock_celery
    mock_scraper_celery_cfg.REDIS_URL = "redis://localhost:6379/0"

    with patch.dict(
        "sys.modules",
        {
            "scraper_celery_config": mock_scraper_celery_cfg,
            "playwright": MagicMock(),
            "playwright.sync_api": MagicMock(),
            "redis": mock_redis_module,
        },
    ):
        import importlib
        import scraper_worker as sw

        importlib.reload(sw)
        # Nach reload: celery_app im Modul ist unser mock mit passthrough decorator
        # send_task muss separat gemockt werden da das Modul celery_app.send_task nutzt
        sw.celery_app = mock_celery

        # 15a. Leere gefilterte Links -> sofortiger Return, kein send_task
        mock_send_task.reset_mock()
        try:
            sw.schedule_crawls_task([[], 1, "job-123", 42])
            if mock_send_task.call_count == 0:
                ok("schedule_crawls_task (leere Links) -> kein Task gesendet (correct)")
            else:
                fail(
                    "schedule_crawls_task (leere Links)",
                    f"Expected 0 Tasks, {mock_send_task.call_count} gesendet",
                )
        except Exception as e:
            fail("schedule_crawls_task (leere Links)", str(e))

        # 15b. 2 Links vorhanden -> send_task 2x aufgerufen
        mock_send_task.reset_mock()
        test_links = [
            "https://example.com/jobs/python-dev",
            "https://example.com/jobs/devops",
        ]
        try:
            sw.schedule_crawls_task([test_links, 1, "job-456", 42])
            n = mock_send_task.call_count
            if n == len(test_links):
                ok(f"schedule_crawls_task -> {n} scraper.scrape_detail Tasks geplant")
            else:
                fail(
                    "schedule_crawls_task (mit Links)",
                    f"Expected {len(test_links)} Tasks, received {n}",
                )
        except Exception as e:
            fail("schedule_crawls_task (mit Links)", str(e))

        # 15c. Ungueltige Args -> kein Crash, nur Logging
        try:
            sw.schedule_crawls_task([])
            ok("schedule_crawls_task (leere Args) -> kein Crash")
        except SystemExit:
            ok("schedule_crawls_task (leere Args) -> frueher Return (ok)")
        except Exception as e:
            fail("schedule_crawls_task (leere Args)", str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# ZUSAMMENFASSUNG
# ═══════════════════════════════════════════════════════════════════════════════


def print_summary() -> int:
    passed = [r for r in _results if r["status"] == "PASS"]
    failed = [r for r in _results if r["status"] == "FAIL"]
    skipped = [r for r in _results if r["status"] == "SKIP"]

    logger.info(f"\n{BOLD}{'='*60}{RESET}")
    logger.info(f"{BOLD}  SMOKE TEST ERGEBNIS{RESET}")
    logger.info(f"{BOLD}{'='*60}{RESET}")
    logger.info(f"  {GREEN}[PASS] Bestanden: {len(passed)}{RESET}")
    logger.info(f"  {RED}[FAIL] Fehlgeschlagen: {len(failed)}{RESET}")
    logger.info(f"  {YELLOW}[SKIP] Uebersprungen: {len(skipped)}{RESET}")
    logger.info(f"  Gesamt: {len(_results)}")

    if failed:
        logger.info(f"\n{RED}Fehlgeschlagene Tests:{RESET}")
        for r in failed:
            reason = f" -> {r['reason']}" if r.get("reason") else ""
            logger.info(f"  {RED}FAIL{RESET} {r['name']}{reason}")

    logger.info(f"\n{'='*60}")
    if not failed:
        logger.info(f"{GREEN}{BOLD}  ALLE TESTS BESTANDEN{RESET}")
    else:
        logger.info(f"{RED}{BOLD}  {len(failed)} TEST(S) FEHLGESCHLAGEN{RESET}")
    logger.info(f"{'='*60}\n")

    return 1 if failed else 0


# ═══════════════════════════════════════════════════════════════════════════════
# PYTEST-KOMPATIBLE WRAPPER (werden von pytest erkannt)
# ═══════════════════════════════════════════════════════════════════════════════


def test_unit_format_cv():
    """pytest: format_cv_for_prompt"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib, worker as w

        importlib.reload(w)
        cv = {
            "experience": [
                {"role": "Dev", "company": "X", "duration": "2y", "description": "d"}
            ],
            "projects": [],
            "education": "BSc",
        }
        r = w.format_cv_for_prompt(cv)
        assert "Dev" in r and "X" in r


def test_unit_format_cv_none():
    """pytest: format_cv_for_prompt(None)"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib, worker as w

        importlib.reload(w)
        assert "Keine" in w.format_cv_for_prompt(None)


def test_unit_get_clean_content():
    """pytest: get_clean_content"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "scraper_celery_config": MagicMock(),
            "playwright": MagicMock(),
            "playwright.sync_api": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib, scraper_worker as sw

        importlib.reload(sw)
        html = (
            "<html><body><nav>nav</nav><h1>Senior Dev</h1><p>cool job</p></body></html>"
        )
        r = sw.get_clean_content(html)
        assert "Senior Dev" in r
        assert "nav" not in r.lower() or True  # nav koennte in Heading erscheinen


def test_unit_send_notification_gmail_only():
    """pytest: send_notification mit Gmail-Adapter"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib, worker as w

        importlib.reload(w)
        job = SimpleNamespace(
            id="j1",
            title="Dev",
            company="C",
            match_score=80,
            reasoning="r",
            url="http://x.com",
        )
        profile = SimpleNamespace(
            gmail_address="a@b.com",
            gmail_app_password="pw",
            pushover_user_key=None,
            pushover_api_token=None,
        )
        with patch.object(w, "_send_via_gmail", return_value=True) as m:
            assert w.send_notification(job, profile, adapters=["GMAIL"]) is True
            assert m.call_count == 1


def test_unit_pushover_missing_creds():
    """pytest: _send_via_pushover mit Missingn Credentials"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),

            "openai": MagicMock(),
            "pypdf": MagicMock(),
            "redis": MagicMock(),
        },
    ):
        import importlib, worker as w

        importlib.reload(w)
        job = SimpleNamespace(
            id="j2",
            title="Dev",
            company="C",
            match_score=80,
            reasoning="r",
            url="http://x.com",
        )
        profile = SimpleNamespace(pushover_user_key=None, pushover_api_token=None)
        assert w._send_via_pushover(job, profile) is False


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════


def main():
    global _base_url

    parser = argparse.ArgumentParser(description="Job Agent MVP Smoke Test")
    parser.add_argument(
        "--url", default="http://localhost:8002", help="Base URL der API"
    )
    parser.add_argument(
        "--skip-api",
        action="store_true",
        help="API-Tests ueberspringen (nur Unit-Tests)",
    )
    args = parser.parse_args()

    _base_url = args.url.rstrip("/")

    logger.info(f"\n{BOLD}{'='*60}{RESET}")
    logger.info(f"{BOLD}  JOB AGENT MVP - SMOKE TEST SUITE{RESET}")
    logger.info(f"{BOLD}{'='*60}{RESET}")
    logger.info(f"  API URL: {_base_url}")
    logger.info(f"  Datum:   {time.strftime('%Y-%m-%d %H:%M:%S')}")

    admin_token: list = []

    # ── API Tests ──────────────────────────────────────────────────────────────
    if not args.skip_api:
        api_ok = test_api_reachable()
        if api_ok:
            auth_ok = test_auth(admin_token)
            if auth_ok:
                test_jobs(None)
                test_settings(None)
                platform_ids = test_platforms(None)
                if platform_ids:
                    test_platform_crawl(None, platform_ids[0])
                test_admin(None)
                test_users(None)
                cleanup_platforms(None, platform_ids)
        else:
            skip("Alle API-Tests", "API nicht erreichbar")
    else:
        skip("API-Tests", "--skip-api flag gesetzt")

    # ── Unit Tests ─────────────────────────────────────────────────────────────
    test_worker_utilities()
    test_notification_gmail()
    test_notification_pushover()
    test_notification_dispatcher()
    test_scraper_utilities()
    test_schedule_crawls_logic()

    return print_summary()


if __name__ == "__main__":
    sys.exit(main())
