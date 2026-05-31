# AI Workflow Rules

## Approach

Build incrementally against the specs in `context/`. Implement what the context
files define — don't infer or invent behavior. Before any implementation or
architectural decision, read the context files in the order set by `CLAUDE.md`:
`project-overview` → `architecture` → `ui-context` → `code-standards` →
`ai-workflow-rules` → `progress-tracker`.

Monorepo: `frontend/` (Next.js/React/TS/Tailwind) + `server/` (FastAPI/Celery/
SQLAlchemy/Alembic), infra via `docker-compose.yml`. Respect the boundaries in
`architecture.md`.

## Scoping

- One feature unit at a time; prefer small, verifiable increments.
- Don't combine unrelated boundaries in one step. Boundaries: scraper API
  (`scraper_api.py`), AI service (`intelligence/`), Celery workers/beat
  (`workers/`), REST routers (`routers/`), frontend (`frontend/`), DB schema
  (`database/`).

## When to Split Work

Split a step that combines:

- Frontend UI **and** backend/worker changes — ship and verify each side alone.
- Multiple unrelated routers/domains.
- A migration **and** feature logic — land + verify the migration first.
- Behavior not defined in the context files — define it first (see below).

If it can't be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Don't invent product behavior absent from the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before
  coding.
- If a requirement is missing, add it as an open question in `progress-tracker.md`
  first.

## Protected Files (don't touch unless instructed)

- Applied Alembic migrations (`database/migrations/versions/*`) — add a new
  revision, never edit an existing one.
- `frontend/.next/`, `frontend/node_modules/` — generated.
- Lockfiles (`package-lock.json`) — only via the package manager.
- `database/alembic.ini`, `database/migrations/env.py` — Alembic config.

## Keeping Docs in Sync

Update the matching context file when implementation changes:

- Architecture / boundaries / storage → `architecture.md`.
- Conventions / standards → `code-standards.md`.
- Feature scope / behavior → `project-overview.md`.
- After every meaningful change → `progress-tracker.md`.

## Definition of Done (per unit)

- [ ] Unit works end to end within its scope.
- [ ] No `architecture.md` invariant violated.
- [ ] `progress-tracker.md` updated; any new context defined in its file.
- [ ] Frontend: `cd frontend && npm run build` and `npm run lint` pass (don't
      bypass the husky pre-commit hook).
- [ ] Schema: new Alembic migration created + applied
      (`alembic -c database/alembic.ini upgrade head`, from `server/`).
- [ ] Backend: relevant `server/scripts/` check passes — `smoke_test.py`, and
      `verify_admin_settings.py` / `verify_password.py` / `verify_usermanagement.py`
      when relevant (run against the running API).
