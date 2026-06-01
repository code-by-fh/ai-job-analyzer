## 📈 Progress Tracker (Token-Optimized)

### 1. Current Status (As of 2026-06-01)

* **Phase:** Botasaurus-Migration abgeschlossen. Playwright aus dem Scraper entfernt, botasaurus `@browser` (Anti-Detect Chrome) eingebaut. Fokus: `context/` Dokumentation + Security Hardening.
* **Goal:** Automated Tests ausbauen (Auth, Jobs, `_is_safe_url`) und Security Review.
* **Letzte Änderung:** Botasaurus-Migration gemergt (2026-06-01): Playwright → botasaurus `@browser` für Anti-Detect-HTML-Fetching. Dockerfile auf `python:3.11-slim` + Google Chrome stable + Xvfb umgestellt. `scraper_worker.py` auf `botasaurus_fetcher.py`-Adapter umgestellt (SSRF-Schutz bleibt in `scraper_worker`). `botasaurus.request` CFFI-Problem umgangen: HTTP-Fallback nutzt plain `requests` mit Browser-Headers statt botasaurus-CFFI. 37 Unit-Tests grün.

* **Vorletzte Änderung:** Token-Optimierung der Codebasis für die Weiterentwicklung: (1) `CLAUDE.md` liest Context-Dateien jetzt konditional statt alle 6 pro Session; (2) `workers/worker.py` (1808 Z.) aufgeteilt in `workers/tasks/*` + `workers/notifications/*`, `worker.py` bleibt dünner Aggregator/Celery-Entrypoint; (3) die 3 E-Mail-Batch-Adapter (Resend/Mailjet/SMTP) und die Crawl-Completion-Logik dedupliziert. Verhaltens-erhaltend; dabei wurde eine latente Inkonsistenz behoben (SMTP-Digest wurde auf dem Save-Completion-Pfad bisher nicht geflusht — `maybe_complete_crawl` flusht nun konsistent alle drei Kanäle).

### 2. Status Board

| Feature Block | Status / Files | Key Details |
| --- | --- | --- |
| **Auth & Admin** | ✅ Completed (`routers/auth.py`, `admin.py`) | JWT Login/Refresh/Logout via `tv` (Token-Version), Admin-UI. |
| **Job CRUD & Archive** | ✅ Completed (`routers/jobs.py`) | List/Filter, Notizen, Bulk-Aktionen, History, Uploads. Matching-Threshold (`user_settings.match_threshold`) archiviert neue Jobs mit `match_score < Wert` automatisch (0 = aus, ohne Notification). |
| **AI Layer** | ✅ Completed (`intelligence/`) | Matching, Anschreiben, Interview-Prep, Firmenprofile via OpenRouter. |
| **Platforms & Beat** | ✅ Completed (`routers/platforms.py`) | CRUD, Intervalle, Scheduler (`ai.check_platforms_for_crawl` @60s). |
| **Application Package** | ✅ Completed (`workers/tasks/package.py`, `routers/profile_documents.py`) | Ein-Klick CV (Ollama lokal) + Anschreiben (OpenRouter) → PDF, optional Profil-Dokumente. Online-Submit out-of-scope (Hook). |
| **Template Editor** | ✅ Completed (`routers/templates.py`, `services/template_filler.py`, `services/document_renderer.py`, `frontend/app/components/editor/`) | DocumentTemplate CRUD; slot-filler; Playwright PDF; two-column in-browser editor (iframe + BlockInspector + StylePanel); per-job HTML persistence. |
| **Scraper Worker** | ✅ Completed (`workers/scraper_worker.py`, `workers/botasaurus_fetcher.py`) | Playwright → botasaurus `@browser`. HTTP-Fallback via plain requests. SSRF-Schutz, BS4-Cleaning, Port 8081. |
| **Companies** | ✅ Completed (`routers/companies.py`) | Domain-spezifische Views & Deep-Dive Analysen. |
| **Dual Storage** | ✅ Completed (`services/storage.py`) | DB-Blob (`LargeBinary`) vs. Google Drive OAuth (per User steuerbar). |
| **Notifications** | ✅ Completed (`routers/settings.py`) | 5 Kanäle: Gmail, Pushover, Resend, Mailjet, SMTP + Templates. |
| **Real-time Engine** | ✅ Completed (`routers/websocket.py`) | Cookie-authed `/ws`, Live-Updates via `useCrawl` / `CrawlStatus`. |
| **Docs & Polish** | 🟡 In Progress | Uncommittetes `context/` Doc-Set + `CLAUDE.md` Updates. |

### 3. Next Up & Backlog

* [ ] **Application Package Integration:** Online-Submission Hook + Direct-Mail Gateway (out-of-scope für MVP, aber in PR-Body dokumentiert).
* [ ] **Automated Tests:** Prio 1 auf Auth, Jobs und `_is_safe_url` (bisher 0% Coverage).
* [ ] **Security Hardening:** Review von SSRF-Vektoren, JWT-Validierung und Admin-Scopes.
* [ ] **Repo Cleanup:** Runtime-Artifacts (`supervisord.log/.pid`) aus dem Git-Tracking entfernen (`.gitignore`).

### 4. Key Architectural Decisions (ADRs)

* **OpenRouter Config:** Liegt in DB (`system_settings`), nicht in `.env` (ermöglicht dynamische Modell-Wechsel via UI).
* **Process Isolation:** Separates Queue-Modell (`ai_queue` vs. `scraper_queue`), damit rechenintensive Crawls die schnellen AI-Tasks nicht blockieren.
* **Botasaurus-Fetcher:** `botasaurus.request` (CFFI) wird nicht verwendet — lädt bei Import eine Native-Library von GitHub, crasht ohne Internet. Stattdessen plain `requests` + Browser-Headers für HTTP-Fallback; botasaurus `@browser` (undetected-chromedriver) nur für JS-heavy Sites.
* **Single-Container Deployment:** Trotz logischer Trennung laufen alle 4 Backend-Prozesse via `supervisord` in *einem* Docker-Container (vereinfacht das Hosting).

### 5. Open Questions

* **Monolith vs. Microservices:** Soll die supervisord-Struktur langfristig in echte, eigenständige Docker-Services (Scraper API, Workers) zerlegt werden?
* **Notification Overrides:** Benachrichtigungs-Einstellungen sind global (User) und per Plattform konfigurierbar – bleibt das Override-Modell so bestehen?