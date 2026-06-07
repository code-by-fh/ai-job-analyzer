## Progress Tracker

### 1. Current Status (As of 2026-06-07)

**Phase:** CV-Template AI-Fill — Lebenslauf-Template im Dokument-Templates-Bereich hochladen → KI füllt Profildaten ein. Kein separater Master-CV-Bereich.

> ⚠️ **Risk:** `routers/auth.py` and `routers/jobs.py` have 0% automated test coverage. These are the two most security-critical routers. Any change to auth or job logic is unverified until this is addressed.

### 2. Status Board

| Feature Block | Status / Files | Key Details |
| --- | --- | --- |
| **Auth & Admin** | ✅ Completed (`routers/auth.py`, `admin.py`) | JWT Login/Refresh/Logout via `tv` (Token-Version), Admin UI, split Cloud & Local AI Model Settings with separate forms and save buttons. |
| **Job CRUD & Archive** | ✅ Completed (`routers/jobs.py`) | List/Filter, Notes, Bulk actions, History, Uploads. Matching threshold automatically archives new jobs with `match_score < threshold`. |
| **AI Layer** | ✅ Completed (`intelligence/`) | Matching, Cover letters, Interview prep, Company profiles via OpenRouter. |
| **AI Task Routing** | ✅ Completed (`intelligence/service.py`, `database/core.py`, `routers/admin.py`, `routers/companies.py`, `routers/platforms.py`, `workers/tasks/*.py`, `workers/scraper_worker.py`, `frontend/.../admin/settings/page.tsx`) | Per-task provider config (Local LLM / OpenRouter) for all 8 AI operations; `ai_task_routing` JSON column; `get_client_and_model()` helper; admin UI with dropdowns; GET returns merged effective defaults. 62 tests green. |
| **AI Service Extension** | ✅ Completed (Task 2: `server/intelligence/service.py`) | `generate_application` and `generate_tailored_cv` now accept full profile data (name, location, skills, spoken_languages, preferences). Commit: 2e26913. |
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
| **CV Improvement Notes UI** | ✅ Completed (Task 7: `frontend/app/components/JobCard/JobApplicationTab.tsx`) | Toggle button → textarea panel for CV regen notes; mirrors Anschreiben pattern; notes sent as `cv_notes` in generate-package request. Commit: 8c9b535. |
| **CV + Cover Letter Full Generation** | ✅ Completed (`server/intelligence/prompts.py`, `service.py`, `workers/tasks/application.py`, `workers/tasks/package.py`, `routers/jobs.py`, `frontend/.../JobApplicationTab.tsx`) | Full profile fields sent to AI; both documents rendered from user-selected template via WeasyPrint with OSError fallback; GENERATED_LETTER stored as JobDocument; letter PDF shown in iframe; CV notes passed through API; 11 commits: 1607e77–ec21350. |
| **Admin API — Task 5** | ✅ Completed (`server/routers/admin.py`) | `ai_task_routing` field added to `SystemSettingsUpdate`; GET/POST `/admin/settings` now expose `ai_task_routing` dict. Commit: 8a2bbe8. |
| **CV-Template AI-Fill** | ✅ Completed (`server/database/migrations/versions/p8q9r0s1t2u3_...py`, `server/database/core.py`, `server/routers/templates.py`, `server/workers/tasks/fill_cv_template.py`, `server/workers/worker.py`, `server/workers/tasks/package.py`, `frontend/app/profile/page.tsx`, `frontend/app/profile/components/DocumentTemplateGallery.tsx`, `frontend/app/lib/types.ts`) | CV-Template hochladen via Dokument-Templates-Gallery → Celery-Task `ai.fill_cv_template` füllt mit Profildaten → speichert als `DocumentTemplate` (`doc_type="CV"`, `status=None`). Gallery zeigt Spinner während `status="processing"`, pollt alle 3s. Für Job-Pakete: `fill_html_cv_with_ai` mit Job-Kontext. Kein separater Master-CV-Bereich mehr. |

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
