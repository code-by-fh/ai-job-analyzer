## Progress Tracker

### 1. Current Status (As of 2026-06-05)

**Phase:** Added spoken_languages field to user profile — stored in DB, included in AI job analysis and company research prompts, editable in frontend profile page.

> ⚠️ **Risk:** `routers/auth.py` and `routers/jobs.py` have 0% automated test coverage. These are the two most security-critical routers. Any change to auth or job logic is unverified until this is addressed.

### 2. Status Board

| Feature Block | Status / Files | Key Details |
| --- | --- | --- |
| **Auth & Admin** | ✅ Completed (`routers/auth.py`, `admin.py`) | JWT Login/Refresh/Logout via `tv` (Token-Version), Admin UI, split Cloud & Local AI Model Settings with separate forms and save buttons. |
| **Job CRUD & Archive** | ✅ Completed (`routers/jobs.py`) | List/Filter, Notes, Bulk actions, History, Uploads. Matching threshold automatically archives new jobs with `match_score < threshold`. |
| **AI Layer** | ✅ Completed (`intelligence/`) | Matching, Cover letters, Interview prep, Company profiles via OpenRouter. |
| **Platforms & Beat** | ✅ Completed & Tested (`routers/platforms.py`, `tests/test_platforms_router.py`) | CRUD, Intervals, Scheduler, Deferred setup wizard (URL-based), URL pattern inference (character-wise common prefix). 15 tests green. |
| **Application Package** | ✅ Completed & Tested (`workers/tasks/package.py`, `routers/profile_documents.py`, `tests/test_profile_documents_router.py`) | One-click CV + Cover letter → PDF, Profile documents. |
| **Template Editor** | ✅ Completed (`routers/templates.py`, `services/template_filler.py`, `services/document_renderer.py`) | DocumentTemplate CRUD; slot-filler; WeasyPrint via external render API; two-column in-browser editor. |
| **PDF Rendering** | ✅ Completed (Task 4: `server/requirements.txt`, `server/Dockerfile`, `docker-compose.yml`) | Removed Playwright deps (playwright, playwright-stealth, xvfb, x11vnc, novnc). Added weasyprint==69.0. Dockerfile: switched to python:3.11-slim-bookworm, added WeasyPrint system deps (libpango, libgdk-pixbuf). docker-compose.yml: added RENDER_API_URL env var, removed noVNC port 6080. All 64 tests pass. |
| **Companies** | ✅ Completed (`routers/companies.py`) | Domain-specific views & deep-dive analyses. |
| **Dual Storage** | ✅ Completed (`services/storage.py`) | DB-Blob (`LargeBinary`) vs. Google Drive OAuth. |
| **Notifications** | ✅ Completed & Tested (`routers/settings.py`, `tests/test_settings_router.py`) | 5 channels: Gmail, Pushover, Resend, Mailjet, SMTP + Templates. 49 tests green. |
| **Real-time Engine** | ✅ Completed (`routers/websocket.py`) | Cookie-authed `/ws`, Live-Updates via `useCrawl` / `CrawlStatus`. |
| **Pipeline Panel** | ✅ Completed (`components/JobSidePanel/`, `hooks/useJobPanel.ts`, `app/jobs/[id]/page.tsx`) | JobSidePanel replaces JobDetailModal: 420px slide-in, PipelineTabs, StepCard-CTAs, URL sync `?job=<id>`, deep-link restore, full `/jobs/[id]` route. |
| **Spoken Languages** | ✅ Completed (`database/core.py`, `routers/settings.py`, `workers/tasks/analyze.py`, `workers/tasks/research.py`, `frontend/app/profile/page.tsx`) | `spoken_languages` JSON column in `user_settings`; migration `k3c4d5e6f7a8`; comma-sep input in profile Target tab; sent to AI in job analysis and company research prompts. |

### 3. Next Up & Backlog

* [ ] **Automated Tests:** Auth & Jobs (currently 0% Coverage). ⚠️ Critical — unverified changes to these routers carry high regression risk.
* [ ] **Security Hardening:** Review of SSRF vectors, JWT validation, admin scopes.
* [ ] **Application Package Integration:** Online submission hook + direct mail gateway (post-MVP).

### 4. Key Architectural Decisions (ADRs)

* **OpenRouter Config:** Stored in DB (`system_settings`), not in `.env` (dynamic model switches via UI).
* **Process Isolation:** Separate queue model (`ai_queue` vs. `scraper_queue`); Playwright crawls do not block AI tasks.
* **Single-Container Deployment:** All 4 backend processes via `supervisord` in a single Docker container.
* **Deferred Platform Creation:** Platform is only created upon completion of the setup wizard (no `pending_setup` overhead).
* **URL-Pattern Inference:** Character-wise common prefix (`os.path.commonprefix`) with trim to the last natural separator — more robust than a segment-wise approach for boards with IDs in the path.

### 5. Open Questions

* **Monolith vs. Microservices:** Should the supervisord structure be split into independent Docker services in the long run?
* **Notification Overrides:** Notification settings are global + per-platform configurable — does this override model remain?
