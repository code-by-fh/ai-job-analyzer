# Frontend Redesign Phase 5 (Quellen `/sources`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Quellen (`/sources`): a masthead with "Quelle hinzufügen", an error banner that names the failing sources, one list of sources (name and host, schedule, last run, status) with a "Durchsuchen" icon button and live crawl progress inline (with "Abbrechen"), a drawer per source (name, URL and pattern, schedule with time and weekdays, notifications per channel with template and test send, run history, delete), and a three-step add wizard (link check; link selection with the pattern under "Erweitert"; name, schedule and first run with B8 `initial_run`), on top of four backend tasks that close the security and contract gaps the screen depends on.

**Architecture:** Four backend tasks (server only, pytest TDD) come first: an SSRF guard shared by the API and the scraper worker; a crawl contract that names the platform in crawl status and events and allows one crawl per source; a run history table (`platform_runs`, plus a `seeded` flag for phase 3 R9); and the platform write contract (validated PATCH incl. `url_pattern`, setup with name/schedule/pattern, delete that keeps the jobs, a booleans-only channel status endpoint). On the web, wire contracts go to `web/src/api/` (`platformPaths.ts` stays client-free for e2e fixtures), pure rules to `web/src/domain/sources.ts` (URL state, source state, schedule, link suggestion, field mapping) and `domain/runLine.ts` (shared last-run reading), and the screen to `web/src/features/sources/`. The list reads the existing `["platforms"]` query; live progress reads the existing activity cache (`["activity"]`, seeded from `/scraper/crawl-status`, patched by realtime events) extended by a `platformId`, so there is no polling. Drawer and wizard are the app `Drawer`; drawer sections save independently with a partial `PATCH /platforms/{id}`; unsaved edits go through the existing `useUnsavedChanges`.

**Tech Stack:** unchanged from phases 1-4 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0; backend FastAPI, SQLAlchemy 2, Alembic, pytest on in-memory SQLite, PostgreSQL in production, Redis, Celery). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 5 row "Sources (list, wizard, drawer, live crawl)", done when "e2e sources green"; section 7 journeys "add source" and "crawl progress"; section 4.2 `/sources`; 4.1 nav "03 Quellen (error count)"; 4.3 #5, #6, #7, #8; 5; 6; backend B8, B9). Visual and behavioural source of truth: `docs/prototype/clickdummy-editorial.html` (`renderSources`, `deckSources`, `renderSourceRow`, `renderSourcePanel`, `renderAddSource`, `FOUND_LINKS`, CSS `.wizard-steps`, `.crawl-live`, `.health`, `.src-name`, `.src-host`, `.link-list`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (#2 "Letzte Läufe only in the source drawer", #14 list instead of tiles, failing sources in a `.notice-error` banner, no nested interactive elements, #15 wizard steps must not look like buttons, #24 "URL-Muster" folded into step 2 under "Erweitert", the "Quellen" layout). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.0 scheduling, A.4 platforms, A.5 notification templates, A.10 scraper, A.11 crawl events, B.2 `useCrawl`, B.3 `JobPlatformsManager`, `PlatformSetupModal`, `NotificationAdaptersModal`, `PushoverTemplateModal`, `EmailTemplateModal`, C.1 platform delete options, C.2 last-run summaries and pattern detection, C.3 #1).

## Global Constraints

- **Placement:** web code in `web/`, backend code in `server/`; `frontend/` stays untouched. Backend Tasks 1-4 change only `server/`; web Tasks 5-14 change only `web/`; Task 15 changes only `context/`.
- **Base:** phase 4 is closed (its Task 11 checkpoint green) before web Task 5 starts. Names in this plan are the real exported names of `web/src` and `server/` as of 2026-10-09 (listed in the Self-Review name check). Plan code never compiled: before writing, read the real exports of every module you import; if a name drifted, adapt the call, never the behaviour (phase 3 R5, phase 4 R5).
- **One implementer at a time for web.** All web tasks share the build mirror `$QA/web`; never run two web tasks in parallel. Backend Tasks 1-4 run strictly in order (Tasks 2-4 all edit `routers/platforms.py`) and may run in parallel with web Task 5 only (Task 5 does not depend on them at runtime: every new field is optional in the schemas). Web Tasks 6-14 need Tasks 1-4 merged (their fixtures model the new contract).
- **Shared files:** re-read every shared file right before editing it (`de.ts`, `en.ts`, `queryKeys.ts`, `platforms.ts`, `crawl.ts`, `settings.ts`, `events.ts`, `activity.ts`, `runLine.ts`, `navigation.ts`, `globals.css`, `fixtures.ts`, `inboxFixtures.ts`, `mockApi.ts`, `routers/platforms.py`, `database/core.py`, `scraper_api.py`, `scraper_worker.py`, `platform_runs.py`, `tests/conftest.py`); add or change only the lines named, never replace a whole file (phase 3 preflight 26).
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`; pass an object instead), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`. **Never disable a lint rule**; split into named helpers or sub-components instead. If Prettier pushes a function above 20 lines, split it. Python: functions small and named, constants for codes, no bare `except:`; broad `except Exception` only where the existing code documents why.
- **React lint (eslint-plugin-react-hooks 7 incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`; event handlers may read the clock), no synchronous `setState` in an effect body (adopt server values with the previous-value pattern during render, phase 4 R27), no ref reads during render. An effect that must call the latest props uses `useEffectEvent`.
- **CSS:** component CSS lives in plain `.css` files inside `@layer components { ... }` (new file `src/features/sources/sources.css`, imported from `app/globals.css` after `applications.css`). No new inline `style` props (the crawl bar is a native `<progress>`, D4). The guard test `tests/unit/theme/cssFiles.test.ts` fails on a markdown fence line in any CSS file. Utilities only for layout spacing. **Layout is CSS-driven:** the list's row layout depends on the main column (which depends on the sidebar), so it uses a container query on `.sources` (`container-type: inline-size; container-name: sources`), not a viewport `@media` and never `useMediaQuery` (no hydration reflow; phase 4 final-wave minor).
- **Type size:** meaningful text (host, schedule, last-run line, status, hints, link paths, run history) is at least 13 px (`var(--fs-13)`); nothing meaningful uses 12 px (the prototype's `.wizard-steps li` at `--fs-12` becomes `--fs-13`).
- **Colours (spec 5):** crimson (`.t-danger`, `Notice tone="error"`, `Button variant="danger"`) only for errors and the destructive delete, always with an icon and words. Amber (`Notice tone="warn"`, `--warn-text`) only for warnings (a source without schedule is **not** a warning; the only amber element of this phase is the wizard's "Erweitert" notice when the typed pattern matches none of the found links). Vermilion only for primary buttons, the active nav item and focus. The one pulsing/spinning indicator allowed is a running crawl (spec 5).
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}`. Key blocks in this plan show the DE value with the EN value as a trailing `//` comment ("same" = identical in EN); the dictionaries themselves carry no comments. Reuse existing keys instead of adding twins: `onboard.source.action` ("Quelle hinzufügen"), `dialog.close`, `guard.cancel` ("Abbrechen"), `dates.save` ("Speichern"), `files.deleteConfirm` ("Löschen"), `error.retry`, `loading`, `inbox.stalled`, `runline.counts`, `run.error.*`, `action.view`, `nav.sources`, `nav.sourceErrors`, `activity.step.*` (`STEP_LABEL`), `unsaved.*`.
- **No raw enums:** run errors go through `runErrorCode()` and `RUN_ERROR_LABEL` (moved to a shared place, Task 6), channels through `CHANNEL_LABEL`, initial runs through `INITIAL_RUN_LABEL`, source states through `SOURCE_STATE_LABEL`. An unknown value shows a neutral label (`run.error.unknown`). Server `detail`/`message` text is never shown.
- **URLs:** every external `href` passes `safeHref()` (`src/domain/links.ts`); the source URL in the drawer header and link paths in the wizard are text, and the one external link (the source's page) uses `safeHref` with `rel="noreferrer"`; app links use `sourcesHref()` (Task 6) and, where a job is linked, `jobRoute(id)`.
- **Errors:** `describeError(error, t, overrides?)` (`src/api/describeError.ts`); field errors from a 422 come from `fieldErrorsFrom(error, toSourceField)` (`src/api/fieldErrors.ts`) and render on the field (`TextField error=`); the form shows its own text per field, never the server's message.
- **Unsaved changes:** every drawer section and the wizard report dirtiness through the existing `useUnsavedChanges().setDirty` (one aggregated flag, D5); closing the drawer or wizard, or switching `?quelle=`, calls `requestLeave()` first.
- **Live regions:** toasts keep their two persistent regions. This phase adds exactly one region, `SourcesLiveStatus` (D13), mounted from the first render and never conditionally; it announces a crawl's end per source, nothing per progress step. Field errors keep `role="alert"` (existing `Field`). The error banner is `Notice tone="error" announce={false}` (it describes a state on load, D3).
- **Focus:** focus never falls to `<body>`. After the drawer or wizard closes, focus returns to its trigger (ModalLayer); when there was none (deep link, or the source was just deleted), `useFocusFallback` (Task 7) focuses the row link of that source, else the page title (`MASTHEAD_TITLE_SELECTOR`, already `tabIndex={-1}`). A control that disappears after its own action hands focus to a named target (D4, D9, D10).
- **Overlays:** only the app `Drawer` (drawer: `variant="wide"`, wizard: `variant="narrow"`) and the app `Dialog` (delete confirmation). No second overlay mechanism.
- **Queries start in parallel:** the page prefetches platforms, activity, notification channels and templates and the profile time zone at mount (`usePrefetchQuery`); the drawer's run history starts when the drawer opens; no component waits for one query before starting another. Gates are bounded: a section that needs two answers waits until the second settled or failed (`isError`), never on a timer.
- **States:** the list has loading (skeleton, `ListLoading`), stalled (`inbox.stalled`), error (`ListError` with retry) and empty (onboarding copy with "Quelle hinzufügen") states; the run history, channel status and templates each have loading, error (inline `Notice tone="error"` with retry) and empty states.
- **Accessibility (spec 4.3 #5):** one focusable link per row (the source name, `href=sourcesHref({ sourceId })`), the Durchsuchen/Abbrechen buttons in their own cell (no nested interactive elements, no focusable `tr`), visible focus rings, control borders >= 3:1, hit targets >= 44 px below 768 px, weekday toggles with `aria-pressed` in a `role="group"` with a name, the wizard step list with `aria-current="step"`, icon-only buttons with an `aria-label` that names the source.
- **E2E:** every UI task ships its own Playwright spec. The auto fixtures fail a test on any unmocked API call and any console error. Fixtures are typed with the `z.input` types of the real schemas and import runtime values only from client-free modules (`src/api/platformPaths.ts`, `src/api/jobListPaths.ts`, `src/domain/sources.ts` and other `src/domain/*` modules that import no API client, and `tests/e2e/support/*`); never from `src/api/platforms.ts` or any module that imports `src/api/instance.ts` (type-only imports are fine). Each UI spec saves screenshots at 1440 and 390 in both `COLOR_SCHEMES` through `saveScreenshot`, **with the pointer moved away first** (`await page.mouse.move(0, 0)`), and checks `horizontalOverflow(page) === 0`; the page (Task 7) is also checked once at `VIEWPORTS.narrow` (375).
- **Fixtures stay consistent:** one canonical platform set (`support/platformFixtures.ts`, Task 5) feeds `AUTHENTICATED_ROUTES`, the inbox fixtures and the sources fixtures; the running crawl of `CRAWL_STATUS` belongs to platform 1 (same URL, `platform_id: 1`). **FakeServers model the real server and do not echo:** `support/sourcesServer.ts` (Task 7, extended per task) answers from its own state with the real server's rules (validation codes, 409 for a second crawl or a delete during a crawl, partial PATCH, delete keeps jobs), and a request body is never returned as the answer.
- **Reuse, do not add a second:** `platformsQueryOptions`, `countFailingPlatforms`, `runErrorCode`, `latestRun`/`lastRunOf`, `useActivity`, `reduceActivity`, `progressPercent`, `STEP_LABEL`, `sourceLabel`, `safeHref`, `hostOf`, `parseImportUrl` (link check uses the import rule), `describeError`, `fieldErrorsFrom`, `useUnsavedChanges`, `Drawer`, `Dialog`, `PanelHeader`, `Disclosure`, `Stepper` (wizard steps), `Chip` (weekday toggles), `TextField`, `SelectField`, `CheckField`, `Notice`, `Button`, `Masthead`, `EmptyState`, `ListLoading`, `ListError`, `listPhase`, `useNow`, `formatDayTime`, `useToast`, `SOURCES_HREF`, `SOURCES_ADD_HREF`, `pushEvent`, `fixNow`, `NOW_ISO`, `live`, `setRoutes`. No second progress model, no second crawl tracker, no polling.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a unit test:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/sources.test.ts`
- **Run one e2e spec:** only through `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/sources.spec.ts` (it builds with the mock API URL first). **Build mirror note:** a plain `pnpm build` bakes in the real API URL and makes every following `playwright test` fail; if you build separately, use `NEXT_PUBLIC_API_URL=http://localhost:3101/mock-api pnpm build`.
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror).
- **Checkpoint (every web task):** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` -> all five exit 0. If the combined form is blocked, run the five as separate commands; all must pass. `test:e2e` is part of every checkpoint, also for tasks without UI.
- **Screenshots:** they land in the mirror; copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Backend tests (Tasks 1-4):** `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""` (append a path or node id for a subset). The backend checkpoint is the full suite.
- **Lockfile:** this phase adds no dependency.

## Review Focus

1. **A double click on "Durchsuchen", or a crawl that started elsewhere.** The user double-clicks the row's Durchsuchen button; a scheduled crawl or a second tab starts the same source; the POST answers after the first realtime event, or after the crawl already failed. Expected: exactly one crawl runs; the second click never cancels (Abbrechen sits in a different place and only appears once the start settled); a second start answers 409 and reads "wird schon durchsucht" without a second bar; a crawl started by the scheduler shows its bar in the row; a crawl that already ended is not revived by the late seed. Test: Task 2 `test_second_crawl_of_the_same_platform_is_refused`, `test_crawl_status_names_the_platform`; Task 5 unit "a late seed does not revive an ended crawl", "the started event keeps the seeded platform when it names none"; Task 8 unit "a second click while starting sends one request", e2e "a scheduled crawl shows its progress in the row" and "a double click starts one crawl"; Task 14 journey "crawl progress".
2. **URLs that point inside the network.** The user enters `http://127.0.0.1:8000`, `http://0.0.0.0:6379`, `http://[::1]/`, `http://169.254.169.254/latest/meta-data`, `http://10.0.0.5`, `http://100.64.0.1`, `http://user:pw@jobs.example.com`, a host name that resolves to a private address, or edits an existing source's URL to such a host. Expected: the server refuses with 422 on `url` before any fetch (preview, setup, PATCH) and the worker refuses again before the render call; the wizard shows "Diese Adresse kann nicht geprüft werden." on the URL field, never a server text. Test: Task 1 `test_private_and_reserved_addresses_are_refused` (parametrised), `test_a_name_resolving_to_a_private_address_is_refused`, `test_preview_links_refuses_a_private_url`, `test_patch_refuses_a_private_url`, `test_worker_refuses_private_url_without_render_call`; Task 12 e2e "a refused address shows on the field".
3. **Unsaved edits and another section's save.** The user edits the schedule, then saves the notifications section, then closes the drawer with X, Escape or a click on the scrim, or reloads. Expected: the notifications PATCH sends only notification fields (the schedule edit stays a draft and is not lost by the refetch); every way of closing asks "Änderungen verwerfen?"; "Weiter bearbeiten" keeps the drawer and the draft; a reload gets the browser's warning (`setDirty` also drives the unload warning). The drawer is modal, so no row, banner or nav link is reachable while it is open. Test: Task 9 unit "a section save sends only its own fields", "a refetch does not overwrite a dirty draft", "Escape with an unsaved name asks first and keeps the draft", e2e "closing with an unsaved schedule asks first"; Task 10 unit "saving notifications keeps the schedule draft".
4. **Schedule input at the edges.** Enabling the schedule without weekdays, a cleared time field, a hand-written `?quelle=abc`, a time like 24:00 that a 422 rejects, turning the schedule off. Expected: the client blocks an enabled schedule without a day ("Wähle mindestens einen Tag."), off sends `schedule_time: null, schedule_days: null`, a 422 lands on the right field, the hint names the profile time zone (the scheduler's zone) and no time is converted. Test: Task 4 `test_patch_rejects_schedule_time_out_of_range`, `test_patch_rejects_a_time_without_days`, `test_patch_clears_the_schedule`; Task 6 unit "parses only HH:MM in range", "formats ranges and single days"; Task 9 unit "an enabled schedule needs a day", "maps a 422 on schedule_time to the time field", e2e "turning the schedule off saves nulls".
5. **Deleting a source.** The user deletes a source that has applications, deletes one whose crawl is running, or opens `/sources?quelle=999` (deleted or foreign). Expected: the jobs stay (Eingang and Bewerbungen still show them, without a source), run history and dedup placeholders go; a running crawl blocks the delete (button inactive with the reason, server 409); after the delete the drawer closes, a toast says so and focus lands on the page title; an unknown id opens nothing and the parameter is removed without an error. Test: Task 4 `test_delete_keeps_jobs_and_drops_placeholders_and_runs`, `test_delete_during_a_crawl_is_refused`; Task 11 unit "is blocked while the source runs", "asks, deletes, says how many jobs stay and moves focus to the title", "a delete the server refuses during a crawl keeps the drawer and says why", e2e "deleting keeps the found jobs" (the FakeServer keeps them, the toast says how many, focus is on the `h1`) and "a running source cannot be deleted"; Task 7 unit and e2e "drops an unknown source id from the URL".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | URL state | `/sources?quelle=<id>` opens the drawer of that source; `/sources?add=1` opens the wizard (the onboarding contract `SOURCES_ADD_HREF`). German parameter like the inbox (`?tab=`) and Bewerbungen (`?phase=`). Only one overlay: `add` wins over `quelle`. All changes use `router.replace(href, { scroll: false })`, so Back leaves the page. The wizard step is **not** in the URL: step 2 holds the links of a check that takes up to 90 s and cannot be restored from a reload, so a reload of `?add=1` starts at step 1 (the typed URL is lost, which is acceptable for an occasional user). An id that is not a positive integer, or not in the loaded list once it answered, opens nothing and is removed from the URL (no error). One builder `sourcesHref({ sourceId?, add? })` and the parsers `sourceIdFromParam`, `addFromParam` live in `domain/sources.ts`; a unit test pins `sourcesHref({ add: true }) === SOURCES_ADD_HREF`. |
| D2 | List data | The existing `platformsQueryOptions()` (`["platforms"]`), already invalidated by realtime on every crawl end and `crawl_completed`. Rows sorted by name (locale compare, then id). The schema reads the fields the drawer needs (Task 5). No separate detail query: the drawer reads its source from the list. |
| D3 | Error banner | A source is failing when its last run ended with an error other than `cancelled` (`isFailingSource`: `isFailedRun(runErrorCode(last_run.error))`); a failing source that is re-running stays listed until its new run ends (the row shows the progress), so banner and badge never disagree. The banner (`Notice tone="error" announce={false}`, crimson, icon, words) sits under the masthead: "{count} Quellen melden einen Fehler." and one line per failing source: a button "{name}: {reason}, {when}" that opens its drawer. `countFailingPlatforms` (nav badge "1 Fehler") uses the same rule (cancelled is not an error, G19), so badge and banner always agree. The banner is gone when no source fails. |
| D4 | Durchsuchen and Abbrechen | Durchsuchen is an icon button (lucide `Play`, `aria-label` "{name} jetzt durchsuchen", 44 px on mobile) in its own cell. It is `inactive` (focusable, `aria-disabled`, with a `title` giving the reason) while the source runs, is paused or is not set up. Click: `POST /platforms/{id}/crawl`; on success the answer's `job_id` seeds the activity cache with `{ id, platformId, source }` (`markCrawlStarted`), so the bar appears before the first event; toast "{name} wird durchsucht."; 409 reads "{name} wird schon durchsucht." and refetches the activity; other errors through `describeError`. While running, the last-run cell shows the inline progress: step text from `STEP_LABEL` ("Links sammeln: 5 von 12"), a native `<progress max=100 value=progressPercent(task)>` named "Fortschritt {name}" (no inline style), and a text button "Abbrechen" (`aria-label` "Durchsuchen von {name} abbrechen") **in the progress cell, not where Durchsuchen sits** (a double click never cancels). Abbrechen: `POST /scraper/cancel-crawl {job_id}`, no confirmation (a crawl can be restarted at once); success waits for `crawl_job_cancelled` (the bar disappears through the reducer); failure toasts. Spec 4.3 #6 allows cancel where the server honours it, which it does for crawls (G12). The drawer header repeats Durchsuchen/Abbrechen for the open source. |
| D5 | Drawer sections and save model | `variant="wide"` drawer, header with name, host and the crawl controls; sections in this order: **Quelle** (name, "Namen vorschlagen", URL, "Erweitert" with the URL pattern, "Aktiv" check), **Zeitplan**, **Benachrichtigungen**, **Letzte Läufe**, **Quelle löschen**. Each editable section is its own `<form>` with its own "Speichern" and sends only its own fields (`PATCH` is partial on the server via `model_fields_set`); success invalidates `["platforms"]` and makes the sent values the section's new baseline. Why per section: the notification test sends need the saved state; a 422 maps onto one section; the user can save the schedule without touching an unfinished recipient list. Each section reports dirty to one `useDirtySections` set that drives `setDirty(set.size > 0)`. A section adopts a background refetch only while it is not dirty (previous-value pattern). |
| D6 | Schedule editor | `ScheduleFields` (shared by drawer and wizard): a check "Automatisch durchsuchen"; when on, a `type="time"` field (`HH:MM`) and seven weekday toggles (`Chip`, Mo-So, server index 0 = Monday) in a `role="group"` named "Wochentage". Turning it on starts from Mo-Fr 08:00 (the old UI's default); off sends `schedule_time: null, schedule_days: null`. Client validation on submit: an enabled schedule needs a valid time and at least one day. **Time zone:** the scheduler compares `schedule_time` with the wall clock of the **profile** time zone (`user_settings.timezone`), so the editor stores and shows wall time without any conversion and the hint names that zone: "Uhrzeit in deiner Zeitzone ({zone})." (`profileTimezoneQueryOptions`, Task 5). If the zone is unknown the hint omits it. Rows show the stored wall time ("Mo–Fr 08:00", "täglich 08:00", "Mo, Mi 07:30", "Nur manuell"). No next-run time on this page (the inbox run line keeps its browser-zone approximation, phase 3 G12). |
| D7 | Notifications per source | One row per channel (Pushover, Resend, Mailjet, SMTP): a check "{channel} benachrichtigen"; email channels a recipients field (comma separated, each must look like an address; required when the channel is on); a template select ("Standard" = `null`, then the user's and global templates of the matching type: `PUSHOVER` for Pushover, `RESEND`/`MAILJET`/`SMTP` for the email channels); a "Test senden" button per enabled channel. Whether a channel has credentials comes from the new booleans-only `GET /notification-settings/channels` (Task 4); an unconfigured channel's check is disabled with "Noch nicht eingerichtet. In den Einstellungen einrichten." (link to `/settings?section=notifications`, a phase 7 contract added to `navigation.ts` like `AI_SETTINGS_HREF`). The platform stores template **content**, so choosing a template copies its content into `<channel>_template`; stored content that matches no listed template shows as "Eigene Vorlage (beibehalten)" and is kept. Editing template text happens in Einstellungen (phase 7), not here (G10). One save for the section (`notification_adapters`, the four templates, the three recipient lists). "Test senden" is inactive while the section is dirty ("Erst speichern") and calls `POST /platforms/{id}/test-<channel>`; success toast "Test über {channel} gesendet."; 400 "Für {channel} fehlen Zugangsdaten oder Empfänger."; other errors "Senden über {channel} hat nicht geklappt." Secrets are never read: the drawer never calls `GET /settings` for credentials. |
| D8 | Run history | New `GET /platforms/{id}/runs?limit=10` (Task 3), newest first, `{started_at, finished_at, found, new, matched, seeded, error}`; the server keeps the last 20 per source. The drawer shows up to 10 under "Letzte Läufe" ("{when}: 12 gefunden, 3 passend, 2 unter Schwellwert", "{when}: 40 als bekannt gemerkt" for a seed run, "{when}: fehlgeschlagen ({reason})" in crimson with icon, "{when}: abgebrochen" neutral). No paging (G23). Query key `["platforms", "runs", id]` sits under the platforms root, so the existing invalidation after every crawl end refreshes it. |
| D9 | Delete | "Quelle löschen" (`Button variant="danger"` with a trash icon, last section) opens the app `Dialog`: title "„{name}“ löschen?", text "Zeitplan, Benachrichtigungen und Laufverlauf gehen verloren. Gefundene Stellen und Bewerbungen bleiben erhalten.", buttons "Löschen" (`variant="danger"`) and "Abbrechen". The server (Task 4) detaches the source's jobs (`platform_id = NULL`), deletes its `SEEN` placeholders and run history, and refuses with 409 while a crawl of the source runs; the button is `inactive` while running with "Erst das Durchsuchen abbrechen.". After success: close dialog and drawer (URL without `quelle`), remove the source from the cache, invalidate `["platforms"]`, `["jobs"]`, `["job-counts"]` and `["setup-status"]`, toast "Quelle „{name}“ gelöscht. {count} gefundene Stellen bleiben erhalten." (or without the second sentence when no job was kept; no undo: not reversible), focus the page title (`useFocusFallback`). |
| D10 | Add wizard (3 steps) | `variant="narrow"` drawer titled "Quelle hinzufügen" with the step list on top (`Stepper`, steps "Seite prüfen", "Stellenlinks wählen", "Name und Zeitplan"; `past`/`current`/`future`, `aria-current="step"`, not buttons, usability #15). **Step 1:** URL field ("Adresse einer Suchergebnisseite", hint from the prototype), "Seite prüfen" submits: `parseImportUrl` (same rule as the import), duplicate check against the loaded list ("Diese Quelle gibt es schon." with a link "Ansehen" to its drawer), then `POST /platforms/preview-links` with an `AbortController` (aborted by Zurück/close/unmount); while waiting a `Notice` with spinner "Seite wird geladen und nach Stellenlinks durchsucht. Das kann bis zu einer Minute dauern."; no links: "Auf dieser Seite wurden keine Links gefunden. Versuche eine Suchergebnisseite." (stays on step 1); 422 on `url`: "Diese Adresse kann nicht geprüft werden."; other errors "Die Seite konnte nicht geladen werden." **Step 2:** "Auf {host} wurden {count} Links gefunden. Wähle die Stellenanzeigen aus." A filter field over text and path, "Alle auswählen"/"Keine" for the filtered set, a checkbox list (link text plus path, 44 px rows), preselected by `suggestJobLinks()` (the old client heuristic, C.2), the count "{selected} ausgewählt". "Erweitert" (`Disclosure`): an optional "URL-Muster" field (hint "Leer lassen: wird aus den ausgewählten Links ermittelt. Nur Links, die diesen Text enthalten, werden als Stelle gelesen.") with "{matching} von {total} gefundenen Links enthalten dieses Muster." when filled. Weiter needs at least one link ("Wähle mindestens einen Link."). **Step 3:** name (optional, placeholder = host, hint "Leer lassen: ein Name wird vorgeschlagen."), `ScheduleFields` (on, Mo-Fr 08:00), first run as three radios (B8): "Bekannte Stellen merken" (`seed`, default, "Alles, was heute gelistet ist, gilt als bekannt. Ab dem nächsten Lauf kommen nur neue Stellen."), "Jetzt durchsuchen und alles bewerten" (`analyze`, "Jede gefundene Stelle wird mit KI bewertet; das kann dauern."), "Noch nicht durchsuchen" (`none`). "Quelle anlegen" sends `POST /platforms/setup {url, selected_urls, initial_run, name?, schedule_time, schedule_days, url_pattern?}` (Task 4). A 422 jumps to the earliest step with a field error (url -> 1, url_pattern/selected_urls -> 2 with "Erweitert" open, name/schedule -> 3). Success: invalidate `["platforms"]`, `["setup-status"]`, `["activity"]`; close the wizard (URL `/sources`); toast "Quelle „{name}“ angelegt." (success tone) plus, for `analyze`, the sentence "Das Durchsuchen läuft." when `initial_crawl_started`, or an error-tone toast "Der erste Lauf konnte nicht starten. Starte ihn mit „Durchsuchen“." when it did not start (toasts have no amber tone; the sentence names the next action); focus the new row's link (`useFocusFallback` with the new id). Zurück keeps every entry of the later steps (state lives in `useWizard`). The wizard is dirty from the first typed character. |
| D11 | Mobile | CSS only. Below a 720 px wide `.sources` container, each row stacks: name and host with the status tag on the right, then labelled lines "Zeitplan: …", "Letzter Lauf: …"; the Durchsuchen button stays at the row end (44 px). The column head is hidden. Drawer and wizard are full screen (existing overlay rule below 768 px); the wizard step list stays one row of three (labels may wrap); link rows and weekday chips are >= 44 px high; the banner's lines wrap. |
| D12 | Onboarding link | The inbox onboarding links `SOURCES_ADD_HREF` (`/sources?add=1`); the page opens the wizard immediately (it does not wait for the platforms list; the duplicate check uses the list when it is there and the server's 400 otherwise). Closing the wizard replaces the URL with `/sources`. After the first source is created, `["setup-status"]` is invalidated, so returning to Eingang no longer shows the source step. |
| D13 | Live region | `SourcesLiveStatus`: one persistent visually hidden `<p role="status">` rendered by the page. Its text is derived during render from the activity cache's `lastFinished` when that task belongs to a listed source and finished after the page mounted: "{name}: Durchsuchen fertig." / "{name}: Durchsuchen fehlgeschlagen." / "{name}: Durchsuchen abgebrochen." (the counts follow visibly in the row once the list refetched; announcing them would need a second, later announcement). Starts are announced by the toast of the user's own action; progress steps are never announced. |
| D14 | Row content and status | Columns: Quelle (name as the row link, host below via `hostOf`), Zeitplan (D6 text), Letzter Lauf (`formatDayTime(finished_at)` plus "12 gefunden, 3 passend, 2 unter Schwellwert" via `runline.counts`, "40 als bekannt gemerkt" for a seed run, crimson "fehlgeschlagen ({reason})" with icon for a failed run, neutral "abgebrochen", "Noch nicht durchsucht" without a run; replaced by the inline progress while running), Status (a `Tag`: "Läuft" with the spinner icon, "Fehler" crimson with icon, "Pausiert", "Nicht eingerichtet", "In Ordnung"), and the action cell. Masthead: number "03", title `nav.sources`, deck "{n} Quellen, alle in Ordnung." / "{n} Quellen, {e} mit Fehler." / "Noch keine Quelle.", action "Quelle hinzufügen" (primary, `Plus`). |
| D15 | Source state | `sourceState(platform, running)` in priority order: `running` (an activity task with this `platformId`), `setup` (`setup_status === "pending_setup"`, legacy rows), `paused` (`is_active === false`), `failing` (D3), `ok`. The Durchsuchen button is available only for `ok` and `failing`. A legacy `setup` source's drawer shows an info `Notice` "Die Einrichtung ist nicht abgeschlossen. Lege die Quelle mit derselben Adresse über „Quelle hinzufügen“ neu an; Zeitplan und Benachrichtigungen bleiben." The wizard's duplicate check ignores pending rows and the server reuses the pending row (existing `test_setup_reuses_pending_platform`). No prefill parameter (YAGNI: the old wizard already created rows only on completion, so such rows are rare). |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | **SSRF:** the API checks only the scheme of user URLs (`_validate_http_url`, and not at all on `PATCH url`); the worker's `_is_safe_url` resolves one IPv4 address with `gethostbyname` and misses `0.0.0.0/8` (reaches local services on Linux), `100.64/10`, `198.18/15`, multicast/reserved ranges, IPv4-mapped IPv6, names with several A records of which one is private, and accepts `user:pw@` URLs | **Backend Task 1:** `core/url_safety.py` with `is_public_http_url` (every resolved address must be `ipaddress.is_global` and not multicast; literal IPs checked without DNS; credentials in the URL refused); the worker's `_is_safe_url` delegates to it; `preview-links`, `setup` and `PATCH url` validate with a pydantic field validator, so a refusal is a 422 on `url` before any fetch. Residual risk (render service following redirects, DNS rebinding between check and fetch) goes to the tracker (Task 15), see Concerns. |
| G2 | Crawl status entries and `crawl_job_started` carry the platform **URL** only (`platform`), so the list cannot tell which source a running crawl belongs to (two sources may share a host) | **Backend Task 2:** `GET /scraper/crawl-status` items and `crawl_job_started` carry `platform_id` (null for imports). Web Task 5 reads it into `ActivityTask.platformId`. |
| G3 | A second crawl of the same source can start while one runs; the API sets `last_crawl_at` even when the scraper answered `{status:"Error"}` | **Backend Task 2:** the scraper refuses a second crawl of a platform the user is already crawling (`{status:"Error", code:"already_running"}`); `POST /platforms/{id}/crawl` maps that to 409 and any other refusal to 502, and sets `last_crawl_at` only after an accepted start. |
| G4 | Only the last run is stored (`last_run`, B9); spec 4.2 asks for run history in the drawer | **Backend Task 3:** table `platform_runs` (migration `v4w5x6y7z8a9`), written next to `last_run` by `record_platform_run`, pruned to the last 20 per source; `GET /platforms/{id}/runs?limit=` (1-50, default 10), owner-scoped. |
| G5 | Phase 3 R9: a seed run's `new` counts unanalysed jobs, so "unter Schwellwert" is approximate | **Backend Task 3:** `last_run.seeded` and `platform_runs.seeded` (from the crawl hash's `is_initial_run`). Web Task 6: `lastRunOf` reports `seeded`, `below` is 0 for a seed run, and rows/history say "{found} als bekannt gemerkt". The tracker's R9 open question is closed in Task 15. |
| G6 | `PATCH /platforms/{id}` ignores `url_pattern`, accepts any `schedule_time`/`schedule_days`, an empty name and a non-http URL | **Backend Task 4:** validators (`core/platform_rules.py`): time `HH:MM` 00:00-23:59; days unique ints 0-6, non-empty when set; time and days set or cleared together; name 1-100 chars after trim; pattern 1-300 chars, not only `/`; URL public http(s) (Task 1) and same host (existing rule). `url_pattern` becomes writable; `setup_status` stays ignored. |
| G7 | `DELETE /platforms/{id}` deletes **all** of the source's jobs (applications included) and ignores its query parameters; the prototype says "Gefundene Stellen bleiben" | **Backend Task 4:** delete detaches jobs (`platform_id = NULL`), deletes the source's `SEEN` placeholders and run history, never touches company profiles, drops the ignored parameters, answers `{status:"deleted", kept_jobs:n}`; 409 while a crawl of the source runs (G23). `DELETE /platforms/{id}/jobs` stays (unused). |
| G8 | `POST /platforms/setup` takes no name, schedule or pattern, so the wizard's step 3 could not save them in one call | **Backend Task 4:** optional `name` (else the AI name as today), `schedule_time`/`schedule_days` (same validators), `url_pattern` (else inferred as today). |
| G9 | The drawer must know which channels have credentials, but `GET /settings` returns the whole profile (masked secrets included) | **Backend Task 4:** `GET /notification-settings/channels` returns four booleans (`{"PUSHOVER": true, ...}`) computed with the same predicates as the test endpoints; a test asserts that no stored secret or address appears in the body. |
| G10 | Platforms store template **content**, not a template id; the old UI edited raw template text per platform | **Select copies content** (D7). Per-source template text editing is dropped here; the template editor with preview lives in Einstellungen (spec 4.2 `/settings`, phase 7). Existing custom content is kept and labelled. |
| G11 | Notification templates cannot have type `SMTP` (known, out of scope in spec 3) | SMTP offers the email templates (`RESEND`, `MAILJET`, `SMTP`), as the old UI did. |
| G12 | Spec 4.3 #6: "Cancel is offered only where the server honours it (generation)" | The server honours crawl cancel (`cleanup_crawl_job`: cancellation marker, revoke, `crawl_job_cancelled`, `last_run.error = cancelled`), so Abbrechen is offered for crawls (D4); the old UI had it too. |
| G13 | Prototype Quellen page also holds the threshold slider and a global notification paragraph | **Dropped here:** the threshold lives in Eingang › Unter Schwellwert (spec 4.3 #2); global notifications live in Einstellungen (phase 7). |
| G14 | Prototype masthead also has "Stelle per URL importieren" | **Spec wins:** only "Quelle hinzufügen" (spec 4.2); the import stays in Eingang. |
| G15 | Prototype schedules are presets ("Alle 6 Stunden", "Wöchentlich (Montag)"); the server knows only a time and weekdays (`crawl_interval_minutes` is unused, spec 3) | Time + weekday editor (D6). |
| G16 | Prototype wizard has 4 steps with a separate "URL-Muster" step showing the detected pattern | **Spec and usability #24 win:** 3 steps, the pattern is an optional override under "Erweitert"; the inferred pattern is shown and editable in the drawer after creation. |
| G17 | Old features: AI name generation, job count chip linking to `/listings?platform_id=`, favicon via Google s2, cancel all crawls, the `pending_setup` legacy flow | Name generation stays ("Namen vorschlagen" in the drawer, `POST /platforms/{id}/generate-name`). The job-count link is dropped (Eingang has no source filter, phase 3 G9). No favicon (it sends every source host to Google, and usability #25 keeps monograms for companies). Cancel-all is dropped (per-row cancel). Legacy `pending_setup` rows: D15 (notice, re-add through the wizard). Reported to the user as reversible drops. |
| G18 | `AUTHENTICATED_ROUTES` has a free-text `last_run.error` ("Seite nicht erreichbar") and a running crawl whose URL matches platform 1 but carries no `platform_id`; the inbox has a second platform set | **Task 5:** one canonical `support/platformFixtures.ts` (codes only, `finished_at` set, `CRAWL_STATUS` with `platform_id: 1`), used by `fixtures.ts`, `inboxFixtures.ts` and the sources fixtures. |
| G19 | `countFailingPlatforms` counts a cancelled run as an error, so the nav would say "1 Fehler" after the user pressed Abbrechen | **Task 6:** cancelled is not failing (D3); the nav badge and the banner use one rule. |
| G20 | Time zone: the scheduler uses the profile zone, the browser may be elsewhere (phase 3 G12) | Wall time stored and shown unchanged, the hint names the profile zone (D6). |
| G21 | `POST /platforms/preview-links` takes up to 90 s and the render service cannot be cancelled | The client aborts its request on Zurück/close (no result is applied after that); the server finishes its fetch. Accepted. |
| G22 | Prototype row column "Gefunden · passend · aussortiert" | Folded into the "Letzter Lauf" cell (D14); spec 4.2 names schedule, last run and status only. |
| G23 | A source deleted during its crawl would leave analysis tasks writing jobs with a dangling `platform_id` (FK error on PostgreSQL) | **Backend Task 4:** 409 while running (Redis registry shared with Task 2); client blocks too (D9). History is not paged (10 shown, 20 kept). |
| G24 | Mutations through `MockResponse` can only answer one fixed status, so a FakeServer cannot answer 409/422 depending on state (phase 4 final-wave minor) | **Task 5:** `mockApi.ts` gains `reply(status, body)`; a `respond` function may return it. Existing specs are unaffected. |
| G25 | `POST /scraper/search` is reachable through the API proxy with any `platform_id` | Already safe for the last run (`_save_last_run` checks the owner); Task 2's duplicate check and Task 3's history only look at the caller's own crawls and platforms. Recorded, no change. |
| G26 | `profile.timezone` is only in the full `GET /settings` body | **Task 5:** `profileTimezoneQueryOptions()` reads `/settings` with a schema of `{timezone}` only (secrets are masked server-side and never parsed). A second request to `/settings` next to the language query is accepted (small, cached). |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `core/url_safety.py` (new) | `is_public_http_url`, `ensure_public_http_url` (Task 1) |
| `core/platform_rules.py` (new) | schedule, name and pattern validators (Task 4) |
| `core/crawl_registry.py` (new) | `active_crawl_for_platform`, `ALREADY_RUNNING` (Task 2) |
| `workers/scraper_worker.py` | `_is_safe_url` delegates (Task 1); `crawl_job_started` carries `platform_id` (Task 2) |
| `scraper_api.py` | `/search` refuses a second crawl of a platform; `/crawl-status` items carry `platform_id` (Task 2) |
| `workers/tasks/platform_runs.py` | `seeded` flag, history row, pruning (Task 3) |
| `database/core.py` | `PlatformRun` model, `PlatformRunResponse`; `PlatformUpdate` validators (Tasks 3, 4) |
| `database/migrations/versions/v4w5x6y7z8a9_add_platform_runs.py` (new) | table `platform_runs` (Task 3) |
| `routers/platforms.py` | URL validation (1), crawl result mapping (2), runs endpoint (3), delete, setup fields, PATCH pattern (4) |
| `routers/settings.py` | `GET /notification-settings/channels` (Task 4) |
| `tests/conftest.py` | autouse public-DNS stub (Task 1) |
| `tests/test_url_safety.py`, `tests/test_crawl_registry.py`, `tests/test_platform_runs.py`, `tests/test_platforms_router.py`, `tests/test_platforms_contract.py` (new), `tests/test_scraper_api.py`, `tests/test_scraper_worker.py`, `tests/test_settings_router.py` | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/api/platformPaths.ts` | client-free paths and constants (`platformPath`, `platformRunsPath`, `RUN_HISTORY_SIZE`, `NOTIFY_CHANNELS`, `NotifyChannel`, `PLATFORM_SETUP_PATH`, `PREVIEW_LINKS_PATH`, `CHANNEL_STATUS_PATH`) |
| `src/api/notifications.ts` | channel status and template list queries |
| `src/domain/sources.ts` | URL state, source state, failing list, sort, schedule rules and text parts, link suggestion, pattern count, field mapping |
| `src/features/sources/SourcesPage.tsx` | frame, prefetch, composition |
| `src/features/sources/useSourcesUrl.ts`, `useFocusFallback.ts` | URL state, focus fallback |
| `src/features/sources/SourcesHeader.tsx`, `FailingBanner.tsx`, `SourceList.tsx`, `SourceRow.tsx`, `RunCell.tsx`, `StatusTag.tsx` | list |
| `src/features/sources/crawl/CrawlButton.tsx`, `CrawlProgress.tsx`, `useCrawlActions.ts`, `SourcesLiveStatus.tsx` | Durchsuchen, Abbrechen, live progress, announcements |
| `src/features/sources/drawer/SourceDrawer.tsx`, `useDirtySections.ts`, `useSectionForm.ts`, `SourceSection.tsx`, `ScheduleSection.tsx`, `ScheduleFields.tsx`, `NotifySection.tsx`, `ChannelRow.tsx`, `RunHistory.tsx`, `DeleteSource.tsx` | drawer |
| `src/features/sources/wizard/AddSourceWizard.tsx`, `useWizard.ts`, `CheckStep.tsx`, `LinksStep.tsx`, `FinishStep.tsx` | wizard |
| `src/features/sources/labels.ts` | `SOURCE_STATE_LABEL`, `CHANNEL_LABEL`, `INITIAL_RUN_LABEL`, `scheduleText()` |
| `src/features/sources/sources.css` | styles |
| `tests/unit/domain/sources.test.ts`, `tests/unit/api/sourcesApi.test.ts`, `tests/unit/realtime/crawlActivity.test.ts`, `tests/unit/features/sources/*.test.tsx`, `tests/unit/theme/sourcesStyles.test.ts` | unit tests |
| `tests/e2e/support/platformFixtures.ts`, `tests/e2e/support/sourcesServer.ts`, `tests/e2e/sources*.spec.ts` | fixtures, fake server, specs |

Web, modified: `app/(app)/sources/page.tsx`, `app/globals.css`, `src/api/platforms.ts`, `src/api/crawl.ts`, `src/api/settings.ts`, `src/api/queryKeys.ts`, `src/realtime/events.ts`, `src/realtime/activity.ts`, `src/realtime/useActivity.ts`, `src/domain/runLine.ts`, `src/features/inbox/RunLine.tsx` (imports `RUN_ERROR_LABEL` from its new home), `src/features/shell/navigation.ts` (`NOTIFICATION_SETTINGS_HREF`), `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/e2e/support/fixtures.ts`, `tests/e2e/support/inboxFixtures.ts`, `tests/e2e/support/mockApi.ts` (`reply`), `tests/e2e/shell.spec.ts` (drop `/sources` from the placeholder routes), `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`.

Task order: backend 1 -> 2 -> 3 -> 4 (strict); web Task 5 may run beside backend Tasks 1-4; web Tasks 6 -> 14 strictly in order after Task 4; Task 15 last (needs every report).

---
### Task 1: Backend: SSRF guard for every user-supplied crawl URL

**Files:**
- Create: `server/core/url_safety.py`, `server/tests/test_url_safety.py`, `server/tests/test_platforms_contract.py`
- Modify: `server/workers/scraper_worker.py` (`_is_safe_url`, drop `_PRIVATE_RANGES`), `server/scraper_api.py` (`_is_http_url` -> `_is_fetchable_url`), `server/routers/platforms.py` (`PreviewUrlRequest`, `PlatformSetupCreateRequest`), `server/database/core.py` (`PlatformUpdate.url` validator), `server/tests/conftest.py` (autouse DNS stub), `server/tests/factories.py` (`PUBLIC_TEST_ADDRESS`), `server/tests/test_scraper_worker.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `core.url_safety.is_public_http_url(url: str) -> bool`, `core.url_safety.ensure_public_http_url(url: str) -> str` (raises `ValueError("url_not_public")`), `core.url_safety.NOT_PUBLIC = "url_not_public"`, private `_resolve(host) -> list[str]` (the only DNS call; tests patch it). `POST /platforms/preview-links`, `POST /platforms/setup` and `PATCH /platforms/{id}` answer 422 with `detail[0].loc == ["body", "url"]` for a URL that is not public http(s); the scraper's `/search` and `/import-job` answer `{status: "Error"}` for it; the worker never calls the render service for it. Test fixture `public_dns` (autouse, conftest): every host *name* resolves to `PUBLIC_TEST_ADDRESS = "93.184.216.34"` unless a test patches `_resolve` itself; literal IPs are never resolved.

- [ ] **Step 1: Write the failing tests**

Add `PUBLIC_TEST_ADDRESS = "93.184.216.34"` to `server/tests/factories.py` (next to `TEST_PLATFORM_ID`), extend the conftest import to `from tests.factories import PUBLIC_TEST_ADDRESS, make_user`, and append to `server/tests/conftest.py` (before the first fixture):

```python
@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """No test reaches real DNS: host names resolve to one public address unless a test patches _resolve."""
    monkeypatch.setattr("core.url_safety._resolve", lambda host: [PUBLIC_TEST_ADDRESS])
```

`server/tests/test_url_safety.py`:

```python
import socket

import pytest

from core import url_safety
from core.url_safety import NOT_PUBLIC, ensure_public_http_url, is_public_http_url
from tests.factories import PUBLIC_TEST_ADDRESS

PRIVATE_ADDRESS = "10.1.2.3"


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8000/",
    "http://0.0.0.0:6379",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/jobs",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://[fc00::1]/",
    "http://[::ffff:127.0.0.1]/",
])
def test_private_and_reserved_addresses_are_refused(url):
    assert is_public_http_url(url) is False


@pytest.mark.parametrize("url", [
    "ftp://jobs.example.com/",
    "javascript:alert(1)",
    "https://",
    "jobs.example.com/search",
    "http://user:pw@jobs.example.com/",
    "http://jobs.example.com:99999/",
])
def test_non_http_malformed_or_credential_urls_are_refused(url):
    assert is_public_http_url(url) is False


def test_a_public_name_and_a_public_literal_address_are_accepted():
    assert is_public_http_url("https://jobs.example.com/search?q=kotlin") is True
    assert is_public_http_url(f"http://{PUBLIC_TEST_ADDRESS}/jobs") is True


def test_a_name_resolving_to_a_private_address_is_refused(monkeypatch):
    monkeypatch.setattr(url_safety, "_resolve", lambda host: [PUBLIC_TEST_ADDRESS, PRIVATE_ADDRESS])
    assert is_public_http_url("https://intranet.example.com/") is False


def test_an_unresolvable_name_is_refused(monkeypatch):
    def fail(host):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(url_safety, "_resolve", fail)
    assert is_public_http_url("https://nowhere.example.com/") is False


def test_ensure_raises_the_fixed_code_without_the_url():
    with pytest.raises(ValueError) as raised:
        ensure_public_http_url("http://127.0.0.1/admin")
    assert str(raised.value) == NOT_PUBLIC
```

`server/tests/test_platforms_contract.py` (new; later tasks append to it):

```python
"""Phase 5 contract of the platforms API (SSRF guard, crawl start, runs, writes, delete, channels)."""

from unittest.mock import patch

from database.core import JobPlatform
from tests.factories import TEST_PLATFORM_ID, fetch, make_platform

PRIVATE_URL = "http://169.254.169.254/latest"
SETUP_BODY = {
    "url": "https://jobs.example.com/search",
    "selected_urls": ["https://jobs.example.com/job/1", "https://jobs.example.com/job/2"],
}


def _loc(response) -> list:
    return response.json()["detail"][0]["loc"]


def test_preview_links_refuses_a_private_url(api_client):
    with patch("routers.platforms.requests.post") as post:
        response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    post.assert_not_called()


def test_setup_refuses_a_private_url_and_creates_nothing(api_client, session_factory):
    with patch("routers.platforms._trigger_scraper_search") as trigger:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "url": PRIVATE_URL})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    trigger.assert_not_called()
    with session_factory() as db:
        assert db.query(JobPlatform).count() == 0


def test_patch_refuses_a_private_url(api_client, seed, session_factory):
    seed(make_platform())
    response = api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json={"url": "http://127.0.0.1/jobs"})
    assert (response.status_code, _loc(response)) == (422, ["body", "url"])
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url == "https://jobs.example.com/search"


def test_the_refusal_never_echoes_the_url(api_client):
    response = api_client.post("/platforms/preview-links", json={"url": PRIVATE_URL})
    assert "169.254" not in response.text
```

Append to `server/tests/test_scraper_worker.py`:

```python
def test_worker_refuses_private_url_without_render_call():
    with patch("workers.scraper_worker.render_client.fetch_html") as mock_fetch:
        assert get_html_with_browser("http://0.0.0.0:8000/") is None
    mock_fetch.assert_not_called()


def test_scraper_refuses_a_private_url_before_queueing():
    import scraper_api

    assert scraper_api._is_fetchable_url("http://10.0.0.5/jobs") is False
    assert scraper_api._is_fetchable_url("https://jobs.example.com/search") is True
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_url_safety.py tests/test_platforms_contract.py tests/test_scraper_worker.py`
Expected: FAIL: the conftest fixture errors with `ModuleNotFoundError: No module named 'core.url_safety'` for every test of the run (that is the RED for all of them).

- [ ] **Step 3: Implement `core/url_safety.py`**

```python
"""Whether a user-supplied URL may be fetched by the crawler (SSRF guard).

The API validates with it before anything is queued, and the scraper worker checks again right
before the render call. Every address a name resolves to must be public; one private A record is
enough to refuse, because the fetch may use any of them.
"""

import ipaddress
import socket
from typing import List
from urllib.parse import urlsplit

ALLOWED_SCHEMES = ("http", "https")
NOT_PUBLIC = "url_not_public"


def _resolve(host: str) -> List[str]:
    """Every address of a host name; the only DNS call, patched in tests."""
    return [info[4][0] for info in socket.getaddrinfo(host, None)]


def _addresses_of(host: str) -> List[str]:
    try:
        return [str(ipaddress.ip_address(host))]
    except ValueError:
        return _resolve(host)


def _is_public_address(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    # Multicast is "global" for ipaddress, but no job page lives there.
    return ip.is_global and not ip.is_multicast


def _host_of(url: str):
    """The host of an http(s) URL without credentials, or None."""
    try:
        parts = urlsplit(url)
        _ = parts.port  # a malformed or out-of-range port raises ValueError
    except ValueError:
        return None
    if parts.scheme not in ALLOWED_SCHEMES or parts.username or parts.password:
        return None
    return parts.hostname or None


def is_public_http_url(url: str) -> bool:
    """True only for an http(s) URL whose host resolves to public addresses only."""
    host = _host_of(url)
    if not host:
        return False
    try:
        addresses = _addresses_of(host)
    except (OSError, UnicodeError):
        return False
    return bool(addresses) and all(_is_public_address(address) for address in addresses)


def ensure_public_http_url(url: str) -> str:
    """Pydantic validator body: the fixed code becomes the 422 message, never the URL itself."""
    if not is_public_http_url(url):
        raise ValueError(NOT_PUBLIC)
    return url
```

- [ ] **Step 4: Use it in the worker, the scraper and the API**

`workers/scraper_worker.py`: add `from core.url_safety import is_public_http_url` to the imports, delete `_PRIVATE_RANGES`, and replace the body of `_is_safe_url` with:

```python
def _is_safe_url(url: str) -> bool:
    """http(s) to public addresses only (core/url_safety.py); the name stays because tests patch it."""
    return is_public_http_url(url)
```

`scraper_api.py`: add `from core.url_safety import is_public_http_url`, rename `_is_http_url` to `_is_fetchable_url` (both call sites: `/search`, `/import-job`, and `/preview-links`) and replace its body with `return is_public_http_url(url)` (docstring: "Refuse private targets before anything is queued; the worker checks again before fetching.").

`routers/platforms.py`: change `from pydantic import BaseModel` to `from pydantic import BaseModel, field_validator`, import `from core.url_safety import ensure_public_http_url`, and add to both `PreviewUrlRequest` and `PlatformSetupCreateRequest`:

```python
    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: str) -> str:
        return ensure_public_http_url(value)
```

`database/core.py`: import `from core.url_safety import ensure_public_http_url` and add to `PlatformUpdate`:

```python
    @field_validator("url")
    @classmethod
    def _url_is_public(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else ensure_public_http_url(value)
```

`_validate_http_url` in `routers/platforms.py` stays (it returns the netloc the setup uses for the favicon); its scheme check is now redundant but harmless (surgical change).

- [ ] **Step 5: Run them to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_url_safety.py tests/test_platforms_contract.py tests/test_scraper_worker.py tests/test_platforms_router.py tests/test_scraper_api.py`
Expected: PASS (the existing setup and PATCH tests use host names, which the autouse stub resolves to a public address).

- [ ] **Step 6: Checkpoint**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: the whole suite passes (previous count + 28, each parametrised case counted). The report lists the doc lines for Task 15 (`architecture.md` section 4 invariant "user URLs are fetched only when every resolved address is public, `core/url_safety.py`, checked in the API and again in the worker"); it does not edit `context/`.

---

### Task 2: Backend: crawl contract (platform in status and events, one crawl per source, honest start)

**Files:**
- Create: `server/core/crawl_registry.py`, `server/tests/test_crawl_registry.py`
- Modify: `server/scraper_api.py` (`/search`, `/crawl-status`), `server/workers/scraper_worker.py` (`fetch_links_task` started event), `server/routers/platforms.py` (`trigger_platform_crawl`, new `_crawl_refusal`), `server/tests/test_scraper_api.py`, `server/tests/test_scraper_worker.py`, `server/tests/test_platforms_contract.py`

**Interfaces:**
- Consumes: the Redis bookkeeping of `scraper_api._init_crawl_job` (`user:{id}:active_crawls` set, `crawl_job:{id}` hash with `platform_id` from `_remember_platform`).
- Produces: `core.crawl_registry.active_crawl_for_platform(redis_client, user_id: int, platform_id: int) -> Optional[str]` and `ALREADY_RUNNING = "already_running"`. `POST /scraper/search` with a `platform_id` the user is already crawling answers `{"status": "Error", "code": "already_running", "message": ...}` and queues nothing. `GET /scraper/crawl-status` items carry `"platform_id": int | null`. The `crawl_job_started` event carries `"platform_id": int | null`. `POST /platforms/{id}/crawl`: 200 `{status: "Started", job_id}` and `last_crawl_at` set; 409 for `already_running`; 502 for any other scraper refusal; `last_crawl_at` unchanged on 409/502/500.

- [ ] **Step 1: Write the failing tests**

`server/tests/test_crawl_registry.py`:

```python
from core.crawl_registry import active_crawl_for_platform
from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID

OTHER_PLATFORM_ID = TEST_PLATFORM_ID + 1


def _hashes(fake_redis, platform_by_crawl: dict) -> None:
    fake_redis.smembers.return_value = {crawl.encode() for crawl in platform_by_crawl}
    fake_redis.hget.side_effect = lambda key, field: platform_by_crawl.get(key.split(":")[1])


def test_finds_the_running_crawl_of_the_platform(fake_redis):
    _hashes(fake_redis, {"crawl-1": str(OTHER_PLATFORM_ID).encode(), "crawl-2": str(TEST_PLATFORM_ID).encode()})
    assert active_crawl_for_platform(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID) == "crawl-2"


def test_imports_and_expired_crawls_do_not_count(fake_redis):
    _hashes(fake_redis, {"import-1": None, "expired-1": None})
    assert active_crawl_for_platform(fake_redis, TEST_USER_ID, TEST_PLATFORM_ID) is None
    fake_redis.smembers.assert_called_once_with(f"user:{TEST_USER_ID}:active_crawls")
```

Append to `server/tests/test_scraper_api.py`:

```python
import pytest
from fastapi.testclient import TestClient

SEARCH_BODY = {"query": "https://jobs.example.com/search", "location": "Remote", "platform_id": TEST_PLATFORM_ID}


@pytest.fixture()
def scraper_client(monkeypatch, fake_redis):
    from core.auth import get_current_user

    monkeypatch.setattr(scraper_api, "r", fake_redis)
    scraper_api.app.dependency_overrides[get_current_user] = lambda: make_user()
    yield TestClient(scraper_api.app)
    scraper_api.app.dependency_overrides.pop(get_current_user, None)


def test_second_crawl_of_a_running_platform_is_refused_by_the_scraper(scraper_client, fake_redis):
    fake_redis.smembers.return_value = {b"crawl-1"}
    fake_redis.hget.return_value = str(TEST_PLATFORM_ID).encode()
    with patch.object(scraper_api, "chain") as chain:
        body = scraper_client.post("/search", json=SEARCH_BODY).json()
    assert (body["status"], body["code"]) == ("Error", "already_running")
    chain.assert_not_called()


def test_a_platform_without_running_crawl_starts(scraper_client, fake_redis):
    fake_redis.smembers.return_value = set()
    with patch.object(scraper_api, "chain") as chain:
        body = scraper_client.post("/search", json=SEARCH_BODY).json()
    assert body["status"] == "Started"
    chain.return_value.apply_async.assert_called_once()


def test_crawl_status_names_the_platform_and_leaves_imports_without_one(scraper_client, fake_redis):
    hashes = {
        "crawl-1": {b"platform_url": b"https://jobs.example.com/search", b"status": b"crawling",
                    b"platform_id": str(TEST_PLATFORM_ID).encode(), b"total": b"3"},
        "import-1": {b"platform_url": b"https://jobs.example.com/job/9", b"status": b"starting", b"total": b"1"},
    }
    fake_redis.smembers.return_value = {b"crawl-1", b"import-1"}
    fake_redis.hgetall.side_effect = lambda key: hashes[key.split(":")[1]]
    fake_redis.lrange.return_value = []
    jobs = {job["job_id"]: job for job in scraper_client.get("/crawl-status").json()["jobs"]}
    assert (jobs["crawl-1"]["platform_id"], jobs["import-1"]["platform_id"]) == (TEST_PLATFORM_ID, None)
```

(`patch` and `make_user` are already imported at the top of the file; add `TestClient` and `pytest` imports at the top, not mid-file, when you edit.)

Append to `server/tests/test_scraper_worker.py`:

```python
def test_started_event_names_the_platform(fake_redis):
    from tests.factories import TEST_PLATFORM_ID, TEST_USER_ID, events_of_type
    from workers.scraper_worker import fetch_links_task

    with patch("workers.scraper_worker.redis.from_url", return_value=fake_redis), \
         patch("workers.scraper_worker.get_html", return_value=None), \
         patch("scraper_api.fail_crawl_job"):
        fetch_links_task("https://jobs.example.com/search", TEST_USER_ID, "crawl-1", TEST_PLATFORM_ID)
    assert events_of_type(fake_redis, "crawl_job_started")[0]["platform_id"] == TEST_PLATFORM_ID
```

Append to `server/tests/test_platforms_contract.py`:

```python
def _crawl(api_client, answer):
    with patch("routers.platforms._trigger_scraper_search", return_value=answer):
        return api_client.post(f"/platforms/{TEST_PLATFORM_ID}/crawl")


def test_an_accepted_crawl_returns_its_id_and_stamps_last_crawl_at(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Started", "job_id": "crawl-9"})
    assert (response.status_code, response.json()["job_id"]) == (200, "crawl-9")
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is not None


def test_second_crawl_of_the_same_platform_is_refused(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Error", "code": "already_running", "message": "x"})
    assert response.status_code == 409
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None


def test_any_other_refusal_is_a_bad_gateway_and_keeps_last_crawl_at(api_client, seed, session_factory):
    seed(make_platform())
    response = _crawl(api_client, {"status": "Error", "message": "URL muss mit http(s) beginnen."})
    assert response.status_code == 502
    assert "http(s)" not in response.text
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).last_crawl_at is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_crawl_registry.py tests/test_scraper_api.py tests/test_scraper_worker.py tests/test_platforms_contract.py`
Expected: FAIL: `ModuleNotFoundError: core.crawl_registry`; `KeyError: 'code'` (the scraper starts a second crawl); `KeyError: 'platform_id'` (crawl status, started event); the crawl endpoint answers 200 for both refusals and stamps `last_crawl_at`.

- [ ] **Step 3: Implement `core/crawl_registry.py`**

```python
"""Which crawls a user is running, read from the scraper's Redis bookkeeping (scraper_api._init_crawl_job)."""

from typing import Optional

ALREADY_RUNNING = "already_running"


def _text(raw) -> str:
    # The scraper's client returns bytes, decoded clients return str.
    return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)


def active_crawl_for_platform(redis_client, user_id: int, platform_id: int) -> Optional[str]:
    """The user's running crawl of this platform, or None. A crawl whose hash expired counts as ended."""
    for raw_id in redis_client.smembers(f"user:{user_id}:active_crawls"):
        crawl_id = _text(raw_id)
        stored = redis_client.hget(f"crawl_job:{crawl_id}", "platform_id")
        if stored is not None and _text(stored) == str(platform_id):
            return crawl_id
    return None
```

- [ ] **Step 4: Scraper, worker and API**

`scraper_api.py`: import `from core.crawl_registry import ALREADY_RUNNING, active_crawl_for_platform`; in `search_jobs`, right after the URL check and `user_id = current_user.id`:

```python
    if search.platform_id is not None and active_crawl_for_platform(r, user_id, search.platform_id):
        # One crawl per source: a second would double every job and race the first one's summary.
        return {"status": "Error", "code": ALREADY_RUNNING, "message": "Crawl already running."}
```

Add a helper above `get_crawl_status` and use it for a new item field `"platform_id": _optional_int(job_data.get(b"platform_id")),`:

```python
def _optional_int(raw) -> Optional[int]:
    return int(raw) if raw not in (None, b"", "") else None
```

`workers/scraper_worker.py`, `fetch_links_task`: add `"platform_id": platform_id,` to the `crawl_job_started` payload.

`routers/platforms.py`: import `from core.crawl_registry import ALREADY_RUNNING` and add above `trigger_platform_crawl`:

```python
def _crawl_refusal(result: dict) -> Optional[HTTPException]:
    """The scraper refuses with 200 + {status: "Error"}; the API turns that into a real status."""
    if str(result.get("status", "")).lower() != "error":
        return None
    if result.get("code") == ALREADY_RUNNING:
        return HTTPException(status_code=409, detail="Crawl already running")
    return HTTPException(status_code=502, detail="Crawler refused the crawl")
```

Replace the `try` block at the end of `trigger_platform_crawl` with:

```python
    try:
        resp_data = _trigger_scraper_search(db_platform, current_user, is_initial_run)
    except Exception as e:
        logger.error(f"Failed to trigger scraper: {e}")
        raise HTTPException(status_code=500, detail="Failed to trigger crawler service")
    refusal = _crawl_refusal(resp_data)
    if refusal:
        raise refusal
    # Only an accepted start counts: a stamp after a refusal would turn the next run into a non-seed run.
    db_platform.last_crawl_at = func.now()
    db.commit()
    return resp_data
```

- [ ] **Step 5: Run them to verify they pass**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run the full backend suite. Expected: previous count + 9. The report lists the doc lines for Task 15 (`architecture.md` scraper bullet: one crawl per source, `platform_id` in crawl status and `crawl_job_started`; `platforms.py`: 409/502 on refused starts).

---

### Task 3: Backend: run history (`platform_runs`) and the seed flag

**Files:**
- Create: `server/database/migrations/versions/v4w5x6y7z8a9_add_platform_runs.py`
- Modify: `server/database/core.py` (`PlatformRun`, `PlatformRunResponse`), `server/workers/tasks/platform_runs.py` (`build_last_run`, `_save_last_run`, new `_run_row`, `_prune_runs`, `RUN_HISTORY_LIMIT`), `server/routers/platforms.py` (new `_owned_platform`, `_serialize_run`, `GET /platforms/{id}/runs`), `server/tests/test_platform_runs.py`, `server/tests/test_phase0_schema.py` (head assertion), `server/tests/test_platforms_contract.py`

**Interfaces:**
- Consumes: `record_platform_run` (existing; first terminal call per crawl wins), the crawl hash field `is_initial_run` (written by `_init_crawl_job`).
- Produces: model `PlatformRun(id, platform_id, started_at, finished_at, found, new, matched, seeded, error)`; `last_run` gains `"seeded": bool`; `RUN_HISTORY_LIMIT = 20` rows per platform; `GET /platforms/{platform_id}/runs?limit=n` (1-50, default 10) -> `[{started_at: str|null, finished_at: str, found: int, new: int, matched: int, seeded: bool, error: str|null}]` newest first, 404 for a platform of another user; helper `_owned_platform(db, platform_id, user_id) -> JobPlatform` (404 otherwise), reused by Task 4.

- [ ] **Step 1: Write the failing tests**

In `server/tests/test_platform_runs.py`, add `"seeded": False,` to the two expected dicts of `test_build_last_run_summarises_crawl_counters` and `test_build_last_run_without_start_time_or_counters` (the summary now always says whether it was a seed run), import `PlatformRun` from `database.core`, and append:

```python
SEED_HASH = {**CRAWL_HASH, b"is_initial_run": b"1"}


def _history(session_factory) -> list:
    with session_factory() as db:
        return db.query(PlatformRun).order_by(PlatformRun.finished_at.desc()).all()


def test_record_platform_run_adds_a_history_row(platform_db, fake_redis):
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID, error=ERROR_UNREACHABLE)
    [run] = _history(platform_db)
    assert (run.platform_id, run.found, run.new, run.matched, run.seeded, run.error) == (
        TEST_PLATFORM_ID, 8, 3, 2, False, ERROR_UNREACHABLE,
    )


def test_a_seed_run_is_marked_on_summary_and_history(platform_db, fake_redis):
    fake_redis.hgetall.return_value = SEED_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    assert fetch(platform_db, JobPlatform, TEST_PLATFORM_ID).last_run["seeded"] is True
    assert _history(platform_db)[0].seeded is True


def test_history_keeps_the_newest_twenty_runs(platform_db, seed, fake_redis):
    older = [
        PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=datetime(2026, 9, day, tzinfo=timezone.utc))
        for day in range(1, 21)
    ]
    seed(*older)
    fake_redis.hgetall.return_value = CRAWL_HASH
    record_platform_run(fake_redis, CRAWL_ID)
    runs = _history(platform_db)
    assert len(runs) == 20
    assert runs[-1].finished_at.day == 2  # the oldest (1 Sep) was dropped
```

Append to `server/tests/test_platforms_contract.py` (add `from datetime import datetime, timezone`, `PlatformRun` and `OTHER_USER_ID`, `make_user` imports at the top):

```python
def _run(day: int, **fields) -> PlatformRun:
    return PlatformRun(platform_id=TEST_PLATFORM_ID, finished_at=datetime(2026, 10, day, 9, 0, tzinfo=timezone.utc),
                       found=fields.get("found", 0), new=0, matched=0, seeded=False, error=fields.get("error"))


def test_runs_are_listed_newest_first_with_a_limit(api_client, seed):
    seed(make_platform(), _run(1, found=5), _run(3, error="unreachable"), _run(2, found=7))
    runs = api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs", params={"limit": 2}).json()
    assert [(run["finished_at"][:10], run["error"]) for run in runs] == [("2026-10-03", "unreachable"), ("2026-10-02", None)]
    assert set(runs[0]) == {"started_at", "finished_at", "found", "new", "matched", "seeded", "error"}


def test_runs_of_another_users_platform_are_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID), _run(1))
    assert api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs").status_code == 404


def test_runs_limit_is_bounded(api_client, seed):
    seed(make_platform())
    assert api_client.get(f"/platforms/{TEST_PLATFORM_ID}/runs", params={"limit": 51}).status_code == 422
```

In `server/tests/test_phase0_schema.py`: add `PLATFORM_RUNS_REVISION = "v4w5x6y7z8a9"`, rename `test_migration_chain_has_single_head_at_generation_started_at_revision` to `test_migration_chain_has_single_head_at_platform_runs_revision` asserting `[PLATFORM_RUNS_REVISION]`, and add:

```python
def test_platform_runs_revision_follows_generation_started_at_revision():
    assert _script_directory().get_revision(PLATFORM_RUNS_REVISION).down_revision == GENERATION_STARTED_AT_REVISION
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platform_runs.py tests/test_platforms_contract.py tests/test_phase0_schema.py`
Expected: FAIL: `ImportError: cannot import name 'PlatformRun'` (collection error for both files), the head test still sees `u3v4w5x6y7z8`.

- [ ] **Step 3: Model and migration**

`database/core.py`, below `JobPlatform`:

```python
class PlatformRun(Base):
    """One finished crawl of a platform (drawer history); workers/tasks/platform_runs.py keeps the newest 20."""

    __tablename__ = "platform_runs"
    id = Column(Integer, primary_key=True)
    platform_id = Column(Integer, ForeignKey("job_platforms.id"), index=True, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=False)
    found = Column(Integer, nullable=False, default=0)
    new = Column(Integer, nullable=False, default=0)
    matched = Column(Integer, nullable=False, default=0)
    # A seed run stores today's postings as known without analysing them (B8 "seed").
    seeded = Column(Boolean, nullable=False, default=False, server_default=false())
    error = Column(String, nullable=True)  # a fixed code of platform_runs.ERROR_CODES
```

and next to `PlatformResponse`:

```python
class PlatformRunResponse(BaseModel):
    started_at: Optional[str] = None
    finished_at: str
    found: int
    new: int
    matched: int
    seeded: bool
    error: Optional[str] = None
```

`database/migrations/versions/v4w5x6y7z8a9_add_platform_runs.py`:

```python
"""add platform_runs (crawl history per platform)

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "v4w5x6y7z8a9"
down_revision = "u3v4w5x6y7z8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "platform_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform_id", sa.Integer(), sa.ForeignKey("job_platforms.id"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("matched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seeded", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error", sa.String(), nullable=True),
    )
    op.create_index("ix_platform_runs_platform_id", "platform_runs", ["platform_id"])


def downgrade():
    op.drop_index("ix_platform_runs_platform_id", table_name="platform_runs")
    op.drop_table("platform_runs")
```

- [ ] **Step 4: Record and prune**

`workers/tasks/platform_runs.py`: import `PlatformRun`; add `RUN_HISTORY_LIMIT = 20`; in `build_last_run` add `"seeded": _hash_int(job_hash, "is_initial_run") == 1,` to the dict; add:

```python
def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _run_row(platform_id: int, last_run: dict) -> PlatformRun:
    return PlatformRun(
        platform_id=platform_id,
        started_at=_parse_iso(last_run["started_at"]),
        finished_at=_parse_iso(last_run["finished_at"]),
        found=last_run["found"],
        new=last_run["new"],
        matched=last_run["matched"],
        seeded=last_run["seeded"],
        error=last_run.get("error"),
    )


def _prune_runs(db, platform_id: int) -> None:
    """Keep the newest RUN_HISTORY_LIMIT runs; the drawer shows 10 and nothing older is needed."""
    newest = (
        db.query(PlatformRun.id)
        .filter(PlatformRun.platform_id == platform_id)
        .order_by(PlatformRun.finished_at.desc(), PlatformRun.id.desc())
        .limit(RUN_HISTORY_LIMIT)
    )
    keep = [row.id for row in newest]
    db.query(PlatformRun).filter(
        PlatformRun.platform_id == platform_id, ~PlatformRun.id.in_(keep),
    ).delete(synchronize_session=False)
```

and in `_save_last_run`, replace `platform.last_run = last_run` + `db.commit()` with:

```python
        platform.last_run = last_run
        db.add(_run_row(platform.id, last_run))
        db.flush()
        _prune_runs(db, platform.id)
        db.commit()
```

- [ ] **Step 5: The runs endpoint**

`routers/platforms.py`: import `Query` from fastapi and `PlatformRun`, `PlatformRunResponse` from `database.core`; add:

```python
DEFAULT_RUNS_PAGE = 10
MAX_RUNS_PAGE = 50


def _owned_platform(db: Session, platform_id: int, user_id: int) -> JobPlatform:
    platform = db.query(JobPlatform).filter(JobPlatform.id == platform_id, JobPlatform.user_id == user_id).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


def _serialize_run(run: PlatformRun) -> dict:
    return {
        "started_at": iso_utc(run.started_at),
        "finished_at": iso_utc(run.finished_at),
        "found": run.found,
        "new": run.new,
        "matched": run.matched,
        "seeded": run.seeded,
        "error": run.error,
    }


@router.get("/platforms/{platform_id}/runs", response_model=List[PlatformRunResponse])
def list_platform_runs(
    platform_id: int,
    limit: int = Query(DEFAULT_RUNS_PAGE, ge=1, le=MAX_RUNS_PAGE),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_platform(db, platform_id, current_user.id)
    runs = (
        db.query(PlatformRun)
        .filter(PlatformRun.platform_id == platform_id)
        .order_by(PlatformRun.finished_at.desc(), PlatformRun.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_run(run) for run in runs]
```

- [ ] **Step 6: Run them to verify they pass**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run the full backend suite. Expected: previous count + 7. The report lists the doc lines for Task 15 (`architecture.md` section 3: table `platform_runs`, migration `v4w5x6y7z8a9`, newest 20 per platform; `last_run.seeded`; endpoint `GET /platforms/{id}/runs`; tracker: migration verified on SQLite only).

---

### Task 4: Backend: platform write contract (validated PATCH, setup fields, delete keeps jobs, channel status)

**Files:**
- Create: `server/core/platform_rules.py`
- Modify: `server/database/core.py` (`PlatformUpdate` validators), `server/routers/platforms.py` (`update_platform`, `delete_platform`, `PlatformSetupCreateRequest`, `create_platform_with_setup`, new `_check_schedule_pair`, `_detach_jobs`, `_crawl_running`, `_crawl_redis`, `_ai_name`, `_apply_setup_choices`), `server/routers/settings.py` (`GET /notification-settings/channels`, `_channel_status`), `server/tests/test_platforms_contract.py`, `server/tests/test_platforms_router.py` (`test_delete_platform` expectation)

**Interfaces:**
- Consumes: `ensure_public_http_url` (Task 1), `active_crawl_for_platform` (Task 2), `_owned_platform`, `PlatformRun` (Task 3), `STATUS_SEEN` (`database/core.py`).
- Produces:
  - `PATCH /platforms/{id}`: `url_pattern` writable; 422 with `loc ["body", <field>]` and fixed `msg` codes `invalid_schedule_time`, `invalid_schedule_days`, `schedule_incomplete`, `invalid_name`, `invalid_url_pattern`, `url_not_public`; sending `schedule_time: null, schedule_days: null` clears the schedule.
  - `POST /platforms/setup` accepts `name?`, `schedule_time?`, `schedule_days?`, `url_pattern?` (same rules) and requires at least one `selected_urls` entry; with a `name` no AI call is made; with a `url_pattern` no inference.
  - `DELETE /platforms/{id}` (no query parameters) -> `{"status": "deleted", "kept_jobs": n}`; jobs detached, `SEEN` placeholders and runs deleted; 409 while a crawl of the platform runs; a Redis outage counts as "no crawl" (Celery cannot run without its broker).
  - `GET /notification-settings/channels` -> `{"PUSHOVER": bool, "RESEND": bool, "MAILJET": bool, "SMTP": bool}`.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_platforms_contract.py` (add `JobEntry` and `make_job`, `make_profile` imports at the top):

```python
def _patch(api_client, body):
    return api_client.patch(f"/platforms/{TEST_PLATFORM_ID}", json=body)


def test_patch_writes_the_url_pattern(api_client, seed, session_factory):
    seed(make_platform())
    assert _patch(api_client, {"url_pattern": " /job/ "}).status_code == 200
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID).url_pattern == "/job/"


@pytest.mark.parametrize("body,field", [
    ({"schedule_time": "24:00", "schedule_days": [0]}, "schedule_time"),
    ({"schedule_time": "8:00", "schedule_days": [0]}, "schedule_time"),
    ({"schedule_time": "08:00", "schedule_days": [7]}, "schedule_days"),
    ({"schedule_time": "08:00", "schedule_days": [1, 1]}, "schedule_days"),
    ({"schedule_time": "08:00", "schedule_days": []}, "schedule_days"),
    ({"name": "   "}, "name"),
    ({"url_pattern": "/"}, "url_pattern"),
])
def test_patch_rejects_schedule_time_out_of_range_and_other_bad_values(api_client, seed, body, field):
    seed(make_platform())
    response = _patch(api_client, body)
    assert (response.status_code, _loc(response)) == (422, ["body", field])


def test_patch_rejects_a_time_without_days(api_client, seed):
    seed(make_platform())
    response = _patch(api_client, {"schedule_time": "08:00"})
    assert (response.status_code, _loc(response)) == (422, ["body", "schedule_days"])


def test_patch_clears_the_schedule(api_client, seed, session_factory):
    seed(make_platform(schedule_time="08:00", schedule_days=[0, 1]))
    assert _patch(api_client, {"schedule_time": None, "schedule_days": None}).status_code == 200
    platform = fetch(session_factory, JobPlatform, TEST_PLATFORM_ID)
    assert (platform.schedule_time, platform.schedule_days) == (None, None)


def _setup(api_client, **fields):
    with patch("routers.platforms._trigger_scraper_search", return_value={"status": "Started", "job_id": "c"}), \
         patch("routers.platforms.generate_platform_name", return_value="AI Name") as name:
        response = api_client.post("/platforms/setup", json={**SETUP_BODY, "initial_run": "none", **fields})
    return response, name


def test_setup_takes_name_schedule_and_pattern_without_asking_the_ai(api_client):
    response, name = _setup(api_client, name="Kotlin Hamburg", schedule_time="07:30",
                            schedule_days=[0, 2, 4], url_pattern="/job/")
    body = response.json()
    assert (body["name"], body["schedule_time"], body["schedule_days"], body["url_pattern"]) == (
        "Kotlin Hamburg", "07:30", [0, 2, 4], "/job/",
    )
    name.assert_not_called()


def test_setup_without_name_asks_the_ai_and_infers_the_pattern(api_client):
    response, name = _setup(api_client)
    assert (response.json()["name"], response.json()["url_pattern"]) == ("AI Name", "/job/")
    name.assert_called_once()


def test_setup_rejects_an_incomplete_schedule_and_an_empty_selection(api_client):
    incomplete, _ = _setup(api_client, schedule_time="07:30")
    empty, _ = _setup(api_client, selected_urls=[])
    assert (_loc(incomplete), _loc(empty)) == (["body", "schedule_days"], ["body", "selected_urls"])


def test_delete_keeps_jobs_and_drops_placeholders_and_runs(api_client, seed, session_factory):
    seed(
        make_platform(),
        make_job(id="applied", status="APPLIED", platform_id=TEST_PLATFORM_ID),
        make_job(id="seen", status="SEEN", platform_id=TEST_PLATFORM_ID),
        _run(1),
    )
    response = api_client.delete(f"/platforms/{TEST_PLATFORM_ID}")
    assert response.json() == {"status": "deleted", "kept_jobs": 1}
    assert fetch(session_factory, JobEntry, "applied").platform_id is None
    assert fetch(session_factory, JobEntry, "seen") is None
    with session_factory() as db:
        assert (db.query(PlatformRun).count(), db.query(JobPlatform).count()) == (0, 0)


def test_delete_during_a_crawl_is_refused(api_client, seed, session_factory, monkeypatch, fake_redis):
    seed(make_platform())
    fake_redis.smembers.return_value = {b"crawl-1"}
    fake_redis.hget.return_value = str(TEST_PLATFORM_ID).encode()
    monkeypatch.setattr("routers.platforms._crawl_redis", lambda: fake_redis)
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").status_code == 409
    assert fetch(session_factory, JobPlatform, TEST_PLATFORM_ID) is not None


def test_delete_of_another_users_platform_is_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_platform(user_id=OTHER_USER_ID))
    assert api_client.delete(f"/platforms/{TEST_PLATFORM_ID}").status_code == 404


SECRET_TOKEN = "SECRET_TOKEN_4711"
SECRET_PASSWORD = "SECRET_PASSWORD_4711"
FROM_ADDRESS = "sender@example.com"


def test_channel_status_is_booleans_only(api_client, seed):
    seed(make_profile(pushover_user_key="user-key", pushover_api_token=SECRET_TOKEN,
                      smtp_host="smtp.example.com", smtp_user="me", smtp_password=SECRET_PASSWORD,
                      resend_api_key=SECRET_TOKEN))
    response = api_client.get("/notification-settings/channels")
    assert response.json() == {"PUSHOVER": True, "RESEND": False, "MAILJET": False, "SMTP": True}
    for secret in (SECRET_TOKEN, SECRET_PASSWORD, "user-key", "smtp.example.com"):
        assert secret not in response.text


def test_channel_status_without_profile_is_all_false(api_client):
    assert set(api_client.get("/notification-settings/channels").json().values()) == {False}
```

(`import pytest` at the top of the file. `RESEND` stays false because `resend_from_email` is missing: the same predicate as `POST /platforms/{id}/test-resend`.)

In `server/tests/test_platforms_router.py`, `test_delete_platform`: change the expected body to `{"status": "deleted", "kept_jobs": 0}`.

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_platforms_contract.py tests/test_platforms_router.py`
Expected: FAIL: the pattern is not written (`None != '/job/'`); the bad values answer 200; the setup ignores name/schedule/pattern; delete removes the applied job (`AttributeError: 'NoneType' object has no attribute 'platform_id'`) and answers `{"status": "deleted"}`; channels 404.

- [ ] **Step 3: Rules module**

`server/core/platform_rules.py`:

```python
"""Validation of a platform's editable fields, shared by PATCH /platforms/{id} and POST /platforms/setup.

Every refusal is a fixed code: it becomes the 422 message, which the web maps by field, never shows.
"""

import re
from typing import List, Optional

SCHEDULE_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# 0 = Monday, as workers/tasks/scheduling.py compares with datetime.weekday().
WEEKDAYS = range(7)
MAX_NAME_LENGTH = 100
MAX_PATTERN_LENGTH = 300


def check_schedule_time(value: Optional[str]) -> Optional[str]:
    if value is not None and not SCHEDULE_TIME.match(value):
        raise ValueError("invalid_schedule_time")
    return value


def check_schedule_days(value: Optional[List[int]]) -> Optional[List[int]]:
    if value is None:
        return None
    if not value or len(set(value)) != len(value) or any(day not in WEEKDAYS for day in value):
        raise ValueError("invalid_schedule_days")
    return sorted(value)


def check_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    name = value.strip()
    if not name or len(name) > MAX_NAME_LENGTH:
        raise ValueError("invalid_name")
    return name


def check_url_pattern(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    pattern = value.strip()
    # "/" alone would match every link of the site.
    if not pattern.strip("/") or len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError("invalid_url_pattern")
    return pattern


def incomplete_schedule_field(time: Optional[str], days: Optional[List[int]]) -> Optional[str]:
    """The missing half of a schedule, or None. A time without days (or the reverse) never runs."""
    if (time is None) == (days is None):
        return None
    return "schedule_time" if time is None else "schedule_days"
```

- [ ] **Step 4: `PlatformUpdate` validators**

`database/core.py`: import the five functions from `core.platform_rules` and add to `PlatformUpdate` (after the Task 1 `url` validator):

```python
    @field_validator("schedule_time")
    @classmethod
    def _time_format(cls, value: Optional[str]) -> Optional[str]:
        return check_schedule_time(value)

    @field_validator("schedule_days")
    @classmethod
    def _days_range(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        return check_schedule_days(value)

    @field_validator("name")
    @classmethod
    def _name_text(cls, value: Optional[str]) -> Optional[str]:
        return check_name(value)

    @field_validator("url_pattern")
    @classmethod
    def _pattern_text(cls, value: Optional[str]) -> Optional[str]:
        return check_url_pattern(value)
```

- [ ] **Step 5: PATCH pattern and schedule pair**

`routers/platforms.py`: import `incomplete_schedule_field`, `check_name`, `check_schedule_time`, `check_schedule_days`, `check_url_pattern` from `core.platform_rules`; add:

```python
def _check_schedule_pair(platform: JobPlatform) -> None:
    missing = incomplete_schedule_field(platform.schedule_time, platform.schedule_days)
    if missing:
        detail = [{"loc": ["body", missing], "msg": "schedule_incomplete", "type": "value_error"}]
        raise HTTPException(status_code=422, detail=detail)
```

In `update_platform`, after the `smtp_recipients` block and before `db.commit()`:

```python
    if platform_update.url_pattern is not None:
        db_platform.url_pattern = platform_update.url_pattern
    # Raised before the commit, so the half-applied change is discarded with the session.
    _check_schedule_pair(db_platform)
```

- [ ] **Step 6: Setup fields**

Extend `PlatformSetupCreateRequest` (keep the Task 1 `url` validator; import `Field`, `ValidationInfo` from pydantic):

```python
class PlatformSetupCreateRequest(BaseModel):
    url: str
    selected_urls: List[str] = Field(min_length=1)
    # "analyze" crawls now and scores every job found; "seed" only records today's
    # postings as known, so later runs report just the new ones; "none" starts nothing.
    initial_run: Literal["analyze", "seed", "none"] = "seed"
    crawl_interval_minutes: int = 60
    name: Optional[str] = None
    schedule_time: Optional[str] = None
    # Validated even when absent, so a time without days is refused on this field.
    schedule_days: Optional[List[int]] = Field(default=None, validate_default=True)
    url_pattern: Optional[str] = None

    # (Task 1's _url_is_public stays here.)

    @field_validator("name")
    @classmethod
    def _name_text(cls, value: Optional[str]) -> Optional[str]:
        return check_name(value)

    @field_validator("schedule_time")
    @classmethod
    def _time_format(cls, value: Optional[str]) -> Optional[str]:
        return check_schedule_time(value)

    @field_validator("schedule_days")
    @classmethod
    def _days_complete(cls, value: Optional[List[int]], info: ValidationInfo) -> Optional[List[int]]:
        days = check_schedule_days(value)
        if incomplete_schedule_field(info.data.get("schedule_time"), days):
            raise ValueError("schedule_incomplete")
        return days

    @field_validator("url_pattern")
    @classmethod
    def _pattern_text(cls, value: Optional[str]) -> Optional[str]:
        return check_url_pattern(value)
```

Add helpers and use them in `create_platform_with_setup`:

```python
def _ai_name(db: Session, url: str) -> str:
    client, model = get_client_and_model("platform_name", db)
    return generate_platform_name(url=url, db=db, model=model, client=client)


def _apply_setup_choices(platform: JobPlatform, request: PlatformSetupCreateRequest) -> None:
    if request.name:
        platform.name = request.name
    platform.schedule_time = request.schedule_time
    platform.schedule_days = request.schedule_days
    platform.url_pattern = request.url_pattern or _infer_url_pattern(request.selected_urls, request.url)
```

In `create_platform_with_setup`: in the `else` branch replace the two lines `client, model = ...` and `name=generate_platform_name(...)` by `name=request.name or _ai_name(db, request.url),`; replace `platform.url_pattern = _infer_url_pattern(request.selected_urls, request.url)` by `_apply_setup_choices(platform, request)`.

- [ ] **Step 7: Delete keeps jobs**

`routers/platforms.py`: `import redis`, import `active_crawl_for_platform`, `STATUS_SEEN`, `PlatformRun`; replace the whole `delete_platform` endpoint (its old body and the ignored query parameters) with:

```python
_REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")


def _crawl_redis():
    return redis.from_url(_REDIS_URL)


def _crawl_running(user_id: int, platform_id: int) -> bool:
    try:
        return active_crawl_for_platform(_crawl_redis(), user_id, platform_id) is not None
    except redis.RedisError as error:
        # Redis is Celery's broker: while it is down no crawl can run, so the delete may go ahead.
        logger.warning(f"Crawl registry unavailable while deleting platform {platform_id}: {error}")
        return False


def _detach_jobs(db: Session, platform_id: int) -> int:
    """Jobs outlive their source; dedup placeholders and run history do not. Returns the kept jobs."""
    db.query(JobEntry).filter(
        JobEntry.platform_id == platform_id, JobEntry.status == STATUS_SEEN,
    ).delete(synchronize_session=False)
    kept = db.query(JobEntry).filter(JobEntry.platform_id == platform_id).update(
        {JobEntry.platform_id: None}, synchronize_session=False,
    )
    db.query(PlatformRun).filter(PlatformRun.platform_id == platform_id).delete(synchronize_session=False)
    return kept


@router.delete("/platforms/{platform_id}")
def delete_platform(
    platform_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    platform = _owned_platform(db, platform_id, current_user.id)
    # A running crawl would still save jobs that point at the deleted source.
    if _crawl_running(current_user.id, platform_id):
        raise HTTPException(status_code=409, detail="Crawl running")
    kept = _detach_jobs(db, platform_id)
    db.delete(platform)
    db.commit()
    return {"status": "deleted", "kept_jobs": kept}
```

Remove the imports this made unused (`CompanyProfile` if nothing else in the file uses it; `JobStatusHistory` and `JobDocument` stay, `delete_platform_jobs` uses them).

- [ ] **Step 8: Channel status**

`routers/settings.py`:

```python
def _channel_status(profile: Optional[UserProfile]) -> dict:
    """The predicates of the test endpoints (routers/platforms.py test-*): configured means sendable."""
    p = profile
    return {
        "PUSHOVER": bool(p and p.pushover_user_key and p.pushover_api_token),
        "RESEND": bool(p and p.resend_api_key and p.resend_from_email),
        "MAILJET": bool(p and p.mailjet_api_key and p.mailjet_secret_key and p.mailjet_from_email),
        "SMTP": bool(p and p.smtp_host and p.smtp_user and p.smtp_password),
    }


@router.get("/notification-settings/channels")
def notification_channel_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Which channels can send. Booleans only: no credential or address leaves the server."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    return _channel_status(profile)
```

- [ ] **Step 9: Run them to verify they pass**

Run the Step 2 command. Expected: PASS, including the existing `test_setup_*`, `test_update_platform*` and `test_delete_platform_jobs_filtering`.

- [ ] **Step 10: Checkpoint**

Run the full backend suite. Expected: previous count + 18 (parametrised cases counted). The report lists the doc lines for Task 15 (`architecture.md`: PATCH rules and writable `url_pattern`, setup fields, delete keeps jobs (409 while crawling), `GET /notification-settings/channels`; section 4 invariant "deleting a source never deletes jobs").

---
### Task 5: Web contract layer: platform API, crawl activity with `platformId`, canonical fixtures, `reply`

**Files:**
- Create: `web/src/api/platformPaths.ts`, `web/src/api/notifications.ts`, `web/tests/unit/api/sourcesApi.test.ts`, `web/tests/unit/realtime/crawlActivity.test.ts`, `web/tests/e2e/support/platformFixtures.ts`
- Modify: `web/src/api/platforms.ts`, `web/src/api/crawl.ts`, `web/src/api/settings.ts`, `web/src/api/queryKeys.ts`, `web/src/realtime/events.ts`, `web/src/realtime/activity.ts`, `web/src/realtime/useActivity.ts`, `web/tests/unit/realtime/activity.test.ts` (the `task()` helper gets `platformId: null`), `web/tests/e2e/support/fixtures.ts`, `web/tests/e2e/support/inboxFixtures.ts`, `web/tests/e2e/support/mockApi.ts`

**Interfaces:**
- Consumes: the backend contract of Tasks 1-4 (all new fields optional here, so this task runs before them).
- Produces:
  - `platformPaths.ts` (client-free): `PLATFORMS_PATH`, `PLATFORM_SETUP_PATH`, `PREVIEW_LINKS_PATH`, `CHANNEL_STATUS_PATH`, `NOTIFICATION_TEMPLATES_PATH`, `CANCEL_CRAWL_PATH`, `RUN_HISTORY_SIZE = 10`, `NOTIFY_CHANNELS`, `type NotifyChannel`, `INITIAL_RUNS`, `type InitialRun`, `CHANNEL_TEMPLATE_FIELD`, `CHANNEL_RECIPIENTS_FIELD`, `CHANNEL_TEMPLATE_TYPES`, `platformPath(id, suffix?)`, `platformRunsPath(id)`, `platformTestPath(id, channel)`, `platformCrawlPath(id)`, `platformNamePath(id)`.
  - `platforms.ts`: `Platform` (adds `setup_status`, `url_pattern`, `notification_adapters`, the four `*_template`, the three `*_recipients`, `last_run.seeded`), `PlatformBody`, `PlatformPatch`, `patchPlatform({ id, patch }): Promise<Platform>`, `startPlatformCrawl(id): Promise<string>` (crawl id), `deletePlatform(id): Promise<number>` (kept jobs), `suggestPlatformName(id): Promise<string>`, `sendPlatformTest({ id, channel }): Promise<void>`, `PlatformRun`, `PlatformRunBody`, `platformRunsQueryOptions(id)`, `PreviewLink`, `PreviewLinksBody`, `previewSourceLinks({ url, signal }): Promise<PreviewLink[]>`, `PlatformSetupRequest`, `PlatformSetupResult`, `PlatformSetupBody`, `setupPlatform(request): Promise<PlatformSetupResult>`; `platformsQueryOptions`, `fetchPlatforms`, `countFailingPlatforms` unchanged here (Task 6 changes the counting rule).
  - `crawl.ts`: `CrawlJob.platform_id: number | null | undefined`, `cancelCrawl(jobId): Promise<void>`.
  - `notifications.ts`: `ChannelStatus`, `ChannelStatusBody`, `channelStatusQueryOptions()`, `NotificationTemplate`, `NotificationTemplateBody`, `notificationTemplatesQueryOptions()`.
  - `settings.ts`: `TimezoneSettingsBody`, `profileTimezoneQueryOptions()` (string | null).
  - `queryKeys`: `platformRuns(id) = ["platforms", "runs", id]`, `channelStatus = ["settings", "channels"]`, `notificationTemplates = ["notification-templates"]`, `profileTimezone = ["settings", "timezone"]`.
  - realtime: `crawl_job_started.platform_id` (nullish); `ActivityTask.platformId: number | null`; `FinishedTask.platformId: number | null`; `CrawlSeed { id: string; platformId: number; source: string }`; `seedCrawlTask(state, seed): ActivityState`; `markCrawlStarted(queryClient, seed): void` (`useActivity.ts`).
  - e2e: `support/platformFixtures.ts` exports `STEPSTONE`, `INDEED`, `PLATFORMS`, `CRAWL_STATUS`, `RUNNING_CRAWL`; `inboxFixtures.PLATFORMS_WITH_RUNS` becomes an alias of `PLATFORMS`; `fixtures.ts` uses them and its `GET /settings` body carries `timezone: "Europe/Berlin"`; `mockApi.ts` exports `reply(status, body)` that a `respond` function may return.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/api/sourcesApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelCrawl, fetchCrawlJobs } from "@/api/crawl";
import { ApiError } from "@/api/errors";
import { channelStatusQueryOptions } from "@/api/notifications";
import { platformRunsPath, platformTestPath } from "@/api/platformPaths";
import {
  deletePlatform,
  fetchPlatforms,
  patchPlatform,
  platformRunsQueryOptions,
  previewSourceLinks,
  sendPlatformTest,
  setupPlatform,
  startPlatformCrawl,
} from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { createTestQueryClient } from "../support/render";
import { jsonResponse } from "../support/fakeFetch";
import { stubRoutes } from "../support/stubRoutes";

const PLATFORM = { id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs/kotlin" };
const HTTP_CONFLICT = 409;

afterEach(() => vi.unstubAllGlobals());

describe("platforms api", () => {
  it("reads the drawer fields and treats odd JSON columns as empty", async () => {
    stubRoutes({
      "GET /platforms": [
        { ...PLATFORM, notification_adapters: "PUSHOVER", resend_recipients: [1], last_run: { seeded: true } },
      ],
    });
    const [platform] = await fetchPlatforms();
    expect([
      platform!.notification_adapters,
      platform!.resend_recipients,
      platform!.setup_status,
      platform!.last_run?.seeded,
    ]).toEqual([null, null, "active", true]);
  });

  it("starts a crawl and answers its id", async () => {
    stubRoutes({ "POST /platforms/1/crawl": { status: "Started", job_id: "crawl-9" } });
    await expect(startPlatformCrawl(1)).resolves.toBe("crawl-9");
  });

  it("turns a second start into a CONFLICT error", async () => {
    stubRoutes({ "POST /platforms/1/crawl": () => jsonResponse(HTTP_CONFLICT, { detail: "Crawl already running" }) });
    await expect(startPlatformCrawl(1)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sends exactly the patch it is given", async () => {
    const calls = stubRoutes({ "PATCH /platforms/1": PLATFORM });
    await patchPlatform({ id: 1, patch: { schedule_time: null, schedule_days: null } });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ schedule_time: null, schedule_days: null });
  });

  it("reports how many jobs a delete kept", async () => {
    stubRoutes({ "DELETE /platforms/1": { status: "deleted", kept_jobs: 3 } });
    await expect(deletePlatform(1)).resolves.toBe(3);
  });

  it("asks for the run history with its size", async () => {
    const calls = stubRoutes({ "GET /platforms/1/runs": [{ finished_at: "2026-10-08T06:00:00+00:00" }] });
    const runs = await createTestQueryClient().fetchQuery(platformRunsQueryOptions(1));
    expect(calls[0]!.url.endsWith(platformRunsPath(1))).toBe(true);
    expect(runs[0]).toMatchObject({ found: 0, seeded: false, error: undefined });
    expect(platformRunsQueryOptions(1).queryKey).toEqual(queryKeys.platformRuns(1));
  });

  it("sends a test through the channel's own path", async () => {
    const calls = stubRoutes({ "POST /platforms/1/test-smtp": { ok: true } });
    await sendPlatformTest({ id: 1, channel: "SMTP" });
    expect(calls[0]!.url.endsWith(platformTestPath(1, "SMTP"))).toBe(true);
  });

  it("reads found links and gives a link without text an empty one", async () => {
    stubRoutes({ "POST /platforms/preview-links": { links: [{ url: "https://x.de/job/1" }] } });
    await expect(previewSourceLinks({ url: "https://x.de/jobs" })).resolves.toEqual([
      { url: "https://x.de/job/1", text: "" },
    ]);
  });

  it("reads the setup flag from the setup answer", async () => {
    stubRoutes({ "POST /platforms/setup": { ...PLATFORM, initial_crawl_started: true } });
    const result = await setupPlatform({
      url: PLATFORM.url,
      selected_urls: [`${PLATFORM.url}/1`],
      initial_run: "analyze",
      schedule_time: null,
      schedule_days: null,
    });
    expect(result.initial_crawl_started).toBe(true);
  });
});

describe("crawl api", () => {
  it("reads the platform of a running crawl", async () => {
    stubRoutes({
      "GET /scraper/crawl-status": {
        jobs: [{ job_id: "c1", platform: PLATFORM.url, platform_id: 1, status: "crawling" }],
      },
    });
    const [job] = await fetchCrawlJobs();
    expect(job!.platform_id).toBe(1);
  });

  it("surfaces a scraper refusal of a cancel as an error", async () => {
    stubRoutes({ "POST /scraper/cancel-crawl": { status: "error", message: "Job not found" } });
    const error = await cancelCrawl("c1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UPSTREAM_ERROR");
  });
});

describe("notification channels", () => {
  it("reads missing channels as not configured", async () => {
    stubRoutes({ "GET /notification-settings/channels": { PUSHOVER: true } });
    const status = await createTestQueryClient().fetchQuery(channelStatusQueryOptions());
    expect(status).toEqual({ PUSHOVER: true, RESEND: false, MAILJET: false, SMTP: false });
  });
});
```

`web/tests/unit/realtime/crawlActivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  reduceActivity,
  seedCrawlTask,
} from "@/realtime/activity";
import type { ActivityEvent } from "@/realtime/events";

const NOW = Date.UTC(2026, 9, 8, 12, 0);
const URL_1 = "https://www.stepstone.de/jobs/kotlin";
const SEED = { id: "c1", platformId: 1, source: "www.stepstone.de" };
const started = (platformId?: number): ActivityEvent => ({
  type: "crawl_job_started",
  user_id: 7,
  job_id: "c1",
  platform: URL_1,
  platform_id: platformId,
});
const failed: ActivityEvent = { type: "crawl_job_failed", user_id: 7, job_id: "c1" };

describe("crawl activity per source", () => {
  it("seeds a waiting bar for the source before the first event", () => {
    expect(seedCrawlTask(EMPTY_ACTIVITY, SEED).running).toEqual([
      { id: "c1", platformId: 1, source: "www.stepstone.de", step: "starting", done: 0, total: 0 },
    ]);
  });

  it("the started event names the platform", () => {
    expect(reduceActivity(EMPTY_ACTIVITY, started(1), NOW).running[0]!.platformId).toBe(1);
  });

  it("the started event keeps the seeded platform when it names none", () => {
    const seeded = seedCrawlTask(EMPTY_ACTIVITY, SEED);
    expect(reduceActivity(seeded, started(), NOW).running[0]!.platformId).toBe(1);
  });

  it("a late seed does not revive an ended crawl", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED), failed, NOW);
    expect(seedCrawlTask(ended, SEED).running).toEqual([]);
  });

  it("a finished task remembers its platform", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED), failed, NOW);
    expect(ended.lastFinished).toMatchObject({ id: "c1", platformId: 1, outcome: "failed" });
  });

  it("crawl status entries carry their platform, imports none", () => {
    const state = activityFromCrawlJobs([
      { job_id: "c2", platform: URL_1, platform_id: 2, status: "crawling", total: 4, scraping_completed: 1 },
      { job_id: "i1", platform: `${URL_1}/job/9`, status: "starting", total: 1, scraping_completed: 0 },
    ]);
    expect(state.running.map((task) => task.platformId)).toEqual([2, null]);
  });
});
```

In `web/tests/unit/realtime/activity.test.ts`, add `platformId: null,` to the `task()` helper's defaults and to every whole `lastFinished` object an assertion compares with `toEqual` (the reducer now always sets it).

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/sourcesApi.test.ts tests/unit/realtime/crawlActivity.test.ts tests/unit/realtime/activity.test.ts`
Expected: FAIL: unresolved `@/api/platformPaths` and `@/api/notifications`; `startPlatformCrawl`, `seedCrawlTask` are not exported; `platformId` is missing from the reduced tasks.

- [ ] **Step 3: `platformPaths.ts`**

```ts
/**
 * Paths and wire constants of the platforms API without the API client, so e2e fixtures can
 * import them (the client needs the app's env at load).
 */
export const PLATFORMS_PATH = "/platforms";
export const PLATFORM_SETUP_PATH = "/platforms/setup";
export const PREVIEW_LINKS_PATH = "/platforms/preview-links";
export const CHANNEL_STATUS_PATH = "/notification-settings/channels";
export const NOTIFICATION_TEMPLATES_PATH = "/notification-templates";
export const CANCEL_CRAWL_PATH = "/scraper/cancel-crawl";
/** Runs shown in the drawer (D8); the server keeps 20. */
export const RUN_HISTORY_SIZE = 10;

export const NOTIFY_CHANNELS = ["PUSHOVER", "RESEND", "MAILJET", "SMTP"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** B8: what the setup does right after creating the source. */
export const INITIAL_RUNS = ["seed", "analyze", "none"] as const;
export type InitialRun = (typeof INITIAL_RUNS)[number];

export const CHANNEL_TEMPLATE_FIELD = {
  PUSHOVER: "pushover_template",
  RESEND: "resend_template",
  MAILJET: "mailjet_template",
  SMTP: "smtp_template",
} as const;

/** Pushover goes to the user's own device; the email channels need recipients per source. */
export const CHANNEL_RECIPIENTS_FIELD = {
  PUSHOVER: null,
  RESEND: "resend_recipients",
  MAILJET: "mailjet_recipients",
  SMTP: "smtp_recipients",
} as const;

const EMAIL_TEMPLATE_TYPES = ["RESEND", "MAILJET", "SMTP"] as const;
/** SMTP templates cannot be created on the server (G11), so every email channel offers all email types. */
export const CHANNEL_TEMPLATE_TYPES: Readonly<Record<NotifyChannel, readonly string[]>> = {
  PUSHOVER: ["PUSHOVER"],
  RESEND: EMAIL_TEMPLATE_TYPES,
  MAILJET: EMAIL_TEMPLATE_TYPES,
  SMTP: EMAIL_TEMPLATE_TYPES,
};

export function platformPath(id: number, suffix = ""): string {
  return `${PLATFORMS_PATH}/${id}${suffix}`;
}

export function platformRunsPath(id: number): string {
  return platformPath(id, `/runs?limit=${RUN_HISTORY_SIZE}`);
}

export function platformCrawlPath(id: number): string {
  return platformPath(id, "/crawl");
}

export function platformNamePath(id: number): string {
  return platformPath(id, "/generate-name");
}

export function platformTestPath(id: number, channel: NotifyChannel): string {
  return platformPath(id, `/test-${channel.toLowerCase()}`);
}
```

- [ ] **Step 4: `platforms.ts`**

Replace the schemas and add the calls; keep `fetchPlatforms`, `platformsQueryOptions` and `countFailingPlatforms` as they are (use `PLATFORMS_PATH` in `fetchPlatforms`).

```ts
// B9 summary of the last crawl; error is a fixed code (cancelled, unreachable, failed); seeded = B8 seed run.
const lastRunSchema = z.object({
  error: z.string().nullish(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
  found: z.number().int().nullish(),
  new: z.number().int().nullish(),
  matched: z.number().int().nullish(),
  seeded: z.boolean().nullish(),
});

// Free JSON columns: an odd shape reads as empty, not as a broken list.
const stringList = z.array(z.string()).nullish().catch(null);

const platformSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string(),
  is_active: z.boolean().default(true),
  setup_status: z.string().default("active"),
  url_pattern: z.string().nullish(),
  schedule_time: z.string().nullish(),
  schedule_days: z.array(z.number().int()).nullish().catch(null),
  last_crawl_at: z.string().nullish(),
  last_run: lastRunSchema.nullish().catch(null),
  notification_adapters: stringList,
  pushover_template: z.string().nullish(),
  resend_template: z.string().nullish(),
  resend_recipients: stringList,
  mailjet_template: z.string().nullish(),
  mailjet_recipients: stringList,
  smtp_template: z.string().nullish(),
  smtp_recipients: stringList,
});
export type Platform = z.infer<typeof platformSchema>;
export type PlatformBody = z.input<typeof platformSchema>;

/** Only the fields a drawer section owns; the server applies exactly the keys sent (D5). */
export interface PlatformPatch {
  name?: string;
  url?: string;
  url_pattern?: string;
  is_active?: boolean;
  schedule_time?: string | null;
  schedule_days?: number[] | null;
  notification_adapters?: NotifyChannel[];
  pushover_template?: string | null;
  resend_template?: string | null;
  mailjet_template?: string | null;
  smtp_template?: string | null;
  resend_recipients?: string[] | null;
  mailjet_recipients?: string[] | null;
  smtp_recipients?: string[] | null;
}

export async function patchPlatform({ id, patch }: { id: number; patch: PlatformPatch }) {
  return api.request(platformPath(id), platformSchema, { method: "PATCH", json: patch });
}

const crawlStartedSchema = z.object({ job_id: z.string() });

/** The crawl id the realtime events carry; 409 (CONFLICT) when this source is already crawling. */
export async function startPlatformCrawl(id: number): Promise<string> {
  const started = await api.request(platformCrawlPath(id), crawlStartedSchema, { method: "POST" });
  return started.job_id;
}

const deletedSchema = z.object({ kept_jobs: z.number().int().default(0) });

/** Deletes the source; its jobs stay (G7). Answers how many jobs were kept. */
export async function deletePlatform(id: number): Promise<number> {
  const deleted = await api.request(platformPath(id), deletedSchema, { method: "DELETE" });
  return deleted.kept_jobs;
}

const nameSchema = z.object({ name: z.string() });

export async function suggestPlatformName(id: number): Promise<string> {
  return (await api.request(platformNamePath(id), nameSchema, { method: "POST" })).name;
}

const sentSchema = z.object({ ok: z.boolean() });

export async function sendPlatformTest({ id, channel }: { id: number; channel: NotifyChannel }) {
  await api.request(platformTestPath(id, channel), sentSchema, { method: "POST" });
}

const runSchema = z.object({
  started_at: z.string().nullish(),
  finished_at: z.string(),
  found: z.number().int().default(0),
  new: z.number().int().default(0),
  matched: z.number().int().default(0),
  seeded: z.boolean().default(false),
  error: z.string().nullish(),
});
export type PlatformRun = z.infer<typeof runSchema>;
export type PlatformRunBody = z.input<typeof runSchema>;

export function platformRunsQueryOptions(id: number) {
  return queryOptions({
    queryKey: queryKeys.platformRuns(id),
    queryFn: () => api.request(platformRunsPath(id), z.array(runSchema)),
  });
}

const previewSchema = z.object({
  links: z.array(z.object({ url: z.string(), text: z.string().default("") })),
});
export type PreviewLinksBody = z.input<typeof previewSchema>;
export type PreviewLink = z.infer<typeof previewSchema>["links"][number];

/** Wizard step 1; takes up to 90 s, so the caller passes a signal to abort it (G21). */
export async function previewSourceLinks({ url, signal }: { url: string; signal?: AbortSignal }) {
  const preview = await api.request(PREVIEW_LINKS_PATH, previewSchema, {
    method: "POST",
    json: { url },
    signal,
  });
  return preview.links;
}

export interface PlatformSetupRequest {
  url: string;
  selected_urls: string[];
  initial_run: InitialRun;
  name?: string;
  schedule_time: string | null;
  schedule_days: number[] | null;
  url_pattern?: string;
}

const setupSchema = platformSchema.extend({ initial_crawl_started: z.boolean().default(false) });
export type PlatformSetupResult = z.infer<typeof setupSchema>;
export type PlatformSetupBody = z.input<typeof setupSchema>;

export async function setupPlatform(request: PlatformSetupRequest): Promise<PlatformSetupResult> {
  return api.request(PLATFORM_SETUP_PATH, setupSchema, { method: "POST", json: request });
}
```

(Imports: the paths and types from `./platformPaths`.)

- [ ] **Step 5: `crawl.ts`, `notifications.ts`, `settings.ts`, `queryKeys.ts`**

`crawl.ts`: add `platform_id: z.number().int().nullish(),` to `crawlJobSchema` (comment: "Null for imports; set for source crawls (backend Task 2)."), and:

```ts
const cancelledSchema = z.object({ status: z.string() });

/** A refusal is 200 + {status:"error"}, which the client turns into an UPSTREAM_ERROR. */
export async function cancelCrawl(jobId: string): Promise<void> {
  await api.request(CANCEL_CRAWL_PATH, cancelledSchema, { method: "POST", json: { job_id: jobId } });
}
```

`notifications.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { CHANNEL_STATUS_PATH, NOTIFICATION_TEMPLATES_PATH } from "./platformPaths";
import { queryKeys } from "./queryKeys";

// Booleans only (backend Task 4): which channels have credentials; no secret is ever read here.
const channelStatusSchema = z.object({
  PUSHOVER: z.boolean().default(false),
  RESEND: z.boolean().default(false),
  MAILJET: z.boolean().default(false),
  SMTP: z.boolean().default(false),
});
export type ChannelStatus = z.infer<typeof channelStatusSchema>;
export type ChannelStatusBody = z.input<typeof channelStatusSchema>;

const templateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.string(),
  content: z.string(),
  is_admin: z.boolean().default(false),
});
export type NotificationTemplate = z.infer<typeof templateSchema>;
export type NotificationTemplateBody = z.input<typeof templateSchema>;

export function channelStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.channelStatus,
    queryFn: () => api.request(CHANNEL_STATUS_PATH, channelStatusSchema),
  });
}

/** The user's and the global templates of every type; the drawer filters per channel. */
export function notificationTemplatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.notificationTemplates,
    queryFn: () => api.request(NOTIFICATION_TEMPLATES_PATH, z.array(templateSchema)),
  });
}
```

`settings.ts` (add the `queryOptions` and `queryKeys` imports):

```ts
// Only the zone is parsed; secrets in the same body are masked server-side and never read (G26).
const timezoneSettingsSchema = z.object({ timezone: z.string().nullish() });
export type TimezoneSettingsBody = z.input<typeof timezoneSettingsSchema>;

/** The zone the scheduler compares schedule times with (D6); null when unset. */
export function profileTimezoneQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.profileTimezone,
    queryFn: async () => (await api.request("/settings", timezoneSettingsSchema)).timezone ?? null,
  });
}
```

`queryKeys.ts`, after `platforms`:

```ts
  // Under the platforms root: the invalidation after every crawl end refreshes the history too.
  platformRuns: (id: number) => ["platforms", "runs", id] as const,
  channelStatus: ["settings", "channels"],
  notificationTemplates: ["notification-templates"],
  profileTimezone: ["settings", "timezone"],
```

- [ ] **Step 6: Realtime**

`events.ts`: `crawl_job_started` becomes `z.object({ type: z.literal("crawl_job_started"), ...crawlRun, platform: z.string(), platform_id: z.number().int().nullish() })`.

`activity.ts`:
- `ActivityTask` and `FinishedTask` get `platformId: number | null;` (doc: "The source this crawl belongs to; null for imports.").
- `crawl_job_started` updater: `({ ...task, source: sourceLabel(event.platform), step: "starting", platformId: event.platform_id ?? task.platformId })`.
- `progressTask` base and `taskFromCrawlJob` set `platformId: null` / `platformId: job.platform_id ?? null`.
- `finishTask`: `lastFinished: { id, source, outcome, finishedAt: now, platformId: finished?.platformId ?? null }`.
- new:

```ts
export interface CrawlSeed {
  id: string;
  platformId: number;
  source: string;
}

/**
 * D4: the answer of POST /platforms/{id}/crawl shows the bar before the first event. A crawl that
 * already ended (a fast failure can beat the answer) stays ended.
 */
export function seedCrawlTask(state: ActivityState, seed: CrawlSeed): ActivityState {
  if (state.endedIds.includes(seed.id)) return state;
  const previous = state.running.find((task) => task.id === seed.id);
  const task: ActivityTask = previous
    ? { ...previous, platformId: seed.platformId }
    : { ...seed, step: "starting", done: 0, total: 0 };
  return { ...state, running: upsertTask(state.running, task) };
}
```

`useActivity.ts`:

```ts
/** Seeds the activity cache right after a source's crawl was accepted (D4). */
export function markCrawlStarted(queryClient: QueryClient, seed: CrawlSeed): void {
  queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
    seedCrawlTask(state ?? EMPTY_ACTIVITY, seed),
  );
}
```

Run `"$QA"/webrun.sh pnpm typecheck`; add `platformId: null` to every hand-written `ActivityTask`/`FinishedTask` literal it reports (tests only; e.g. shell activity tests).

- [ ] **Step 7: Canonical e2e fixtures and `reply`**

`web/tests/e2e/support/platformFixtures.ts`:

```ts
import type { CrawlStatusBody } from "../../../src/api/crawl";
import type { PlatformBody } from "../../../src/api/platforms";

// One platform set for every spec (G18): fixed error codes, finished runs, and the running crawl of
// AUTHENTICATED_ROUTES belongs to StepStone (same URL, platform_id 1).
export const STEPSTONE: PlatformBody = {
  id: 1,
  name: "StepStone",
  url: "https://www.stepstone.de/jobs/kotlin",
  is_active: true,
  setup_status: "active",
  url_pattern: "/stellenangebote--",
  schedule_time: "14:00",
  schedule_days: [0, 1, 2, 3, 4],
  last_run: {
    started_at: "2026-10-08T05:55:00+00:00",
    finished_at: "2026-10-08T06:00:00+00:00",
    found: 12,
    new: 5,
    matched: 3,
    seeded: false,
    error: null,
  },
  notification_adapters: ["PUSHOVER"],
  pushover_template: null,
};

export const INDEED: PlatformBody = {
  id: 2,
  name: "Indeed",
  url: "https://de.indeed.com/jobs?q=kotlin",
  is_active: true,
  setup_status: "active",
  url_pattern: "/viewjob?jk=",
  last_run: {
    finished_at: "2026-10-07T06:00:00+00:00",
    found: 0,
    new: 0,
    matched: 0,
    seeded: false,
    error: "unreachable",
  },
  notification_adapters: [],
};

export const PLATFORMS: PlatformBody[] = [STEPSTONE, INDEED];

export const RUNNING_CRAWL = {
  job_id: "crawl-1",
  platform: STEPSTONE.url,
  platform_id: STEPSTONE.id,
  status: "crawling",
  total: 12,
  scraping_completed: 5,
};

export const CRAWL_STATUS: CrawlStatusBody = { jobs: [RUNNING_CRAWL] };
```

`fixtures.ts`: delete its local `CRAWL_STATUS` and `PLATFORMS`, import them from `./platformFixtures`; type `SETTINGS` as `LanguageSettingsBody & TimezoneSettingsBody` with `{ language: "de", timezone: "Europe/Berlin" }`. `RUNNING_CRAWL_ID` keeps its value (`"crawl-1"`).

`inboxFixtures.ts`: replace the literal `PLATFORMS_WITH_RUNS` with `export const PLATFORMS_WITH_RUNS = PLATFORMS;` (import from `./platformFixtures`). The values for StepStone and Indeed are the same as before plus the new fields, so the run line expectations do not change.

`mockApi.ts`:

```ts
const REPLY = Symbol("reply");

/** A stateful answer with its own status (e.g. 409 or 422 from a FakeServer); return it from `respond`. */
export interface Reply {
  [REPLY]: true;
  status: number;
  body: unknown;
}

export function reply(status: number, body: unknown): Reply {
  return { [REPLY]: true, status, body };
}

function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && REPLY in value;
}
```

and split `fulfil` so the JSON branch reads the answer once and takes `status`/`body` from a `Reply` when it is one (keep each function at 20 lines or less, e.g. a helper `jsonAnswer(response, sent): { status: number; json: unknown }`).

- [ ] **Step 8: Run unit tests**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api tests/unit/realtime`
Expected: PASS.

- [ ] **Step 9: Format and checkpoint**

Format, then the checkpoint. Expected: all five green; existing e2e specs pass unchanged with the canonical fixtures (if a spec asserted the old free-text Indeed error, it now sees the neutral `run.error.unreachable` text: update only that assertion and name it in the report).

---

### Task 6: Domain rules for Quellen (`domain/sources.ts`), shared last-run reading, one failing rule

**Files:**
- Create: `web/src/domain/sources.ts`, `web/src/features/sources/labels.ts`, `web/tests/unit/domain/sources.test.ts`
- Modify: `web/src/domain/runLine.ts` (`isScheduleTime`, `isFailedRun`, `lastRunOf`, `LastRun.seeded`, `RUN_ERROR_LABEL` moved here), `web/src/features/inbox/RunLine.tsx` (imports `RUN_ERROR_LABEL`), `web/src/api/platforms.ts` (`countFailingPlatforms` uses `isFailingSource`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/unit/domain/runLine.test.ts`

**Interfaces:**
- Consumes: `Platform`, `PreviewLink` (types), `runErrorCode`, `RUN_ERROR_CODES` (`domain/runLine.ts`), `NotifyChannel`, `InitialRun` (`api/platformPaths.ts`).
- Produces (`domain/sources.ts`, client-free): `SOURCES_PATH`, `SOURCE_PARAM = "quelle"`, `ADD_PARAM = "add"`, `sourcesHref({ sourceId?, add? })`, `sourceIdFromParam(value)`, `addFromParam(value)`; `SourceState`, `PENDING_SETUP`, `isFailingSource(platform)`, `sourceState(platform, running)`, `canCrawl(state)`, `failingSources(platforms)`, `sortSources(platforms)`; `Schedule { time; days }`, `WEEKDAYS`, `DEFAULT_SCHEDULE`, `scheduleOf(platform)`, `dayRuns(days)`; `LinkLike`, `suggestJobLinks(links)`, `matchingCount(links, pattern)`, `linkPath(url)`; `SOURCE_FIELDS`, `SourceField`, `toSourceField(serverField)`, `WIZARD_STEP_OF`, `WizardStep = 1 | 2 | 3`, `firstErrorStep(fields)`; `parseRecipients(text)`; `DEFAULT_TEMPLATE`, `CUSTOM_TEMPLATE`, `templateChoice(content, templates)`.
- `domain/runLine.ts` additionally exports `isScheduleTime(text)`, `isFailedRun(code)`, `RunSummary`, `summarizeRun(run): RunSummary | null`, `lastRunOf(platform): LastRun | null`, `RUN_ERROR_LABEL`; `LastRun.seeded: boolean`; `below` is 0 for a seed run (G5).
- `features/sources/labels.ts`: `SOURCE_STATE_LABEL`, `CHANNEL_LABEL`, `INITIAL_RUN_LABEL` (`{ title, hint }` keys), `WEEKDAY_LABEL`, `scheduleText(schedule, t)`.
- `countFailingPlatforms(platforms)` counts `isFailingSource` (cancelled is not failing, G19).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/sources.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countFailingPlatforms, type Platform } from "@/api/platforms";
import {
  addFromParam,
  dayRuns,
  failingSources,
  firstErrorStep,
  linkPath,
  matchingCount,
  parseRecipients,
  scheduleOf,
  sortSources,
  sourceIdFromParam,
  sourcesHref,
  sourceState,
  suggestJobLinks,
  templateChoice,
  toSourceField,
  CUSTOM_TEMPLATE,
  DEFAULT_TEMPLATE,
} from "@/domain/sources";
import { SOURCES_ADD_HREF } from "@/features/shell/navigation";
import { scheduleText } from "@/features/sources/labels";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
const platform = (overrides: Partial<Platform> = {}): Platform => ({
  id: 1,
  name: "StepStone",
  url: "https://www.stepstone.de/jobs",
  is_active: true,
  setup_status: "active",
  ...overrides,
});
const run = (error: string | null) => ({ finished_at: "2026-10-08T06:00:00+00:00", error });

describe("URL state", () => {
  it("builds the onboarding link and a source link, add winning", () => {
    expect(sourcesHref({ add: true })).toBe(SOURCES_ADD_HREF);
    expect(sourcesHref({ sourceId: 7 })).toBe("/sources?quelle=7");
    expect(sourcesHref({ sourceId: 7, add: true })).toBe("/sources?add=1");
    expect(sourcesHref()).toBe("/sources");
  });

  it("reads only positive integer ids and add=1", () => {
    expect(["7", "0", "-1", "abc", "1.5", null].map(sourceIdFromParam)).toEqual([7, null, null, null, null, null]);
    expect([addFromParam("1"), addFromParam("true"), addFromParam(null)]).toEqual([true, false, false]);
  });
});

describe("source state", () => {
  it("orders running, setup, paused, failing, ok", () => {
    const failing = platform({ last_run: run("unreachable") });
    expect([
      sourceState(failing, true),
      sourceState(platform({ setup_status: "pending_setup" }), false),
      sourceState(platform({ is_active: false, last_run: run("failed") }), false),
      sourceState(failing, false),
      sourceState(platform(), false),
    ]).toEqual(["running", "setup", "paused", "failing", "ok"]);
  });

  it("a cancelled run is not an error, an unknown text is", () => {
    const list = [
      platform({ id: 1, name: "B", last_run: run("cancelled") }),
      platform({ id: 2, name: "A", last_run: run("Seite kaputt") }),
      platform({ id: 3, name: "C", last_run: run(null) }),
    ];
    expect(failingSources(list).map((p) => p.id)).toEqual([2]);
    expect(countFailingPlatforms(list)).toBe(1);
  });

  it("sorts by name, then id", () => {
    const list = [platform({ id: 3, name: "b" }), platform({ id: 2, name: "a" }), platform({ id: 1, name: "b" })];
    expect(sortSources(list).map((p) => p.id)).toEqual([2, 1, 3]);
  });
});

describe("schedule", () => {
  it("parses only HH:MM in range with real weekdays", () => {
    expect(scheduleOf({ schedule_time: "08:00", schedule_days: [4, 0, 0, 9] })).toEqual({ time: "08:00", days: [0, 4] });
    expect(scheduleOf({ schedule_time: "24:00", schedule_days: [0] })).toBeNull();
    expect(scheduleOf({ schedule_time: "08:00", schedule_days: [] })).toBeNull();
    expect(scheduleOf({ schedule_time: null, schedule_days: null })).toBeNull();
  });

  it("groups consecutive days", () => {
    expect(dayRuns([0, 1, 2, 3, 4])).toEqual([[0, 4]]);
    expect(dayRuns([5, 0, 2])).toEqual([[0, 0], [2, 2], [5, 5]]);
  });

  it("formats ranges and single days", () => {
    expect(scheduleText({ time: "08:00", days: [0, 1, 2, 3, 4] }, t)).toBe("Mo–Fr 08:00");
    expect(scheduleText({ time: "07:30", days: [0, 2] }, t)).toBe("Mo, Mi 07:30");
    expect(scheduleText({ time: "07:30", days: [5, 6] }, t)).toBe("Sa, So 07:30");
    expect(scheduleText({ time: "06:00", days: [0, 1, 2, 3, 4, 5, 6] }, t)).toBe("täglich 06:00");
    expect(scheduleText(null, t)).toBe("Nur manuell");
  });
});

describe("wizard links", () => {
  const links = [
    { url: "https://x.de/jobsuche/p/java-1", text: "Java" },
    { url: "https://x.de/jobsuche/p/kotlin-2", text: "Kotlin" },
    { url: "https://x.de/jobsuche/p/go-3", text: "Go" },
    { url: "https://x.de/unternehmen/top", text: "Unternehmen entdecken" },
    { url: "https://x.de/impressum", text: "Impressum" },
  ];

  it("preselects the largest group of similar links", () => {
    expect(suggestJobLinks(links)).toEqual(links.slice(0, 3).map((link) => link.url));
  });

  it("groups one-segment slugs by their first word (StepStone)", () => {
    const slugs = ["a--1-inline.html", "b--2-inline.html"].map((slug) => ({
      url: `https://www.stepstone.de/stellenangebote--${slug}`,
      text: slug,
    }));
    expect(suggestJobLinks([...slugs, { url: "https://www.stepstone.de/impressum", text: "" }])).toEqual(
      slugs.map((link) => link.url),
    );
  });

  it("falls back to deep links when no group has two", () => {
    const lonely = [{ url: "https://x.de/a/b/c", text: "" }, { url: "https://x.de/d", text: "" }];
    expect(suggestJobLinks(lonely)).toEqual(["https://x.de/a/b/c"]);
  });

  it("counts links containing the pattern and shows paths", () => {
    expect([matchingCount(links, " /jobsuche/p/ "), matchingCount(links, "")]).toEqual([3, 0]);
    expect(linkPath("https://x.de/jobs?q=1")).toBe("/jobs?q=1");
  });
});

describe("forms", () => {
  it("maps server fields and finds the first step with an error", () => {
    expect([toSourceField("schedule_days"), toSourceField("cv_data")]).toEqual(["schedule_days", null]);
    expect([firstErrorStep(["name", "url_pattern"]), firstErrorStep([])]).toEqual([2, null]);
  });

  it("splits recipients and flags an invalid one", () => {
    expect(parseRecipients(" a@x.de, b@y.de ;")).toEqual({ list: ["a@x.de", "b@y.de"], invalid: false });
    expect(parseRecipients("a@x.de, nope").invalid).toBe(true);
  });

  it("names the stored template: default, a listed one, or custom", () => {
    const templates = [{ id: 4, content: "Neu: $title" }];
    expect([
      templateChoice(null, templates),
      templateChoice("Neu: $title", templates),
      templateChoice("eigener Text", templates),
    ]).toEqual([DEFAULT_TEMPLATE, "4", CUSTOM_TEMPLATE]);
  });
});
```

Append to `web/tests/unit/domain/runLine.test.ts` (use its existing platform helper; read the file first):

```ts
it("a seed run counts nothing below the threshold and says so", () => {
  const seeded = lastRunOf({ ...SOME_PLATFORM, last_run: { finished_at: "2026-10-08T06:00:00+00:00", found: 40, new: 40, matched: 0, seeded: true } });
  expect([seeded?.seeded, seeded?.below]).toEqual([true, 0]);
});
```

(Replace `SOME_PLATFORM` with the file's own fixture name.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/sources.test.ts tests/unit/domain/runLine.test.ts`
Expected: FAIL: unresolved `@/domain/sources` and `@/features/sources/labels`; `lastRunOf` is not exported.

- [ ] **Step 3: Dictionary keys**

`de.ts` / `en.ts` (same order, before the closing brace):

```ts
  "sources.state.running": "Läuft",                       // "Running"
  "sources.state.setup": "Nicht eingerichtet",            // "Not set up"
  "sources.state.paused": "Pausiert",                     // "Paused"
  "sources.state.failing": "Fehler",                      // "Error"
  "sources.state.ok": "In Ordnung",                       // "OK"
  "sources.channel.pushover": "Pushover",                 // "Pushover"
  "sources.channel.resend": "Resend",                     // "Resend"
  "sources.channel.mailjet": "Mailjet",                   // "Mailjet"
  "sources.channel.smtp": "SMTP",                         // "SMTP"
  "weekday.0": "Mo",                                      // "Mon"
  "weekday.1": "Di",                                      // "Tue"
  "weekday.2": "Mi",                                      // "Wed"
  "weekday.3": "Do",                                      // "Thu"
  "weekday.4": "Fr",                                      // "Fri"
  "weekday.5": "Sa",                                      // "Sat"
  "weekday.6": "So",                                      // "Sun"
  "sources.schedule.manual": "Nur manuell",               // "Manual only"
  "sources.schedule.daily": "täglich {time}",             // "daily {time}"
  "sources.schedule.days": "{days} {time}",               // "{days} {time}"
  "sources.run.never": "Noch nicht durchsucht",           // "Not searched yet"
  "sources.run.seeded": "{found} als bekannt gemerkt",    // "{found} marked as known"
  "sources.run.failed": "fehlgeschlagen ({reason})",      // "failed ({reason})"
  "sources.run.cancelled": "abgebrochen",                 // "cancelled"
  "sources.first.seed": "Bekannte Stellen merken",        // "Remember current postings"
  "sources.first.seedHint":
    "Alles, was heute gelistet ist, gilt als bekannt. Ab dem nächsten Lauf kommen nur neue Stellen.",
    // "Everything listed today counts as known. From the next run on, only new postings come in."
  "sources.first.analyze": "Jetzt durchsuchen und alles bewerten", // "Search now and score everything"
  "sources.first.analyzeHint": "Jede gefundene Stelle wird mit KI bewertet; das kann dauern.",
    // "Every posting found is scored by AI; this can take a while."
  "sources.first.none": "Noch nicht durchsuchen",         // "Do not search yet"
  "sources.first.noneHint": "Der erste Lauf startet mit dem Zeitplan oder mit „Durchsuchen“.",
    // "The first run starts with the schedule or with “Search”."
```

(The `//` text is the EN value for `en.ts`; dictionaries contain no comments.)

- [ ] **Step 4: `domain/runLine.ts`**

- Export `isScheduleTime(text: string): boolean` (`SCHEDULE_TIME.test(text)`) and use it in `nextSlot`.
- Add `export function isFailedRun(code: RunErrorCode | null): boolean { return code !== null && code !== "cancelled"; }` with the comment "D3: the user's own cancel is not a failure.".
- Move `RUN_ERROR_LABEL` from `features/inbox/RunLine.tsx` here (export it; `import type { MessageKey } from "@/i18n/de"`); `RunLine.tsx` imports it.
- `LastRun` gains `seeded: boolean`. Split the private `toLastRun` into an exported `summarizeRun(run): RunSummary | null` (input: any object with `finished_at`, `found`, `new`, `matched`, `seeded`, `error`, each nullish, so it reads both `platform.last_run` and a `PlatformRun` of the history; `RunSummary = Omit<LastRun, "source">`, null without a parseable `finished_at`) and an exported `lastRunOf(platform): LastRun | null` (`summarizeRun(platform.last_run)` plus `source: platform.name`); `toLastRun` becomes `(platform) => lastRunOf(platform) ?? []`. In `summarizeRun`: `const seeded = run.seeded === true;` and `const below = seeded ? 0 : Math.max(0, (run.new ?? 0) - matched);` with the comment "G5: a seed run saved unanalysed jobs; none of them is below the threshold yet.". Keep each function at 20 lines or less.

- [ ] **Step 5: `domain/sources.ts`**

```ts
import type { Platform } from "@/api/platforms";
import { isFailedRun, isScheduleTime, runErrorCode } from "./runLine";

export const SOURCES_PATH = "/sources";
export const SOURCE_PARAM = "quelle";
export const ADD_PARAM = "add";
const ADD_VALUE = "1";
const POSITIVE_INT = /^[1-9]\d*$/;

export interface SourcesLocation {
  sourceId?: number | null;
  add?: boolean;
}

/** D1: one overlay at a time; the wizard wins over a drawer. */
export function sourcesHref({ sourceId, add }: SourcesLocation = {}): string {
  const params = new URLSearchParams();
  if (add) params.set(ADD_PARAM, ADD_VALUE);
  else if (sourceId) params.set(SOURCE_PARAM, String(sourceId));
  const query = params.toString();
  return query ? `${SOURCES_PATH}?${query}` : SOURCES_PATH;
}

export function sourceIdFromParam(value: string | null): number | null {
  return value && POSITIVE_INT.test(value) ? Number(value) : null;
}

export function addFromParam(value: string | null): boolean {
  return value === ADD_VALUE;
}

export type SourceState = "running" | "setup" | "paused" | "failing" | "ok";
/** Legacy rows from the old wizard (D15); the server refuses to crawl them. */
export const PENDING_SETUP = "pending_setup";

export function isFailingSource(platform: Pick<Platform, "last_run">): boolean {
  return isFailedRun(runErrorCode(platform.last_run?.error));
}

/** D15, in priority order. */
export function sourceState(platform: Platform, running: boolean): SourceState {
  if (running) return "running";
  if (platform.setup_status === PENDING_SETUP) return "setup";
  if (!platform.is_active) return "paused";
  return isFailingSource(platform) ? "failing" : "ok";
}

export function canCrawl(state: SourceState): boolean {
  return state === "ok" || state === "failing";
}

export function sortSources<P extends Pick<Platform, "id" | "name">>(platforms: readonly P[]): P[] {
  return [...platforms].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

/** D3: the banner list; the nav badge counts the same rule (countFailingPlatforms). */
export function failingSources(platforms: readonly Platform[]): Platform[] {
  return sortSources(platforms.filter(isFailingSource));
}

export interface Schedule {
  time: string;
  days: number[];
}

/** Server weekday indices: 0 = Monday (workers/tasks/scheduling.py). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** D6: what switching the schedule on starts from (the old UI's default). */
export const DEFAULT_SCHEDULE: Schedule = { time: "08:00", days: [0, 1, 2, 3, 4] };

const isWeekday = (day: number) => (WEEKDAYS as readonly number[]).includes(day);

/** A schedule the scheduler would run, or null ("Nur manuell"). Wall time of the profile zone. */
export function scheduleOf(
  platform: Pick<Platform, "schedule_time" | "schedule_days">,
): Schedule | null {
  const time = platform.schedule_time ?? "";
  const days = [...new Set((platform.schedule_days ?? []).filter(isWeekday))].sort((a, b) => a - b);
  return isScheduleTime(time) && days.length > 0 ? { time, days } : null;
}

/** Consecutive weekdays as [first, last]: Mo-Fr -> [[0, 4]]. */
export function dayRuns(days: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const day of [...days].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

export interface LinkLike {
  url: string;
  text: string;
}

const MIN_GROUP = 2;
const DEEP_PATH = 3;
const SLUG_DELIMITER = /[-_.]/;
const ROOT = "/";

function parsed(url: string): URL | null {
  return URL.canParse(url) ? new URL(url) : null;
}

/** Links of one kind share their first path segments ("/jobsuche/p") or, for slugs, the first word. */
function groupKey(url: URL): string {
  if (url.search) return url.pathname;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return `/${(segments[0] ?? "").split(SLUG_DELIMITER)[0]}`;
  return `/${segments.slice(0, Math.min(2, segments.length - 1)).join("/")}`;
}

function groupLinks(links: readonly LinkLike[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const link of links) {
    const url = parsed(link.url);
    const key = url ? groupKey(url) : ROOT;
    if (key !== ROOT) groups.set(key, [...(groups.get(key) ?? []), link.url]);
  }
  return [...groups.values()];
}

/** D10 step 2 preselection (the old wizard's heuristic, inventory C.2). */
export function suggestJobLinks(links: readonly LinkLike[]): string[] {
  const largest = groupLinks(links).reduce<string[]>((best, group) => (group.length > best.length ? group : best), []);
  if (largest.length >= MIN_GROUP) return largest;
  return links.filter((link) => pathDepth(link.url) >= DEEP_PATH).map((link) => link.url);
}

function pathDepth(url: string): number {
  return parsed(url)?.pathname.split("/").filter(Boolean).length ?? 0;
}

/** The crawl filter's own test (`pattern in url`); an empty pattern matches nothing here. */
export function matchingCount(links: readonly LinkLike[], pattern: string): number {
  const text = pattern.trim();
  return text ? links.filter((link) => link.url.includes(text)).length : 0;
}

export function linkPath(url: string): string {
  const link = parsed(url);
  return link ? `${link.pathname}${link.search}` : url;
}

export const SOURCE_FIELDS = ["url", "selected_urls", "url_pattern", "name", "schedule_time", "schedule_days"] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];
export type WizardStep = 1 | 2 | 3;

/** For fieldErrorsFrom: server field names of a 422 that a sources form shows. */
export function toSourceField(serverField: string): SourceField | null {
  return (SOURCE_FIELDS as readonly string[]).includes(serverField) ? (serverField as SourceField) : null;
}

export const WIZARD_STEP_OF: Readonly<Record<SourceField, WizardStep>> = {
  url: 1,
  selected_urls: 2,
  url_pattern: 2,
  name: 3,
  schedule_time: 3,
  schedule_days: 3,
};

/** D10: a rejected setup jumps to the earliest step that holds a field error. */
export function firstErrorStep(fields: readonly SourceField[]): WizardStep | null {
  const steps = fields.map((field) => WIZARD_STEP_OF[field]);
  return steps.length > 0 ? (Math.min(...steps) as WizardStep) : null;
}

const RECIPIENT_SEPARATOR = /[,;\s]+/;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseRecipients(text: string): { list: string[]; invalid: boolean } {
  const list = text.split(RECIPIENT_SEPARATOR).filter(Boolean);
  return { list, invalid: list.some((address) => !EMAIL.test(address)) };
}

export const DEFAULT_TEMPLATE = "default";
export const CUSTOM_TEMPLATE = "custom";

/** D7: the platform stores template content; this names which choice the select shows for it. */
export function templateChoice(
  content: string | null | undefined,
  templates: readonly { id: number; content: string }[],
): string {
  if (!content) return DEFAULT_TEMPLATE;
  const match = templates.find((template) => template.content === content);
  return match ? String(match.id) : CUSTOM_TEMPLATE;
}
```

`api/platforms.ts`: `countFailingPlatforms` becomes `return platforms.filter(isFailingSource).length;` (import from `@/domain/sources`; doc comment "Sources badge (D3): the same rule as the banner; cancelled is not an error.").

- [ ] **Step 6: `features/sources/labels.ts`**

```ts
import type { InitialRun, NotifyChannel } from "@/api/platformPaths";
import { dayRuns, type Schedule, type SourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

export const SOURCE_STATE_LABEL: Readonly<Record<SourceState, MessageKey>> = {
  running: "sources.state.running",
  setup: "sources.state.setup",
  paused: "sources.state.paused",
  failing: "sources.state.failing",
  ok: "sources.state.ok",
};

export const CHANNEL_LABEL: Readonly<Record<NotifyChannel, MessageKey>> = {
  PUSHOVER: "sources.channel.pushover",
  RESEND: "sources.channel.resend",
  MAILJET: "sources.channel.mailjet",
  SMTP: "sources.channel.smtp",
};

export const INITIAL_RUN_LABEL: Readonly<Record<InitialRun, { title: MessageKey; hint: MessageKey }>> = {
  seed: { title: "sources.first.seed", hint: "sources.first.seedHint" },
  analyze: { title: "sources.first.analyze", hint: "sources.first.analyzeHint" },
  none: { title: "sources.first.none", hint: "sources.first.noneHint" },
};

export const WEEKDAY_LABEL: readonly MessageKey[] = [
  "weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6",
];

const ALL_DAYS = 7;
const RANGE_FROM = 3;
// Punctuation, not words: the same in both languages.
const RANGE = "–";
const LIST = ", ";

function runText([first, last]: [number, number], t: Translate): string {
  const day = (index: number) => t(WEEKDAY_LABEL[index]!);
  if (last - first + 1 >= RANGE_FROM) return `${day(first)}${RANGE}${day(last)}`;
  return first === last ? day(first) : `${day(first)}${LIST}${day(last)}`;
}

/** D6: "Mo–Fr 08:00", "Mo, Mi 07:30", "täglich 06:00", "Nur manuell". */
export function scheduleText(schedule: Schedule | null, t: Translate): string {
  if (!schedule) return t("sources.schedule.manual");
  if (schedule.days.length === ALL_DAYS) return t("sources.schedule.daily", { time: schedule.time });
  const days = dayRuns(schedule.days).map((run) => runText(run, t)).join(LIST);
  return t("sources.schedule.days", { days, time: schedule.time });
}
```

- [ ] **Step 7: Run them to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/features/inbox`
Expected: PASS (the inbox run line tests keep passing with `RUN_ERROR_LABEL` moved).

- [ ] **Step 8: Format and checkpoint**

Format, then the checkpoint. Expected: all five green (the shell's "1 Fehler" badge is unchanged with the canonical fixtures: Indeed failed with `unreachable`).

---
### Task 7: Quellen frame: route, masthead, error banner, list rows, list states, URL state

**Files:**
- Create: `web/src/features/sources/SourcesPage.tsx`, `useSourcesUrl.ts`, `useFocusFallback.ts`, `SourcesHeader.tsx`, `FailingBanner.tsx`, `SourceList.tsx`, `SourceRow.tsx`, `RunCell.tsx`, `StatusTag.tsx`, `sources.css`; `web/tests/unit/features/sources/sourcesPage.test.tsx`, `web/tests/unit/theme/sourcesStyles.test.ts`, `web/tests/e2e/support/sourcesServer.ts`, `web/tests/e2e/sources.spec.ts`
- Modify: `web/app/(app)/sources/page.tsx`, `web/app/globals.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/e2e/shell.spec.ts` (drop `["/sources", "Quellen"]` from the placeholder routes)

**Interfaces:**
- Consumes: Task 5 (`platformsQueryOptions`, `channelStatusQueryOptions`, `notificationTemplatesQueryOptions`, `profileTimezoneQueryOptions`, `ActivityTask.platformId`, `useActivity`), Task 6 (`sourcesHref`, `sourceIdFromParam`, `addFromParam`, `sourceState`, `failingSources`, `sortSources`, `scheduleOf`, `lastRunOf`, `RUN_ERROR_LABEL`, `scheduleText`, `SOURCE_STATE_LABEL`), `listPhase`, `ListLoading`, `ListError`, `Masthead`, `MASTHEAD_TITLE_SELECTOR`, `EmptyState`, `Notice`, `Button`, `formatDayTime`, `hostOf`, `navNumber`.
- Produces: `SourcesPage` (renders, from Task 8 on, the action cell; from Task 9 the drawer; from Task 12 the wizard), `useSourcesUrl(): SourcesUrl { sourceId: number | null; adding: boolean; openSource(id): void; openWizard(): void; close(): void }`, `focusSourceOrTitle(sourceId: number | null): void`, `sourceLinkId(id): string`, `SOURCES_LIST_ID = "sources-list"`, `SourceRow({ platform, task })` with an action slot `SourceRowProps.action?: ReactNode` (Task 8 passes the button), `RunCell({ platform })`, `StatusTag({ state })`, `runningTaskOf(activity, platformId): ActivityTask | null`. E2E: `SourcesServer` (`list()`, `crawlStatus()`, `get(id)`), `sourcesRoutes(server?, extra?)`, `CHANNELS`, `TEMPLATES`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/sourcesPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBody } from "@/api/platforms";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const STEPSTONE: PlatformBody = {
  id: 1,
  name: "StepStone",
  url: "https://www.stepstone.de/jobs/kotlin",
  schedule_time: "14:00",
  schedule_days: [0, 1, 2, 3, 4],
  last_run: { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3, error: null },
};
const INDEED: PlatformBody = {
  id: 2,
  name: "Indeed",
  url: "https://de.indeed.com/jobs?q=kotlin",
  last_run: { finished_at: "2026-10-07T06:00:00+00:00", found: 0, new: 0, matched: 0, error: "unreachable" },
};
const RUNNING = { job_id: "c1", platform: STEPSTONE.url, platform_id: 1, status: "crawling", total: 12, scraping_completed: 5 };

function stubs(platforms: unknown = [STEPSTONE, INDEED], extra: RouteTable = {}) {
  return stubRoutes({
    "GET /platforms": platforms,
    "GET /scraper/crawl-status": { jobs: [] },
    "GET /notification-settings/channels": {},
    "GET /notification-templates": [],
    "GET /settings": { timezone: "Europe/Berlin" },
    ...extra,
  });
}

const rows = async () =>
  within(await screen.findByRole("list", { name: "Deine Quellen" })).getAllByRole("listitem");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Quellen list", () => {
  it("lists sources by name with schedule, last run and status", async () => {
    stubs();
    renderWithProviders(<SourcesPage />);
    const [indeed, stepstone] = await rows();
    expect(within(indeed!).getByRole("link").textContent).toBe("Indeed");
    expect(indeed).toHaveTextContent("Nur manuell");
    expect(indeed).toHaveTextContent("fehlgeschlagen (Seite nicht erreichbar)");
    expect(stepstone).toHaveTextContent("Mo–Fr 14:00");
    expect(stepstone).toHaveTextContent("12 gefunden, 3 passend, 2 unter Schwellwert");
    expect(stepstone).toHaveTextContent("In Ordnung");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Quellen");
    expect(screen.getByText("2 Quellen, 1 mit Fehler.")).toBeInTheDocument();
  });

  it("names failing sources in one banner and opens a source from it", async () => {
    stubs();
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Indeed: Seite nicht erreichbar, gestern/ }));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources?quelle=2", { scroll: false });
    expect(screen.getByText("Eine Quelle meldet einen Fehler.")).toBeInTheDocument();
  });

  it("a cancelled run is no error", async () => {
    stubs([{ ...INDEED, last_run: { ...INDEED.last_run, error: "cancelled" } }]);
    renderWithProviders(<SourcesPage />);
    const [indeed] = await rows();
    expect(indeed).toHaveTextContent("abgebrochen");
    expect(screen.queryByText(/einen Fehler/)).toBeNull();
  });

  it("shows a running crawl as running", async () => {
    stubs(undefined, { "GET /scraper/crawl-status": { jobs: [RUNNING] } });
    renderWithProviders(<SourcesPage />);
    const [, stepstone] = await rows();
    await waitFor(() => expect(stepstone).toHaveTextContent("Läuft"));
  });

  it("drops an unknown source id from the URL", async () => {
    liveNavigation.reset("quelle=999");
    stubs();
    renderWithProviders(<SourcesPage />);
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }));
  });

  it("starts all page queries at once, without waiting for the list", async () => {
    const calls = stubs(() => new Promise(() => {}));
    renderWithProviders(<SourcesPage />);
    await waitFor(() =>
      expect(calls.map((call) => new URL(call.url).pathname).sort()).toEqual(
        ["/notification-settings/channels", "/notification-templates", "/platforms", "/scraper/crawl-status", "/settings"],
      ),
    );
  });

  it("offers the first source when there is none", async () => {
    stubs([]);
    renderWithProviders(<SourcesPage />);
    expect(await screen.findByRole("heading", { name: "Erste Quelle hinzufügen" })).toBeInTheDocument();
    expect(screen.getByText("Noch keine Quelle.")).toBeInTheDocument();
  });
});
```

`web/tests/unit/theme/sourcesStyles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/sources/sources.css"), "utf8");

describe("sources.css", () => {
  it("lays the rows out by the width of the main column, not the viewport", () => {
    expect(css).toMatch(/container:\s*sources\s*\/\s*inline-size/);
    expect(css).toMatch(/@container sources \(max-width: 719px\)/);
    expect(css).not.toMatch(/@media/);
  });

  it("uses no text size below 13 px", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect([...css.matchAll(/font-size:\s*(\d+)px/g)].every((match) => Number(match[1]) >= 13)).toBe(true);
  });

  it("gives touch targets 44 px in the narrow layout", () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources tests/unit/theme/sourcesStyles.test.ts`
Expected: FAIL: unresolved `@/features/sources/SourcesPage`; `sources.css` not found.

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.deck.none": "Noch keine Quelle.",                       // "No sources yet."
  "sources.deck.fineOne": "1 Quelle, in Ordnung.",                  // "1 source, fine."
  "sources.deck.fine": "{count} Quellen, alle in Ordnung.",         // "{count} sources, all fine."
  "sources.deck.failingOne": "1 Quelle mit Fehler.",                // "1 source with an error."
  "sources.deck.failing": "{count} Quellen, {failing} mit Fehler.", // "{count} sources, {failing} with errors."
  "sources.list": "Deine Quellen",                                  // "Your sources"
  "sources.col.source": "Quelle",                                   // "Source"
  "sources.col.schedule": "Zeitplan",                               // "Schedule"
  "sources.col.lastRun": "Letzter Lauf",                            // "Last run"
  "sources.col.status": "Status",                                   // "Status"
  "sources.banner.titleOne": "Eine Quelle meldet einen Fehler.",     // "One source reports an error."
  "sources.banner.title": "{count} Quellen melden einen Fehler.",    // "{count} sources report an error."
  "sources.banner.item": "{name}: {reason}, {when}",                // "{name}: {reason}, {when}"
  "sources.run.item": "{when}: {result}",                           // "{when}: {result}"
```

- [ ] **Step 4: URL state and focus fallback**

`useSourcesUrl.ts`:

```ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ADD_PARAM, addFromParam, SOURCE_PARAM, sourceIdFromParam, sourcesHref } from "@/domain/sources";

export interface SourcesUrl {
  sourceId: number | null;
  adding: boolean;
  openSource: (id: number) => void;
  openWizard: () => void;
  close: () => void;
}

/** D1: the open drawer and the wizard live in the query string; replace keeps Back for leaving. */
export function useSourcesUrl(): SourcesUrl {
  const params = useSearchParams();
  const router = useRouter();
  const go = (href: string) => router.replace(href, { scroll: false });
  const adding = addFromParam(params.get(ADD_PARAM));
  return {
    sourceId: adding ? null : sourceIdFromParam(params.get(SOURCE_PARAM)),
    adding,
    openSource: (id) => go(sourcesHref({ sourceId: id })),
    openWizard: () => go(sourcesHref({ add: true })),
    close: () => go(sourcesHref()),
  };
}
```

`useFocusFallback.ts`:

```ts
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";

export const SOURCES_LIST_ID = "sources-list";

export function sourceLinkId(id: number): string {
  return `source-link-${id}`;
}

function fallbackTarget(sourceId: number | null): HTMLElement | null {
  const row = sourceId === null ? null : document.getElementById(sourceLinkId(sourceId));
  return row ?? document.querySelector<HTMLElement>(MASTHEAD_TITLE_SELECTOR);
}

/**
 * An overlay opened by a deep link (or whose source was deleted) has no trigger to return focus to,
 * so ModalLayer leaves it on <body>. One frame later, put it on the source's row, else the title.
 */
export function focusSourceOrTitle(sourceId: number | null): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    fallbackTarget(sourceId)?.focus();
  });
}
```

- [ ] **Step 5: Page frame and header**

`SourcesPage.tsx`:

```tsx
"use client";

import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { channelStatusQueryOptions, notificationTemplatesQueryOptions } from "@/api/notifications";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { profileTimezoneQueryOptions } from "@/api/settings";
import { FailingBanner } from "./FailingBanner";
import { SourceList } from "./SourceList";
import { SourcesHeader } from "./SourcesHeader";
import { useSourcesUrl, type SourcesUrl } from "./useSourcesUrl";

/** Constraint "queries start in parallel": the drawer's data is asked for with the list. */
function usePrefetchSources(): void {
  usePrefetchQuery(platformsQueryOptions());
  usePrefetchQuery(channelStatusQueryOptions());
  usePrefetchQuery(notificationTemplatesQueryOptions());
  usePrefetchQuery(profileTimezoneQueryOptions());
}

/** D1: an id that is not (or no longer) a listed source opens nothing and leaves the URL. */
function useDropUnknownSource(url: SourcesUrl, platforms: readonly Platform[] | undefined): void {
  const unknown = url.sourceId !== null && platforms !== undefined && !platforms.some((p) => p.id === url.sourceId);
  const { close } = url;
  useEffect(() => {
    if (unknown) close();
  }, [unknown, close]);
}

export function SourcesPage() {
  usePrefetchSources();
  const url = useSourcesUrl();
  const platforms = useQuery(platformsQueryOptions());
  useDropUnknownSource(url, platforms.data);
  return (
    <div className="page sources">
      <SourcesHeader platforms={platforms.data} onAdd={url.openWizard} />
      <FailingBanner platforms={platforms.data ?? []} onOpen={url.openSource} />
      <SourceList query={platforms} onAdd={url.openWizard} />
    </div>
  );
}
```

`close` from `useSourcesUrl` is a new function per render; wrap the three callbacks of `useSourcesUrl` in `useCallback` keyed on `router` if the effect re-runs (lint `react-hooks/exhaustive-deps` must stay clean; never disable it).

`app/(app)/sources/page.tsx`:

```tsx
import { Suspense } from "react";
import { SourcesPage } from "@/features/sources/SourcesPage";

export default function SourcesRoute() {
  // The open drawer and the wizard live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <SourcesPage />
    </Suspense>
  );
}
```

`SourcesHeader.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { failingSources } from "@/domain/sources";
import { navNumber } from "@/features/shell/navigation";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Masthead } from "@/ui/Masthead";

/** D14 deck: how many sources, and how many of them failed. */
export function sourcesDeck(platforms: readonly Platform[], t: Translate): string {
  const count = platforms.length;
  const failing = failingSources(platforms).length;
  if (count === 0) return t("sources.deck.none");
  if (failing === 0) return count === 1 ? t("sources.deck.fineOne") : t("sources.deck.fine", { count });
  return count === 1 ? t("sources.deck.failingOne") : t("sources.deck.failing", { count, failing });
}

export function SourcesHeader({ platforms, onAdd }: { platforms?: Platform[]; onAdd: () => void }) {
  const { t } = useI18n();
  // While loading, "Lädt …" holds the deck's line, so nothing jumps when the list arrives.
  const deck = platforms ? sourcesDeck(platforms, t) : t("loading");
  const action = (
    <Button variant="primary" icon={Plus} onClick={onAdd}>
      {t("onboard.source.action")}
    </Button>
  );
  return <Masthead number={navNumber("sources")} title={t("nav.sources")} deck={deck} actions={action} />;
}
```

- [ ] **Step 6: Banner, list, rows**

`FailingBanner.tsx`:

```tsx
"use client";

import type { Platform } from "@/api/platforms";
import { lastRunOf, RUN_ERROR_LABEL } from "@/domain/runLine";
import { failingSources } from "@/domain/sources";
import { formatDayTime } from "@/i18n/formatDayTime";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Notice } from "@/ui/Notice";

interface BannerProps {
  platforms: readonly Platform[];
  onOpen: (id: number) => void;
}

/** D3: failing sources on top, crimson with icon and words; a state, so not announced on load. */
export function FailingBanner({ platforms, onOpen }: BannerProps) {
  const { t } = useI18n();
  const failing = failingSources(platforms);
  if (failing.length === 0) return null;
  const title = failing.length === 1 ? t("sources.banner.titleOne") : t("sources.banner.title", { count: failing.length });
  return (
    <div className="src-banner">
      <Notice tone="error" announce={false}>
        <p className="src-banner-title">{title}</p>
        <ul className="src-banner-list">
          {failing.map((platform) => (
            <BannerItem key={platform.id} platform={platform} onOpen={onOpen} />
          ))}
        </ul>
      </Notice>
    </div>
  );
}

function BannerItem({ platform, onOpen }: { platform: Platform; onOpen: (id: number) => void }) {
  const { t, language } = useI18n();
  const now = useNow();
  const run = lastRunOf(platform);
  if (!run?.error) return null;
  const when = formatDayTime(run.finishedAt, t, { now, language });
  const text = t("sources.banner.item", { name: platform.name, reason: t(RUN_ERROR_LABEL[run.error]), when });
  return (
    <li>
      <button type="button" className="link" onClick={() => onOpen(platform.id)}>
        {text}
      </button>
    </li>
  );
}
```

`SourceList.tsx`:

```tsx
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Globe, Plus } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { listPhase } from "@/domain/inbox";
import { sortSources } from "@/domain/sources";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityState, ActivityTask } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { SourceRow } from "./SourceRow";
import { SOURCES_LIST_ID } from "./useFocusFallback";

interface SourceListProps {
  query: UseQueryResult<Platform[]>;
  onAdd: () => void;
}

/** The running crawl of a source (D2: from the activity cache, no polling). */
export function runningTaskOf(activity: ActivityState, platformId: number): ActivityTask | null {
  return activity.running.find((task) => task.platformId === platformId) ?? null;
}

export function SourceList({ query, onAdd }: SourceListProps) {
  const phase = listPhase({
    hasData: query.data !== undefined,
    isError: query.isError,
    failureCount: query.failureCount,
    itemCount: query.data?.length ?? 0,
  });
  if (phase === "loading" || phase === "stalled") return <ListLoading stalled={phase === "stalled"} />;
  if (phase === "error") return <ListError error={query.error} onRetry={() => void query.refetch()} />;
  if (phase === "empty") return <SourcesEmpty onAdd={onAdd} />;
  return <SourceRows platforms={query.data ?? []} />;
}

function SourceRows({ platforms }: { platforms: Platform[] }) {
  const { t } = useI18n();
  const activity = useActivity(true);
  return (
    <section className="src-table">
      <div className="src-head" aria-hidden="true">
        <span>{t("sources.col.source")}</span>
        <span>{t("sources.col.schedule")}</span>
        <span>{t("sources.col.lastRun")}</span>
        <span>{t("sources.col.status")}</span>
      </div>
      <ul id={SOURCES_LIST_ID} className="src-rows" aria-label={t("sources.list")}>
        {sortSources(platforms).map((platform) => (
          <SourceRow key={platform.id} platform={platform} task={runningTaskOf(activity, platform.id)} />
        ))}
      </ul>
    </section>
  );
}

function SourcesEmpty({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const action = (
    <Button variant="primary" icon={Plus} onClick={onAdd}>
      {t("onboard.source.action")}
    </Button>
  );
  return (
    <EmptyState icon={Globe} title={t("onboard.source.title")} actions={action}>
      {t("onboard.source.text")}
    </EmptyState>
  );
}
```

`SourceRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Platform } from "@/api/platforms";
import { hostOf } from "@/domain/links";
import { scheduleOf, sourcesHref, sourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityTask } from "@/realtime/activity";
import { scheduleText } from "./labels";
import { RunCell } from "./RunCell";
import { StatusTag } from "./StatusTag";
import { sourceLinkId } from "./useFocusFallback";

export interface SourceRowProps {
  platform: Platform;
  task: ActivityTask | null;
  /** The last-run cell while a crawl runs (Task 8: inline progress). */
  progress?: ReactNode;
  /** The action cell (Task 8: Durchsuchen). */
  action?: ReactNode;
}

/** One focusable link per row (spec 4.3 #5); the action sits in its own cell, never inside the link. */
export function SourceRow({ platform, task, progress, action }: SourceRowProps) {
  const { t } = useI18n();
  return (
    <li className="src-row">
      <div className="src-cell src-name-cell">
        <Link id={sourceLinkId(platform.id)} className="src-name" href={sourcesHref({ sourceId: platform.id })} replace scroll={false}>
          {platform.name}
        </Link>
        <span className="src-host">{hostOf(platform.url) ?? platform.url}</span>
      </div>
      <Cell label="sources.col.schedule">{scheduleText(scheduleOf(platform), t)}</Cell>
      <Cell label="sources.col.lastRun">{task && progress ? progress : <RunCell platform={platform} />}</Cell>
      <Cell label="sources.col.status">
        <StatusTag state={sourceState(platform, task !== null)} />
      </Cell>
      <div className="src-cell src-action">{action}</div>
    </li>
  );
}

/** The label is visible in the narrow layout and read by screen readers in both (the head is aria-hidden). */
function Cell({ label, children }: { label: MessageKey; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="src-cell">
      <span className="src-label">{t(label)}: </span>
      {children}
    </div>
  );
}
```

`RunCell.tsx`:

```tsx
"use client";

import { CircleAlert } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { lastRunOf, RUN_ERROR_LABEL, type RunSummary } from "@/domain/runLine";
import { formatDayTime } from "@/i18n/formatDayTime";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Icon } from "@/ui/Icon";

/** The result part of a run (also used by the drawer history, Task 11). */
export function runResult(run: RunSummary, t: Translate): string {
  if (run.error === "cancelled") return t("sources.run.cancelled");
  if (run.error) return t("sources.run.failed", { reason: t(RUN_ERROR_LABEL[run.error]) });
  if (run.seeded) return t("sources.run.seeded", { found: run.found });
  return t("runline.counts", { found: run.found, matched: run.matched, below: run.below });
}

/** D14: when it ran and what it found; a failure in crimson with icon and words. */
export function RunCell({ platform }: { platform: Platform }) {
  const { t, language } = useI18n();
  const now = useNow();
  const run = lastRunOf(platform);
  if (!run) return <span className="muted">{t("sources.run.never")}</span>;
  const text = t("sources.run.item", { when: formatDayTime(run.finishedAt, t, { now, language }), result: runResult(run, t) });
  if (!run.error || run.error === "cancelled") return <span>{text}</span>;
  return (
    <span className="t-danger src-run-error">
      <Icon icon={CircleAlert} />
      <span>{text}</span>
    </span>
  );
}
```

`StatusTag.tsx`:

```tsx
"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import type { SourceState } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { SOURCE_STATE_LABEL } from "./labels";

/** A static tag (usability #15: hairline, no fill); the spinner is the one moving indicator, a running crawl. */
export function StatusTag({ state }: { state: SourceState }) {
  const { t } = useI18n();
  return (
    <span className={cx("src-status", `src-status-${state}`, state === "failing" && "t-danger")}>
      {state === "running" ? <Icon icon={LoaderCircle} className="spin" /> : null}
      {state === "failing" ? <Icon icon={CircleAlert} /> : null}
      <span>{t(SOURCE_STATE_LABEL[state])}</span>
    </span>
  );
}
```

- [ ] **Step 7: Styles**

`src/features/sources/sources.css` (import it in `app/globals.css` after `applications.css`):

```css
@layer components {
  /* The row layout follows the main column, which the sidebar narrows, so it is a container query. */
  .sources {
    container: sources / inline-size;
  }
  .src-banner {
    margin-bottom: 24px;
  }
  .src-banner-title {
    font-weight: 600;
  }
  .src-banner-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: var(--fs-13);
  }
  .src-head,
  .src-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 2.4fr) minmax(0, 1fr) 48px;
    gap: 16px;
    align-items: center;
  }
  .src-head {
    padding: 0 0 8px;
    border-bottom: 1px solid var(--line-strong);
    font-size: var(--fs-13);
    color: var(--text-2);
    font-weight: 600;
  }
  .src-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .src-row {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-13);
  }
  .src-name-cell {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .src-name {
    font-weight: 600;
    font-size: var(--fs-15, 15px);
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .src-host {
    color: var(--text-2);
    overflow-wrap: anywhere;
  }
  .src-cell {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .src-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .src-run-error {
    display: inline-flex;
    gap: 6px;
    align-items: flex-start;
  }
  .src-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-sm, 4px);
    color: var(--text-2);
  }
  .src-status-running {
    color: var(--text);
  }
  .src-action {
    display: flex;
    justify-content: flex-end;
  }

  @container sources (max-width: 719px) {
    .src-head {
      display: none;
    }
    .src-row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "name action" "schedule schedule" "run run" "status status";
      gap: 6px 12px;
    }
    .src-name-cell {
      grid-area: name;
    }
    .src-row > .src-cell:nth-child(2) {
      grid-area: schedule;
    }
    .src-row > .src-cell:nth-child(3) {
      grid-area: run;
    }
    .src-row > .src-cell:nth-child(4) {
      grid-area: status;
    }
    .src-action {
      grid-area: action;
    }
    .src-label {
      position: static;
      width: auto;
      height: auto;
      clip-path: none;
      color: var(--text-2);
    }
    .src-name,
    .src-banner-list .link,
    .src-action .btn {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
  }
}
```

Before writing it, check the token names against `src/theme/tokens.css` (`--line`, `--line-strong`, `--line-control`, `--text`, `--text-2`, the radius and `--fs-*` names) and use the real ones; drop a fallback value where the token exists. `--line-control` is the >= 3:1 boundary (phase 4 R10).

- [ ] **Step 8: E2E support: the sources fake server**

`web/tests/e2e/support/sourcesServer.ts`:

```ts
import type { CrawlStatusBody } from "../../../src/api/crawl";
import type { ChannelStatusBody, NotificationTemplateBody } from "../../../src/api/notifications";
import { CHANNEL_STATUS_PATH, NOTIFICATION_TEMPLATES_PATH, PLATFORMS_PATH } from "../../../src/api/platformPaths";
import type { PlatformBody } from "../../../src/api/platforms";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { live, type MockRoutes, type MutableRoutes } from "./mockApi";
import { PLATFORMS, RUNNING_CRAWL } from "./platformFixtures";

export const CHANNELS: ChannelStatusBody = { PUSHOVER: true, RESEND: false, MAILJET: false, SMTP: true };
export const TEMPLATES: NotificationTemplateBody[] = [
  { id: 4, name: "Kurz", type: "PUSHOVER", content: "$title bei $company ($match_score)", is_admin: false },
  { id: 5, name: "Wochenmail", type: "RESEND", content: "{{#jobs}}$title{{/jobs}}", is_admin: true },
];

interface Crawl {
  id: string;
  total: number;
  done: number;
}

/** What the server keeps for /sources: platforms and running crawls (server/routers/platforms.py rules). */
export class SourcesServer {
  protected readonly platforms = new Map<number, PlatformBody>();
  /** Platform id -> its running crawl, as the scraper's Redis registry (one per platform). */
  readonly running = new Map<number, Crawl>();

  constructor(platforms: readonly PlatformBody[] = PLATFORMS, running = [RUNNING_CRAWL]) {
    for (const platform of platforms) this.platforms.set(platform.id, structuredClone(platform));
    for (const crawl of running) {
      this.running.set(crawl.platform_id, { id: crawl.job_id, total: crawl.total, done: crawl.scraping_completed });
    }
  }

  get(id: number): PlatformBody {
    const platform = this.platforms.get(id);
    if (!platform) throw new Error(`sources server: no platform ${id}`);
    return platform;
  }

  list(): PlatformBody[] {
    return [...this.platforms.values()].map((platform) => structuredClone(platform));
  }

  crawlStatus(): CrawlStatusBody {
    const jobs = [...this.running].map(([platformId, crawl]) => ({
      job_id: crawl.id,
      platform: this.get(platformId).url,
      platform_id: platformId,
      status: crawl.done > 0 ? "crawling" : "starting",
      total: crawl.total,
      scraping_completed: crawl.done,
    }));
    return { jobs };
  }
}

/** Everything /sources loads, answered from the server's state. */
export function sourcesRoutes(server = new SourcesServer(), extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    [`GET ${PLATFORMS_PATH}`]: live(() => server.list()),
    "GET /scraper/crawl-status": live(() => server.crawlStatus()),
    [`GET ${CHANNEL_STATUS_PATH}`]: { body: CHANNELS },
    [`GET ${NOTIFICATION_TEMPLATES_PATH}`]: { body: TEMPLATES },
    ...extra,
  };
}
```

- [ ] **Step 9: The e2e spec**

`web/tests/e2e/sources.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

const MIN_HIT_TARGET_PX = 44;
const SERVER_ERROR = 500;

test.beforeEach(async ({ page }) => fixNow(page));

const list = (page: Page) => page.getByRole("list", { name: "Deine Quellen" });

async function open(page: Page, query = "") {
  await page.goto(`/sources${query}`);
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Quellen lists the sources at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await expect(page.getByRole("heading", { level: 1, name: "Quellen" })).toBeVisible();
      await expect(page.locator(".sources .mast-deck")).toHaveText("2 Quellen, 1 mit Fehler.");
      await expect(list(page).getByRole("link")).toHaveText(["Indeed", "StepStone"]);
      await expect(list(page).getByRole("listitem").nth(1)).toContainText("Läuft");
      await expect(page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar, gestern 08:00$/ })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-${size}-${scheme}`);
    });
  }
}

test("no horizontal scroll at 375 px and 44 px row links", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await open(page);
  expect(await horizontalOverflow(page)).toBe(0);
  const box = await list(page).getByRole("link", { name: "Indeed" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
});

test("the banner opens the failing source", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await open(page);
  await page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ }).click();
  await expect(page).toHaveURL(/\/sources\?quelle=2$/);
});

test("an unknown source id is dropped from the URL", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await open(page, "?quelle=999");
  await expect(page).toHaveURL(/\/sources$/);
});

test("without sources the page offers the first one", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes(new SourcesServer([], [])));
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Erste Quelle hinzufügen" })).toBeVisible();
  await expect(page.locator(".sources .mast-deck")).toHaveText("Noch keine Quelle.");
});

test.describe("a failing list", () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test("shows the error with a retry", async ({ page, mockApi }) => {
    await mockApi(sourcesRoutes(undefined, { "GET /platforms": { status: SERVER_ERROR, body: { detail: "boom" } } }));
    await page.goto("/sources");
    await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await expect(page.getByText("boom")).toHaveCount(0);
  });
});
```

In `tests/e2e/shell.spec.ts` remove `["/sources", "Quellen"],` from the placeholder routes (the page is real now).

- [ ] **Step 10: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources tests/unit/theme/sourcesStyles.test.ts`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 8: Durchsuchen, live progress inline, Abbrechen, end-of-crawl announcement

**Files:**
- Create: `web/src/features/sources/crawl/CrawlButton.tsx`, `CrawlProgress.tsx`, `useCrawlActions.ts`, `SourcesLiveStatus.tsx`; `web/tests/unit/support/sourcesRoutes.ts` (`SOURCE_A`, `SOURCE_B`, `sourcesStubs`, moved out of `sourcesPage.test.tsx`, which then imports them; `SOURCE_A` additionally carries `notification_adapters: ["PUSHOVER"], pushover_template: null`, like the e2e `STEPSTONE`), `web/tests/unit/features/sources/crawl.test.tsx`, `web/tests/e2e/sourcesCrawl.spec.ts`
- Modify: `web/src/features/sources/SourceList.tsx` (pass `progress` and `action`), `web/src/features/sources/SourcesPage.tsx` (mount `SourcesLiveStatus`), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (crawl, cancel, finish), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `startPlatformCrawl`, `cancelCrawl` (Task 5), `markCrawlStarted`, `sourceLabel`, `progressPercent`, `STEP_LABEL` (`features/shell/ActivityPanel.tsx`), `canCrawl`, `SourceState` (Task 6), `SourceRow` slots (Task 7), `useToast`, `describeError`.
- Produces: `useStartCrawl(platform)`, `useCancelCrawl(platform)` (both `useMutation`, scope `crawl-<id>`, so a cancel waits for a pending start); `CrawlButton({ platform, state })`; `CrawlProgress({ platform, task })`; `SourcesLiveStatus({ platforms })`; e2e `SourcesServer.crawl(id)`, `SourcesServer.cancel(sent)`, `SourcesServer.finish(id, lastRun)`, `crawlRoutes(server)`, `finishCrawl(log, server, { platformId, type, lastRun })`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/crawl.test.tsx` (same `vi.mock("next/navigation", ...)`, `NOW`, `STEPSTONE`, `INDEED` and `stubs()` as `sourcesPage.test.tsx`; move those into `tests/unit/support/sourcesRoutes.ts` as `SOURCE_A` (StepStone), `SOURCE_B` (Indeed) and `sourcesStubs(platforms?, extra?)` and import them in both files):

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { reduceActivity, seedCrawlTask, EMPTY_ACTIVITY, type ActivityState } from "@/realtime/activity";
import { jsonResponse } from "../../support/fakeFetch";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

const HTTP_CONFLICT = 409;
const startButton = (name: string) => screen.findByRole("button", { name: `${name} jetzt durchsuchen` });
const posts = (calls: { method: string; url: string }[], path: string) =>
  calls.filter((call) => call.method === "POST" && call.url.endsWith(path));

describe("Durchsuchen", () => {
  it("a second click while starting sends one request", async () => {
    let answer: (value: Response) => void = () => {};
    const calls = sourcesStubs(undefined, {
      "POST /platforms/1/crawl": () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderWithProviders(<SourcesPage />);
    const button = await startButton("StepStone");
    await userEvent.click(button);
    await userEvent.click(button);
    answer(jsonResponse(200, { status: "Started", job_id: "c9" }));
    expect(posts(calls, "/platforms/1/crawl")).toHaveLength(1);
  });

  it("shows the bar as soon as the start is accepted", async () => {
    sourcesStubs(undefined, { "POST /platforms/1/crawl": { status: "Started", job_id: "c9" } });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    expect(await screen.findByRole("progressbar", { name: "Fortschritt StepStone" })).toBeInTheDocument();
    expect(screen.getByText("Startet …")).toBeInTheDocument();
    expect(await screen.findByText("StepStone wird durchsucht.")).toBeInTheDocument();
  });

  it("a second start says it is already running and asks for the running crawls again", async () => {
    const calls = sourcesStubs(undefined, {
      "POST /platforms/1/crawl": () => jsonResponse(HTTP_CONFLICT, { detail: "Crawl already running" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton("StepStone"));
    expect(await screen.findByText("StepStone wird schon durchsucht.")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.url.endsWith("/scraper/crawl-status"))).toHaveLength(2));
  });

  it("a paused source cannot be started", async () => {
    const calls = sourcesStubs([{ ...SOURCE_A, is_active: false }]);
    renderWithProviders(<SourcesPage />);
    const button = await startButton("StepStone");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Die Quelle ist pausiert.");
    await userEvent.click(button);
    expect(posts(calls, "/crawl")).toHaveLength(0);
  });
});

describe("a running crawl", () => {
  const running = { job_id: "crawl-1", platform: SOURCE_A.url, platform_id: 1, status: "crawling", total: 12, scraping_completed: 5 };

  it("shows its step inline and Abbrechen cancels exactly this crawl", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /scraper/crawl-status": { jobs: [running] },
      "POST /scraper/cancel-crawl": { status: "success" },
    });
    renderWithProviders(<SourcesPage />);
    expect(await screen.findByText("Links sammeln: 5 von 12")).toBeInTheDocument();
    expect(await startButton("StepStone")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Durchsuchen von StepStone abbrechen" }));
    await waitFor(() => expect(JSON.parse(posts(calls, "/scraper/cancel-crawl")[0]!.body!)).toEqual({ job_id: "crawl-1" }));
  });

  it("announces the end of a crawl that finished on this page, not an older one", async () => {
    sourcesStubs();
    const { queryClient } = renderWithProviders(<SourcesPage />);
    await startButton("Indeed");
    // The toast provider has status regions too; the page's own region carries .src-live.
    const status = document.querySelector(".src-live")!;
    expect(status.textContent).toBe("");
    const seeded = seedCrawlTask(EMPTY_ACTIVITY, { id: "c2", platformId: 2, source: "de.indeed.com" });
    act(() => {
      queryClient.setQueryData<ActivityState>(queryKeys.activity, () =>
        reduceActivity(seeded, { type: "crawl_job_completed", user_id: 7, job_id: "c2" }, Date.now()),
      );
    });
    expect(status).toHaveTextContent("Indeed: Durchsuchen fertig.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/crawl.test.tsx`
Expected: FAIL: no button "StepStone jetzt durchsuchen".

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.crawl.start": "{name} jetzt durchsuchen",                // "Search {name} now"
  "sources.crawl.started": "{name} wird durchsucht.",               // "Searching {name}."
  "sources.crawl.alreadyRunning": "{name} wird schon durchsucht.",  // "{name} is already being searched."
  "sources.crawl.cancel": "Durchsuchen von {name} abbrechen",       // "Cancel searching {name}"
  "sources.crawl.cancelFailed": "Abbrechen hat nicht geklappt.",    // "Could not cancel."
  "sources.crawl.progress": "Fortschritt {name}",                   // "Progress {name}"
  "sources.crawl.why.running": "Läuft gerade.",                     // "Running now."
  "sources.crawl.why.paused": "Die Quelle ist pausiert.",           // "The source is paused."
  "sources.crawl.why.setup": "Die Einrichtung ist nicht abgeschlossen.", // "Setup is not finished."
  "sources.live.completed": "{name}: Durchsuchen fertig.",          // "{name}: search finished."
  "sources.live.failed": "{name}: Durchsuchen fehlgeschlagen.",     // "{name}: search failed."
  "sources.live.cancelled": "{name}: Durchsuchen abgebrochen.",     // "{name}: search cancelled."
```

- [ ] **Step 4: Mutations**

`crawl/useCrawlActions.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelCrawl } from "@/api/crawl";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { startPlatformCrawl, type Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { sourceLabel } from "@/realtime/activity";
import { markCrawlStarted } from "@/realtime/useActivity";
import { useToast } from "@/ui/ToastProvider";

// Start and cancel of one source run one after the other: a cancel never overtakes its start.
const crawlScope = (platform: Platform) => ({ id: `crawl-${platform.id}` });

export function useStartCrawl(platform: Platform) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: crawlScope(platform),
    mutationFn: () => startPlatformCrawl(platform.id),
    onSuccess: (crawlId) => {
      markCrawlStarted(queryClient, { id: crawlId, platformId: platform.id, source: sourceLabel(platform.url) });
      toast.show({ message: t("sources.crawl.started", { name: platform.name }), tone: "info" });
    },
    onError: (error) => {
      const running = error instanceof ApiError && error.code === "CONFLICT";
      // A crawl this tab does not know about (scheduler, other tab): fetch it so its bar shows.
      if (running) void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      const message = running ? t("sources.crawl.alreadyRunning", { name: platform.name }) : describeError(error, t);
      toast.show({ message, tone: "error" });
    },
  });
}

export function useCancelCrawl(platform: Platform) {
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: crawlScope(platform),
    mutationFn: (crawlId: string) => cancelCrawl(crawlId),
    // Success needs nothing here: crawl_job_cancelled ends the task in the activity cache.
    onError: () => toast.show({ message: t("sources.crawl.cancelFailed"), tone: "error" }),
  });
}
```

(Split `onError` into a named helper if the hook passes 20 lines after formatting.)

- [ ] **Step 5: Button, progress, live status**

`crawl/CrawlButton.tsx`:

```tsx
"use client";

import { Play } from "lucide-react";
import { useId } from "react";
import type { Platform } from "@/api/platforms";
import { canCrawl, type SourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useStartCrawl } from "./useCrawlActions";

const WHY_NOT: Partial<Record<SourceState, MessageKey>> = {
  running: "sources.crawl.why.running",
  paused: "sources.crawl.why.paused",
  setup: "sources.crawl.why.setup",
};

/** D4: an icon button in its own cell; inactive (still focusable) with the reason when it cannot start. */
export function CrawlButton({ platform, state }: { platform: Platform; state: SourceState }) {
  const { t } = useI18n();
  const start = useStartCrawl(platform);
  const reasonId = useId();
  const why = canCrawl(state) ? null : WHY_NOT[state];
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={Play}
        iconOnly
        className="src-crawl"
        aria-label={t("sources.crawl.start", { name: platform.name })}
        aria-describedby={why ? reasonId : undefined}
        title={why ? t(why) : undefined}
        inactive={why !== undefined && why !== null}
        busy={start.isPending}
        onClick={() => start.mutate()}
      />
      {why ? (
        <span id={reasonId} className="sr-only">
          {t(why)}
        </span>
      ) : null}
    </>
  );
}
```

`crawl/CrawlProgress.tsx`:

```tsx
"use client";

import type { Platform } from "@/api/platforms";
import { STEP_LABEL } from "@/features/shell/ActivityPanel";
import { useI18n } from "@/i18n/useI18n";
import { progressPercent, type ActivityTask } from "@/realtime/activity";
import { Button } from "@/ui/Button";
import { useCancelCrawl } from "./useCrawlActions";

const FULL = 100;

/**
 * D4: step text and a native bar (no inline style), Abbrechen in this cell, never where Durchsuchen
 * sits, so a double click cannot cancel. Progress is not announced (constraint: not chatty).
 */
export function CrawlProgress({ platform, task }: { platform: Platform; task: ActivityTask }) {
  const { t } = useI18n();
  const cancel = useCancelCrawl(platform);
  return (
    <div className="crawl-live">
      <span className="crawl-step">{t(STEP_LABEL[task.step], { done: task.done, total: task.total })}</span>
      <progress className="crawl-bar" max={FULL} value={progressPercent(task)} aria-label={t("sources.crawl.progress", { name: platform.name })} />
      <Button
        variant="ghost"
        size="sm"
        className="crawl-cancel"
        aria-label={t("sources.crawl.cancel", { name: platform.name })}
        busy={cancel.isPending}
        onClick={() => cancel.mutate(task.id)}
      >
        {t("guard.cancel")}
      </Button>
    </div>
  );
}
```

`crawl/SourcesLiveStatus.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Platform } from "@/api/platforms";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import type { ActivityOutcome } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";

const LIVE_TEXT: Readonly<Record<ActivityOutcome, MessageKey>> = {
  completed: "sources.live.completed",
  failed: "sources.live.failed",
  cancelled: "sources.live.cancelled",
};

/** D13: the page's one live region; it says when a source's crawl ended, never each step. */
export function SourcesLiveStatus({ platforms }: { platforms: readonly Platform[] }) {
  const { t } = useI18n();
  const [mountedAt] = useState(useNow());
  const finished = useActivity(true).lastFinished;
  const source = finished && finished.finishedAt >= mountedAt
    ? platforms.find((platform) => platform.id === finished.platformId)
    : undefined;
  const text = source && finished ? t(LIVE_TEXT[finished.outcome], { name: source.name }) : "";
  return (
    <p role="status" className="sr-only src-live">
      {text}
    </p>
  );
}
```

(If the React compiler lint flags calling `useNow()` inside the `useState` argument, read it into a constant first: `const now = useNow(); const [mountedAt] = useState(now);`.)

Wire them: in `SourceList.tsx` `SourceRows`, pass to each row

```tsx
progress={task ? <CrawlProgress platform={platform} task={task} /> : undefined}
action={<CrawlButton platform={platform} state={sourceState(platform, task !== null)} />}
```

(compute `task` once per row in a small `SourceListItem` component to stay under 20 lines). `SourcesPage` renders `<SourcesLiveStatus platforms={platforms.data ?? []} />` unconditionally as its last child.

`sources.css` additions:

```css
  .crawl-live {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
    align-items: center;
  }
  .crawl-step {
    grid-column: 1 / -1;
  }
  .crawl-bar {
    width: 100%;
    height: 6px;
    appearance: none;
    border: 0;
    border-radius: 3px;
    background: var(--sunken);
  }
  .crawl-bar::-webkit-progress-bar {
    background: var(--sunken);
    border-radius: 3px;
  }
  /* Ink, not vermilion: progress is not "your next move" (usability #16). */
  .crawl-bar::-webkit-progress-value {
    background: var(--text);
    border-radius: 3px;
  }
  .crawl-bar::-moz-progress-bar {
    background: var(--text);
  }
```

and inside the `@container sources (max-width: 719px)` block add `.crawl-cancel` to the 44 px selector list.

- [ ] **Step 6: E2E: server rules and the spec**

Extend `SourcesServer`:

```ts
  private crawlSeq = 1;

  /** POST /platforms/{id}/crawl: one crawl per platform (409), inactive refused (400). */
  crawl(id: number): unknown {
    if (this.running.has(id)) return reply(409, { detail: "Crawl already running" });
    if (this.get(id).is_active === false) return reply(400, { detail: "Platform is deactivated" });
    this.crawlSeq += 1;
    const crawl = { id: `crawl-${this.crawlSeq}`, total: 0, done: 0 };
    this.running.set(id, crawl);
    return { status: "Started", job_id: crawl.id };
  }

  /** POST /scraper/cancel-crawl: the scraper answers 200 with a status, also when it refuses. */
  cancel(sent: unknown): unknown {
    const jobId = (sent as { job_id?: string }).job_id;
    const entry = [...this.running].find(([, crawl]) => crawl.id === jobId);
    if (!entry) return { status: "error", message: "Job not found" };
    this.finish(entry[0], { finished_at: "2026-10-08T08:01:00+00:00", error: "cancelled" });
    return { status: "success", message: "Crawl job cancelled" };
  }

  /** The end of a crawl as record_platform_run writes it. */
  finish(id: number, lastRun: PlatformBody["last_run"]): void {
    this.running.delete(id);
    this.get(id).last_run = { found: 0, new: 0, matched: 0, seeded: false, ...lastRun };
  }
```

(`reply` from `./mockApi`.) Add:

```ts
export function crawlRoutes(server: SourcesServer): MockRoutes {
  const routes: Record<string, MockResponse> = { [`POST ${CANCEL_CRAWL_PATH}`]: live((sent) => server.cancel(sent)) };
  for (const platform of server.list()) {
    routes[`POST ${platformCrawlPath(platform.id)}`] = live(() => server.crawl(platform.id));
  }
  return routes;
}

/** Ends a crawl on the server and tells the page, as the worker would. */
export function finishCrawl(log: ApiLog, server: SourcesServer, end: { platformId: number; type: string; lastRun: PlatformBody["last_run"] }) {
  const crawlId = server.running.get(end.platformId)!.id;
  server.finish(end.platformId, end.lastRun);
  pushEvent(log, { type: end.type, job_id: crawlId });
}
```

and include `...crawlRoutes(server)` in `sourcesRoutes` (before `extra`). `pushEvent` comes from `./jobFixtures`.

`web/tests/e2e/sourcesCrawl.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { INDEED } from "./support/platformFixtures";
import { finishCrawl, SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });

async function openWithSocket(page: Page, log: ApiLog) {
  await page.goto("/sources");
  await expect(row(page, "Indeed")).toBeVisible();
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Durchsuchen shows live progress in the row at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      const server = new SourcesServer();
      const log = await mockApi(sourcesRoutes(server));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openWithSocket(page, log);
      await page.getByRole("button", { name: "Indeed jetzt durchsuchen" }).click();
      await expect(row(page, "Indeed")).toContainText("Startet …");
      const crawlId = server.running.get(INDEED.id)!.id;
      pushEvent(log, { type: "crawl_job_progress", job_id: crawlId, platform: INDEED.url, total: 8, scraping_completed: 3 });
      await expect(row(page, "Indeed")).toContainText("Links sammeln: 3 von 8");
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-crawl-${size}-${scheme}`);
      finishCrawl(log, server, {
        platformId: INDEED.id,
        type: "crawl_job_completed",
        lastRun: { finished_at: "2026-10-08T08:00:00+00:00", found: 8, new: 2, matched: 1, error: null },
      });
      await expect(row(page, "Indeed")).toContainText("8 gefunden, 1 passend, 1 unter Schwellwert");
      await expect(page.locator(".src-live")).toHaveText("Indeed: Durchsuchen fertig.");
      await expect(page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ })).toHaveCount(0);
    });
  }
}

test("a double click starts one crawl", async ({ page, mockApi }) => {
  const log = await mockApi(sourcesRoutes());
  await openWithSocket(page, log);
  await page.getByRole("button", { name: "Indeed jetzt durchsuchen" }).dblclick();
  await expect(row(page, "Indeed")).toContainText("Startet …");
  expect(log.requests.filter((key) => key === "POST /platforms/2/crawl")).toHaveLength(1);
  expect(log.requests).not.toContain("POST /scraper/cancel-crawl");
});

test("a scheduled crawl shows its progress in the row", async ({ page, mockApi }) => {
  const log = await mockApi(sourcesRoutes());
  await openWithSocket(page, log);
  pushEvent(log, { type: "crawl_job_started", job_id: "sched-1", platform: INDEED.url, platform_id: INDEED.id });
  await expect(row(page, "Indeed")).toContainText("Startet …");
  await expect(row(page, "Indeed")).toContainText("Läuft");
});

test("Abbrechen cancels the crawl and a cancel is no error", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  const log = await mockApi(sourcesRoutes(server));
  await openWithSocket(page, log);
  await row(page, "StepStone").getByRole("button", { name: "Durchsuchen von StepStone abbrechen" }).click();
  await expect.poll(() => log.calls.find((call) => call.key === "POST /scraper/cancel-crawl")?.body).toEqual({ job_id: "crawl-1" });
  pushEvent(log, { type: "crawl_job_cancelled", job_id: "crawl-1" });
  await expect(row(page, "StepStone")).toContainText("abgebrochen");
  await expect(page.locator(".src-live")).toHaveText("StepStone: Durchsuchen abgebrochen.");
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByText("1 Fehler")).toHaveCount(1);
});

test.describe("a start the server refuses", () => {
  test.use({ allowedConsoleErrors: [/status of 409/] });

  test("says the source is already being searched", async ({ page, mockApi }) => {
    const server = new SourcesServer();
    const log = await mockApi(sourcesRoutes(server));
    await openWithSocket(page, log);
    server.running.set(INDEED.id, { id: "ghost", total: 0, done: 0 });
    await page.getByRole("button", { name: "Indeed jetzt durchsuchen" }).click();
    await expect(page.getByText("Indeed wird schon durchsucht.")).toBeVisible();
    // The refetch of the running crawls brings the unknown crawl's bar.
    await expect(row(page, "Indeed")).toContainText("Startet …");
  });
});
```

(The `1 Fehler` badge text lives in the sidebar `NavBadge`; if the sentence is `sr-only`, assert with `toHaveCount(1)` as written. At 390 px the badge is in the bottom bar: this test runs at the default desktop size.)

- [ ] **Step 7: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---
### Task 9: Source drawer: frame, unsaved guard, "Quelle" and "Zeitplan" sections

**Files:**
- Create: `web/src/features/sources/drawer/SourceDrawer.tsx`, `useDirtySections.ts`, `useSectionForm.ts`, `useSectionSave.ts`, `SourceSection.tsx`, `ScheduleSection.tsx`, `ScheduleFields.tsx`; `web/tests/unit/features/sources/drawer.test.tsx`, `web/tests/e2e/sourcesDrawer.spec.ts`
- Modify: `web/src/features/sources/SourcesPage.tsx` (render the drawer), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (`patch`, `suggestName`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `patchPlatform`, `suggestPlatformName`, `PlatformPatch`, `profileTimezoneQueryOptions` (Task 5); `scheduleOf`, `DEFAULT_SCHEDULE`, `WEEKDAYS`, `toSourceField`, `SourceField`, `sourceState`, `PENDING_SETUP` (Task 6); `isScheduleTime` (`runLine.ts`); `WEEKDAY_LABEL` (Task 6); `CrawlButton`, `CrawlProgress`, `runningTaskOf` (Tasks 7-8); `focusSourceOrTitle` (Task 7); `parseImportUrl`; `fieldErrorsFrom`; `useUnsavedChanges`; `Drawer`, `PanelHeader`, `Disclosure`, `TextField`, `CheckField`, `Chip`, `Button`, `Notice`; `safeHref`, `hostOf`.
- Produces:
  - `SourceDrawer({ platform, onClose })` (`onClose` runs after the leave question was answered with "leave"); sections are added by Tasks 10-11 through `SourceDrawer`'s section list.
  - `useDirtySections(): { report(section: string, dirty: boolean): void; requestLeave(): Promise<boolean> }` (one `setDirty` for all sections; cleared on unmount).
  - `useSectionForm<T extends object>(server: T): { draft: T; set(patch: Partial<T>): void; dirty: boolean; changed(): Partial<T>; commit(saved: T): void }` (adopts a refetch only while not dirty).
  - `useSectionSave(platformId: number)`: a `useMutation` over `PlatformPatch` (scope `source-<id>`; success invalidates `["platforms"]` and toasts "Gespeichert."; an error without field errors toasts `describeError`); `sectionFieldErrors(error): SourceField[]`.
  - `ScheduleDraft { enabled: boolean; time: string; days: number[] }`, `scheduleDraftOf(platform)`, `schedulePatch(draft)`, `scheduleErrors(draft): { time?: MessageKey; days?: MessageKey }`, `ScheduleFields({ idPrefix, value, onChange, errors })` (shared with the wizard, Task 13).
  - E2E `SourcesServer.patch(id, sent)` (the server's PATCH rules, 422 with `loc`), `drawerRoutes(server)`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/drawer.test.tsx` (navigation mock and fake `Date` as in `sourcesPage.test.tsx`; `liveNavigation.reset("quelle=1")` in `beforeEach`):

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

const UNPROCESSABLE = 422;
const drawer = () => screen.findByRole("dialog", { name: "Quelle StepStone" });
const patches = (calls: { method: string; body: string | null }[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body!));
const invalid = (field: string) => () =>
  jsonResponse(UNPROCESSABLE, { detail: [{ loc: ["body", field], msg: "x", type: "value_error" }] });

describe("source drawer", () => {
  it("opens for ?quelle=1 with its sections and the profile time zone", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    expect(within(panel).getByRole("heading", { name: "Quelle" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Zeitplan" })).toBeInTheDocument();
    expect(await within(panel).findByText("Uhrzeit in deiner Zeitzone (Europe/Berlin).")).toBeInTheDocument();
  });

  it("a section save sends only its own fields", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const name = within(panel).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "StepStone Kotlin");
    await userEvent.click(within(panel).getAllByRole("button", { name: "Speichern" })[0]!);
    await waitFor(() => expect(patches(calls)).toEqual([{ name: "StepStone Kotlin" }]));
  });

  it("an enabled schedule needs a day", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    for (const day of ["Mo", "Di", "Mi", "Do", "Fr"]) await userEvent.click(within(panel).getByRole("button", { name: day }));
    await userEvent.click(within(panel).getAllByRole("button", { name: "Speichern" })[1]!);
    expect(await within(panel).findByText("Wähle mindestens einen Tag.")).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("turning the schedule off sends nulls", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByLabelText("Automatisch durchsuchen"));
    await userEvent.click(within(panel).getAllByRole("button", { name: "Speichern" })[1]!);
    await waitFor(() => expect(patches(calls)).toEqual([{ schedule_time: null, schedule_days: null }]));
  });

  it("maps a 422 on schedule_time to the time field and never shows the server text", async () => {
    sourcesStubs(undefined, { "PATCH /platforms/1": invalid("schedule_time") });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.click(within(panel).getByRole("button", { name: "Sa" }));
    await userEvent.click(within(panel).getAllByRole("button", { name: "Speichern" })[1]!);
    expect(await within(panel).findByText("Gib eine Uhrzeit wie 08:00 ein.")).toBeInTheDocument();
    expect(within(panel).queryByText("x")).toBeNull();
  });

  it("a refused address shows on the URL field", async () => {
    sourcesStubs(undefined, { "PATCH /platforms/1": invalid("url") });
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    const url = within(panel).getByLabelText("Adresse der Suchergebnisseite");
    await userEvent.clear(url);
    await userEvent.type(url, "https://www.stepstone.de/jobs/java");
    await userEvent.click(within(panel).getAllByRole("button", { name: "Speichern" })[0]!);
    expect(await within(panel).findByText("Diese Adresse kann nicht geprüft werden.")).toBeInTheDocument();
  });

  it("a refetch does not overwrite a dirty draft, but a clean section adopts it", async () => {
    sourcesStubs();
    const { queryClient } = renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), " neu");
    queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
      list!.map((p) => (p.id === 1 ? { ...p, name: "Anders", schedule_time: "09:30" } : p)),
    );
    await waitFor(() => expect(within(panel).getByLabelText("Uhrzeit")).toHaveValue("09:30"));
    expect(within(panel).getByLabelText("Name")).toHaveValue("StepStone neu");
  });

  it("Escape with an unsaved name asks first and keeps the draft", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const panel = await drawer();
    await userEvent.type(within(panel).getByLabelText("Name"), "!");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Weiter bearbeiten" }));
    expect(within(await drawer()).getByLabelText("Name")).toHaveValue("StepStone!");
    expect(liveNavigation.replace).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Änderungen verwerfen" }));
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false }));
  });
});
```

(`sourcesStubs` must answer `GET /settings` with `{ timezone: "Europe/Berlin" }`, which it does since Task 8.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/drawer.test.tsx`
Expected: FAIL: no dialog "Quelle StepStone".

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.drawer": "Quelle {name}",                                   // "Source {name}"
  "sources.openPage": "Seite öffnen",                                  // "Open page"
  "sources.saved": "Gespeichert.",                                     // "Saved."
  "sources.section.source": "Quelle",                                  // "Source"
  "sources.section.schedule": "Zeitplan",                              // "Schedule"
  "sources.field.name": "Name",                                        // "Name"
  "sources.field.suggest": "Namen vorschlagen",                        // "Suggest a name"
  "sources.field.suggestFailed": "Gerade kein Vorschlag möglich.",     // "No suggestion right now."
  "sources.field.url": "Adresse der Suchergebnisseite",                // "Address of the search results page"
  "sources.field.urlHint": "Nur Änderungen auf derselben Website sind möglich.", // "Only changes on the same website are possible."
  "sources.field.advanced": "Erweitert",                               // "Advanced"
  "sources.field.pattern": "URL-Muster",                               // "URL pattern"
  "sources.field.patternHint": "Nur Links, die diesen Text enthalten, werden als Stelle gelesen.",
    // "Only links that contain this text are read as postings."
  "sources.field.active": "Aktiv (wird durchsucht)",                   // "Active (gets searched)"
  "sources.error.name": "Gib einen Namen mit höchstens 100 Zeichen ein.", // "Enter a name of at most 100 characters."
  "sources.error.url": "Diese Adresse kann nicht geprüft werden.",     // "This address cannot be checked."
  "sources.error.urlRefused":
    "Diese Adresse geht hier nicht: Sie muss auf derselben Website bleiben und darf noch keine Quelle sein.",
    // "This address does not work here: it must stay on the same website and must not be a source already."
  "sources.error.pattern": "Gib ein Muster mit 1 bis 300 Zeichen ein, nicht nur „/“.",
    // "Enter a pattern of 1 to 300 characters, not just “/”."
  "sources.error.time": "Gib eine Uhrzeit wie 08:00 ein.",             // "Enter a time like 08:00."
  "sources.error.days": "Wähle mindestens einen Tag.",                 // "Pick at least one day."
  "sources.schedule.auto": "Automatisch durchsuchen",                  // "Search automatically"
  "sources.schedule.time": "Uhrzeit",                                  // "Time"
  "sources.schedule.weekdays": "Wochentage",                           // "Weekdays"
  "sources.schedule.zone": "Uhrzeit in deiner Zeitzone ({zone}).",     // "Time in your time zone ({zone})."
  "sources.schedule.zoneUnknown": "Uhrzeit in der Zeitzone deines Profils.", // "Time in your profile's time zone."
  "sources.setupPending":
    "Die Einrichtung ist nicht abgeschlossen. Lege die Quelle mit derselben Adresse über „Quelle hinzufügen“ neu an; Zeitplan und Benachrichtigungen bleiben.",
    // "Setup is not finished. Add the source again with the same address via “Add source”; schedule and notifications stay."
```

- [ ] **Step 4: Form plumbing**

`drawer/useSectionForm.ts`:

```ts
"use client";

import { useState } from "react";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface SectionForm<T> {
  draft: T;
  set: (patch: Partial<T>) => void;
  dirty: boolean;
  /** The keys whose value differs from the last saved state; what a save sends. */
  changed: () => Partial<T>;
  commit: (saved: T) => void;
}

/**
 * D5: a section edits its own copy. A background refetch is adopted only while nothing is edited
 * (previous-value pattern, phase 4 R27), so a save elsewhere never wipes a draft.
 */
export function useSectionForm<T extends object>(server: T): SectionForm<T> {
  const [state, setState] = useState({ base: server, draft: server });
  const dirty = !same(state.base, state.draft);
  if (!dirty && !same(state.base, server)) setState({ base: server, draft: server });
  const changed = () =>
    Object.fromEntries(
      Object.entries(state.draft).filter(([key, value]) => !same(value, state.base[key as keyof T])),
    ) as Partial<T>;
  return {
    draft: state.draft,
    set: (patch) => setState((previous) => ({ ...previous, draft: { ...previous.draft, ...patch } })),
    dirty,
    changed,
    commit: (saved) => setState({ base: saved, draft: saved }),
  };
}
```

`drawer/useDirtySections.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";

function toggled(sections: ReadonlySet<string>, section: string, dirty: boolean): ReadonlySet<string> {
  if (sections.has(section) === dirty) return sections;
  const next = new Set(sections);
  if (dirty) next.add(section);
  else next.delete(section);
  return next;
}

/** One unsaved flag for all sections of the drawer (D5); it drives the leave dialog and the unload warning. */
export function useDirtySections() {
  const { setDirty, requestLeave } = useUnsavedChanges();
  const [sections, setSections] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback(
    (section: string, dirty: boolean) => setSections((current) => toggled(current, section, dirty)),
    [],
  );
  useEffect(() => setDirty(sections.size > 0), [sections, setDirty]);
  // A closed (or deleted) drawer holds nothing unsaved any more.
  useEffect(() => () => setDirty(false), [setDirty]);
  return { report, requestLeave };
}
```

Each section calls `useEffect(() => report(SECTION, form.dirty), [form.dirty, report])`.

`drawer/useSectionSave.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { patchPlatform, type PlatformPatch } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { toSourceField, type SourceField } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

export function sectionFieldErrors(error: unknown): SourceField[] {
  return fieldErrorsFrom(error, toSourceField);
}

/** D5: one partial PATCH per section; sections of one source save one after the other. */
export function useSectionSave(platformId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: { id: `source-${platformId}` },
    mutationFn: (patch: PlatformPatch) => patchPlatform({ id: platformId, patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platforms });
      toast.show({ message: t("sources.saved"), tone: "success" });
    },
    // Field errors show on their fields; everything else is one toast (spec 6).
    onError: (error) => {
      if (sectionFieldErrors(error).length === 0) toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}
```

(The Quelle section passes `overrides` for BAD_REQUEST itself, see Step 5; split `onError` into a named helper if lint counts more than 20 lines.)

- [ ] **Step 5: Sections**

`drawer/ScheduleFields.tsx`:

```tsx
"use client";

import { CircleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { profileTimezoneQueryOptions } from "@/api/settings";
import { isScheduleTime } from "@/domain/runLine";
import { DEFAULT_SCHEDULE, scheduleOf, WEEKDAYS, type Schedule } from "@/domain/sources";
import type { Platform, PlatformPatch } from "@/api/platforms";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { CheckField, TextField } from "@/ui/Field";
import { Chip } from "@/ui/Chip";
import { Icon } from "@/ui/Icon";
import { WEEKDAY_LABEL } from "../labels";

export interface ScheduleDraft extends Schedule {
  enabled: boolean;
}

export interface ScheduleErrors {
  time?: MessageKey;
  days?: MessageKey;
}

export function scheduleDraftOf(platform: Pick<Platform, "schedule_time" | "schedule_days">): ScheduleDraft {
  const schedule = scheduleOf(platform);
  return schedule ? { enabled: true, ...schedule } : { enabled: false, ...DEFAULT_SCHEDULE };
}

/** D6: off clears both halves; the server refuses one without the other. */
export function schedulePatch(draft: ScheduleDraft): Pick<PlatformPatch, "schedule_time" | "schedule_days"> {
  return draft.enabled
    ? { schedule_time: draft.time, schedule_days: [...draft.days].sort((a, b) => a - b) }
    : { schedule_time: null, schedule_days: null };
}

export function scheduleErrors(draft: ScheduleDraft): ScheduleErrors {
  if (!draft.enabled) return {};
  return {
    time: isScheduleTime(draft.time) ? undefined : "sources.error.time",
    days: draft.days.length > 0 ? undefined : "sources.error.days",
  };
}

interface ScheduleFieldsProps {
  idPrefix: string;
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  errors: ScheduleErrors;
}

export function ScheduleFields({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="schedule-fields">
      <CheckField
        id={`${idPrefix}-auto`}
        label={t("sources.schedule.auto")}
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled ? <ScheduleWhen idPrefix={idPrefix} value={value} onChange={onChange} errors={errors} /> : null}
    </div>
  );
}

function ScheduleWhen({ idPrefix, value, onChange, errors }: ScheduleFieldsProps) {
  const { t } = useI18n();
  const zoneHint = useZoneHint();
  const toggle = (day: number) =>
    onChange({ ...value, days: value.days.includes(day) ? value.days.filter((d) => d !== day) : [...value.days, day] });
  return (
    <>
      <TextField
        id={`${idPrefix}-time`}
        type="time"
        label={t("sources.schedule.time")}
        hint={zoneHint}
        value={value.time}
        onChange={(event) => onChange({ ...value, time: event.target.value })}
        error={errors.time ? t(errors.time) : undefined}
      />
      <fieldset className="field schedule-days">
        <legend className="label">{t("sources.schedule.weekdays")}</legend>
        <div className="chip-row">
          {WEEKDAYS.map((day) => (
            <Chip key={day} pressed={value.days.includes(day)} onToggle={() => toggle(day)}>
              {t(WEEKDAY_LABEL[day]!)}
            </Chip>
          ))}
        </div>
        {errors.days ? <DaysError id={`${idPrefix}-days-error`} message={t(errors.days)} /> : null}
      </fieldset>
    </>
  );
}

/** D6 / G20: the scheduler compares with the profile's zone, so the hint names it. */
function useZoneHint(): string {
  const { t } = useI18n();
  const zone = useQuery(profileTimezoneQueryOptions()).data;
  return zone ? t("sources.schedule.zone", { zone }) : t("sources.schedule.zoneUnknown");
}

/** The markup of ui/Field's error (icon and words, role="alert"), for a group that has no single control. */
function DaysError({ id, message }: { id: string; message: string }) {
  return (
    <p className="field-error" id={id} role="alert">
      <Icon icon={CircleAlert} />
      <span>{message}</span>
    </p>
  );
}
```

(`ScheduleWhen` passes 20 lines: split the weekday fieldset into a `WeekdayToggles` component.)

`drawer/ScheduleSection.tsx`:

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Platform } from "@/api/platforms";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { ScheduleFields, scheduleDraftOf, scheduleErrors, schedulePatch, type ScheduleErrors } from "./ScheduleFields";
import { useSectionForm } from "./useSectionForm";
import { sectionFieldErrors, useSectionSave } from "./useSectionSave";

const SECTION = "schedule";

function serverErrors(error: unknown): ScheduleErrors {
  const fields = sectionFieldErrors(error);
  return {
    time: fields.includes("schedule_time") ? "sources.error.time" : undefined,
    days: fields.includes("schedule_days") ? "sources.error.days" : undefined,
  };
}

export function ScheduleSection({ platform, report }: { platform: Platform; report: (section: string, dirty: boolean) => void }) {
  const { t } = useI18n();
  const form = useSectionForm(scheduleDraftOf(platform));
  const save = useSectionSave(platform.id);
  const [errors, setErrors] = useState<ScheduleErrors>({});
  useEffect(() => report(SECTION, form.dirty), [form.dirty, report]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = scheduleErrors(form.draft);
    setErrors(found);
    if (found.time || found.days) return;
    const sent = form.draft;
    save.mutate(schedulePatch(sent), { onSuccess: () => form.commit(sent), onError: (error) => setErrors(serverErrors(error)) });
  };
  return (
    <form className="drawer-section" onSubmit={submit} noValidate aria-labelledby="src-schedule-h">
      <h3 id="src-schedule-h" className="sec-title-sm">{t("sources.section.schedule")}</h3>
      <ScheduleFields idPrefix="src-schedule" value={form.draft} onChange={(next) => form.set(next)} errors={errors} />
      <div className="panel-foot panel-foot-end">
        <Button type="submit" variant="primary" size="sm" busy={save.isPending}>{t("dates.save")}</Button>
      </div>
    </form>
  );
}
```

(Split `submit` into a named helper inside a small `useScheduleSubmit(form, save)` hook if the component passes 20 lines after formatting.)

`drawer/SourceSection.tsx` follows the same pattern with `SECTION = "source"` and the draft `{ name, url, url_pattern, is_active }` (from the platform; `url_pattern ?? ""`):
- fields: `TextField` "Name" (`maxLength={100}`) with a ghost small button "Namen vorschlagen" below it (`useMutation(suggestPlatformName)`; success sets `name` in the draft, making it dirty; error toasts `sources.field.suggestFailed`); `TextField type="url"` "Adresse der Suchergebnisseite" with hint `sources.field.urlHint`; `Disclosure label={t("sources.field.advanced")}` holding `TextField` "URL-Muster" (`className="code"`, hint `sources.field.patternHint`); `CheckField` "Aktiv (wird durchsucht)".
- client checks on submit (fixed keys, no server text): name trimmed 1-100 (`sources.error.name`), URL `parseImportUrl` (`sources.error.url`), pattern: when it differs from the saved one, trimmed and not only `/` (`sources.error.pattern`). The Disclosure opens itself when the pattern has an error (controlled mode).
- submit sends `form.changed()` only (an unchanged URL is never re-resolved by the server); nothing changed -> no request.
- server errors: `url` -> `sources.error.url`; `name` -> `sources.error.name`; `url_pattern` -> `sources.error.pattern` (Disclosure opens); a 400 (`BAD_REQUEST`: other host or an existing source) -> `sources.error.urlRefused` on the URL field.

`drawer/SourceDrawer.tsx`:

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { hostOf, safeHref } from "@/domain/links";
import { PENDING_SETUP, sourceState } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { useActivity } from "@/realtime/useActivity";
import { Drawer } from "@/ui/Drawer";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { CrawlButton } from "../crawl/CrawlButton";
import { CrawlProgress } from "../crawl/CrawlProgress";
import { runningTaskOf } from "../SourceList";
import { ScheduleSection } from "./ScheduleSection";
import { SourceSection } from "./SourceSection";
import { useDirtySections } from "./useDirtySections";

interface SourceDrawerProps {
  platform: Platform;
  /** Called once leaving is settled (nothing unsaved, or the user chose to discard). */
  onClose: () => void;
}

/** D5: one drawer per source; every way of closing goes through the leave question. */
export function SourceDrawer({ platform, onClose }: SourceDrawerProps) {
  const { t } = useI18n();
  const { report, requestLeave } = useDirtySections();
  const close = () => void requestLeave().then((leave) => leave && onClose());
  const label = t("sources.drawer", { name: platform.name });
  return (
    <Drawer open onClose={close} label={label} variant="wide">
      <div className="panel-in source-drawer">
        <PanelHeader title={platform.name} onClose={close} />
        <DrawerSubline platform={platform} />
        {platform.setup_status === PENDING_SETUP ? <Notice>{t("sources.setupPending")}</Notice> : null}
        <SourceSection platform={platform} report={report} />
        <ScheduleSection platform={platform} report={report} />
      </div>
    </Drawer>
  );
}

/** Host, the page itself (http(s) only) and the crawl controls of this source. */
function DrawerSubline({ platform }: { platform: Platform }) {
  const { t } = useI18n();
  const task = runningTaskOf(useActivity(true), platform.id);
  const href = safeHref(platform.url);
  return (
    <div className="drawer-subline">
      <span className="src-host">{hostOf(platform.url) ?? platform.url}</span>
      {href ? (
        <a className="link" href={href} target="_blank" rel="noreferrer">
          {t("sources.openPage")} <Icon icon={ExternalLink} />
        </a>
      ) : null}
      {task ? <CrawlProgress platform={platform} task={task} /> : <CrawlButton platform={platform} state={sourceState(platform, false)} />}
    </div>
  );
}
```

`SourcesPage.tsx`: find the open source in the loaded list and render

```tsx
{open ? <SourceDrawer key={open.id} platform={open} onClose={() => closeDrawer(open.id)} /> : null}
```

with `closeDrawer(id)` = `url.close(); focusSourceOrTitle(id);` (a small `useCloseDrawer(url)` helper keeps `SourcesPage` short).

`sources.css`: `.drawer-section` (top hairline `--line`, `padding-top: 20px`, `margin-top: 24px`, grid gap 12 px), `.drawer-subline` (flex, wrap, gap 12 px, `font-size: var(--fs-13)`), `.chip-row` (flex wrap gap 8 px; in the narrow container chips `min-height: 44px`), `.schedule-days` (no border, padding 0). Check that `.sec-title-sm`, `.panel-foot`, `.panel-foot-end` exist in `src/ui/styles` (they are used by the import drawer); reuse them.

- [ ] **Step 6: E2E: server PATCH rules and the spec**

Extend `SourcesServer` (the rules of `PlatformUpdate`, `core/platform_rules.py` and `update_platform`; validation answers 422 with the field's `loc`, never echoing the value):

```ts
const SCHEDULE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PATCHABLE = new Set([
  "name", "url", "url_pattern", "is_active", "schedule_time", "schedule_days", "notification_adapters",
  "pushover_template", "resend_template", "mailjet_template", "smtp_template",
  "resend_recipients", "mailjet_recipients", "smtp_recipients",
]);
const PRIVATE_HOST = /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/;
const invalid = (field: string) => reply(422, { detail: [{ loc: ["body", field], msg: "invalid", type: "value_error" }] });

function patchError(current: PlatformBody, sent: Record<string, unknown>): string | null {
  if ("schedule_time" in sent && sent.schedule_time !== null && !SCHEDULE_TIME.test(String(sent.schedule_time))) return "schedule_time";
  const days = sent.schedule_days;
  if (Array.isArray(days) && (days.length === 0 || days.some((d) => d < 0 || d > 6))) return "schedule_days";
  if ("name" in sent && !String(sent.name).trim()) return "name";
  if ("url_pattern" in sent && !String(sent.url_pattern).trim().replaceAll("/", "")) return "url_pattern";
  if ("url" in sent && PRIVATE_HOST.test(new URL(String(sent.url)).host)) return "url";
  const time = "schedule_time" in sent ? sent.schedule_time : current.schedule_time;
  const nextDays = "schedule_days" in sent ? sent.schedule_days : current.schedule_days;
  if ((time == null) !== (nextDays == null)) return time == null ? "schedule_time" : "schedule_days";
  return null;
}
```

and the method:

```ts
  /** PATCH /platforms/{id}: partial, validated, answers the stored platform (never the request). */
  patch(id: number, sent: unknown): unknown {
    const body = sent as Record<string, unknown>;
    const unknown = Object.keys(body).filter((key) => !PATCHABLE.has(key));
    if (unknown.length > 0) throw new Error(`sources server: unknown PATCH field ${unknown}`);
    const field = patchError(this.get(id), body);
    if (field) return invalid(field);
    Object.assign(this.get(id), body);
    return structuredClone(this.get(id));
  }
```

(Split `patchError` into two helpers to stay under 20 lines.) Add `[`PATCH ${platformPath(p.id)}`]: live((sent) => server.patch(p.id, sent))` and `[`POST ${platformNamePath(p.id)}`]: { body: { id: p.id, name: `${p.name} Jobs` } }` per platform to `crawlRoutes` (rename it `platformRoutes`; update Task 8's spec import).

`web/tests/e2e/sourcesDrawer.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { STEPSTONE } from "./support/platformFixtures";
import { SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quelle StepStone" });
const section = (page: Page, name: string) => drawer(page).locator("form").filter({ has: page.getByRole("heading", { name }) });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the drawer shows a source at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(sourcesRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/sources");
      await page.getByRole("link", { name: "StepStone" }).click();
      await expect(drawer(page)).toBeVisible();
      await expect(drawer(page).getByLabel("Uhrzeit")).toHaveValue("14:00");
      await expect(drawer(page).getByText("Uhrzeit in deiner Zeitzone (Europe/Berlin).")).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await page.mouse.move(0, 0);
      await saveScreenshot(page, `sources-drawer-${size}-${scheme}`);
    });
  }
}

test("turning the schedule off saves nulls and the row says manual", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  await mockApi(sourcesRoutes(server));
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Zeitplan").getByLabel("Automatisch durchsuchen").uncheck();
  await section(page, "Zeitplan").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect([server.get(STEPSTONE.id).schedule_time, server.get(STEPSTONE.id).schedule_days]).toEqual([null, null]);
  await drawer(page).getByRole("button", { name: "Schließen" }).click();
  await expect(page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: "StepStone" })).toContainText("Nur manuell");
  await expect(page.getByRole("link", { name: "StepStone" })).toBeFocused();
});

test("closing with an unsaved schedule asks first", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Zeitplan").getByLabel("Uhrzeit").fill("07:30");
  await drawer(page).getByRole("button", { name: "Schließen" }).click();
  await page.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(section(page, "Zeitplan").getByLabel("Uhrzeit")).toHaveValue("07:30");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/sources$/);
  // Opened by a deep link: no trigger to return to, so focus goes to the row (never <body>).
  await expect(page.getByRole("link", { name: "StepStone" })).toBeFocused();
});

test("a private address is refused on the field", async ({ page, mockApi }) => {
  await mockApi(sourcesRoutes());
  await page.goto(`/sources?quelle=${STEPSTONE.id}`);
  await section(page, "Quelle").getByLabel("Adresse der Suchergebnisseite").fill("http://127.0.0.1/jobs");
  await section(page, "Quelle").getByRole("button", { name: "Speichern" }).click();
  await expect(section(page, "Quelle").getByText("Diese Adresse kann nicht geprüft werden.")).toBeVisible();
});
```

(The 422 is logged by Chromium as a failed resource: add `test.use({ allowedConsoleErrors: [/status of 422/] })` in a `describe` around the last test.) Note that `parseImportUrl` accepts `http://127.0.0.1/jobs` (dotted host), so the request reaches the FakeServer, which answers 422 like the real one.

- [ ] **Step 7: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 10: Drawer: notifications per channel (template, recipients, test send)

**Files:**
- Create: `web/src/features/sources/drawer/NotifySection.tsx`, `ChannelRow.tsx`, `notifyDraft.ts`; `web/tests/unit/features/sources/notify.test.tsx`, `web/tests/e2e/sourcesNotify.spec.ts`
- Modify: `web/src/features/sources/drawer/SourceDrawer.tsx` (third section), `web/src/features/shell/navigation.ts` (`NOTIFICATION_SETTINGS_HREF`), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (test send routes), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `channelStatusQueryOptions`, `notificationTemplatesQueryOptions`, `NotificationTemplate`, `sendPlatformTest`, `NOTIFY_CHANNELS`, `CHANNEL_TEMPLATE_FIELD`, `CHANNEL_RECIPIENTS_FIELD`, `CHANNEL_TEMPLATE_TYPES` (Task 5); `parseRecipients`, `templateChoice`, `DEFAULT_TEMPLATE`, `CUSTOM_TEMPLATE` (Task 6); `CHANNEL_LABEL`; `useSectionForm`, `useSectionSave`, `useDirtySections` report (Task 9).
- Produces: `NotifyDraft { adapters: NotifyChannel[]; templates: Record<NotifyChannel, string | null>; recipients: Record<EmailChannel, string> }`, `EmailChannel = Exclude<NotifyChannel, "PUSHOVER">`, `notifyDraftOf(platform)`, `notifyPatch(draft): PlatformPatch`, `notifyErrors(draft): Partial<Record<EmailChannel, MessageKey>>`, `templatesFor(channel, templates)`, `NOTIFICATION_SETTINGS_HREF = "/settings?section=notifications"`; `NotifySection({ platform, report })`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/notify.test.tsx` (setup as in `drawer.test.tsx`; `sourcesStubs` answers channels `{ PUSHOVER: true, SMTP: true }` and the two templates of `support/sourcesServer.ts`' `TEMPLATES`; add them to `tests/unit/support/sourcesRoutes.ts` as `CHANNELS` and `TEMPLATES`):

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse } from "../../support/fakeFetch";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs, TEMPLATES } from "../../support/sourcesRoutes";

const BAD_REQUEST = 400;
const notify = async () => {
  const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
  return within(panel).getByRole("form", { name: "Benachrichtigungen" });
};
const patches = (calls: { method: string; body: string | null }[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body!));

describe("notifications of a source", () => {
  it("an unconfigured channel cannot be switched on and points to the settings", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByLabelText("Mailjet benachrichtigen")).toBeDisabled();
    expect(within(form).getAllByRole("link", { name: "In den Einstellungen einrichten" })[0]).toHaveAttribute(
      "href",
      "/settings?section=notifications",
    );
  });

  it("an email channel needs a valid recipient", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText("Empfänger"), "ich@example.com, kaputt");
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    expect(await within(form).findByText("Gib mindestens eine gültige E-Mail-Adresse ein.")).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("saves all notification fields, a chosen template as its content", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText("Empfänger"), "ich@example.com");
    await userEvent.selectOptions(within(form).getByLabelText("Vorlage für SMTP"), "Wochenmail (global)");
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        {
          notification_adapters: ["PUSHOVER", "SMTP"],
          pushover_template: null,
          resend_template: null,
          mailjet_template: null,
          smtp_template: TEMPLATES[1]!.content,
          resend_recipients: null,
          mailjet_recipients: null,
          smtp_recipients: ["ich@example.com"],
        },
      ]),
    );
  });

  it("saving notifications keeps the schedule draft", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
    await userEvent.clear(within(panel).getByLabelText("Uhrzeit"));
    await userEvent.type(within(panel).getByLabelText("Uhrzeit"), "07:30");
    const form = await notify();
    await userEvent.selectOptions(await within(form).findByLabelText("Vorlage für Pushover"), "Kurz");
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]).not.toHaveProperty("schedule_time");
    expect(within(panel).getByLabelText("Uhrzeit")).toHaveValue("07:30");
  });

  it("a test send waits for a save and names a missing setup", async () => {
    sourcesStubs(undefined, {
      "PATCH /platforms/1": SOURCE_A,
      "POST /platforms/1/test-pushover": () => jsonResponse(BAD_REQUEST, { detail: "Pushover credentials not configured" }),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const test = await within(form).findByRole("button", { name: "Test über Pushover senden" });
    await userEvent.selectOptions(within(form).getByLabelText("Vorlage für Pushover"), "Kurz");
    expect(test).toHaveAttribute("aria-disabled", "true");
    expect(test).toHaveAccessibleDescription("Erst speichern.");
    await userEvent.click(within(form).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(test).not.toHaveAttribute("aria-disabled", "true"));
    await userEvent.click(test);
    expect(await screen.findByText("Für Pushover fehlen Zugangsdaten oder Empfänger.")).toBeInTheDocument();
    expect(screen.queryByText(/credentials not configured/)).toBeNull();
  });

  it("keeps a stored text that matches no template", async () => {
    sourcesStubs([{ ...SOURCE_A, pushover_template: "eigener Text $title" }]);
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByLabelText("Vorlage für Pushover")).toHaveDisplayValue("Eigene Vorlage (beibehalten)");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/notify.test.tsx`
Expected: FAIL: no form "Benachrichtigungen".

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.section.notify": "Benachrichtigungen",                       // "Notifications"
  "sources.notify.intro": "Neue passende Stellen dieser Quelle melden über:", // "Report new matching postings of this source via:"
  "sources.notify.channel": "{channel} benachrichtigen",                // "Notify via {channel}"
  "sources.notify.notConfigured": "Noch nicht eingerichtet.",           // "Not set up yet."
  "sources.notify.toSettings": "In den Einstellungen einrichten",       // "Set up in settings"
  "sources.notify.recipients": "Empfänger",                             // "Recipients"
  "sources.notify.recipientsHint": "Mehrere Adressen mit Komma trennen.", // "Separate several addresses with commas."
  "sources.error.recipients": "Gib mindestens eine gültige E-Mail-Adresse ein.", // "Enter at least one valid email address."
  "sources.notify.template": "Vorlage für {channel}",                   // "Template for {channel}"
  "sources.notify.templateDefault": "Standard",                         // "Default"
  "sources.notify.templateCustom": "Eigene Vorlage (beibehalten)",      // "Custom template (kept)"
  "sources.notify.templateGlobal": "{name} (global)",                   // "{name} (global)"
  "sources.notify.test": "Test senden",                                 // "Send test"
  "sources.notify.testLabel": "Test über {channel} senden",             // "Send a test via {channel}"
  "sources.notify.saveFirst": "Erst speichern.",                        // "Save first."
  "sources.notify.testSent": "Test über {channel} gesendet.",           // "Test sent via {channel}."
  "sources.notify.testMissing": "Für {channel} fehlen Zugangsdaten oder Empfänger.", // "{channel} lacks credentials or recipients."
  "sources.notify.testFailed": "Senden über {channel} hat nicht geklappt.", // "Sending via {channel} failed."
  "sources.notify.loadFailed": "Die Benachrichtigungs-Einstellungen konnten nicht geladen werden.",
    // "The notification settings could not be loaded."
```

- [ ] **Step 4: Draft rules**

`drawer/notifyDraft.ts`:

```ts
import type { NotificationTemplate } from "@/api/notifications";
import {
  CHANNEL_RECIPIENTS_FIELD,
  CHANNEL_TEMPLATE_FIELD,
  CHANNEL_TEMPLATE_TYPES,
  NOTIFY_CHANNELS,
  type NotifyChannel,
} from "@/api/platformPaths";
import type { Platform, PlatformPatch } from "@/api/platforms";
import { parseRecipients } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";

export type EmailChannel = Exclude<NotifyChannel, "PUSHOVER">;
export const EMAIL_CHANNELS: readonly EmailChannel[] = ["RESEND", "MAILJET", "SMTP"];
const LIST = ", ";

export interface NotifyDraft {
  adapters: NotifyChannel[];
  templates: Record<NotifyChannel, string | null>;
  recipients: Record<EmailChannel, string>;
}

const isChannel = (value: string): value is NotifyChannel => (NOTIFY_CHANNELS as readonly string[]).includes(value);

export function notifyDraftOf(platform: Platform): NotifyDraft {
  const templates = Object.fromEntries(
    NOTIFY_CHANNELS.map((channel) => [channel, platform[CHANNEL_TEMPLATE_FIELD[channel]] ?? null]),
  ) as Record<NotifyChannel, string | null>;
  const recipients = Object.fromEntries(
    EMAIL_CHANNELS.map((channel) => [channel, (platform[CHANNEL_RECIPIENTS_FIELD[channel]] ?? []).join(LIST)]),
  ) as Record<EmailChannel, string>;
  return { adapters: (platform.notification_adapters ?? []).filter(isChannel), templates, recipients };
}

/** One section, one PATCH with every notification field (D7). Adapters keep the server's order. */
export function notifyPatch(draft: NotifyDraft): PlatformPatch {
  const patch: PlatformPatch = { notification_adapters: NOTIFY_CHANNELS.filter((c) => draft.adapters.includes(c)) };
  for (const channel of NOTIFY_CHANNELS) patch[CHANNEL_TEMPLATE_FIELD[channel]] = draft.templates[channel];
  for (const channel of EMAIL_CHANNELS) {
    const list = parseRecipients(draft.recipients[channel]).list;
    patch[CHANNEL_RECIPIENTS_FIELD[channel]] = list.length > 0 ? list : null;
  }
  return patch;
}

/** An active email channel needs a recipient; any address must look like one. */
export function notifyErrors(draft: NotifyDraft): Partial<Record<EmailChannel, MessageKey>> {
  const errors: Partial<Record<EmailChannel, MessageKey>> = {};
  for (const channel of EMAIL_CHANNELS) {
    const { list, invalid } = parseRecipients(draft.recipients[channel]);
    const missing = draft.adapters.includes(channel) && list.length === 0;
    if (missing || invalid) errors[channel] = "sources.error.recipients";
  }
  return errors;
}

export function templatesFor(channel: NotifyChannel, templates: readonly NotificationTemplate[]): NotificationTemplate[] {
  return templates.filter((template) => CHANNEL_TEMPLATE_TYPES[channel].includes(template.type));
}
```

(`patch[CHANNEL_TEMPLATE_FIELD[channel]] = ...` needs the field types to be keys of `PlatformPatch`; they are, as `as const` literals.)

- [ ] **Step 5: Section and channel row**

`NotifySection.tsx`: a `<form aria-labelledby="src-notify-h">` (so it has the accessible name "Benachrichtigungen") with the heading, the intro sentence, one `ChannelRow` per channel and the save foot. It reads `channelStatusQueryOptions()` and `notificationTemplatesQueryOptions()`; while either loads, a `ListLoading`-style skeleton line; if either fails, `Notice tone="error" announce={false}` with `sources.notify.loadFailed` and an "Erneut versuchen" button that refetches both; no channel controls render without both answers (bounded: shows the error as soon as one failed). Submit: `notifyErrors(draft)` -> field errors and stop; else `save.mutate(notifyPatch(draft), { onSuccess: () => form.commit(sent) })`. It reports `"notify"` dirtiness like the other sections.

`ChannelRow.tsx` (props `{ channel, configured, draft, onChange, error, templates, platformId, dirty }`):
- `CheckField` `sources.notify.channel` with `{channel: t(CHANNEL_LABEL[channel])}`; `disabled={!configured && !active}` (an active but unconfigured channel can still be switched off).
- unconfigured: `<p className="hint">` "Noch nicht eingerichtet." plus `<Link className="link" href={NOTIFICATION_SETTINGS_HREF}>` "In den Einstellungen einrichten".
- when active: email channels a `TextField` "Empfänger" (hint, `error`); a `SelectField` labelled `sources.notify.template` with options: `DEFAULT_TEMPLATE` -> "Standard", each of `templatesFor(channel, templates)` (`String(id)` -> its name, or `sources.notify.templateGlobal` for `is_admin`), and `CUSTOM_TEMPLATE` -> "Eigene Vorlage (beibehalten)" only when `templateChoice(...)` is custom. Change: default -> `null`; custom -> keep the stored content; an id -> that template's `content`.
- "Test senden" (`Button size="sm"`, `aria-label` `sources.notify.testLabel`, `inactive={dirty}`, `aria-describedby` to an sr-only "Erst speichern." while dirty, `busy` while sending). Mutation `sendPlatformTest({ id, channel })`; success toast `sources.notify.testSent`; `BAD_REQUEST` -> `sources.notify.testMissing`, anything else -> `sources.notify.testFailed` (`describeError(error, t, { BAD_REQUEST: ..., SERVER_ERROR: ... })` is not usable here because the keys take `{channel}`; map the code yourself).

Split into `ChannelToggle`, `ChannelOptions`, `TemplateSelect`, `TestSendButton` to stay at 20 lines per function.

`navigation.ts`: add next to `AI_SETTINGS_HREF`: `export const NOTIFICATION_SETTINGS_HREF = "/settings?section=notifications";` and extend the comment ("... and its notification channels on ?section=notifications (phase 7)").

Add `<NotifySection platform={platform} report={report} />` to `SourceDrawer` after the schedule section.

- [ ] **Step 6: E2E**

In `sourcesServer.ts`' `platformRoutes`, per platform and channel: `[`POST ${platformTestPath(p.id, channel)}`]: live(() => server.testSend(p.id, channel))` with

```ts
  /** The test endpoints' rules: 400 without credentials, or without recipients for an email channel. */
  testSend(id: number, channel: NotifyChannel): unknown {
    const field = CHANNEL_RECIPIENTS_FIELD[channel];
    const recipients = field ? this.get(id)[field] ?? [] : ["device"];
    if (!CHANNELS[channel] || recipients.length === 0) return reply(400, { detail: "not configured" });
    return { ok: true };
  }
```

`web/tests/e2e/sourcesNotify.spec.ts`: one screenshot loop (1440/390, light/dark) of the drawer scrolled to "Benachrichtigungen" with SMTP switched on and the global template chosen, then:
- "SMTP with recipients and the global template is saved as content": fill, save, `expect(server.get(1).smtp_template).toBe(TEMPLATES[1].content)` and `smtp_recipients` equal `["ich@example.com"]`; then "Test über SMTP senden" -> toast "Test über SMTP gesendet.".
- "Mailjet without credentials points to the settings": the checkbox is disabled and the link has `href="/settings?section=notifications"`.
- `horizontalOverflow` 0 at 390; the test button is at least 44 px high at 390.

- [ ] **Step 7: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 11: Drawer: run history and delete

**Files:**
- Create: `web/src/features/sources/drawer/RunHistory.tsx`, `DeleteSource.tsx`; `web/tests/unit/features/sources/runsAndDelete.test.tsx`, `web/tests/e2e/sourcesDelete.spec.ts`
- Modify: `web/src/features/sources/drawer/SourceDrawer.tsx` (fourth and fifth section, `onDeleted`), `web/src/features/sources/SourcesPage.tsx` (pass `onDeleted`), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (`runsOf`, `delete`, kept jobs), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `platformRunsQueryOptions`, `deletePlatform`, `PlatformRun` (Task 5); `summarizeRun`, `RUN_ERROR_LABEL` (Task 6); `runResult` (Task 7 `RunCell.tsx`); `runningTaskOf` (Task 7); `focusSourceOrTitle` (Task 7); `Dialog`, `PanelHeader`, `Button`, `Notice`, `formatDayTime`.
- Produces: `RunHistory({ platformId })`; `DeleteSource({ platform, running, onDeleted })`; `SourceDrawerProps.onDeleted: () => void` (closes without the leave question: the user just confirmed a destructive action); e2e `SourcesServer.runsOf(id)`, `SourcesServer.delete(id)`, `SourcesServer.keptJobs` (per platform), `SourcesServer.addRuns(id, runs)`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/runsAndDelete.test.tsx` (setup as in `drawer.test.tsx`):

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

const RUNS = [
  { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3, seeded: false, error: null },
  { finished_at: "2026-10-07T06:00:00+00:00", found: 0, new: 0, matched: 0, seeded: false, error: "unreachable" },
  { finished_at: "2026-10-06T06:00:00+00:00", found: 40, new: 40, matched: 0, seeded: true, error: null },
];
const panel = () => screen.findByRole("dialog", { name: "Quelle StepStone" });

describe("run history", () => {
  it("lists the runs newest first with result, failure and seed run", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": RUNS });
    renderWithProviders(<SourcesPage />);
    const runs = within(await panel()).getByRole("list", { name: "Letzte Läufe" });
    await waitFor(() => expect(within(runs).getAllByRole("listitem")).toHaveLength(3));
    expect(within(runs).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "heute 08:00: 12 gefunden, 3 passend, 2 unter Schwellwert",
      "gestern 08:00: fehlgeschlagen (Seite nicht erreichbar)",
      expect.stringMatching(/: 40 als bekannt gemerkt$/),
    ]);
  });

  it("says when there is no run yet", async () => {
    sourcesStubs(undefined, { "GET /platforms/1/runs": [] });
    renderWithProviders(<SourcesPage />);
    expect(await within(await panel()).findByText("Noch kein Lauf.")).toBeInTheDocument();
  });
});

describe("delete", () => {
  it("is blocked while the source runs", async () => {
    sourcesStubs(undefined, {
      "GET /platforms/1/runs": [],
      "GET /scraper/crawl-status": { jobs: [{ job_id: "c1", platform: SOURCE_A.url, platform_id: 1, status: "crawling" }] },
    });
    renderWithProviders(<SourcesPage />);
    const button = await within(await panel()).findByRole("button", { name: "Quelle löschen" });
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).toHaveAccessibleDescription("Erst das Durchsuchen abbrechen.");
  });

  it("asks, deletes, says how many jobs stay and moves focus to the title", async () => {
    const calls = sourcesStubs(undefined, {
      "GET /platforms/1/runs": [],
      "DELETE /platforms/1": { status: "deleted", kept_jobs: 4 },
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await within(await panel()).findByRole("button", { name: "Quelle löschen" }));
    const dialog = await screen.findByRole("dialog", { name: "„StepStone“ löschen?" });
    expect(dialog).toHaveTextContent("Gefundene Stellen und Bewerbungen bleiben erhalten.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Quelle „StepStone“ gelöscht. 4 gefundene Stellen bleiben erhalten.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false });
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(MASTHEAD_TITLE_SELECTOR)));
  });

  it("a delete the server refuses during a crawl keeps the drawer and says why", async () => {
    sourcesStubs(undefined, {
      "GET /platforms/1/runs": [],
      "DELETE /platforms/1": () => jsonResponse(409, { detail: "Crawl running" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await within(await panel()).findByRole("button", { name: "Quelle löschen" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "„StepStone“ löschen?" })).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Erst das Durchsuchen abbrechen.")).toBeInTheDocument();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });
});
```

(Add `"GET /platforms/1/runs": []` and `"GET /platforms/2/runs": []` to `sourcesStubs`' defaults so the earlier drawer tests keep passing.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/runsAndDelete.test.tsx`
Expected: FAIL: no list "Letzte Läufe", no button "Quelle löschen".

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.section.runs": "Letzte Läufe",                               // "Recent runs"
  "sources.runs.empty": "Noch kein Lauf.",                              // "No runs yet."
  "sources.runs.loadFailed": "Die Läufe konnten nicht geladen werden.", // "The runs could not be loaded."
  "sources.delete.open": "Quelle löschen",                              // "Delete source"
  "sources.delete.title": "„{name}“ löschen?",                          // "Delete “{name}”?"
  "sources.delete.text":
    "Zeitplan, Benachrichtigungen und Laufverlauf gehen verloren. Gefundene Stellen und Bewerbungen bleiben erhalten.",
    // "Schedule, notifications and run history are lost. Found postings and applications stay."
  "sources.delete.blocked": "Erst das Durchsuchen abbrechen.",          // "Cancel the search first."
  "sources.delete.done": "Quelle „{name}“ gelöscht.",                   // "Source “{name}” deleted."
  "sources.delete.doneKept": "Quelle „{name}“ gelöscht. {count} gefundene Stellen bleiben erhalten.",
    // "Source “{name}” deleted. {count} found postings stay."
```

- [ ] **Step 4: Components**

`RunHistory.tsx`: `useQuery(platformRunsQueryOptions(platformId))`; a section with `<h3 id="src-runs-h">` and `<ul aria-labelledby="src-runs-h" className="run-list">`; each item `t("sources.run.item", { when: formatDayTime(summary.finishedAt, t, { now, language }), result: runResult(summary, t) })` where `summary = summarizeRun(run)` (skip a run whose `finished_at` does not parse); a failed run's item gets `t-danger` with `CircleAlert`; loading: one skeleton line; error: `Notice tone="error" announce={false}` with `sources.runs.loadFailed` and "Erneut versuchen"; empty: `<p className="muted">` "Noch kein Lauf.".

`DeleteSource.tsx`:

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { describeError } from "@/api/describeError";
import { deletePlatform, type Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";

interface DeleteSourceProps {
  platform: Platform;
  running: boolean;
  onDeleted: () => void;
}

/** D9: confirm, delete (jobs stay), then close the drawer; blocked while the source crawls. */
export function DeleteSource({ platform, running, onDeleted }: DeleteSourceProps) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const reasonId = useId();
  const remove = useDeleteSource(platform, onDeleted);
  return (
    <section className="drawer-section drawer-danger">
      <Button
        variant="danger"
        icon={Trash2}
        inactive={running}
        aria-describedby={running ? reasonId : undefined}
        onClick={() => setAsking(true)}
      >
        {t("sources.delete.open")}
      </Button>
      {running ? <span id={reasonId} className="sr-only">{t("sources.delete.blocked")}</span> : null}
      <ConfirmDelete open={asking} platform={platform} busy={remove.isPending} onCancel={() => setAsking(false)} onConfirm={() => remove.mutate()} />
    </section>
  );
}
```

with `ConfirmDelete` (an app `Dialog` labelled `sources.delete.title`, `PanelHeader`, the `prose` text, buttons "Löschen" (`variant="danger"`, `busy`) and "Abbrechen" (`guard.cancel`, ghost)) and

```ts
function useDeleteSource(platform: Platform, onDeleted: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: () => deletePlatform(platform.id),
    onSuccess: (kept) => {
      queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) => list?.filter((p) => p.id !== platform.id));
      // Jobs lose their source, counts and the onboarding's "has a source" may change.
      for (const queryKey of [queryKeys.platforms, queryKeys.jobsRoot, queryKeys.jobCounts, queryKeys.setupStatus]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      const message = kept > 0 ? t("sources.delete.doneKept", { name: platform.name, count: kept }) : t("sources.delete.done", { name: platform.name });
      toast.show({ message, tone: "success" });
      onDeleted();
    },
    onError: (error) => toast.show({ message: describeError(error, t, { CONFLICT: "sources.delete.blocked" }), tone: "error" }),
  });
}
```

(Split as lint requires.) `SourceDrawer` adds `<RunHistory platformId={platform.id} />` and `<DeleteSource platform={platform} running={task !== null} onDeleted={onDeleted} />` (lift `task` from `DrawerSubline` into `SourceDrawer`); `SourcesPage` passes `onDeleted={() => { url.close(); focusSourceOrTitle(null); }}`. The dirty flag is cleared by `useDirtySections`' unmount effect, so no leave question follows a confirmed delete.

`sources.css`: `.run-list` (no bullets, grid gap 6 px, `font-size: var(--fs-13)`), `.drawer-danger` (top hairline, `padding-top: 20px`).

- [ ] **Step 5: E2E**

`SourcesServer`: a `runs` map (`addRuns(id, runs)`, `runsOf(id)` newest first, at most 10 for the route) and `finish()` also prepends a run built from the last run; `keptJobs` map (default `{ 1: 4, 2: 0 }`, as the jobs the user found from each source); `delete(id)`: 409 (`reply`) while `running.has(id)`, else remove the platform and its runs and answer `{ status: "deleted", kept_jobs: keptJobs.get(id) ?? 0 }`. Routes: `GET ${platformRunsPath(id)}` (exact key with the `?limit=10` query string) and `DELETE ${platformPath(id)}`.

`web/tests/e2e/sourcesDelete.spec.ts`:
- screenshot loop (1440/390, light/dark) of the drawer scrolled to "Letzte Läufe" with three runs (completed, failed, seed) and the open delete dialog.
- "deleting keeps the found jobs": open StepStone after cancelling its crawl through the server (`server.finish(1, {...})` before `goto`), delete, toast "Quelle „StepStone“ gelöscht. 4 gefundene Stellen bleiben erhalten.", the row is gone, the deck says "1 Quelle mit Fehler.", focus is on the `h1`.
- "a running source cannot be deleted": StepStone (crawl-1 running) -> the delete button is `aria-disabled` with the description.

- [ ] **Step 6: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---
### Task 12: Add wizard, steps 1-2: link check and link selection with "Erweitert"

**Files:**
- Create: `web/src/features/sources/wizard/AddSourceWizard.tsx`, `wizardState.ts`, `useLinkCheck.ts`, `CheckStep.tsx`, `LinksStep.tsx`; `web/tests/unit/features/sources/wizardState.test.ts`, `web/tests/unit/features/sources/wizard.test.tsx`, `web/tests/e2e/sourcesWizard.spec.ts`
- Modify: `web/src/features/sources/SourcesPage.tsx` (render the wizard on `url.adding`), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (`previewLinks`, `FOUND_LINKS`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `previewSourceLinks`, `PreviewLink` (Task 5); `suggestJobLinks`, `matchingCount`, `linkPath`, `firstErrorStep`, `SourceField`, `WizardStep`, `PENDING_SETUP` (Task 6); `parseImportUrl` (`features/inbox/import/importUrl.ts`); `hostOf`; `useUnsavedChanges`; `Drawer`, `PanelHeader`, `Stepper`, `Disclosure` (controlled), `TextField`, `Notice`, `Button`; `focusSourceOrTitle` (Task 7).
- Produces:
  - `wizardState.ts`: `WizardState { step; url; links; selected: string[]; filter; pattern; advancedOpen; name; schedule: ScheduleDraft; initialRun: InitialRun; errors: WizardErrors }`, `WizardErrors = Partial<Record<SourceField | "links", MessageKey>>`, `WizardAction` (union), `INITIAL_WIZARD`, `wizardReducer(state, action)`, `visibleLinks(state)`, `isWizardDirty(state)`.
  - `useLinkCheck(dispatch)`: `{ check(url): void; checking: boolean }` (aborts the previous and the pending check on unmount; a result that arrives after an abort is dropped).
  - `AddSourceWizard({ platforms, onClose, onOpenSource })`; step components `CheckStep`, `LinksStep` (Task 13 adds `FinishStep`).
  - E2E `FOUND_LINKS` (`PreviewLinksBody["links"]`, the prototype's list on `www.get-in-it.de`), `SourcesServer.previewLinks(sent)`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/wizardState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INITIAL_WIZARD, visibleLinks, wizardReducer, type WizardAction, type WizardState } from "@/features/sources/wizard/wizardState";

const LINKS = [
  { url: "https://x.de/jobsuche/p/java-1", text: "Java" },
  { url: "https://x.de/jobsuche/p/kotlin-2", text: "Kotlin" },
  { url: "https://x.de/unternehmen/top", text: "Unternehmen entdecken" },
];
const run = (...actions: WizardAction[]): WizardState => actions.reduce(wizardReducer, INITIAL_WIZARD);
const loaded = (): WizardAction[] => [{ type: "url", url: "https://x.de/jobs" }, { type: "linksLoaded", links: LINKS }];

describe("wizard state", () => {
  it("found links open step 2 with the job links preselected", () => {
    const state = run(...loaded());
    expect([state.step, state.selected]).toEqual([2, [LINKS[0]!.url, LINKS[1]!.url]]);
  });

  it("Zurück and Weiter keep every entry", () => {
    const state = run(...loaded(), { type: "toggle", url: LINKS[2]!.url }, { type: "pattern", pattern: "/p/" }, { type: "back" }, { type: "next" });
    expect([state.step, state.selected.length, state.pattern]).toEqual([2, 3, "/p/"]);
  });

  it("Weiter needs a link", () => {
    const state = run(...loaded(), { type: "selectNone", urls: LINKS.map((link) => link.url) }, { type: "next" });
    expect([state.step, state.errors.links]).toEqual([2, "sources.wizard.pickOne"]);
  });

  it("filters over text and path, and select all only takes the visible ones", () => {
    const filtered = run(...loaded(), { type: "selectNone", urls: LINKS.map((l) => l.url) }, { type: "filter", filter: "kotlin" });
    expect(visibleLinks(filtered).map((link) => link.text)).toEqual(["Kotlin"]);
    expect(wizardReducer(filtered, { type: "selectAll", urls: visibleLinks(filtered).map((l) => l.url) }).selected).toEqual([LINKS[1]!.url]);
  });

  it("server field errors jump to the earliest step and open Erweitert for the pattern", () => {
    const state = run(...loaded(), { type: "next" }, { type: "serverErrors", fields: ["name", "url_pattern"] });
    expect([state.step, state.advancedOpen, state.errors.url_pattern]).toEqual([2, true, "sources.error.pattern"]);
  });

  it("is dirty from the first typed character", () => {
    expect([run().step, wizardReducer(INITIAL_WIZARD, { type: "url", url: "h" }).url !== ""]).toEqual([1, true]);
  });
});
```

`web/tests/unit/features/sources/wizard.test.tsx` (navigation mock as before, `liveNavigation.reset("add=1")`):

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse } from "../../support/fakeFetch";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs } from "../../support/sourcesRoutes";

const wizard = () => screen.findByRole("dialog", { name: "Quelle hinzufügen" });
const LINKS = { links: [{ url: "https://www.get-in-it.de/jobsuche/p/java-1", text: "Java" }, { url: "https://www.get-in-it.de/jobsuche/p/go-2", text: "Go" }] };

async function check(url: string) {
  const dialog = await wizard();
  await userEvent.type(within(dialog).getByLabelText("Adresse einer Suchergebnisseite"), url);
  await userEvent.click(within(dialog).getByRole("button", { name: "Seite prüfen" }));
  return dialog;
}

describe("add wizard, steps 1 and 2", () => {
  it("?add=1 opens step 1 as the current step", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await wizard();
    expect(within(dialog).getByRole("listitem", { current: "step" })).toHaveTextContent("Seite prüfen");
  });

  it("an address that is already a source is caught before the check", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const dialog = await check(SOURCE_A.url);
    expect(await within(dialog).findByText("Diese Quelle gibt es schon.")).toBeInTheDocument();
    expect(calls.some((call) => call.url.endsWith("/platforms/preview-links"))).toBe(false);
  });

  it("a refused address shows on the field", async () => {
    sourcesStubs(undefined, {
      "POST /platforms/preview-links": () => jsonResponse(422, { detail: [{ loc: ["body", "url"], msg: "url_not_public", type: "value_error" }] }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("http://10.0.0.5/jobs");
    expect(await within(dialog).findByText("Diese Adresse kann nicht geprüft werden.")).toBeInTheDocument();
    expect(within(dialog).queryByText("url_not_public")).toBeNull();
  });

  it("a page without links stays on step 1", async () => {
    sourcesStubs(undefined, { "POST /platforms/preview-links": { links: [] } });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://leer.example.com/jobs");
    expect(await within(dialog).findByText(/keine Links gefunden/)).toBeInTheDocument();
  });

  it("found links show with the count, the pattern counts matches under Erweitert", async () => {
    sourcesStubs(undefined, { "POST /platforms/preview-links": LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await check("https://www.get-in-it.de/jobsuche?q=java");
    expect(await within(dialog).findByText("Auf www.get-in-it.de wurden 2 Links gefunden. Wähle die Stellenanzeigen aus.")).toBeInTheDocument();
    expect(within(dialog).getByText("2 ausgewählt")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Erweitert" }));
    await userEvent.type(within(dialog).getByLabelText("URL-Muster"), "/jobsuche/p/");
    expect(within(dialog).getByText("2 von 2 gefundenen Links enthalten dieses Muster.")).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText("URL-Muster"));
    await userEvent.type(within(dialog).getByLabelText("URL-Muster"), "/nirgends/");
    expect(within(dialog).getByText("Kein gefundener Link enthält dieses Muster.")).toBeInTheDocument();
  });

  it("closing during the check asks first and then drops the late result", async () => {
    let answer: (value: Response) => void = () => {};
    sourcesStubs(undefined, { "POST /platforms/preview-links": () => new Promise<Response>((resolve) => (answer = resolve)) });
    renderWithProviders(<SourcesPage />);
    await check("https://www.get-in-it.de/jobsuche?q=java");
    expect(await screen.findByText(/Seite wird geladen/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Änderungen verwerfen" }));
    answer(jsonResponse(200, LINKS));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quelle hinzufügen" })).toBeNull());
    expect(screen.queryByText(/Links gefunden/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/wizardState.test.ts tests/unit/features/sources/wizard.test.tsx`
Expected: FAIL: unresolved `@/features/sources/wizard/wizardState`; no dialog "Quelle hinzufügen".

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.wizard.steps": "Schritte",                                  // "Steps"
  "sources.wizard.step1": "Seite prüfen",                              // "Check page"
  "sources.wizard.step2": "Stellenlinks wählen",                       // "Choose job links"
  "sources.wizard.step3": "Name und Zeitplan",                         // "Name and schedule"
  "sources.wizard.url": "Adresse einer Suchergebnisseite",             // "Address of a search results page"
  "sources.wizard.urlHint":
    "Am besten eine Seite, die schon nach Rolle und Ort gefiltert ist. Auch die Karriereseite eines Unternehmens funktioniert.",
    // "Ideally a page already filtered by role and place. A company's careers page works too."
  "sources.wizard.urlPlaceholder": "https://www.example.com/jobs?q=kotlin", // same
  "sources.wizard.checking": "Seite wird geladen und nach Stellenlinks durchsucht. Das kann bis zu einer Minute dauern.",
    // "Loading the page and looking for job links. This can take up to a minute."
  "sources.wizard.duplicate": "Diese Quelle gibt es schon.",           // "This source already exists."
  "sources.wizard.noLinks": "Auf dieser Seite wurden keine Links gefunden. Versuche eine Suchergebnisseite.",
    // "No links were found on this page. Try a search results page."
  "sources.wizard.loadFailed": "Die Seite konnte nicht geladen werden.", // "The page could not be loaded."
  "sources.wizard.found": "Auf {host} wurden {count} Links gefunden. Wähle die Stellenanzeigen aus.",
    // "{count} links were found on {host}. Choose the job postings."
  "sources.wizard.filter": "Links filtern",                            // "Filter links"
  "sources.wizard.all": "Alle auswählen",                              // "Select all"
  "sources.wizard.none": "Keine",                                      // "None"
  "sources.wizard.selected": "{count} ausgewählt",                     // "{count} selected"
  "sources.wizard.pickOne": "Wähle mindestens einen Link.",            // "Choose at least one link."
  "sources.wizard.patternHint":
    "Leer lassen: wird aus den ausgewählten Links ermittelt. Nur Links, die diesen Text enthalten, werden als Stelle gelesen.",
    // "Leave empty to derive it from the chosen links. Only links containing this text are read as postings."
  "sources.wizard.patternMatches": "{matching} von {total} gefundenen Links enthalten dieses Muster.",
    // "{matching} of {total} links found contain this pattern."
  "sources.wizard.patternNone": "Kein gefundener Link enthält dieses Muster.", // "No link found contains this pattern."
  "sources.wizard.back": "Zurück",                                     // "Back"
  "sources.wizard.next": "Weiter",                                     // "Next"
```

- [ ] **Step 4: State**

`wizard/wizardState.ts`:

```ts
import type { InitialRun } from "@/api/platformPaths";
import type { PreviewLink } from "@/api/platforms";
import { DEFAULT_SCHEDULE, firstErrorStep, suggestJobLinks, type SourceField, type WizardStep } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import type { ScheduleDraft } from "../drawer/ScheduleFields";

export type WizardErrors = Partial<Record<SourceField | "links", MessageKey>>;

export interface WizardState {
  step: WizardStep;
  url: string;
  links: PreviewLink[];
  selected: string[];
  filter: string;
  pattern: string;
  advancedOpen: boolean;
  name: string;
  schedule: ScheduleDraft;
  initialRun: InitialRun;
  errors: WizardErrors;
}

export type WizardAction =
  | { type: "url"; url: string }
  | { type: "linksLoaded"; links: PreviewLink[] }
  | { type: "errors"; errors: WizardErrors }
  | { type: "toggle"; url: string }
  | { type: "selectAll" | "selectNone"; urls: string[] }
  | { type: "filter"; filter: string }
  | { type: "pattern"; pattern: string }
  | { type: "advanced"; open: boolean }
  | { type: "name"; name: string }
  | { type: "schedule"; schedule: ScheduleDraft }
  | { type: "initialRun"; initialRun: InitialRun }
  | { type: "back" | "next" }
  | { type: "serverErrors"; fields: SourceField[] };

/** D10: step 3 starts with the schedule on (Mo-Fr 08:00) and the seed run (B8 default). */
export const INITIAL_WIZARD: WizardState = {
  step: 1,
  url: "",
  links: [],
  selected: [],
  filter: "",
  pattern: "",
  advancedOpen: false,
  name: "",
  schedule: { enabled: true, ...DEFAULT_SCHEDULE },
  initialRun: "seed",
  errors: {},
};

// Fixed texts per field; the server's own message is never shown.
const SERVER_ERROR_TEXT: Readonly<Record<SourceField, MessageKey>> = {
  url: "sources.error.url",
  selected_urls: "sources.wizard.pickOne",
  url_pattern: "sources.error.pattern",
  name: "sources.error.name",
  schedule_time: "sources.error.time",
  schedule_days: "sources.error.days",
};

export function visibleLinks(state: WizardState): PreviewLink[] {
  const needle = state.filter.trim().toLowerCase();
  if (!needle) return state.links;
  return state.links.filter((link) => `${link.text} ${link.url}`.toLowerCase().includes(needle));
}

export function isWizardDirty(state: WizardState): boolean {
  return state.url.trim() !== "";
}

function withSelection(state: WizardState, urls: string[], on: boolean): WizardState {
  const rest = state.selected.filter((url) => !urls.includes(url));
  return { ...state, selected: on ? [...rest, ...urls] : rest, errors: {} };
}

function serverErrors(state: WizardState, fields: SourceField[]): WizardState {
  const errors = Object.fromEntries(fields.map((field) => [field, SERVER_ERROR_TEXT[field]])) as WizardErrors;
  const step = firstErrorStep(fields) ?? state.step;
  return { ...state, errors, step, advancedOpen: state.advancedOpen || fields.includes("url_pattern") };
}

function next(state: WizardState): WizardState {
  if (state.step === 2 && state.selected.length === 0) return { ...state, errors: { links: "sources.wizard.pickOne" } };
  return { ...state, step: Math.min(3, state.step + 1) as WizardStep, errors: {} };
}

type Handlers = { [K in WizardAction["type"]]: (state: WizardState, action: Extract<WizardAction, { type: K }>) => WizardState };

const HANDLERS: Handlers = {
  url: (state, { url }) => ({ ...state, url, errors: {} }),
  linksLoaded: (state, { links }) => ({ ...state, links, selected: suggestJobLinks(links), filter: "", step: 2, errors: {} }),
  errors: (state, { errors }) => ({ ...state, errors }),
  toggle: (state, { url }) => withSelection(state, [url], !state.selected.includes(url)),
  selectAll: (state, { urls }) => withSelection(state, urls, true),
  selectNone: (state, { urls }) => withSelection(state, urls, false),
  filter: (state, { filter }) => ({ ...state, filter }),
  pattern: (state, { pattern }) => ({ ...state, pattern }),
  advanced: (state, { open }) => ({ ...state, advancedOpen: open }),
  name: (state, { name }) => ({ ...state, name }),
  schedule: (state, { schedule }) => ({ ...state, schedule }),
  initialRun: (state, { initialRun }) => ({ ...state, initialRun }),
  back: (state) => ({ ...state, step: Math.max(1, state.step - 1) as WizardStep, errors: {} }),
  next,
  serverErrors: (state, { fields }) => serverErrors(state, fields),
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  // TypeScript cannot correlate HANDLERS[action.type] with the action's own type; the mapped type guarantees it.
  const handler = HANDLERS[action.type] as (state: WizardState, action: WizardAction) => WizardState;
  return handler(state, action);
}
```

(`selectAll`/`selectNone` share one union member; give them separate members if the mapped `Handlers` type does not narrow them, and keep the keys.)

- [ ] **Step 5: Link check**

`wizard/useLinkCheck.ts`:

```ts
"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { ApiError } from "@/api/errors";
import { previewSourceLinks, type PreviewLink } from "@/api/platforms";
import { sectionFieldErrors } from "../drawer/useSectionSave";
import type { WizardAction } from "./wizardState";

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function resultAction(links: PreviewLink[]): WizardAction {
  return links.length > 0 ? { type: "linksLoaded", links } : { type: "errors", errors: { url: "sources.wizard.noLinks" } };
}

function errorAction(error: unknown): WizardAction {
  const refused = error instanceof ApiError && sectionFieldErrors(error).includes("url");
  return { type: "errors", errors: { url: refused ? "sources.error.url" : "sources.wizard.loadFailed" } };
}

/** D10 step 1: up to 90 s; a newer check, Zurück or closing aborts the older one (G21). */
export function useLinkCheck(dispatch: Dispatch<WizardAction>) {
  const controller = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  const check = (url: string) => {
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    setChecking(true);
    previewSourceLinks({ url, signal: own.signal })
      .then((links) => !own.signal.aborted && dispatch(resultAction(links)))
      .catch((error: unknown) => !isAbort(error) && !own.signal.aborted && dispatch(errorAction(error)))
      .finally(() => !own.signal.aborted && setChecking(false));
  };
  return { check, checking };
}
```

- [ ] **Step 6: Wizard frame and the two steps**

`wizard/AddSourceWizard.tsx`:

```tsx
"use client";

import { useEffect, useReducer } from "react";
import type { Platform } from "@/api/platforms";
import { useI18n } from "@/i18n/useI18n";
import { Drawer } from "@/ui/Drawer";
import { PanelHeader } from "@/ui/PanelHeader";
import { Stepper, type StepItem } from "@/ui/Stepper";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { CheckStep } from "./CheckStep";
import { LinksStep } from "./LinksStep";
import { INITIAL_WIZARD, isWizardDirty, wizardReducer, type WizardState } from "./wizardState";

const STEP_KEYS = ["sources.wizard.step1", "sources.wizard.step2", "sources.wizard.step3"] as const;

export interface AddSourceWizardProps {
  platforms: readonly Platform[];
  onClose: () => void;
  onOpenSource: (id: number) => void;
}

function useWizardDirty(state: WizardState) {
  const { setDirty, requestLeave } = useUnsavedChanges();
  const dirty = isWizardDirty(state);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  return requestLeave;
}

/** D10: the three steps in one narrow drawer; the steps are a read-only track, not buttons (usability #15). */
export function AddSourceWizard({ platforms, onClose, onOpenSource }: AddSourceWizardProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);
  const requestLeave = useWizardDirty(state);
  const close = () => void requestLeave().then((leave) => leave && onClose());
  const steps: StepItem[] = STEP_KEYS.map((key, index) => ({
    key,
    label: t(key),
    state: index + 1 < state.step ? "past" : index + 1 === state.step ? "current" : "future",
  }));
  return (
    <Drawer open onClose={close} label={t("onboard.source.action")} variant="narrow">
      <div className="panel-in source-wizard">
        <PanelHeader title={t("onboard.source.action")} onClose={close} />
        <Stepper steps={steps} label={t("sources.wizard.steps")} />
        {state.step === 1 ? <CheckStep state={state} dispatch={dispatch} platforms={platforms} onOpenSource={onOpenSource} /> : null}
        {state.step === 2 ? <LinksStep state={state} dispatch={dispatch} /> : null}
      </div>
    </Drawer>
  );
}
```

(Move the `steps` mapping into a `wizardSteps(step, t)` helper to keep the component under 20 lines; check that `Stepper` marks the current item with `aria-current="step"`; if it does not, the step list test drives adding it to `Stepper` for `current` only.)

`CheckStep.tsx`: a `<form noValidate>`; `TextField id="wizard-url" type="url" data-autofocus` with label, hint, placeholder, `error`; submit: `parseImportUrl(text)` -> else error `import.invalidUrl`; a listed non-pending source with the same URL (`platform.url === url && platform.setup_status !== PENDING_SETUP`) -> error `sources.wizard.duplicate` plus a link-style button `sources.wizard.viewExisting` ("„{name}“ ansehen") that releases the dirty flag and calls `onOpenSource(id)` (the only typed entry is that source's own URL, so nothing is lost); otherwise `check(url)`. While `checking`: the submit button is `busy` and `<Notice>` with `sources.wizard.checking` sits under the field. The form never shows the server's text.

Add to this task's keys: `"sources.wizard.viewExisting": "„{name}“ ansehen",  // "View “{name}”"`.

`LinksStep.tsx`: the sentence `sources.wizard.found` (`host` from `hostOf(state.url)`); `TextField type="search"` "Links filtern"; two ghost small buttons "Alle auswählen" / "Keine" acting on `visibleLinks(state)`; the count "{count} ausgewählt" (`aria-live` is **not** set: it is plain text next to the list); the list:

```tsx
<ul className="link-list">
  {visibleLinks(state).map((link, index) => (
    <li key={link.url}>
      <input
        type="checkbox"
        id={`wizard-link-${index}`}
        checked={state.selected.includes(link.url)}
        onChange={() => dispatch({ type: "toggle", url: link.url })}
      />
      <label htmlFor={`wizard-link-${index}`}>
        <span>{link.text || linkPath(link.url)}</span>
        <span className="code">{linkPath(link.url)}</span>
      </label>
    </li>
  ))}
</ul>
```

then the `links` error (`role="alert"` markup as `DaysError`), the controlled `Disclosure label={t("sources.field.advanced")} open={state.advancedOpen} onOpenChange={(open) => dispatch({ type: "advanced", open })}` holding the pattern `TextField` (`className="code"`, hint `sources.wizard.patternHint`, `error` from `state.errors.url_pattern`) and the match line: nothing while empty; `sources.wizard.patternMatches` as `.hint` when `matchingCount > 0`; `Notice tone="warn"` `sources.wizard.patternNone` when 0 (the phase's one amber element: a likely mistake, not an error). Foot: "Zurück" (ghost) and "Weiter" (primary, `dispatch({ type: "next" })`). Split into `LinkFilter`, `LinkList`, `PatternField`, `StepFoot` (Task 13 reuses `StepFoot`).

`SourcesPage.tsx`: `{url.adding ? <AddSourceWizard platforms={platforms.data ?? []} onClose={closeWizard} onOpenSource={url.openSource} /> : null}` with `closeWizard = () => { url.close(); focusSourceOrTitle(null); }`.

`sources.css`: `.link-list` (no bullets, max-height 50vh with scroll, rows `min-height: 44px`, checkbox + two-line label, `.code` in `--text-2` at `--fs-13`); `.source-wizard .stepper` labels at `--fs-13` (override of the 12 px prototype value).

- [ ] **Step 7: E2E**

`sourcesServer.ts`:

```ts
// The prototype's FOUND_LINKS on get-in-it.de (renderAddSource): six postings and one navigation link.
export const FOUND_LINKS: PreviewLinksBody["links"] = [
  { url: "https://www.get-in-it.de/jobsuche/p/senior-java-developer-hamburg-48211", text: "Senior Java Developer (m/w/d) – Hamburg" },
  { url: "https://www.get-in-it.de/jobsuche/p/backend-entwickler-kotlin-48190", text: "Backend-Entwickler Kotlin" },
  { url: "https://www.get-in-it.de/jobsuche/p/software-engineer-payments-48177", text: "Software Engineer Payments" },
  { url: "https://www.get-in-it.de/jobsuche/p/teamlead-backend-java-48160", text: "Teamlead Backend (Java)" },
  { url: "https://www.get-in-it.de/jobsuche/p/cloud-engineer-aws-48102", text: "Cloud Engineer AWS" },
  { url: "https://www.get-in-it.de/jobsuche/p/java-entwickler-logistik-48099", text: "Java-Entwickler Logistik" },
  { url: "https://www.get-in-it.de/unternehmen/top-arbeitgeber", text: "Unternehmen entdecken" },
];
const EMPTY_HOST = "leer.example.com";

  /** POST /platforms/preview-links: 422 for an internal target (url_safety), an empty list for a page without links. */
  previewLinks(sent: unknown): unknown {
    const url = new URL(String((sent as { url: string }).url));
    if (PRIVATE_HOST.test(url.host)) return invalid("url");
    if (url.host === EMPTY_HOST) return { links: [] };
    return { links: FOUND_LINKS.filter((link) => new URL(link.url).host === url.host) };
  }
```

and the route `[`POST ${PREVIEW_LINKS_PATH}`]: live((sent) => server.previewLinks(sent))`.

`web/tests/e2e/sourcesWizard.spec.ts`:
- screenshot loop (1440/390, light/dark): `/sources?add=1`, step 1 (pointer away) as `sources-wizard-1-…`; type `https://www.get-in-it.de/jobsuche?query=kotlin`, "Seite prüfen", step 2 with six of seven preselected ("6 ausgewählt") as `sources-wizard-2-…`; overflow 0; link rows >= 44 px at 390.
- "a refused address shows on the field" (`http://10.0.0.5/jobs`; `allowedConsoleErrors: [/status of 422/]`).
- "Zurück keeps the address": on step 2, Zurück shows step 1 with the typed URL still in the field ("Seite prüfen" then checks again and preselects afresh; keeping the selection across steps 2 and 3 is Task 13's test).
- "Erweitert counts matches": pattern `/jobsuche/p/` -> "6 von 7 gefundenen Links enthalten dieses Muster."; `/nope/` -> the amber notice.

- [ ] **Step 8: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 13: Add wizard, step 3: name, schedule, first run (B8) and creation

**Files:**
- Create: `web/src/features/sources/wizard/FinishStep.tsx`, `useCreateSource.ts`; `web/tests/unit/features/sources/wizardFinish.test.tsx`, `web/tests/e2e/sourcesWizardFinish.spec.ts`
- Modify: `web/src/features/sources/wizard/AddSourceWizard.tsx` (step 3, `onCreated`), `web/src/features/sources/SourcesPage.tsx` (`onCreated` focus), `web/src/features/sources/sources.css`, `web/tests/e2e/support/sourcesServer.ts` (`setup`, `inferPattern`, `setupStatus`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `setupPlatform`, `PlatformSetupRequest`, `INITIAL_RUNS` (Task 5); `INITIAL_RUN_LABEL` (Task 6); `ScheduleFields`, `schedulePatch`, `scheduleErrors` (Task 9); `sectionFieldErrors` (Task 9); `wizardReducer` actions `name`, `schedule`, `initialRun`, `serverErrors` (Task 12); `StepFoot` (Task 12).
- Produces: `setupRequestOf(state): PlatformSetupRequest`, `useCreateSource({ onCreated, dispatch })`, `FinishStep({ state, dispatch, onCreated })`, `AddSourceWizardProps.onCreated: (id: number) => void`; e2e `SourcesServer.setup(sent)`, `SourcesServer.setupStatus()`, `inferPattern(urls)`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/sources/wizardFinish.test.tsx` (as `wizard.test.tsx`; a helper `toStep3()` checks `https://www.get-in-it.de/jobsuche?q=java` against the stubbed two links and clicks "Weiter"):

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { setupRequestOf } from "@/features/sources/wizard/useCreateSource";
import { INITIAL_WIZARD } from "@/features/sources/wizard/wizardState";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { sourcesStubs } from "../../support/sourcesRoutes";

const URL_ = "https://www.get-in-it.de/jobsuche?q=java";
const LINKS = { links: [{ url: "https://www.get-in-it.de/jobsuche/p/java-1", text: "Java" }, { url: "https://www.get-in-it.de/jobsuche/p/go-2", text: "Go" }] };
const CREATED = { id: 9, name: "get-in-it Java", url: URL_, schedule_time: "08:00", schedule_days: [0, 1, 2, 3, 4], initial_crawl_started: false };

async function toStep3() {
  const dialog = await screen.findByRole("dialog", { name: "Quelle hinzufügen" });
  await userEvent.type(within(dialog).getByLabelText("Adresse einer Suchergebnisseite"), URL_);
  await userEvent.click(within(dialog).getByRole("button", { name: "Seite prüfen" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: "Weiter" }));
  return dialog;
}
const setupBody = (calls: { url: string; body: string | null }[]) =>
  JSON.parse(calls.find((call) => call.url.endsWith("/platforms/setup"))!.body!);

describe("setup request", () => {
  it("leaves out an empty name and pattern and sends the schedule pair", () => {
    const state = { ...INITIAL_WIZARD, url: URL_, selected: ["a"], schedule: { enabled: false, time: "08:00", days: [0] } };
    expect(setupRequestOf(state)).toEqual({
      url: URL_, selected_urls: ["a"], initial_run: "seed", schedule_time: null, schedule_days: null,
    });
  });
});

describe("add wizard, step 3", () => {
  it("sends name, schedule, first run and pattern, then shows the new row with focus on it", async () => {
    const calls = sourcesStubs(undefined, { "POST /platforms/preview-links": LINKS, "POST /platforms/setup": CREATED });
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.type(within(dialog).getByLabelText("Name"), "get-in-it Java");
    await userEvent.click(within(dialog).getByLabelText("Noch nicht durchsuchen"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    await waitFor(() =>
      expect(setupBody(calls)).toEqual({
        url: URL_,
        selected_urls: LINKS.links.map((link) => link.url),
        initial_run: "none",
        name: "get-in-it Java",
        schedule_time: "08:00",
        schedule_days: [0, 1, 2, 3, 4],
      }),
    );
    expect(await screen.findByText("Quelle „get-in-it Java“ angelegt.")).toBeInTheDocument();
    expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", { scroll: false });
    await waitFor(() => expect(screen.getByRole("link", { name: "get-in-it Java" })).toHaveFocus());
  });

  it("a 422 on the pattern goes back to step 2 with Erweitert open", async () => {
    sourcesStubs(undefined, {
      "POST /platforms/preview-links": LINKS,
      "POST /platforms/setup": () => jsonResponse(422, { detail: [{ loc: ["body", "url_pattern"], msg: "x", type: "value_error" }] }),
    });
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await within(dialog).findByText("Gib ein Muster mit 1 bis 300 Zeichen ein, nicht nur „/“.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Erweitert" })).toHaveAttribute("aria-expanded", "true");
  });

  it("an analysis that did not start says so", async () => {
    sourcesStubs(undefined, { "POST /platforms/preview-links": LINKS, "POST /platforms/setup": CREATED });
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByLabelText("Jetzt durchsuchen und alles bewerten"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Quelle anlegen" }));
    expect(await screen.findByText(/Der erste Lauf konnte nicht starten/)).toBeInTheDocument();
  });

  it("Zurück from step 3 keeps the selection", async () => {
    sourcesStubs(undefined, { "POST /platforms/preview-links": LINKS });
    renderWithProviders(<SourcesPage />);
    const dialog = await toStep3();
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurück" }));
    expect(within(dialog).getByText("2 ausgewählt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources/wizardFinish.test.tsx`
Expected: FAIL: unresolved `@/features/sources/wizard/useCreateSource`; no "Name" field on step 3.

- [ ] **Step 3: Dictionary keys**

```ts
  "sources.wizard.nameHint": "Leer lassen: ein Name wird vorgeschlagen.", // "Leave empty to get a suggested name."
  "sources.wizard.firstRun": "Erster Lauf",                             // "First run"
  "sources.wizard.create": "Quelle anlegen",                            // "Create source"
  "sources.wizard.created": "Quelle „{name}“ angelegt.",                // "Source “{name}” created."
  "sources.wizard.createdRunning": "Quelle „{name}“ angelegt. Das Durchsuchen läuft.",
    // "Source “{name}” created. The search is running."
  "sources.wizard.firstRunFailed":
    "Quelle „{name}“ angelegt. Der erste Lauf konnte nicht starten. Starte ihn mit „Durchsuchen“.",
    // "Source “{name}” created. The first run could not start. Start it with “Search”."
```

(`sources.wizard.viewExisting` was added by Task 12.)

- [ ] **Step 4: Request and creation**

`wizard/useCreateSource.ts`:

```ts
"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Dispatch } from "react";
import { describeError } from "@/api/describeError";
import { setupPlatform, type Platform, type PlatformSetupRequest, type PlatformSetupResult } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { schedulePatch } from "../drawer/ScheduleFields";
import { sectionFieldErrors } from "../drawer/useSectionSave";
import type { WizardAction, WizardState } from "./wizardState";

/** D10: optional name and pattern are left out, so the server proposes and infers them (G8). */
export function setupRequestOf(state: WizardState): PlatformSetupRequest {
  const name = state.name.trim();
  const pattern = state.pattern.trim();
  const schedule = schedulePatch(state.schedule);
  return {
    url: state.url.trim(),
    selected_urls: state.selected,
    initial_run: state.initialRun,
    ...(name ? { name } : {}),
    schedule_time: schedule.schedule_time ?? null,
    schedule_days: schedule.schedule_days ?? null,
    ...(pattern ? { url_pattern: pattern } : {}),
  };
}

function createdMessage(result: PlatformSetupResult, requested: PlatformSetupRequest, t: Translate): string {
  const name = result.name;
  if (requested.initial_run !== "analyze") return t("sources.wizard.created", { name });
  return result.initial_crawl_started ? t("sources.wizard.createdRunning", { name }) : t("sources.wizard.firstRunFailed", { name });
}

function adoptCreated(queryClient: QueryClient, result: PlatformSetupResult): void {
  const { initial_crawl_started: _started, ...platform } = result;
  // The row exists at once, so focus can land on it; the refetch then brings the server's view.
  queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) => [...(list ?? []), platform]);
  for (const queryKey of [queryKeys.platforms, queryKeys.setupStatus, queryKeys.activity]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function useCreateSource({ onCreated, dispatch }: { onCreated: (id: number) => void; dispatch: Dispatch<WizardAction> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (request: PlatformSetupRequest) => setupPlatform(request),
    onSuccess: (result, request) => {
      adoptCreated(queryClient, result);
      const tone = request.initial_run === "analyze" && !result.initial_crawl_started ? "error" : "success";
      toast.show({ message: createdMessage(result, request, t), tone });
      onCreated(result.id);
    },
    onError: (error) => {
      const fields = sectionFieldErrors(error);
      if (fields.length > 0) dispatch({ type: "serverErrors", fields });
      else toast.show({ message: describeError(error, t, { BAD_REQUEST: "sources.wizard.duplicate" }), tone: "error" });
    },
  });
}
```

(The `_started` rest destructuring may trip `no-unused-vars`; if so, build `platform` with zod's `platformSchema` shape instead, e.g. a small `withoutSetupFlag(result)` helper that copies the fields; never disable the rule.)

`wizard/FinishStep.tsx`: a `<form noValidate>` with `TextField` "Name" (`maxLength={100}`, placeholder `hostOf(state.url)`, hint `sources.wizard.nameHint`, error `state.errors.name`), `ScheduleFields idPrefix="wizard-schedule"` (errors from `scheduleErrors(state.schedule)` on submit, merged with `state.errors.schedule_time/schedule_days`), a `<fieldset>` "Erster Lauf" with three radio rows from `INITIAL_RUNS` (`INITIAL_RUN_LABEL[run].title` as the label, `.hint` as a hint line linked with `aria-describedby`), and `StepFoot` with "Zurück" and "Quelle anlegen" (`busy` while creating). Submit: client errors first (name 1-100 after trim if not empty; schedule) via `dispatch({ type: "errors", ... })`; then `create.mutate(setupRequestOf(state))`. The radio rows are >= 44 px high below the 720 px container.

`AddSourceWizard`: step 3 renders `FinishStep`; `onCreated(id)` = release the dirty flag (`setDirty(false)` happens on unmount) and call the prop. `SourcesPage` passes `onCreated={(id) => { url.close(); focusSourceOrTitle(id); }}`.

- [ ] **Step 5: E2E**

`sourcesServer.ts`:

```ts
const PATTERN_DELIMS = "/-_=?&.";

/** server/routers/platforms.py `_infer_url_pattern` for several URLs: common prefix, cut back to a delimiter. */
export function inferPattern(urls: readonly string[]): string {
  const keys = urls.map((url) => {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  });
  let prefix = keys[0] ?? "";
  for (const key of keys) while (!key.startsWith(prefix)) prefix = prefix.slice(0, -1);
  if (keys.length > 1 && prefix && !PATTERN_DELIMS.includes(prefix.at(-1)!)) {
    const cut = Math.max(...[...PATTERN_DELIMS].map((delim) => prefix.lastIndexOf(delim)));
    if (cut > 0) prefix = prefix.slice(0, cut + 1);
  }
  return prefix;
}

  /** POST /platforms/setup: the setup rules (duplicates 400, validation 422, B8 first run). */
  setup(sent: unknown): unknown {
    const body = sent as PlatformSetupRequest;
    const taken = this.list().some((p) => p.url === body.url && p.setup_status !== "pending_setup");
    if (taken) return reply(400, { detail: "Platform URL already exists" });
    if (PRIVATE_HOST.test(new URL(body.url).host)) return invalid("url");
    if (body.selected_urls.length === 0) return invalid("selected_urls");
    const id = Math.max(0, ...this.platforms.keys()) + 1;
    const platform: PlatformBody = {
      id, url: body.url, name: body.name ?? `${new URL(body.url).host} Jobs`, is_active: true, setup_status: "active",
      url_pattern: body.url_pattern ?? inferPattern(body.selected_urls),
      schedule_time: body.schedule_time, schedule_days: body.schedule_days, last_run: null, notification_adapters: [],
    };
    this.platforms.set(id, platform);
    // Seeding and analysing both crawl now; only "analyze" is something the user waits for.
    if (body.initial_run !== "none") this.running.set(id, { id: `crawl-setup-${id}`, total: 0, done: 0 });
    return { ...structuredClone(platform), initial_crawl_started: body.initial_run === "analyze" };
  }

  /** GET /setup-status as routers/settings.py computes it for this state. */
  setupStatus(): SetupStatusBody {
    return { ...SETUP_DONE, has_source: this.platforms.size > 0 };
  }
```

(split `setup` into a validation helper and a builder to keep 20 lines; type the request with `PlatformSetupRequest` from `src/api/platforms` as a type-only import). Routes: `POST ${PLATFORM_SETUP_PATH}` and `GET /setup-status` (`live(() => server.setupStatus())`).

`web/tests/e2e/sourcesWizardFinish.spec.ts`:
- screenshot loop (1440/390, light/dark) of step 3 (pointer away) as `sources-wizard-3-…`.
- "a new source with a first analysis appears running and focused": fill step 3 with the name "get-in-it Kotlin", schedule Mo, Mi 07:30, "Jetzt durchsuchen und alles bewerten", create -> toast "Quelle „get-in-it Kotlin“ angelegt. Das Durchsuchen läuft.", the wizard is gone, the URL is `/sources`, the row "get-in-it Kotlin" shows "Mo, Mi 07:30" and "Läuft", its link is focused; `server.get(3)` holds `url_pattern: "/jobsuche/p/"` (inferred from the six preselected links) and the schedule.
- "an address that already is a source": typing StepStone's URL on step 1 shows "Diese Quelle gibt es schon." and "„StepStone“ ansehen" opens its drawer.

- [ ] **Step 6: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/sources`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 14: E2E journeys (the phase-5 exit criterion "e2e sources green": add source, crawl progress)

**Files:**
- Create: `web/tests/e2e/sourcesJourneys.spec.ts`
- Test: the file itself

**Interfaces:**
- Consumes: `SourcesServer`, `sourcesRoutes`, `finishCrawl`, `FOUND_LINKS` (Tasks 7-13); `inboxRoutes`, `NEW_ITEMS`, `page` (`support/inboxFixtures.ts`); `SETUP_DONE` (`support/fixtures.ts`); `fixNow`, `pushEvent` (`support/jobFixtures.ts`); `setRoutes`, `live`.
- Produces: three journeys over one stateful fake server (the pattern of `inboxJourneys.spec.ts` and `applicationsJourneys.spec.ts`): every refetch after a click or an event sees what the real server would answer.

- [ ] **Step 1: Write the journeys**

```ts
import type { Page } from "@playwright/test";
import { fixNow, pushEvent } from "./support/jobFixtures";
import { inboxRoutes } from "./support/inboxFixtures";
import type { ApiLog, MockRoutes } from "./support/mockApi";
import { finishCrawl, SourcesServer, sourcesRoutes } from "./support/sourcesServer";
import { expect, test } from "./support/test";

// Spec section 7: "add source" and "crawl progress" across Eingang and Quellen; per-feature
// assertions live in sources*.spec.ts.
const NEW_URL = "https://www.get-in-it.de/jobsuche?query=kotlin";

test.beforeEach(async ({ page }) => fixNow(page));

/** Inbox and sources share one server: the platforms and the setup status come from it. */
function routes(server: SourcesServer): MockRoutes {
  return { ...inboxRoutes(), ...sourcesRoutes(server) };
}

const row = (page: Page, name: string) =>
  page.getByRole("list", { name: "Deine Quellen" }).getByRole("listitem").filter({ hasText: name });

async function socket(log: ApiLog) {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

test("add source: from the onboarding to a seeded source, and the onboarding is gone", async ({ page, mockApi }) => {
  const server = new SourcesServer([], []);
  const log = await mockApi(routes(server));
  await page.goto("/inbox");
  await page.getByRole("link", { name: "Quelle hinzufügen" }).click();
  await expect(page).toHaveURL(/\/sources\?add=1$/);
  const wizard = page.getByRole("dialog", { name: "Quelle hinzufügen" });
  await wizard.getByLabel("Adresse einer Suchergebnisseite").fill(NEW_URL);
  await wizard.getByRole("button", { name: "Seite prüfen" }).click();
  await expect(wizard.getByText("6 ausgewählt")).toBeVisible();
  await wizard.getByRole("button", { name: "Weiter" }).click();
  await wizard.getByRole("button", { name: "Quelle anlegen" }).click();
  await expect(page.getByText(/^Quelle „www\.get-in-it\.de Jobs“ angelegt\.$/)).toBeVisible();
  await expect(row(page, "get-in-it")).toContainText("Läuft");
  await socket(log);
  finishCrawl(log, server, {
    platformId: 1,
    type: "crawl_job_completed",
    lastRun: { finished_at: "2026-10-08T08:05:00+00:00", found: 6, new: 6, matched: 0, seeded: true, error: null },
  });
  await expect(row(page, "get-in-it")).toContainText("6 als bekannt gemerkt");
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: /Eingang/ }).click();
  await expect(page.getByRole("heading", { name: "Erste Quelle hinzufügen" })).toHaveCount(0);
});

test("crawl progress: Durchsuchen, live steps, the end in the row, the nav and the inbox run line", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  const log = await mockApi(routes(server));
  await page.goto("/sources");
  await socket(log);
  await page.getByRole("button", { name: "Indeed jetzt durchsuchen" }).click();
  const crawlId = server.running.get(2)!.id;
  for (const event of [
    { type: "crawl_job_progress", job_id: crawlId, platform: server.get(2).url, total: 8, scraping_completed: 8 },
    { type: "crawl_job_extracting", job_id: crawlId, extracting_count: 2, total: 8 },
    { type: "job_analysis_started", job_id: crawlId, analysis_completed: 1 },
  ]) {
    pushEvent(log, event);
  }
  await expect(row(page, "Indeed")).toContainText("Bewerten: 1 von 8");
  finishCrawl(log, server, {
    platformId: 2,
    type: "crawl_job_completed",
    lastRun: { finished_at: "2026-10-08T08:00:00+00:00", found: 8, new: 2, matched: 1, error: null },
  });
  await expect(row(page, "Indeed")).toContainText("8 gefunden, 1 passend, 1 unter Schwellwert");
  await expect(page.getByRole("button", { name: /^Indeed: Seite nicht erreichbar/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByText("1 Fehler")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: /Eingang/ }).click();
  await expect(page.locator(".runline")).toContainText("Letzter Lauf: Indeed, heute 10:00.");
});

test("schedule and notifications survive a reload; a failed second save keeps the draft", async ({ page, mockApi }) => {
  const server = new SourcesServer();
  await mockApi(routes(server));
  await page.goto("/sources?quelle=2");
  const drawer = page.getByRole("dialog", { name: "Quelle Indeed" });
  await drawer.getByLabel("Automatisch durchsuchen").check();
  await drawer.getByLabel("Uhrzeit").fill("07:30");
  await drawer.locator("form").filter({ hasText: "Zeitplan" }).getByRole("button", { name: "Speichern" }).click();
  await drawer.getByLabel("SMTP benachrichtigen").check();
  await drawer.getByLabel("Empfänger").fill("ich@example.com");
  await drawer.getByRole("form", { name: "Benachrichtigungen" }).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await page.reload();
  await expect(drawer.getByLabel("Uhrzeit")).toHaveValue("07:30");
  await expect(drawer.getByLabel("SMTP benachrichtigen")).toBeChecked();
  expect(server.get(2).smtp_recipients).toEqual(["ich@example.com"]);
});
```

Notes for the implementer:
- `inboxRoutes()` keys `GET /platforms` and `GET /setup-status` itself; spreading `sourcesRoutes(server)` after it lets the server's live answers win. Read `inboxRoutes` first: if its onboarding needs `has_source: false` from `SETUP_DONE` overrides, the server's `setupStatus()` (Task 13) provides it.
- The run-line time: the fixed clock is 10:00 Berlin; the crawl finished 08:00 UTC = 10:00 Berlin, so "heute 10:00".
- If Task 13 named the new source differently (server rule `${host} Jobs`), adapt the toast text, not the rule.

- [ ] **Step 2: Run the journeys**

Run: `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/sourcesJourneys.spec.ts`
Expected: PASS (three tests, no console error, no unmocked call).

- [ ] **Step 3: Mutation check (the journeys must be able to fail)**

Temporarily (in the repo, reverted right after): (a) make `seedCrawlTask` return `state` unchanged and run `tests/unit/features/sources/crawl.test.tsx`: "shows the bar as soon as the start is accepted" must FAIL; (b) make `countFailingPlatforms` count every `last_run.error` and run `pnpm test:e2e -- tests/e2e/sourcesCrawl.spec.ts`: "Abbrechen cancels the crawl and a cancel is no error" must FAIL on "1 Fehler" (it then reads 2). Revert both, rerun both green, and put the two RED outputs in the report.

- [ ] **Step 4: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 15: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`

**Interfaces:**
- Consumes: the reports of Tasks 1-14 (test counts, doc lines, deviations).
- Produces: documentation only; no code.

- [ ] **Step 1: Progress tracker**

In `context/progress-tracker.md`:
- Phase line: `**Phase:** Frontend redesign - phase 5 (Quellen \`/sources\` with list, live crawl, drawer and 3-step add wizard) done; next is phase 6 (profile).`
- Status-board row `**Frontend Redesign - Phase 5 backend**` ✅ (`server/core/url_safety.py`, `core/crawl_registry.py`, `core/platform_rules.py`, `routers/platforms.py`, `routers/settings.py`, `scraper_api.py`, `workers/scraper_worker.py`, `workers/tasks/platform_runs.py`, `database/core.py`, migration `v4w5x6y7z8a9`): SSRF guard in API and worker; one crawl per source (409), `platform_id` in crawl status and `crawl_job_started`; `platform_runs` history (20 kept) and `last_run.seeded`; validated PATCH with writable `url_pattern`; setup with name/schedule/pattern; delete keeps jobs (409 while crawling); `GET /notification-settings/channels` (booleans only); test counts from Tasks 1-4.
- Row `**Frontend Redesign - Phase 5 (sources)**` ✅ with the files (`web/src/features/sources/**`, `web/src/domain/sources.ts`, `web/src/domain/runLine.ts`, `web/src/api/{platformPaths,platforms,notifications,crawl,settings,queryKeys}.ts`, `web/src/realtime/{events,activity,useActivity}.ts`, `web/app/(app)/sources/page.tsx`, `web/tests/e2e/sources*.spec.ts`, `web/tests/e2e/support/{platformFixtures,sourcesServer}.ts`, `mockApi.ts` `reply`) and the behaviour in one sentence per decision that defines it (D1 URL, D2/D4 live progress from the activity cache, D3 failing rule shared with the nav badge, D5 per-section save, D6 profile-zone wall time, D7 channels and template content, D8 history, D9 delete keeps jobs, D10 wizard), plus unit and e2e counts from Task 14.
- ADR (non-obvious, would be revisited): "Live crawl progress per source reads the activity cache (`platformId` on each task, seeded from the crawl start answer) instead of polling or a second tracker."
- Open questions: remove the R9 seed-run entry (closed by `seeded`); add: residual SSRF risk outside the API (the render service may follow redirects to internal hosts and resolves the name again; harden it in the render service or pin the resolved address); migration `v4w5x6y7z8a9` verified on SQLite only; G10 (per-source template text editing moved to Einstellungen, phase 7), G17 (dropped: job-count link, favicon, cancel-all) for the user to confirm; `NOTIFICATION_SETTINGS_HREF` is a phase 7 contract.

- [ ] **Step 2: Architecture**

`context/architecture.md`:
- section 2: extend the `platforms.py` bullet (PATCH rules, setup fields, delete semantics, runs endpoint, 409/502 crawl start), the scraper bullet (one crawl per source, `platform_id`), `settings.py` (channels endpoint); add the `src/features/sources/` bullet (URL `?quelle=`/`?add=1`, list from `["platforms"]`, live progress from `["activity"]` via `platformId`, `markCrawlStarted`, drawer sections with partial PATCH and `useDirtySections`, run history `["platforms","runs",id]`, wizard reducer, `SourcesLiveStatus` as the one live region, `focusSourceOrTitle`); extend the `src/domain/` bullet with `sources.ts` and the shared `summarizeRun`/`lastRunOf`/`isFailedRun`; extend the tests bullet with `platformFixtures.ts`, `sourcesServer.ts`, `reply`.
- section 3: table `platform_runs`.
- section 4 invariants: user URLs are fetched only when every resolved address is public (API and worker); deleting a source never deletes jobs; notification credentials never leave the server (channel status is booleans only).

- [ ] **Step 3: UI context**

`context/ui-context.md`, section 0: a **Quellen (`/sources`)** bullet: masthead with deck and primary "Quelle hinzufügen"; crimson error banner (button per failing source); rows on hairlines (name link + host, schedule, last run, status tag with hairline border, Durchsuchen icon button), container query at 720 px; inline progress (step text, native ink bar, Abbrechen in the progress cell); wide drawer with sections (Quelle, Zeitplan with weekday chips and the profile-zone hint, Benachrichtigungen per channel, Letzte Läufe, delete with dialog); narrow wizard with the read-only step track (13 px labels), link list with 44 px rows, "Erweitert" pattern with the one amber notice.

- [ ] **Step 4: Checkpoint**

Run the web checkpoint and the backend suite. Expected: all green (documentation changes nothing; the checkpoint proves the final state the docs describe).

---

## Self-Review

### 1. Spec coverage

| Spec item | Task |
|---|---|
| 4.2 masthead with "Quelle hinzufügen" | 7 (`SourcesHeader`) |
| 4.2 error banner listing failing sources | 6 (`failingSources`, `isFailingSource`), 7 (`FailingBanner`) |
| 4.2 rows: name/host, schedule, last run (B9), status | 3 (`seeded`), 6 (`scheduleOf`, `scheduleText`, `lastRunOf`, `sourceState`), 7 (`SourceRow`, `RunCell`, `StatusTag`) |
| 4.2 Durchsuchen icon button and live crawl progress inline | 2 (`platform_id`, one crawl per source), 5 (`platformId`, `seedCrawlTask`), 8 |
| 4.2 drawer: URL/pattern | 4 (writable `url_pattern`, validation), 9 (`SourceSection`) |
| 4.2 drawer: schedule (time and weekdays) | 4 (rules), 9 (`ScheduleSection`, `ScheduleFields`) |
| 4.2 drawer: notifications (channel and template) | 4 (channel status), 10 |
| 4.2 drawer: run history | 3 (`platform_runs`, endpoint), 11 (`RunHistory`) |
| 4.2 drawer: delete | 4 (keeps jobs, 409), 11 (`DeleteSource`) |
| 4.2 wizard: link check | 1 (SSRF guard), 12 (`CheckStep`, `useLinkCheck`) |
| 4.2 wizard: link selection, pattern under "Erweitert" | 6 (`suggestJobLinks`, `matchingCount`), 12 (`LinksStep`) |
| 4.2 wizard: name/schedule/first run (B8) | 4 (setup fields), 13 (`FinishStep`, `useCreateSource`) |
| 4.1 nav "03 Quellen (error count)" | 6 (`countFailingPlatforms` with the banner's rule), 8 e2e ("1 Fehler" after cancel) |
| 4.3 #5 a11y (row link, no nested interactive, 44 px, 13 px, focus) | 7 (row, CSS test), 8 (button cell), 9/11/13 (focus fallback), every UI spec at 390 |
| 4.3 #6 step-based progress, fixed label, cancel only where honoured | 8 (`STEP_LABEL`, G12) |
| 4.3 #7 mobile | 7 (container query), 9-13 (full-screen drawers, 44 px), screenshots at 390 and 375 |
| 4.3 #8 onboarding while no source | 13 (`setupStatus` invalidation), 14 journey 1 |
| 5 colours (crimson errors, amber warnings, one moving indicator) | 7 (`StatusTag`, banner), 8 (ink bar), 12 (amber pattern notice) |
| 6 query keys, realtime, error normaliser, states, field errors | 5 (keys), 7-13 (states, `describeError`, `fieldErrorsFrom`) |
| 7 unit and e2e, screenshots 1440/390 light/dark, no console errors, 375 px, journeys "add source", "crawl progress" | every UI task; 14 |
| 8 phase 5 "e2e sources green" | 14 (and the specs of 7-13) |
| B8 initial_run analyze/seed/none | 4 (setup), 13 |
| B9 last run per platform | 3 (history and `seeded`), 7 |
| Inventory A.4/A.5/B.3 features (name generation, active toggle, schedule, adapters, templates, recipients, tests, cancel, delete) | 8, 9, 10, 11; drops listed in G17 |

No spec requirement is without a task.

### 2. Placeholder scan

Searched for "TBD", "TODO", "implement later", "fill in", "similar to Task", "add appropriate", "handle edge cases": none. Prose-only steps (Task 9 `SourceSection`, Task 10 `NotifySection`/`ChannelRow`, Task 11 `RunHistory`, Task 12 `CheckStep`/`LinksStep`, Task 13 `FinishStep`, several e2e cases) name every field, key, rule, error mapping and split, and they follow a fully coded sibling in the same task (`ScheduleSection`, `notifyDraft.ts`, `DeleteSource`, `wizardState.ts`, `useCreateSource`). Conditional instructions name the exact fallback (e.g. the `_started` destructuring, `Stepper`'s `aria-current`, `useNow` inside `useState`).

### 3. Type and name consistency (across tasks)

- Backend: `ensure_public_http_url`/`is_public_http_url`/`NOT_PUBLIC` (Task 1) used by Tasks 1 and 4; `active_crawl_for_platform`/`ALREADY_RUNNING` (Task 2) used by Tasks 2 and 4; `_owned_platform`, `PlatformRun` (Task 3) used by Task 4; `_crawl_redis` is the monkeypatch target of Task 4's test.
- `platformPaths.ts` names (Task 5) are the route keys of every e2e server method (Tasks 7-13).
- `ActivityTask.platformId`, `seedCrawlTask`, `markCrawlStarted`, `CrawlSeed` (Task 5) used by Tasks 7, 8, 9, 11.
- `summarizeRun`, `lastRunOf`, `RunSummary`, `isFailedRun`, `RUN_ERROR_LABEL` (Task 6) used by Tasks 7 (`RunCell`, banner), 11 (`RunHistory`); `runResult` (Task 7) used by Task 11.
- `sourcesHref`, `sourceIdFromParam`, `addFromParam`, `sourceState`, `canCrawl`, `failingSources`, `sortSources`, `scheduleOf`, `DEFAULT_SCHEDULE`, `WEEKDAYS`, `suggestJobLinks`, `matchingCount`, `linkPath`, `toSourceField`, `firstErrorStep`, `parseRecipients`, `templateChoice` (Task 6) match their uses in Tasks 7-13.
- `useSourcesUrl()` returns `{ sourceId, adding, openSource, openWizard, close }` (Task 7); Tasks 9, 11, 12, 13 call only these. `focusSourceOrTitle(id | null)`, `sourceLinkId(id)` (Task 7) used by Tasks 9, 11, 13.
- `SourceRow` slots `progress`/`action` (Task 7) filled by Task 8; `runningTaskOf` (Task 7) used by Tasks 8, 9, 11.
- `useSectionForm`, `useSectionSave`, `sectionFieldErrors`, `useDirtySections`, `ScheduleFields`, `scheduleDraftOf`, `schedulePatch`, `scheduleErrors`, `ScheduleDraft` (Task 9) used by Tasks 10, 12 (`sectionFieldErrors`, `ScheduleDraft`) and 13.
- `WizardState`, `WizardAction`, `wizardReducer`, `INITIAL_WIZARD`, `visibleLinks`, `isWizardDirty` (Task 12) used by Task 13; `StepFoot` (Task 12) reused by Task 13.
- e2e `SourcesServer` methods grow per task (`list`, `crawlStatus`, `get` -> `crawl`, `cancel`, `finish` -> `patch` -> `testSend` -> `runsOf`, `delete` -> `previewLinks` -> `setup`, `setupStatus`); `crawlRoutes` is renamed `platformRoutes` in Task 9 (Task 9 updates Task 8's import); `finishCrawl`, `FOUND_LINKS`, `CHANNELS`, `TEMPLATES` keep their names.
- Unit support `SOURCE_A`, `SOURCE_B`, `sourcesStubs` (Task 8), extended with `CHANNELS`, `TEMPLATES` (Task 10) and default run routes (Task 11).

### 4. Real-code name check (read on 2026-10-09 in `web/src`, `web/tests` and `server/`)

Verified to exist with these exact names and shapes: `platformsQueryOptions`, `fetchPlatforms`, `countFailingPlatforms`, `Platform`, `PlatformBody` (`api/platforms.ts`, `last_run` with `error`, `finished_at`, `found`, `new`, `matched`); `fetchCrawlJobs`, `CrawlJob`, `CrawlStatusBody` (`api/crawl.ts`); `importJobByUrl` (`api/imports.ts`); `queryKeys.platforms`, `.activity`, `.setupStatus`, `.jobsRoot`, `.jobCounts`, `.languagePreference` (`api/queryKeys.ts`); `describeError(error, t, overrides)` with code `CONFLICT`, `BAD_REQUEST`, `VALIDATION_ERROR`, `UPSTREAM_ERROR` (`api/describeError.ts`, `api/errors.ts`; the scraper's `200 + {status:"error"}` becomes `UPSTREAM_ERROR`); `fieldErrorsFrom(error, toField)` (`api/fieldErrors.ts`; field names without `body`); `setupStatusQueryOptions` (`api/setup.ts`); `realtimeEventSchema` with `crawl_job_started` (`platform`), `crawl_job_progress` (`platform`, `total`, `scraping_completed`), `crawl_job_extracting`, `job_analysis_started`, `crawl_job_completed|failed|cancelled` (`realtime/events.ts`); `ActivityTask`, `FinishedTask`, `ActivityState`, `EMPTY_ACTIVITY`, `reduceActivity`, `activityFromCrawlJobs`, `progressPercent`, `sourceLabel` (`realtime/activity.ts`); `useActivity(enabled)` (`realtime/useActivity.ts`); `applyEvent` invalidates `platforms` on every crawl end and on `crawl_completed` (`realtime/applyEvent.ts`); `runErrorCode`, `RUN_ERROR_CODES`, `latestRun`, `nextRunAt`, `LastRun` (`domain/runLine.ts`); `RUN_ERROR_LABEL` (private in `features/inbox/RunLine.tsx`, moved by Task 6); `safeHref`, `hostOf` (`domain/links.ts`); `listPhase`, `isListStalled`, `ListStatus` (`domain/inbox.ts`); `ListLoading({ stalled })`, `ListError({ error, onRetry, announce })` (`features/inbox/InboxList.tsx`); `parseImportUrl`, `IMPORT_ERRORS` (`features/inbox/import/importUrl.ts`); `SOURCES_HREF`, `SOURCES_ADD_HREF` (`/sources?add=1`), `AI_SETTINGS_HREF`, `PROFILE_HREF`, `navNumber`, `MAIN_NAV` (`features/shell/navigation.ts`); `NavBadge`, `NavCounts.sourceErrors` (`Sidebar.tsx`, `useNavCounts.ts`); `STEP_LABEL` (exported, `features/shell/ActivityPanel.tsx`); `Drawer({ open, onClose, label, variant: "wide"|"narrow"|"sheet" })`, `Dialog({ open, onClose, label })`, `ModalLayer` (focus return to the previously active element, `data-autofocus`), `PanelHeader({ title, onClose })`, `Disclosure({ label, defaultOpen, open, onOpenChange })`, `Field`, `TextField`, `SelectField`, `TextAreaField`, `CheckField({ id, label, checked, onChange, disabled })`, `describedBy`, `Stepper({ steps, label, headingLevel })` with `StepState` `past|current|future|…`, `MenuButton`, `Chip({ pressed, onToggle })`, `Notice({ tone, announce })`, `Button` (`variant` `default|primary|ghost|danger`, `size`, `icon`, `iconOnly`, `busy`, `inactive`), `Masthead` and `MASTHEAD_TITLE_SELECTOR` (`h1.mast-title`, `tabIndex -1`), `EmptyState`, `useToast().show({ message, tone })` with tones `info|success|error`, `useUnsavedChanges()` (`setDirty`, `setUnloadWarning`, `requestLeave`) and its leave dialog texts `unsaved.*` (`src/ui`); `useI18n` (`t`, `language`), `translatorFor`, `formatDayTime(date, t, { now, language, timeZone? })`, `MessageKey` (`src/i18n`); `useNow` (`lib/clock.ts`); i18n keys `nav.sources`, `nav.sourceErrors` ("{count} Fehler"), `onboard.source.title`, `onboard.source.text`, `onboard.source.action`, `import.invalidUrl`, `run.error.*`, `runline.counts`, `guard.cancel`, `dates.save`, `files.deleteConfirm`, `dialog.close`, `error.retry`, `loading`, `inbox.stalled`, `action.view`, `activity.step.*`; vitest `TZ = Europe/Berlin`, Playwright `timezoneId: Europe/Berlin`; unit `stubRoutes` (query string ignored), `jsonResponse`, `createTestQueryClient`, `renderWithProviders` (QueryClient, ToastProvider, UnsavedChangesProvider), `liveNavigation`, `navigationModule`; e2e `mockApi` (`respond`, `ApiLog.calls`, `requests`, `unexpected`, `sockets`), `live`, `setRoutes`, `MutableRoutes`, `AUTHENTICATED_ROUTES` (with `GET /platforms`, `GET /scraper/crawl-status`, `GET /settings`, `GET /setup-status`), `SETUP_DONE`, `RUNNING_CRAWL_ID`, `PLATFORMS_WITH_RUNS`, `inboxRoutes`, `fixNow`, `NOW_ISO`, `pushEvent`, `saveScreenshot`, `horizontalOverflow`, `SCREENSHOT_SIZES`, `COLOR_SCHEMES`, `VIEWPORTS.narrow`, the `allowedConsoleErrors` option; backend `_serialize_platform`, `_trigger_scraper_search`, `_start_first_crawl`, `_infer_url_pattern`, `_validate_http_url`, `PreviewUrlRequest`, `PlatformSetupCreateRequest`, `create_platform_with_setup`, `update_platform` (`model_fields_set`), `trigger_platform_crawl`, `delete_platform`, `delete_platform_jobs`, test endpoints `test-pushover|resend|mailjet|smtp` with their credential predicates, `PlatformUpdate` (accepts but ignored `url_pattern`), `PlatformResponse`, `PlatformSetupResponse.initial_crawl_started`, `JobPlatform.last_run`, `STATUS_SEEN` (`database/core.py`), `record_platform_run`, `build_last_run`, `_save_last_run`, `ERROR_CODES` (`workers/tasks/platform_runs.py`), `_is_safe_url`, `get_html_with_browser`, `fetch_links_task` (publishes `crawl_job_started`) (`workers/scraper_worker.py`), `_init_crawl_job` (`is_initial_run`), `_remember_platform`, `search_jobs`, `get_crawl_status`, `cancel_crawl`, `cleanup_crawl_job`, `_is_http_url` (`scraper_api.py`), `_mask_profile`, `get_setup_status` (`routers/settings.py`), the `RequestValidationError` handler without input echo (`main.py`), migration head `u3v4w5x6y7z8` (`tests/test_phase0_schema.py` asserts the head), test fixtures `api_client`, `seed`, `session_factory`, `fake_redis`, factories `make_user`, `make_job`, `make_profile`, `make_platform`, `fetch`, `events_of_type`, `TEST_PLATFORM_ID = 12`, `TEST_USER_ID`, `OTHER_USER_ID`.

Found and handled while checking: the inline crawl bar of `ActivityPanel` uses an inline `style` (kept; the new bar is a native `<progress>`); `ModalLayer` returns focus to `<body>` after a deep-linked overlay (Task 7 `focusSourceOrTitle`); `countFailingPlatforms` counts cancelled runs (G19); `AUTHENTICATED_ROUTES` has a free-text error and an unlabelled running crawl (G18); `PlatformUpdate` silently ignores `url_pattern` (G6); `DELETE /platforms/{id}` drops every job and ignores its parameters (G7); `trigger_platform_crawl` stamps `last_crawl_at` on a refusal (G3); the head assertion in `test_phase0_schema.py` must move with the new migration (Task 3); `test_delete_platform` expects the old body (Task 4); `useNavCounts` builds the platforms query by hand instead of `platformsQueryOptions` (same key; left as is, surgical).

### 5. Review Focus

Each of the five lines names tests that exist in the owning tasks (checked against the test titles above). Input classes considered and covered by ordinary tests rather than listed: a legacy `pending_setup` source (D15, Task 6 `sourceState`, Task 9 notice), a Redis outage during delete (Task 4 `_crawl_running` fails open with the reason documented), a page without links (Task 12), a stored template text that matches no template (Task 10), an unconfigured channel that is still active (Task 10 `ChannelRow` rule), dark mode and 390 px (every UI task's screenshots), 375 px (Task 7).
