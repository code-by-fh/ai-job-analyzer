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
* **User URLs (SSRF):** every URL a user supplies goes through `core/url_safety.py`. Pydantic validators call `ensure_public_http_url`, which checks syntax and literal IPs only and never DNS (validators run on the event loop). Endpoints and workers must resolve with `public_http_url` / `is_public_http_url` before any fetch, from a sync endpoint, `run_in_threadpool` or a Celery task. Store and forward only the canonical URL these functions return, never the URL as typed. Log user URLs with `host_for_log(url)` only, never with path or query. In tests, the autouse `public_dns` fixture resolves every host to `PUBLIC_TEST_ADDRESS`, so no test reaches DNS; patch `core.url_safety._resolve` to test other answers. The local model base URL is the one user-supplied URL not guarded by `url_safety` (admin-only, LAN by purpose; `architecture.md` section 4 lists its own checks).
* **Never echo server or input text to the user:** refusals are fixed codes or fixed texts (for example 422 `url_not_public`, `platform_rules` codes, test-send `detail`), and the web maps them to fixed translated keys (`SERVER_ERROR_TEXT`, `testErrorKey`, `describeError`). It never displays a server `detail`, a URL or a secret. A refusal with a fixed code is mapped by status plus code (`refusalText` in `frontend/src/features/profile/refusals.ts`, a `RefusalTable` per upload), anything unknown falls back to `describeError`; for a 5xx only the status survives `errors.ts` (e.g. 502 = `cv_parse_failed`), so never rely on its body.
* **Uploads:** read with `core/uploads.py` (`read_upload` / `read_upload_sync`, at most limit + 1 bytes), check the bytes with `require_type`, refuse with the fixed codes `file_too_large` / `unsupported_type`, and serve every file download (profile and job documents) with `content_disposition` (ASCII fallback plus `filename*`). Never echo the client's file name or declared type in an error, and never interpolate a file name into a header.
* **AI calls:** every feature's AI call goes through `intelligence.service._call_openrouter`, so provider errors reach the AI status banner (the admin connection test in `routers/admin.py` calls the client directly on purpose: it reports its own result). A new call sets an explicit `max_tokens`. Older calls without one (the template annotator, analysis, application, job extraction, tailored CV, platform name) predate this rule.
* **No DB error text on content-writing paths:** never log a DB statement error's text or traceback on a path that writes user content (files, HTML, CV data): its parameters carry that content. Log the exception type only (`fill_cv_template._store_annotation`, the profile and job document uploads).
* **Secrets are write-only in the web:** a secret field is parsed into a boolean at the API boundary (zod, `api/notificationSettings.ts`); no component, cache entry or request receives a secret or the server's mask. A secret input starts empty, only a typed value is sent, and `null` clears.
* **Untrusted HTML in the web:** template, preview and document HTML is rendered only in an `<iframe sandbox="">` via `srcdoc`, after `prepareForEditing` (editor CSP; the template preview also removes link targets, `templates/previewHtml.ts`). Both sanitisers must also remove `<template>`: a frame attaches `<template shadowrootmode>` as a live shadow root that no selector of the parsed document reaches, so links and SMIL setters inside it would survive. Never `dangerouslySetInnerHTML`, never a top-level frame `src`. (The job editor's frame is the one documented exception: `sandbox="allow-same-origin"` for `designMode`, without `allow-scripts`.)
* **Admin routes:** Every admin route depends on `get_current_admin_user` (admin-only query modes such as `GET /companies?scope=all` check inline and carry their own member test) and is listed in `test_every_admin_route_refuses_a_member` (`ADMIN_ROUTES` in `tests/test_company_directory.py`, plus `PATH_PARAMETERS` for a new path parameter; `test_the_admin_route_list_is_complete` fails CI for a missing one). No admin route answers 401 for a domain refusal (a wrong password is 400): the web treats every 401 as an expired session.
* **Per-user rate limits:** rate limits use `key_func=user_or_ip_key` (a user bucket only for a token `core.auth.token_subject` accepts: signature, `exp`, type and id subject) on every external-call and password-checking endpoint: the notification channel tests and `test-email` and the platform tests (`NOTIFICATION_TEST_RATE`, 5/min), the notification preview (30/min), change-password (`CHANGE_PASSWORD_RATE`, 5/min), the factory reset and the admin wipe (`PASSWORD_CHECK_RATE`, 5/min), the admin AI tests and model list (`ADMIN_TEST_RATE`, 10/min), company analyze and deep dive (`COMPANY_RESEARCH_RATE`, 10/min) and the search (`SEARCH_RATE`, 60/min). Login and refresh stay keyed by IP. Older limits that are still keyed by IP (pre-existing): job analysis, generation and package (`routers/jobs.py`), the CV import and the template preview.
* **Tokens:** a token is accepted only with `exp`, a `type` (access or refresh) that matches its use and an ASCII decimal `sub` (the user id) of up to 18 digits; create and read tokens only through `core/auth.token_claims` / `user_from_token`.

## Frontend

* **Strict TypeScript:** Use strict TypeScript typing; the use of `any` is strictly prohibited.
* **Component Patterns:** Use React 19 functional components with arrow functions. Prefer hand-rolled components styled with Tailwind v4 utility classes over external UI libraries.
* **Separation of Concerns:** Keep business, state-management, and API fetching logic outside UI components. Move them into custom React hooks (e.g., `useJobPanel.ts`).
* **Reusable Types:** Prefer reusable and shared types located in a centralized definitions file.
* **Data Fetching:** All API calls go through the client in `src/api/` (`api` from `api/instance.ts`, one module per resource) — never use `fetch` directly. Server state lives in TanStack Query (query keys in `api/queryKeys.ts`).
* **Internationalization (i18n):** All user-facing strings must use `t("key")` from `useI18n()`. Never hardcode German or English text directly in JSX. New keys must be added to both `frontend/src/i18n/de.ts` (source of truth) and `en.ts` before use.
* **Focus after a dialog closes (`frontend/`):** when a confirmed dialog closes and focus must move elsewhere (the opener is gone or re-rendered), call `closeThenFocus(close, target)` from `ui/focus.ts`: it commits the close with `flushSync` and focuses `target()` in the next `requestAnimationFrame`; otherwise the dialog's own focus return can commit after the frame and leave focus on `<body>`. New code does not hand-roll `requestAnimationFrame` focus moves. Where the close already committed (focus from an unmount cleanup, where `flushSync` is not allowed) or no dialog is involved (the wizard's `focusSource`), use `focusNextFrame(target)`, with the `isFocusLost` guard where focus may have moved on. Only `ui/focus.ts` calls `requestAnimationFrame`; `tests/unit/ui/focusMoves.test.ts` enforces it.
* **Scaling content (Frontend):** scale framed document pages with CSS `zoom` through the fixed step classes (`.zoom-30` ... `.zoom-100`, `ui/useFitZoom.ts`), never with an inline `style`; e2e clicks into a zoomed frame use `clickInZoomedFrame`.
* **List roles (Frontend):** every JSX `ul`/`ol` starts with `role="list"` (list styling removes the native role in Safari); an AST guard test (`tests/unit/ui/listRoles.test.ts`) enforces it.
* **Wrong password (Frontend):** detect a wrong-password refusal (400, never 401) only through `isWrongPassword` in `features/settings/wrongPassword.ts`, never by comparing the status or code locally.
* **Error Handling (Frontend):** Map every API error to a fixed translated sentence with `describeError` (`api/describeError.ts`); never `console.error` alone and never show the server's `detail`.

## Backend (FastAPI / Python)

* **Type Hinting:** Use strict Python type hints on all function signatures and parameters.
* **Request/Response Models:** Always validate request payloads and document response shapes using Pydantic schemas (using `response_model` or typed return values).
* **Dependency Injection:** Use FastAPI's `Depends` wrapped with `Annotated` for injecting database sessions, configurations, and current user credentials (e.g., `db: Annotated[Session, Depends(get_db)]`).
* **Async vs Sync Routes:** 
  - Do not use `async def` for endpoints that perform blocking synchronous operations (e.g., synchronous database queries via SQLAlchemy, file operations, or heavy computing). Use standard `def` routes so FastAPI can delegate them to its external thread pool.
  - Use `async def` only when all I/O operations inside the handler are asynchronous (e.g., async HTTP requests, async WebSockets, or async database calls).
* **Synchronous AI runs (exception to Celery):** the CV import and the deep dive call the AI inside a plain `def` endpoint. Each takes a slot from `routers/sync_ai_runs.py` (`MAX_PARALLEL_SYNC_AI_RUNS`, non-blocking, 503 `ai_busy` when full, released in `finally`), commits a durable start stamp before the AI call (409 while a fresh run exists) and commits its read transaction first, so no database connection is held during the call. A new synchronous AI endpoint must do the same and be added to the sweep `ai.fail_stuck_generations`.
* **Surgical Handlers:** Keep route handlers extremely thin. Handlers should parse inputs, trigger asynchronous background tasks (Celery) or invoke backend services, and return quickly.
* **Error Handling (Backend):** Use `raise HTTPException(status_code=status.HTTP_<CODE>, detail="...")` for all client errors. Always use `status.*` constants (e.g. `status.HTTP_404_NOT_FOUND`), not raw integers. For unexpected server errors, catch the exception, log it, and re-raise as `HTTP_500_INTERNAL_SERVER_ERROR` with a generic message — never leak stack traces or internal state in the `detail` field.

  | Situation | Status Code |
  | --- | --- |
  | Resource not found | `404 NOT_FOUND` |
  | Auth failed / token invalid | `401 UNAUTHORIZED` |
  | Authenticated but not allowed | `403 FORBIDDEN` |
  | Validation / bad input | `400 BAD_REQUEST` |
  | Unexpected server error | `500 INTERNAL_SERVER_ERROR` |

* **Rate-limited routes:** External-call endpoints carry a slowapi limit; tests that call them use `fresh_rate_limits` (`pytestmark = pytest.mark.usefixtures("fresh_rate_limits")`, because the limiter counts per process). slowapi needs `request: Request`, so the body parameter of a limited route is never named `request` (use `body`).
* **Shared constants:** `routers/deps.py` holds `PASSWORD_CHECK_RATE` (reset and wipe) and `CRAWL_RUNNING` (the 409 detail while a crawl runs). `core/connection_errors.reason_for_error` / `reason_for_status` are the single connection-failure classifier, and the `MSG_*` texts derive from them.

## Data & Database

* **Migrations:** Manage all database schema changes strictly through Alembic migrations. Do not modify databases manually or use `Base.metadata.create_all()` in application code paths.
* **File Storage:** Files and attachments are stored in PostgreSQL only (`LargeBinary` content, `filename` `db://<name>`); there is no external storage backend.

## Review Checklist

* [ ] No secrets or keys committed?
* [ ] Input validation present at boundaries (Pydantic/TypeScript)?
* [ ] Authorization and owner check (`user_id == current_user.id`) enforced on all queries/mutations?
* [ ] Proper async/sync def routing chosen for backend endpoints?
* [ ] Types defined correctly without using `any`?
* [ ] Business logic separated from controllers/components?
* [ ] No unnecessary complexity or duplication?
* [ ] Backend errors use `status.*` constants and never leak internal details in `detail`?
* [ ] Frontend API calls go through the `src/api/` client (not raw `fetch`)?
* [ ] Frontend errors shown via `describeError`, not swallowed in `console.error`?
* [ ] All new UI strings added to both `de.ts` and `en.ts` and referenced via `t()`?

