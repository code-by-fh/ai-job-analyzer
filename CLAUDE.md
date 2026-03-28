# Project Handover Memory

## 🛠️ Stack & Architecture
- **Backend**: FastAPI (8002), Celery (AI & Scraper workers), PostgreSQL 15, Redis (Pub/Sub), RabbitMQ.
- **Frontend**: Next.js 16 (Standalone), React 19, TS 5, **Tailwind CSS v4** (PostCSS, no v3 config).
- **Docker**: `database`, `redis`, `rabbitmq`, `server` (Uvicorn + 2 Celery workers via supervisord), `frontend`.
- **Auth**: JWT HttpOnly cookies (`access_token`). Sentinel `__session__` in `useAuth()`. No `localStorage` for tokens.
- **Real-time**: AI updates via Redis PubSub forwarded to WebSockets in `api.py`.
- **Storage**: Flexible abstract `storage_service.py` (Local DB or Google Drive) toggled in Settings.

## 📜 Standards & Conventions (Enforce in new code)
- **UI Rules**: ALL top-level pages MUST use `<PageWrapper>` and `<PageHeader>` (with i18n subtitle).
- **Styling**: Tailwind v4. Class-based dark mode (`bg-white dark:bg-slate-900`). Use `.glass-panel`/.glass-card`.
- **Forms**: Use auto-resizing textareas for long text inputs.
- **i18n**: All user strings must use `t(key)` from `useLanguage()`. Keys in `lib/languages.ts`.
- **Tutorials**: `driver.js` via `<Tutorial>` component; state in `localStorage`.
- **Logic**: Primary `indigo-500`. Match scores: Emerald (≥80), Amber (≥50), Rose (<50).

## 🚀 Key Commands
- **Start All**: `docker-compose up -d --build`
- **Frontend Dev**: `npm run dev` (Port 3000, requires `NEXT_PUBLIC_API_URL=http://localhost:8002`).
- **Migrations**: `alembic upgrade head` / `alembic revision --autogenerate`.
- **AI Worker**: `celery -A worker.celery_app worker -B -Q ai_queue` (includes Beat scheduler).

## 💡 Persistence & State
- **Config**: OpenRouter keys/models stored in DB via Admin UI (`/admin/settings`), NOT `.env`.
- **Models**: `JobEntry` (unarchiving supported), `UserProfile` (storage/notif settings), `JobPlatform` (`is_active` state).
- **Containers**: Restart relevant container(s) after modifying backend, frontend, or infra files.