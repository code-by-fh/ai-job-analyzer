# Commands
- Start infrastructure: `docker-compose up -d --build`
- View logs: `docker-compose logs -f server` / `docker-compose logs -f frontend`
- Apply DB migrations: `cd server && alembic upgrade head` (Create: `alembic revision --autogenerate -m "desc"`)
- Local frontend: `cd frontend && npm run dev`
- Local backend API: `cd server && uvicorn api:app --host 0.0.0.0 --port 8002` 
- Local workers: `celery -A worker.celery_app worker -B -Q ai_queue` / `celery -A scraper_worker.celery_app worker -Q scraper_queue`

# Architecture & Environment Quirks
- **Auth**: Uses stateful `HttpOnly` cookies and verifies `token_version`. DO NOT use `localStorage` for auth state.
- **API Topology**: AI service, Scraper API (`/scraper`), and Celery workers are bundled in a single container via supervisord.
- **Environment**: OpenRouter API key is configured via Admin UI (stored in DB). Frontend requires `APP_API_URL`.

# UI & Styling Conventions
- **Page Rules**: ALL new top-level pages MUST use `<PageWrapper>` and `<PageHeader>` for consistent layout and animations.
- **Dark Mode**: Class-based. Always provide both light and dark variants together (e.g., `bg-white dark:bg-slate-900`).
- **Custom Utilities**: Use `.glass-panel` and `.glass-card` (from `globals.css`) for surfaces instead of raw Tailwind built-ins.
- **Colors**: Primary is `indigo-500`, Secondary is `purple-600`. Statuses: `emerald` (≥80), `amber` (≥50), `rose` (<50).
