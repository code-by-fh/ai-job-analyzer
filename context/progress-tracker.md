## Progress Tracker

### 1. Current Status (As of 2026-06-04)

**Phase:** Platform-Setup-Wizard + URL-Pattern-Inferenz abgeschlossen. Automated Tests (49 bestanden) für Platforms, Settings, Profile Documents integriert. Fokus jetzt: Automated Tests für Auth & Jobs, Security Hardening.

### 2. Status Board

| Feature Block | Status / Files | Key Details |
| --- | --- | --- |
| **Auth & Admin** | ✅ Completed (`routers/auth.py`, `admin.py`) | JWT Login/Refresh/Logout via `tv` (Token-Version), Admin-UI, geteilte AI Model Settings (Cloud & Lokal) mit separaten Forms/Save-Buttons. |
| **Job CRUD & Archive** | ✅ Completed (`routers/jobs.py`) | List/Filter, Notizen, Bulk-Aktionen, History, Uploads. Matching-Threshold archiviert neue Jobs mit `match_score < Wert` automatisch. |
| **AI Layer** | ✅ Completed (`intelligence/`) | Matching, Anschreiben, Interview-Prep, Firmenprofile via OpenRouter. |
| **Platforms & Beat** | ✅ Completed & Tested (`routers/platforms.py`, `tests/test_platforms_router.py`) | CRUD, Intervalle, Scheduler, Deferred Setup-Wizard (URL-basiert), URL-Pattern-Inferenz (zeichenweiser Common-Prefix). 15 Tests grün. |
| **Application Package** | ✅ Completed & Tested (`workers/tasks/package.py`, `routers/profile_documents.py`, `tests/test_profile_documents_router.py`) | Ein-Klick CV + Anschreiben → PDF, Profil-Dokumente. |
| **Template Editor** | ✅ Completed (`routers/templates.py`, `services/template_filler.py`, `services/document_renderer.py`) | DocumentTemplate CRUD; slot-filler; Playwright PDF; two-column in-browser editor. |
| **Scraper Worker** | ✅ Completed (`workers/scraper_worker.py`) | playwright-stealth + headless=False + Xvfb. noVNC auf Port 6080 (`http://localhost:6080/vnc.html`). SSRF-Schutz (`_is_safe_url`). |
| **Companies** | ✅ Completed (`routers/companies.py`) | Domain-spezifische Views & Deep-Dive Analysen. |
| **Dual Storage** | ✅ Completed (`services/storage.py`) | DB-Blob (`LargeBinary`) vs. Google Drive OAuth. |
| **Notifications** | ✅ Completed & Tested (`routers/settings.py`, `tests/test_settings_router.py`) | 5 Kanäle: Gmail, Pushover, Resend, Mailjet, SMTP + Templates. 49 Tests grün. |
| **Real-time Engine** | ✅ Completed (`routers/websocket.py`) | Cookie-authed `/ws`, Live-Updates via `useCrawl` / `CrawlStatus`. |

### 3. Next Up & Backlog

* [ ] **Automated Tests:** Auth & Jobs (bisher 0% Coverage).
* [ ] **Security Hardening:** Review von SSRF-Vektoren, JWT-Validierung, Admin-Scopes.
* [ ] **Application Package Integration:** Online-Submission Hook + Direct-Mail Gateway (post-MVP).

### 4. Key Architectural Decisions (ADRs)

* **OpenRouter Config:** Liegt in DB (`system_settings`), nicht in `.env` (dynamische Modell-Wechsel via UI).
* **Process Isolation:** Separates Queue-Modell (`ai_queue` vs. `scraper_queue`), Playwright-Crawls blockieren nicht AI-Tasks.
* **Single-Container Deployment:** Alle 4 Backend-Prozesse via `supervisord` in einem Docker-Container.
* **Deferred Platform Creation:** Plattform wird erst beim Abschluss des Setup-Wizards angelegt (kein `pending_setup`-Overhead).
* **URL-Pattern-Inferenz:** Zeichenweiser Common-Prefix (`os.path.commonprefix`) mit Trim auf letzte natürliche Trennstelle — robuster als segment-weiser Ansatz für Boards mit ID im Pfad.

### 5. Open Questions

* **Monolith vs. Microservices:** Soll die supervisord-Struktur langfristig in eigenständige Docker-Services zerlegt werden?
* **Notification Overrides:** Benachrichtigungs-Einstellungen sind global + per-Plattform konfigurierbar — bleibt das Override-Modell so?
