# AI Job Agent - Project Overview

Developer documentation outlining the core concept, architecture, key features, boundaries, and hard rules for the AI Job Agent MVP.

## 1. Core Concept & Stack
* **Concept:** Self-hosted (Docker Compose) web application for technical users to automate job searching, scoring, document generation, and tracking.
* **Architecture:** Single-container architecture managed via `supervisord` containing:
  - FastAPI App (`main.py`, Port 8080) for API, Auth, and WebSockets.
  - Scraper Service (`scraper_api.py`, internal Port 8081).
  - Celery Worker (AI Queue + Celery Beat scheduler).
  - Celery Worker (Scraping Queue).
  - Infrastructure: PostgreSQL, Redis (pub/sub & caching), RabbitMQ.
* **LLM Integrations:** OpenRouter (cloud models) + local Ollama instance (SSRF-exempt).
* **Storage:** Dual-storage system per user (PostgreSQL LargeBinary Blob or Google Drive OAuth2) for documents and attachments.
* **Frontend:** Next.js (App Router), React 19, Tailwind v4. No external UI kits; all components are hand-rolled.

## 2. Core Features (Developer Summary)
1. **Authentication & Data Isolation:** Cookie-based JWT authentication validating a token version (`tv`) for API and WebSockets. Every database query/mutation must explicitly isolate data by matching `user_id == current_user.id`.
2. **Crawl & Scraping Engine:** Scheduled and on-demand scraping running via Playwright-stealth (headless=False inside Xvfb, noVNC exposed on port 6080). SSRF protection filters out private, loopback, and link-local IP addresses using `_is_safe_url`.
3. **AI Pipeline:** Automatic scoring and evaluation matching job requirements against user profile. Automatic archival of jobs below the matching threshold score. On-demand generation of tailored cover letters, resumes, and interview preparation guides.
   - **Re-score edge case:** If a job's `match_score` is updated (e.g. after profile change) and the new score falls below the threshold, the job is re-archived. If the score rises above the threshold, the job is **not** automatically restored — manual status change is required.
4. **ATS Pipeline & UI Layout:** Interactive application tracking status pipeline (`OPEN` ➔ `DRAFTED` ➔ `APPLIED` ➔ `INTERVIEW` ➔ `OFFER` ➔ `ACCEPTED/REJECTED`). Desktop uses collapsible sidebar layout; mobile uses bottom navigation. The `JobSidePanel` is a slide-in panel synchronized with `?job=<id>` query param, supporting deep-linking and a dedicated `/jobs/[id]` route.
5. **Template & Document Editor:** Two-column in-browser HTML editor (dnd-kit BlockInspector, StylePanel) working with `DocumentTemplates`. Renders and fills slots/repeats, exporting clean PDFs using Playwright (with legacy xhtml2pdf fallback).

## 3. Scope Boundaries & Hard Invariants

### In Scope
* Multi-user support with admin role configurations.
* Global and user-scoped AI model configuration.
* Dual storage and notification channels (Gmail, Pushover, Resend, Mailjet, SMTP).

### Out of Scope (Strictly Forbidden)
* **No Auto-Submit:** Do not implement automated application submission (only generate drafts).
* **No SaaS billing/multi-tenancy:** The application is self-hosted and not structured for commercial SaaS monetization.
* **No Native Apps:** UI is web-only (responsive mobile layout).

### Hard Invariants
1. **No Inline Heavy Work:** HTTP handlers must never block on long-running processes (scraping, LLM, PDF generation). Handlers must only queue Celery tasks and return a task ID. State updates are published via Redis to WebSockets.
2. **Auth & Ownership Check:** Every request query/mutation must validate auth and resource ownership checking `user_id`.
3. **Alembic Migrations:** Database schema updates must go through Alembic migrations. Never rely on metadata `create_all`.
4. **SSRF Safe Requests:** All outgoing web crawler requests must be validated through `_is_safe_url` to prevent server-side request forgery.