# AI Job Agent - System Architecture

Factual and concise system architecture documentation for developers and AI agents.

## 1. Process Model & Stack
* **Container Orchestration:** A single container manages services via `supervisord` with the following active processes:
  1. `uvicorn` (Port 8080): Main FastAPI backend (`main.py`) serving REST endpoints, WebSockets (`/ws`), and JWT authentication.
  2. `scraper_api`: Internal FastAPI service (`scraper_api.py`, internal Port 8081) for validation and crawl control.
  3. `celery` (`ai_queue`): Processes AI assessment, document packaging, notifications, and runs the Celery Beat (`-B`) scheduler.
  4. `scraper_celery` (`scraper_queue`): Executes headless Playwright/BeautifulSoup4 crawls.
  5. `xvfb`, `x11vnc`, `novnc` (Port 6080): Virtual frame buffer and VNC interface for visual scraper monitoring.
* **Services Stack:**
  - **Database:** PostgreSQL 15 (SQLAlchemy 2.0 ORM, Alembic migrations).
  - **Message Broker & Task Queue:** RabbitMQ (Celery Broker).
  - **Cache & Pub/Sub:** Redis (Celery Backend, WS messaging, crawl progress state, crawl deduplication).
  - **LLMs:** Cloud models via OpenRouter (job analysis, cover letter, research) and local models via Ollama (tailored CV generation).
  - **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4. No component libraries (fully hand-rolled).

## 2. Directory Layout & Key Boundaries
* `server/core/` — Cross-cutting concerns: `auth.py` (JWT & Token Versioning), `connection_manager.py` (WebSockets), `celery_config.py`, and `logger.py`.
* `server/database/` — Database interface: `core.py` (SQLAlchemy models and Pydantic schemas) and Alembic migrations under `migrations/`.
* `server/routers/` — FastAPI endpoints:
  - `auth.py`: JWT login, refresh, logout (invalidates token version `tv`).
  - `jobs.py`: CRUD for job applications, notes, re-scoring, and package generation triggers.
  - `platforms.py`: CRUD for platform targets, deferred crawl setup, pattern inference.
  - `settings.py` / `admin.py`: Global configuration, Cloud/Local AI configs, notifications, and storage credentials.
  - `profile_documents.py` / `templates.py` / `companies.py`: Manages profile documents, template CRUD, and company analytics.
  - `websocket.py`: Custom WS authentication and pub/sub routing.
* `server/workers/` — Asynchronous queues:
  - `worker.py`: Entrypoint for the AI/General Celery app (`ai_queue`).
  - `scraper_worker.py`: Entrypoint for the Crawling Celery app (`scraper_queue`).
  - `tasks/`: Task modules for analysis (`analyze.py`), packaging (`package.py`), research (`research.py`), scheduling (`scheduling.py`), and link validation (`urls.py`).
  - `notifications/`: Adapters for email/push dispatch (`email.py`, `push.py`, `templates.py`).
  - **Retry policy:** Only `research.py` tasks define explicit retries (`max_retries=2`, `countdown=30–60s`). All other task modules have no retry policy — failures are logged and the task moves to a failed state. Uniform retry handling is an open gap.
* `server/services/` — Internal business logic:
  - `template_filler.py`: DOM-based slots filler (`data-slot` / `data-repeat` replacements).
  - `document_renderer.py`: Converts HTML to PDF via Playwright (`html_to_pdf_playwright`) with an `xhtml2pdf` fallback.
  - `job_documents.py` / `storage.py` / `submission.py`: Handles local Postgres LargeBinary vs. Google Drive OAuth active storage services.
* `frontend/app/` — Next.js Application:
  - `components/editor/`: Two-column browser-based document editor (`DocumentEditor.tsx`, `BlockInspector.tsx`, `StylePanel.tsx`).
  - `components/JobSidePanel/`: Slide-in panel for job details and actions, synchronized with `?job=<id>`.
  - `jobs/[id]/page.tsx`: Dedicated full page for deep-linked jobs.

## 3. Database Schema Overview
From [core.py](/server/database/core.py):
* `users` — Authentication credentials, role settings, and session tracking (`token_version`).
* `jobs` — Crawled postings, matching scores/reasoning, and editable `cv_html` / `cover_letter_html` blocks (the single source of truth for PDF rendering).
* `user_settings` — User preferences, CV data JSON, notification configurations (SMTP, Pushover, Resend, Mailjet), and active storage credentials.
* `system_settings` — Global default models and API endpoints/keys for OpenRouter and Ollama.
* `job_platforms` — Registered sites, cron schedules, matching URL patterns, and notification overrides.
* `document_templates` — Raw HTML layouts for resumes and cover letters (seeded with "Classic" structures).
* `company_profiles` — Extracted tech stacks, salary benchmarks, and cultural summaries for domains.
* `job_documents` — File attachments linked to a job (kind: `UPLOADED`, `GENERATED_CV`, `GENERATED_LETTER`, `ATTACHED_CERT`, `ATTACHED_REFERENCE`).
* `profile_documents` — General candidate certificates or references (types: `REFERENCE`, `CERTIFICATE`).
* `job_status_history` — State history tracking transitions (e.g. `OPEN` -> `DRAFTED` -> `APPLIED`).

## 4. Hard Security & Logic Invariants
1. **Async Execution:** Heavy tasks (scraping, PDF generation, LLM generation) must run inside Celery queues. HTTP endpoints must only enqueue tasks and return task IDs.
2. **Tenant Isolation:** Every database query must query with explicit owner validation: `user_id == current_user.id`.
3. **Token Versioning:** Login sessions validate the token version (`tv`). Logout increments `tv` in the `users` table to instantly revoke all active REST and WebSocket sessions.
4. **SSRF Guard:** Outbound scraper connections must be validated via `_is_safe_url` to restrict private, link-local, and loopback IP addresses (excluding internal Ollama connections).
5. **No DB-Metadata creation:** Always use Alembic migrations to mutate schemas. Never call `Base.metadata.create_all()` in production code paths.