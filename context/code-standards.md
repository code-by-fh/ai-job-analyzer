# Code Standards

## General

* Keep code simple, readable, and maintainable.
* Follow the project's formatting and linting rules.
* Avoid duplicated code and unnecessary complexity.
* Validate all external input at system boundaries.

## Security

* Never commit secrets, credentials, or API keys.
* Use environment variables for system configuration.
* Never expose sensitive data in logs or API responses.
* Apply authorization checks before accessing or modifying user-owned resources.

## Frontend

* **Strict TypeScript:** Use strict TypeScript typing; the use of `any` is strictly prohibited.
* **Component Patterns:** Use React 19 functional components with arrow functions. Prefer hand-rolled components styled with Tailwind v4 utility classes over external UI libraries.
* **Separation of Concerns:** Keep business, state-management, and API fetching logic outside UI components. Move them into custom React hooks (e.g., `useJobPanel.ts`).
* **Reusable Types:** Prefer reusable and shared types located in a centralized definitions file.
* **Data Fetching:** Always use `fetchWithAuth` from `AuthProvider` for all authenticated API calls — never use `fetch` directly. No SWR or React Query; all server state lives in custom hooks with `useState` + `useEffect`/`useCallback`. Error state is managed as `string | null` via `useState`.
* **Error Handling (Frontend):** Catch errors in hooks, not in components. Expose an error string to the component; never `console.error` alone. On `res.ok === false`, read `res.json()` and surface `detail` from the FastAPI error response.

## Backend (FastAPI / Python)

* **Type Hinting:** Use strict Python type hints on all function signatures and parameters.
* **Request/Response Models:** Always validate request payloads and document response shapes using Pydantic schemas (using `response_model` or typed return values).
* **Dependency Injection:** Use FastAPI's `Depends` wrapped with `Annotated` for injecting database sessions, configurations, and current user credentials (e.g., `db: Annotated[Session, Depends(get_db)]`).
* **Async vs Sync Routes:** 
  - Do not use `async def` for endpoints that perform blocking synchronous operations (e.g., synchronous database queries via SQLAlchemy, file operations, or heavy computing). Use standard `def` routes so FastAPI can delegate them to its external thread pool.
  - Use `async def` only when all I/O operations inside the handler are asynchronous (e.g., async HTTP requests, async WebSockets, or async database calls).
* **Surgical Handlers:** Keep route handlers extremely thin. Handlers should parse inputs, trigger asynchronous background tasks (Celery) or invoke backend services, and return quickly.
* **Error Handling (Backend):** Use `raise HTTPException(status_code=status.HTTP_<CODE>, detail="...")` for all client errors. Always use `status.*` constants (e.g. `status.HTTP_404_NOT_FOUND`), not raw integers. For unexpected server errors, catch the exception, log it, and re-raise as `HTTP_500_INTERNAL_SERVER_ERROR` with a generic message — never leak stack traces or internal state in the `detail` field.

  | Situation | Status Code |
  | --- | --- |
  | Resource not found | `404 NOT_FOUND` |
  | Auth failed / token invalid | `401 UNAUTHORIZED` |
  | Authenticated but not allowed | `403 FORBIDDEN` |
  | Validation / bad input | `400 BAD_REQUEST` |
  | Unexpected server error | `500 INTERNAL_SERVER_ERROR` |

## Data & Database

* **Migrations:** Manage all database schema changes strictly through Alembic migrations. Do not modify databases manually or use `Base.metadata.create_all()` in application code paths.
* **Storage Abstraction:** Store files and attachments only through the approved storage service abstraction (`services/storage.py`), supporting dual-storage (PostgreSQL LargeBinary or Google Drive OAuth).

## Review Checklist

* [ ] No secrets or keys committed?
* [ ] Input validation present at boundaries (Pydantic/TypeScript)?
* [ ] Authorization and owner check (`user_id == current_user.id`) enforced on all queries/mutations?
* [ ] Proper async/sync def routing chosen for backend endpoints?
* [ ] Types defined correctly without using `any`?
* [ ] Business logic separated from controllers/components?
* [ ] No unnecessary complexity or duplication?
* [ ] Backend errors use `status.*` constants and never leak internal details in `detail`?
* [ ] Frontend API calls use `fetchWithAuth` (not raw `fetch`)?
* [ ] Frontend error state surfaced via hook return, not swallowed in `console.error`?

