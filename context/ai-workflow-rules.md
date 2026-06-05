# AI Workflow Rules

Developer workflow rules and procedures for building and modifying features in this repository.

## 1. Incremental Approach
* **Read Context Conditionally:** Start every session by reading [progress-tracker.md](/context/progress-tracker.md). Only open additional context files (`project-overview`, `architecture`, `ui-context`, `code-standards`) if the task directly touches their respective domain.
* **Spec Compliance:** Implement only what is explicitly specified. Do not extrapolate, infer, or invent behavior not defined in the context files.
* **Monorepo Structure:** Respect folder and service boundaries between `frontend/` (Next.js/Tailwind) and `server/` (FastAPI/Celery/PostgreSQL/RabbitMQ/Redis).

## 2. Work Isolation & Splitting
* **One Unit at a Time:** Perform changes in small, logical, and testable iterations. Do not touch multiple domain boundaries in a single step.
* **Separation of Concerns:** Split changes that cross boundaries:
  - Frontend UI changes **and** backend/worker changes must be shipped and verified separately.
  - Database schema migrations **and** feature logic must be landed and verified separately.
  - Changes across multiple unrelated REST routers or domains.
* **Scope Boundary:** If a change cannot be verified end-to-end quickly, it is too large. Split it.

## 3. Requirements & Documentation Alignment
* **Ambiguity Resolution:** If a feature requirement is missing or ambiguous, do not make assumptions. File it as an open question in `progress-tracker.md` or update the relevant context file before writing code.
* **Documentation Sync:** Update matching context documents when implementing changes:
  - Architecture, boundaries, database schemas, or storage updates ➔ [architecture.md](/context/architecture.md)
  - Coding patterns, libraries, safety standards, or project rules ➔ [code-standards.md](/context/code-standards.md)
  - Scope boundaries or feature list changes ➔ [project-overview.md](/context/project-overview.md)
  - After completing every unit of work ➔ [progress-tracker.md](/context/progress-tracker.md)

## 4. Commit & Branch Conventions

* **Branch strategy:** All work happens on `main` (single-developer project). No feature branches unless explicitly requested.
* **Commit message format:** `<type>(<scope>): <short description>` — lowercase, no period at end.
  - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
  - Scope: component or domain (e.g. `pipeline`, `auth`, `jobs`, `settings`)
  - Examples: `feat(pipeline): add JobSidePanel`, `fix(auth): correct token refresh logic`, `docs: update progress tracker`
* **One commit per logical unit:** Do not mix feature work and documentation updates in the same commit. `docs:` commits are separate.

## 6. Protected Files
Do not modify the following files unless explicitly requested by the user:
* **Database migrations:** Never modify existing Alembic migrations under `server/database/migrations/versions/*`. Always create a new revision.
* **Configuration files:** `server/database/alembic.ini` and `server/database/migrations/env.py`.
* **Generated directories:** `frontend/.next/` and `frontend/node_modules/`.
* **Lockfiles:** Do not edit `package-lock.json` manually; modify only using `npm` commands.

## 5. Definition of Done & Verification Commands

A task is considered complete only when the following verification steps are successfully executed and pass:

### A. Verification Checklist — by Change Type

**Frontend-only changes** (no backend/DB changes):
* [ ] `npm run lint` passes.
* [ ] `npm run build` passes without errors.
* [ ] Feature verified visually in the browser (golden path + responsive breakpoint).

**Backend-only changes** (no frontend/DB changes):
* [ ] `pytest` runs and all existing tests pass.
* [ ] Relevant smoke/verify scripts pass.
* [ ] No architectural invariants violated.

**Database schema changes:**
* [ ] New Alembic migration created (`alembic revision --autogenerate`).
* [ ] `alembic upgrade head` applies cleanly.
* [ ] `pytest` passes with the migrated schema.

**Full-stack changes:** all of the above apply.

**All changes:**
* [ ] **Documentation Sync:** Context files updated; work logged in `progress-tracker.md`.
* [ ] **Architectural Integrity:** No invariants from [architecture.md](/context/architecture.md) violated.

### B. Standard Verification Commands



Developers and AI agents MUST run the following commands to verify compliance. 

> [!NOTE]
> When executing Python commands (`pytest`, `alembic`, or running scripts) in the `server/` directory, make sure to activate the virtual environment (`.venv\Scripts\Activate.ps1` on Windows or `source .venv/bin/activate` on Linux/macOS) or prefix the command with the virtual environment Python interpreter (e.g. `.venv\Scripts\python` or `.venv/bin/python`).

| Service / Area | Action | Command | Working Directory |
| --- | --- | --- | --- |
| **Frontend** | Run Linter | `npm run lint` | `frontend/` |
| **Frontend** | Production Build | `npm run build` | `frontend/` |
| **Database** | Apply Migrations | `alembic -c database/alembic.ini upgrade head` | `server/` |
| **Backend Tests** | Run Test Suite | `pytest` | `server/` |
| **Smoke Tests** | Run Smoke Script | `python scripts/smoke_test.py` | `server/` |
| **Admin Settings** | Verify Configs | `python scripts/verify_admin_settings.py` | `server/` |
| **Security/Auth** | Verify Password/User | `python scripts/verify_password.py` and `python scripts/verify_usermanagement.py` | `server/` |
