# Commands

## Docker
- Start all services: `docker-compose up -d --build`
- Logs: `docker-compose logs -f server` / `docker-compose logs -f frontend`
- Infra only (DB, Redis, RabbitMQ): `docker-compose up -d database redis rabbitmq`

## Local Development
- Frontend: `cd frontend && npm run dev` (needs `NEXT_PUBLIC_API_URL=http://localhost:8002` in `frontend/.env.local`)
- Backend API: `cd server && uvicorn api:app --host 0.0.0.0 --port 8002`
- AI worker + Beat scheduler: `cd server && celery -A worker.celery_app worker -B -Q ai_queue`
- Scraper worker: `cd server && celery -A scraper_worker.celery_app worker -Q scraper_queue`

## Database Migrations
- Apply: `cd server && alembic upgrade head` (auto-runs in Docker via `entrypoint.sh`)
- Create: `cd server && alembic revision --autogenerate -m "description"`

# Architecture

## Service Topology
Five Docker containers: `database` (PostgreSQL 15), `redis` (pub/sub + Celery backend), `rabbitmq` (Celery broker), `server` (port 8002), `frontend` (port 3000).

**Server container** runs three processes via `supervisord`:
1. `uvicorn api:app` – FastAPI app (main API + `/scraper` sub-app mounted internally)
2. `celery -A worker.celery_app worker -B -Q ai_queue` – AI tasks + Beat scheduler (runs every 60s)
3. `celery -A scraper_worker.celery_app worker -Q scraper_queue` – Playwright scraping

## Key Backend Files
- `api.py` – All REST endpoints, WebSocket (`/ws`), auth, rate limiting
- `database.py` – All SQLAlchemy models + Pydantic schemas
- `auth.py` – JWT auth: access token (15 min), refresh token (7 days), both HttpOnly cookies
- `worker.py` – AI Celery tasks: job analysis, application generation, notifications, crawl scheduling
- `scraper_worker.py` – Scraper Celery tasks (Playwright)
- `scraper_api.py` – Internal FastAPI sub-app mounted at `/scraper`
- `intelligence_service.py` – OpenRouter/OpenAI client utilities
- `celery_config.py` / `scraper_celery_config.py` – Celery app configs

## Auth Architecture
- Backend sets `access_token` HttpOnly cookie (JWT) on login
- `get_current_user` validates JWT and checks `token_version` against DB (incrementing it invalidates all sessions)
- **DO NOT use `localStorage` for auth state**
- Frontend `useAuth()` hook exposes `token` as sentinel `"__session__"` (not real JWT) or `null`
- `fetchWithAuth()` (from `AuthProvider`) sends `credentials: 'include'` and auto-retries with `/auth/refresh` on 401
- Default admin: `ADMIN_PASSWORD` env var (default: `admin`); JWT signing: `SECRET_KEY` env var

## Real-time Updates
- AI worker publishes to Redis channel `job_updates` via pub/sub
- `api.py` has a `redis_listener()` asyncio background task that forwards to WebSocket clients

## Environment Variables
| Var | Where | Purpose |
|-----|-------|---------|
| `NEXT_PUBLIC_API_URL` | frontend `.env.local` | API base URL for local dev |
| `APP_API_URL` | Docker env | Runtime-injected into built frontend via `env.sh` + `sed` |
| `SECRET_KEY` | server | JWT signing key |
| `ADMIN_PASSWORD` | server | Default admin password |
| `COOKIE_SECURE` | server | Set `true` in production |

OpenRouter API key and model are configured via Admin UI (`/admin/settings`) and stored in DB — no `.env` file needed.

# Frontend Structure

## Tech Stack
- Next.js 16 (standalone output), React 19, TypeScript 5
- **Tailwind CSS v4** — uses `@tailwindcss/postcss` PostCSS plugin, NOT v3 `tailwind.config.js` content array pattern
- Dark mode: class-based via `@custom-variant dark (&:where(.dark, .dark *))`, `dark` class toggled on `<html>`
- lucide-react (icons), react-markdown + @tailwindcss/typography

## Key Routes
| Route | Description |
|-------|-------------|
| `/` (route group `(dashboard)`) | Dashboard / Overview |
| `/listings` | Job listings with filters + kanban board |
| `/profile` | User CV/profile |
| `/settings` | Notification adapter settings |
| `/account` | Password change |
| `/companies` | Company profiles |
| `/archive` | Archived jobs |
| `/login` | Login (no sidebar) |
| `/admin/settings` | OpenRouter config (admin only) |
| `/admin/users` | User management (admin only) |

## Key Shared Components
- `PageWrapper` + `PageHeader` — **required** for ALL new top-level pages
- `AuthProvider` — `useAuth()` hook, `fetchWithAuth()` utility
- `DashboardShell` — sidebar nav (collapsible) + mobile bottom nav
- `LanguageProvider` — `useLanguage()` hook with `t(key)` for EN/DE i18n (stored in localStorage)
- `NotificationProvider` — `useNotification()` for AI error banner state
- `Portal` — React portal for modals
- `JobBoard` — Kanban board view
- `JobDetailModal` — Job detail modal

# UI & Styling Conventions
- **Page Rules**: ALL new top-level pages MUST use `<PageWrapper>` and `<PageHeader>`
- **Dark Mode**: Always provide both light and dark variants together (e.g., `bg-white dark:bg-slate-900`)
- **Custom Utilities**: Use `.glass-panel` and `.glass-card` (from `globals.css`) for surfaces
- **Colors**: Primary `indigo-500`, Secondary `purple-600`. Match scores: `emerald` (≥80), `amber` (≥50), `rose` (<50)
- **i18n**: All user-visible strings must use `t(key)` from `useLanguage()` with keys added to `lib/languages.ts`

# Data Model Highlights
- `JobEntry` – full job data including `match_score`, `status`, `is_favorite`, `is_archived`, `next_follow_up_at`
- `UserProfile` (table: `user_settings`) – CV data, notification settings per adapter
- `JobPlatform` – crawl targets with schedule, `notification_adapters` (JSON array)
- Job status pipeline: `OPEN → DRAFTED → APPLIED → INTERVIEW → OFFER → ACCEPTED` (also `REJECTED`, `FAILED`, `GENERATING`)
- Notification adapters: `NONE`, `PUSHOVER`, `RESEND`, `MAILJET`, `SMTP`
