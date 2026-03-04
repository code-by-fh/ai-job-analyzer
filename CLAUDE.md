# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Job Agent is a full-stack application that automates job searching and application generation. It scrapes job platforms, uses LLMs via OpenRouter to analyze matches against a user profile, and generates cover letters.

## Architecture

```
Frontend (Next.js 16/React 19) → REST APIs → Server (FastAPI)
                                             ├── api.py          (main AI service endpoints)
                                             ├── scraper_api.py  (scraper endpoints, mounted at /scraper)
                                             ├── worker.py       (Celery AI worker, queue: ai_queue)
                                             ├── scraper_worker.py (Celery scraper worker, queue: scraper_queue)
                                             ├── database.py     (SQLAlchemy models + Pydantic schemas)
                                             ├── auth.py         (JWT auth, bcrypt passwords)
                                             ├── celery_config.py (Celery Beat: checks platforms every 5min)
                                             └── scraper_celery_config.py
```

All three Celery/API processes run in one container managed by **supervisord** (`supervisord.conf`). The single `server` container (port 8002) serves both the AI API (root) and the scraper API (at `/scraper`).

### Key Data Flow
1. Celery Beat (`celery_config.py`) triggers `check_platforms_for_crawl` every 5 minutes
2. Scraper worker uses Playwright to crawl job platform URLs
3. Scraped jobs queued to AI worker via RabbitMQ (`ai_queue`)
4. AI worker calls OpenRouter API (using the OpenAI client with `base_url="https://openrouter.ai/api/v1"`) to analyze/score jobs
5. Results stored in PostgreSQL; Redis tracks active crawl job state

### Database Schema (SQLAlchemy in `database.py`)
- `users` — auth, `is_admin` flag
- `jobs` — job listings with `match_score`, `status` (OPEN/APPLIED/etc.), `platform_id`
- `user_settings` — user profile (role, skills, CV data as JSON, notification settings)
- `job_platforms` — per-user crawl sources with intervals and notification config
- `system_settings` — global OpenRouter model ID (default: `tngtech/deepseek-r1t2-chimera:free`)
- `domain_url_patterns` — URL extraction patterns by domain

### Frontend Structure (`frontend/app/`)
- `layout.tsx` — root layout
- `page.tsx` — dashboard
- `listings/` — job listings and detail view
- `profile/` — user profile/CV editor
- `settings/` — notification and platform settings
- `account/` — password change
- `admin/users/` and `admin/settings/` — admin-only pages
- `components/` — shared UI components
- `lib/types.ts` — shared TypeScript interfaces
- `lib/navigation.ts` — nav item config (MAIN_NAV_ITEMS, ADMIN_NAV_ITEMS)
- `hooks/` — `useCrawl.ts`, `useJobs.ts` custom hooks

Frontend reads API URLs from env vars: `APP_API_URL`, `APP_API_SCRAPER_URL`, `APP_API_WS_URL`.

### Auth
JWT tokens (HS256, 24h expiry) via `auth.py`. `SECRET_KEY` defaults to `super_secret_dev_key_12345` — override in production. Admin routes use `get_current_admin_user` dependency.

## Development Commands

### Full Stack (recommended)
```bash
# Start all services
docker-compose up -d --build

# View logs
docker-compose logs -f server
docker-compose logs -f frontend
```

### Frontend Only
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

### Backend (requires Docker for DB/Redis/RabbitMQ)
```bash
# Start infrastructure only
docker-compose up -d database redis rabbitmq

# Run server locally
cd server
pip install -r requirements.txt
playwright install chromium

# Run API
uvicorn api:app --host 0.0.0.0 --port 8002

# Run AI worker
celery -A worker.celery_app worker -B --loglevel=info --concurrency=4 -Q ai_queue

# Run scraper worker
celery -A scraper_worker.celery_app worker --loglevel=info --concurrency=2 -Q scraper_queue
```

### Database Migrations
```bash
cd server

# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Environment Variables

Required in `.env` at project root:
```env
OPENAI_API_KEY=<openrouter-api-key>   # Used as OpenRouter API key
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=jobdb
SECRET_KEY=<jwt-secret>               # Optional, has insecure default
```

## Frontend Styling

**Stack**: Tailwind CSS v4 with `@tailwindcss/typography` plugin. Fonts: Geist Sans + Geist Mono (Google Fonts).

**Dark mode**: Class-based (`darkMode: 'class'` in `tailwind.config.ts`). The `dark` class is toggled on `<html>` by `ThemeToggler.tsx`, which persists the preference to `localStorage` and falls back to `prefers-color-scheme`. Always pair light and dark variants: `bg-white dark:bg-slate-900`.

**Custom utility classes** (defined in `globals.css`, use these instead of raw Tailwind for cards/panels):
- `.glass-panel` — frosted-glass sidebar/panel (white/70 blur in light, slate-900/40 blur in dark)
- `.glass-card` — content card (white border-slate-200 in light, slate-900/60 border-slate-800 in dark)
- `.text-gradient` — indigo-to-purple gradient text

**Color palette conventions**:
- Primary accent: `indigo-500` / `indigo-600` (active states, focus rings, highlights)
- Secondary accent: `purple-600` (gradients paired with indigo)
- Match score colors: `emerald` (≥80), `amber` (≥50), `rose` (<50)
- Backgrounds: `slate-50` / `slate-950`; surfaces: `slate-900/60` with `slate-800` borders in dark

**Icons**: `lucide-react` library throughout.

**Interaction patterns**: `transition-all duration-300` for all interactive state changes; `hover:scale-105 active:scale-95` for buttons; `rounded-2xl` for cards.

## Service Ports
- Frontend: `3000`
- Server (AI + Scraper APIs): `8002` (internal port 80)
- PostgreSQL: `5432`
- Redis: `6379`
- RabbitMQ: `5672` (AMQP), `15672` (management UI)
