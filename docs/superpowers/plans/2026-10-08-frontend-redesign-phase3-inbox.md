# Frontend Redesign Phase 3 (Inbox `/inbox`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Eingang (`/inbox`), the home screen of the new app: masthead with status lede and "Per URL importieren", the "Anstehend" card, the tabs Neu / Unter Schwellwert / Von dir aussortiert over compact rows with optimistic Vormerken/Aussortieren and undo, a preview pane from 1200 px, the threshold slider with distribution ticks, preview count, "Übernehmen" and undo, and first-run onboarding, against the backend plus three small backend additions, with realtime updates and Playwright journeys.

**Architecture:** Three backend tasks (server only, pytest TDD) add what the inbox reads: list fields for the due card, a hard delete that cleans its rows, the threshold distribution, a setup-status endpoint and the existing job id on a skipped import. On the web side, pure rules go to `web/src/domain/` (inbox URL and list rules, due entries from `nextStep`, run line, schedule, threshold maths, onboarding), wire contracts to `web/src/api/` (`jobList.ts`, `threshold.ts`, `setup.ts`, `imports.ts`), import tracking to `web/src/realtime/imports.ts` (finished by `applyEvent`, toasted by `RealtimeProvider`), and the screen to `web/src/features/inbox/`. Lists are TanStack infinite queries under the `["jobs", ...]` root, so the existing realtime invalidation keeps them fresh; triage removes rows optimistically because it has undo (spec 6).

**Tech Stack:** unchanged from phases 1-2 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0; backend FastAPI, SQLAlchemy 2, pytest on in-memory SQLite). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 3 row "Inbox (incl. onboarding, import, threshold)", done when "e2e triage and threshold green"; section 4.2 `/inbox`; 4.3 #2, #4, #5, #8; 4.4; 5; 6; 7; backend B4, B5, B6, B8, B9, B11). Visual and behavioural source of truth: `docs/prototype/clickdummy-editorial.html` (`renderInbox`, `renderInboxRow`, `renderInboxEmpty`, `deckInbox`, `renderOnboarding`, `renderImport`, `importRun`, `dismiss`, `restore`, `thresholdBand`, `thresholdHint`, CSS blocks `/* ---------- inbox ---------- */`, `.onboard`, `.threshold`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (items 2, 3, 4, 7, 9, 10, 12, 16, 17, 19, 28 and the "Eingang" layout). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.2 jobs list/archive/delete, A.4 last run, A.10 import-job, A.11 events, B.3 `/` dashboard, `/listings`, `/archive`, B.6, C.2).

## Global Constraints

- **Placement:** web code in `web/`, backend code in `server/`; `frontend/` stays untouched. Backend Tasks 1-3 change only `server/`; web Tasks 4-16 change only `web/` and (Task 16) `context/`.
- **Base:** phase 2 is closed (its Task 24 checkpoint green) before web Task 4 starts. Names in this plan are the real exported names of `web/src` as of phase 2 (`describeError`, `jobPath`, `changeJobStatus`, `patchJob`, `nextStep`, `isDue`, `parseFitReasoning`, `hostOf`, `isHttpUrl`, `roundScore`, `scoreBand`, `BAND_LABEL`, `useNow`, `formatDate`, `formatRelativeDays`, `formatTime`, `useToast`, `Masthead`, `EmptyState`, `Tabs`, `TabPanel`, `Dialog`, `Drawer`, `PanelHeader`, `Notice`, `CountBadge`, `ScoreMeter`, `Monogram`, `Button`, `TextField`). If a name drifted, adapt the call, never the behaviour.
- **One web implementer at a time.** All web tasks share the build mirror `$QA/web`; never run two web tasks in parallel. Backend Tasks 1-3 may run in parallel with each other and with web tasks (they only touch `server/` and run pytest).
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`; pass an object instead), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`. Never disable a lint rule; split into named helpers instead.
- **React lint (eslint-plugin-react-hooks 7 incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`; event handlers may read the clock), no synchronous `setState` in an effect body (a `setState` inside a `setTimeout` callback is fine), no ref reads during render.
- **CSS:** component CSS lives in plain `.css` files inside `@layer components { ... }` (new file `src/features/inbox/inbox.css`, imported from `app/globals.css`). The guard test `tests/unit/theme/cssFiles.test.ts` fails on a markdown fence line in any CSS file; never paste a fence into CSS. Utilities only for layout spacing.
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}` (the parity test checks them).
- **Server values are never shown raw as enums.** Status, archive reason, `last_run.error` and every AI or server free-text value that acts as a code go through an i18n map; an unknown value shows a neutral label (`status.unknown`, `runline.error.unknown`). AI prose (reasoning) is shown as text through `InlineText`/`Markdown` only.
- **URLs:** every URL rendered as an `href` passes `safeHttpUrl()` (Task 5) first; anything that is not a parseable `http(s)` URL renders no link.
- **Errors:** `describeError(error, t, overrides?)`; never show server `detail`, `message` or `generation_error` text. Allow-listed meanings only through explicit override maps.
- **Colours (spec 5):** overdue and warning states use amber (`--warn`, `.t-warn`, `Notice tone="warn"`); crimson (`--danger`, `.t-danger`, `Notice tone="error"`) is for errors only, always with an icon and words. Vermilion only for the next move (primary buttons), the active nav item, strong scores and the selected-row bar. The threshold numeral, line and slider are ink.
- **Live regions:** announcements go through toasts (`useToast()`), which use the two persistent regions of `ToastProvider`. Do not add new `aria-live` regions; in-place progress uses `role="status"` only where phase 2 already does (`.task-line`).
- **Dialogs and menus:** confirmations use the app `Dialog` (with `PanelHeader`), side panels the app `Drawer`; no second overlay mechanism. Menus follow WAI-ARIA (`MenuButton`); tabs follow the WAI-ARIA tabs pattern (`Tabs`).
- **States:** every list and every data-driven block has loading (skeleton), empty (prototype copy), error (message plus retry) and stalled states. "Stalled" for a list = the request failed and is being retried (D10); for background work (import) = no end event after `STALL_AFTER_MS`.
- **Accessibility (spec 4.3 #5):** a focusable link per row (stretched over the row) instead of a focusable row, no nested interactive elements, visible focus rings, control borders >= 3:1, meaningful meta text >= 13 px, hit targets >= 44 px on mobile.
- **E2E:** every UI task ships its own Playwright spec. The auto fixtures fail a test on any unmocked API call and any console error. Fixtures are typed with the `z.input` types of the real schemas. Each UI spec saves screenshots at 1440 and 390 (`SCREENSHOT_SIZES`, both `COLOR_SCHEMES` for the main screen) through `saveScreenshot` and checks `horizontalOverflow(page) === 0`.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a unit test:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/inbox.test.ts`
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror). If formatting pushes a function above 20 lines, split it into a named helper; never disable the rule.
- **Web checkpoint (every web task):** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` -> all five exit 0. `pnpm test:e2e` builds against the mock API and runs Playwright.
- **Screenshots:** they land in the mirror; copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Backend tests (Tasks 1-3):** `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""` (append a path or node id for a subset). The backend checkpoint is the full suite; it has no pnpm part.
- **Lockfile:** this phase adds no dependency.

## Review Focus

1. **Quick triage clicks.** A user sorts out two rows within a second, or clicks "Rückgängig" while the next request is still running. Expected: both rows stay gone, the undone row comes back exactly once, no row flickers back from an early refetch. Test: Task 9 "sorting out two rows in a row keeps both out" (shared `mutationKey`, refetch only when the last triage settled) and "shortlists at once and undoes from the toast".
2. **Übernehmen while the preview is still loading.** The user drags the slider to 75 and clicks "Übernehmen" before the debounced preview answered. Expected: 75 (the numeral on screen) is applied, never the last debounced value. Test: Task 12 "applies the shown value at once and undoes to the saved one".
3. **Undo of a threshold change** must re-apply the value that was saved *before* this apply (captured with the mutation), not whatever the settings query holds after its refetch, and not 0. Test: Task 12 same test (posts 75, then 60).
4. **Importing a URL that already exists or scores below the threshold.** Expected: the toast says "schon da" / "unter deinem Schwellwert" and links to the job; never "importiert" with a dead link, never silence. Test: Task 7 "names the existing job of a duplicate", "says when the import landed below the threshold", Task 13 e2e "an existing posting is reported with a link".
5. **Deep link to a job that left the list** (`/inbox?tab=unter&job=<id>` after it was restored elsewhere, or a stale bookmark). Expected: the preview falls back to the first row, no error, no empty pane. Test: Task 5 `selectedItem` "falls back to the first row for an unknown id", Task 10 "falls back to the first row for a job that is gone".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | URL state | `/inbox?tab=unter|aus&job=<id>&view=setup`. "Neu" is the default and never written (`?tab` absent). German URL values like the job page (`?tab=unterlagen`). A tab switch drops `job`. All changes use `router.replace(href, { scroll: false })`, so Back leaves the inbox instead of walking through selections. One builder (`inboxHref`) and one parser (`inboxTabFromParam`) in `domain/inbox.ts`. |
| D2 | Preview pane vs. navigation | Every row is a real link to `/jobs/<id>` (stretched over the row, spec 4.3 #5). At `(min-width: 1200px)` (viewport, `useMediaQuery`) the click is intercepted (`preventDefault`) and only sets `?job=`; the preview pane sits beside the list and the first row is selected when the URL names none or a job that is not in the list. Below 1200 px there is no preview: the link opens the job page and `?job=` is ignored. Why: the link stays correct for middle-click, keyboard and screen readers; the pane is an enhancement. After a triage of the shown row the selection moves to the next row, else the previous (prototype `selectAfter`). |
| D3 | Filter control | The three filters use the existing WAI-ARIA `Tabs` primitive (extended with an optional `suffix` for the counts) and the list sits in its `TabPanel`. Spec 4.2 says "seg", the prototype uses `.filter-tabs` (`role="tablist"` with counts); the prototype is binding for layout and tabs are the right semantics for a control that swaps the panel below. |
| D4 | Optimistic triage with undo | Vormerken (`POST /jobs/{id}/status {to:"DRAFTED"}`) and Aussortieren (`PATCH /jobs/{id} {is_archived:true}`) remove the row from the cached page at once (spec 6: optimistic only where undo exists), roll back on error, and show a 10 s toast with "Rückgängig" (`{to:"OPEN"}` / `{is_archived:false}`). Wiederherstellen and Endgültig löschen are not optimistic (no undo; delete asks in a `Dialog` first). All triage mutations share `mutationKey ["inbox-triage"]`; the list is refetched only when the last one settled. |
| D5 | Threshold data | Saved value: `GET /settings` `match_threshold` (0 = off). Ticks: new `GET /matching-preference/distribution` (Task 2, 101 counts, one per whole score of the jobs the threshold sorts: active `OPEN` jobs plus `THRESHOLD`-archived ones). Preview count: B5 `GET /matching-preference/preview?threshold=n`, debounced 300 ms, only while the draft differs from the saved value. "Übernehmen" = `POST /matching-preference {match_threshold, apply_to_existing:true}` with the shown value. Undo = the same call with the value saved before (exact as long as every threshold change goes through "Übernehmen", see G11). The panel lives at the top of the "Unter Schwellwert" tab (spec 4.3 #2), not in Quellen as in the prototype. |
| D6 | Onboarding | New `GET /setup-status` (Task 2) returns `{has_source, ai_configured, profile_complete, has_jobs}` (booleans only; non-admins cannot read the AI settings). The onboarding replaces the inbox when `(!has_source || !ai_configured) && !has_jobs` (first run, spec 4.3 #8) or when `?view=setup` asks for it ("Ersteinrichtung ansehen" at the end of the list). It has three steps: Profil -> `/profile`, Quelle -> `/sources?add=1`, KI-Anbieter -> `/settings?section=ai` for admins, a "bitte die Administration" sentence for others. These are links to the routes of phases 5-7 with a fixed query contract (`SOURCES_ADD_HREF`, `AI_SETTINGS_HREF` in `features/shell/navigation.ts`, recorded in `context/architecture.md`); until those phases land they open the placeholder pages. Why not inline steps: the add-source wizard (3 steps, link preview, pattern, schedule, first run) and the admin AI settings are whole features of phases 5 and 7; duplicating them here would build them twice. The prototype's step 4 "Ersten Lauf starten" is folded into the add-source wizard (B8 `initial_run`). With jobs but no AI provider the inbox shows a warning notice instead. A failing setup-status request shows the inbox (it is advisory and must not lock the home screen). |
| D7 | Import per URL | The masthead's link icon opens a narrow `Drawer` with one URL field (client check: complete `http(s)` link with a dotted host). Submit -> `POST /scraper/import-job {url}` -> crawl id. The drawer then shows the live step of that crawl from the activity cache (`crawl_job_started` ... `job_analysis_*`), and "dauert ungewöhnlich lange" with "Noch einmal versuchen" after `STALL_AFTER_MS`. The import is tracked in the query cache entry `["imports"]` (`realtime/imports.ts`): `new_job` with the same `crawl_job_id` records the job id, score and archive flag, `job_skipped` records the existing job id (Task 3), `crawl_job_completed/failed/cancelled` ends it. `applyEvent` calls `deps.onImportFinished(result)`; `RealtimeProvider` shows the toast ("Importiert und bewertet: 80 · Stark." / "... unter deinem Schwellwert" / "schon da" with "Ansehen", or an error) also after the drawer was closed or the user left the inbox. The drawer disappears once the entry ends. |
| D8 | "Anstehend" card | Data: `GET /jobs?statuses=APPLIED,INTERVIEW,OFFER,GENERATING&is_archived=false&sort_by=date&limit=100` (active applications; GENERATING keeps an advanced application's date). `nextStep(item, now)` per item, keep `isDue`, earliest due first, at most 3 (`dueEntries`). Each entry: next-step label, company · title, due text ("überfällig seit 01.10.2026" in amber, else "in 1 Tag"/"heute"), link to `/jobs/<id>`. Hidden when nothing is due (usability: "only if items"); loading shows nothing (it must not push the list down twice); errors show a one-line error notice with retry. The list item gets `interview_prep_present` and `pre_generation_status` (Task 1) so `nextStep` gives the same answer as on the job page. |
| D9 | Pagination | Infinite queries with offset pages of 50 and a "Weitere laden" button (no infinite scroll: keyboard and screen-reader friendly, no observer). Rows are de-duplicated by id across pages (offset paging can repeat a row after a removal). `realtime/knownJobs.ts` learns the infinite shape so job events for listed rows are not dropped. |
| D10 | "Stalled" for lists | A list is "stalled" when its request failed and TanStack is retrying (`failureCount > 0` without data): the skeleton stays and adds "Die Verbindung hakt. Wird erneut versucht …". No timers. Background work (import) uses `STALL_AFTER_MS` from `domain/pendingTasks.ts`. |
| D11 | Masthead lede | Deck: "{n} neue Treffer. Am stärksten: {company} mit {score}." from the first page of "Neu" (always loaded, also on other tabs), or "Alles gesichtet. Neue Treffer erscheinen nach dem nächsten Lauf.". Run line: the most recently finished `last_run` over all sources ("Letzter Lauf: StepStone, heute 08:00. 12 gefunden, 3 passend, 2 unter Schwellwert. Ansehen"), a failed run in crimson with icon, mapped reason and "Quellen ansehen", then "Nächster Lauf heute 14:00." from the active sources' `schedule_time`/`schedule_days` (Monday = 0, as on the server). |
| D12 | Row content | Monogram, title link, "company · found (heute / seit 3 Tagen) · source (platform name, else posting host)", for a non-`OPEN` job in "Von dir aussortiert" also its phase, one fit line (first sentence of the reasoning summary, else first strength, max 140 chars, plain text), `ScoreMeter` (or "–" when unscored). Actions: Neu -> Vormerken + Aussortieren; Unter Schwellwert -> Wiederherstellen; Von dir aussortiert -> Wiederherstellen + Endgültig löschen. Row buttons carry the job title in their accessible name ("Vormerken: Senior Kotlin Engineer"). |
| D13 | "Von dir aussortiert" = the old archive | It lists every `USER`-archived job, including former applications (old `/archive` page, inventory B.3). Wiederherstellen brings an `OPEN` job back to "Neu" and an application back to Bewerbungen (toast says which). "Endgültig löschen" (`DELETE /jobs/{id}` on an archived job) removes it with history and documents (Task 1). |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | No data source for the threshold distribution ticks (B5 only counts) | **Backend Task 2:** `GET /matching-preference/distribution` -> `{counts: int[101]}`. |
| G2 | Non-admin users cannot tell whether an AI provider is configured (the AI settings are admin-only) | **Backend Task 2:** `GET /setup-status` (booleans only). |
| G3 | `job_skipped` does not say which job the import duplicated | **Backend Task 3:** add `existing_job_id` (only when that job belongs to the crawl's user). |
| G4 | `GET /jobs` items lack `pre_generation_status` and any interview-prep flag, so the "Anstehend" card would disagree with the job page | **Backend Task 1:** add `pre_generation_status` and a derived `interview_prep_present`; the client `nextStep` accepts the flag. |
| G5 | `DELETE /jobs/{id}` on an archived job deletes the job row while history and document rows still reference it (FK error on PostgreSQL) | **Backend Task 1:** delete them first. `POST /jobs/bulk-delete` has the same flaw but is no longer used by the new UI; recorded in the tracker, not fixed here. |
| G6 | Prototype dismiss-reason chips ("Ort", "Gehalt") have no column | **Drop.** The toast has undo only. |
| G7 | Old UI favourites (star, favourite filter) have no place in the spec | **Drop the toggle.** "Vormerken" is the new keep; existing favourites stay protected from threshold runs by the server. Listed for the user to confirm in the tracker. |
| G8 | Old Listings/Archive bulk selection (archive selected, restore selected, delete selected, archive or delete "all from company") | **Drop in the inbox:** per-row actions only (few applications, spec 1 "guidance above speed"). "Alle Stellen archivieren" stays in Einstellungen › Konto (phase 7). Listed for the user to confirm. |
| G9 | Old Listings search, sort, platform/status/"with application" filters | **Not in the inbox:** global search `/` (phase 7) and the Bewerbungen search (phase 4) cover finding a job; each row shows its source; sort is fixed (Neu by score, the archive tabs by date). |
| G10 | Undo of "Aussortieren" uses the restore path, which also sets `kept_by_user` (a later threshold will not hide that job) | **Accept** (a job the user looked at twice is a fair "kept"); documented in the tracker. |
| G11 | Threshold undo re-applies the previous value instead of reversing exact rows; rows archived by an older higher threshold without "apply" (old UI) could be restored too | **Accept:** exact as long as threshold changes go through "Übernehmen" (the only way in the new UI). |
| G12 | The next-run time is computed in the browser's zone; the scheduler uses the profile time zone (default Europe/Berlin) | **Accept** (same zone for this user); documented. |
| G13 | Spec 2.3 "old `?job=<id>` links redirect to `/jobs/<id>`" belongs to the old app's URLs (`/listings?job=`) | **Defer to the cutover (phase 9)**, where the old routes disappear; listed in the hand-off. `/inbox?job=` is the inbox selection (D1). |
| G14 | Prototype: threshold in Quellen, filter label "Aussortiert", onboarding with 4 steps, no "Anstehend", no ticks | **Spec wins:** threshold in Eingang › Unter Schwellwert (4.3 #2), "Von dir aussortiert" (4.3 #4), 3 steps (D6), "Anstehend" (4.2), ticks from usability "Eingang" layout. |
| G15 | Usability #4 "Ausschlusskriterium" flag in rows: no structured field | **Drop**; the fit line carries the reason. |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `routers/jobs.py` | list items gain `pre_generation_status`, `interview_prep_present`; hard delete removes history and documents first (Task 1) |
| `routers/settings.py` | `GET /matching-preference/distribution`, `GET /setup-status` (Task 2) |
| `workers/tasks/analyze.py` | `job_skipped` gains `existing_job_id` (Task 3) |
| `tests/test_jobs_router.py`, `tests/test_matching_threshold.py`, `tests/test_setup_status.py`, `tests/test_analyze_task.py` | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/api/jobList.ts` | list item and page schemas, inbox/due paths, infinite and total query options |
| `src/api/threshold.ts`, `src/api/setup.ts`, `src/api/imports.ts` | threshold (saved, preview, distribution, apply), setup status, import start |
| `src/domain/inbox.ts` | URL parse/build, page flattening and removal, selection, fit line, list phase |
| `src/domain/dueJobs.ts`, `src/domain/runLine.ts`, `src/domain/threshold.ts`, `src/domain/onboarding.ts` | due entries, last run and next run, threshold maths and ticks, onboarding rules |
| `src/i18n/formatDayTime.ts` | "heute 14:00" / "morgen 07:00" / weekday / date |
| `src/realtime/imports.ts`, `src/realtime/useImports.ts` | import tracking reducer and its cache hook |
| `src/lib/useMediaQuery.ts`, `src/lib/useDebouncedValue.ts` | viewport query, debounce |
| `src/features/shell/useImportToast.ts` | toast for a finished import |
| `src/features/inbox/**` | page, URL hook, header and run line, tabs, list and rows, triage, preview, due card, threshold, import, onboarding, `inbox.css` |
| `tests/unit/**` | one test file per module (listed per task) |
| `tests/unit/support/listItemFactory.ts`, `tests/unit/support/inboxRoutes.ts` | list item builder, `GET /jobs` stub by filter |
| `tests/e2e/support/inboxFixtures.ts`, `tests/e2e/inbox*.spec.ts` | fixtures and specs |

Web, modified: `app/(app)/inbox/page.tsx`, `app/globals.css`, `src/api/jobs.ts`, `src/api/platforms.ts`, `src/api/queryKeys.ts`, `src/domain/nextStep.ts`, `src/domain/links.ts`, `src/realtime/events.ts`, `src/realtime/applyEvent.ts`, `src/realtime/knownJobs.ts`, `src/features/shell/RealtimeProvider.tsx`, `src/features/shell/ActivityPanel.tsx` (export `STEP_LABEL`), `src/features/shell/navigation.ts`, `src/features/job/fit/FitTab.tsx` (export `FitColumns`), `src/features/job/JobHeader.tsx` (export `ScoreBox`), `src/ui/Tabs.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/e2e/support/fixtures.ts`, `tests/e2e/support/mockApi.ts` (only if Task 8 Step 1 finds it lacking), `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`.

Feature folder (`src/features/inbox/`):

```
InboxPage.tsx  InboxListColumn.tsx  useInboxUrl.ts  useInboxLists.ts  useSelection.ts  inbox.css
InboxHeader.tsx  RunLine.tsx  InboxTabs.tsx  InboxList.tsx  InboxRow.tsx  RowActions.tsx
useTriage.ts  DeleteJobDialog.tsx  InboxPreview.tsx  DueCard.tsx
threshold/   ThresholdPanel.tsx  ThresholdControl.tsx  ThresholdTicks.tsx  useThreshold.ts
import/      ImportButton.tsx  ImportForm.tsx  ImportProgress.tsx  useImportJob.ts  importUrl.ts
onboarding/  Onboarding.tsx  AiMissingNotice.tsx
```

Task order: backend Tasks 1-3 (parallel, any time); web Tasks 4 -> 16 strictly in order.

---
### Task 1: Backend: list fields for the due card, and a hard delete that cleans its rows

**Files:**
- Modify: `server/routers/jobs.py` (`_JOB_LIST_COLUMNS`, `_job_list_item`, `delete_job`)
- Test: `server/tests/test_jobs_router.py`

**Interfaces:**
- Consumes: `JobEntry.pre_generation_status`, `JobEntry.interview_prep_material` (existing columns), `JobStatusHistory`, `JobDocument` (already imported in `routers/jobs.py`).
- Produces: every `GET /jobs` item additionally carries `"pre_generation_status": str | null` and `"interview_prep_present": bool` (never the prep text itself). `DELETE /jobs/{id}` on an archived job answers `{"status": "deleted"}` and leaves no `job_status_history` or `job_documents` row of that job; an active job is still archived with reason `USER`.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_jobs_router.py`:

```python
PREP_JSON = '{"questions": []}'


def test_list_items_carry_pre_generation_status_and_prep_flag(api_client, seed):
    seed(make_job(status="GENERATING", pre_generation_status="APPLIED", interview_prep_material=PREP_JSON))
    item = api_client.get("/jobs").json()["items"][0]
    assert (item["pre_generation_status"], item["interview_prep_present"]) == ("APPLIED", True)
    assert "interview_prep_material" not in item


def test_list_item_prep_flag_is_false_without_material(api_client, seed):
    seed(make_job())
    assert api_client.get("/jobs").json()["items"][0]["interview_prep_present"] is False


def _history_row(job_id: str) -> JobStatusHistory:
    return JobStatusHistory(job_id=job_id, from_status="OPEN", to_status="DRAFTED")


def _document_row(job_id: str, doc_id: int) -> JobDocument:
    return JobDocument(
        id=doc_id, job_id=job_id, user_id=TEST_USER_ID, filename="db://cv.pdf",
        original_filename="cv.pdf", content=b"%PDF", kind="UPLOADED",
    )


def test_deleting_an_archived_job_removes_its_history_and_documents(api_client, seed, session_factory):
    seed(make_job(is_archived=True, archive_reason="USER"), _history_row("job-1"), _document_row("job-1", 1))
    assert api_client.delete("/jobs/job-1").json() == {"status": "deleted"}
    with session_factory() as db:
        left = (db.query(JobStatusHistory).count(), db.query(JobDocument).count(), db.get(JobEntry, "job-1"))
    assert left == (0, 0, None)


def test_deleting_one_job_keeps_the_rows_of_another(api_client, seed, session_factory):
    seed(
        make_job(is_archived=True, archive_reason="USER"), make_job(id="job-2"),
        _history_row("job-2"), _document_row("job-2", 2),
    )
    api_client.delete("/jobs/job-1")
    with session_factory() as db:
        assert (db.query(JobStatusHistory).count(), db.query(JobDocument).count()) == (1, 1)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py -k "prep_flag or pre_generation or deleting"`
Expected: FAIL (`KeyError: 'pre_generation_status'`, `KeyError: 'interview_prep_present'`, and the delete tests count leftover rows `(1, 1, None)`).

- [ ] **Step 3: Implement**

In `server/routers/jobs.py`, extend the list columns and the item builder:

```python
_JOB_LIST_COLUMNS = (
    "id", "title", "company", "company_domain", "match_score", "reasoning", "url",
    "status", "generation_error", "is_favorite", "is_archived", "archive_reason",
    "platform_id", "checklist", "pre_generation_status",
)


def _job_list_item(job: JobEntry) -> dict:
    item = {column: getattr(job, column) for column in _JOB_LIST_COLUMNS}
    item.update(_derived_job_fields(job))
    # The prep text is large; the inbox "Anstehend" card only needs to know that it exists.
    item["interview_prep_present"] = bool(job.interview_prep_material)
    return item
```

Add this helper right above `@router.delete("/jobs/{job_id}")`:

```python
def _delete_job_with_rows(db, job: JobEntry) -> None:
    """History and document rows reference the job (foreign keys), so they are removed first."""
    db.query(JobStatusHistory).filter(JobStatusHistory.job_id == job.id).delete(synchronize_session=False)
    db.query(JobDocument).filter(JobDocument.job_id == job.id).delete(synchronize_session=False)
    db.delete(job)
```

In `delete_job`, replace the two lines

```python
        if job.is_archived:
            db.delete(job)
```

with

```python
        if job.is_archived:
            _delete_job_with_rows(db, job)
```

- [ ] **Step 4: Run them to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py`
Expected: PASS (all tests of the file, including the existing `test_delete_job_archives_with_user_reason`).

- [ ] **Step 5: Checkpoint**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: the whole suite passes (count = previous count + 4).

---

### Task 2: Backend: threshold distribution and setup status

**Files:**
- Modify: `server/routers/settings.py`
- Test: `server/tests/test_matching_threshold.py`, create `server/tests/test_setup_status.py`

**Interfaces:**
- Consumes: `_jobs_to_archive` neighbours in `routers/settings.py` (`STATUS_OPEN`, `ArchiveReason`, `MIN_MATCH_THRESHOLD`, `MAX_MATCH_THRESHOLD`), `SystemSettings`, `JobPlatform`, `UserProfile`, `JobEntry`.
- Produces:
  - `GET /matching-preference/distribution` -> `{"counts": [int] * 101}`; `counts[s]` = number of the user's jobs with status `OPEN` and a score that rounds half-up to `s`, that are active or `THRESHOLD`-archived (the jobs the threshold sorts). Half-up matches `Math.round` of the web client, so a tick sits where the list shows the score.
  - `GET /setup-status` -> `{"has_source": bool, "ai_configured": bool, "profile_complete": bool, "has_jobs": bool}`. `ai_configured`: the system settings row has a non-blank `openrouter_api_key` or `ollama_base_url`. `profile_complete`: the user's profile has a non-blank `role` and `skills`. `has_jobs`: the user owns a job whose status is not `SEEN`. No secret leaves the server.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_matching_threshold.py`:

```python
SCORE_BUCKETS = MAX_MATCH_THRESHOLD + 1


def _distribution(api_client) -> list:
    return api_client.get("/matching-preference/distribution").json()["counts"]


def test_distribution_counts_jobs_per_rounded_score(api_client, seed):
    seed(
        make_job(id="a", match_score=84.4),
        make_job(id="b", match_score=84.5),
        make_job(id="hidden", match_score=40.0, is_archived=True, archive_reason="THRESHOLD"),
    )
    counts = _distribution(api_client)
    assert len(counts) == SCORE_BUCKETS
    assert (counts[84], counts[85], counts[40], sum(counts)) == (1, 1, 1, 3)


def test_distribution_skips_jobs_the_threshold_does_not_sort(api_client, seed):
    seed(
        make_user(OTHER_USER_ID),
        make_job(id="drafted", status="DRAFTED"),
        make_job(id="discarded", is_archived=True, archive_reason="USER"),
        make_job(id="unscored", match_score=None),
        make_job(id="foreign", user_id=OTHER_USER_ID),
    )
    assert sum(_distribution(api_client)) == 0
```

Create `server/tests/test_setup_status.py`:

```python
from database.core import SystemSettings
from tests.factories import OTHER_USER_ID, make_job, make_platform, make_profile, make_user

OPENROUTER_KEY = "sk-or-test"
OLLAMA_URL = "http://ollama.local:11434/v1"
NOTHING = {"has_source": False, "ai_configured": False, "profile_complete": False, "has_jobs": False}


def _status(api_client) -> dict:
    return api_client.get("/setup-status").json()


def test_fresh_account_has_nothing_set_up(api_client):
    assert _status(api_client) == NOTHING


def test_reports_source_profile_and_jobs(api_client, seed):
    seed(make_platform(), make_profile(), make_job())
    body = _status(api_client)
    assert (body["has_source"], body["profile_complete"], body["has_jobs"]) == (True, True, True)


def test_openrouter_key_or_ollama_url_counts_as_ai_provider(api_client, seed, session_factory):
    seed(SystemSettings(id=1, openrouter_api_key=OPENROUTER_KEY))
    assert _status(api_client)["ai_configured"] is True
    with session_factory() as db:
        settings = db.get(SystemSettings, 1)
        settings.openrouter_api_key, settings.ollama_base_url = "  ", OLLAMA_URL
        db.commit()
    assert _status(api_client)["ai_configured"] is True


def test_blank_ai_settings_do_not_count(api_client, seed):
    seed(SystemSettings(id=1, openrouter_api_key=" ", ollama_base_url=""))
    assert _status(api_client)["ai_configured"] is False


def test_profile_without_skills_is_incomplete(api_client, seed):
    seed(make_profile(skills="  "))
    assert _status(api_client)["profile_complete"] is False


def test_seen_placeholders_and_other_users_do_not_count(api_client, seed):
    seed(
        make_user(OTHER_USER_ID),
        make_job(status="SEEN"),
        make_job(id="foreign", user_id=OTHER_USER_ID),
        make_platform(id=99, user_id=OTHER_USER_ID),
    )
    assert _status(api_client) == NOTHING
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_matching_threshold.py tests/test_setup_status.py`
Expected: FAIL with 404 responses (`KeyError: 'counts'`, and the setup-status bodies are `{"detail": "Not Found"}`).

- [ ] **Step 3: Implement**

In `server/routers/settings.py`:

1. Add `import math` to the standard-library imports at the top.
2. Extend the `from database.core import (...)` block with `JobPlatform` and `SystemSettings` (keep the alphabetical order of the block).
3. Add below `_apply_threshold`:

```python
SCORE_BUCKETS = MAX_MATCH_THRESHOLD + 1
HALF = 0.5


def _score_bucket(score: float) -> int:
    # Half up like Math.round in the web client, so a tick sits where the list shows the score.
    return min(MAX_MATCH_THRESHOLD, max(MIN_MATCH_THRESHOLD, math.floor(score + HALF)))


def _threshold_population(db: Session, user_id: int):
    """The jobs a threshold sorts: active matches plus the ones it hid."""
    return db.query(JobEntry.match_score).filter(
        JobEntry.user_id == user_id,
        JobEntry.status == STATUS_OPEN,
        JobEntry.match_score.isnot(None),
        or_(JobEntry.is_archived == False, JobEntry.archive_reason == ArchiveReason.THRESHOLD.value),
    )


def _ai_configured(db: Session) -> bool:
    """Mirrors intelligence.service: an OpenRouter key or an Ollama URL stored by the admin."""
    settings = db.query(SystemSettings).first()
    if not settings:
        return False
    return bool((settings.openrouter_api_key or "").strip() or (settings.ollama_base_url or "").strip())


def _profile_complete(profile: Optional[UserProfile]) -> bool:
    return bool(profile and (profile.role or "").strip() and (profile.skills or "").strip())


def _owns_any(db: Session, column, *conditions) -> bool:
    return db.query(column).filter(*conditions).first() is not None
```

4. Add below `preview_matching_threshold` (before `@router.post("/matching-preference")`):

```python
@router.get("/matching-preference/distribution")
def threshold_distribution(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Jobs per whole score 0..100, for the tick strip under the inbox threshold slider."""
    counts = [0] * SCORE_BUCKETS
    for (score,) in _threshold_population(db, current_user.id):
        counts[_score_bucket(score)] += 1
    return {"counts": counts}
```

5. Add at the end of the "preferences" endpoints (after `save_timezone_preference`):

```python
@router.get("/setup-status")
def get_setup_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What the first-run onboarding needs. Booleans only: no setting or secret leaves the server."""
    user_id = current_user.id
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    return {
        "has_source": _owns_any(db, JobPlatform.id, JobPlatform.user_id == user_id),
        "ai_configured": _ai_configured(db),
        "profile_complete": _profile_complete(profile),
        "has_jobs": _owns_any(db, JobEntry.id, JobEntry.user_id == user_id, JobEntry.status != "SEEN"),
    }
```

(`or_`, `Optional`, `Session`, `STATUS_OPEN`, `ArchiveReason` are already imported in this module.)

- [ ] **Step 4: Run them to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_matching_threshold.py tests/test_setup_status.py tests/test_settings_router.py`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: the whole suite passes.

---

### Task 3: Backend: name the existing job when an import is a duplicate

**Files:**
- Modify: `server/workers/tasks/analyze.py` (the `job_skipped` publish inside `analyze_job_task`)
- Test: `server/tests/test_analyze_task.py`

**Interfaces:**
- Consumes: the skip branch of `analyze_job_task` (`existing_job and not force_reanalyze`), `events_of_type` from `tests/factories.py`.
- Produces: the `job_skipped` event (published only with a `crawl_job_id`) additionally carries `"existing_job_id": str | null`: the id of the job that made this posting a duplicate when it belongs to the crawl's user, else `null`. The web client (Task 7) links the "schon da" toast to it.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_analyze_task.py` (add `OTHER_USER_ID` to the `tests.factories` import if it is not there):

```python
def test_skipped_job_event_names_the_existing_job(run_analysis, seed, fake_redis):
    seed(make_job())
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert events_of_type(fake_redis, "job_skipped")[0]["existing_job_id"] == "job-1"


def test_skipped_job_event_hides_a_foreign_job_id(run_analysis, seed, fake_redis):
    seed(make_user(OTHER_USER_ID), make_job(user_id=OTHER_USER_ID))
    run_analysis(HIGH_SCORE, crawl_job_id=CRAWL_ID)
    assert events_of_type(fake_redis, "job_skipped")[0]["existing_job_id"] is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_analyze_task.py -k skipped_job_event`
Expected: FAIL with `KeyError: 'existing_job_id'`.

- [ ] **Step 3: Implement**

In `server/workers/tasks/analyze.py`, add `from typing import Optional` to the imports and this helper above `analyze_job_task`:

```python
def _own_job_id(job: JobEntry, user_id) -> Optional[str]:
    """The duplicate's id, only when it belongs to the crawl's user (events reach that user only)."""
    return job.id if job.user_id == user_id else None
```

In the skip branch of `analyze_job_task`, extend the published payload (the dict with `"type": "job_skipped"`) by one entry after `"jobs_skipped": jobs_skipped,`:

```python
                            "existing_job_id": _own_job_id(existing_job, user_id),
```

Leave the second `job_skipped` publish in `save_job_basic_task` unchanged (initial seeding runs are never imports).

- [ ] **Step 4: Run them to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_analyze_task.py tests/test_ws_publishers.py`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: the whole suite passes.

---

### Task 4: Web API layer for the inbox (lists, threshold, setup status, import, delete, platforms)

**Files:**
- Create: `web/src/api/jobList.ts`, `web/src/api/threshold.ts`, `web/src/api/setup.ts`, `web/src/api/imports.ts`, `web/tests/unit/support/listItemFactory.ts`
- Modify: `web/src/api/jobs.ts` (add `deleteJob`), `web/src/api/platforms.ts`, `web/src/api/queryKeys.ts`, `web/src/realtime/knownJobs.ts`
- Test: `web/tests/unit/api/inboxApi.test.ts`, `web/tests/unit/realtime/knownJobs.test.ts`

**Interfaces:**
- Consumes: `api` (`src/api/instance.ts`), `jobPath` (`src/api/jobs.ts`), `JobListPage` (`src/api/jobs.ts`), `queryKeys`.
- Produces:
  - `jobList.ts`: `INBOX_TABS = ["new","below","dismissed"] as const`, `type InboxTab`, `INBOX_PAGE_SIZE = 50`, `DUE_PAGE_SIZE = 100`, `jobListItemSchema`, `type JobListItem`, `type JobListItemBody`, `type JobPage = { items: JobListItem[]; total: number }`, `type JobPageBody`, `inboxListPath(tab, offset, limit = INBOX_PAGE_SIZE): string`, `dueListPath(): string`, `fetchJobPage(path): Promise<JobPage>`, `nextOffset(last: JobPage, pages: readonly JobPage[]): number | undefined`, `inboxListQueryOptions(tab)` (infinite, key `queryKeys.inboxList(tab)`), `inboxTotalQueryOptions(tab)` (number), `dueApplicationsQueryOptions()` (`JobPage`).
  - `threshold.ts`: `SCORE_BUCKETS = 101`, `type ThresholdSettingsBody`, `type ThresholdPreview = { threshold; would_archive; would_restore }`, `type ThresholdPreviewBody`, `type ThresholdDistributionBody`, `type ThresholdApplied = { match_threshold; archived; restored }`, `type ThresholdAppliedBody`, `fetchMatchThreshold(): Promise<number>`, `fetchThresholdPreview(threshold)`, `fetchThresholdDistribution(): Promise<number[]>`, `applyThreshold(threshold): Promise<ThresholdApplied>`, `matchThresholdQueryOptions()`, `thresholdDistributionQueryOptions()`, `thresholdPreviewQueryOptions(threshold)`.
  - `setup.ts`: `type SetupStatus = { has_source; ai_configured; profile_complete; has_jobs }`, `type SetupStatusBody`, `fetchSetupStatus()`, `setupStatusQueryOptions()`.
  - `imports.ts`: `importJobByUrl(url: string): Promise<string>` (the crawl id).
  - `jobs.ts`: `type DeleteOutcome = "archived" | "deleted"`, `deleteJob(id): Promise<DeleteOutcome>`.
  - `platforms.ts`: `Platform` gains `is_active: boolean` (default true), `schedule_time?: string | null`, `schedule_days?: number[] | null`, `last_crawl_at?: string | null`, `last_run?: { error?, started_at?, finished_at?, found?, new?, matched? } | null`.
  - `queryKeys`: `inboxList(tab)`, `inboxTotal(tab)`, `dueApplications`, `matchThreshold`, `thresholdDistribution`, `thresholdPreviewRoot`, `thresholdPreview(n)`, `setupStatus`, `imports`.
  - `isJobInCache` also finds jobs in infinite list pages.
  - Test support: `buildListItem(overrides?): JobListItem`, `pageOf(items, total?): JobPage`.

- [ ] **Step 1: Write the test support and the failing tests**

`web/tests/unit/support/listItemFactory.ts`:

```ts
import type { JobListItem, JobPage } from "@/api/jobList";

const ITEM_DEFAULTS: JobListItem = {
  id: "job-1",
  title: "Senior Backend Engineer",
  company: "ACME GmbH",
  match_score: 84,
  reasoning: null,
  url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
  status: "OPEN",
  is_archived: false,
  archive_reason: null,
  platform_id: 1,
  created_at: "2026-10-06T07:00:00+00:00",
  next_follow_up_at: null,
  interview_at: null,
  cv_html_present: false,
  cover_letter_html_present: false,
  pre_generation_status: null,
  interview_prep_present: false,
};

/** A row as GET /jobs returns it; tests override only what they are about. */
export function buildListItem(overrides: Partial<JobListItem> = {}): JobListItem {
  return { ...ITEM_DEFAULTS, ...overrides };
}

export function pageOf(items: JobListItem[], total = items.length): JobPage {
  return { items, total };
}
```

`web/tests/unit/api/inboxApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importJobByUrl } from "@/api/imports";
import { dueListPath, fetchJobPage, inboxListPath, nextOffset } from "@/api/jobList";
import { deleteJob } from "@/api/jobs";
import { fetchPlatforms } from "@/api/platforms";
import { fetchSetupStatus } from "@/api/setup";
import {
  applyThreshold,
  fetchMatchThreshold,
  fetchThresholdDistribution,
  fetchThresholdPreview,
  SCORE_BUCKETS,
} from "@/api/threshold";
import { buildListItem, pageOf } from "../support/listItemFactory";
import { stubRoutes } from "../support/stubRoutes";

const bodyOf = (calls: { body: string | null }[]) => JSON.parse(calls[0]?.body ?? "null");

describe("inbox list paths", () => {
  it("asks for active matches by score", () => {
    expect(inboxListPath("new", 0)).toBe(
      "/jobs?statuses=OPEN&is_archived=false&sort_by=score&limit=50&offset=0",
    );
  });

  it("asks for threshold-archived jobs, newest first", () => {
    expect(inboxListPath("below", 50)).toBe(
      "/jobs?is_archived=true&archive_reason=THRESHOLD&sort_by=date&limit=50&offset=50",
    );
  });

  it("asks for the user's own discards with a custom page size", () => {
    expect(inboxListPath("dismissed", 0, 1)).toBe(
      "/jobs?is_archived=true&archive_reason=USER&sort_by=date&limit=1&offset=0",
    );
  });

  it("asks for active applications for the due card", () => {
    expect(dueListPath()).toBe(
      "/jobs?statuses=APPLIED%2CINTERVIEW%2COFFER%2CGENERATING&is_archived=false&sort_by=date&limit=100&offset=0",
    );
  });
});

describe("fetchJobPage", () => {
  it("reads rows and fills missing flags", async () => {
    stubRoutes({ "GET /jobs": { items: [{ id: "job-1", status: "OPEN" }], total: 1 } });
    await expect(fetchJobPage(inboxListPath("new", 0))).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "job-1",
          cv_html_present: false,
          interview_prep_present: false,
        }),
      ],
      total: 1,
    });
  });
});

describe("nextOffset", () => {
  const two = pageOf([buildListItem({ id: "a" }), buildListItem({ id: "b" })], 3);

  it("continues after the loaded rows", () => {
    expect(nextOffset(two, [two])).toBe(2);
  });

  it("stops when every row is loaded", () => {
    const all = pageOf([buildListItem({ id: "c" })], 3);
    expect(nextOffset(all, [two, all])).toBeUndefined();
  });

  it("stops on an empty page even if the total says more", () => {
    const empty = pageOf([], 5);
    expect(nextOffset(empty, [two, empty])).toBeUndefined();
  });
});

describe("threshold", () => {
  it("reads the saved threshold and treats a missing one as off", async () => {
    stubRoutes({ "GET /settings": { language: "de" } });
    await expect(fetchMatchThreshold()).resolves.toBe(0);
  });

  it("previews a threshold", async () => {
    const calls = stubRoutes({
      "GET /matching-preference/preview": { threshold: 70, would_archive: 4, would_restore: 1 },
    });
    await expect(fetchThresholdPreview(70)).resolves.toEqual({
      threshold: 70,
      would_archive: 4,
      would_restore: 1,
    });
    expect(calls[0].url).toBe("http://api.test/matching-preference/preview?threshold=70");
  });

  it("reads the distribution and refuses one of the wrong length", async () => {
    const counts = Array.from({ length: SCORE_BUCKETS }, () => 0);
    stubRoutes({ "GET /matching-preference/distribution": { counts } });
    await expect(fetchThresholdDistribution()).resolves.toHaveLength(SCORE_BUCKETS);
    stubRoutes({ "GET /matching-preference/distribution": { counts: [1, 2] } });
    await expect(fetchThresholdDistribution()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("applies to existing jobs", async () => {
    const calls = stubRoutes({
      "POST /matching-preference": { status: "saved", match_threshold: 70, archived: 4, restored: 1 },
    });
    await expect(applyThreshold(70)).resolves.toEqual({
      match_threshold: 70,
      archived: 4,
      restored: 1,
    });
    expect(bodyOf(calls)).toEqual({ match_threshold: 70, apply_to_existing: true });
  });
});

describe("setup, import and delete", () => {
  it("reads the setup status", async () => {
    const status = { has_source: true, ai_configured: false, profile_complete: true, has_jobs: false };
    stubRoutes({ "GET /setup-status": status });
    await expect(fetchSetupStatus()).resolves.toEqual(status);
  });

  it("starts an import and returns the crawl id", async () => {
    const calls = stubRoutes({ "POST /scraper/import-job": { status: "Started", job_id: "crawl-9" } });
    await expect(importJobByUrl("https://karriere.example.de/jobs/1")).resolves.toBe("crawl-9");
    expect(bodyOf(calls)).toEqual({ url: "https://karriere.example.de/jobs/1" });
  });

  it("turns a scraper refusal into an upstream error", async () => {
    stubRoutes({ "POST /scraper/import-job": { status: "Error", message: "URL muss mit http(s) beginnen." } });
    await expect(importJobByUrl("x")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("deletes a job and reports what happened", async () => {
    stubRoutes({ "DELETE /jobs/job-1": { status: "deleted" } });
    await expect(deleteJob("job-1")).resolves.toBe("deleted");
  });
});

describe("platforms for the run line", () => {
  it("reads schedules and last-run counts with defaults", async () => {
    stubRoutes({
      "GET /platforms": [
        {
          id: 1,
          name: "StepStone",
          url: "https://www.stepstone.de/jobs/kotlin",
          schedule_time: "07:00",
          schedule_days: [0, 1, 2],
          last_run: { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3 },
        },
        { id: 2, name: "Indeed", url: "https://de.indeed.com", last_run: "broken" },
      ],
    });
    const [stepstone, indeed] = await fetchPlatforms();
    expect(stepstone).toMatchObject({
      is_active: true,
      schedule_time: "07:00",
      last_run: { found: 12, new: 5, matched: 3 },
    });
    expect(indeed?.last_run).toBeNull();
  });
});
```

`web/tests/unit/realtime/knownJobs.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { isJobInCache } from "@/realtime/knownJobs";

describe("isJobInCache", () => {
  it("finds a job in an infinite inbox list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxList("new"), {
      pages: [{ items: [{ id: "job-9" }], total: 1 }],
      pageParams: [0],
    });
    expect(isJobInCache(queryClient, "job-9")).toBe(true);
    expect(isJobInCache(queryClient, "job-8")).toBe(false);
  });

  it("finds a job in a plain page", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.dueApplications, { items: [{ id: "job-3" }], total: 1 });
    expect(isJobInCache(queryClient, "job-3")).toBe(true);
  });

  it("ignores counters stored under the jobs root", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxTotal("below"), 4);
    expect(isJobInCache(queryClient, "job-1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/inboxApi.test.ts tests/unit/realtime/knownJobs.test.ts`
Expected: FAIL, unresolved `@/api/imports` (and the missing query keys).

- [ ] **Step 3: Add the query keys**

In `web/src/api/queryKeys.ts`, add inside the object (after `jobsRoot`):

```ts
  // Inbox lists and counters live under the jobs root, so every job event refreshes them.
  inboxList: (tab: string) => ["jobs", "inbox", tab] as const,
  inboxTotal: (tab: string) => ["jobs", "inbox-total", tab] as const,
  dueApplications: ["jobs", "due"],
  matchThreshold: ["settings", "match-threshold"],
  thresholdDistribution: ["threshold-distribution"],
  thresholdPreviewRoot: ["threshold-preview"],
  thresholdPreview: (threshold: number) => ["threshold-preview", threshold] as const,
  setupStatus: ["setup-status"],
  // Imports started in this tab, finished by realtime events (src/realtime/imports.ts).
  imports: ["imports"],
```

- [ ] **Step 4: Write `jobList.ts`**

`web/src/api/jobList.ts`:

```ts
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

export const INBOX_TABS = ["new", "below", "dismissed"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const INBOX_PAGE_SIZE = 50;
// The server caps a page at 100; an occasional user has far fewer active applications.
export const DUE_PAGE_SIZE = 100;
// GENERATING counts: a regeneration for an application that is out keeps its due date.
const DUE_STATUSES = "APPLIED,INTERVIEW,OFFER,GENERATING";

// GET /jobs items (B6): no description or HTML bodies, presence flags instead.
export const jobListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  match_score: z.number().nullish(),
  reasoning: z.string().nullish(),
  url: z.string().nullish(),
  status: z.string(),
  is_archived: z.boolean().nullish(),
  archive_reason: z.string().nullish(),
  platform_id: z.number().int().nullish(),
  created_at: z.string().nullish(),
  next_follow_up_at: z.string().nullish(),
  interview_at: z.string().nullish(),
  cv_html_present: z.boolean().default(false),
  cover_letter_html_present: z.boolean().default(false),
  pre_generation_status: z.string().nullish(),
  interview_prep_present: z.boolean().default(false),
});
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobListItemBody = z.input<typeof jobListItemSchema>;

const jobPageSchema = z.object({
  items: z.array(jobListItemSchema),
  total: z.number().int().nonnegative(),
});
export type JobPage = z.infer<typeof jobPageSchema>;
export type JobPageBody = z.input<typeof jobPageSchema>;

// Fixed key order: e2e fixtures key their mocks on the exact query string.
const TAB_FILTERS: Readonly<Record<InboxTab, Readonly<Record<string, string>>>> = {
  new: { statuses: "OPEN", is_archived: "false", sort_by: "score" },
  below: { is_archived: "true", archive_reason: "THRESHOLD", sort_by: "date" },
  dismissed: { is_archived: "true", archive_reason: "USER", sort_by: "date" },
};

function listPath(filters: Readonly<Record<string, string>>, offset: number, limit: number) {
  const params = new URLSearchParams({ ...filters, limit: String(limit), offset: String(offset) });
  return `/jobs?${params}`;
}

export function inboxListPath(tab: InboxTab, offset: number, limit = INBOX_PAGE_SIZE): string {
  return listPath(TAB_FILTERS[tab], offset, limit);
}

export function dueListPath(): string {
  const filters = { statuses: DUE_STATUSES, is_archived: "false", sort_by: "date" };
  return listPath(filters, 0, DUE_PAGE_SIZE);
}

export async function fetchJobPage(path: string): Promise<JobPage> {
  return api.request(path, jobPageSchema);
}

/** Offset of the next page; undefined once every row is loaded or the server sent an empty page. */
export function nextOffset(last: JobPage, pages: readonly JobPage[]): number | undefined {
  const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
  return last.items.length > 0 && loaded < last.total ? loaded : undefined;
}

export function inboxListQueryOptions(tab: InboxTab) {
  return infiniteQueryOptions({
    queryKey: queryKeys.inboxList(tab),
    queryFn: ({ pageParam }) => fetchJobPage(inboxListPath(tab, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
  });
}

/** Tab counter: one row is enough, the answer's total is the count. */
export function inboxTotalQueryOptions(tab: InboxTab) {
  return queryOptions({
    queryKey: queryKeys.inboxTotal(tab),
    queryFn: async () => (await fetchJobPage(inboxListPath(tab, 0, 1))).total,
  });
}

export function dueApplicationsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.dueApplications,
    queryFn: () => fetchJobPage(dueListPath()),
  });
}
```

- [ ] **Step 5: Write `threshold.ts`, `setup.ts`, `imports.ts`**

`web/src/api/threshold.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

/** One count per whole score 0..100 (GET /matching-preference/distribution). */
export const SCORE_BUCKETS = 101;
const THRESHOLD_OFF = 0;

// GET /settings returns the whole profile; the inbox only needs the threshold (0 = off).
const thresholdSettingsSchema = z.object({ match_threshold: z.number().int().nullish() });
export type ThresholdSettingsBody = z.input<typeof thresholdSettingsSchema>;

const previewSchema = z.object({
  threshold: z.number().int(),
  would_archive: z.number().int(),
  would_restore: z.number().int(),
});
export type ThresholdPreview = z.infer<typeof previewSchema>;
export type ThresholdPreviewBody = z.input<typeof previewSchema>;

const distributionSchema = z.object({
  counts: z.array(z.number().int().nonnegative()).length(SCORE_BUCKETS),
});
export type ThresholdDistributionBody = z.input<typeof distributionSchema>;

const appliedSchema = z.object({
  match_threshold: z.number().int(),
  archived: z.number().int(),
  restored: z.number().int(),
});
export type ThresholdApplied = z.infer<typeof appliedSchema>;
export type ThresholdAppliedBody = z.input<typeof appliedSchema>;

export async function fetchMatchThreshold(): Promise<number> {
  const settings = await api.request("/settings", thresholdSettingsSchema);
  return settings.match_threshold ?? THRESHOLD_OFF;
}

export async function fetchThresholdPreview(threshold: number): Promise<ThresholdPreview> {
  const query = new URLSearchParams({ threshold: String(threshold) });
  return api.request(`/matching-preference/preview?${query}`, previewSchema);
}

export async function fetchThresholdDistribution(): Promise<number[]> {
  const distribution = await api.request("/matching-preference/distribution", distributionSchema);
  return distribution.counts;
}

/** Saves the threshold and re-sorts the existing matches at once (B5 apply_to_existing). */
export async function applyThreshold(threshold: number): Promise<ThresholdApplied> {
  return api.request("/matching-preference", appliedSchema, {
    method: "POST",
    json: { match_threshold: threshold, apply_to_existing: true },
  });
}

export function matchThresholdQueryOptions() {
  return queryOptions({ queryKey: queryKeys.matchThreshold, queryFn: fetchMatchThreshold });
}

export function thresholdDistributionQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.thresholdDistribution,
    queryFn: fetchThresholdDistribution,
  });
}

export function thresholdPreviewQueryOptions(threshold: number) {
  return queryOptions({
    queryKey: queryKeys.thresholdPreview(threshold),
    queryFn: () => fetchThresholdPreview(threshold),
  });
}
```

`web/src/api/setup.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

// Booleans only: non-admins may not read the AI settings themselves.
const setupStatusSchema = z.object({
  has_source: z.boolean(),
  ai_configured: z.boolean(),
  profile_complete: z.boolean(),
  has_jobs: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export type SetupStatusBody = z.input<typeof setupStatusSchema>;

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return api.request("/setup-status", setupStatusSchema);
}

export function setupStatusQueryOptions() {
  return queryOptions({ queryKey: queryKeys.setupStatus, queryFn: fetchSetupStatus });
}
```

`web/src/api/imports.ts`:

```ts
import { z } from "zod";
import { api } from "./instance";

// {status:"Started", job_id}; a refusal is 200 + {status:"Error"}, which the client turns into an ApiError.
const importStartedSchema = z.object({ job_id: z.string() });

/** Starts a single-URL import; the answer is the crawl id its realtime events carry. */
export async function importJobByUrl(url: string): Promise<string> {
  const started = await api.request("/scraper/import-job", importStartedSchema, {
    method: "POST",
    json: { url },
  });
  return started.job_id;
}
```

- [ ] **Step 6: Extend `jobs.ts` and `platforms.ts`**

Append to `web/src/api/jobs.ts`:

```ts
const deletedSchema = z.object({ status: z.enum(["archived", "deleted"]) });
export type DeleteOutcome = z.infer<typeof deletedSchema>["status"];

/** DELETE archives an active job and removes an archived one for good, with history and files. */
export async function deleteJob(id: string): Promise<DeleteOutcome> {
  const deleted = await api.request(jobPath(id), deletedSchema, { method: "DELETE" });
  return deleted.status;
}
```

In `web/src/api/platforms.ts`, replace the two schemas (keep the comment style and the exports below them):

```ts
// B9 summary of the last crawl; error is a fixed code (cancelled, unreachable, failed).
const lastRunSchema = z.object({
  error: z.string().nullish(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
  found: z.number().int().nullish(),
  new: z.number().int().nullish(),
  matched: z.number().int().nullish(),
});

// last_run and schedule_days are free JSON columns: an odd shape reads as empty, not as a broken list.
const platformSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string(),
  is_active: z.boolean().default(true),
  schedule_time: z.string().nullish(),
  schedule_days: z.array(z.number().int()).nullish().catch(null),
  last_crawl_at: z.string().nullish(),
  last_run: lastRunSchema.nullish().catch(null),
});
```

- [ ] **Step 7: Teach `knownJobs.ts` the infinite shape**

Replace `web/src/realtime/knownJobs.ts` with:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { JobListPage } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";

type CachedList = Partial<JobListPage> & { pages?: ReadonlyArray<Partial<JobListPage>> };

/** Rows of a cached list: a plain page ({items}) or an infinite query ({pages: [{items}]}). */
function listedRows(data: unknown): ReadonlyArray<{ id: string }> {
  if (typeof data !== "object" || data === null) return [];
  const list = data as CachedList;
  return list.items ?? list.pages?.flatMap((page) => page.items ?? []) ?? [];
}

/**
 * True when this tab holds the job in a detail query or in any loaded list. Other data under
 * the jobs root (tab counters) has no rows and is skipped.
 */
export function isJobInCache(queryClient: QueryClient, jobId: string): boolean {
  if (queryClient.getQueryData(queryKeys.job(jobId)) !== undefined) return true;
  return queryClient
    .getQueriesData({ queryKey: queryKeys.jobsRoot })
    .some(([, data]) => listedRows(data).some((row) => row.id === jobId));
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api tests/unit/realtime`
Expected: PASS (new and existing).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green (no UI change yet; the e2e suite is unchanged).

---
### Task 5: Inbox list rules (URL, pages, selection, fit line, list phase) and due entries

**Files:**
- Create: `web/src/domain/inbox.ts`, `web/src/domain/dueJobs.ts`
- Modify: `web/src/domain/nextStep.ts` (accept `interview_prep_present`), `web/src/domain/links.ts` (add `safeHttpUrl`)
- Test: `web/tests/unit/domain/inbox.test.ts`, `web/tests/unit/domain/dueJobs.test.ts`, add cases to `web/tests/unit/domain/nextStep.test.ts` and `web/tests/unit/domain/links.test.ts`

**Interfaces:**
- Consumes: `InboxTab`, `JobListItem`, `JobPage` (Task 4); `parseFitReasoning` (`domain/reasoning.ts`); `nextStep`, `isDue`, `NextStep` (`domain/nextStep.ts`); `isHttpUrl` (`domain/links.ts`).
- Produces:
  - `domain/inbox.ts`: `TAB_QUERY_KEY = "tab"`, `JOB_QUERY_KEY = "job"`, `VIEW_QUERY_KEY = "view"`, `SETUP_VIEW = "setup"`, `INBOX_PATH = "/inbox"`, `inboxTabFromParam(value: string | null): InboxTab`, `interface InboxLocation { tab: InboxTab; jobId?: string | null; setup?: boolean }`, `inboxHref(location): string`, `flattenPages(pages?: readonly JobPage[]): JobListItem[]`, `withoutItem(pages: readonly JobPage[], id: string): JobPage[]`, `selectedItem(items, jobId: string | null): JobListItem | null`, `nextSelection(items: readonly {id: string}[], removedId: string): string | null`, `FIT_LINE_MAX = 140`, `fitLine(reasoning?: string | null): string | null`, `type ListPhase = "loading" | "stalled" | "error" | "empty" | "ready"`, `interface ListStatus { hasData; isError; failureCount; itemCount }`, `listPhase(status): ListPhase`.
  - `domain/dueJobs.ts`: `MAX_DUE_ENTRIES = 3`, `interface DueEntry { item: JobListItem; step: NextStep }`, `dueEntries(items, now: Date, timeZone?: string): DueEntry[]`.
  - `NextStepInput.interview_prep_present?: boolean | null` (a prepared interview counts like `interview_prep_material`).
  - `safeHttpUrl(url?: string | null): string | null`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FIT_LINE_MAX,
  fitLine,
  flattenPages,
  inboxHref,
  inboxTabFromParam,
  listPhase,
  nextSelection,
  selectedItem,
  withoutItem,
} from "@/domain/inbox";
import { buildListItem, pageOf } from "../support/listItemFactory";

const a = buildListItem({ id: "a" });
const b = buildListItem({ id: "b" });
const c = buildListItem({ id: "c" });

describe("inbox URL", () => {
  it("reads the German tab values and falls back to Neu", () => {
    expect(["unter", "aus", null, "x"].map(inboxTabFromParam)).toEqual([
      "below",
      "dismissed",
      "new",
      "new",
    ]);
  });

  it("writes only what differs from the default", () => {
    expect(inboxHref({ tab: "new" })).toBe("/inbox");
    expect(inboxHref({ tab: "below", jobId: "job 1" })).toBe("/inbox?tab=unter&job=job+1");
    expect(inboxHref({ tab: "new", setup: true })).toBe("/inbox?view=setup");
  });
});

describe("pages", () => {
  it("flattens pages and drops a row that offset paging repeated", () => {
    const rows = flattenPages([pageOf([a, b], 3), pageOf([b, c], 3)]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("is empty without data", () => {
    expect(flattenPages(undefined)).toEqual([]);
  });

  it("removes a row and lowers the total of every page", () => {
    expect(withoutItem([pageOf([a, b], 3), pageOf([c], 3)], "b")).toEqual([
      pageOf([a], 2),
      pageOf([c], 2),
    ]);
  });

  it("leaves the pages alone when the row is not there", () => {
    expect(withoutItem([pageOf([a], 1)], "x")).toEqual([pageOf([a], 1)]);
  });
});

describe("selection", () => {
  it("selects the job from the URL", () => {
    expect(selectedItem([a, b], "b")).toBe(b);
  });

  it("falls back to the first row for an unknown id", () => {
    expect(selectedItem([a, b], "gone")).toBe(a);
  });

  it("is null for an empty list", () => {
    expect(selectedItem([], null)).toBeNull();
  });

  it("hands the selection to the next row, else to the previous one", () => {
    expect(nextSelection([a, b, c], "b")).toBe("c");
    expect(nextSelection([a, b, c], "c")).toBe("b");
    expect(nextSelection([a], "a")).toBeNull();
    expect(nextSelection([a], "x")).toBeNull();
  });
});

describe("fitLine", () => {
  it("takes the first sentence of the summary without markdown", () => {
    const reasoning =
      "## Zusammenfassung\nDu passt gut: **Kotlin** ist dein Alltag. Das Team ist klein.\n\n## Stärken & Übereinstimmung\n- Kotlin";
    expect(fitLine(reasoning)).toBe("Du passt gut: Kotlin ist dein Alltag.");
  });

  it("falls back to the first strength", () => {
    expect(fitLine("## Stärken & Übereinstimmung\n- Kafka im Betrieb\n## Lücken\n- Go")).toBe(
      "Kafka im Betrieb",
    );
  });

  it("uses the first text line of markdown with unknown headings", () => {
    expect(fitLine("# Analyse\nSolide Passung für Backend")).toBe("Solide Passung für Backend");
  });

  it("shortens long text", () => {
    const line = fitLine("x".repeat(400));
    expect(line).toHaveLength(FIT_LINE_MAX);
    expect(line?.endsWith("…")).toBe(true);
  });

  it("is null without reasoning", () => {
    expect(fitLine(null)).toBeNull();
    expect(fitLine("   ")).toBeNull();
  });
});

describe("listPhase", () => {
  const status = { hasData: false, isError: false, failureCount: 0, itemCount: 0 };

  it("is loading, stalled while retrying, or error without data", () => {
    expect(listPhase(status)).toBe("loading");
    expect(listPhase({ ...status, failureCount: 1 })).toBe("stalled");
    expect(listPhase({ ...status, isError: true, failureCount: 3 })).toBe("error");
  });

  it("is empty or ready with data, also after a failed refetch", () => {
    expect(listPhase({ ...status, hasData: true })).toBe("empty");
    expect(listPhase({ ...status, hasData: true, isError: true, itemCount: 2 })).toBe("ready");
  });
});
```

`web/tests/unit/domain/dueJobs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dueEntries, MAX_DUE_ENTRIES } from "@/domain/dueJobs";
import { buildListItem } from "../support/listItemFactory";

const NOW = new Date("2026-10-08T10:00:00Z");
const BERLIN = "Europe/Berlin";
const OVERDUE = "2026-10-01T08:00:00Z";

const ids = (items: Parameters<typeof dueEntries>[0]) =>
  dueEntries(items, NOW, BERLIN).map((entry) => entry.item.id);

describe("dueEntries", () => {
  it("keeps applications whose next step is due, earliest first", () => {
    const items = [
      buildListItem({ id: "later", status: "APPLIED", next_follow_up_at: "2026-10-09T08:00:00Z" }),
      buildListItem({ id: "overdue", status: "APPLIED", next_follow_up_at: OVERDUE }),
      buildListItem({ id: "far", status: "APPLIED", next_follow_up_at: "2026-10-30T08:00:00Z" }),
      buildListItem({ id: "none", status: "APPLIED" }),
    ];
    expect(ids(items)).toEqual(["overdue", "later"]);
  });

  it("shows at most three", () => {
    const items = ["a", "b", "c", "d"].map((id) =>
      buildListItem({ id, status: "APPLIED", next_follow_up_at: OVERDUE }),
    );
    expect(ids(items)).toHaveLength(MAX_DUE_ENTRIES);
  });

  it("uses the interview date and knows a prepared interview from the list flag", () => {
    const item = buildListItem({
      status: "INTERVIEW",
      interview_at: "2026-10-09T08:00:00Z",
      interview_prep_present: true,
    });
    expect(dueEntries([item], NOW, BERLIN)[0]?.step.kind).toBe("interviewReady");
  });

  it("keeps an application due while its documents are regenerated", () => {
    const item = buildListItem({
      status: "GENERATING",
      pre_generation_status: "APPLIED",
      next_follow_up_at: OVERDUE,
    });
    expect(dueEntries([item], NOW, BERLIN)[0]?.step.kind).toBe("followUp");
  });
});
```

Append to `web/tests/unit/domain/nextStep.test.ts` (inside the file, after the "nextStep: Interview" block):

```ts
describe("nextStep: list rows", () => {
  it("knows a prepared interview from the list flag", () => {
    const row = { ...buildJob({ status: "INTERVIEW" }), interview_prep_present: true };
    expect(nextStep(row, NOW, BERLIN).kind).toBe("interviewReady");
  });
});
```

Append to `web/tests/unit/domain/links.test.ts` (and add `safeHttpUrl` to its import from `@/domain/links`):

```ts
describe("safeHttpUrl", () => {
  it("keeps a parseable http(s) link", () => {
    expect(safeHttpUrl("https://www.stepstone.de/a?b=1")).toBe("https://www.stepstone.de/a?b=1");
  });

  it("drops every other scheme and broken input", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://")).toBeNull();
    expect(safeHttpUrl("ftp://example.org")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/inbox.test.ts tests/unit/domain/dueJobs.test.ts tests/unit/domain/nextStep.test.ts tests/unit/domain/links.test.ts`
Expected: FAIL, unresolved `@/domain/inbox` and `@/domain/dueJobs`, missing export `safeHttpUrl`.

- [ ] **Step 3: Implement `safeHttpUrl` and the `nextStep` flag**

Append to `web/src/domain/links.ts`:

```ts
/** The URL itself when it is a parseable http(s) link, else null; every rendered href goes through this. */
export function safeHttpUrl(url?: string | null): string | null {
  return url && isHttpUrl(url) && URL.canParse(url) ? url : null;
}
```

In `web/src/domain/nextStep.ts`:

1. Add to `NextStepInput` after `interview_prep_material?: string | null;`:

```ts
  /** List rows carry only this flag instead of the prep text (GET /jobs). */
  interview_prep_present?: boolean | null;
```

2. In `interviewStep`, replace `if (job.interview_prep_material) {` with:

```ts
  if (job.interview_prep_material || job.interview_prep_present) {
```

- [ ] **Step 4: Write `domain/inbox.ts`**

```ts
import type { InboxTab, JobListItem, JobPage } from "@/api/jobList";
import { parseFitReasoning } from "./reasoning";

export const TAB_QUERY_KEY = "tab";
export const JOB_QUERY_KEY = "job";
export const VIEW_QUERY_KEY = "view";
export const SETUP_VIEW = "setup";
export const INBOX_PATH = "/inbox";
export const FIT_LINE_MAX = 140;

// Decision D1: German URL values like the job page (?tab=unterlagen); "Neu" is the default.
const TAB_PARAM: Readonly<Record<InboxTab, string | null>> = {
  new: null,
  below: "unter",
  dismissed: "aus",
};
const TABS = Object.keys(TAB_PARAM) as InboxTab[];
const MARKDOWN_NOISE = /[*_`#>]+/g;
const WHITESPACE = /\s+/g;
const FIRST_SENTENCE = /^(.+?[.!?])(?:\s|$)/;
const ELLIPSIS = "…";

export function inboxTabFromParam(value: string | null): InboxTab {
  return TABS.find((tab) => TAB_PARAM[tab] === value) ?? "new";
}

export interface InboxLocation {
  tab: InboxTab;
  jobId?: string | null;
  setup?: boolean;
}

export function inboxHref({ tab, jobId, setup }: InboxLocation): string {
  const params = new URLSearchParams();
  const tabParam = TAB_PARAM[tab];
  if (tabParam) params.set(TAB_QUERY_KEY, tabParam);
  if (jobId) params.set(JOB_QUERY_KEY, jobId);
  if (setup) params.set(VIEW_QUERY_KEY, SETUP_VIEW);
  const query = params.toString();
  return query ? `${INBOX_PATH}?${query}` : INBOX_PATH;
}

/** Rows of all loaded pages; offset paging can repeat a row after a removal, so ids stay unique. */
export function flattenPages(pages: readonly JobPage[] | undefined): JobListItem[] {
  const seen = new Set<string>();
  const rows: JobListItem[] = [];
  for (const row of (pages ?? []).flatMap((page) => page.items)) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

/** Optimistic removal: drops the row and lowers every page's total, so paging stays consistent. */
export function withoutItem(pages: readonly JobPage[], id: string): JobPage[] {
  const found = pages.some((page) => page.items.some((row) => row.id === id));
  if (!found) return [...pages];
  return pages.map((page) => ({
    items: page.items.filter((row) => row.id !== id),
    total: Math.max(0, page.total - 1),
  }));
}

/** The shown row: the one in the URL, else the first (a stale link must not leave the pane empty). */
export function selectedItem(rows: readonly JobListItem[], jobId: string | null): JobListItem | null {
  return rows.find((row) => row.id === jobId) ?? rows[0] ?? null;
}

/** After a row leaves the list its successor is shown, else its predecessor (prototype selectAfter). */
export function nextSelection(rows: readonly { id: string }[], removedId: string): string | null {
  const index = rows.findIndex((row) => row.id === removedId);
  if (index === -1) return null;
  return rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
}

/** One plain line for a row: the summary's first sentence, else the first strength. */
export function fitLine(reasoning?: string | null): string | null {
  const fit = parseFitReasoning(reasoning);
  const source = fit ? fit.summary || fit.strengths[0] || "" : firstTextLine(reasoning ?? "");
  const plain = source.replace(MARKDOWN_NOISE, "").replace(WHITESPACE, " ").trim();
  if (!plain) return null;
  const sentence = FIRST_SENTENCE.exec(plain)?.[1] ?? plain;
  if (sentence.length <= FIT_LINE_MAX) return sentence;
  return `${sentence.slice(0, FIT_LINE_MAX - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

function firstTextLine(text: string): string {
  const lines = text.split("\n").map((line) => line.trim());
  return lines.find((line) => line !== "" && !line.startsWith("#")) ?? "";
}

export type ListPhase = "loading" | "stalled" | "error" | "empty" | "ready";

export interface ListStatus {
  hasData: boolean;
  isError: boolean;
  failureCount: number;
  itemCount: number;
}

/** Decision D10: without data a failed request that is being retried is "stalled", not an error yet. */
export function listPhase(status: ListStatus): ListPhase {
  if (status.hasData) return status.itemCount === 0 ? "empty" : "ready";
  if (status.isError) return "error";
  return status.failureCount > 0 ? "stalled" : "loading";
}
```

Note on the shortened line: `"x".repeat(400)` has no sentence end, so the slice keeps 139 characters plus the ellipsis (140).

- [ ] **Step 5: Write `domain/dueJobs.ts`**

```ts
import type { JobListItem } from "@/api/jobList";
import { isDue, nextStep, type NextStep } from "./nextStep";

export const MAX_DUE_ENTRIES = 3;

export interface DueEntry {
  item: JobListItem;
  step: NextStep;
}

/** The inbox "Anstehend" card (spec 4.2): applications whose next step is due, earliest first. */
export function dueEntries(items: readonly JobListItem[], now: Date, timeZone?: string): DueEntry[] {
  return items
    .map((item) => ({ item, step: nextStep(item, now, timeZone) }))
    .filter((entry) => isDue(entry.step))
    .sort((first, second) => dueTime(first) - dueTime(second))
    .slice(0, MAX_DUE_ENTRIES);
}

function dueTime(entry: DueEntry): number {
  return entry.step.due?.getTime() ?? Number.POSITIVE_INFINITY;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: PASS (new and existing domain tests).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green.

---

### Task 6: Run line, schedule, threshold maths and the day-time format

**Files:**
- Create: `web/src/domain/runLine.ts`, `web/src/domain/threshold.ts`, `web/src/i18n/formatDayTime.ts`
- Modify: `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/domain/runLine.test.ts`, `web/tests/unit/domain/threshold.test.ts`, `web/tests/unit/i18n/formatDayTime.test.ts`

**Interfaces:**
- Consumes: `Platform` (Task 4); `parseApiDate`, `calendarDaysBetween` (`domain/calendar.ts`); `STRONG_SCORE_MIN`, `POSSIBLE_SCORE_MIN` (`domain/scoreBand.ts`); `formatDate` (`i18n/formatDate.ts`), `formatTime` (`i18n/formatTime.ts`), `Translate`, `Language`.
- Produces:
  - `domain/runLine.ts`: `RUN_ERROR_CODES`, `type RunErrorCode = "cancelled" | "unreachable" | "failed" | "unknown"`, `interface LastRun { source; finishedAt: Date; found; matched; below; error: RunErrorCode | null }`, `runErrorCode(raw?): RunErrorCode | null`, `latestRun(platforms): LastRun | null`, `nextRunAt(platforms, now: Date): Date | null`.
  - `domain/threshold.ts`: `THRESHOLD_MIN = 0`, `THRESHOLD_MAX = 100`, `THRESHOLD_STEP = 5`, `MAX_TICK_LEVEL = 4`, `type ThresholdBand = "all" | "weak" | "possible" | "strong"`, `clampThreshold(value)`, `thresholdBand(value)`, `interface Tick { score; level }`, `distributionTicks(counts): Tick[]`, `countBelow(counts, threshold)`, `countAll(counts)`.
  - `i18n/formatDayTime.ts`: `interface DayTimeClock { now: number; language: Language; timeZone?: string }`, `formatDayTime(date: Date, t: Translate, clock: DayTimeClock): string`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/runLine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Platform } from "@/api/platforms";
import { latestRun, nextRunAt, runErrorCode } from "@/domain/runLine";

function platform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: 1,
    name: "StepStone",
    url: "https://www.stepstone.de/jobs/kotlin",
    is_active: true,
    schedule_time: null,
    schedule_days: null,
    last_crawl_at: null,
    last_run: null,
    ...overrides,
  };
}

describe("latestRun", () => {
  it("picks the most recently finished run and derives the below count", () => {
    const run = latestRun([
      platform({ name: "XING", last_run: { finished_at: "2026-10-07T06:00:00Z", found: 3, new: 2, matched: 2 } }),
      platform({ last_run: { finished_at: "2026-10-08T06:00:00Z", found: 12, new: 5, matched: 3 } }),
    ]);
    expect(run).toMatchObject({ source: "StepStone", found: 12, matched: 3, below: 2, error: null });
  });

  it("ignores runs without an end", () => {
    expect(latestRun([platform({ last_run: { error: null } })])).toBeNull();
  });

  it("maps error codes and shows unknown text neutrally", () => {
    expect(runErrorCode("unreachable")).toBe("unreachable");
    expect(runErrorCode("Seite nicht erreichbar")).toBe("unknown");
    expect(runErrorCode(null)).toBeNull();
  });
});

describe("nextRunAt", () => {
  // Thursday 2026-10-08, 10:00 local time; the server counts Monday as 0, so Thursday is 3.
  const now = new Date(2026, 9, 8, 10, 0);

  it("finds today's later slot", () => {
    const schedule = platform({ schedule_time: "14:00", schedule_days: [3] });
    expect(nextRunAt([schedule], now)).toEqual(new Date(2026, 9, 8, 14, 0));
  });

  it("moves to the next scheduled weekday once today's slot has passed", () => {
    const schedule = platform({ schedule_time: "07:00", schedule_days: [0] });
    expect(nextRunAt([schedule], now)).toEqual(new Date(2026, 9, 12, 7, 0));
  });

  it("takes the earliest active, valid schedule", () => {
    const platforms = [
      platform({ schedule_time: "18:00", schedule_days: [3] }),
      platform({ schedule_time: "12:00", schedule_days: [3], is_active: false }),
      platform({ schedule_time: "11:00", schedule_days: [] }),
      platform({ schedule_time: "9:5", schedule_days: [3] }),
    ];
    expect(nextRunAt(platforms, now)).toEqual(new Date(2026, 9, 8, 18, 0));
  });

  it("is null without any schedule", () => {
    expect(nextRunAt([platform()], now)).toBeNull();
  });
});
```

`web/tests/unit/domain/threshold.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampThreshold,
  countAll,
  countBelow,
  distributionTicks,
  MAX_TICK_LEVEL,
  thresholdBand,
} from "@/domain/threshold";

const counts = Array.from({ length: 101 }, () => 0);
counts[40] = 1;
counts[84] = 9;

describe("threshold", () => {
  it("bands like the prototype", () => {
    expect([0, 5, 59, 60, 79, 80, 100].map(thresholdBand)).toEqual([
      "all",
      "weak",
      "weak",
      "possible",
      "possible",
      "strong",
      "strong",
    ]);
  });

  it("clamps and rounds input", () => {
    expect([-3, 42.6, 140, Number.NaN].map(clampThreshold)).toEqual([0, 43, 100, 0]);
  });

  it("draws one tick per score with jobs, capped in height", () => {
    expect(distributionTicks(counts)).toEqual([
      { score: 40, level: 1 },
      { score: 84, level: MAX_TICK_LEVEL },
    ]);
  });

  it("counts all jobs and those below a threshold", () => {
    expect(countAll(counts)).toBe(10);
    expect(countBelow(counts, 60)).toBe(1);
    expect(countBelow(counts, 0)).toBe(0);
  });
});
```

`web/tests/unit/i18n/formatDayTime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDayTime } from "@/i18n/formatDayTime";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
// 10:00 in Berlin on Thursday 2026-10-08.
const clock = { now: Date.parse("2026-10-08T08:00:00Z"), language: "de" as const, timeZone: "Europe/Berlin" };

describe("formatDayTime", () => {
  it.each([
    ["2026-10-08T12:00:00Z", "heute 14:00"],
    ["2026-10-09T05:00:00Z", "morgen 07:00"],
    ["2026-10-07T16:10:00Z", "gestern 18:10"],
    ["2026-10-12T05:00:00Z", "Montag 07:00"],
    ["2026-10-20T05:00:00Z", "20.10.2026, 07:00"],
  ])("%s reads %s", (iso, expected) => {
    expect(formatDayTime(new Date(iso), t, clock)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/runLine.test.ts tests/unit/domain/threshold.test.ts tests/unit/i18n/formatDayTime.test.ts`
Expected: FAIL, unresolved modules.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "day.today": "heute {time}",
  "day.tomorrow": "morgen {time}",
  "day.yesterday": "gestern {time}",
  "day.weekday": "{weekday} {time}",
  "day.date": "{date}, {time}",
```

`web/src/i18n/en.ts`:

```ts
  "day.today": "today {time}",
  "day.tomorrow": "tomorrow {time}",
  "day.yesterday": "yesterday {time}",
  "day.weekday": "{weekday} {time}",
  "day.date": "{date}, {time}",
```

- [ ] **Step 4: Write `domain/runLine.ts`**

```ts
import type { Platform } from "@/api/platforms";
import { parseApiDate } from "./calendar";

export const RUN_ERROR_CODES = ["cancelled", "unreachable", "failed"] as const;
export type RunErrorCode = (typeof RUN_ERROR_CODES)[number] | "unknown";

export interface LastRun {
  source: string;
  finishedAt: Date;
  found: number;
  matched: number;
  below: number;
  error: RunErrorCode | null;
}

const SCHEDULE_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAYS_AHEAD = 7;
const DAYS_PER_WEEK = 7;
// Date#getDay() starts on Sunday; the server's schedule_days start on Monday (0).
const MONDAY_SHIFT = 6;

/** last_run.error is a fixed server code; anything else (older free text) is shown neutrally. */
export function runErrorCode(raw?: string | null): RunErrorCode | null {
  if (!raw) return null;
  return (RUN_ERROR_CODES as readonly string[]).includes(raw) ? (raw as RunErrorCode) : "unknown";
}

/** The most recently finished crawl over all sources, for the inbox run line (D11). */
export function latestRun(platforms: readonly Platform[]): LastRun | null {
  return platforms
    .flatMap(toLastRun)
    .reduce<LastRun | null>((latest, run) => (latest && latest.finishedAt >= run.finishedAt ? latest : run), null);
}

function toLastRun(platform: Platform): LastRun[] {
  const run = platform.last_run;
  const finishedAt = run?.finished_at ? parseApiDate(run.finished_at) : null;
  if (!run || !finishedAt || Number.isNaN(finishedAt.getTime())) return [];
  const matched = run.matched ?? 0;
  // "new" counts every saved job, matched or hidden by the threshold.
  const below = Math.max(0, (run.new ?? 0) - matched);
  const error = runErrorCode(run.error);
  return [{ source: platform.name, finishedAt, found: run.found ?? 0, matched, below, error }];
}

/** Next scheduled crawl over all active sources, in the browser's zone (G12). */
export function nextRunAt(platforms: readonly Platform[], now: Date): Date | null {
  return platforms
    .flatMap((platform) => nextSlot(platform, now) ?? [])
    .reduce<Date | null>((first, slot) => (first && first <= slot ? first : slot), null);
}

function nextSlot(platform: Platform, now: Date): Date | null {
  const match = SCHEDULE_TIME.exec(platform.schedule_time ?? "");
  const days = platform.schedule_days ?? [];
  if (!platform.is_active || !match || days.length === 0) return null;
  for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
    const day = now.getDate() + offset;
    const slot = new Date(now.getFullYear(), now.getMonth(), day, Number(match[1]), Number(match[2]));
    if (slot > now && days.includes(serverWeekday(slot))) return slot;
  }
  return null;
}

function serverWeekday(date: Date): number {
  return (date.getDay() + MONDAY_SHIFT) % DAYS_PER_WEEK;
}
```

- [ ] **Step 5: Write `domain/threshold.ts`**

```ts
import { POSSIBLE_SCORE_MIN, STRONG_SCORE_MIN } from "./scoreBand";

export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 100;
export const THRESHOLD_STEP = 5;
/** Ticks grow with the number of jobs on one score, up to this many levels. */
export const MAX_TICK_LEVEL = 4;

export type ThresholdBand = "all" | "weak" | "possible" | "strong";

export interface Tick {
  score: number;
  level: number;
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return THRESHOLD_MIN;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(value)));
}

/** Prototype thresholdBand: which matches still reach "Neu" at this value. */
export function thresholdBand(value: number): ThresholdBand {
  if (value >= STRONG_SCORE_MIN) return "strong";
  if (value >= POSSIBLE_SCORE_MIN) return "possible";
  return value > THRESHOLD_MIN ? "weak" : "all";
}

/** The tick/barcode device of the usability review: one tick per score that has jobs. */
export function distributionTicks(counts: readonly number[]): Tick[] {
  return counts.flatMap((count, score) =>
    count > 0 ? [{ score, level: Math.min(count, MAX_TICK_LEVEL) }] : [],
  );
}

export function countAll(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

export function countBelow(counts: readonly number[], threshold: number): number {
  return countAll(counts.slice(0, clampThreshold(threshold)));
}
```

- [ ] **Step 6: Write `i18n/formatDayTime.ts`**

```ts
import { calendarDaysBetween } from "@/domain/calendar";
import { formatDate } from "./formatDate";
import { formatTime } from "./formatTime";
import type { Language } from "./languages";
import type { Translate } from "./translate";

export interface DayTimeClock {
  now: number;
  language: Language;
  timeZone?: string;
}

const DAYS_PER_WEEK = 7;

/** "heute 14:00", "morgen 07:00", "gestern 18:10", "Montag 07:00" (this week, ahead), else the date. */
export function formatDayTime(date: Date, t: Translate, clock: DayTimeClock): string {
  const days = calendarDaysBetween(new Date(clock.now), date, clock.timeZone);
  const time = formatTime(date.getTime(), clock.language, clock.timeZone);
  if (days === 0) return t("day.today", { time });
  if (days === 1) return t("day.tomorrow", { time });
  if (days === -1) return t("day.yesterday", { time });
  if (days > 1 && days < DAYS_PER_WEEK) return t("day.weekday", { weekday: weekdayOf(date, clock), time });
  return t("day.date", { date: formatDate(date.toISOString(), clock.language, clock.timeZone), time });
}

function weekdayOf(date: Date, clock: DayTimeClock): string {
  return new Intl.DateTimeFormat(clock.language, { weekday: "long", timeZone: clock.timeZone }).format(date);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/i18n`
Expected: PASS (including the i18n parity test).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green.

---

### Task 7: Import tracking in realtime and the import toast

**Files:**
- Create: `web/src/realtime/imports.ts`, `web/src/realtime/useImports.ts`, `web/src/features/shell/useImportToast.ts`
- Modify: `web/src/realtime/events.ts`, `web/src/realtime/applyEvent.ts`, `web/src/features/shell/RealtimeProvider.tsx`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/realtime/imports.test.ts`, `web/tests/unit/features/shell/importToast.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.imports`, `queryKeys.thresholdDistribution`, `queryKeys.setupStatus` (Task 4); `STALL_AFTER_MS` (`domain/pendingTasks.ts`); `RealtimeDeps`, `HANDLERS` (`realtime/applyEvent.ts`); `jobPath`; `roundScore`, `scoreBand`, `BAND_LABEL`; `useToast`.
- Produces:
  - `realtime/imports.ts`: `interface ImportEntry { startedAt; jobId: string | null; score: number | null; archived: boolean; skipped: boolean }`, `type ImportState = Readonly<Record<string, ImportEntry>>` (key: crawl id), `EMPTY_IMPORTS`, `type ImportOutcome = "imported" | "exists" | "failed"`, `interface ImportResult { outcome; jobId; score; archived }`, `trackImport(state, crawlId, now)`, `recordImportedJob(state, crawlId, job)`, `recordSkippedImport(state, crawlId, existingJobId)`, `finishImport(state, crawlId, failed): { state; result: ImportResult | null }`, `isImportStalled(entry, now): boolean`.
  - `realtime/useImports.ts`: `useImports(): ImportState` (cache entry kept forever, like the pending tasks), `markImportStarted(queryClient, crawlId, now)`.
  - `RealtimeDeps.onImportFinished?: (result: ImportResult) => void`.
  - Events: `new_job` carries optional `crawl_job_id` and `job.match_score`, `job.is_archived`; new event `job_skipped` (`job_id` = crawl id, optional `existing_job_id`).
  - `features/shell/useImportToast.ts`: `importMessage(result, t): string`, `useImportToast(): (result: ImportResult) => void`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/realtime/imports.test.ts`:

```ts
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { STALL_AFTER_MS } from "@/domain/pendingTasks";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import { EMPTY_IMPORTS, isImportStalled, trackImport, type ImportState } from "@/realtime/imports";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 8, 12, 0);
const CRAWL = "crawl-9";

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.imports, trackImport(EMPTY_IMPORTS, CRAWL, NOW));
  queryClient.setQueryData(queryKeys.setupStatus, { has_jobs: false });
  const onImportFinished = vi.fn();
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError: vi.fn(), onImportFinished };
  const send = (event: object) =>
    handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, deps);
  const imports = () => queryClient.getQueryData<ImportState>(queryKeys.imports) ?? {};
  const isInvalidated = (queryKey: QueryKey) =>
    queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
  return { send, onImportFinished, imports, isInvalidated };
}

const job = (overrides: object = {}) => ({ id: "job-30", match_score: 80, is_archived: false, ...overrides });

describe("import tracking", () => {
  it("reports the imported job with its score when the crawl ends", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "new_job", crawl_job_id: CRAWL, job: job() });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith({
      outcome: "imported",
      jobId: "job-30",
      score: 80,
      archived: false,
    });
    expect(imports()).toEqual({});
  });

  it("says when the import landed below the threshold", () => {
    const { send, onImportFinished } = setup();
    send({ type: "new_job", crawl_job_id: CRAWL, job: job({ match_score: 54, is_archived: true }) });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "imported", score: 54, archived: true }),
    );
  });

  it("names the existing job of a duplicate", () => {
    const { send, onImportFinished } = setup();
    send({ type: "job_skipped", job_id: CRAWL, existing_job_id: "job-1", jobs_skipped: 1 });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith({
      outcome: "exists",
      jobId: "job-1",
      score: null,
      archived: false,
    });
  });

  it("reports a failed crawl", () => {
    const { send, onImportFinished } = setup();
    send({ type: "crawl_job_failed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });

  it("ignores crawls this tab did not start", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "new_job", crawl_job_id: "other", job: job() });
    send({ type: "crawl_job_completed", job_id: "other" });
    expect(onImportFinished).not.toHaveBeenCalled();
    expect(imports()[CRAWL]?.jobId).toBeNull();
  });

  it("refreshes the threshold ticks and the setup status on a new job", () => {
    const { send, isInvalidated } = setup();
    send({ type: "new_job", job: { id: "job-31" } });
    expect(isInvalidated(queryKeys.setupStatus)).toBe(true);
  });

  it("turns stalled after the stall time", () => {
    const entry = trackImport(EMPTY_IMPORTS, CRAWL, NOW)[CRAWL]!;
    expect(isImportStalled(entry, NOW + STALL_AFTER_MS - 1)).toBe(false);
    expect(isImportStalled(entry, NOW + STALL_AFTER_MS)).toBe(true);
  });
});
```

`web/tests/unit/features/shell/importToast.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useImportToast } from "@/features/shell/useImportToast";
import type { ImportResult } from "@/realtime/imports";
import { renderWithProviders } from "../../support/render";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

beforeEach(() => navigation.push.mockReset());

function Harness({ result }: { result: ImportResult }) {
  const show = useImportToast();
  return (
    <button type="button" onClick={() => show(result)}>
      go
    </button>
  );
}

async function finish(result: ImportResult) {
  renderWithProviders(<Harness result={result} />);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
}

describe("useImportToast", () => {
  it("announces an imported job and opens it", async () => {
    await finish({ outcome: "imported", jobId: "job-30", score: 80, archived: false });
    expect(await screen.findByText("Importiert und bewertet: 80 · Stark.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansehen" }));
    expect(navigation.push).toHaveBeenCalledWith("/jobs/job-30");
  });

  it("says when the job landed below the threshold", async () => {
    await finish({ outcome: "imported", jobId: "job-30", score: 54, archived: true });
    expect(
      await screen.findByText("Importiert: 54 · Schwach, unter deinem Schwellwert. Du findest die Stelle unter „Unter Schwellwert“."),
    ).toBeInTheDocument();
  });

  it("links a duplicate to the job that is already there", async () => {
    await finish({ outcome: "exists", jobId: "job-1", score: null, archived: false });
    expect(await screen.findByText("Diese Stelle ist schon da.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansehen" }));
    expect(navigation.push).toHaveBeenCalledWith("/jobs/job-1");
  });

  it("reports a failure as an error without an action", async () => {
    await finish({ outcome: "failed", jobId: null, score: null, archived: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Die Anzeige konnte nicht gelesen werden.");
    expect(screen.queryByRole("button", { name: "Ansehen" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/realtime/imports.test.ts tests/unit/features/shell/importToast.test.tsx`
Expected: FAIL, unresolved `@/realtime/imports` and `@/features/shell/useImportToast`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "import.done": "Importiert und bewertet: {score} · {band}.",
  "import.doneBelow":
    "Importiert: {score} · {band}, unter deinem Schwellwert. Du findest die Stelle unter „Unter Schwellwert“.",
  "import.doneUnscored": "Importiert. Die Bewertung folgt.",
  "import.exists": "Diese Stelle ist schon da.",
  "import.failed": "Die Anzeige konnte nicht gelesen werden.",
  "import.view": "Ansehen",
```

`web/src/i18n/en.ts`:

```ts
  "import.done": "Imported and scored: {score} · {band}.",
  "import.doneBelow":
    "Imported: {score} · {band}, below your threshold. You find the job under “Below threshold”.",
  "import.doneUnscored": "Imported. The score follows.",
  "import.exists": "This job is already here.",
  "import.failed": "The posting could not be read.",
  "import.view": "View",
```

- [ ] **Step 4: Write `realtime/imports.ts` and `realtime/useImports.ts`**

`web/src/realtime/imports.ts`:

```ts
import { STALL_AFTER_MS } from "@/domain/pendingTasks";

export interface ImportEntry {
  startedAt: number;
  jobId: string | null;
  score: number | null;
  archived: boolean;
  skipped: boolean;
}

/** Imports this tab started, keyed by the crawl id their realtime events carry (decision D7). */
export type ImportState = Readonly<Record<string, ImportEntry>>;
export const EMPTY_IMPORTS: ImportState = {};

export type ImportOutcome = "imported" | "exists" | "failed";

export interface ImportResult {
  outcome: ImportOutcome;
  jobId: string | null;
  score: number | null;
  archived: boolean;
}

export interface ImportedJob {
  id: string;
  match_score?: number | null;
  is_archived?: boolean | null;
}

export function trackImport(state: ImportState, crawlId: string, now: number): ImportState {
  const entry: ImportEntry = { startedAt: now, jobId: null, score: null, archived: false, skipped: false };
  return { ...state, [crawlId]: entry };
}

export function recordImportedJob(state: ImportState, crawlId: string, job: ImportedJob): ImportState {
  const entry = state[crawlId];
  if (!entry) return state;
  const imported = { jobId: job.id, score: job.match_score ?? null, archived: job.is_archived ?? false };
  return { ...state, [crawlId]: { ...entry, ...imported } };
}

export function recordSkippedImport(
  state: ImportState,
  crawlId: string,
  existingJobId: string | null,
): ImportState {
  const entry = state[crawlId];
  if (!entry) return state;
  return { ...state, [crawlId]: { ...entry, skipped: true, jobId: existingJobId } };
}

/** Ends a tracked import; crawls this tab did not start give no result. */
export function finishImport(state: ImportState, crawlId: string, failed: boolean) {
  const entry = state[crawlId];
  if (!entry) return { state, result: null };
  const rest = { ...state };
  delete rest[crawlId];
  return { state: rest as ImportState, result: importResult(entry, failed) };
}

function importResult(entry: ImportEntry, failed: boolean): ImportResult {
  const outcome: ImportOutcome = failed ? "failed" : entry.skipped ? "exists" : "imported";
  return { outcome, jobId: entry.jobId, score: entry.score, archived: entry.archived };
}

/** No end event yet after the stall time: the drawer offers a new attempt. */
export function isImportStalled(entry: ImportEntry, now: number): boolean {
  return now - entry.startedAt >= STALL_AFTER_MS;
}
```

`web/src/realtime/useImports.ts`:

```ts
"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_IMPORTS, trackImport, type ImportState } from "./imports";

function readImports(queryClient: QueryClient): ImportState {
  return queryClient.getQueryData<ImportState>(queryKeys.imports) ?? EMPTY_IMPORTS;
}

/** Client-only state in the query cache, so applyEvent can finish imports in one place (spec 6). */
export function useImports(): ImportState {
  const queryClient = useQueryClient();
  // The "fetch" re-reads the cache; gcTime keeps a running import after the drawer closed.
  const query = useQuery({
    queryKey: queryKeys.imports,
    queryFn: () => readImports(queryClient),
    initialData: EMPTY_IMPORTS,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return query.data;
}

export function markImportStarted(queryClient: QueryClient, crawlId: string, now: number): void {
  queryClient.setQueryData(queryKeys.imports, trackImport(readImports(queryClient), crawlId, now));
}
```

- [ ] **Step 5: Extend the event schema**

In `web/src/realtime/events.ts`:

1. Below `const jobRef = ...` add:

```ts
// new_job also carries the score and archive flag; an import toast reports both (decision D7).
const newJobRef = z.object({
  id: z.string(),
  match_score: z.number().nullish(),
  is_archived: z.boolean().nullish(),
});
```

2. Replace the `new_job` member of the union with:

```ts
  z.object({
    type: z.literal("new_job"),
    ...userScoped,
    crawl_job_id: z.string().nullish(),
    job: newJobRef,
  }),
```

3. Add after the `crawl_job_cancelled` member:

```ts
  // A posting that already exists; existing_job_id names it when it is the user's own (server Task 3).
  z.object({ type: z.literal("job_skipped"), ...crawlRun, existing_job_id: z.string().nullish() }),
```

- [ ] **Step 6: Handle the events in `applyEvent.ts`**

In `web/src/realtime/applyEvent.ts`:

1. Add imports:

```ts
import {
  EMPTY_IMPORTS,
  finishImport,
  recordImportedJob,
  recordSkippedImport,
  type ImportResult,
  type ImportState,
} from "./imports";
```

2. Extend `RealtimeDeps`:

```ts
export interface RealtimeDeps {
  queryClient: QueryClient;
  now: () => number;
  onGlobalError: () => void;
  /** Once per import this tab started, when its crawl ended (the toast lives in RealtimeProvider). */
  onImportFinished?: (result: ImportResult) => void;
}
```

3. Add helpers below `patchPending`:

```ts
function patchImports(deps: RealtimeDeps, update: (state: ImportState) => ImportState): void {
  deps.queryClient.setQueryData<ImportState>(queryKeys.imports, (state) =>
    update(state ?? EMPTY_IMPORTS),
  );
}

function finishImportOf(event: FinishEvent, deps: RealtimeDeps): void {
  const current = deps.queryClient.getQueryData<ImportState>(queryKeys.imports) ?? EMPTY_IMPORTS;
  const failed = event.type !== "crawl_job_completed";
  const { state, result } = finishImport(current, event.job_id, failed);
  if (!result) return;
  deps.queryClient.setQueryData(queryKeys.imports, state);
  deps.onImportFinished?.(result);
}

function newJob(event: EventOf<"new_job">, deps: RealtimeDeps): void {
  const keys = [queryKeys.jobsRoot, queryKeys.jobCounts, queryKeys.thresholdDistribution, queryKeys.setupStatus];
  invalidate(deps, ...keys);
  const crawlId = event.crawl_job_id;
  if (crawlId) patchImports(deps, (state) => recordImportedJob(state, crawlId, event.job));
}

function jobSkipped(event: EventOf<"job_skipped">, deps: RealtimeDeps): void {
  patchImports(deps, (state) => recordSkippedImport(state, event.job_id, event.existing_job_id ?? null));
}
```

4. Extend `finishCrawl` with one line at its end:

```ts
  finishImportOf(event, deps);
```

5. In `HANDLERS`, replace the `new_job` entry with `new_job: newJob,` and add `job_skipped: jobSkipped,` (the mapped type requires it).

- [ ] **Step 7: Write the toast hook and wire it into the provider**

`web/src/features/shell/useImportToast.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { jobPath } from "@/api/jobs";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import type { ImportResult } from "@/realtime/imports";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { useToast } from "@/ui/ToastProvider";

export function importMessage(result: ImportResult, t: Translate): string {
  if (result.outcome === "failed") return t("import.failed");
  if (result.outcome === "exists") return t("import.exists");
  if (result.score === null) return t("import.doneUnscored");
  const score = roundScore(result.score);
  const band = t(BAND_LABEL[scoreBand(score)]);
  return t(result.archived ? "import.doneBelow" : "import.done", { score, band });
}

/** The toast for a finished import: what happened and, when there is a job, a way to it. */
export function useImportToast(): (result: ImportResult) => void {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  return (result) => {
    const { jobId } = result;
    const failed = result.outcome === "failed";
    const action =
      jobId && !failed ? { label: t("import.view"), onAction: () => router.push(jobPath(jobId)) } : undefined;
    toast.show({ tone: failed ? "error" : "success", message: importMessage(result, t), action });
  };
}
```

Replace `web/src/features/shell/RealtimeProvider.tsx` with:

```tsx
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import type { ImportResult } from "@/realtime/imports";
import { openRealtime } from "@/realtime/openRealtime";
import { useToast } from "@/ui/ToastProvider";
import { useImportToast } from "./useImportToast";

/** One WebSocket per tab for the signed-in user (spec 2.3). */
export function RealtimeProvider({ userId, children }: { userId: number; children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const showImport = useImportToast();
  const reportBackgroundError = useEffectEvent(() =>
    toast.show({ tone: "error", message: t("toast.backgroundError") }),
  );
  const reportImport = useEffectEvent((result: ImportResult) => showImport(result));
  useEffect(() => {
    const onGlobalError = () => reportBackgroundError();
    const onImportFinished = (result: ImportResult) => reportImport(result);
    const connection = openRealtime(userId, { queryClient, now: Date.now, onGlobalError, onImportFinished });
    return () => connection.close();
  }, [queryClient, userId]);
  return children;
}
```

(`openRealtime(userId, deps: RealtimeDeps)` passes `deps` unchanged to `handleRealtimeMessage`, so the optional `onImportFinished` reaches `applyEvent`.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/realtime tests/unit/features`
Expected: PASS (new tests and all existing realtime and shell tests; `shellBehaviour.test.tsx` already mocks `useRouter`).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green.

---
### Task 8: Inbox frame: route, URL state, masthead and run line, tabs with counts, list states, rows

**Files:**
- Modify: `web/app/(app)/inbox/page.tsx`, `web/app/globals.css`, `web/src/ui/Tabs.tsx`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/e2e/support/fixtures.ts`, `web/tests/e2e/support/mockApi.ts` (only if Step 1 finds it lacking)
- Create: `web/src/features/inbox/InboxPage.tsx`, `InboxListColumn.tsx`, `useInboxUrl.ts`, `useInboxLists.ts`, `InboxHeader.tsx`, `RunLine.tsx`, `InboxTabs.tsx`, `InboxList.tsx`, `InboxRow.tsx`, `inbox.css`; `web/tests/unit/support/inboxRoutes.ts`; `web/tests/e2e/support/inboxFixtures.ts`
- Test: `web/tests/unit/ui/tabsSuffix.test.tsx`, `web/tests/unit/features/inbox/inboxPage.test.tsx`, `web/tests/e2e/inbox.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`inboxListQueryOptions`, `inboxTotalQueryOptions`, `INBOX_TABS`, `JobListItem`, `fetchPlatforms`, `queryKeys.platforms`), Task 5 (`inboxHref`, `inboxTabFromParam`, `flattenPages`, `fitLine`, `listPhase`, `TAB_QUERY_KEY`, `JOB_QUERY_KEY`, `VIEW_QUERY_KEY`, `SETUP_VIEW`), Task 6 (`latestRun`, `nextRunAt`, `LastRun`, `RunErrorCode`, `formatDayTime`, `DayTimeClock`); phase 1-2: `Masthead`, `Tabs`, `TabPanel`, `EmptyState`, `CountBadge`, `ScoreMeter`, `Monogram`, `Button`, `Icon`, `Notice`, `describeError`, `navNumber`, `statusLabel` (`features/job/labels.ts`), `hostOf`, `parseApiDate`, `formatRelativeDays`, `useNow`, `jobPath`.
- Produces:
  - `TabItem.suffix?: ReactNode` (rendered after the label, separated by a space).
  - `useInboxUrl(): InboxUrl` with `{ tab: InboxTab; jobId: string | null; setup: boolean; setTab(tab); select(jobId | null) }`.
  - `useInboxList(tab)` (infinite query), `type InboxListQuery`, `useInboxCounts(): Readonly<Record<InboxTab, number | null>>`.
  - `InboxRow({ item, selected?, onOpen?, actions? })` (`<li class="jrow">` with a stretched title link to `/jobs/<id>`).
  - `InboxList({ tab, renderRow, onShowBelow })`, `InboxListColumn({ url, renderRow })`, `InboxHeader({ onShowBelow })`, `RunLine({ onShowBelow })`, `InboxTabs({ tab, onSelect })`, `INBOX_TABS_ID = "inbox"`.
  - Unit support: `interface InboxServer { new; below; dismissed; due: JobListItem[] }`, `inboxJobs(server)` (a `GET /jobs` responder that filters by query), `inboxStubs(server, extra?)`, `SETUP_DONE`, `HTTP_OK`.
  - E2E support: `NOW_ISO`, `listItem(id, overrides?)`, `NEW_ITEMS`, `BELOW_ITEMS`, `DISMISSED_ITEMS`, `page(items, total?)`, `PLATFORMS_WITH_RUNS`, `DISTRIBUTION`, `interface InboxData`, `inboxRoutes(data?, extra?): MutableRoutes`; `AUTHENTICATED_ROUTES` gains `GET /jobs` (empty page) and `GET /setup-status` (`SETUP_DONE`, everything configured), so other specs that visit `/inbox` keep working; exported `SETUP_DONE`.

- [ ] **Step 1: Make sure the e2e mock can key on query strings and records bodies**

Read `web/tests/e2e/support/mockApi.ts`. Phase 2 (its Task 22) should have added (a) route keys with a query string that win over the plain key and (b) `ApiLog.calls: { key: string; body: unknown }[]`. If either is missing, add exactly that, keeping everything else (`closedSockets`, raw `contentType` bodies):

```ts
export interface ApiCall {
  key: string;
  body: unknown;
}
// in ApiLog:
  /** Every mocked call with its JSON body (null without one), for request assertions. */
  calls: ApiCall[];

function routeKeys(request: Request): { exact: string; plain: string } {
  const { pathname, search } = new URL(request.url());
  const path = pathname.slice(pathname.indexOf(MOCK_API_PREFIX) + MOCK_API_PREFIX.length);
  const plain = `${request.method()} ${path}`;
  return { exact: `${plain}${search}`, plain };
}

function jsonBody(request: Request): unknown {
  try {
    return request.postDataJSON() as unknown;
  } catch {
    // Multipart uploads and empty bodies are not JSON.
    return null;
  }
}
```

and in `fulfil`, replace the key computation with:

```ts
  const keys = routeKeys(route.request());
  const key = keys.exact in routes ? keys.exact : keys.plain;
  log.requests.push(key);
  log.calls.push({ key, body: jsonBody(route.request()) });
```

(initialise `calls: []` in `mockApi`). Update the `MockRoutes` comment to "Keys are "METHOD /path" or, more specific, "METHOD /path?query"". Run `"$QA"/webrun.sh pnpm test:e2e` once; expected: all existing specs still pass.

- [ ] **Step 2: Write the test support and the failing tests**

`web/tests/unit/support/inboxRoutes.ts`:

```ts
import type { JobListItem } from "@/api/jobList";
import type { SetupStatus } from "@/api/setup";
import { jsonResponse, type RecordedCall } from "./fakeFetch";
import type { RouteTable } from "./stubRoutes";

export const HTTP_OK = 200;
export const SETUP_DONE: SetupStatus = {
  has_source: true,
  ai_configured: true,
  profile_complete: true,
  has_jobs: true,
};

/** Mutable server-side lists; a test changes them to simulate what a POST did on the server. */
export interface InboxServer {
  new: JobListItem[];
  below: JobListItem[];
  dismissed: JobListItem[];
  due: JobListItem[];
}

function listOf(params: URLSearchParams): keyof InboxServer {
  if (params.get("statuses")?.includes("APPLIED")) return "due";
  const reason = params.get("archive_reason");
  if (reason === "THRESHOLD") return "below";
  return reason === "USER" ? "dismissed" : "new";
}

/** GET /jobs answered from the lists by the query's filter, honouring limit and offset. */
export function inboxJobs(server: InboxServer) {
  return (call: RecordedCall) => {
    const params = new URL(call.url).searchParams;
    const rows = server[listOf(params)];
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? rows.length);
    return jsonResponse(HTTP_OK, { items: rows.slice(offset, offset + limit), total: rows.length });
  };
}

const PLATFORMS = [{ id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs/kotlin" }];

/** Everything the inbox loads; `extra` adds or overrides routes. */
export function inboxStubs(server: InboxServer, extra: RouteTable = {}): RouteTable {
  return {
    "GET /jobs": inboxJobs(server),
    "GET /platforms": PLATFORMS,
    "GET /settings": { language: "de", match_threshold: 60 },
    "GET /setup-status": SETUP_DONE,
    "GET /matching-preference/distribution": { counts: Array.from({ length: 101 }, () => 0) },
    ...extra,
  };
}
```

`web/tests/unit/ui/tabsSuffix.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/ui/Tabs";

describe("Tabs suffix", () => {
  it("shows the suffix after the label inside the tab", () => {
    render(
      <Tabs
        items={[{ key: "a", label: "Neu", suffix: <span>3</span> }]}
        selected="a"
        onSelect={() => undefined}
        label="Filter"
        idPrefix="t"
      />,
    );
    expect(screen.getByRole("tab", { name: "Neu 3" })).toBeInTheDocument();
  });
});
```

`web/tests/unit/features/inbox/inboxPage.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { inboxJobs, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const REASONING = "## Zusammenfassung\nKotlin und Kafka sind dein Alltag.";

function server(overrides: Partial<InboxServer> = {}): InboxServer {
  return {
    new: [
      buildListItem({ id: "job-1", title: "Senior Kotlin Engineer", company: "N26", match_score: 86, reasoning: REASONING }),
      buildListItem({ id: "job-2", title: "Backend Engineer (Java)", company: "Personio", match_score: 72 }),
    ],
    below: [
      buildListItem({ id: "job-20", title: "Fullstack-Entwickler PHP", is_archived: true, archive_reason: "THRESHOLD", match_score: 54 }),
    ],
    dismissed: [],
    due: [],
    ...overrides,
  };
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.params = new URLSearchParams();
});

describe("InboxPage", () => {
  it("shows the masthead with the new matches and the strongest one", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(await screen.findByText("2 neue Treffer.")).toBeInTheDocument();
    expect(screen.getByText(/Am stärksten: N26 mit 86\./)).toBeInTheDocument();
  });

  it("lists the matches as links to the job page with fit line and score", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    const link = await screen.findByRole("link", { name: "Senior Kotlin Engineer" });
    expect(link).toHaveAttribute("href", "/jobs/job-1");
    const row = link.closest("li") as HTMLElement;
    expect(within(row).getByText("Kotlin und Kafka sind dein Alltag.")).toBeInTheDocument();
    expect(within(row).getByText("86")).toBeInTheDocument();
    expect(within(row).getByText(/N26 · .* · StepStone/)).toBeInTheDocument();
  });

  it("counts every tab", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("tab", { name: "Unter Schwellwert 1" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Von dir aussortiert 0" })).toBeInTheDocument();
  });

  it("keeps the chosen tab in the URL", async () => {
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Unter Schwellwert/ }));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?tab=unter", { scroll: false });
  });

  it("shows the tab from the URL", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("link", { name: "Fullstack-Entwickler PHP" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Unter Schwellwert/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says when everything is seen", async () => {
    stubRoutes(inboxStubs(server({ new: [] })));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Alles gesichtet." })).toBeInTheDocument();
    expect(screen.getByText("Alles gesichtet. Neue Treffer erscheinen nach dem nächsten Lauf.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quellen ansehen" })).toHaveAttribute("href", "/sources");
  });

  it("shows an error with retry and loads again", async () => {
    const data = server();
    let failing = true;
    const jobs = (call: RecordedCall) =>
      failing ? jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }) : inboxJobs(data)(call);
    stubRoutes(inboxStubs(data, { "GET /jobs": jobs }));
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByText("Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal."),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
  });

  it("loads the next page on request", async () => {
    const many = Array.from({ length: 51 }, (_, index) =>
      buildListItem({ id: `job-${index}`, title: `Stelle ${index}` }),
    );
    const calls = stubRoutes(inboxStubs(server({ new: many })));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Weitere laden" }));
    expect(await screen.findByRole("link", { name: "Stelle 50" })).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("limit=50&offset=50"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui/tabsSuffix.test.tsx tests/unit/features/inbox/inboxPage.test.tsx`
Expected: FAIL (no tab named "Neu 3"; unresolved `@/features/inbox/InboxPage`).

- [ ] **Step 4: Add the tab suffix**

In `web/src/ui/Tabs.tsx`, extend `TabItem`:

```ts
export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Shown after the label, e.g. a count; part of the tab's accessible name. */
  suffix?: ReactNode;
}
```

and in `TabButton` replace `{item.label}` with:

```tsx
      {item.label}
      {item.suffix ? (
        <>
          {" "}
          {item.suffix}
        </>
      ) : null}
```

- [ ] **Step 5: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "inbox.deck.empty": "Alles gesichtet. Neue Treffer erscheinen nach dem nächsten Lauf.",
  "inbox.deck.one": "1 neuer Treffer.",
  "inbox.deck.many": "{count} neue Treffer.",
  "inbox.deck.top": "Am stärksten: {company} mit {score}.",
  "inbox.tabsLabel": "Treffer filtern",
  "inbox.tab.new": "Neu",
  "inbox.tab.below": "Unter Schwellwert",
  "inbox.tab.dismissed": "Von dir aussortiert",
  "inbox.more": "Weitere laden",
  "inbox.stalled": "Die Verbindung hakt. Wird erneut versucht …",
  "inbox.empty.newTitle": "Alles gesichtet.",
  "inbox.empty.newText": "Neue passende Stellen erscheinen hier nach dem nächsten Lauf.",
  "inbox.empty.toSources": "Quellen ansehen",
  "inbox.empty.toBelow": "Unter Schwellwert ansehen",
  "inbox.empty.belowTitle": "Keine Stellen unter dem Schwellwert",
  "inbox.empty.belowText": "Alle gefundenen Stellen lagen über dem Schwellwert.",
  "inbox.empty.dismissedTitle": "Nichts aussortiert",
  "inbox.empty.dismissedText":
    "Stellen, die du aussortierst, landen hier und lassen sich mit einem Klick wiederherstellen.",
  "runline.never": "Noch kein Lauf.",
  "runline.last": "Letzter Lauf: {source}, {when}.",
  "runline.counts": "{found} gefunden, {matched} passend, {below} unter Schwellwert.",
  "runline.showBelow": "Ansehen",
  "runline.failed": "Letzter Lauf: {source}, {when}, fehlgeschlagen ({reason}).",
  "runline.error.cancelled": "abgebrochen",
  "runline.error.unreachable": "Seite nicht erreichbar",
  "runline.error.failed": "Fehler beim Durchsuchen",
  "runline.error.unknown": "Grund unbekannt",
  "runline.toSources": "Quellen ansehen",
  "runline.next": "Nächster Lauf {when}.",
```

`web/src/i18n/en.ts`:

```ts
  "inbox.deck.empty": "All caught up. New matches appear after the next run.",
  "inbox.deck.one": "1 new match.",
  "inbox.deck.many": "{count} new matches.",
  "inbox.deck.top": "Strongest: {company} at {score}.",
  "inbox.tabsLabel": "Filter matches",
  "inbox.tab.new": "New",
  "inbox.tab.below": "Below threshold",
  "inbox.tab.dismissed": "Sorted out by you",
  "inbox.more": "Load more",
  "inbox.stalled": "The connection is stuttering. Retrying …",
  "inbox.empty.newTitle": "All caught up.",
  "inbox.empty.newText": "New matching jobs appear here after the next run.",
  "inbox.empty.toSources": "View sources",
  "inbox.empty.toBelow": "View below threshold",
  "inbox.empty.belowTitle": "No jobs below the threshold",
  "inbox.empty.belowText": "Every job found scored above the threshold.",
  "inbox.empty.dismissedTitle": "Nothing sorted out",
  "inbox.empty.dismissedText": "Jobs you sort out land here and come back with one click.",
  "runline.never": "No run yet.",
  "runline.last": "Last run: {source}, {when}.",
  "runline.counts": "{found} found, {matched} matching, {below} below threshold.",
  "runline.showBelow": "View",
  "runline.failed": "Last run: {source}, {when}, failed ({reason}).",
  "runline.error.cancelled": "cancelled",
  "runline.error.unreachable": "site unreachable",
  "runline.error.failed": "error while searching",
  "runline.error.unknown": "unknown reason",
  "runline.toSources": "View sources",
  "runline.next": "Next run {when}.",
```

- [ ] **Step 6: Write the URL hook, list hooks and the route**

`web/src/features/inbox/useInboxUrl.ts`:

```ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { InboxTab } from "@/api/jobList";
import {
  inboxHref,
  inboxTabFromParam,
  JOB_QUERY_KEY,
  SETUP_VIEW,
  TAB_QUERY_KEY,
  VIEW_QUERY_KEY,
} from "@/domain/inbox";

export interface InboxUrl {
  tab: InboxTab;
  jobId: string | null;
  setup: boolean;
  setTab: (tab: InboxTab) => void;
  select: (jobId: string | null) => void;
}

/** Decision D1: tab, selected job and the setup view live in the query string (spec 2.3). */
export function useInboxUrl(): InboxUrl {
  const params = useSearchParams();
  const router = useRouter();
  const tab = inboxTabFromParam(params.get(TAB_QUERY_KEY));
  // replace, not push: Back leaves the inbox instead of walking through every selection.
  const go = (href: string) => router.replace(href, { scroll: false });
  return {
    tab,
    jobId: params.get(JOB_QUERY_KEY),
    setup: params.get(VIEW_QUERY_KEY) === SETUP_VIEW,
    setTab: (next) => go(inboxHref({ tab: next })),
    select: (jobId) => go(inboxHref({ tab, jobId })),
  };
}
```

`web/src/features/inbox/useInboxLists.ts`:

```ts
"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { inboxListQueryOptions, inboxTotalQueryOptions, type InboxTab } from "@/api/jobList";

export function useInboxList(tab: InboxTab) {
  return useInfiniteQuery(inboxListQueryOptions(tab));
}

export type InboxListQuery = ReturnType<typeof useInboxList>;

/** Tab counters. "Neu" reads its own list (always loaded for the masthead); the others one row each. */
export function useInboxCounts(): Readonly<Record<InboxTab, number | null>> {
  const fresh = useInboxList("new");
  const below = useQuery(inboxTotalQueryOptions("below"));
  const dismissed = useQuery(inboxTotalQueryOptions("dismissed"));
  return {
    new: fresh.data?.pages[0]?.total ?? null,
    below: below.data ?? null,
    dismissed: dismissed.data ?? null,
  };
}
```

Replace `web/app/(app)/inbox/page.tsx` with:

```tsx
import { Suspense } from "react";
import { InboxPage } from "@/features/inbox/InboxPage";

export default function InboxRoute() {
  // The inbox reads tab and selection from the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}
```

- [ ] **Step 7: Write the masthead and the run line**

`web/src/features/inbox/InboxHeader.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { JobPage } from "@/api/jobList";
import { roundScore } from "@/domain/scoreBand";
import { navNumber } from "@/features/shell/navigation";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { RunLine } from "./RunLine";
import { useInboxList } from "./useInboxLists";

export interface InboxHeaderProps {
  onShowBelow: () => void;
  actions?: ReactNode;
}

/** Spec 4.2: masthead with the status lede (new matches, last crawl, next run). */
export function InboxHeader({ onShowBelow, actions }: InboxHeaderProps) {
  const { t } = useI18n();
  const fresh = useInboxList("new");
  const first = fresh.data?.pages[0];
  return (
    <>
      <Masthead
        small
        number={navNumber("inbox")}
        title={t("nav.inbox")}
        deck={first ? <Deck page={first} t={t} /> : undefined}
        actions={actions}
      />
      <RunLine onShowBelow={onShowBelow} />
    </>
  );
}

function Deck({ page, t }: { page: JobPage; t: Translate }) {
  if (page.total === 0) return t("inbox.deck.empty");
  const count = page.total === 1 ? t("inbox.deck.one") : t("inbox.deck.many", { count: page.total });
  const top = page.items[0];
  const strongest =
    top && top.match_score !== null && top.match_score !== undefined
      ? ` ${t("inbox.deck.top", { company: top.company ?? t("job.unknownCompany"), score: roundScore(top.match_score) })}`
      : null;
  return (
    <>
      <b>{count}</b>
      {strongest}
    </>
  );
}
```

`web/src/features/inbox/RunLine.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { fetchPlatforms } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { latestRun, nextRunAt, type LastRun, type RunErrorCode } from "@/domain/runLine";
import type { MessageKey } from "@/i18n/de";
import { formatDayTime, type DayTimeClock } from "@/i18n/formatDayTime";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Icon } from "@/ui/Icon";

// last_run.error is a fixed server code; it is never shown as raw text.
const RUN_ERROR_LABEL: Readonly<Record<RunErrorCode, MessageKey>> = {
  cancelled: "runline.error.cancelled",
  unreachable: "runline.error.unreachable",
  failed: "runline.error.failed",
  unknown: "runline.error.unknown",
};

/** Decision D11: last finished crawl over all sources, and the next scheduled one. */
export function RunLine({ onShowBelow }: { onShowBelow: () => void }) {
  const { t, language } = useI18n();
  const now = useNow();
  const platforms = useQuery({ queryKey: queryKeys.platforms, queryFn: fetchPlatforms });
  if (!platforms.data || platforms.data.length === 0) return null;
  const clock: DayTimeClock = { now, language };
  const run = latestRun(platforms.data);
  const next = nextRunAt(platforms.data, new Date(now));
  return (
    <p className="runline">
      {run ? <LastRunText run={run} clock={clock} onShowBelow={onShowBelow} /> : t("runline.never")}
      {next ? ` ${t("runline.next", { when: formatDayTime(next, t, clock) })}` : null}
    </p>
  );
}

interface LastRunProps {
  run: LastRun;
  clock: DayTimeClock;
  onShowBelow: () => void;
}

function LastRunText({ run, clock, onShowBelow }: LastRunProps) {
  const { t } = useI18n();
  const when = formatDayTime(run.finishedAt, t, clock);
  if (run.error) return <FailedRun run={run} when={when} />;
  return (
    <>
      {t("runline.last", { source: run.source, when })}{" "}
      {t("runline.counts", { found: run.found, matched: run.matched, below: run.below })}
      {run.below > 0 ? (
        <>
          {" "}
          <button type="button" className="link" onClick={onShowBelow}>
            {t("runline.showBelow")}
          </button>
        </>
      ) : null}
    </>
  );
}

/** Errors in crimson, always with icon and words (spec 5). */
function FailedRun({ run, when }: { run: LastRun; when: string }) {
  const { t } = useI18n();
  const reason = t(RUN_ERROR_LABEL[run.error ?? "unknown"]);
  return (
    <span className="runline-error t-danger">
      <Icon icon={CircleAlert} />
      <span>{t("runline.failed", { source: run.source, when, reason })}</span>
      <Link className="link" href="/sources">
        {t("runline.toSources")}
      </Link>
    </span>
  );
}
```

- [ ] **Step 8: Write the tabs, the list and the row**

`web/src/features/inbox/InboxTabs.tsx`:

```tsx
"use client";

import { INBOX_TABS, type InboxTab } from "@/api/jobList";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { CountBadge } from "@/ui/CountBadge";
import { Tabs } from "@/ui/Tabs";
import { useInboxCounts } from "./useInboxLists";

export const INBOX_TABS_ID = "inbox";

const TAB_LABEL: Readonly<Record<InboxTab, MessageKey>> = {
  new: "inbox.tab.new",
  below: "inbox.tab.below",
  dismissed: "inbox.tab.dismissed",
};

/** Decision D3: WAI-ARIA tabs with counts (prototype .filter-tabs); the list is their panel. */
export function InboxTabs({ tab, onSelect }: { tab: InboxTab; onSelect: (tab: InboxTab) => void }) {
  const { t } = useI18n();
  const counts = useInboxCounts();
  const items = INBOX_TABS.map((key) => ({
    key,
    label: t(TAB_LABEL[key]),
    suffix: <TabCount tab={key} count={counts[key]} />,
  }));
  return (
    <Tabs
      items={items}
      selected={tab}
      onSelect={(next) => next !== tab && onSelect(next)}
      label={t("inbox.tabsLabel")}
      idPrefix={INBOX_TABS_ID}
    />
  );
}

/** New matches get the accent badge, the other tabs a plain number (prototype). */
function TabCount({ tab, count }: { tab: InboxTab; count: number | null }) {
  const { t } = useI18n();
  if (count === null) return null;
  if (tab === "new" && count > 0) {
    return <CountBadge count={count} label={t("nav.newMatches", { count })} />;
  }
  return <span className="count-plain">{count}</span>;
}
```

Note: the "Neu" tab with a badge reads "Neu 2 neue Treffer" for screen readers; tests match it with `/^Neu/`.

`web/src/features/inbox/InboxList.tsx`:

```tsx
"use client";

import { Archive, Check, Gauge, Globe, RotateCcw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { describeError } from "@/api/describeError";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { flattenPages, listPhase } from "@/domain/inbox";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { useInboxList, type InboxListQuery } from "./useInboxLists";

export interface InboxListProps {
  tab: InboxTab;
  renderRow: (item: JobListItem) => ReactNode;
  onShowBelow: () => void;
}

const SKELETON_ROWS = [0, 1, 2];

const EMPTY_COPY: Readonly<Record<InboxTab, { icon: LucideIcon; title: MessageKey; text: MessageKey }>> = {
  new: { icon: Check, title: "inbox.empty.newTitle", text: "inbox.empty.newText" },
  below: { icon: Gauge, title: "inbox.empty.belowTitle", text: "inbox.empty.belowText" },
  dismissed: { icon: Archive, title: "inbox.empty.dismissedTitle", text: "inbox.empty.dismissedText" },
};

/** Loading, stalled, error, empty and filled states of one tab (spec 6, decision D10). */
export function InboxList({ tab, renderRow, onShowBelow }: InboxListProps) {
  const list = useInboxList(tab);
  const rows = flattenPages(list.data?.pages);
  const status = { hasData: list.data !== undefined, isError: list.isError, failureCount: list.failureCount };
  const phase = listPhase({ ...status, itemCount: rows.length });
  if (phase === "loading" || phase === "stalled") return <ListLoading stalled={phase === "stalled"} />;
  if (phase === "error") return <ListError error={list.error} onRetry={() => void list.refetch()} />;
  if (phase === "empty") return <InboxEmpty tab={tab} onShowBelow={onShowBelow} />;
  return (
    <>
      <ul className="jrows">
        {rows.map((row) => (
          <Fragment key={row.id}>{renderRow(row)}</Fragment>
        ))}
      </ul>
      <LoadMore list={list} />
    </>
  );
}

function ListLoading({ stalled }: { stalled: boolean }) {
  const { t } = useI18n();
  return (
    <div className="jrows-loading" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="jrow-skeleton">
          <span className="skeleton-line w-2/3" />
          <span className="skeleton-line w-1/2" />
        </div>
      ))}
      {stalled ? <p className="hint">{t("inbox.stalled")}</p> : null}
    </div>
  );
}

function ListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="inbox-notice">
      <Notice tone="error">{describeError(error, t)}</Notice>
      <Button className="mt-3" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}

function InboxEmpty({ tab, onShowBelow }: { tab: InboxTab; onShowBelow: () => void }) {
  const { t } = useI18n();
  const copy = EMPTY_COPY[tab];
  const actions = tab === "new" ? <NewEmptyActions onShowBelow={onShowBelow} /> : undefined;
  return (
    <EmptyState icon={copy.icon} title={t(copy.title)} actions={actions}>
      {t(copy.text)}
    </EmptyState>
  );
}

function NewEmptyActions({ onShowBelow }: { onShowBelow: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <Link className="btn" href="/sources">
        <Icon icon={Globe} />
        <span>{t("inbox.empty.toSources")}</span>
      </Link>
      <Button variant="ghost" onClick={onShowBelow}>
        {t("inbox.empty.toBelow")}
      </Button>
    </>
  );
}

/** Decision D9: an explicit button instead of infinite scroll. */
function LoadMore({ list }: { list: InboxListQuery }) {
  const { t } = useI18n();
  if (!list.hasNextPage) return null;
  return (
    <div className="list-foot">
      <Button size="sm" busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
        {t("inbox.more")}
      </Button>
    </div>
  );
}
```

`web/src/features/inbox/InboxRow.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import { jobPath } from "@/api/jobs";
import { fetchPlatforms } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { parseApiDate } from "@/domain/calendar";
import { fitLine } from "@/domain/inbox";
import { hostOf } from "@/domain/links";
import { statusLabel } from "@/features/job/labels";
import { formatRelativeDays } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { cx } from "@/ui/cx";
import { ScoreMeter } from "@/ui/ScoreMeter";
import { Monogram } from "@/ui/Monogram";

export interface InboxRowProps {
  item: JobListItem;
  selected?: boolean;
  /** Set from 1200 px: the click selects instead of navigating (decision D2). */
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  actions?: ReactNode;
}

/** Spec 4.2 compact row; the title link stretches over the row (spec 4.3 #5), buttons sit above it. */
export function InboxRow({ item, selected = false, onOpen, actions }: InboxRowProps) {
  const { t } = useI18n();
  const fit = fitLine(item.reasoning);
  return (
    <li className={cx("jrow", selected && "is-selected")}>
      <Monogram name={item.company} />
      <div className="jrow-main">
        <Link
          className="jrow-link"
          href={jobPath(item.id)}
          aria-current={selected ? "true" : undefined}
          onClick={onOpen}
        >
          {item.title ?? t("job.untitled")}
        </Link>
        <RowMeta item={item} />
        {fit ? <p className="jrow-fit">{fit}</p> : null}
      </div>
      <RowScore score={item.match_score} />
      {actions ? <div className="jrow-actions">{actions}</div> : null}
    </li>
  );
}

function RowMeta({ item }: { item: JobListItem }) {
  const { t } = useI18n();
  const now = useNow();
  const source = useSourceName(item);
  const found = item.created_at && isDate(item.created_at) ? formatRelativeDays(item.created_at, t, { now }) : null;
  // A former application in "Von dir aussortiert" says which phase it had (decision D13).
  const phase = item.status === "OPEN" ? null : t(statusLabel(item.status));
  const parts = [item.company ?? t("job.unknownCompany"), found, source, phase];
  return <p className="jrow-sub">{parts.filter(Boolean).join(" · ")}</p>;
}

function isDate(iso: string): boolean {
  return !Number.isNaN(parseApiDate(iso).getTime());
}

/** The source's own name, else the posting's host (imported jobs have no source). */
function useSourceName(item: JobListItem): string | null {
  const platforms = useQuery({ queryKey: queryKeys.platforms, queryFn: fetchPlatforms });
  const platform = platforms.data?.find((entry) => entry.id === item.platform_id);
  return platform?.name ?? hostOf(item.url);
}

function RowScore({ score }: { score: number | null | undefined }) {
  const { t } = useI18n();
  if (score === null || score === undefined) {
    return (
      <span className="score unscored" title={t("job.unscored")}>
        <span className="score-n" aria-hidden="true">
          –
        </span>
        <span className="sr-only">{t("job.unscored")}</span>
      </span>
    );
  }
  return <ScoreMeter score={score} />;
}
```

- [ ] **Step 9: Write the list column and the page**

`web/src/features/inbox/InboxListColumn.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { TabPanel } from "@/ui/Tabs";
import { InboxHeader } from "./InboxHeader";
import { InboxList } from "./InboxList";
import { INBOX_TABS_ID, InboxTabs } from "./InboxTabs";
import type { InboxUrl } from "./useInboxUrl";

export interface InboxListColumnProps {
  url: InboxUrl;
  renderRow: (item: JobListItem) => ReactNode;
}

/** Left column: masthead, tabs and the selected tab's list (usability "Eingang" layout). */
export function InboxListColumn({ url, renderRow }: InboxListColumnProps) {
  const { t } = useI18n();
  const showBelow = () => url.setTab("below");
  return (
    <section className="inbox-list" aria-label={t("nav.inbox")}>
      <div className="inbox-top">
        <InboxHeader onShowBelow={showBelow} />
        <InboxTabs tab={url.tab} onSelect={url.setTab} />
      </div>
      <TabPanel idPrefix={INBOX_TABS_ID} selected={url.tab}>
        <InboxList tab={url.tab} renderRow={renderRow} onShowBelow={showBelow} />
      </TabPanel>
    </section>
  );
}
```

`web/src/features/inbox/InboxPage.tsx`:

```tsx
"use client";

import { InboxListColumn } from "./InboxListColumn";
import { InboxRow } from "./InboxRow";
import { useInboxUrl } from "./useInboxUrl";

/** Eingang (spec 4.2); rows get their actions in Task 9 and the preview pane in Task 10. */
export function InboxPage() {
  const url = useInboxUrl();
  return (
    <div className="inbox">
      <InboxListColumn url={url} renderRow={(item) => <InboxRow item={item} />} />
    </div>
  );
}
```

- [ ] **Step 10: Write `inbox.css` and import it**

`web/src/features/inbox/inbox.css`:

```css
/* Inbox, ported from docs/prototype/clickdummy-editorial.html (.inbox, .jrow, .runline, .list-foot). */
@layer components {
  .inbox {
    min-height: 100dvh;
  }
  .inbox-list {
    min-width: 0;
    max-width: 920px;
    margin: 0 auto;
    padding-bottom: 72px;
  }
  .inbox-top {
    padding: 30px 24px 0;
  }
  .inbox-top .mast {
    margin-bottom: 0;
  }
  .inbox-top .tabs {
    margin-top: 18px;
  }
  .runline {
    font-size: var(--fs-13);
    color: var(--text-2);
    margin-top: 10px;
    line-height: 1.5;
  }
  .runline-error {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }
  .jrows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .jrow {
    position: relative;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 6px 14px;
    align-items: start;
    padding: 16px 24px;
    border-bottom: 1px solid var(--line);
    transition: background-color var(--t-fast) var(--ease);
  }
  .jrow:hover {
    background: var(--hover);
  }
  .jrow.is-selected {
    background: var(--selected);
  }
  .jrow.is-selected::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: var(--accent);
  }
  .jrow-main {
    min-width: 0;
  }
  .jrow-link {
    font-weight: 600;
    font-size: 14.5px;
    line-height: 1.3;
    color: var(--text);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  /* The whole row opens the job: the link stretches over it; the buttons sit above (z-index). */
  .jrow-link::after {
    content: "";
    position: absolute;
    inset: 0;
  }
  .jrow-link:focus-visible {
    outline: none;
  }
  .jrow-link:focus-visible::after {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .jrow-sub,
  .jrow-fit {
    margin-top: 3px;
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  .jrow-actions {
    grid-column: 2 / 4;
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .score.unscored .score-n {
    color: var(--text-3);
  }
  .jrows-loading {
    padding: 16px 24px;
  }
  .jrow-skeleton + .jrow-skeleton {
    margin-top: 22px;
  }
  .list-foot {
    padding: 14px 24px;
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  .inbox-notice {
    margin: 16px 24px 0;
  }

  @media (max-width: 767px) {
    .inbox-top {
      padding: 22px 16px 0;
    }
    .jrow {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      gap: 6px 12px;
      padding: 15px 16px;
      min-height: 64px;
    }
    .jrows-loading,
    .list-foot {
      padding: 14px 16px;
    }
    .inbox-notice {
      margin: 16px 16px 0;
    }
  }
}
```

In `web/app/globals.css`, add after the job import: `@import "../src/features/inbox/inbox.css";`

- [ ] **Step 11: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui tests/unit/features tests/unit/theme`
Expected: PASS (`cssFiles.test.ts` now also parses `inbox.css`).

- [ ] **Step 12: Write the e2e fixtures and spec**

In `web/tests/e2e/support/fixtures.ts`, import `JobPageBody` (`../../../src/api/jobList`) and `SetupStatusBody` (`../../../src/api/setup`), and add:

```ts
const EMPTY_PAGE: JobPageBody = { items: [], total: 0 };
/** Everything set up: the inbox shows its lists, not the onboarding. */
export const SETUP_DONE: SetupStatusBody = {
  has_source: true,
  ai_configured: true,
  profile_complete: true,
  has_jobs: true,
};
```

and two entries in `AUTHENTICATED_ROUTES` (every spec that visits `/inbox` needs them; the plain `GET /jobs` key answers every list query that a spec does not key exactly):

```ts
  "GET /jobs": { body: EMPTY_PAGE },
  "GET /setup-status": { body: SETUP_DONE },
```

`web/tests/e2e/support/inboxFixtures.ts`:

```ts
import { dueListPath, inboxListPath, INBOX_TABS, type InboxTab } from "../../../src/api/jobList";
import type { JobListItemBody, JobPageBody } from "../../../src/api/jobList";
import type { PlatformBody } from "../../../src/api/platforms";
import type { ThresholdDistributionBody } from "../../../src/api/threshold";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import type { MockResponse, MockRoutes, MutableRoutes } from "./mockApi";

/** Fixed "now" of every inbox test (page.clock.setFixedTime): Thursday 10:00 in Berlin. */
export const NOW_ISO = "2026-10-08T10:00:00+02:00";

const REASONING = `## Zusammenfassung
Du passt gut: Kotlin und Kafka sind dein Alltag.

## Stärken & Übereinstimmung
- Kotlin seit sechs Jahren
- Kafka im Betrieb

## Lücken & Herausforderungen
- Kein Go

## Empfehlung
Bewerben.`;

export function listItem(id: string, overrides: Partial<JobListItemBody> = {}): JobListItemBody {
  return {
    id,
    title: "Senior Backend Engineer",
    company: "ACME GmbH",
    status: "OPEN",
    match_score: 84,
    reasoning: REASONING,
    url: `https://www.stepstone.de/stellenangebote--${id}.html`,
    platform_id: 1,
    created_at: "2026-10-07T07:00:00+00:00",
    ...overrides,
  };
}

const below = { is_archived: true, archive_reason: "THRESHOLD" };
export const NEW_ITEMS: JobListItemBody[] = [
  listItem("job-1", { title: "Senior Kotlin Engineer", company: "N26", match_score: 86 }),
  listItem("job-2", { title: "Backend Engineer (Java)", company: "Personio", match_score: 72 }),
  listItem("job-3", { title: "Softwareentwickler Java", company: "HHLA", match_score: 64, reasoning: null }),
];
export const BELOW_ITEMS: JobListItemBody[] = [
  listItem("job-20", { title: "Fullstack-Entwickler PHP", company: "Aroundhome", match_score: 54, ...below }),
  listItem("job-21", { title: "SAP ABAP Entwickler", company: "Tchibo", match_score: 32, ...below }),
];
export const DISMISSED_ITEMS: JobListItemBody[] = [
  listItem("job-17", {
    title: "Teamlead Java Backend",
    company: "Check24",
    match_score: 74,
    is_archived: true,
    archive_reason: "USER",
  }),
];

export const PLATFORMS_WITH_RUNS: PlatformBody[] = [
  {
    id: 1,
    name: "StepStone",
    url: "https://www.stepstone.de/jobs/kotlin",
    schedule_time: "14:00",
    schedule_days: [0, 1, 2, 3, 4],
    last_run: { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3, error: null },
  },
  {
    id: 2,
    name: "Indeed",
    url: "https://de.indeed.com/jobs?q=kotlin",
    last_run: { finished_at: "2026-10-07T06:00:00+00:00", found: 0, new: 0, matched: 0, error: "unreachable" },
  },
];

const counts = Array.from({ length: 101 }, () => 0);
for (const score of [32, 54, 64, 72, 86]) counts[score] = 1;
export const DISTRIBUTION: ThresholdDistributionBody = { counts };

export function page(items: readonly JobListItemBody[], total = items.length): JobPageBody {
  return { items: [...items], total };
}

export interface InboxData {
  new?: readonly JobListItemBody[];
  below?: readonly JobListItemBody[];
  dismissed?: readonly JobListItemBody[];
  due?: readonly JobListItemBody[];
  threshold?: number;
}

function listsOf(data: InboxData): Readonly<Record<InboxTab, readonly JobListItemBody[]>> {
  return {
    new: data.new ?? NEW_ITEMS,
    below: data.below ?? BELOW_ITEMS,
    dismissed: data.dismissed ?? DISMISSED_ITEMS,
  };
}

/** Exact keys for the first page and the counter of every tab (the keys come from src, never typed by hand). */
export function listRoutes(data: InboxData = {}): MockRoutes {
  const lists = listsOf(data);
  const entries = INBOX_TABS.flatMap((tab): [string, MockResponse][] => [
    [`GET ${inboxListPath(tab, 0)}`, { body: page(lists[tab]) }],
    [`GET ${inboxListPath(tab, 0, 1)}`, { body: page(lists[tab].slice(0, 1), lists[tab].length) }],
  ]);
  return { ...Object.fromEntries(entries), [`GET ${dueListPath()}`]: { body: page(data.due ?? []) } };
}

export function inboxRoutes(data: InboxData = {}, extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    "GET /settings": { body: { language: "de", match_threshold: data.threshold ?? 60 } },
    "GET /platforms": { body: PLATFORMS_WITH_RUNS },
    "GET /matching-preference/distribution": { body: DISTRIBUTION },
    ...listRoutes(data),
    ...extra,
  };
}
```

`web/tests/e2e/inbox.spec.ts`:

```ts
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { inboxRoutes, NOW_ISO } from "./support/inboxFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`inbox renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(inboxRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
      await expect(page.getByRole("tab", { name: /^Neu/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("12 gefunden, 3 passend, 2 unter Schwellwert.")).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-${size}-${scheme}`);
    });
  }
}

const TABS = [
  ["unter", "Unter Schwellwert", "Fullstack-Entwickler PHP"],
  ["aus", "Von dir aussortiert", "Teamlead Java Backend"],
] as const;

for (const [param, tabName, title] of TABS) {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    test(`tab ${tabName} at ${size}px`, async ({ page, mockApi }) => {
      await mockApi(inboxRoutes());
      await page.setViewportSize(viewport);
      await page.goto(`/inbox?tab=${param}`);
      await expect(page.getByRole("tab", { name: new RegExp(tabName) })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("link", { name: title })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-${param}-${size}`);
    });
  }
}

test("switching tabs keeps the choice in the URL", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox");
  await page.getByRole("tab", { name: /Unter Schwellwert/ }).click();
  await expect(page).toHaveURL(/\/inbox\?tab=unter$/);
  await expect(page.getByRole("link", { name: "Fullstack-Entwickler PHP" })).toBeVisible();
});

test("an empty inbox says so and offers the sources", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes({ new: [] }));
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 2, name: "Alles gesichtet." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quellen ansehen" }).first()).toHaveAttribute("href", "/sources");
  await saveScreenshot(page, "inbox-empty-1440");
});

test("a failed last run is shown with its reason", async ({ page, mockApi }) => {
  const failing = [{ id: 2, name: "Indeed", url: "https://de.indeed.com", last_run: { finished_at: "2026-10-08T06:00:00+00:00", error: "unreachable" } }];
  await mockApi(inboxRoutes({}, { "GET /platforms": { body: failing } }));
  await page.goto("/inbox");
  await expect(page.getByText(/fehlgeschlagen \(Seite nicht erreichbar\)/)).toBeVisible();
});

test("no horizontal scroll at 375px on any tab", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  for (const path of ["/inbox", "/inbox?tab=unter", "/inbox?tab=aus"]) {
    await page.goto(path);
    await expect(page.getByRole("tabpanel")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  }
});
```

Note: from Task 12 on, the "Unter Schwellwert" tab also loads the threshold panel; `inboxRoutes()` already mocks `GET /settings` and the distribution for it.

- [ ] **Step 13: Run the e2e suite**

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: all specs pass, including the phase-1/2 specs that visit `/inbox` (`shell`, `login`, `documentEdit`); they now get the empty page and the done setup status from `AUTHENTICATED_ROUTES`. A failing "unexpected" assertion names a missing route: add it to the fixture, never silence the fixture.

- [ ] **Step 14: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green. Copy the screenshots back.

---

### Task 9: Row actions and optimistic triage with undo

**Files:**
- Create: `web/src/features/inbox/useTriage.ts`, `web/src/features/inbox/RowActions.tsx`, `web/src/features/inbox/DeleteJobDialog.tsx`
- Modify: `web/src/features/inbox/InboxPage.tsx`, `web/src/features/inbox/inbox.css` (nothing new needed beyond Task 8; leave unchanged unless the buttons wrap badly), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/inbox/triage.test.tsx`, `web/tests/e2e/inboxTriage.spec.ts`

**Interfaces:**
- Consumes: `changeJobStatus`, `patchJob`, `deleteJob`, `jobPath` (`src/api/jobs.ts`), `withoutItem` (Task 5), `queryKeys.inboxList`, `queryKeys.thresholdDistribution`, `JobPage`, `InboxTab`, `JobListItem` (Task 4), `InboxRow` (Task 8), `Dialog`, `PanelHeader`, `Button`, `useToast`, `describeError`.
- Produces:
  - `interface Triage { shortlist(item); dismiss(item); restore(item); remove(item): Promise<boolean>; busyId: string | null }`.
  - `useTriage(tab: InboxTab, onRemoved: (id: string) => void): Triage` — Vormerken/Aussortieren optimistic with undo (D4, shared `mutationKey ["inbox-triage"]`); Wiederherstellen/Endgültig löschen not optimistic. `onRemoved(id)` is called before a row leaves the list (Task 10 moves the selection there).
  - `RowActions({ item, tab, triage })`, `DeleteJobDialog({ item, onConfirm, onClose })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/inbox/triage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItem } from "@/api/jobList";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { HTTP_OK, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildJob } from "../../support/jobFactory";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const KOTLIN = buildListItem({ id: "job-1", title: "Senior Kotlin Engineer", company: "N26" });
const JAVA = buildListItem({ id: "job-2", title: "Backend Engineer (Java)", company: "Personio" });
const PHP = buildListItem({ id: "job-20", title: "Fullstack-Entwickler PHP", is_archived: true, archive_reason: "THRESHOLD" });
const LEAD = buildListItem({ id: "job-17", title: "Teamlead Java Backend", company: "Check24", is_archived: true, archive_reason: "USER" });

function server(): InboxServer {
  return { new: [KOTLIN, JAVA], below: [PHP], dismissed: [LEAD], due: [] };
}

const without = (rows: JobListItem[], id: string) => rows.filter((row) => row.id !== id);
const pathOf = (call: RecordedCall) => `${call.method} ${new URL(call.url).pathname}`;
const bodies = (calls: RecordedCall[], key: string) =>
  calls.filter((call) => pathOf(call) === key).map((call) => JSON.parse(call.body ?? "null"));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.params = new URLSearchParams();
});

describe("triage in Neu", () => {
  it("shortlists at once and undoes from the toast", async () => {
    const data = server();
    const status = (call: RecordedCall) => {
      const to = JSON.parse(call.body ?? "{}").to as string;
      data.new = to === "OPEN" ? [KOTLIN, ...data.new] : without(data.new, "job-1");
      return jsonResponse(HTTP_OK, buildJob({ id: "job-1", status: to }));
    };
    const calls = stubRoutes(inboxStubs(data, { "POST /jobs/job-1/status": status }));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Vormerken: Senior Kotlin Engineer" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Senior Kotlin Engineer" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(bodies(calls, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }, { to: "OPEN" }]);
  });

  it("puts the row back and says why when the dismiss fails", async () => {
    stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-1": jsonResponse(HTTP_SERVER_ERROR, { detail: "db" }) }));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" }));
    expect(
      await screen.findByText("Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
  });

  it("sorting out two rows in a row keeps both out", async () => {
    const data = server();
    const archive = (id: string) => () => {
      data.new = without(data.new, id);
      return jsonResponse(HTTP_OK, { status: "updated" });
    };
    stubRoutes(inboxStubs(data, { "PATCH /jobs/job-1": archive("job-1"), "PATCH /jobs/job-2": archive("job-2") }));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" }));
    await userEvent.click(screen.getByRole("button", { name: "Aussortieren: Backend Engineer (Java)" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Alles gesichtet." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Engineer/ })).not.toBeInTheDocument();
  });
});

describe("the archive tabs", () => {
  it("restores a job from Unter Schwellwert", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    const data = server();
    const restore = () => {
      data.below = [];
      return jsonResponse(HTTP_OK, { status: "updated" });
    };
    const calls = stubRoutes(inboxStubs(data, { "PATCH /jobs/job-20": restore }));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Wiederherstellen: Fullstack-Entwickler PHP" }));
    expect(await screen.findByText("ACME GmbH ist wieder im Eingang.")).toBeInTheDocument();
    expect(bodies(calls, "PATCH /jobs/job-20")).toEqual([{ is_archived: false }]);
    expect(screen.queryByRole("button", { name: /Endgültig löschen/ })).not.toBeInTheDocument();
  });

  it("deletes for good only after asking", async () => {
    navigation.params = new URLSearchParams("tab=aus");
    const data = server();
    const remove = () => {
      data.dismissed = [];
      return jsonResponse(HTTP_OK, { status: "deleted" });
    };
    const calls = stubRoutes(inboxStubs(data, { "DELETE /jobs/job-17": remove }));
    renderWithProviders(<InboxPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Endgültig löschen: Teamlead Java Backend" }));
    const dialog = screen.getByRole("dialog", { name: "Endgültig löschen?" });
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByText("Gelöscht: Check24.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/inbox/triage.test.tsx`
Expected: FAIL, no button "Vormerken: Senior Kotlin Engineer".

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "inbox.shortlistJob": "Vormerken: {title}",
  "inbox.dismissJob": "Aussortieren: {title}",
  "inbox.restoreJob": "Wiederherstellen: {title}",
  "inbox.deleteJob": "Endgültig löschen: {title}",
  "inbox.shortlisted": "Vorgemerkt: {company}. Weiter geht es unter Bewerbungen.",
  "inbox.undone": "Rückgängig gemacht: {company} ist wieder unter Neu.",
  "inbox.restoredApplication": "{company} ist wieder unter Bewerbungen.",
  "inbox.view": "Ansehen",
  "inbox.delete.title": "Endgültig löschen?",
  "inbox.delete.text":
    "„{title}“ bei {company} wird mit Verlauf und Unterlagen gelöscht. Das lässt sich nicht rückgängig machen.",
  "inbox.delete.confirm": "Endgültig löschen",
  "inbox.deleted": "Gelöscht: {company}.",
```

`web/src/i18n/en.ts`:

```ts
  "inbox.shortlistJob": "Shortlist: {title}",
  "inbox.dismissJob": "Sort out: {title}",
  "inbox.restoreJob": "Restore: {title}",
  "inbox.deleteJob": "Delete for good: {title}",
  "inbox.shortlisted": "Shortlisted: {company}. It continues under Applications.",
  "inbox.undone": "Undone: {company} is back under New.",
  "inbox.restoredApplication": "{company} is back under Applications.",
  "inbox.view": "View",
  "inbox.delete.title": "Delete for good?",
  "inbox.delete.text":
    "“{title}” at {company} is deleted with its history and documents. This cannot be undone.",
  "inbox.delete.confirm": "Delete for good",
  "inbox.deleted": "Deleted: {company}.",
```

- [ ] **Step 4: Write `useTriage.ts`**

```ts
"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { describeError } from "@/api/describeError";
import type { InboxTab, JobListItem, JobPage } from "@/api/jobList";
import { changeJobStatus, deleteJob, jobPath, patchJob } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { withoutItem } from "@/domain/inbox";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

type ListData = InfiniteData<JobPage, number>;
interface Removal {
  previous: ListData | undefined;
}

// Shared by Vormerken and Aussortieren: the list refetches only after the last quick click settled.
const TRIAGE_KEY = ["inbox-triage"];

interface TriageSpec {
  run: (id: string) => Promise<unknown>;
  undo: (id: string) => Promise<unknown>;
  done: MessageKey;
}

const SHORTLIST: TriageSpec = {
  run: (id) => changeJobStatus(id, { to: "DRAFTED" }),
  undo: (id) => changeJobStatus(id, { to: "OPEN" }),
  done: "inbox.shortlisted",
};
const DISMISS: TriageSpec = {
  run: (id) => patchJob(id, { is_archived: true }),
  undo: (id) => patchJob(id, { is_archived: false }),
  done: "next.dismissed",
};

export interface Triage {
  shortlist: (item: JobListItem) => void;
  dismiss: (item: JobListItem) => void;
  restore: (item: JobListItem) => void;
  remove: (item: JobListItem) => Promise<boolean>;
  busyId: string | null;
}

const companyOf = (item: JobListItem, t: Translate) => item.company ?? t("job.unknownCompany");

function refreshInbox(queryClient: QueryClient, id: string): void {
  const keys = [queryKeys.jobsRoot, queryKeys.jobCounts, queryKeys.thresholdDistribution, queryKeys.job(id)];
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/** Spec 6: optimistic only where undo exists; returns the snapshot for the rollback. */
async function removeRow(queryClient: QueryClient, tab: InboxTab, id: string): Promise<Removal> {
  const queryKey = queryKeys.inboxList(tab);
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<ListData>(queryKey);
  if (previous) queryClient.setQueryData<ListData>(queryKey, { ...previous, pages: withoutItem(previous.pages, id) });
  return { previous };
}

function rollback(queryClient: QueryClient, tab: InboxTab, removal?: Removal): void {
  if (removal?.previous) queryClient.setQueryData(queryKeys.inboxList(tab), removal.previous);
}

function settle(queryClient: QueryClient, id: string): void {
  // isMutating still counts this mutation; refetch only when it is the last one running.
  if (queryClient.isMutating({ mutationKey: TRIAGE_KEY }) === 1) refreshInbox(queryClient, id);
}

function useUndoToast(spec: TriageSpec): (item: JobListItem) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return (item) => {
    const company = companyOf(item, t);
    const undone = () => {
      refreshInbox(queryClient, item.id);
      toast.show({ message: t("inbox.undone", { company }) });
    };
    const failed = (error: unknown) => toast.show({ tone: "error", message: describeError(error, t) });
    const undo = () => void spec.undo(item.id).then(undone, failed);
    toast.show({ message: t(spec.done, { company }), action: { label: t("phase.undo"), onAction: undo } });
  };
}

function useOptimisticTriage(tab: InboxTab, spec: TriageSpec, onRemoved: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const announce = useUndoToast(spec);
  return useMutation<unknown, unknown, JobListItem, Removal>({
    mutationKey: TRIAGE_KEY,
    mutationFn: (item) => spec.run(item.id),
    onMutate: (item) => {
      onRemoved(item.id);
      return removeRow(queryClient, tab, item.id);
    },
    onError: (error, _item, removal) => {
      rollback(queryClient, tab, removal);
      toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSuccess: (_result, item) => announce(item),
    onSettled: (_result, _error, item) => settle(queryClient, item.id),
  });
}

/** A restored match goes back to "Neu", a former application to Bewerbungen (decision D13). */
function restoredMessage(item: JobListItem, t: Translate): string {
  const company = companyOf(item, t);
  return item.status === "OPEN" ? t("next.restored", { company }) : t("inbox.restoredApplication", { company });
}

function useRestore(onRemoved: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (item: JobListItem) => patchJob(item.id, { is_archived: false }),
    onSuccess: (_result, item) => {
      onRemoved(item.id);
      refreshInbox(queryClient, item.id);
      const view = { label: t("inbox.view"), onAction: () => router.push(jobPath(item.id)) };
      toast.show({ message: restoredMessage(item, t), action: view });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function useRemove(onRemoved: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (item: JobListItem) => deleteJob(item.id),
    onSuccess: (_result, item) => {
      onRemoved(item.id);
      refreshInbox(queryClient, item.id);
      toast.show({ message: t("inbox.deleted", { company: companyOf(item, t) }) });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function pendingId(...mutations: ReadonlyArray<{ isPending: boolean; variables?: JobListItem }>) {
  return mutations.find((mutation) => mutation.isPending)?.variables?.id ?? null;
}

/** Decision D4: every triage of the inbox, for rows and the preview pane alike. */
export function useTriage(tab: InboxTab, onRemoved: (id: string) => void): Triage {
  const shortlist = useOptimisticTriage(tab, SHORTLIST, onRemoved);
  const dismiss = useOptimisticTriage(tab, DISMISS, onRemoved);
  const restore = useRestore(onRemoved);
  const remove = useRemove(onRemoved);
  return {
    shortlist: (item) => shortlist.mutate(item),
    dismiss: (item) => dismiss.mutate(item),
    restore: (item) => restore.mutate(item),
    remove: (item) => remove.mutateAsync(item).then(() => true, () => false),
    busyId: pendingId(restore, remove),
  };
}
```

- [ ] **Step 5: Write the row actions and the delete dialog**

`web/src/features/inbox/RowActions.tsx`:

```tsx
"use client";

import { Archive, Bookmark, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { DeleteJobDialog } from "./DeleteJobDialog";
import type { Triage } from "./useTriage";

export interface RowActionsProps {
  item: JobListItem;
  tab: InboxTab;
  triage: Triage;
}

/** Decision D12: Neu -> Vormerken/Aussortieren; archive tabs -> Wiederherstellen (+ löschen). */
export function RowActions({ item, tab, triage }: RowActionsProps) {
  if (tab === "new") return <TriageButtons item={item} triage={triage} />;
  return <ArchiveButtons item={item} tab={tab} triage={triage} />;
}

function TriageButtons({ item, triage }: Omit<RowActionsProps, "tab">) {
  const { t } = useI18n();
  const title = item.title ?? t("job.untitled");
  return (
    <>
      <Button size="sm" icon={Bookmark} aria-label={t("inbox.shortlistJob", { title })} onClick={() => triage.shortlist(item)}>
        {t("next.shortlist")}
      </Button>
      <Button size="sm" variant="ghost" icon={Archive} aria-label={t("inbox.dismissJob", { title })} onClick={() => triage.dismiss(item)}>
        {t("next.dismiss")}
      </Button>
    </>
  );
}

function ArchiveButtons({ item, tab, triage }: RowActionsProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const title = item.title ?? t("job.untitled");
  return (
    <>
      <Button
        size="sm"
        icon={RotateCcw}
        busy={triage.busyId === item.id}
        aria-label={t("inbox.restoreJob", { title })}
        onClick={() => triage.restore(item)}
      >
        {t("next.restoreAction")}
      </Button>
      {tab === "dismissed" ? (
        <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t("inbox.deleteJob", { title })} onClick={() => setConfirming(true)} />
      ) : null}
      {confirming ? (
        <DeleteJobDialog item={item} onConfirm={() => triage.remove(item)} onClose={() => setConfirming(false)} />
      ) : null}
    </>
  );
}
```

`web/src/features/inbox/DeleteJobDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";

export interface DeleteJobDialogProps {
  item: JobListItem;
  /** Resolves true when the server deleted the job. */
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}

/** No undo exists for a hard delete, so it is confirmed first (D4). Ink button: crimson is for errors. */
export function DeleteJobDialog({ item, onConfirm, onClose }: DeleteJobDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const heading = t("inbox.delete.title");
  const confirm = async () => {
    setBusy(true);
    if (await onConfirm()) onClose();
    else setBusy(false);
  };
  const names = { title: item.title ?? t("job.untitled"), company: item.company ?? t("job.unknownCompany") };
  return (
    <Dialog open onClose={onClose} label={heading}>
      <div className="panel-in">
        <PanelHeader title={heading} onClose={onClose} />
        <p className="prose">{t("inbox.delete.text", names)}</p>
        <div className="row panel-actions">
          <Button busy={busy} onClick={() => void confirm()}>
            {t("inbox.delete.confirm")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 6: Give the rows their actions**

Replace `web/src/features/inbox/InboxPage.tsx` with:

```tsx
"use client";

import { InboxListColumn } from "./InboxListColumn";
import { InboxRow } from "./InboxRow";
import { RowActions } from "./RowActions";
import { useInboxUrl } from "./useInboxUrl";
import { useTriage } from "./useTriage";

const KEEP_SELECTION = () => undefined;

/** Eingang (spec 4.2); the preview pane follows in Task 10. */
export function InboxPage() {
  const url = useInboxUrl();
  const triage = useTriage(url.tab, KEEP_SELECTION);
  return (
    <div className="inbox">
      <InboxListColumn
        url={url}
        renderRow={(item) => (
          <InboxRow item={item} actions={<RowActions item={item} tab={url.tab} triage={triage} />} />
        )}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/inbox`
Expected: PASS (Task 8 tests unchanged).

- [ ] **Step 8: Write the e2e spec**

`web/tests/e2e/inboxTriage.spec.ts`:

```ts
import { SCREENSHOT_SIZES } from "./support/constants";
import { BELOW_ITEMS, DISMISSED_ITEMS, inboxRoutes, listRoutes, NEW_ITEMS, NOW_ISO } from "./support/inboxFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const UPDATED = { body: { status: "updated" } };
const REST = NEW_ITEMS.slice(1);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`dismissing a match shows the undo toast at ${size}px`, async ({ page, mockApi }) => {
    const routes = inboxRoutes({}, { "PATCH /jobs/job-1": UPDATED });
    const log = await mockApi(routes);
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    // The refetch after the PATCH already sees the server without the job.
    setRoutes(routes, listRoutes({ new: REST }));
    await page.getByRole("button", { name: "Aussortieren: Senior Kotlin Engineer" }).click();
    await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(0);
    await expect(page.getByText("Aussortiert: N26.")).toBeVisible();
    expect(log.calls.filter((call) => call.key === "PATCH /jobs/job-1").map((call) => call.body)).toEqual([
      { is_archived: true },
    ]);
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-dismissed-toast-${size}`);
  });
}

test("restoring from Unter Schwellwert offers to view the job", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-20": UPDATED });
  await mockApi(routes);
  await page.goto("/inbox?tab=unter");
  setRoutes(routes, listRoutes({ below: BELOW_ITEMS.slice(1) }));
  await page.getByRole("button", { name: "Wiederherstellen: Fullstack-Entwickler PHP" }).click();
  await expect(page.getByText("Aroundhome ist wieder im Eingang.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fullstack-Entwickler PHP" })).toHaveCount(0);
});

test("deleting for good asks first", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "DELETE /jobs/job-17": { body: { status: "deleted" } } });
  const log = await mockApi(routes);
  await page.goto("/inbox?tab=aus");
  await page.getByRole("button", { name: `Endgültig löschen: ${DISMISSED_ITEMS[0]!.title}` }).click();
  const dialog = page.getByRole("dialog", { name: "Endgültig löschen?" });
  await expect(dialog).toBeVisible();
  await saveScreenshot(page, "inbox-delete-dialog-1440");
  expect(log.requests).not.toContain("DELETE /jobs/job-17");
  setRoutes(routes, listRoutes({ dismissed: [] }));
  await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText("Gelöscht: Check24.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Nichts aussortiert" })).toBeVisible();
});
```

- [ ] **Step 9: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green. Copy the screenshots back.

---

### Task 10: Preview pane from 1200 px and selection in the URL

**Files:**
- Create: `web/src/lib/useMediaQuery.ts`, `web/src/features/inbox/useSelection.ts`, `web/src/features/inbox/InboxPreview.tsx`
- Modify: `web/src/features/inbox/InboxPage.tsx`, `web/src/features/inbox/inbox.css`, `web/src/features/job/fit/FitTab.tsx` (export `FitColumns`), `web/src/features/job/JobHeader.tsx` (export `ScoreBox`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/unit/features/inbox/inboxPage.test.tsx` and `triage.test.tsx` (install a narrow `matchMedia`)
- Test: `web/tests/unit/lib/useMediaQuery.test.tsx`, `web/tests/unit/features/inbox/preview.test.tsx`, `web/tests/e2e/inboxPreview.spec.ts`

**Interfaces:**
- Consumes: `selectedItem`, `nextSelection`, `flattenPages`, `safeHttpUrl` (Task 5), `useInboxList`, `InboxUrl` (Task 8), `Triage`, `RowActions` (Task 9), `parseFitReasoning`, `FitColumns`, `ScoreBox`, `InlineText`, `Markdown`, `hostOf`, `formatDate`.
- Produces:
  - `useMediaQuery(query: string): boolean` (false on the server and in the first hydration pass).
  - `WIDE_INBOX_QUERY = "(min-width: 1200px)"`.
  - `interface Selection { selected: JobListItem | null; open: ((item) => void) | null; onRemoved(id) }`, `useSelection(url, wide): Selection`.
  - `InboxPreview({ item, tab, triage })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/lib/useMediaQuery.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { installFakeMatchMedia } from "../support/fakeMatchMedia";

describe("useMediaQuery", () => {
  it("follows the media query", () => {
    const media = installFakeMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1200px)"));
    expect(result.current).toBe(false);
    act(() => media.setMatches(true));
    expect(result.current).toBe(true);
  });
});
```

`web/tests/unit/features/inbox/preview.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { HTTP_OK, inboxStubs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const REASONING =
  "## Zusammenfassung\nKotlin ist dein Alltag.\n\n## Stärken & Übereinstimmung\n- Kotlin\n- Kafka\n\n## Lücken & Herausforderungen\n- Go";

function server(): InboxServer {
  return {
    new: [
      buildListItem({ id: "job-1", title: "Senior Kotlin Engineer", company: "N26", reasoning: REASONING }),
      buildListItem({ id: "job-2", title: "Backend Engineer (Java)", company: "Personio" }),
    ],
    below: [],
    dismissed: [],
    due: [],
  };
}

function open(params = "") {
  navigation.params = new URLSearchParams(params);
  const patch = () => jsonResponse(HTTP_OK, { status: "updated" });
  stubRoutes(inboxStubs(server(), { "PATCH /jobs/job-1": patch }));
  renderWithProviders(<InboxPage />);
  return screen.findByRole("complementary", { name: "Vorschau" });
}

beforeEach(() => {
  navigation.replace.mockReset();
  installFakeMatchMedia(true);
});

describe("preview pane from 1200 px", () => {
  it("shows the first match beside the list", async () => {
    const preview = await open();
    expect(await within(preview).findByRole("heading", { level: 2, name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "Passt 2" })).toBeInTheDocument();
    expect(within(preview).getByRole("link", { name: "Ganze Seite öffnen" })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByRole("link", { name: "Senior Kotlin Engineer", current: "true" })).toBeInTheDocument();
  });

  it("selects a row in the URL instead of leaving the page", async () => {
    await open();
    await userEvent.click(await screen.findByRole("link", { name: "Backend Engineer (Java)" }));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?job=job-2", { scroll: false });
  });

  it("shows the job named in the URL", async () => {
    const preview = await open("job=job-2");
    expect(await within(preview).findByRole("heading", { level: 2, name: "Backend Engineer (Java)" })).toBeInTheDocument();
  });

  it("falls back to the first row for a job that is gone", async () => {
    const preview = await open("job=gone");
    expect(await within(preview).findByRole("heading", { level: 2, name: "Senior Kotlin Engineer" })).toBeInTheDocument();
  });

  it("hands the selection to the next row after sorting out the shown one", async () => {
    const preview = await open("job=job-1");
    await userEvent.click(await within(preview).findByRole("button", { name: "Aussortieren" }));
    expect(navigation.replace).toHaveBeenCalledWith("/inbox?job=job-2", { scroll: false });
  });

  it("has no preview below 1200 px; rows stay links to the job page", async () => {
    installFakeMatchMedia(false);
    stubRoutes(inboxStubs(server()));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.queryByRole("complementary", { name: "Vorschau" })).not.toBeInTheDocument();
  });
});
```

In `inboxPage.test.tsx` and `triage.test.tsx`, add `installFakeMatchMedia(false);` to the existing `beforeEach` (import from `../../support/fakeMatchMedia`): jsdom has no `matchMedia`, and these tests describe the list without the pane.

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib/useMediaQuery.test.tsx tests/unit/features/inbox/preview.test.tsx`
Expected: FAIL, unresolved `@/lib/useMediaQuery`; no complementary "Vorschau".

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "inbox.previewLabel": "Vorschau",
  "inbox.pickOne": "Wähle links eine Stelle aus.",
  "inbox.openPage": "Ganze Seite öffnen",
```

`web/src/i18n/en.ts`:

```ts
  "inbox.previewLabel": "Preview",
  "inbox.pickOne": "Pick a job on the left.",
  "inbox.openPage": "Open full page",
```

- [ ] **Step 4: Write `useMediaQuery` and `useSelection`**

`web/src/lib/useMediaQuery.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

const serverSnapshot = () => false;

/** Viewport query as render input; false on the server, so the first paint is the narrow layout. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, serverSnapshot);
}
```

`web/src/features/inbox/useSelection.ts`:

```ts
"use client";

import type { JobListItem } from "@/api/jobList";
import { flattenPages, nextSelection, selectedItem } from "@/domain/inbox";
import { useInboxList } from "./useInboxLists";
import type { InboxUrl } from "./useInboxUrl";

export interface Selection {
  selected: JobListItem | null;
  /** Null below 1200 px: then a row click navigates to the job page (decision D2). */
  open: ((item: JobListItem) => void) | null;
  onRemoved: (id: string) => void;
}

export function useSelection(url: InboxUrl, wide: boolean): Selection {
  const list = useInboxList(url.tab);
  const rows = flattenPages(list.data?.pages);
  const selected = wide ? selectedItem(rows, url.jobId) : null;
  return {
    selected,
    open: wide ? (item) => url.select(item.id) : null,
    // Only the shown row hands its place to a neighbour; removing another row keeps the selection.
    onRemoved: (id) => {
      if (selected?.id === id) url.select(nextSelection(rows, id));
    },
  };
}
```

- [ ] **Step 5: Export the reused job pieces**

In `web/src/features/job/fit/FitTab.tsx` change `function FitColumns` to `export function FitColumns`. In `web/src/features/job/JobHeader.tsx` change `function ScoreBox` to `export function ScoreBox`. No other change.

- [ ] **Step 6: Write `InboxPreview.tsx`**

```tsx
"use client";

import { Archive, Bookmark, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { jobPath } from "@/api/jobs";
import { hostOf, safeHttpUrl } from "@/domain/links";
import { parseFitReasoning } from "@/domain/reasoning";
import { ScoreBox } from "@/features/job/JobHeader";
import { FitColumns } from "@/features/job/fit/FitTab";
import { formatDate } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { InlineText, Markdown } from "@/ui/Markdown";
import type { Triage } from "./useTriage";

const PREVIEW_TITLE_ID = "inbox-preview-title";

export interface InboxPreviewProps {
  item: JobListItem;
  tab: InboxTab;
  triage: Triage;
}

/** Usability "Eingang" layout: fit summary, Passt/Lücken, posting link, sticky action pair. */
export function InboxPreview({ item, tab, triage }: InboxPreviewProps) {
  const { t } = useI18n();
  return (
    <article className="ip" aria-labelledby={PREVIEW_TITLE_ID}>
      <header className="ip-head">
        <div className="ip-headline">
          <h2 className="ip-title" id={PREVIEW_TITLE_ID}>
            {item.title ?? t("job.untitled")}
          </h2>
          <p className="jd-meta">{item.company ?? t("job.unknownCompany")}</p>
          <PreviewMeta item={item} />
          <ArchiveNote tab={tab} />
        </div>
        <ScoreBox score={item.match_score} recede={false} />
      </header>
      <PreviewFit reasoning={item.reasoning} />
      <div className="ip-actions">
        <PreviewActions item={item} tab={tab} triage={triage} />
      </div>
    </article>
  );
}

function PreviewMeta({ item }: { item: JobListItem }) {
  const { t, language } = useI18n();
  const posting = safeHttpUrl(item.url);
  const host = hostOf(posting);
  return (
    <p className="jd-meta jd-meta-sub">
      {item.created_at ? <span>{t("job.foundOn", { date: formatDate(item.created_at, language) })}</span> : null}
      {host ? <span>{t("job.via", { host })}</span> : null}
      {posting ? (
        <a className="link" href={posting} target="_blank" rel="noopener noreferrer">
          {t("job.posting")}
          <Icon icon={ExternalLink} />
        </a>
      ) : null}
    </p>
  );
}

function ArchiveNote({ tab }: { tab: InboxTab }) {
  const { t } = useI18n();
  if (tab === "new") return null;
  return <p className="jd-meta jd-meta-sub">{t(tab === "below" ? "job.archivedThreshold" : "job.archivedUser")}</p>;
}

function PreviewFit({ reasoning }: { reasoning?: string | null }) {
  const { t } = useI18n();
  if (!reasoning) return <p className="ip-body hint">{t("job.unscored")}</p>;
  const fit = parseFitReasoning(reasoning);
  // Unknown headings: show the AI text as it is rather than guessing sections (as the Passung tab).
  if (!fit) {
    return (
      <div className="ip-body">
        <Markdown source={reasoning} />
      </div>
    );
  }
  return (
    <div className="ip-body">
      {fit.summary ? (
        <p className="fit-summary">
          <InlineText text={fit.summary} />
        </p>
      ) : null}
      <FitColumns fit={fit} />
    </div>
  );
}

function PreviewActions({ item, tab, triage }: InboxPreviewProps) {
  const { t } = useI18n();
  const page = (
    <Link className="btn btn-ghost" href={jobPath(item.id)}>
      {t("inbox.openPage")}
    </Link>
  );
  if (tab !== "new") {
    return (
      <>
        <Button icon={RotateCcw} busy={triage.busyId === item.id} onClick={() => triage.restore(item)}>
          {t("next.restoreAction")}
        </Button>
        {page}
      </>
    );
  }
  return (
    <>
      <Button variant="primary" icon={Bookmark} onClick={() => triage.shortlist(item)}>
        {t("next.shortlist")}
      </Button>
      <Button icon={Archive} onClick={() => triage.dismiss(item)}>
        {t("next.dismiss")}
      </Button>
      {page}
    </>
  );
}
```

- [ ] **Step 7: Put the pane into the page**

Replace `web/src/features/inbox/InboxPage.tsx` with:

```tsx
"use client";

import type { InboxTab, JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cx } from "@/ui/cx";
import { InboxListColumn } from "./InboxListColumn";
import { InboxPreview } from "./InboxPreview";
import { InboxRow } from "./InboxRow";
import { RowActions } from "./RowActions";
import { useInboxUrl, type InboxUrl } from "./useInboxUrl";
import { useSelection, type Selection } from "./useSelection";
import { useTriage, type Triage } from "./useTriage";

/** Decision D2: from 1200 px the preview pane sits beside the list; below, rows open the job page. */
export const WIDE_INBOX_QUERY = "(min-width: 1200px)";

export function InboxPage() {
  const url = useInboxUrl();
  const wide = useMediaQuery(WIDE_INBOX_QUERY);
  const selection = useSelection(url, wide);
  const triage = useTriage(url.tab, selection.onRemoved);
  return (
    <div className={cx("inbox", wide && "has-preview")}>
      <InboxListColumn
        url={url}
        renderRow={(item) => <Row item={item} url={url} selection={selection} triage={triage} />}
      />
      {wide ? <PreviewColumn selected={selection.selected} tab={url.tab} triage={triage} /> : null}
    </div>
  );
}

interface RowProps {
  item: JobListItem;
  url: InboxUrl;
  selection: Selection;
  triage: Triage;
}

function Row({ item, url, selection, triage }: RowProps) {
  const { open } = selection;
  return (
    <InboxRow
      item={item}
      selected={item.id === selection.selected?.id}
      onOpen={
        open
          ? (event) => {
              event.preventDefault();
              open(item);
            }
          : undefined
      }
      actions={<RowActions item={item} tab={url.tab} triage={triage} />}
    />
  );
}

interface PreviewColumnProps {
  selected: JobListItem | null;
  tab: InboxTab;
  triage: Triage;
}

function PreviewColumn({ selected, tab, triage }: PreviewColumnProps) {
  const { t } = useI18n();
  return (
    <aside className="inbox-detail" aria-label={t("inbox.previewLabel")}>
      {selected ? (
        <InboxPreview item={selected} tab={tab} triage={triage} />
      ) : (
        <div className="detail-empty">{t("inbox.pickOne")}</div>
      )}
    </aside>
  );
}
```

- [ ] **Step 8: Add the pane CSS**

Append inside the `@layer components` block of `web/src/features/inbox/inbox.css` (before the mobile media query):

```css
  .inbox.has-preview {
    display: grid;
    grid-template-columns: minmax(320px, var(--list-w)) minmax(0, 1fr);
    align-items: start;
  }
  .has-preview .inbox-list {
    max-width: none;
    margin: 0;
    min-height: 100dvh;
    border-right: 1px solid var(--line-strong);
  }
  /* The pane stays in view while the list scrolls with the page. */
  .inbox-detail {
    position: sticky;
    top: 0;
    max-height: 100dvh;
    overflow-y: auto;
    min-width: 0;
  }
  .ip {
    max-width: 820px;
    padding: 30px 40px 0;
  }
  .ip-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px 24px;
    align-items: start;
    border-top: var(--rule-w) solid var(--rule);
    padding-top: 18px;
  }
  .ip-title {
    font: 700 clamp(26px, 2.6vw, 38px) / 1.05 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }
  .ip-body {
    margin-top: 24px;
  }
  .ip-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 24px;
    padding: 14px 0 20px;
    border-top: 1px solid var(--line);
    background: var(--bg);
  }
  .detail-empty {
    min-height: 60dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--text-2);
    font-size: var(--fs-13);
  }
```

- [ ] **Step 9: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib tests/unit/features`
Expected: PASS (preview, triage, inboxPage and all job tests; the two exports change no behaviour).

- [ ] **Step 10: Write the e2e spec**

`web/tests/e2e/inboxPreview.spec.ts`:

```ts
import type { JobDetailBody } from "../../src/api/jobs";
import { COLOR_SCHEMES, VIEWPORTS } from "./support/constants";
import { inboxRoutes, listRoutes, NEW_ITEMS, NOW_ISO } from "./support/inboxFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const MEDIUM = { width: 1100, height: 900 };
const JOB: JobDetailBody = { id: "job-1", title: "Senior Kotlin Engineer", company: "N26", status: "OPEN", match_score: 86 };
const JOB_ROUTES = {
  "GET /jobs/job-1": { body: JOB },
  "GET /jobs/job-1/history": { body: [] },
  "GET /jobs/job-1/documents": { body: [] },
  "GET /profile/documents": { body: [] },
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const scheme of COLOR_SCHEMES) {
  test(`the preview pane shows the first match at 1440px in ${scheme} mode`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes());
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/inbox");
    const preview = page.getByRole("complementary", { name: "Vorschau" });
    await expect(preview.getByRole("heading", { level: 2, name: "Senior Kotlin Engineer" })).toBeVisible();
    await expect(preview.getByRole("heading", { name: /Passt/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-preview-1440-${scheme}`);
  });
}

test("clicking a row selects it in the URL", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await page.getByRole("link", { name: "Backend Engineer (Java)" }).click();
  await expect(page).toHaveURL(/\/inbox\?job=job-2$/);
  await expect(page.getByRole("complementary", { name: "Vorschau" }).getByRole("heading", { level: 2 })).toHaveText(
    "Backend Engineer (Java)",
  );
});

test("a stale deep link falls back to the first row", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox?job=gone");
  await expect(page.getByRole("complementary", { name: "Vorschau" }).getByRole("heading", { level: 2 })).toHaveText(
    "Senior Kotlin Engineer",
  );
});

test("sorting out the shown job moves the preview to the next one", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-1": { body: { status: "updated" } } });
  await mockApi(routes);
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox?job=job-1");
  setRoutes(routes, listRoutes({ new: NEW_ITEMS.slice(1) }));
  await page.getByRole("complementary", { name: "Vorschau" }).getByRole("button", { name: "Aussortieren" }).click();
  await expect(page).toHaveURL(/\/inbox\?job=job-2$/);
});

test("below 1200px a row opens the job page", async ({ page, mockApi }) => {
  await mockApi({ ...inboxRoutes(), ...JOB_ROUTES });
  await page.setViewportSize(MEDIUM);
  await page.goto("/inbox");
  await expect(page.getByRole("complementary", { name: "Vorschau" })).toHaveCount(0);
  await page.getByRole("link", { name: "Senior Kotlin Engineer" }).click();
  await expect(page).toHaveURL(/\/jobs\/job-1/);
  await expect(page.getByRole("heading", { level: 1, name: "Senior Kotlin Engineer" })).toBeVisible();
});
```

- [ ] **Step 11: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green (the Task 8 screenshots at 1440 now show the pane). Copy the screenshots back.

---
### Task 11: "Anstehend" card

**Files:**
- Create: `web/src/features/inbox/DueCard.tsx`
- Modify: `web/src/features/inbox/InboxListColumn.tsx`, `web/src/features/inbox/inbox.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/inbox/dueCard.test.tsx`, `web/tests/e2e/inboxDue.spec.ts`

**Interfaces:**
- Consumes: `dueApplicationsQueryOptions` (Task 4), `dueEntries`, `DueEntry` (Task 5), `NextStep`, `useNow`, `formatDate`, `formatRelativeDays`, `jobPath`, `Notice`, `Button` (the error uses a fixed sentence `due.error`, no server text).
- Produces: `DueCard()` — renders nothing while loading and when nothing is due (D8), a region "Anstehend" with up to 3 links otherwise, an error notice with retry when the list cannot load.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/inbox/dueCard.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DueCard } from "@/features/inbox/DueCard";
import { de } from "@/i18n/de";
import { jsonResponse } from "../../support/fakeFetch";
import { inboxJobs, type InboxServer } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00Z");
const HTTP_SERVER_ERROR = 500;

function server(due: InboxServer["due"]): InboxServer {
  return { new: [], below: [], dismissed: [], due };
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => vi.useRealTimers());

describe("DueCard", () => {
  it("lists due applications, earliest first, overdue in amber", async () => {
    stubRoutes({
      "GET /jobs": inboxJobs(
        server([
          buildListItem({ id: "b", title: "Kotlin Developer", company: "Hermes", status: "INTERVIEW", interview_at: "2026-10-09T12:00:00Z" }),
          buildListItem({ id: "a", title: "Platform Engineer", company: "Otto", status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00Z" }),
          buildListItem({ id: "c", title: "Java Engineer", company: "Tchibo", status: "APPLIED", next_follow_up_at: "2026-10-30T08:00:00Z" }),
        ]),
      ),
    });
    renderWithProviders(<DueCard />);
    const card = await screen.findByRole("region", { name: "Anstehend" });
    const links = within(card).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/jobs/a", "/jobs/b"]);
    expect(links[0]).toHaveTextContent(de["next.followUp.title"]);
    expect(links[0]).toHaveTextContent("Otto · Platform Engineer");
    expect(within(card).getByText("überfällig seit 01.10.2026")).toHaveClass("t-warn");
  });

  it("stays hidden when nothing is due", async () => {
    const calls = stubRoutes({ "GET /jobs": inboxJobs(server([buildListItem({ status: "APPLIED" })])) });
    renderWithProviders(<DueCard />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByRole("region", { name: "Anstehend" })).not.toBeInTheDocument();
  });

  it("offers a retry when the list cannot load", async () => {
    stubRoutes({ "GET /jobs": jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }) });
    renderWithProviders(<DueCard />);
    expect(await screen.findByText("Anstehende Schritte konnten nicht geladen werden.")).toBeInTheDocument();
    vi.useRealTimers();
    stubRoutes({ "GET /jobs": inboxJobs(server([])) });
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() =>
      expect(screen.queryByText("Anstehende Schritte konnten nicht geladen werden.")).not.toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/inbox/dueCard.test.tsx`
Expected: FAIL, unresolved `@/features/inbox/DueCard`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "due.title": "Anstehend",
  "due.overdueSince": "überfällig seit {date}",
  "due.error": "Anstehende Schritte konnten nicht geladen werden.",
```

`web/src/i18n/en.ts`:

```ts
  "due.title": "Coming up",
  "due.overdueSince": "overdue since {date}",
  "due.error": "Upcoming steps could not be loaded.",
```

- [ ] **Step 4: Write `DueCard.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { dueApplicationsQueryOptions } from "@/api/jobList";
import { jobPath } from "@/api/jobs";
import { dueEntries, type DueEntry } from "@/domain/dueJobs";
import type { NextStep } from "@/domain/nextStep";
import { formatDate, formatRelativeDays } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { Notice } from "@/ui/Notice";

const DUE_TITLE_ID = "due-title";

/** Decision D8: up to 3 applications whose next step is due; hidden while loading and when none. */
export function DueCard() {
  const { t } = useI18n();
  const now = useNow();
  const due = useQuery(dueApplicationsQueryOptions());
  if (due.isError && !due.data) return <DueError onRetry={() => void due.refetch()} />;
  const entries = dueEntries(due.data?.items ?? [], new Date(now));
  if (entries.length === 0) return null;
  return (
    <section className="due" aria-labelledby={DUE_TITLE_ID}>
      <h2 className="sec-title-sm" id={DUE_TITLE_ID}>
        {t("due.title")}
      </h2>
      <ul className="due-list">
        {entries.map((entry) => (
          <DueRow key={entry.item.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function DueRow({ entry }: { entry: DueEntry }) {
  const { t } = useI18n();
  const when = useDueText(entry.step);
  const { item, step } = entry;
  return (
    <li className={cx("due-row", step.overdue && "is-overdue")}>
      <Link className="due-link" href={jobPath(item.id)}>
        <span className="due-what">{t(step.label)}</span>
        <span className="due-job">{[item.company, item.title].filter(Boolean).join(" · ")}</span>
      </Link>
      {/* Overdue is a warning, so amber (spec 5): crimson stays for errors. */}
      <span className={cx("due-when", step.overdue && "t-warn")}>{when}</span>
    </li>
  );
}

function useDueText(step: NextStep): string {
  const { t, language } = useI18n();
  const now = useNow();
  if (!step.due) return "";
  const iso = step.due.toISOString();
  return step.overdue
    ? t("due.overdueSince", { date: formatDate(iso, language) })
    : formatRelativeDays(iso, t, { now });
}

function DueError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="due">
      <Notice tone="error">
        {t("due.error")}{" "}
        <Button size="sm" icon={RotateCcw} onClick={onRetry}>
          {t("error.retry")}
        </Button>
      </Notice>
    </div>
  );
}
```

- [ ] **Step 5: Place the card and style it**

In `web/src/features/inbox/InboxListColumn.tsx`, import `DueCard` from `./DueCard` and render `<DueCard />` between `<InboxHeader ... />` and `<InboxTabs ... />`.

Append inside the `@layer components` block of `inbox.css` (before the media query):

```css
  .due {
    margin-top: 18px;
  }
  .due-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }
  .due-row {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 8px 0 8px 12px;
    border-left: 3px solid var(--line-strong);
  }
  .due-row + .due-row {
    margin-top: 6px;
  }
  .due-row.is-overdue {
    border-left-color: var(--warn);
  }
  .due-link {
    min-width: 0;
    color: var(--text);
    text-decoration: none;
  }
  .due-link::after {
    content: "";
    position: absolute;
    inset: 0;
  }
  .due-link:focus-visible {
    outline: none;
  }
  .due-link:focus-visible::after {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .due-what {
    display: block;
    font-weight: 600;
  }
  .due-job,
  .due-when {
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  .due-job {
    display: block;
    overflow-wrap: anywhere;
  }
  .due-when {
    white-space: nowrap;
  }
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/inbox`
Expected: PASS.

- [ ] **Step 7: Write the e2e spec**

`web/tests/e2e/inboxDue.spec.ts`:

```ts
import { SCREENSHOT_SIZES } from "./support/constants";
import { inboxRoutes, listItem, NOW_ISO } from "./support/inboxFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const DUE = [
  listItem("job-40", { title: "Platform Engineer", company: "Otto", status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00+00:00" }),
  listItem("job-41", { title: "Kotlin Developer", company: "Hermes", status: "INTERVIEW", interview_at: "2026-10-09T12:00:00+00:00" }),
  listItem("job-42", { title: "Java Engineer", company: "Tchibo", status: "OFFER", next_follow_up_at: "2026-10-30T08:00:00+00:00" }),
  listItem("job-43", { title: "Staff Engineer", company: "Zalando", status: "APPLIED", next_follow_up_at: "2026-10-02T08:00:00+00:00" }),
  listItem("job-44", { title: "Lead Developer", company: "Otto", status: "APPLIED", next_follow_up_at: "2026-10-03T08:00:00+00:00" }),
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`the due card shows the three earliest due steps at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes({ due: DUE }));
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    const card = page.getByRole("region", { name: "Anstehend" });
    await expect(card.getByRole("link")).toHaveCount(3);
    await expect(card.getByRole("link").first()).toHaveAttribute("href", "/jobs/job-40");
    await expect(card.getByText("überfällig seit 01.10.2026")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-due-${size}`);
  });
}

test("no due card without due steps", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes({ due: [DUE[2]!] }));
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anstehend" })).toHaveCount(0);
});
```

- [ ] **Step 8: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green. Copy the screenshots back.

---

### Task 12: Threshold panel in "Unter Schwellwert" (slider, ticks, preview, Übernehmen, undo)

**Files:**
- Create: `web/src/lib/useDebouncedValue.ts`, `web/src/features/inbox/threshold/useThreshold.ts`, `ThresholdPanel.tsx`, `ThresholdControl.tsx`, `ThresholdTicks.tsx`
- Modify: `web/src/features/inbox/InboxListColumn.tsx`, `web/src/features/inbox/inbox.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/lib/useDebouncedValue.test.tsx`, `web/tests/unit/features/inbox/thresholdPanel.test.tsx`, `web/tests/e2e/inboxThreshold.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`matchThresholdQueryOptions`, `thresholdDistributionQueryOptions`, `thresholdPreviewQueryOptions`, `applyThreshold`, `queryKeys.thresholdPreviewRoot`), Task 6 (`clampThreshold`, `thresholdBand`, `distributionTicks`, `countAll`, `countBelow`, `THRESHOLD_MIN`, `THRESHOLD_MAX`, `THRESHOLD_STEP`, `MAX_TICK_LEVEL`), `useToast`, `describeError`, `Button`, `Notice`.
- Produces:
  - `useDebouncedValue<T>(value: T, delayMs: number): T`.
  - `useThreshold(): ThresholdState` with `{ saved: number | undefined; value: number; changed: boolean; loadFailed: boolean; setDraft(value: number); reset(); apply(); applying: boolean }`. `apply()` sends the shown `value`; its undo re-applies the value that was saved when `apply()` was called (Review Focus 2 and 3).
  - `ThresholdPanel()`, `ThresholdControl({ value, onChange })`, `ThresholdTicks({ counts, threshold })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/lib/useDebouncedValue.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const DELAY = 300;

afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("follows the value after the delay and only with the last value", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, DELAY), {
      initialProps: { value: 60 },
    });
    rerender({ value: 65 });
    rerender({ value: 70 });
    expect(result.current).toBe(60);
    act(() => vi.advanceTimersByTime(DELAY));
    expect(result.current).toBe(70);
  });
});
```

`web/tests/unit/features/inbox/thresholdPanel.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThresholdPanel } from "@/features/inbox/threshold/ThresholdPanel";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { HTTP_OK } from "../../support/inboxRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const SCORES = [40, 55, 72, 86];
const COUNTS = Array.from({ length: 101 }, (_, score) => (SCORES.includes(score) ? 1 : 0));
const BAND_60 = "Mögliche und starke Treffer kommen in den Eingang";

const preview = (call: RecordedCall) => {
  const threshold = Number(new URL(call.url).searchParams.get("threshold"));
  return jsonResponse(HTTP_OK, { threshold, would_archive: threshold >= 70 ? 1 : 0, would_restore: 0 });
};
const saved = (call: RecordedCall) => {
  const { match_threshold } = JSON.parse(call.body ?? "{}") as { match_threshold: number };
  return jsonResponse(HTTP_OK, { status: "saved", match_threshold, archived: 1, restored: 0 });
};

function setup() {
  const calls = stubRoutes({
    "GET /settings": { language: "de", match_threshold: 60 },
    "GET /matching-preference/distribution": { counts: COUNTS },
    "GET /matching-preference/preview": preview,
    "POST /matching-preference": saved,
  });
  renderWithProviders(<ThresholdPanel />);
  return calls;
}

const posts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "POST").map((call) => JSON.parse(call.body ?? "null"));

describe("ThresholdPanel", () => {
  it("shows the saved threshold, its band and the distribution", async () => {
    setup();
    expect(await screen.findByText(BAND_60)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Schwellwert für automatisches Aussortieren" })).toHaveValue(60);
    expect(await screen.findByRole("img", { name: "Verteilung: 4 Stellen, 2 davon unter 60" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  });

  it("previews a new value", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "70" } });
    expect(await screen.findByText("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück.")).toBeInTheDocument();
    // 70 is still in the "possible" band.
    expect(screen.getByText(BAND_60)).toBeInTheDocument();
  });

  it("applies the shown value at once and undoes to the saved one", async () => {
    const calls = setup();
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
    await userEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(await screen.findByText("Schwellwert 75 übernommen: 1 ausgeblendet, 0 zurückgeholt.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(await screen.findByText("Rückgängig gemacht: Schwellwert wieder 60.")).toBeInTheDocument();
    expect(posts(calls)).toEqual([
      { match_threshold: 75, apply_to_existing: true },
      { match_threshold: 60, apply_to_existing: true },
    ]);
  });

  it("resets an unsaved change", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "80" } });
    await userEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(60);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib/useDebouncedValue.test.tsx tests/unit/features/inbox/thresholdPanel.test.tsx`
Expected: FAIL, unresolved modules.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "threshold.title": "Schwellwert",
  "threshold.intro":
    "Treffer mit einer Passung unter diesem Wert landen hier statt unter Neu. Stellen, die du zurückholst, bleiben im Eingang.",
  "threshold.label": "Schwellwert für automatisches Aussortieren",
  "threshold.valueText": "{value}: {band}",
  "threshold.band.all": "Alle Stellen kommen in den Eingang",
  "threshold.band.weak": "Auch schwache Treffer kommen in den Eingang",
  "threshold.band.possible": "Mögliche und starke Treffer kommen in den Eingang",
  "threshold.band.strong": "Nur starke Treffer kommen in den Eingang",
  "threshold.scale.all": "0 · alles",
  "threshold.scale.possible": "60 Möglich",
  "threshold.scale.strong": "80 Stark",
  "threshold.scale.max": "100",
  "threshold.ticksLabel": "Verteilung: {total} Stellen, {below} davon unter {value}",
  "threshold.ticksError": "Die Verteilung konnte nicht geladen werden.",
  "threshold.current": "Gespeichert: {value}. Gilt für neue Läufe und für die Treffer im Eingang.",
  "threshold.previewLoading": "Wird berechnet …",
  "threshold.preview": "Bei {value}: {archive} Treffer würden ausgeblendet, {restore} kämen zurück.",
  "threshold.apply": "Übernehmen",
  "threshold.reset": "Zurücksetzen",
  "threshold.applied": "Schwellwert {value} übernommen: {archived} ausgeblendet, {restored} zurückgeholt.",
  "threshold.undone": "Rückgängig gemacht: Schwellwert wieder {value}.",
  "threshold.loadError": "Der Schwellwert konnte nicht geladen werden.",
```

`web/src/i18n/en.ts`:

```ts
  "threshold.title": "Threshold",
  "threshold.intro":
    "Matches scoring below this value land here instead of under New. Jobs you bring back stay in the inbox.",
  "threshold.label": "Threshold for automatic sorting out",
  "threshold.valueText": "{value}: {band}",
  "threshold.band.all": "Every job reaches the inbox",
  "threshold.band.weak": "Weak matches reach the inbox too",
  "threshold.band.possible": "Possible and strong matches reach the inbox",
  "threshold.band.strong": "Only strong matches reach the inbox",
  "threshold.scale.all": "0 · everything",
  "threshold.scale.possible": "60 Possible",
  "threshold.scale.strong": "80 Strong",
  "threshold.scale.max": "100",
  "threshold.ticksLabel": "Distribution: {total} jobs, {below} of them below {value}",
  "threshold.ticksError": "The distribution could not be loaded.",
  "threshold.current": "Saved: {value}. Applies to new runs and to the matches in the inbox.",
  "threshold.previewLoading": "Calculating …",
  "threshold.preview": "At {value}: {archive} matches would be hidden, {restore} would come back.",
  "threshold.apply": "Apply",
  "threshold.reset": "Reset",
  "threshold.applied": "Threshold {value} applied: {archived} hidden, {restored} brought back.",
  "threshold.undone": "Undone: threshold back to {value}.",
  "threshold.loadError": "The threshold could not be loaded.",
```

- [ ] **Step 4: Write `useDebouncedValue` and `useThreshold`**

`web/src/lib/useDebouncedValue.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** The value once it stopped changing for delayMs (e.g. a slider before a preview request). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    // setState runs in the timer callback, not in the effect body.
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

`web/src/features/inbox/threshold/useThreshold.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { applyThreshold, matchThresholdQueryOptions } from "@/api/threshold";
import { clampThreshold, THRESHOLD_MIN } from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

export interface ThresholdState {
  saved: number | undefined;
  value: number;
  changed: boolean;
  loadFailed: boolean;
  setDraft: (value: number) => void;
  reset: () => void;
  apply: () => void;
  applying: boolean;
}

interface ApplyInput {
  value: number;
  /** Saved before this apply; the undo goes back to it (Review Focus 3). */
  previous: number;
}

function refreshAfterThreshold(queryClient: QueryClient): void {
  const keys = [
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.matchThreshold,
    queryKeys.thresholdDistribution,
    queryKeys.thresholdPreviewRoot,
  ];
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

function useUndoThreshold(): (previous: number) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return (previous) => {
    const undone = () => {
      refreshAfterThreshold(queryClient);
      toast.show({ message: t("threshold.undone", { value: previous }) });
    };
    const failed = (error: unknown) => toast.show({ tone: "error", message: describeError(error, t) });
    void applyThreshold(previous).then(undone, failed);
  };
}

function useApplyThreshold(onApplied: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const undo = useUndoThreshold();
  return useMutation({
    mutationFn: ({ value }: ApplyInput) => applyThreshold(value),
    onSuccess: (result, { previous }) => {
      onApplied();
      refreshAfterThreshold(queryClient);
      const message = t("threshold.applied", { value: result.match_threshold, archived: result.archived, restored: result.restored });
      toast.show({ message, action: { label: t("phase.undo"), onAction: () => undo(previous) } });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** Decision D5: draft on screen, saved value from GET /settings, apply with the shown value. */
export function useThreshold(): ThresholdState {
  const saved = useQuery(matchThresholdQueryOptions());
  const [draft, setDraft] = useState<number | null>(null);
  const apply = useApplyThreshold(() => setDraft(null));
  const previous = saved.data ?? THRESHOLD_MIN;
  const value = draft ?? previous;
  return {
    saved: saved.data,
    value,
    changed: saved.data !== undefined && value !== saved.data,
    loadFailed: saved.isError,
    setDraft: (next) => setDraft(clampThreshold(next)),
    reset: () => setDraft(null),
    apply: () => apply.mutate({ value, previous }),
    applying: apply.isPending,
  };
}
```

- [ ] **Step 5: Write the control, the ticks and the panel**

`web/src/features/inbox/threshold/ThresholdControl.tsx`:

```tsx
"use client";

import type { MessageKey } from "@/i18n/de";
import { thresholdBand, THRESHOLD_MAX, THRESHOLD_MIN, THRESHOLD_STEP, type ThresholdBand } from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";

export const BAND_TEXT: Readonly<Record<ThresholdBand, MessageKey>> = {
  all: "threshold.band.all",
  weak: "threshold.band.weak",
  possible: "threshold.band.possible",
  strong: "threshold.band.strong",
};

const NUMBER_ID = "thr-number";

/** Slider and number field share one value; the numeral above repeats it for sighted users only. */
export function ThresholdControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useI18n();
  const band = t(BAND_TEXT[thresholdBand(value)]);
  const bounds = { min: THRESHOLD_MIN, max: THRESHOLD_MAX };
  return (
    <>
      <label className="label" htmlFor={NUMBER_ID}>
        {t("threshold.label")}
      </label>
      <div className="thr-control">
        <input
          type="range"
          {...bounds}
          step={THRESHOLD_STEP}
          value={value}
          aria-label={t("threshold.label")}
          aria-valuetext={t("threshold.valueText", { value, band })}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          className="input"
          id={NUMBER_ID}
          type="number"
          inputMode="numeric"
          {...bounds}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </>
  );
}
```

`web/src/features/inbox/threshold/ThresholdTicks.tsx`:

```tsx
"use client";

import { SCORE_BUCKETS } from "@/api/threshold";
import { countAll, countBelow, distributionTicks, MAX_TICK_LEVEL } from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";

const TICK_HEIGHT = 24;
const LEVEL_HEIGHT = TICK_HEIGHT / MAX_TICK_LEVEL;
const TICK_WIDTH = 0.6;
const LINE_WIDTH = 0.5;

/** One tick per score with jobs (usability tick/barcode device); jobs below the threshold recede. */
export function ThresholdTicks({ counts, threshold }: { counts: readonly number[]; threshold: number }) {
  const { t } = useI18n();
  const label = t("threshold.ticksLabel", { total: countAll(counts), below: countBelow(counts, threshold), value: threshold });
  return (
    <svg className="thr-ticks" viewBox={`0 0 ${SCORE_BUCKETS} ${TICK_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {distributionTicks(counts).map((tick) => (
        <rect
          key={tick.score}
          className={cx("thr-tick", tick.score < threshold && "below")}
          x={tick.score}
          y={TICK_HEIGHT - tick.level * LEVEL_HEIGHT}
          width={TICK_WIDTH}
          height={tick.level * LEVEL_HEIGHT}
        />
      ))}
      <rect className="thr-line" x={threshold} y={0} width={LINE_WIDTH} height={TICK_HEIGHT} />
    </svg>
  );
}
```

`web/src/features/inbox/threshold/ThresholdPanel.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { thresholdDistributionQueryOptions, thresholdPreviewQueryOptions } from "@/api/threshold";
import { thresholdBand, THRESHOLD_MIN } from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { BAND_TEXT, ThresholdControl } from "./ThresholdControl";
import { ThresholdTicks } from "./ThresholdTicks";
import { useThreshold, type ThresholdState } from "./useThreshold";

const TITLE_ID = "thr-title";
const PREVIEW_DEBOUNCE_MS = 300;

/** Spec 4.3 #2: the threshold lives in Eingang › Unter Schwellwert, with preview, apply and undo. */
export function ThresholdPanel() {
  const { t } = useI18n();
  const threshold = useThreshold();
  if (threshold.saved === undefined) {
    if (threshold.loadFailed) return <Notice tone="error">{t("threshold.loadError")}</Notice>;
    return <span className="skeleton-line w-1/2" />;
  }
  return (
    <section className="threshold-panel" aria-labelledby={TITLE_ID}>
      <h2 className="sec-title-sm" id={TITLE_ID}>
        {t("threshold.title")}
      </h2>
      <p className="hint">{t("threshold.intro")}</p>
      <ThresholdHead value={threshold.value} />
      <ThresholdControl value={threshold.value} onChange={threshold.setDraft} />
      <TicksSlot threshold={threshold.value} />
      <ScaleLabels />
      <PreviewLine threshold={threshold} />
      <ApplyRow threshold={threshold} />
    </section>
  );
}

function ThresholdHead({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <div className="thr-head" aria-hidden="true">
      <span className="thr-big">{value}</span>
      <span className="thr-band">{t(BAND_TEXT[thresholdBand(value)])}</span>
    </div>
  );
}

function TicksSlot({ threshold }: { threshold: number }) {
  const { t } = useI18n();
  const distribution = useQuery(thresholdDistributionQueryOptions());
  if (distribution.data) return <ThresholdTicks counts={distribution.data} threshold={threshold} />;
  if (distribution.isError) return <p className="hint">{t("threshold.ticksError")}</p>;
  return <div className="thr-ticks" aria-hidden="true" />;
}

function ScaleLabels() {
  const { t } = useI18n();
  return (
    <div className="thr-scale" aria-hidden="true">
      <span>{t("threshold.scale.all")}</span>
      <span>{t("threshold.scale.possible")}</span>
      <span>{t("threshold.scale.strong")}</span>
      <span>{t("threshold.scale.max")}</span>
    </div>
  );
}

function PreviewLine({ threshold }: { threshold: ThresholdState }) {
  const { t } = useI18n();
  const debounced = useDebouncedValue(threshold.value, PREVIEW_DEBOUNCE_MS);
  const settled = debounced === threshold.value;
  const preview = useQuery({ ...thresholdPreviewQueryOptions(debounced), enabled: threshold.changed && settled });
  if (!threshold.changed) return <p className="hint">{t("threshold.current", { value: threshold.saved ?? THRESHOLD_MIN })}</p>;
  if (preview.isError) return <p className="hint">{describeError(preview.error, t)}</p>;
  if (!settled || !preview.data) return <p className="hint">{t("threshold.previewLoading")}</p>;
  const counts = { value: preview.data.threshold, archive: preview.data.would_archive, restore: preview.data.would_restore };
  return <p className="hint">{t("threshold.preview", counts)}</p>;
}

function ApplyRow({ threshold }: { threshold: ThresholdState }) {
  const { t } = useI18n();
  return (
    <div className="row thr-actions">
      {/* Applies the value on screen, even while its preview is still loading (Review Focus 2). */}
      <Button variant="primary" disabled={!threshold.changed} busy={threshold.applying} onClick={threshold.apply}>
        {t("threshold.apply")}
      </Button>
      {threshold.changed ? (
        <Button variant="ghost" onClick={threshold.reset}>
          {t("threshold.reset")}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Show the panel in its tab and style it**

In `web/src/features/inbox/InboxListColumn.tsx`, import `ThresholdPanel` from `./threshold/ThresholdPanel` and render it inside the `TabPanel`, before `InboxList`, only for that tab:

```tsx
      <TabPanel idPrefix={INBOX_TABS_ID} selected={url.tab}>
        {url.tab === "below" ? <ThresholdPanel /> : null}
        <InboxList tab={url.tab} renderRow={renderRow} onShowBelow={showBelow} />
      </TabPanel>
```

Append inside the `@layer components` block of `inbox.css` (before the media query), and add `.threshold-panel { padding: 18px 16px; }` inside the mobile media query:

```css
  /* Ported from the prototype's .threshold block; numeral, slider and line in ink (usability #16). */
  .threshold-panel {
    padding: 20px 24px;
    border-bottom: 1px solid var(--line);
  }
  .thr-head {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    margin: 12px 0 10px;
  }
  .thr-big {
    font: 760 72px / 0.8 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.06em;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .thr-band {
    font-size: var(--fs-13);
    color: var(--text-2);
    padding-bottom: 2px;
  }
  .thr-control {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .thr-control input[type="range"] {
    flex: 1;
    min-width: 0;
    accent-color: var(--text);
  }
  .thr-control .input {
    width: 76px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .thr-ticks {
    display: block;
    width: 100%;
    height: 24px;
    margin-top: 10px;
  }
  .thr-tick {
    fill: var(--text);
  }
  .thr-tick.below {
    fill: var(--text-3);
  }
  .thr-line {
    fill: var(--text);
  }
  .thr-scale {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: var(--fs-12);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .thr-actions {
    margin-top: 12px;
  }
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/lib tests/unit/features/inbox`
Expected: PASS. (The inbox tests that open "Unter Schwellwert" now also load the panel; `inboxStubs` answers `GET /settings` and the distribution since Task 8.)

- [ ] **Step 8: Write the e2e spec**

`web/tests/e2e/inboxThreshold.spec.ts`:

```ts
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { BELOW_ITEMS, inboxRoutes, NOW_ISO } from "./support/inboxFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const PREVIEW_75 = { body: { threshold: 75, would_archive: 2, would_restore: 0 } };
const APPLIED = (value: number) => ({ body: { status: "saved", match_threshold: value, archived: 2, restored: 0 } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the threshold panel renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(inboxRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox?tab=unter");
      await expect(page.getByRole("heading", { level: 2, name: "Schwellwert" })).toBeVisible();
      await expect(page.getByRole("img", { name: "Verteilung: 5 Stellen, 2 davon unter 60" })).toBeVisible();
      await expect(page.getByRole("link", { name: BELOW_ITEMS[0]!.title ?? "" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `inbox-threshold-${size}-${scheme}`);
    });
  }
}

test("previews, applies and undoes a threshold", async ({ page, mockApi }) => {
  const routes = inboxRoutes(
    {},
    {
      "GET /matching-preference/preview?threshold=75": PREVIEW_75,
      "POST /matching-preference": APPLIED(75),
    },
  );
  const log = await mockApi(routes);
  await page.goto("/inbox?tab=unter");
  await page.getByRole("spinbutton", { name: "Schwellwert für automatisches Aussortieren" }).fill("75");
  await expect(page.getByText("Bei 75: 2 Treffer würden ausgeblendet, 0 kämen zurück.")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText("Schwellwert 75 übernommen: 2 ausgeblendet, 0 zurückgeholt.")).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht: Schwellwert wieder 60.")).toBeVisible();
  const posts = log.calls.filter((call) => call.key === "POST /matching-preference").map((call) => call.body);
  expect(posts).toEqual([
    { match_threshold: 75, apply_to_existing: true },
    { match_threshold: 60, apply_to_existing: true },
  ]);
});
```

(The undo answers with the same mocked body as the apply; the toast text comes from the value the client sent, so "wieder 60" is asserted correctly. Typing "75" into the number field passes through 7 and 75; only 75 survives the debounce, so only `?threshold=75` is requested. If a `?threshold=7` request appears in `log.unexpected`, the debounce is broken.)

- [ ] **Step 9: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green. Copy the screenshots back.

---

### Task 13: Import per URL (drawer, live step, stalled state, outcome toast)

**Files:**
- Create: `web/src/features/inbox/import/importUrl.ts`, `useImportJob.ts`, `ImportButton.tsx`, `ImportForm.tsx`, `ImportProgress.tsx`
- Modify: `web/src/features/inbox/InboxHeader.tsx` (render the button), `web/src/features/shell/ActivityPanel.tsx` (export `STEP_LABEL`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/inbox/importUrl.test.ts`, `web/tests/unit/features/inbox/importDrawer.test.tsx`, `web/tests/e2e/inboxImport.spec.ts`

**Interfaces:**
- Consumes: `importJobByUrl` (Task 4), `setupStatusQueryOptions` (Task 4), `safeHttpUrl` (Task 5), `useImports`, `markImportStarted`, `isImportStalled`, `ImportEntry` (Task 7), `useActivity` (`realtime/useActivity.ts`), `STEP_LABEL` (`features/shell/ActivityPanel.tsx`), `Drawer` (variant `narrow`), `PanelHeader`, `TextField`, `Button`, `Notice`, `Icon`, `useNow`, `describeError`.
- Produces: `parseImportUrl(text): string | null`, `IMPORT_ERRORS: ErrorMessageOverrides`, `useImportJob()` (mutation; `onSuccess` tracks the crawl), `ImportButton()` (masthead icon button plus drawer), `ImportForm({ onStarted })`, `ImportProgress({ crawlId, entry, onRetry })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/inbox/importUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseImportUrl } from "@/features/inbox/import/importUrl";

describe("parseImportUrl", () => {
  it("accepts a complete http(s) link and trims it", () => {
    expect(parseImportUrl("  https://karriere.example.de/jobs/1 ")).toBe("https://karriere.example.de/jobs/1");
  });

  it("refuses links without scheme, host dot or with another scheme", () => {
    expect(["karriere.example.de/job", "https://localhost/x", "javascript:alert(1)", "", "https://a b.de"].map(parseImportUrl)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
```

`web/tests/unit/features/inbox/importDrawer.test.tsx`:

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { STALL_AFTER_MS } from "@/domain/pendingTasks";
import { ImportButton } from "@/features/inbox/import/ImportButton";
import { EMPTY_IMPORTS, trackImport } from "@/realtime/imports";
import { SETUP_DONE } from "../../support/inboxRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

const URL_OK = "https://karriere.example.de/jobs/1";
const STARTED = { status: "Started", job_id: "crawl-9" };

function setup(routes: RouteTable = {}) {
  const calls = stubRoutes({
    "GET /setup-status": SETUP_DONE,
    "GET /scraper/crawl-status": { jobs: [] },
    "POST /scraper/import-job": STARTED,
    ...routes,
  });
  return { calls, ...renderWithProviders(<ImportButton />) };
}

async function submit(url: string) {
  await userEvent.click(screen.getByRole("button", { name: "Einzelne Stelle per URL importieren" }));
  await userEvent.type(screen.getByLabelText("Link zur Stellenanzeige"), url);
  await userEvent.click(screen.getByRole("button", { name: "Importieren und bewerten" }));
}

describe("import drawer", () => {
  it("checks the link before sending it", async () => {
    const { calls } = setup();
    await submit("karriere.example/job");
    expect(screen.getByText("Bitte einen vollständigen Link angeben, der mit https:// beginnt.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("starts the import and closes when the server reports the end", async () => {
    const { calls, queryClient } = setup();
    await submit(URL_OK);
    expect(await screen.findByText("Anzeige wird gelesen …")).toBeInTheDocument();
    const post = calls.find((call) => call.method === "POST");
    expect(JSON.parse(post?.body ?? "null")).toEqual({ url: URL_OK });
    act(() => queryClient.setQueryData(queryKeys.imports, EMPTY_IMPORTS));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says when the import could not start, without the server text", async () => {
    setup({ "POST /scraper/import-job": { status: "Error", message: "URL muss mit http(s) beginnen." } });
    await submit(URL_OK);
    expect(await screen.findByText("Der Import konnte nicht starten. Bitte prüfe den Link.")).toBeInTheDocument();
    expect(screen.queryByText(/URL muss/)).not.toBeInTheDocument();
  });

  it("offers a new attempt when the import takes unusually long", async () => {
    const { queryClient } = setup();
    await submit(URL_OK);
    await screen.findByText("Anzeige wird gelesen …");
    act(() => queryClient.setQueryData(queryKeys.imports, trackImport(EMPTY_IMPORTS, "crawl-9", Date.now() - STALL_AFTER_MS)));
    expect(await screen.findByText("Das dauert ungewöhnlich lange.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Noch einmal versuchen" }));
    expect(screen.getByLabelText("Link zur Stellenanzeige")).toBeInTheDocument();
  });

  it("warns that a job cannot be scored without a profile", async () => {
    setup({ "GET /setup-status": { ...SETUP_DONE, profile_complete: false } });
    await userEvent.click(screen.getByRole("button", { name: "Einzelne Stelle per URL importieren" }));
    expect(await screen.findByText("Ohne Profil kann die Stelle nicht bewertet werden.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profil öffnen" })).toHaveAttribute("href", "/profile");
  });
});
```

(`stubRoutes` exports `RouteTable`; `renderWithProviders` returns `queryClient`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/inbox/importUrl.test.ts tests/unit/features/inbox/importDrawer.test.tsx`
Expected: FAIL, unresolved modules.

- [ ] **Step 3: Add the dictionary keys and export the step labels**

In `web/src/features/shell/ActivityPanel.tsx`, change `const STEP_LABEL` to `export const STEP_LABEL`.

`web/src/i18n/de.ts`:

```ts
  "import.open": "Einzelne Stelle per URL importieren",
  "import.title": "Einzelne Stelle importieren",
  "import.intro":
    "Für Stellen, die du selbst gefunden hast, etwa über eine Empfehlung. Die Anzeige wird gelesen, bewertet und landet im Eingang.",
  "import.urlLabel": "Link zur Stellenanzeige",
  "import.urlPlaceholder": "https://karriere.beispiel.de/jobs/senior-kotlin-engineer",
  "import.invalidUrl": "Bitte einen vollständigen Link angeben, der mit https:// beginnt.",
  "import.submit": "Importieren und bewerten",
  "import.startFailed": "Der Import konnte nicht starten. Bitte prüfe den Link.",
  "import.reading": "Anzeige wird gelesen …",
  "import.stalled": "Das dauert ungewöhnlich lange.",
  "import.again": "Noch einmal versuchen",
  "import.profileMissing": "Ohne Profil kann die Stelle nicht bewertet werden.",
  "import.toProfile": "Profil öffnen",
```

`web/src/i18n/en.ts`:

```ts
  "import.open": "Import a single job by URL",
  "import.title": "Import a single job",
  "import.intro":
    "For jobs you found yourself, for example through a referral. The posting is read, scored and lands in the inbox.",
  "import.urlLabel": "Link to the job posting",
  "import.urlPlaceholder": "https://careers.example.com/jobs/senior-kotlin-engineer",
  "import.invalidUrl": "Please enter a complete link that starts with https://.",
  "import.submit": "Import and score",
  "import.startFailed": "The import could not start. Please check the link.",
  "import.reading": "Reading the posting …",
  "import.stalled": "This is taking unusually long.",
  "import.again": "Try again",
  "import.profileMissing": "Without a profile the job cannot be scored.",
  "import.toProfile": "Open profile",
```

- [ ] **Step 4: Write the URL check and the mutation**

`web/src/features/inbox/import/importUrl.ts`:

```ts
import type { ErrorMessageOverrides } from "@/api/describeError";
import { safeHttpUrl } from "@/domain/links";

// Prototype importRun check: scheme, a dotted host, no whitespace.
const IMPORT_URL = /^https?:\/\/[^\s/.]+\.[^\s]+$/i;

/** The scraper refuses with 200 + {status:"Error"}; its message is never shown (spec 6). */
export const IMPORT_ERRORS: ErrorMessageOverrides = { UPSTREAM_ERROR: "import.startFailed" };

export function parseImportUrl(text: string): string | null {
  const url = text.trim();
  return IMPORT_URL.test(url) && safeHttpUrl(url) ? url : null;
}
```

Check against the tests: `https://localhost/x` has no dot before the first `/` (the character class excludes `/` and `.`), so it is refused; `https://a b.de` contains whitespace.

`web/src/features/inbox/import/useImportJob.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importJobByUrl } from "@/api/imports";
import { markImportStarted } from "@/realtime/useImports";

/** Starts the import; from then on realtime events drive it (decision D7). */
export function useImportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importJobByUrl,
    // Event handler time, not render: reading the clock is fine here.
    onSuccess: (crawlId) => markImportStarted(queryClient, crawlId, Date.now()),
  });
}
```

- [ ] **Step 5: Write the button, form and progress**

`web/src/features/inbox/import/ImportButton.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setupStatusQueryOptions } from "@/api/setup";
import { useI18n } from "@/i18n/useI18n";
import { useImports } from "@/realtime/useImports";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { ImportForm } from "./ImportForm";
import { ImportProgress } from "./ImportProgress";

/** Masthead action "Per URL importieren" (spec 4.2). Every opening starts a fresh drawer (key). */
export function ImportButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const show = () => {
    setSession((count) => count + 1);
    setOpen(true);
  };
  return (
    <>
      <Button variant="ghost" size="sm" iconOnly icon={Link2} aria-label={t("import.open")} title={t("import.open")} onClick={show} />
      {open ? <ImportDrawer key={session} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [crawlId, setCrawlId] = useState<string | null>(null);
  const imports = useImports();
  const entry = crawlId ? imports[crawlId] : undefined;
  // The entry disappears when the server reports the end; the toast (RealtimeProvider) takes over.
  if (crawlId && !entry) return null;
  return (
    <Drawer open onClose={onClose} label={t("import.title")} variant="narrow">
      <div className="panel-in">
        <PanelHeader title={t("import.title")} onClose={onClose} />
        <p className="prose">{t("import.intro")}</p>
        <ProfileHint />
        {crawlId && entry ? (
          <ImportProgress crawlId={crawlId} entry={entry} onRetry={() => setCrawlId(null)} />
        ) : (
          <ImportForm onStarted={setCrawlId} />
        )}
      </div>
    </Drawer>
  );
}

/** Without a profile the analysis cannot score the job; say so before the user waits for nothing. */
function ProfileHint() {
  const { t } = useI18n();
  const setup = useQuery(setupStatusQueryOptions());
  if (!setup.data || setup.data.profile_complete) return null;
  return (
    <Notice tone="warn">
      {t("import.profileMissing")}{" "}
      <Link className="link" href="/profile">
        {t("import.toProfile")}
      </Link>
    </Notice>
  );
}
```

`web/src/features/inbox/import/ImportForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { IMPORT_ERRORS, parseImportUrl } from "./importUrl";
import { useImportJob } from "./useImportJob";

const FIELD_ID = "import-url";

function fieldError(invalid: boolean, error: unknown, t: Translate): string | undefined {
  if (invalid) return t("import.invalidUrl");
  return error ? describeError(error, t, IMPORT_ERRORS) : undefined;
}

/** Validates on submit only, like every form of the app (ui/Field). */
export function ImportForm({ onStarted }: { onStarted: (crawlId: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const start = useImportJob();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = parseImportUrl(text);
    setInvalid(url === null);
    if (url) start.mutate(url, { onSuccess: onStarted });
  };
  return (
    <form onSubmit={submit} noValidate>
      <TextField
        id={FIELD_ID}
        type="url"
        label={t("import.urlLabel")}
        placeholder={t("import.urlPlaceholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={fieldError(invalid, start.error, t)}
      />
      <div className="panel-foot">
        <Button type="submit" variant="primary" busy={start.isPending}>
          {t("import.submit")}
        </Button>
      </div>
    </form>
  );
}
```

`web/src/features/inbox/import/ImportProgress.tsx`:

```tsx
"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { STEP_LABEL } from "@/features/shell/ActivityPanel";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { isImportStalled, type ImportEntry } from "@/realtime/imports";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";

export interface ImportProgressProps {
  crawlId: string;
  entry: ImportEntry;
  onRetry: () => void;
}

/** The crawl's live step from the activity cache; "stalled" after STALL_AFTER_MS without an end. */
export function ImportProgress({ crawlId, entry, onRetry }: ImportProgressProps) {
  const { t } = useI18n();
  const now = useNow();
  const task = useActivity(true).running.find((running) => running.id === crawlId);
  if (isImportStalled(entry, now)) {
    return (
      <Notice tone="warn">
        {t("import.stalled")}{" "}
        <Button size="sm" icon={RotateCcw} onClick={onRetry}>
          {t("import.again")}
        </Button>
      </Notice>
    );
  }
  const text = task ? t(STEP_LABEL[task.step], { done: task.done, total: task.total }) : t("import.reading");
  return (
    <p className="task-line" role="status">
      <Icon icon={LoaderCircle} className="spin" />
      <span>{text}</span>
    </p>
  );
}
```

- [ ] **Step 6: Put the button into the masthead**

In `web/src/features/inbox/InboxHeader.tsx`, import `ImportButton` from `./import/ImportButton`, drop the `actions` prop from `InboxHeaderProps` and pass `actions={<ImportButton />}` to `Masthead`.

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features`
Expected: PASS. (`InboxPage` tests render the button; it fetches nothing until opened.)

- [ ] **Step 8: Write the e2e spec**

`web/tests/e2e/inboxImport.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import type { JobDetailBody } from "../../src/api/jobs";
import { SCREENSHOT_SIZES } from "./support/constants";
import { ADMIN_USER_ID } from "./support/fixtures";
import { inboxRoutes, NOW_ISO } from "./support/inboxFixtures";
import type { ApiLog } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const CRAWL = "crawl-9";
const URL_OK = "https://karriere.example.de/jobs/senior-kotlin-engineer";
const STARTED = { "POST /scraper/import-job": { body: { status: "Started", job_id: CRAWL } } };
const JOB: JobDetailBody = { id: "job-30", title: "Senior Kotlin Engineer", company: "Kühne + Nagel", status: "OPEN", match_score: 80 };
const JOB_ROUTES = {
  "GET /jobs/job-30": { body: JOB },
  "GET /jobs/job-30/history": { body: [] },
  "GET /jobs/job-30/documents": { body: [] },
  "GET /profile/documents": { body: [] },
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

async function push(log: ApiLog, event: object) {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  log.sockets[0]!.send(JSON.stringify({ user_id: ADMIN_USER_ID, ...event }));
}

async function startImport(page: Page) {
  await page.getByRole("button", { name: "Einzelne Stelle per URL importieren" }).click();
  await page.getByLabel("Link zur Stellenanzeige").fill(URL_OK);
  await page.getByRole("button", { name: "Importieren und bewerten" }).click();
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`the import drawer at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes());
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    await page.getByRole("button", { name: "Einzelne Stelle per URL importieren" }).click();
    await expect(page.getByRole("dialog", { name: "Einzelne Stelle importieren" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-import-${size}`);
  });
}

test("imports a posting, follows it live and opens it", async ({ page, mockApi }) => {
  const log = await mockApi(inboxRoutes({}, { ...STARTED, ...JOB_ROUTES }));
  await page.goto("/inbox");
  await startImport(page);
  await push(log, { type: "crawl_job_started", job_id: CRAWL, platform: URL_OK });
  await expect(page.getByRole("dialog").getByText("Startet …")).toBeVisible();
  await push(log, { type: "new_job", crawl_job_id: CRAWL, job: { id: "job-30", match_score: 80, is_archived: false } });
  await push(log, { type: "crawl_job_completed", job_id: CRAWL });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Importiert und bewertet: 80 · Stark.")).toBeVisible();
  await page.getByRole("button", { name: "Ansehen" }).click();
  await expect(page).toHaveURL(/\/jobs\/job-30/);
});

test("an existing posting is reported with a link", async ({ page, mockApi }) => {
  const log = await mockApi(inboxRoutes({}, STARTED));
  await page.goto("/inbox");
  await startImport(page);
  await push(log, { type: "job_skipped", job_id: CRAWL, existing_job_id: "job-1", jobs_skipped: 1 });
  await push(log, { type: "crawl_job_completed", job_id: CRAWL });
  await expect(page.getByText("Diese Stelle ist schon da.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ansehen" })).toBeVisible();
});

test("a posting that cannot be read is an error", async ({ page, mockApi }) => {
  const log = await mockApi(inboxRoutes({}, STARTED));
  await page.goto("/inbox");
  await startImport(page);
  await push(log, { type: "crawl_job_failed", job_id: CRAWL });
  await expect(page.getByRole("alert").getByText("Die Anzeige konnte nicht gelesen werden.")).toBeVisible();
});
```

- [ ] **Step 9: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green. Copy the screenshots back.

---

### Task 14: First-run onboarding and the "KI-Anbieter fehlt" notice

**Files:**
- Create: `web/src/domain/onboarding.ts`, `web/src/features/inbox/onboarding/Onboarding.tsx`, `web/src/features/inbox/onboarding/AiMissingNotice.tsx`
- Modify: `web/src/features/inbox/InboxPage.tsx`, `web/src/features/inbox/InboxListColumn.tsx`, `web/src/features/shell/navigation.ts`, `web/src/features/inbox/inbox.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/domain/onboarding.test.ts`, `web/tests/unit/features/inbox/onboarding.test.tsx`, `web/tests/e2e/inboxOnboarding.spec.ts`

**Interfaces:**
- Consumes: `setupStatusQueryOptions`, `SetupStatus` (Task 4), `inboxHref` (Task 5), `useCurrentUser` (`features/shell/useCurrentUser.ts`), `navNumber`, `Masthead`, `Notice`, `PageSkeleton`, `Icon`.
- Produces:
  - `domain/onboarding.ts`: `ONBOARDING_STEPS = ["profile","source","ai"] as const`, `type OnboardingStep`, `showOnboarding(status: SetupStatus | undefined, requested: boolean): boolean`, `stepDone(status, step): boolean`, `doneCount(status): number`, `currentStep(status): OnboardingStep | null`.
  - `navigation.ts`: `SOURCES_ADD_HREF = "/sources?add=1"`, `AI_SETTINGS_HREF = "/settings?section=ai"` (contracts for phases 5 and 7).
  - `Onboarding({ status, requested })`, `AiMissingNotice({ status })`; `InboxPage` switches between onboarding and the inbox (`InboxView`).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/onboarding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@/api/setup";
import { currentStep, doneCount, showOnboarding } from "@/domain/onboarding";

const NOTHING: SetupStatus = { has_source: false, ai_configured: false, profile_complete: false, has_jobs: false };
const DONE: SetupStatus = { has_source: true, ai_configured: true, profile_complete: true, has_jobs: true };

describe("showOnboarding", () => {
  it("shows on first run while a source or the AI provider is missing", () => {
    expect(showOnboarding(NOTHING, false)).toBe(true);
    expect(showOnboarding({ ...NOTHING, has_source: true }, false)).toBe(true);
    expect(showOnboarding({ ...NOTHING, has_source: true, ai_configured: true }, false)).toBe(false);
  });

  it("never hides found jobs behind the onboarding", () => {
    expect(showOnboarding({ ...NOTHING, has_jobs: true }, false)).toBe(false);
  });

  it("shows on request, but not without a status", () => {
    expect(showOnboarding(DONE, true)).toBe(true);
    expect(showOnboarding(undefined, true)).toBe(false);
  });
});

describe("steps", () => {
  it("counts done steps and names the first open one", () => {
    const status = { ...NOTHING, profile_complete: true };
    expect(doneCount(status)).toBe(1);
    expect(currentStep(status)).toBe("source");
    expect(currentStep(DONE)).toBeNull();
  });
});
```

`web/tests/unit/features/inbox/onboarding.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupStatus } from "@/api/setup";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { inboxStubs, SETUP_DONE } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const FIRST_RUN: SetupStatus = { has_source: false, ai_configured: false, profile_complete: true, has_jobs: false };
const ADMIN = { id: 1, username: "fhamann", is_admin: true };

function open(setup: unknown, user = ADMIN) {
  const server = { new: [buildListItem({ title: "Senior Kotlin Engineer" })], below: [], dismissed: [], due: [] };
  stubRoutes(inboxStubs(server, { "GET /setup-status": setup, "GET /me": user }));
  renderWithProviders(<InboxPage />);
}

beforeEach(() => {
  navigation.params = new URLSearchParams();
  installFakeMatchMedia(false);
});

describe("onboarding", () => {
  it("shows the three steps on the first run, the next one as the primary action", async () => {
    open(FIRST_RUN);
    expect(await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" })).toBeInTheDocument();
    expect(screen.getByText("Drei Schritte bis zur ersten Liste passender Stellen. 1 von 3 erledigt.")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: "Quelle hinzufügen" });
    expect(source).toHaveAttribute("href", "/sources?add=1");
    expect(source).toHaveClass("btn-primary");
    expect(screen.getByRole("link", { name: "KI-Anbieter einrichten" })).toHaveAttribute("href", "/settings?section=ai");
    expect(screen.getByText("Erledigt")).toBeInTheDocument();
  });

  it("asks a non-admin to contact the administration", async () => {
    open(FIRST_RUN, { ...ADMIN, is_admin: false });
    expect(await screen.findByText("Das richtet die Administration ein. Bitte sie darum.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "KI-Anbieter einrichten" })).not.toBeInTheDocument();
  });

  it("shows the inbox with a warning when jobs exist but no AI provider", async () => {
    open({ ...SETUP_DONE, ai_configured: false });
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(await screen.findByText("Kein KI-Anbieter eingerichtet: Neue Stellen werden nicht bewertet.")).toBeInTheDocument();
  });

  it("shows the inbox once everything is set up, with a way to the setup view", async () => {
    open(SETUP_DONE);
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ersteinrichtung ansehen" })).toHaveAttribute("href", "/inbox?view=setup");
  });

  it("opens the setup view on request, with a way back", async () => {
    navigation.params = new URLSearchParams("view=setup");
    open(SETUP_DONE);
    expect(await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
  });

  it("shows the inbox when the setup status cannot be loaded", async () => {
    open(jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/onboarding.test.ts tests/unit/features/inbox/onboarding.test.tsx`
Expected: FAIL, unresolved `@/domain/onboarding`; no "Willkommen" heading.

- [ ] **Step 3: Add the dictionary keys and the route contracts**

`web/src/i18n/de.ts`:

```ts
  "onboard.title": "Willkommen, {name}",
  "onboard.deck": "Drei Schritte bis zur ersten Liste passender Stellen. {done} von {total} erledigt.",
  "onboard.profile.title": "Profil ausfüllen",
  "onboard.profile.text": "Wunschrolle, Fähigkeiten und Lebenslauf. Daran misst die KI jede gefundene Stelle.",
  "onboard.profile.action": "Profil öffnen",
  "onboard.source.title": "Erste Quelle hinzufügen",
  "onboard.source.text":
    "Eine Suchergebnisseite auf einem Jobportal oder die Karriereseite eines Unternehmens. Beim Anlegen wählst du, ob sofort gesucht wird.",
  "onboard.source.action": "Quelle hinzufügen",
  "onboard.ai.title": "KI-Anbieter verbinden",
  "onboard.ai.text":
    "OpenRouter-Schlüssel oder eine lokale Ollama-Instanz. Ohne Anbieter kann nichts bewertet oder geschrieben werden.",
  "onboard.ai.action": "KI-Anbieter einrichten",
  "onboard.ai.askAdmin": "Das richtet die Administration ein. Bitte sie darum.",
  "onboard.done": "Erledigt",
  "onboard.foot": "Diese Ansicht erscheint, solange keine Quelle oder kein KI-Anbieter eingerichtet ist.",
  "onboard.toInbox": "Zum Eingang",
  "inbox.setupLink": "Ersteinrichtung ansehen",
  "inbox.aiMissing": "Kein KI-Anbieter eingerichtet: Neue Stellen werden nicht bewertet.",
```

`web/src/i18n/en.ts`:

```ts
  "onboard.title": "Welcome, {name}",
  "onboard.deck": "Three steps to your first list of matching jobs. {done} of {total} done.",
  "onboard.profile.title": "Fill in your profile",
  "onboard.profile.text": "Target role, skills and CV. The AI measures every job it finds against them.",
  "onboard.profile.action": "Open profile",
  "onboard.source.title": "Add a first source",
  "onboard.source.text":
    "A search result page on a job board or a company's careers page. When you add it, you choose whether to search right away.",
  "onboard.source.action": "Add source",
  "onboard.ai.title": "Connect an AI provider",
  "onboard.ai.text": "An OpenRouter key or a local Ollama instance. Without a provider nothing can be scored or written.",
  "onboard.ai.action": "Set up AI provider",
  "onboard.ai.askAdmin": "The administration sets this up. Please ask them.",
  "onboard.done": "Done",
  "onboard.foot": "This view appears while no source or no AI provider is set up.",
  "onboard.toInbox": "To the inbox",
  "inbox.setupLink": "View first-run setup",
  "inbox.aiMissing": "No AI provider set up: new jobs are not scored.",
```

In `web/src/features/shell/navigation.ts`, add next to `ACCOUNT_HREF`:

```ts
// Contracts for later phases (decision D6 of phase 3): Quellen opens its add wizard on ?add=1
// (phase 5), Einstellungen its KI section on ?section=ai (phase 7).
export const SOURCES_ADD_HREF = "/sources?add=1";
export const AI_SETTINGS_HREF = "/settings?section=ai";
```

- [ ] **Step 4: Write `domain/onboarding.ts`**

```ts
import type { SetupStatus } from "@/api/setup";

export const ONBOARDING_STEPS = ["profile", "source", "ai"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Spec 4.3 #8: the first run (no source or no AI provider, nothing found yet), or on request.
 * Without a status (request failed) the inbox shows: the setup is advisory.
 */
export function showOnboarding(status: SetupStatus | undefined, requested: boolean): boolean {
  if (!status) return false;
  if (requested) return true;
  return (!status.has_source || !status.ai_configured) && !status.has_jobs;
}

export function stepDone(status: SetupStatus, step: OnboardingStep): boolean {
  const done: Readonly<Record<OnboardingStep, boolean>> = {
    profile: status.profile_complete,
    source: status.has_source,
    ai: status.ai_configured,
  };
  return done[step];
}

export function doneCount(status: SetupStatus): number {
  return ONBOARDING_STEPS.filter((step) => stepDone(status, step)).length;
}

/** The first open step carries the one primary button (one next move, spec 5). */
export function currentStep(status: SetupStatus): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !stepDone(status, step)) ?? null;
}
```

- [ ] **Step 5: Write the onboarding view and the notice**

`web/src/features/inbox/onboarding/Onboarding.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { SetupStatus } from "@/api/setup";
import { currentStep, doneCount, ONBOARDING_STEPS, stepDone, type OnboardingStep } from "@/domain/onboarding";
import { AI_SETTINGS_HREF, navNumber, SOURCES_ADD_HREF } from "@/features/shell/navigation";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Masthead } from "@/ui/Masthead";

const PERCENT = 100;
const STEP_COPY: Readonly<Record<OnboardingStep, { title: MessageKey; text: MessageKey; action: MessageKey }>> = {
  profile: { title: "onboard.profile.title", text: "onboard.profile.text", action: "onboard.profile.action" },
  source: { title: "onboard.source.title", text: "onboard.source.text", action: "onboard.source.action" },
  ai: { title: "onboard.ai.title", text: "onboard.ai.text", action: "onboard.ai.action" },
};
const STEP_HREF: Readonly<Record<OnboardingStep, string>> = {
  profile: "/profile",
  source: SOURCES_ADD_HREF,
  ai: AI_SETTINGS_HREF,
};

/** Prototype renderOnboarding with three steps (decision D6). */
export function Onboarding({ status, requested }: { status: SetupStatus; requested: boolean }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const done = doneCount(status);
  const total = ONBOARDING_STEPS.length;
  return (
    <div className="page onboard">
      <Masthead number={navNumber("inbox")} title={t("onboard.title", { name: user.data?.username ?? "" })} deck={t("onboard.deck", { done, total })} />
      <div className="ob-progress" aria-hidden="true">
        <i style={{ width: `${(done / total) * PERCENT}%` }} />
      </div>
      <ol className="ob-list">
        {ONBOARDING_STEPS.map((step, index) => (
          <OnboardingItem key={step} step={step} number={index + 1} status={status} isAdmin={user.data?.is_admin ?? false} />
        ))}
      </ol>
      <p className="small faint ob-foot">
        {t("onboard.foot")}{" "}
        {requested ? (
          <Link className="link" href="/inbox">
            {t("onboard.toInbox")}
          </Link>
        ) : null}
      </p>
    </div>
  );
}

interface ItemProps {
  step: OnboardingStep;
  number: number;
  status: SetupStatus;
  isAdmin: boolean;
}

function OnboardingItem({ step, number, status, isAdmin }: ItemProps) {
  const { t } = useI18n();
  const done = stepDone(status, step);
  const copy = STEP_COPY[step];
  return (
    <li className={cx("ob-item", done && "done")}>
      <span className="ob-num" aria-hidden="true">
        {done ? <Icon icon={Check} /> : number}
      </span>
      <div>
        <h2 className="ob-title">{t(copy.title)}</h2>
        <p className="ob-text">{t(copy.text)}</p>
      </div>
      <div className="ob-act">
        {done ? <span className="small faint">{t("onboard.done")}</span> : <StepAction step={step} primary={currentStep(status) === step} isAdmin={isAdmin} />}
      </div>
    </li>
  );
}

function StepAction({ step, primary, isAdmin }: { step: OnboardingStep; primary: boolean; isAdmin: boolean }) {
  const { t } = useI18n();
  // Only admins can configure the AI provider (admin settings, phase 7).
  if (step === "ai" && !isAdmin) return <span className="meta">{t("onboard.ai.askAdmin")}</span>;
  return (
    <Link className={cx("btn", primary && "btn-primary")} href={STEP_HREF[step]}>
      {t(STEP_COPY[step].action)}
    </Link>
  );
}
```

(The "askAdmin" sentence carries meaning, so it uses `.meta` (13 px), not `.small` (12 px, decoration only).)

`web/src/features/inbox/onboarding/AiMissingNotice.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { SetupStatus } from "@/api/setup";
import { AI_SETTINGS_HREF } from "@/features/shell/navigation";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";

/** Jobs exist, so no onboarding; but new ones would not be scored (warning, amber). */
export function AiMissingNotice({ status }: { status: SetupStatus | undefined }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  if (!status || status.ai_configured) return null;
  return (
    <div className="inbox-notice">
      <Notice tone="warn">
        {t("inbox.aiMissing")}{" "}
        {user.data?.is_admin ? (
          <Link className="link" href={AI_SETTINGS_HREF}>
            {t("onboard.ai.action")}
          </Link>
        ) : null}
      </Notice>
    </div>
  );
}
```

- [ ] **Step 6: Switch between onboarding and inbox**

In `web/src/features/inbox/InboxPage.tsx`:

1. Rename the existing `InboxPage` function to `InboxView` with the signature `function InboxView({ url, setup }: { url: InboxUrl; setup: SetupStatus | undefined })`, remove its `useInboxUrl()` line, and pass `setup` on: `<InboxListColumn url={url} setup={setup} renderRow={...} />`.
2. Add above it:

```tsx
export function InboxPage() {
  const url = useInboxUrl();
  const setup = useQuery(setupStatusQueryOptions());
  if (setup.isPending) return <PageSkeleton />;
  if (setup.data && showOnboarding(setup.data, url.setup)) {
    return <Onboarding status={setup.data} requested={url.setup} />;
  }
  return <InboxView url={url} setup={setup.data} />;
}
```

with the imports `useQuery` (`@tanstack/react-query`), `setupStatusQueryOptions`, `SetupStatus` (`@/api/setup`), `showOnboarding` (`@/domain/onboarding`), `PageSkeleton` (`@/ui/Skeleton`), `Onboarding` (`./onboarding/Onboarding`).

In `web/src/features/inbox/InboxListColumn.tsx`, add `setup: SetupStatus | undefined` to `InboxListColumnProps`, render `<AiMissingNotice status={setup} />` right after `</div>` of `.inbox-top` (before the `TabPanel`), and after the `TabPanel`:

```tsx
      <p className="list-foot">
        <Link className="link" href={inboxHref({ tab: "new", setup: true })}>
          {t("inbox.setupLink")}
        </Link>
      </p>
```

(imports: `Link` from `next/link`, `inboxHref` from `@/domain/inbox`, `SetupStatus` from `@/api/setup`, `AiMissingNotice` from `./onboarding/AiMissingNotice`).

- [ ] **Step 7: Port the onboarding CSS**

Append inside the `@layer components` block of `inbox.css` (before the media query):

```css
  /* Prototype .onboard; the progress bar is ink, vermilion stays for the next move (usability #16). */
  .onboard {
    max-width: 760px;
  }
  .ob-progress {
    max-width: 320px;
    height: 4px;
    margin-top: -14px;
    background: var(--line);
  }
  .ob-progress > i {
    display: block;
    height: 100%;
    background: var(--text);
  }
  .ob-list {
    list-style: none;
    margin: var(--s5) 0 0;
    padding: 0;
  }
  .ob-item {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    gap: 16px;
    align-items: start;
    padding: 22px 0;
    border-top: 1px solid var(--line);
  }
  .ob-item:last-child {
    border-bottom: 1px solid var(--line);
  }
  .ob-num {
    display: flex;
    font: 300 44px / 0.85 var(--font-display);
    font-optical-sizing: auto;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    color: var(--text-3);
  }
  .ob-num .ico {
    width: 28px;
    height: 28px;
    stroke-width: 2.2;
    color: var(--text);
  }
  .ob-title {
    font: 650 20px / 1.2 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.015em;
  }
  .ob-item.done .ob-title {
    color: var(--text-2);
  }
  .ob-text {
    max-width: 54ch;
    margin-top: 4px;
    font-size: var(--fs-14);
    color: var(--text-2);
  }
  .ob-foot {
    margin-top: 18px;
  }
```

and inside the mobile media query:

```css
    .ob-item {
      grid-template-columns: 44px minmax(0, 1fr);
    }
    .ob-act {
      grid-column: 2;
    }
```

- [ ] **Step 8: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/features`
Expected: PASS (all inbox tests get `SETUP_DONE` from `inboxStubs`).

- [ ] **Step 9: Write the e2e spec**

`web/tests/e2e/inboxOnboarding.spec.ts`:

```ts
import type { SetupStatusBody } from "../../src/api/setup";
import { SCREENSHOT_SIZES } from "./support/constants";
import { SETUP_DONE } from "./support/fixtures";
import { inboxRoutes, NOW_ISO } from "./support/inboxFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const FIRST_RUN: SetupStatusBody = { has_source: false, ai_configured: false, profile_complete: false, has_jobs: false };
const setupRoute = (status: SetupStatusBody) => ({ "GET /setup-status": { body: status } });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`the first run shows the onboarding at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(inboxRoutes({ new: [] }, setupRoute(FIRST_RUN)));
    await page.setViewportSize(viewport);
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profil öffnen" })).toHaveClass(/btn-primary/);
    await expect(page.getByRole("link", { name: "Quelle hinzufügen" })).toHaveAttribute("href", "/sources?add=1");
    await expect(page.getByRole("link", { name: "KI-Anbieter einrichten" })).toHaveAttribute("href", "/settings?section=ai");
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `inbox-onboarding-${size}`);
  });
}

test("jobs but no AI provider: inbox with a warning", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes({}, setupRoute({ ...SETUP_DONE, ai_configured: false })));
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
  await expect(page.getByText("Kein KI-Anbieter eingerichtet: Neue Stellen werden nicht bewertet.")).toBeVisible();
});

test("the setup view can be opened from the inbox and left again", async ({ page, mockApi }) => {
  await mockApi(inboxRoutes());
  await page.goto("/inbox");
  await page.getByRole("link", { name: "Ersteinrichtung ansehen" }).click();
  await expect(page).toHaveURL(/\/inbox\?view=setup$/);
  await expect(page.getByText("3 von 3 erledigt", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Zum Eingang" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
});
```

- [ ] **Step 10: Run the e2e suite, format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green (the `login`, `shell` and `documentEdit` specs still land on "Eingang": `AUTHENTICATED_ROUTES` answers `GET /setup-status` with `SETUP_DONE`). Copy the screenshots back.

---
### Task 15: E2E journeys (triage and threshold green: the phase-3 exit criterion)

**Files:**
- Create: `web/tests/e2e/inboxJourneys.spec.ts`

**Interfaces:**
- Consumes: `inboxRoutes`, `listRoutes`, `listItem`, `NEW_ITEMS`, `BELOW_ITEMS`, `NOW_ISO` (Task 8), `SETUP_DONE`, `ADMIN_USER_ID` (fixtures), `setRoutes`, `ApiLog.calls` (mock), `inboxListPath` (src).
- Produces: the spec 7 journeys of this phase, each under the auto fixtures (no unmocked call, no console error): onboarding until set up, triage keep/discard/undo, threshold preview/apply/undo with the lists moving, import by URL, restore and delete from the archive tabs. The server is simulated by switching routes with `setRoutes` *before* the click whose refetch should see the new state.

- [ ] **Step 1: Write the journeys**

`web/tests/e2e/inboxJourneys.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { VIEWPORTS } from "./support/constants";
import { ADMIN_USER_ID, SETUP_DONE } from "./support/fixtures";
import { BELOW_ITEMS, inboxRoutes, listItem, listRoutes, NEW_ITEMS, NOW_ISO } from "./support/inboxFixtures";
import { setRoutes, type ApiLog } from "./support/mockApi";
import { horizontalOverflow } from "./support/page";
import { expect, test } from "./support/test";

const UPDATED = { body: { status: "updated" } };
const [KOTLIN, JAVA, HHLA] = NEW_ITEMS;
const DRAFTED_DETAIL = { body: { id: "job-1", title: "Senior Kotlin Engineer", company: "N26", status: "DRAFTED" } };
const OPEN_DETAIL = { body: { id: "job-1", title: "Senior Kotlin Engineer", company: "N26", status: "OPEN" } };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

const bodiesOf = (log: ApiLog, key: string) => log.calls.filter((call) => call.key === key).map((call) => call.body);

async function counts(page: Page, newCount: number, belowCount: number) {
  await expect(page.getByRole("tab", { name: /^Neu/ })).toContainText(String(newCount));
  await expect(page.getByRole("tab", { name: `Unter Schwellwert ${belowCount}` })).toBeVisible();
}

test("first run: onboarding until source and AI provider exist, then the inbox", async ({ page, mockApi }) => {
  const firstRun = { has_source: false, ai_configured: false, profile_complete: true, has_jobs: false };
  const routes = inboxRoutes({ new: [] }, { "GET /setup-status": { body: firstRun } });
  await mockApi(routes);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Willkommen, admin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quelle hinzufügen" })).toHaveClass(/btn-primary/);
  setRoutes(routes, { "GET /setup-status": { body: { ...SETUP_DONE, has_jobs: false } } });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Eingang" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Alles gesichtet." })).toBeVisible();
});

test("triage: keep a match, undo, sort out another, undo", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "POST /jobs/job-1/status": DRAFTED_DETAIL, "PATCH /jobs/job-2": UPDATED });
  const log = await mockApi(routes);
  await page.goto("/inbox");
  await counts(page, 3, 2);

  setRoutes(routes, listRoutes({ new: [JAVA!, HHLA!] }));
  await page.getByRole("button", { name: "Vormerken: Senior Kotlin Engineer" }).click();
  await expect(page.getByText("Vorgemerkt: N26. Weiter geht es unter Bewerbungen.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toHaveCount(0);
  setRoutes(routes, { ...listRoutes(), "POST /jobs/job-1/status": OPEN_DETAIL });
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht: N26 ist wieder unter Neu.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Senior Kotlin Engineer" })).toBeVisible();

  setRoutes(routes, listRoutes({ new: [KOTLIN!, HHLA!] }));
  await page.getByRole("button", { name: "Aussortieren: Backend Engineer (Java)" }).click();
  await expect(page.getByRole("link", { name: "Backend Engineer (Java)" })).toHaveCount(0);
  setRoutes(routes, listRoutes());
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("link", { name: "Backend Engineer (Java)" })).toBeVisible();

  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "DRAFTED" }, { to: "OPEN" }]);
  expect(bodiesOf(log, "PATCH /jobs/job-2")).toEqual([{ is_archived: true }, { is_archived: false }]);
});

test("threshold: preview, apply moves matches below, undo brings them back", async ({ page, mockApi }) => {
  const routes = inboxRoutes(
    {},
    {
      "GET /matching-preference/preview?threshold=70": { body: { threshold: 70, would_archive: 1, would_restore: 0 } },
      "POST /matching-preference": { body: { status: "saved", match_threshold: 70, archived: 1, restored: 0 } },
    },
  );
  const log = await mockApi(routes);
  await page.goto("/inbox?tab=unter");
  await page.getByRole("spinbutton", { name: "Schwellwert für automatisches Aussortieren" }).fill("70");
  await expect(page.getByText("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück.")).toBeVisible();

  const hidden = listItem("job-3", { ...HHLA!, is_archived: true, archive_reason: "THRESHOLD" });
  setRoutes(routes, { ...listRoutes({ new: [KOTLIN!, JAVA!], below: [hidden, ...BELOW_ITEMS] }), "GET /settings": { body: { language: "de", match_threshold: 70 } } });
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText("Schwellwert 70 übernommen: 1 ausgeblendet, 0 zurückgeholt.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Softwareentwickler Java" })).toBeVisible();
  await counts(page, 2, 3);

  setRoutes(routes, { ...listRoutes(), "GET /settings": { body: { language: "de", match_threshold: 60 } } });
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht: Schwellwert wieder 60.")).toBeVisible();
  await counts(page, 3, 2);
  expect(bodiesOf(log, "POST /matching-preference")).toEqual([
    { match_threshold: 70, apply_to_existing: true },
    { match_threshold: 60, apply_to_existing: true },
  ]);
});

test("import: a posting below the threshold is reported as such", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "POST /scraper/import-job": { body: { status: "Started", job_id: "crawl-9" } } });
  const log = await mockApi(routes);
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Einzelne Stelle per URL importieren" }).click();
  await page.getByLabel("Link zur Stellenanzeige").fill("https://karriere.example.de/jobs/1");
  await page.getByRole("button", { name: "Importieren und bewerten" }).click();
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  const send = (event: object) => log.sockets[0]!.send(JSON.stringify({ user_id: ADMIN_USER_ID, ...event }));
  send({ type: "new_job", crawl_job_id: "crawl-9", job: { id: "job-31", match_score: 41, is_archived: true } });
  send({ type: "crawl_job_completed", job_id: "crawl-9" });
  await expect(
    page.getByText("Importiert: 41 · Schwach, unter deinem Schwellwert. Du findest die Stelle unter „Unter Schwellwert“."),
  ).toBeVisible();
});

test("archive tabs: restore a hidden match and delete a discarded one", async ({ page, mockApi }) => {
  const routes = inboxRoutes({}, { "PATCH /jobs/job-20": UPDATED, "DELETE /jobs/job-17": { body: { status: "deleted" } } });
  await mockApi(routes);
  await page.goto("/inbox?tab=unter");
  setRoutes(routes, listRoutes({ below: BELOW_ITEMS.slice(1) }));
  await page.getByRole("button", { name: "Wiederherstellen: Fullstack-Entwickler PHP" }).click();
  await expect(page.getByText("Aroundhome ist wieder im Eingang.")).toBeVisible();
  await page.getByRole("tab", { name: /Von dir aussortiert/ }).click();
  setRoutes(routes, listRoutes({ below: BELOW_ITEMS.slice(1), dismissed: [] }));
  await page.getByRole("button", { name: "Endgültig löschen: Teamlead Java Backend" }).click();
  await page.getByRole("dialog", { name: "Endgültig löschen?" }).getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Nichts aussortiert" })).toBeVisible();
});

test("no horizontal scroll at 375px with due card, threshold and onboarding", async ({ page, mockApi }) => {
  const due = [listItem("job-40", { status: "APPLIED", next_follow_up_at: "2026-10-01T08:00:00+00:00" })];
  await mockApi(inboxRoutes({ due }));
  await page.setViewportSize(VIEWPORTS.narrow);
  for (const path of ["/inbox", "/inbox?tab=unter", "/inbox?view=setup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  }
});
```

(In the threshold journey the tab counters come from the `limit=1` routes that `listRoutes` replaces; `counts(page, 2, 3)` proves the lists were refetched after "Übernehmen".)

- [ ] **Step 2: Run the journeys**

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: all tests pass, including the six journeys. An "unexpected" call in the fixture assertion means a route is missing for that state; add it to the journey's `inboxRoutes(..., extra)` or `setRoutes`, never silence the fixture.

- [ ] **Step 3: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'`
Expected: all green.

---

### Task 16: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`

**Interfaces:**
- Consumes: the counts printed by the last checkpoint (`pnpm test` summary `Tests  N passed`, `pnpm test:e2e` `M passed`) and the backend count (`N passed` of the pytest run).
- Produces: up-to-date context for phase 4.

- [ ] **Step 1: Collect the numbers**

Run: `"$QA"/webrun.sh pnpm test 2>&1 | grep -E "Test Files|Tests "`, `"$QA"/webrun.sh pnpm test:e2e 2>&1 | grep -E "passed|failed"` and `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" | tail -1`
Expected: unit, e2e and backend summaries; use them as `<unit>`, `<e2e>`, `<pytest>` below.

- [ ] **Step 2: Update `context/progress-tracker.md`**

Replace the Phase line of section 1 with:

```markdown
**Phase:** Frontend redesign - phase 3 (inbox `/inbox` with onboarding, import and threshold) done; next is phase 4 (applications).
```

Add at the end of the Status Board table:

```markdown
| **Frontend Redesign - Phase 3 backend** | ✅ Completed (`server/routers/jobs.py`, `server/routers/settings.py`, `server/workers/tasks/analyze.py`) | `GET /jobs` items carry `pre_generation_status` and `interview_prep_present`; `DELETE /jobs/{id}` on an archived job removes its history and document rows first; `GET /matching-preference/distribution` (101 counts, half-up rounding like the client); `GET /setup-status` (booleans: source, AI provider, profile, jobs); `job_skipped` carries `existing_job_id` for the user's own duplicate. <pytest> tests green. |
| **Frontend Redesign - Phase 3 (inbox)** | ✅ Completed (`web/src/features/inbox/**`, `web/src/api/{jobList,threshold,setup,imports}.ts`, `web/src/domain/{inbox,dueJobs,runLine,threshold,onboarding}.ts`, `web/src/realtime/{imports,useImports}.ts`, `web/src/i18n/formatDayTime.ts`, `web/app/(app)/inbox/page.tsx`) | Eingang: masthead deck (new matches, strongest) and run line (last run, mapped error, next run), "Per URL importieren" drawer with live step, stall state and outcome toast, "Anstehend" card from `nextStep` (max 3, overdue amber), tabs Neu / Unter Schwellwert / Von dir aussortiert with counts over compact rows (stretched link, fit line, score), optimistic Vormerken/Aussortieren with undo, Wiederherstellen, Endgültig löschen with confirm, preview pane from 1200 px with selection in `?job=`, threshold panel with ticks, debounced preview, Übernehmen and undo, first-run onboarding. <unit> unit tests and <e2e> Playwright tests green. |
```

Add to section 4 (ADRs):

```markdown
* **Frontend redesign - inbox rulings (phase 3):** (D1) inbox URL state `?tab=unter|aus&job=&view=setup` via `router.replace`. (D2) rows are links to `/jobs/<id>`; from 1200 px the click only selects and a preview pane shows the job. (D4) Vormerken/Aussortieren are optimistic with a 10 s undo and share one mutation key, so the list refetches only after the last one; restore and delete are not optimistic. (D5) threshold = saved value from `/settings`, ticks from `GET /matching-preference/distribution`, preview from B5, apply with the shown value, undo re-applies the previous value. (D6) onboarding from `GET /setup-status` while no source or AI provider exists and nothing was found yet; it links to `/sources?add=1` and `/settings?section=ai` (contracts for phases 5 and 7). (D7) imports are tracked per crawl id in the `["imports"]` cache entry; `applyEvent` ends them and `RealtimeProvider` toasts the outcome. (D10) a list is "stalled" while its failed request is retried.
```

In section 5 (Open Questions) add (one line each, only those still open):

```markdown
* **Inbox scope drops to confirm (phase 3 plan G7/G8/G9):** no favourite toggle (Vormerken replaces it; existing favourites stay protected from threshold runs), no bulk selection in the inbox (per-row actions only), no inbox search/sort/source filter (global search and Bewerbungen search instead).
* **Inbox approximations (G10-G12):** undo of Aussortieren marks the job `kept_by_user`; threshold undo re-applies the previous value; the next-run time uses the browser's time zone, the scheduler the profile's.
* **`POST /jobs/bulk-delete` hard delete** still leaves history and document rows (FK error on PostgreSQL); unused by the new UI.
* **Legacy `?job=` links (spec 2.3)** of the old UI redirect at the cutover (phase 9).
```

- [ ] **Step 3: Update `context/architecture.md`**

In the `web/` block of section 2, add:

```markdown
  - `src/features/inbox/`: Eingang (`/inbox`): lists as TanStack infinite queries under `["jobs", "inbox", tab]` (realtime invalidates the jobs root; `realtime/knownJobs.ts` reads infinite pages), triage, preview pane, due card, threshold panel, import drawer, onboarding.
  - Route contracts for later phases: `/sources?add=1` opens the add-source wizard (phase 5), `/settings?section=ai` the AI settings (phase 7) (`features/shell/navigation.ts`).
```

In the backend endpoint notes (where `GET /matching-preference/preview` is described, or at the end of the API list), add: "`GET /matching-preference/distribution` -> `{counts: int[101]}` of active `OPEN` plus `THRESHOLD`-archived jobs; `GET /setup-status` -> `{has_source, ai_configured, profile_complete, has_jobs}` (booleans only)."

- [ ] **Step 4: Update `context/ui-context.md`**

In section 0, add a bullet after the **Job page** bullet:

```markdown
- **Inbox (`/inbox`):** masthead with deck and run line plus the import icon button; "Anstehend" card (only when something is due, overdue amber); WAI-ARIA tabs Neu / Unter Schwellwert / Von dir aussortiert with counts (`TabItem.suffix`), state in `?tab=unter|aus`; rows `.jrow` with monogram, stretched title link, meta, fit line and score, row buttons named with the job title; from 1200 px a sticky preview pane (`?job=`), below that rows open the job page; threshold panel at the top of "Unter Schwellwert" (ink numeral, slider and tick strip, preview sentence, Übernehmen with undo toast); first-run onboarding with three steps, one primary button for the next open step. Lists show a skeleton while loading and "Die Verbindung hakt" while a failed request is retried.
```

- [ ] **Step 5: Final checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` and the full backend suite.
Expected: all green. Copy the screenshots back for the phase review.

---

## Self-Review

**Spec coverage (phase 3 row: "Inbox (incl. onboarding, import, threshold)"; done when "e2e triage and threshold green"):**

| Spec item | Task |
|---|---|
| 4.2 masthead with status lede (new matches, last crawl result, next run) | 6 (rules), 8 |
| 4.2 "Per URL importieren" | 4, 7, 13 (backend 3) |
| 4.2 "Anstehend" card, up to 3 jobs whose `nextStep` is due | 5, 11 (backend 1) |
| 4.2 seg Neu / Unter Schwellwert / Von dir aussortiert over compact rows (monogram, title, meta, score band and numeral, one-line fit reason) | 4, 5, 8 (D3, D12) |
| 4.2 inline Vormerken (DRAFTED) and Aussortieren | 9 (D4) |
| 4.2 preview pane at 1200 px and wider | 10 (D2) |
| 4.2 / 4.3 #2 threshold slider with distribution ticks, preview count (B5), Übernehmen and undo, never overriding kept jobs | 2, 4, 6, 12 (D5; kept jobs: server rule of B5) |
| 4.2 / 4.3 #8 onboarding while no source or no AI provider | 2, 4, 14 (D6) |
| 4.3 #4 terminology ("Treffer", "Unter Schwellwert" vs "Von dir aussortiert", heading = nav label) | 8, 9 |
| 4.3 #5 a11y (focusable link per row, no nested interactive elements, 44 px, focus rings, 13 px meta) | 8 (stretched link, CSS), 9 (named buttons), 10 |
| 4.4 `nextStep` drives the "Anstehend" card | 5, 11 |
| 5 visual rules (one accent, amber warnings, crimson errors with icon, ink threshold) | 8, 11, 12, 14 |
| 6 query keys, realtime -> cache, optimistic only with undo, error texts, loading/empty/error states | 4, 7, 8, 9, 11, 12, 13 |
| 7 e2e journeys onboarding, triage keep/discard/undo, threshold apply/undo (+ import), screenshots 1440/390 in both themes, no console errors, no horizontal scroll at 375 px | 8-15 |
| Inventory: `/listings` list and archive restore/delete permanently, single-job import with already-exists/failed outcomes, last-run summary, dashboard setup warnings | 9 (D13), 13, 8, 14; drops in G7-G9 |
| Backend B4 archive reason, B5 preview/apply, B6 list with total, B8 initial run (onboarding source step), B9 last run | consumed in 4, 8, 12, 14 |

Deferred on purpose: legacy `?job=` redirect (G13, phase 9), due badge on the Bewerbungen nav item (spec 4.1, it belongs with the applications phase; `dueEntries` and `dueApplicationsQueryOptions` are ready for it), the add-source wizard and AI settings themselves (phases 5 and 7, linked by contract).

**Placeholder scan:** no TBD/TODO. One conditional step is explicit and bounded: Task 8 Step 1 adds query-string keys and `ApiLog.calls` to the e2e mock only if phase 2 did not already.

**Type consistency:** `InboxTab` (`"new" | "below" | "dismissed"`) is the same in `jobList.ts`, `domain/inbox.ts`, `useInboxUrl`, `useTriage`, `RowActions`, fixtures; `JobListItem` fields (`interview_prep_present`, `pre_generation_status`, `cv_html_present`) match Task 1's server fields, the unit factory and the e2e fixtures; `queryKeys.inboxList(tab)` is the key of `inboxListQueryOptions` and of the optimistic removal in `useTriage`; `ImportResult` is shared by `applyEvent`, `RealtimeProvider` and `useImportToast`; `Triage` (`shortlist`, `dismiss`, `restore`, `remove`, `busyId`) is the same in Tasks 9 and 10; `SETUP_DONE` exists in unit support (`SetupStatus`) and e2e fixtures (`SetupStatusBody`).

**Review Focus:** each of the five items has a named test in its owning task: quick triage (Task 9 "sorting out two rows in a row keeps both out", "shortlists at once and undoes"), apply while previewing and undo to the previous value (Task 12 "applies the shown value at once and undoes to the saved one", e2e "previews, applies and undoes"), duplicate/below-threshold import (Task 7 tests, Task 13 and 15 e2e), stale deep link (Task 5 `selectedItem`, Task 10 unit and e2e).
