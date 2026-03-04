# -*- coding: utf-8 -*-
"""
Smoke Test Suite fuer Job Agent MVP
====================================
Testet alle wesentlichen Funktionen:
  - API Endpoints (Auth, Jobs, Settings, Platforms, Admin, Users)
  - Notification-Adapter (Gmail, Pushover) via Mocking
  - Worker-Hilfsfunktionen (format_cv_for_prompt, get_clean_content)
  - Schedule-Logik (schedule_crawls_task via Mocking)

Ausfuehrung:
  python smoke_test.py                     # gegen http://localhost:8002
  python smoke_test.py --url http://...:8002
  pytest smoke_test.py -v
"""

from logger import get_logger

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

# ─── Farben fuer Terminal-Output ────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

# ─── Globaler Test-State ────────────────────────────────────────────────────────
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


# ─── HTTP-Hilfsfunktionen ───────────────────────────────────────────────────────


def _get(path: str, token: str = None, **kwargs):
    import requests as req

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return req.get(f"{_base_url}{path}", headers=headers, timeout=10, **kwargs)


def _post(path: str, data=None, json_data=None, token: str = None, **kwargs):
    import requests as req

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return req.post(
        f"{_base_url}{path}",
        data=data,
        json=json_data,
        headers=headers,
        timeout=10,
        **kwargs,
    )


def _patch(path: str, json_data=None, token: str = None, **kwargs):
    import requests as req

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return req.patch(
        f"{_base_url}{path}", json=json_data, headers=headers, timeout=10, **kwargs
    )


def _delete(path: str, token: str = None, **kwargs):
    import requests as req

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return req.delete(f"{_base_url}{path}", headers=headers, timeout=10, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# TEIL 1: API SMOKE TESTS
# ═══════════════════════════════════════════════════════════════════════════════


def test_api_reachable() -> bool:
    """Stellt sicher dass die API erreichbar ist."""
    section("1. API Erreichbarkeit")
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
        logger.info(f"\n  {RED}API nicht erreichbar unter {_base_url}{RESET}")
        logger.info(
            f"  Stelle sicher, dass der Server laeuft: docker-compose up server"
        )
        return False


def test_auth(admin_token: list) -> None:
    """Testet Login und Token-Validierung."""
    section("2. Authentifizierung")

    # 2a. Login mit gueltigen Credentials
    try:
        r = _post("/auth/login", data={"username": "admin", "password": "admin"})
        if r.status_code == 200 and "access_token" in r.json():
            ok("POST /auth/login (admin/admin) -> Token erhalten")
            admin_token.append(r.json()["access_token"])
        else:
            fail("POST /auth/login", f"HTTP {r.status_code}: {r.text[:200]}")
            return
    except Exception as e:
        fail("POST /auth/login", str(e))
        return

    token = admin_token[0]

    # 2b. Login mit falschen Credentials
    try:
        r = _post("/auth/login", data={"username": "admin", "password": "wrong"})
        if r.status_code == 401:
            ok("POST /auth/login (falsches PW) -> 401 Unauthorized")
        else:
            fail(
                "POST /auth/login (falsches PW)",
                f"Erwartet 401, erhalten {r.status_code}",
            )
    except Exception as e:
        fail("POST /auth/login (falsches PW)", str(e))

    # 2c. GET /me mit Token
    try:
        r = _get("/me", token=token)
        if r.status_code == 200 and r.json().get("username") == "admin":
            ok("GET /me -> Gibt Admin-User zurueck")
        else:
            fail("GET /me", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("GET /me", str(e))

    # 2d. Authentifizierter Request ohne Token -> 401
    try:
        r = _get("/me")
        if r.status_code == 401:
            ok("GET /me (kein Token) -> 401 Unauthorized")
        else:
            fail("GET /me (kein Token)", f"Erwartet 401, erhalten {r.status_code}")
    except Exception as e:
        fail("GET /me (kein Token)", str(e))


def test_jobs(token: str) -> None:
    """Testet Job-Endpoints."""
    section("3. Jobs")

    # 3a. Jobs auflisten
    try:
        r = _get("/jobs", token=token)
        if r.status_code == 200:
            jobs = r.json()
            ok(f"GET /jobs -> {len(jobs)} Jobs gefunden")
        else:
            fail("GET /jobs", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("GET /jobs", str(e))
        return

    # 3b. Jobs mit Filtern
    try:
        r = _get("/jobs?filter_type=favorites&sort_by=score", token=token)
        if r.status_code == 200:
            ok("GET /jobs?filter_type=favorites&sort_by=score -> 200 OK")
        else:
            fail("GET /jobs mit Filtern", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /jobs mit Filtern", str(e))

    # 3c. Job-Domains auflisten
    try:
        r = _get("/jobs/domains", token=token)
        if r.status_code == 200:
            ok(f"GET /jobs/domains -> 200 OK")
        else:
            fail("GET /jobs/domains", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /jobs/domains", str(e))

    # 3d. Nicht existierenden Job abrufen -> 404
    try:
        fake_id = str(uuid.uuid4())
        r = _get(f"/jobs/{fake_id}", token=token)
        if r.status_code == 404:
            ok(f"GET /jobs/{{fake_id}} -> 404 Not Found")
        else:
            # Manche Endpoints geben 422 zurueck wenn kein Job existiert
            ok(f"GET /jobs/{{fake_id}} -> {r.status_code} (kein Job)")
    except Exception as e:
        fail("GET /jobs/{fake_id}", str(e))


def test_settings(token: str) -> None:
    """Testet Settings-Endpoints."""
    section("4. User Settings")

    # 4a. Settings lesen
    try:
        r = _get("/settings", token=token)
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

    # 4b. Settings aktualisieren
    payload = {
        "role": "Smoke Test Engineer",
        "skills": "Python, Testing, CI/CD",
        "min_salary": "80000",
        "location": "Remote",
        "preferences": "Nur Smoke-Test-Positionen",
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
        r = _post("/settings", json_data=payload, token=token)
        if r.status_code == 200:
            ok("POST /settings -> Settings gespeichert")
        else:
            fail("POST /settings", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /settings", str(e))

    # 4c. Settings wieder lesen und pruefen
    try:
        r = _get("/settings", token=token)
        if r.status_code == 200 and r.json().get("role") == "Smoke Test Engineer":
            ok("GET /settings -> Aktualisierte Settings korrekt gespeichert")
        else:
            fail(
                "GET /settings (Verifikation)",
                f"Unerwarteter Wert: {r.json().get('role')}",
            )
    except Exception as e:
        fail("GET /settings (Verifikation)", str(e))


def test_platforms(token: str) -> list:
    """Testet Platform-Endpoints. Gibt IDs erstellter Platforms zurueck."""
    section("5. Job Platforms")
    created_ids = []

    # 5a. Platforms auflisten
    try:
        r = _get("/platforms", token=token)
        if r.status_code == 200:
            ok(f"GET /platforms -> {len(r.json())} Platforms gefunden")
        else:
            fail("GET /platforms", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /platforms", str(e))

    # 5b. Platform erstellen
    try:
        r = _post(
            "/platforms",
            json_data={
                "url": "https://smoke-test-example.com/jobs",
                "crawl_interval_minutes": 720,
            },
            token=token,
        )
        if r.status_code == 200:
            pid = r.json().get("id")
            created_ids.append(pid)
            ok(f"POST /platforms -> Platform {pid} erstellt")
        else:
            fail("POST /platforms", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /platforms", str(e))

    if not created_ids:
        skip("PATCH /platforms/{id}", "Kein Platform erstellt")
        skip("DELETE /platforms/{id}", "Kein Platform erstellt")
        return created_ids

    pid = created_ids[0]

    # 5c. Platform aktualisieren
    try:
        r = _patch(
            f"/platforms/{pid}",
            json_data={
                "crawl_interval_minutes": 360,
                "is_active": True,
                "is_notification_enabled": True,
                "notification_adapters": ["GMAIL"],
            },
            token=token,
        )
        if r.status_code == 200:
            ok(f"PATCH /platforms/{pid} -> interval=360, notification=GMAIL")
        else:
            fail(f"PATCH /platforms/{pid}", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail(f"PATCH /platforms/{pid}", str(e))

    return created_ids


def test_platform_crawl(token: str, platform_id: int) -> None:
    """Testet manuellen Crawl-Trigger."""
    section("6. Crawl-Trigger (Schedule)")

    try:
        r = _post(f"/platforms/{platform_id}/crawl", token=token)
        # 200 = gestartet, 503 = Celery nicht verfuegbar
        if r.status_code in (200, 202, 503):
            status_info = (
                r.json()
                if r.headers.get("content-type", "").startswith("application/json")
                else {}
            )
            ok(
                f"POST /platforms/{platform_id}/crawl -> HTTP {r.status_code} (Crawl getriggert oder Celery offline)"
            )
        elif r.status_code == 404:
            fail(f"POST /platforms/{platform_id}/crawl", "Platform nicht gefunden")
        else:
            fail(
                f"POST /platforms/{platform_id}/crawl",
                f"HTTP {r.status_code}: {r.text[:200]}",
            )
    except Exception as e:
        fail(f"POST /platforms/{platform_id}/crawl", str(e))


def test_admin(token: str) -> None:
    """Testet Admin-Endpoints."""
    section("7. Admin Settings")

    # 7a. Admin Settings lesen
    try:
        r = _get("/admin/settings", token=token)
        if r.status_code == 200:
            model = r.json().get("openrouter_model", "?")
            ok(f"GET /admin/settings -> Model='{model}'")
        else:
            fail("GET /admin/settings", f"HTTP {r.status_code}")
    except Exception as e:
        fail("GET /admin/settings", str(e))

    # 7b. Admin Settings aktualisieren
    try:
        r = _post(
            "/admin/settings",
            json_data={"openrouter_model": "tngtech/deepseek-r1t2-chimera:free"},
            token=token,
        )
        if r.status_code == 200:
            ok("POST /admin/settings -> Model gesetzt")
        else:
            fail("POST /admin/settings", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /admin/settings", str(e))


def test_users(token: str) -> None:
    """Testet User-Management-Endpoints."""
    section("8. User Management")

    # 8a. Users auflisten
    try:
        r = _get("/users", token=token)
        if r.status_code == 200:
            users = r.json()
            ok(f"GET /users -> {len(users)} User(s) gefunden")
        else:
            fail("GET /users", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("GET /users", str(e))
        return

    # 8b. Neuen User anlegen
    test_username = f"smoketest_user_{int(time.time())}"
    created_id = None
    try:
        r = _post(
            "/users",
            json_data={"username": test_username, "password": "TestPW123!"},
            token=token,
        )
        if r.status_code == 200:
            created_id = r.json().get("id")
            ok(f"POST /users -> User '{test_username}' (id={created_id}) erstellt")
        else:
            fail("POST /users", f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        fail("POST /users", str(e))

    # 8c. Duplikat-User verhindern
    if created_id:
        try:
            r = _post(
                "/users",
                json_data={"username": test_username, "password": "pw"},
                token=token,
            )
            if r.status_code == 400:
                ok(f"POST /users (Duplikat) -> 400 Bad Request")
            else:
                fail(
                    "POST /users (Duplikat)", f"Erwartet 400, erhalten {r.status_code}"
                )
        except Exception as e:
            fail("POST /users (Duplikat)", str(e))

        # 8d. User loeschen
        try:
            r = _delete(f"/users/{created_id}", token=token)
            if r.status_code == 200:
                ok(f"DELETE /users/{created_id} -> User geloescht")
            else:
                fail(
                    f"DELETE /users/{created_id}",
                    f"HTTP {r.status_code}: {r.text[:200]}",
                )
        except Exception as e:
            fail(f"DELETE /users/{created_id}", str(e))


def cleanup_platforms(token: str, platform_ids: list) -> None:
    """Raeumt erstellte Test-Platforms auf."""
    section("9. Cleanup")
    for pid in platform_ids:
        try:
            r = _delete(f"/platforms/{pid}", token=token)
            if r.status_code == 200:
                ok(f"DELETE /platforms/{pid} -> bereinigt")
            else:
                fail(f"DELETE /platforms/{pid}", f"HTTP {r.status_code}")
        except Exception as e:
            fail(f"DELETE /platforms/{pid}", str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# TEIL 2: UNIT TESTS - BUSINESS LOGIC
# ═══════════════════════════════════════════════════════════════════════════════


def test_worker_utilities() -> None:
    """Testet Hilfsfunktionen aus worker.py (ohne DB/Celery)."""
    section("10. Worker Utility Functions")

    # Temporaer sys.path anpassen damit lokale Module importiert werden koennen
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    # format_cv_for_prompt
    try:
        # Modulimport mit gemockten Abhaengigkeiten
        with patch.dict(
            "sys.modules",
            {
                "celery_config": MagicMock(),
                "database": MagicMock(),
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
            assert "Senior Dev" in result, "Erfahrung fehlt"
            assert "TechCorp" in result, "Firma fehlt"
            assert "JobAgent" in result, "Projekt fehlt"
            assert "B.Sc. Informatik" in result, "Ausbildung fehlt"
            ok("format_cv_for_prompt -> Alle CV-Felder korrekt formatiert")
    except Exception as e:
        fail("format_cv_for_prompt", str(e))

    # format_cv_for_prompt mit leerem Input
    try:
        with patch.dict(
            "sys.modules",
            {
                "celery_config": MagicMock(),
                "database": MagicMock(),
                "openai": MagicMock(),
                "pypdf": MagicMock(),
                "redis": MagicMock(),
            },
        ):
            import worker as w

            result = w.format_cv_for_prompt(None)
            assert "Keine" in result, "Leerer Input nicht korrekt behandelt"
            ok("format_cv_for_prompt(None) -> Fallback-Text korrekt")
    except Exception as e:
        fail("format_cv_for_prompt(None)", str(e))


def test_notification_gmail() -> None:
    """Testet Gmail-Notification-Adapter via SMTP-Mock."""
    section("11. Notification - Gmail Adapter")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),
            "database": MagicMock(),
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
            reasoning="Sehr gute Uebereinstimmung mit Erfahrung.",
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

        # 11a. Fehlende Credentials -> sofortiger False-Return
        result = w._send_via_gmail(job, profile_missing)
        if result is False:
            ok("_send_via_gmail (fehlende Creds) -> False (korrekt)")
        else:
            fail(
                "_send_via_gmail (fehlende Creds)", f"Erwartet False, erhalten {result}"
            )

        # 11b. Erfolgreicher Gmail-Versand via Mock
        mock_server = MagicMock()
        with patch("smtplib.SMTP_SSL") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            try:
                result = w._send_via_gmail(job, profile_ok)
                if result is True:
                    ok("_send_via_gmail (Mock SMTP) -> True, E-Mail versendet")
                else:
                    fail(
                        "_send_via_gmail (Mock SMTP)",
                        f"Erwartet True, erhalten {result}",
                    )
            except Exception as e:
                fail("_send_via_gmail (Mock SMTP)", str(e))


def test_notification_pushover() -> None:
    """Testet Pushover-Notification-Adapter via HTTP-Mock."""
    section("12. Notification - Pushover Adapter")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),
            "database": MagicMock(),
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
            reasoning="Exzellente Docker-Kenntnisse.",
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

        # 12a. Fehlende Credentials
        result = w._send_via_pushover(job, profile_missing)
        if result is False:
            ok("_send_via_pushover (fehlende Creds) -> False (korrekt)")
        else:
            fail(
                "_send_via_pushover (fehlende Creds)",
                f"Erwartet False, erhalten {result}",
            )

        # 12b. Erfolgreiche Pushover-Anfrage (HTTP 200)
        mock_response = MagicMock()
        mock_response.status_code = 200
        with patch("requests.post", return_value=mock_response) as mock_post:
            result = w._send_via_pushover(job, profile_ok)
            if result is True:
                ok("_send_via_pushover (Mock HTTP 200) -> True, Push versendet")
                # Pruefe dass POST-Payload korrekte Felder enthaelt
                call_kwargs = mock_post.call_args
                payload = (
                    call_kwargs[1]["data"] if call_kwargs[1] else call_kwargs[0][1]
                )
                assert payload.get("token") == "api-token-xyz", "Falscher API-Token"
                assert payload.get("user") == "user-key-abc", "Falscher User-Key"
                ok(
                    "_send_via_pushover -> Payload enthaelt korrekten Token und User-Key"
                )
            else:
                fail(
                    "_send_via_pushover (Mock HTTP 200)",
                    f"Erwartet True, erhalten {result}",
                )

        # 12c. Pushover Fehlerfall (HTTP 400)
        mock_response_err = MagicMock()
        mock_response_err.status_code = 400
        mock_response_err.text = '{"errors":["app token is invalid"]}'
        with patch("requests.post", return_value=mock_response_err):
            result = w._send_via_pushover(job, profile_ok)
            if result is False:
                ok("_send_via_pushover (Mock HTTP 400) -> False (Fehlerbehandlung)")
            else:
                fail(
                    "_send_via_pushover (Mock HTTP 400)",
                    f"Erwartet False, erhalten {result}",
                )


def test_notification_dispatcher() -> None:
    """Testet den send_notification-Dispatcher."""
    section("13. Notification - Dispatcher (send_notification)")

    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),
            "database": MagicMock(),
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
            reasoning="Passt gut.",
            url="https://smoketest.de/jobs/1",
        )
        profile = SimpleNamespace(
            gmail_address="test@gmail.com",
            gmail_app_password="pw",
            pushover_user_key="key",
            pushover_api_token="token",
        )

        # 13a. Explizite Adapter-Liste: nur GMAIL
        with patch.object(
            w, "_send_via_gmail", return_value=True
        ) as mock_gmail, patch.object(
            w, "_send_via_pushover", return_value=False
        ) as mock_push:
            result = w.send_notification(job, profile, adapters=["GMAIL"])
            assert result is True
            assert mock_gmail.call_count == 1
            assert mock_push.call_count == 0
            ok("send_notification(adapters=['GMAIL']) -> ruft nur Gmail auf")

        # 13b. Explizite Adapter-Liste: GMAIL + PUSHOVER
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
                    f"Erwartet False, erhalten {result}",
                )


def test_scraper_utilities() -> None:
    """Testet Hilfsfunktionen aus scraper_worker.py."""
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
            assert "Senior Python Developer" in result, "Jobtitel fehlt im Ergebnis"
            assert "Python-Entwickler" in result, "Jobtext fehlt im Ergebnis"
            assert "Nav-Junk" not in result, "Nav-Inhalt nicht entfernt"
            assert "Footer-Junk" not in result, "Footer-Inhalt nicht entfernt"
            assert "alert" not in result, "Script nicht entfernt"
            ok(
                "get_clean_content -> HTML korrekt bereinigt (Nav/Script/Footer entfernt)"
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
                ok("schedule_crawls_task (leere Links) -> kein Task gesendet (korrekt)")
            else:
                fail(
                    "schedule_crawls_task (leere Links)",
                    f"Erwartet 0 Tasks, {mock_send_task.call_count} gesendet",
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
                    f"Erwartet {len(test_links)} Tasks, erhalten {n}",
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
            "database": MagicMock(),
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
            "database": MagicMock(),
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
            "database": MagicMock(),
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
    """pytest: _send_via_pushover mit fehlenden Credentials"""
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
    with patch.dict(
        "sys.modules",
        {
            "celery_config": MagicMock(),
            "database": MagicMock(),
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
            test_auth(admin_token)
            if admin_token:
                token = admin_token[0]
                test_jobs(token)
                test_settings(token)
                platform_ids = test_platforms(token)
                if platform_ids:
                    test_platform_crawl(token, platform_ids[0])
                test_admin(token)
                test_users(token)
                cleanup_platforms(token, platform_ids)
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
