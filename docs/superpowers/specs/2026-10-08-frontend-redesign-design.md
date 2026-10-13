# Frontend Redesign: Design Spec

**Date:** 2026-10-08
**Status:** Approved for implementation. The user approved direction, approach and section 1, and delegated the remaining design decisions plus coordination, review and QA to the agent.
**Visual source of truth:** `docs/prototype/clickdummy-editorial.html`
**Feature checklist:** `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (complete inventory of today's API and UI)

## 1. Goal

Replace today's frontend with a new interface that:

- **looks like a purpose-built product**, not a Bootstrap or AI-generated layout;
- **maps the application workflow clearly and intuitively**: add source, crawl, AI score, triage, application documents, apply, interview, offer, outcome.

The user works with it occasionally and on few applications, so guidance and clarity rank above speed.

### Decisions by the user

| Topic | Decision |
|---|---|
| Visual direction | "Editorial" prototype |
| Approach | Path 2: build a new app next to the old one, then delete the old UI completely |
| API | May change freely, since the only client is the new UI. No compatibility layer needed |
| Features | All features stay. Pages may be merged |
| Applications page | Phase groups clearly separated |
| Template block/style editor (`components/editor/*`) | Delete. Direct HTML text editing of generated documents stays |
| Usability | Apply the domain-level findings of the usability review (`2026-10-08-frontend-redesign-usability-review.md`, summarised in section 4.3) to the Editorial design. Do not adopt the look of that variant |

### Success criteria

1. **Coverage:** every screen and state of the Editorial prototype exists in the new app, and every item of the inventory's feature checklist is reachable. Explicitly dropped items are listed in section 9.
2. **One place per action:**
   - The status of an application changes in one place (the job page phase menu), and every change goes through a server-validated transition with history.
   - One job view (`/jobs/[id]`) replaces the side panel, the modal and the old detail page.
3. **No hard-coded UI strings:** all text goes through typed DE/EN dictionaries, and a missing key fails the type check.
4. **Green checks:**
   - backend `pytest`
   - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
   - Playwright end-to-end suite against a mocked API, with screenshots at 1440px and 390px, no console errors and no horizontal scroll at 375px
5. **Clean cutover:** `frontend/` is deleted, the new app is in `frontend/`, Docker Compose builds and starts it on port 3000, and the `context/` docs are updated.

## 2. Architecture

### 2.1 Layout during the build

- **New app in `web/`:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4.
- **Package manager:** pnpm 10, pinned via `packageManager` in `package.json`, with `pnpm-lock.yaml` committed.
- **Ports:** dev port 3001. Compose service `ai-job-agent-web` (port 3001). `ALLOWED_ORIGINS` gets `http://localhost:3001` added.
- **Login cookies:** the cookies (`samesite=lax`) are shared across localhost ports, so the old and new UI can run side by side against one backend.
- **Old UI:** `frontend/` stays untouched and working until the cutover (phase 9).

### 2.2 Cutover

1. Delete `frontend/`.
2. Move `web/` to `frontend/`.
3. Switch the port back to 3000 and remove the extra compose service and origin.
4. Keep the existing runtime env injection (`env.sh`, `APP_API_URL` placeholder replaced at container start).
5. Update the README and the `context/` files.

### 2.3 Frontend structure (`web/`)

```
web/
  app/                      routes only (thin): layout, providers, pages
    (app)/inbox, applications, jobs/[id], sources, companies, profile, settings
    login/
  src/
    api/                    one typed module per resource (jobs.ts, platforms.ts, settings.ts, ...)
      client.ts             apiFetch: cookies, single-flight refresh on 401, error normaliser -> ApiError
    domain/                 pure logic, unit tested: status machine mirror, nextStep(job), score band,
                            due rules, phase grouping, threshold preview
    realtime/               one WebSocket per tab, reconnect with backoff, typed events, query invalidation
    i18n/                   de.ts, en.ts (same type), t(), LanguageProvider
    ui/                     design-system primitives (Button, Tag, Chip, Seg, Field, Select, Dialog,
                            Drawer, Toast, Popover, Tabs, Stepper, ScoreMeter, Masthead, EmptyState, A4Preview)
    features/               screen parts per area (inbox/, applications/, job/, sources/, profile/, settings/, companies/)
    theme/                  tokens.css (from prototype), fonts, theme switch (light/dark/system)
  tests/
    unit/                   vitest
    e2e/                    playwright with mocked API (route interception + fixture data) + screenshots
```

- **Server state:** TanStack Query.
  - Why: the WebSocket must invalidate and patch lists and job details from many places. Hand-written caches were the main source of stale state in the old UI.
  - It is the only state library. UI state lives in components or in the URL query.
  - This choice is recorded as an ADR in `context/progress-tracker.md`.
- **Icons:** `lucide-react` at stroke 1.75. No other UI kit.
- **Fonts:** self-hosted woff2 via `next/font/local` from `@fontsource` files: Bricolage Grotesque (variable), Hanken Grotesk, Source Serif 4 (documents only).
- **URL state:** filters, tabs and selected items live in the query string, so links and reloads restore the view. The old `?job=<id>` links redirect to `/jobs/<id>`.
- **API base URL:** read from one config module (`NEXT_PUBLIC_API_URL`). The WebSocket URL is derived from it.

### 2.4 Coding standards applied

- Functions of 20 lines or less, named constants, no dead code.
- Named exports, except where the Next.js route files require a default export.
- Comments explain why, in English. No emoji anywhere.
- Every boundary input is validated. The client never trusts WebSocket payloads blindly; it filters by the current user and job ids it knows.
- **Deviations, recorded in the tracker:**
  - The REST `/api/v1` prefix, UUID ids and the unified error envelope are not introduced. The backend keeps its paths, and the client normalises the three existing error shapes. Why: this is a large cross-cutting backend change that is not needed for the redesign.
  - No `.npmrc` with a private registry is committed. Why: this is a private project, and its Docker builds must work for anyone, so they use the public registry. In this dev container only the private registry is reachable, and it is set through the environment.

## 3. Backend changes (phase 0, before the UI)

Each change ships with pytest tests (happy path, guard and error paths) and, where needed, an Alembic migration that runs before the code that uses it.

| # | Change | Why the new UI needs it |
|---|---|---|
| B1 | **Status transitions on the server.** New `POST /jobs/{id}/status` `{to, note?}` validates against an allowed-transition table, always writes `JobStatusHistory` and returns the job. `PATCH /jobs/{id}/update-status` and the `status` field of `PATCH /jobs/{id}` are removed. The machine stays permissive: user-settable states are `OPEN, DRAFTED, APPLIED, INTERVIEW, OFFER, ACCEPTED, REJECTED`; backward moves and skips are allowed but recorded; `REJECTED` and `ACCEPTED` can be reached from any active state; `SEEN`, `GENERATING` and `FAILED` are system-only (400 if requested). The UI confirms backward moves, skips and "apply without documents". | One place, real history, no invalid states |
| B2 | **Settings partial update.** `POST /settings` and `/notification-settings` only change the fields present in the body (`exclude_unset`). Fixes the wipe of notification credentials. | Profile and settings forms save independently |
| B3 | **WebSocket scoping.** Every user-related event gets a top-level `user_id` (`new_job`, `job_updated`, `interview_prep_ready`, `company_profile_ready`, `global_error`, `crawl_completed`). The broadcast drops events without `user_id`, except a whitelist of truly global events (`ai_error`, `ai_error_cleared`). New event `template_ready` when the AI fill of a CV template finishes. | Privacy fix; replaces polling |
| B4 | **Archive reason.** New nullable column `jobs.archive_reason` (`THRESHOLD`, `USER`). Auto-archive sets `THRESHOLD`, a manual discard sets `USER`, restore clears it and sets `jobs.kept_by_user=true`. `GET /jobs` accepts `archive_reason`. | Inbox tabs "Unter Schwellwert" vs. "Von dir aussortiert" |
| B5 | **Threshold preview and apply.** `GET /matching-preference/preview?threshold=n` returns how many active `OPEN` jobs would move to and from "Unter Schwellwert". `POST /matching-preference` takes `apply_to_existing: bool`, which archives (`THRESHOLD`) active `OPEN` non-favourite jobs below the threshold that are not `kept_by_user`, and restores `THRESHOLD`-archived jobs that are now above it. | Threshold with preview, "Übernehmen" and undo |
| B6 | **Server-side search and counts.** `GET /jobs` gets `q` (title/company ILIKE), `company` and `statuses` (comma list), and returns `{items, total}`, with a page size cap of 100. Large HTML/description columns are dropped from list items. `/dashboard-data` excludes `SEEN`. | Correct search; lighter lists |
| B7 | **Job checklist and to-dos.** New JSON columns `jobs.checklist` (object of known keys: `posting_opened, documents_checked, sent`) and `jobs.todos` (list of `{id, text, done}`, max 50 items, text max 500 chars), patchable via `PATCH /jobs/{id}`. | Data that only lived in localStorage |
| B8 | **Initial crawl fix.** The setup wizard's `run_initial_crawl` becomes `initial_run: "analyze" | "seed" | "none"` (default `seed`). `analyze` crawls now and analyses all found jobs; `seed` stores them as known (today's behaviour); `none` does not crawl. The detailed resolutions of the B-items (error codes, backfill, undo, the run-summary metrics) are in the Phase 0 plan. | "Sofort starten" did nothing |
| B9 | **Last-run summary per platform.** New JSON column `platforms.last_run` `{started_at, finished_at, found, new, matched, error?}`, written by the crawl and analysis pipeline and returned by `GET /platforms`. | Sources list "last run" without localStorage |
| B10 | **Package cancel honoured.** `ai.generate_application_package` discards results if the job is no longer `GENERATING`. | The cancel button tells the truth |
| B11 | **Job detail completeness.** `GET /jobs/{id}` also returns `is_archived, archive_reason, platform_id, generation_error, checklist, todos, cv_html_present, cover_letter_html_present`. | The job page renders from one call |

**Out of scope for the backend:**

- the error envelope
- `/api/v1`
- the unused `crawl_interval_minutes`
- password change bumping the token version
- Drive file viewing
- OAuth state hardening
- SMTP notification templates

These are recorded as open points in the tracker.

## 4. Screens and workflow

The Editorial prototype is binding for layout, hierarchy, copy tone and states. The paragraphs below fix the structure, and where the prototype and the usability fixes (4.3) disagree, 4.3 wins.

### 4.1 Shell

- **Desktop sidebar:** the ink sidebar from the prototype holds:
  - the brand;
  - numbered nav items with counts: 01 Eingang (new matches), 02 Bewerbungen (due items), 03 Quellen (error count), 04 Profil;
  - Einstellungen;
  - at the bottom, the background-activity status as text ("2 Aufgaben laufen", with a "Zuletzt fertig" popover) and the user menu (account, language, theme, logout).
- **Mobile:** a bottom bar.
- **Global search:** the key `/` opens a dialog that searches jobs and companies.
- **Toasts:** an ink pill, at most 2 stacked, paused on hover or focus. Toasts with an action stay at least 10 s and carry undo where the action is reversible.

### 4.2 Pages

| Route | Content |
|---|---|
| `/login` | As in the prototype |
| `/inbox` (Eingang, home) | Masthead with a status lede (new matches, last crawl result, next run) and "Per URL importieren". An "Anstehend" card shows up to 3 jobs whose `nextStep` is due. The seg switches between Neu, Unter Schwellwert and Von dir aussortiert, over compact rows (company monogram, title, meta, score band and numeral, one-line fit reason) with inline Vormerken (DRAFTED) and Aussortieren. At 1200px and wider a preview pane sits beside the list. "Unter Schwellwert" carries the threshold slider with distribution ticks, the preview count (B5), "Übernehmen" and undo. First run (no source or no AI provider) shows onboarding instead. |
| `/applications` (Bewerbungen) | Header "n aktiv · m fällig" plus search. Phase sections in one list, each with a numbered masthead, count and a one-line hint: Vorgemerkt/Entwurf (DRAFTED), Beworben, Interview, Angebot; Abgeschlossen (ACCEPTED/REJECTED) is collapsed. Rows show job, next step, since/due date and document state, and open the job page. The phase overview strip doubles as the filter. No board view (it bypassed the guards). |
| `/jobs/[id]` (the one job view) | Header: monogram, title, company, meta, posting link, big score numeral with band. Below it, a read-only stepper plus "Phase ändern ▾" (all guards: confirm backward/skip, warn on apply without documents, ask the outcome for closing). Two columns: tabs left, sticky "Nächster Schritt" card right (all controls for the next action, apply checklist inside, plus small "Termine & Daten": follow-up date, contacts, recruiter, salary benchmark). The tabs: **Passung** (reasoning as Passt/Lücken, re-analyse, feedback), **Unterlagen** (CV and letter generate/regenerate with notes, A4 preview of the PDF, edit HTML then re-render, uploads, profile documents attach, download), **Firma** (company profile and deep-dives, research start/refresh), **Interview** (prep generate/regenerate), **Verlauf** (status history with notes, free notes, to-dos). The score recedes visually from Beworben onwards. |
| `/sources` (Quellen) | Masthead with "Quelle hinzufügen". An error banner lists failing sources. The list rows show name/host, schedule, last run (B9) and status, with a Durchsuchen icon button and live crawl progress inline. A drawer per source holds URL/pattern, schedule (time and weekdays), notifications (channel and template), run history and delete. The 3-step add wizard covers link check, link selection with the pattern under "Erweitert", and name/schedule/first run (B8). |
| `/companies` | List of researched companies with search and research state. The detail shows the same company view as the job tab, plus the user's jobs at that company. Reached from the job page's Firma tab and the global search. Not in the main nav. |
| `/profile` | In-page sub-nav: Ziel (role, skills, preferences, spoken languages, location), Lebenslauf (upload/parse, CV data, completeness hint), Nachweise (profile documents with view/download), Vorlagen (CV and letter templates, upload with AI fill and live state, select default, preview). |
| `/settings` | In-page sub-nav: Allgemein (language, theme, timezone, storage: database or Google Drive), Benachrichtigungen (5 channels, credentials, test send, templates with preview), Konto (password, archive all jobs). Admin only: KI (OpenRouter/Ollama settings, task routing), Benutzer (user admin), Systemfehler (AI error banner and clear). |

### 4.3 Usability fixes from the review, applied to Editorial

1. **Status changes:** only through the phase menu, with all guards. No drag and drop board.
2. **Threshold:** lives in Eingang › Unter Schwellwert, with preview, explicit apply and undo, and never overrides jobs the user kept.
3. **Apply checklist:** sits inside the "Nächster Schritt" card. For `OPEN` jobs the card holds Vormerken and Aussortieren.
4. **Terminology:**
   - "Treffer" for inbox items and "Bewerbung" from Vorgemerkt onwards.
   - "Unter Schwellwert" (automatic) vs. "Von dir aussortiert" (manual).
   - Page headings match the nav labels.
5. **Accessibility:**
   - visible focus rings;
   - control borders of at least 3:1;
   - meaningful meta text of at least 13px;
   - hit targets of at least 44px on mobile;
   - a focusable link in each row instead of a focusable `tr`;
   - no nested interactive elements.
6. **Background tasks:** step-based progress text and a fixed activity label. Cancel is offered only where the server honours it (generation).
7. **Mobile:**
   - fullscreen A4 preview;
   - edge fade and scroll-into-view for the stepper and tabs;
   - toasts plus the bottom bar never cover more than a quarter of the screen.
8. **Onboarding:** first-run onboarding appears automatically while no source or AI provider is configured.

### 4.4 Derived "next step" (single source)

`domain/nextStep(job, now)` returns `{kind, label, due?, action}` from:

- status;
- documents present;
- checklist;
- follow-up date (due within 2 calendar days or overdue);
- interview date if set.

It drives:

- the "Nächster Schritt" card;
- the inbox "Anstehend" card;
- the applications "next step" column;
- the due badge on the Bewerbungen nav item.

It is unit tested per status.

## 5. Visual design

- **Tokens:** copied from the prototype's `:root` and `:root[data-mode="dark"]` blocks into `theme/tokens.css` and mapped to Tailwind v4 `@theme` variables, so utilities such as `bg-surface` and `text-accent` resolve to the tokens.
  - Paper and ink, one vermilion signal colour.
  - The stage colours.
  - The printed-proof palette.
  - The type scale and the radii (3–4px).
  - A 4px rule width.
- **Hard rules:**
  - no gradients, glassmorphism, indigo or purple, emoji, sparkle icons, rainbow icons or pulsing dots;
  - one pulsing indicator is allowed, for a running crawl;
  - vermilion is reserved for the next move, the active nav item, strong scores and primary buttons;
  - errors use crimson, always with an icon and words.
- **Contrast:** at least 4.5:1 for text and 3:1 for control borders in both themes. These are checked in the e2e suite on key pairs.

## 6. Data flow and errors

- **Queries:** keyed by resource (`['jobs', filters]`, `['job', id]`, `['platforms']`, ...). Mutations update the cache optimistically only where undo exists (discard, keep, status) and otherwise invalidate.
- **Realtime:** `realtime/` maps events to cache updates. It drops events whose `user_id` is not the current user's and events for unknown job ids, reconnects with exponential backoff (max 30 s) and refetches the active queries after a reconnect.
- **`apiFetch`:**
  - **401:** a single-flight refresh, then one retry; a failed refresh sends the user to `/login?next=`.
  - **Errors:** it normalises `{detail: string}`, the `{detail: [...]}` list (mapped to per-field form errors), `{error}` with 429 ("zu viele Anfragen, bitte kurz warten") and the scraper's `200 + {status:"error"}` into one `ApiError {status, code, message, fields?}`.
  - **Display:** messages show in the form, as inline banners or as a toast. They never show raw server internals.
- **States:** every list and panel has loading (skeleton rows, no spinners on whole pages), empty (copy from the prototype) and error (message plus retry) states.

## 7. Testing and QA

- **Backend:** pytest per change B1–B11, including transition-table tests, partial-update tests and WebSocket scoping tests.
- **Frontend unit tests (vitest):**
  - `domain/*`, including nextStep per status, the transition guard mirror, the score band, due rules and the threshold preview maths;
  - the `apiFetch` normaliser and refresh;
  - the realtime event filter;
  - i18n parity, with the DE and EN key sets identical by type.
- **End-to-end (Playwright, mocked API from fixtures, headless Chromium):**
  - the main journeys: login, onboarding, add source, crawl progress, triage (keep/discard/undo), threshold apply/undo, generate documents, edit and re-render, apply with checklist, apply without documents warning, interview prep, offer, close as accepted or rejected, company research, profile save (notification credentials survive), settings channels, admin;
  - each journey asserts no console errors;
  - screenshots per page at 1440px and 390px, dark and light, compared visually against the prototype by a reviewer agent;
  - a check for no horizontal scroll at 375px.
- **Review:** every phase gets a spec-compliance review and a code-quality review by separate subagents before it counts as done.

## 8. Delivery phases

| Phase | Content | Done when |
|---|---|---|
| 0 | Backend B1–B11 | pytest green, migrations apply |
| 1 | `web/` scaffold: tooling, tokens, fonts, ui primitives, i18n, api client, realtime, query setup, shell, login, compose service | build/lint/typecheck/unit tests green; shell screenshot matches the prototype |
| 2 | Job page with all tabs | e2e journeys for documents, phases and company green |
| 3 | Inbox (incl. onboarding, import, threshold) | e2e triage and threshold green |
| 4 | Applications | e2e applications green |
| 5 | Sources (list, wizard, drawer, live crawl) | e2e sources green |
| 6 | Profile | e2e profile green |
| 7 | Settings, admin, companies, global search | e2e settings/admin green |
| 8 | Full QA pass: all journeys, both themes, mobile, contrast, visual review vs. prototype; fixes | all checks green |
| 9 | Cutover: delete old UI, move, compose, README, `context/` docs, tracker | compose config valid, build of the final `frontend/` green |

## 9. Explicitly dropped

- **Removed old-UI components and features:**
  - the template block/style editor (`components/editor/*`, user decision);
  - the drag and drop board;
  - the legacy `ApplicationModal` and the markdown-to-PDF letter download (`GET /jobs/{id}/download`), since the generated letter PDF replaces them;
  - the ad-hoc keyword search crawl of the dead `Dashboard.tsx` (it is not reachable today);
  - the client-only cancel for analysis, interview prep and company research (the server does not cancel them; the UI shows progress instead).
- **Unused endpoints:** removed in phase 0 only where a replacement exists (B1). The others stay.
