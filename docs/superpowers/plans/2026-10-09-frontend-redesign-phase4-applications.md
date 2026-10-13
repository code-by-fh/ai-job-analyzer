# Frontend Redesign Phase 4 (Bewerbungen `/applications`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Bewerbungen (`/applications`): masthead "n aktiv · m fällig" with a server-side search, a phase overview strip that doubles as the filter, one list of phase sections (Vorgemerkt, Beworben, Interview, Angebot) with numbered mastheads, counts and one-line hints, rows with job, next step, since/due date and document state that open the job page, a collapsed "Abgeschlossen" section, and the due badge on the Bewerbungen nav item, against the backend plus one small backend addition, with realtime updates and Playwright journeys.

**Architecture:** One backend task (server only, pytest TDD) adds what the rows read: the time of the last status change, a letter-draft flag, and a literal (wildcard-safe) search. On the web side, wire contracts go to `web/src/api/` (`jobListPaths.ts` stays client-free for e2e fixtures, `jobList.ts` holds the query options), pure rules to `web/src/domain/applications.ts` (URL, grouping by the effective phase, sort, row "when", document state, empty states, strip ticks) and `domain/dueJobs.ts` (`countDue`), and the screen to `web/src/features/applications/`. The active applications are one TanStack infinite query under `["jobs", "applications", "active", q]`, grouped on the client because the server cannot filter by the effective phase of a generating job; the closed ones are a second query that loads only when shown. Everything lives under the `["jobs"]` root, so the existing realtime invalidation keeps it fresh. Status changes stay on the job page (spec 4.3 #1); this view only reads.

**Tech Stack:** unchanged from phases 1-3 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0; backend FastAPI, SQLAlchemy 2, pytest on in-memory SQLite, PostgreSQL in production). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 4 row "Applications", done when "e2e applications green"; section 4.2 `/applications`; 4.1 due badge; 4.3 #1, #4, #5, #7; 4.4; 5; 6; 7; backend B1, B6, B11). Visual and behavioural source of truth: `docs/prototype/clickdummy-editorial.html` (`renderPipeline`, `magHead`, `renderPipeTable`, `pipeRow`, `renderClosedTable`, `dueCell`, `docsCell`, `GROUP_HINT`, `deckPipeline`, CSS block `/* Bewerbungen: each phase is a magazine section ... */` and `.table.stack-sm`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (items 5, 11, 12, 13, 17, 19, 28 and the "Bewerbungen" layout: header "5 aktiv · 1 fällig" + search, compact funnel tick strip = filter, one list with phase subheaders, rows job · next step · since/due · documents, "Abgeschlossen (n)" collapsed). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.2 `GET /jobs`, `/jobs/counts`; B.3 `/` dashboard stat tiles, `/listings` status filter, search, board; B.6 client-only search; C.3 #6).

## Global Constraints

- **Placement:** web code in `web/`, backend code in `server/`; `frontend/` stays untouched. Backend Task 1 changes only `server/`; web Tasks 2-11 change only `web/` and (Task 11) `context/`.
- **Base:** phase 3 is closed (its Task 16 checkpoint green) before web Task 2 starts. Names in this plan are the real exported names of `web/src` as of phase 3 (listed in the Self-Review name check). Plan code never compiled: before writing, read the real exports of every module you import; if a name drifted, adapt the call, never the behaviour (phase 3 R5).
- **One web implementer at a time.** All web tasks share the build mirror `$QA/web`; never run two web tasks in parallel. Backend Task 1 may run in parallel with web Tasks 2-3 (it only touches `server/` and runs pytest); Task 2 does not depend on it at runtime (the new list fields are optional in the schema).
- **Shared files:** re-read every shared file right before editing it (`de.ts`, `en.ts`, `queryKeys.ts`, `jobList.ts`, `jobListPaths.ts`, `globals.css`, `Sidebar.tsx`, `useNavCounts.ts`, `inboxFixtures.ts`); add or change only the lines named, never replace a whole file (phase 3 preflight 26).
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`; pass an object instead), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`. Never disable a lint rule; split into named helpers instead. If formatting pushes a function above 20 lines, split it.
- **React lint (eslint-plugin-react-hooks 7 incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`; event handlers may read the clock), no synchronous `setState` in an effect body, no ref reads during render. An effect that must call the latest props uses `useEffectEvent` (already used in `GlobalSearch.tsx`).
- **CSS:** component CSS lives in plain `.css` files inside `@layer components { ... }` (new file `src/features/applications/applications.css`, imported from `app/globals.css` after `inbox.css`). No inline `style` props; stage colours come from classes that set `--c` (`.mag-drafted { --c: var(--st-drafted); }`). The guard test `tests/unit/theme/cssFiles.test.ts` fails on a markdown fence line in any CSS file. Utilities only for layout spacing.
- **Type size:** meaningful text (meta lines, cell labels, strip labels, hints, notes) is at least 13 px (`var(--fs-13)`); nothing meaningful uses 12 px.
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}`. Reuse existing keys instead of adding twins: `action.view`, `error.retry`, `inbox.more` ("Weitere laden"), `inbox.stalled`, `loading`, `job.untitled`, `job.unknownCompany`, `due.overdueSince`, `phase.*`, `next.*.title`, `doc.*`, `nav.applications`.
- **Server values are never shown raw as enums.** Status and phase go through `PHASE_LABEL`, `statusLabel()` and `next.*.title` (`src/features/job/labels.ts`, `src/domain/nextStep.ts`); an unknown status shows `status.unknown`. `generation_error` is never shown.
- **URLs:** every external `href` passes `safeHref()` (`src/domain/links.ts`); app links to a job use `jobRoute(id)` (`src/features/shell/routes.ts`); this phase renders no external link.
- **Errors:** `describeError(error, t)` (`src/api/describeError.ts`); never show server `detail` or `message` text.
- **Colours (spec 5):** due/overdue warnings use amber (`.t-warn`, `--warn`, `--warn-text`), decided only by `isWarning(step)` from `src/domain/nextStep.ts` (single source, spec 4.4). Crimson (`.t-danger`, `Notice tone="error"`) is for errors only, always with an icon and words. Vermilion only for primary buttons, the active nav item and focus.
- **Live regions:** toasts keep their two persistent regions. This phase adds exactly one region, the search result status (D15), mounted from the first render and never conditionally. No other `aria-live`/`role="status"` element appears or disappears with content (skeletons may keep `role="status"` as in phase 3's `ListLoading`).
- **Focus:** focus never falls to `<body>`. A control that disappears after its own action hands focus to a named target (D14); a row that leaves the list in a refetch hands focus to the same job's link if it still exists, else to the list container (`useListFocus`, Task 9).
- **Overlays:** this phase opens no dialog or drawer. If one becomes necessary, use the app `Dialog`/`Drawer`; no second overlay mechanism.
- **Layout is CSS-driven:** every breakpoint is a CSS `@media` rule; no `useMediaQuery` in `features/applications` (no reflow on hydration).
- **Queries start in parallel:** the page prefetches all of its queries at mount (`usePrefetchInfiniteQuery`/`usePrefetchQuery`), and no component waits for one query before starting another (no waterfall). No gate holds the page for a secondary query; where an empty state needs two answers, it waits at most until the second query has settled or failed (`isError`), never on a timer.
- **States:** every data-driven block has loading (skeleton), stalled (`listPhase` "stalled": "Die Verbindung hakt"), error (`describeError` plus retry) and empty (copy from this plan) states.
- **Accessibility (spec 4.3 #5):** one focusable link per row, stretched over the row (no focusable `tr`/`li`, no nested interactive elements), visible focus rings, control borders >= 3:1, hit targets >= 44 px on mobile, toggle buttons with `aria-pressed`, the disclosure with `aria-expanded`/`aria-controls`.
- **E2E:** every UI task ships its own Playwright spec. The auto fixtures fail a test on any unmocked API call and any console error. Fixtures are typed with the `z.input` types of the real schemas and import runtime values only from client-free modules (`src/api/jobListPaths.ts`, `src/domain/*` modules that import no API client, and other `tests/e2e/support/*` files); never from `src/api/jobList.ts` or any module that imports `src/api/instance.ts`. Each UI spec saves screenshots at 1440 and 390 in both `COLOR_SCHEMES` through `saveScreenshot` and checks `horizontalOverflow(page) === 0`. The page (Task 5) and the strip (Task 7) are also checked once at `VIEWPORTS.narrow` (375).
- **Fixtures stay consistent:** the applications fixtures derive `GET /jobs/counts` and the due list from the same rows the lists return (Task 5); a test that changes a row changes it in one place. Inbox fixtures are not duplicated: `listItem`, `page` and `UNKEYED_LIST` are imported from `support/inboxFixtures.ts`; `jobBody`, `jobRoutes`, `fixNow`, `pushEvent`, `NOW_ISO`, `UPDATED`, `READY` from `support/jobFixtures.ts`.
- **Reuse, do not add a second:** `nextStep`, `isDue`, `isWarning`, `dueApplicationsQueryOptions`, `flattenPages`, `listPhase`, `ListLoading`, `jobRoute`, `PHASE_LABEL`, `statusLabel`, `useJobFormat`, `Masthead`, `EmptyState`, `Notice`, `Button`, `CountBadge`, `Disclosure` (extended, Task 8), `useDebouncedValue`, `action.view`. Status changes are not offered here (D10), so the phase menu, `useChangeStatus` and the scoped serial mutations of phase 2/3 stay untouched; if a later fix needs a mutation in this view, it uses the scoped serial pattern of `features/job/next/useChecklist.ts`.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a unit test:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/applications.test.ts`
- **Run one e2e spec:** `"$QA"/webrun.sh pnpm exec playwright test tests/e2e/applications.spec.ts` (after a `pnpm build` in the same mirror, or through `pnpm test:e2e`, which builds first).
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror).
- **Checkpoint (every web task):** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` -> all five exit 0. If the combined form is blocked, run the five as separate commands; all must pass.
- **Screenshots:** they land in the mirror; copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Backend tests (Task 1):** `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""` (append a path or node id for a subset). The backend checkpoint is the full suite.
- **Lockfile:** this phase adds no dependency.

## Review Focus

1. **The effective phase of a generating job.** An application that is already out (`APPLIED`) and regenerates its documents is `GENERATING` with `pre_generation_status: "APPLIED"`; a failed first generation is `FAILED`. Expected: the first sits in Beworben (with "Wird erstellt" as document state), the second in Vorgemerkt, and the strip, section counts and header agree; neither vanishes nor lands in a wrong section. Test: Task 3 "groups by the effective phase", Task 5 unit "shows one section per phase with rows, a failed generation under Vorgemerkt", e2e "a regenerating application stays in Beworben".
2. **"fällig" means the same number everywhere.** Header "m fällig", the Bewerbungen nav badge and the inbox "Anstehend" card come from `nextStep` + `isDue` over the same due query; amber is only `isWarning` (a follow-up or answer deadline), an interview tomorrow is due but neutral. Expected: one overdue follow-up and one interview tomorrow read "2 fällig" in header and badge, only the follow-up row is amber. Test: Task 3 "counts every due step without the card's limit, a neutral interview included", Task 4 e2e "Bewerbungen in the nav shows what is due", Task 5 e2e "rows show the next step, the date and the documents" (amber only on the follow-up), Task 10 journey "Nachgefasst on the job page lowers the due count in the header and the nav".
3. **Typing a search fast, clearing it, or typing wildcards.** The user types "Kotlin", corrects to "Java", or types "100%" or only spaces. Expected: one request per settled value (300 ms), rows of an older answer never replace a newer one, the old rows stay visible while the next answer loads, "100%" matches the literal percent sign, spaces alone are no search and write no `?q=`. Test: Task 1 `test_list_search_matches_percent_and_underscore_literally`, `test_list_search_of_only_whitespace_lists_everything`, Task 3 "trims the search, treats spaces as no search and caps it by code points", Task 6 unit "writes the settled value to the URL once and asks the server only with it", "keeps the previous rows, marked busy, while the next answer loads", "treats spaces as no search", e2e "wildcards are sent as typed".
4. **Focus after a background change or a vanishing control.** A realtime event moves the focused row to another section, closes it, or the last "Weitere laden" page removes the button; "Suche zurücksetzen" or "Alle Phasen zeigen" disappear after their own click. Expected: focus lands on the same job's link, else on the list container, the search field or the strip button; never on `<body>`. Test: Task 6 "offers to reset a search without hits and hands focus to the field", Task 7 "offers all phases from an empty one and hands focus to its strip button", Task 9 unit "follows the focused job when its row moves to another section", "keeps focus in the list when the button leaves after the last page", e2e "a status change elsewhere moves the row and its focus" and "a row that leaves the list hands focus to the list".
5. **Hand-written or stale URLs.** `/applications?phase=foo&abgeschlossen=yes&q=%20%20` or a filter that now matches nothing. Expected: unknown values fall back to defaults without an error; a phase filter with no rows shows "In dieser Phase ist gerade keine Bewerbung." with "Alle Phasen zeigen", never the first-run "Noch keine Bewerbungen". Test: Task 3 "reads the German phase values and ignores unknown ones", "tells first run, a search without results and an empty phase apart", Task 7 unit "ignores an unknown phase in the URL", e2e "an unknown phase in the URL shows all phases" and "an empty phase offers to show all and keeps focus on the strip".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | URL state | `/applications?q=<text>&phase=vorgemerkt|beworben|interview|angebot|abgeschlossen&abgeschlossen=1`. German values like the inbox (`?tab=unter`) and the prototype (`?abgeschlossen=1`). Defaults are never written (no `q` for an empty search, no `phase` for all phases, no `abgeschlossen` while collapsed). All changes use `router.replace(href, { scroll: false })` so Back leaves the page. One builder (`applicationsHref`) and the parsers (`searchFromParam`, `phaseFilterFromParam`, `closedOpenFromParam`) live in `domain/applications.ts`; unknown values fall back to the defaults. |
| D2 | Data | One active list: `GET /jobs?statuses=DRAFTED,FAILED,GENERATING,APPLIED,INTERVIEW,OFFER&is_archived=false&sort_by=date[&q=]&limit=100&offset=n` (infinite, page 100 = server cap), grouped on the client by `phaseOf()` (G4). Closed list: `statuses=ACCEPTED,REJECTED`, same shape, loaded only while the closed section is shown. Closed count: the same filter with `limit=1` (`total`), always loaded. Header: "n aktiv" from the shared `GET /jobs/counts` (`jobCountsQueryOptions`, also the nav's query) via `activeApplicationCount`, "m fällig" from the shared `dueApplicationsQueryOptions()` via `countDue` (the nav badge and the inbox card read the same query). The page prefetches all four at mount. USER-archived applications stay in Eingang › Von dir aussortiert (phase 3 D13) and are not listed here. |
| D3 | Search | Server-side `q` (B6, title or company, case-insensitive, made literal by Task 1). The field keeps a local draft; `useDebouncedValue(draft, 300)` writes `?q=` (trimmed, capped at 200 code points like the server's `MAX_SEARCH_LENGTH`). Both lists and the closed count use `q`; the header counts do not (they describe all applications). The list queries use `placeholderData: keepPreviousData`, so the previous rows stay while a new answer loads (`aria-busy` on the list). Escape in the `type="search"` field clears it natively. |
| D4 | Phase strip = filter | Five toggle buttons (`role="group"`, each `aria-pressed`): 1 Vorgemerkt, 2 Beworben, 3 Interview, 4 Angebot, 5 Abgeschlossen, each with its count and one tick per application (decorative, at most 24, then "+n"). Pressing a phase shows only that phase; pressing the pressed one again shows all. Counts follow the search (they count what the list shows); active counts come from the loaded rows, the closed count from the closed total. The usability review's funnel strip is the source (the Editorial prototype has no strip, G8). The strip is hidden only in the first-run empty state. |
| D5 | Sections and order | Phase order Vorgemerkt (1), Beworben (2), Interview (3), Angebot (4), then the "Abgeschlossen (n)" disclosure (5). Each section: numbered masthead (`phaseIndex`), title (`PHASE_LABEL`), count, one-line hint (prototype `GROUP_HINT`). Without a filter, empty active sections are hidden (prototype). Rows in a section: due rows first by due date, then the others by "since" ascending (longest waiting on top), id as tiebreaker (`compareRows`). Closed rows: most recently closed first (`sortClosed`). A column header line (Stelle / Firma, Nächster Schritt, Seit / Fällig, Unterlagen) sits once above the first section from 768 px, `aria-hidden` (each cell carries its own label for screen readers). |
| D6 | "fällig" | A row is due when `isDue(nextStep(item, now))` (follow-up or answer date within 2 calendar days or overdue, interview within 2 days, past interview without result). `countDue(items, now)` (Task 3, `domain/dueJobs.ts`) counts them for the header and the nav badge; `dueEntries` keeps its top-3 use. Amber only where `isWarning(step)`; the next-step text then gets a clock icon. A failed generation (`generationFailed`) shows crimson with an alert icon (it is an error). |
| D7 | Paging | Grouping needs the rows, so the active list loads pages of 100 (the server cap); an occasional user has far fewer. If `total` exceeds the loaded rows, a "Weitere laden" button (`inbox.more`) and "{loaded} von {total} Bewerbungen geladen." sit below the sections and the strip counts the loaded rows (G13). The closed list pages the same way inside its section. No infinite scroll. |
| D8 | Row content | Title link (stretched over the row, to `jobRoute(id)`) with the company below; next step (`t(step.label)`); "when" (`rowWhen`): interview date "Termin 09.10.2026", answer deadline "Antwort bis 20.10.2026", overdue follow-up "überfällig seit 06.10.2026" (reusing `due.overdueSince`), due soon "fällig heute"/"fällig in 2 Tagen", else "seit 3 Tagen"/"seit heute" from `status_changed_at` (Task 1) or `created_at`; document state "Beide fertig", "Nur Lebenslauf", "Nur Anschreiben", "Wird erstellt", "Noch keine". No score and no monogram (spec 4.2 row content; the score recedes from Beworben on, G7). Closed rows: title link, company, outcome (`statusLabel`), closing date. |
| D9 | Document state | From the list's presence flags: `cv_html_present`, `cover_letter_html_present` and the new `application_draft_present` (Task 1, a letter generated by `POST /generate` may have only its text), through the existing `documentPresence()` (extended in Task 2), so the row and the job page agree. `GENERATING` shows "Wird erstellt". |
| D10 | Status changes | None in this view. Spec 4.3 #1 and success criterion 2 put every status change in the job page phase menu with its guards; rows only open the job page (no row buttons, no menus, no drag and drop, no board). The guards therefore need nothing new here. |
| D11 | Empty, loading, error | Loading: `ListLoading` (skeleton, `inbox.stalled` while retrying) under a masthead whose deck reserves its line (no layout jump). Error: `ListError` (exported from `InboxList.tsx`: `describeError` + "Erneut versuchen"). Empty states (`emptyKind`): first run "Noch keine Bewerbungen" with a link "Zum Eingang"; a search without results "Keine Bewerbung passt zu „{query}“." with "Suche zurücksetzen"; an empty filtered phase "In dieser Phase ist gerade keine Bewerbung." with "Alle Phasen zeigen". The first-run state waits for the closed count to settle or fail, never longer. A failed header query hides only its part of the deck. |
| D12 | Mobile | CSS only. Below 768 px: section titles 32 px, the column header hidden, each row stacks title, company, then "Nächster Schritt: …", "Seit / Fällig: …", "Unterlagen: …" (the cell labels become visible); the strip becomes a 3-column grid (two rows) without ticks; the search field takes the full width under the title; strip buttons and rows are at least 44 px high. |
| D13 | Nav due badge | Spec 4.1 "02 Bewerbungen (due items)", deferred from phase 3 (preflight SC6). `useDueCount()` (new, `features/shell/useDueCount.ts`) feeds the header and `NavCounts.applicationsDue`; `NavBadge` shows the neutral `CountBadge` with the sentence "{count} fällig" in the sidebar and the bottom bar (due is not always a warning, so no amber pill). |
| D14 | Focus | Controls that vanish after their own click: "Suche zurücksetzen" focuses the search field, "Alle Phasen zeigen" focuses the strip button of that phase. Background changes: `useListFocus` remembers the last focused element inside `#applications-list` and, after any DOM change in it (`MutationObserver`), when focus fell to `<body>` or a detached node, focuses the link with the same `href`, else the list container (`tabIndex={-1}`). Strip, disclosure and search keep focus on themselves. |
| D15 | Live region | One persistent visually hidden `role="status"` paragraph (`SearchStatus`), mounted with the page, announces "{count} Bewerbungen gefunden" once a search answer settled (empty text without a search). Nothing else announces. |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | `GET /jobs` items have no "since" date; the history is per job only, and only user status changes write it (B1) | **Backend Task 1:** items carry `status_changed_at` (latest `job_status_history.changed_at` of the job, one grouped query per page, `null` without history). The client falls back to `created_at`. |
| G2 | List items lack the letter-draft presence that `documentPresence` reads on the job page (`application_draft`), so a letter made by `POST /generate` would show "Nur Lebenslauf" and the next step "Anschreiben erstellen" in the list but not on the job page | **Backend Task 1:** items carry `application_draft_present` (never the text); Task 2 extends `PresenceSource`. |
| G3 | `q` is put into `ILIKE '%q%'` unescaped: "100%" or "_" match everything | **Backend Task 1:** escape `\`, `%`, `_` with `ESCAPE '\'`, strip surrounding whitespace, whitespace-only means no search. |
| G4 | The server's `statuses` filter cannot express the effective phase (`GENERATING` with `pre_generation_status` APPLIED belongs to Beworben, `FAILED` to Vorgemerkt) | **Client grouping** over one active list (D2) with `phaseOf()`; no per-section server queries. |
| G5 | Prototype deck "5 Bewerbungen laufen. Nächstes Interview: … Eine wartet aufs Nachfassen." vs. spec "n aktiv · m fällig" | **Spec wins** (4.2, usability "Bewerbungen" layout). |
| G6 | Prototype "Liste / Board" seg and `?ansicht=board` | **Drop** (spec 4.2, 4.3 #1, section 9). |
| G7 | Prototype rows show a score column; spec 4.2 lists job, next step, since/due, documents | **Spec wins:** no score (it recedes from Beworben on, 4.2 job page). The controller may veto and ask for a small muted score column; it would be a CSS column plus `ScoreMeter`, no data change. |
| G8 | The Editorial prototype has no phase strip; spec 4.2 and usability #12 ask for one that filters | **Build from the usability layout** (D4): one tick per application, the strip is the only phase filter. |
| G9 | Prototype has a `WITHDRAWN` status ("Selbst abgesagt"); the server has none | **Existing rule:** the job page records it as `REJECTED` with the neutral label "Abgesagt" (`statusLabel`); the closed row shows that label. |
| G10 | Prototype rows open a drawer (`?job=`); spec says rows open the job page | **Spec wins:** rows link to `/jobs/<id>`; no drawer and no `?job=` here. |
| G11 | Prototype `offerDeadline` field; the real answer deadline is `next_follow_up_at` in Angebot (phase 2 D5, `dates.OFFER`) | **Use it:** "Antwort bis {date}" from the `decideOffer` step date. |
| G12 | Old `/listings` features: status dropdown, platform filter, "with application" toggle, sort, company filter, bulk archive per company, dashboard stat tiles | **Covered or dropped:** status via the strip, company via the search; platform filter, sort control and bulk actions are dropped for applications (few applications, spec 1); the stat tiles are replaced by strip counts and the header. Listed for the user to confirm in the tracker. |
| G13 | More than 100 active applications do not fit one page | **Accept** with "Weitere laden" and the partial note (D7). |
| G14 | Search scope is title and company only (B6), not notes or contacts | **Accept**; recorded in the tracker. |
| G15 | Phase 3 preflight SC6: Bewerbungen due badge deferred to phase 4 | **Task 4** (D13). |
| G16 | Spec 4.4 lists "the due badge on the Bewerbungen nav item" as a `nextStep` consumer, but the badge must be cheap on every page | **Reuse** the due query the inbox already loads (`dueApplicationsQueryOptions`, statuses APPLIED, INTERVIEW, OFFER, GENERATING); `DRAFTED`/`FAILED` rows are never due by `nextStep`, so nothing is missed. |
| G17 | `status_changed_at` is the last *user* status change; a job that reached Vorgemerkt only through generation from `OPEN` has none | **Accept:** "since" then falls back to `created_at` (found date). |
| G18 | `GET /jobs` sends `checklist`, but `jobListItemSchema` drops it, so a list row would say "Bewerben" where the job page says "Als beworben markieren" | **Task 2:** the list schema reads `checklist` (the job page's `checklistSchema`, exported). |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `routers/jobs.py` | list items gain `status_changed_at` and `application_draft_present`; `q` is literal and trimmed (Task 1) |
| `tests/test_jobs_router.py` | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/domain/applications.ts` | URL parse/build, phase filters, row building ("when", document state), grouping and sorting, empty kinds, strip ticks |
| `src/features/shell/useDueCount.ts` | the "fällig" number for nav and header |
| `src/features/applications/ApplicationsPage.tsx` | page frame, prefetch, composition |
| `src/features/applications/useApplicationsUrl.ts` | URL state hook |
| `src/features/applications/useApplicationLists.ts` | active list, closed list, closed total, grouped rows |
| `src/features/applications/ApplicationsHeader.tsx` | masthead and deck |
| `src/features/applications/ActiveSections.tsx` | states, sections, load more |
| `src/features/applications/PhaseSection.tsx` | numbered section head and its rows |
| `src/features/applications/ApplicationListRow.tsx` | one row and its cells |
| `src/features/applications/ApplicationSearch.tsx`, `useSearchDraft.ts`, `SearchStatus.tsx` | search field, draft and debounce, result announcement |
| `src/features/applications/PhaseStrip.tsx` | strip filter |
| `src/features/applications/ClosedSection.tsx` | disclosure, closed rows |
| `src/features/applications/useListFocus.ts` | focus keeping |
| `src/features/applications/applications.css` | styles |
| `tests/unit/domain/applications.test.ts`, `tests/unit/domain/documents.test.ts`, `tests/unit/api/applicationsApi.test.ts`, `tests/unit/features/applications/*.test.tsx`, `tests/unit/features/shell/dueBadge.test.tsx`, `tests/unit/theme/applicationsStyles.test.ts` | unit tests |
| `tests/unit/support/applicationsRoutes.ts` | `GET /jobs` stub by group, search and paging |
| `tests/e2e/support/applicationsFixtures.ts`, `tests/e2e/applications*.spec.ts`, `tests/e2e/navDue.spec.ts` | fixtures and specs |

Web, modified: `app/(app)/applications/page.tsx`, `app/globals.css`, `src/api/jobList.ts`, `src/api/jobListPaths.ts`, `src/api/jobs.ts`, `src/api/queryKeys.ts`, `src/domain/documents.ts`, `src/domain/dueJobs.ts`, `src/features/shell/useNavCounts.ts`, `src/features/shell/Sidebar.tsx` (`NavBadge`), `src/features/inbox/InboxList.tsx` (export `ListError`), `src/ui/Disclosure.tsx` (controlled mode), `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/unit/support/listItemFactory.ts`, `tests/e2e/support/inboxFixtures.ts` (export `UNKEYED_LIST`), `tests/e2e/shell.spec.ts` (drop `/applications` from the placeholder routes), unit tests that render the shell (stub the due list), `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`.

Task order: backend Task 1 may run any time in parallel with web Tasks 2-3 (the new list fields are optional in the schema; the fixtures send them); web Tasks 2 -> 11 strictly in order. Task 11 needs Task 1's report.

---

### Task 1: Backend: "since" time, letter-draft flag and a literal search in `GET /jobs`

**Files:**
- Modify: `server/routers/jobs.py` (imports, `_job_list_item`, `_apply_search_filters`, `get_jobs`; new helpers `_contains_pattern`, `_apply_text_search`, `_status_changed_at`)
- Test: `server/tests/test_jobs_router.py`

**Interfaces:**
- Consumes: `JobStatusHistory`, `iso_utc`, `JobEntry.application_draft` (all already imported or existing), `_listed_ids` (test helper in `test_jobs_router.py`), `make_job` (`tests/factories.py`).
- Produces: every `GET /jobs` item additionally carries `"status_changed_at": str | null` (ISO UTC with offset, latest `job_status_history.changed_at` of that job) and `"application_draft_present": bool` (never the draft text). `q` matches `%`, `_` and `\` literally, ignores surrounding whitespace, and a whitespace-only `q` filters nothing. No other response shape changes.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/test_jobs_router.py`:

```python
EARLIER = datetime(2026, 10, 1, 8, 0)
LATER = datetime(2026, 10, 5, 9, 30)


def _history(job_id: str, to_status: str, changed_at: datetime) -> JobStatusHistory:
    return JobStatusHistory(job_id=job_id, from_status="OPEN", to_status=to_status, changed_at=changed_at)


def _items_by_id(api_client, **params) -> dict:
    return {item["id"]: item for item in api_client.get("/jobs", params=params).json()["items"]}


def test_list_items_carry_the_latest_status_change_time(api_client, seed):
    seed(make_job(status="APPLIED"), _history("job-1", "DRAFTED", EARLIER), _history("job-1", "APPLIED", LATER))
    assert _items_by_id(api_client)["job-1"]["status_changed_at"] == iso_utc(LATER)


def test_list_item_status_change_time_is_null_without_history(api_client, seed):
    seed(make_job(id="with"), make_job(id="without"), _history("with", "DRAFTED", EARLIER))
    items = _items_by_id(api_client)
    assert (items["with"]["status_changed_at"], items["without"]["status_changed_at"]) == (iso_utc(EARLIER), None)


def test_list_items_report_a_letter_draft_without_sending_it(api_client, seed):
    seed(make_job(id="with", application_draft="Sehr geehrte Damen und Herren"), make_job(id="without"))
    items = _items_by_id(api_client)
    assert (items["with"]["application_draft_present"], items["without"]["application_draft_present"]) == (True, False)
    assert "application_draft" not in items["with"]


def test_list_search_matches_percent_and_underscore_literally(api_client, seed):
    seed(
        make_job(id="percent", title="100% Remote Engineer"),
        make_job(id="underscore", title="snake_case Developer"),
        make_job(id="plain", title="Backend Engineer"),
    )
    assert (_listed_ids(api_client, q="%"), _listed_ids(api_client, q="_")) == (["percent"], ["underscore"])


def test_list_search_matches_a_backslash_literally(api_client, seed):
    seed(make_job(id="slash", title="Dev\\Ops Engineer"), make_job(id="plain", title="Backend Engineer"))
    assert _listed_ids(api_client, q="\\") == ["slash"]


def test_list_search_ignores_surrounding_whitespace(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex", title="Designer"))
    assert _listed_ids(api_client, q="  acme  ") == ["acme"]


def test_list_search_of_only_whitespace_lists_everything(api_client, seed):
    seed(make_job(id="acme", company="Acme"), make_job(id="other", company="Globex", title="Designer"))
    assert _listed_ids(api_client, q="   ") == ["acme", "other"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py -k "status_change_time or letter_draft or literally or whitespace"`
Expected: FAIL: `KeyError: 'status_changed_at'`, `KeyError: 'application_draft_present'`; the wildcard tests list every job (`['percent', 'plain', 'underscore'] != ['percent']`, the backslash case lists both); the whitespace tests list nothing (`[] != ['acme']`, `[] != ['acme', 'other']`).

- [ ] **Step 3: Implement**

In `server/routers/jobs.py`, change the import `from sqlalchemy import or_` to:

```python
from sqlalchemy import func, or_
```

Replace `_job_list_item` with:

```python
def _job_list_item(job: JobEntry, status_changed_at: Optional[datetime] = None) -> dict:
    item = {column: getattr(job, column) for column in _JOB_LIST_COLUMNS}
    item.update(_derived_job_fields(job))
    # The prep text is large; the inbox "Anstehend" card only needs to know that it exists.
    item["interview_prep_present"] = bool(job.interview_prep_material)
    # A letter from POST /generate may exist only as text; the list needs presence, not the text.
    item["application_draft_present"] = bool(job.application_draft)
    item["status_changed_at"] = iso_utc(status_changed_at)
    return item
```

Add below `_parse_statuses`:

```python
_LIKE_ESCAPE = "\\"


def _contains_pattern(text: str) -> str:
    """ILIKE pattern that finds `text` literally: %, _ and the escape character lose their meaning."""
    escaped = text.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"


def _apply_text_search(query, raw: Optional[str]):
    search = (raw or "").strip()
    if not search:
        return query
    pattern = _contains_pattern(search)
    return query.filter(or_(
        JobEntry.title.ilike(pattern, escape=_LIKE_ESCAPE),
        JobEntry.company.ilike(pattern, escape=_LIKE_ESCAPE),
    ))
```

In `_apply_search_filters`, replace

```python
    if filters.q:
        pattern = f"%{filters.q}%"
        query = query.filter(or_(JobEntry.title.ilike(pattern), JobEntry.company.ilike(pattern)))
```

with

```python
    query = _apply_text_search(query, filters.q)
```

Add above `@router.get("/jobs")` (after `get_job_domains`):

```python
def _status_changed_at(db, job_ids: List[str]) -> dict:
    """Latest status change per job in one query. Only user status changes write history (B1)."""
    if not job_ids:
        return {}
    rows = (
        db.query(JobStatusHistory.job_id, func.max(JobStatusHistory.changed_at))
        .filter(JobStatusHistory.job_id.in_(job_ids))
        .group_by(JobStatusHistory.job_id)
        .all()
    )
    return dict(rows)
```

In `get_jobs`, replace the return line with:

```python
        changed = _status_changed_at(db, [job.id for job in page])
        return {"items": [_job_list_item(job, changed.get(job.id)) for job in page], "total": total}
```

`get_job_counts` keeps its local `from sqlalchemy import func`; do not touch it (surgical change).

- [ ] **Step 4: Run them to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_jobs_router.py`
Expected: PASS, including the existing `test_list_jobs_search_matches_title_or_company_case_insensitive` and `test_list_items_carry_pre_generation_status_and_prep_flag`.

- [ ] **Step 5: Checkpoint**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: the whole suite passes (count = previous count + 7). The report lists the doc lines for Task 11 (`context/architecture.md` `jobs.py` bullet: `status_changed_at`, `application_draft_present`, literal `q`); it does not edit `context/`.

---

### Task 2: Web API layer: list fields, application list paths and queries, count helpers

**Files:**
- Modify: `web/src/api/jobListPaths.ts`, `web/src/api/jobList.ts`, `web/src/api/queryKeys.ts`, `web/src/api/jobs.ts`, `web/src/domain/documents.ts`, `web/src/features/shell/useNavCounts.ts`, `web/tests/unit/support/listItemFactory.ts`
- Test: `web/tests/unit/api/applicationsApi.test.ts`, `web/tests/unit/domain/documents.test.ts`

**Interfaces:**
- Consumes: `listPath` (private in `jobListPaths.ts`), `fetchJobPage`, `nextOffset`, `jobListItemSchema` (`jobList.ts`), `fetchJobCounts`, `JobCounts` (`jobs.ts`), `queryKeys.jobCounts`.
- Produces:
  - `jobListPaths.ts` (client-free): `APPLICATIONS_PAGE_SIZE = 100`, `APPLICATION_GROUPS = ["active", "closed"] as const`, `type ApplicationGroup`, `interface ApplicationsQuery { group: ApplicationGroup; q: string }`, `ACTIVE_APPLICATION_STATUSES: readonly string[]`, `applicationsListPath(query: ApplicationsQuery, offset: number, limit?: number): string`.
  - `jobList.ts`: re-exports the above; `jobListItemSchema` gains `status_changed_at: string | null | undefined`, `application_draft_present: boolean` (default `false`) and `checklist: JobChecklist | null | undefined` (G18); `applicationsListQueryOptions(query: ApplicationsQuery)` (infinite, `placeholderData: keepPreviousData`), `applicationsTotalQueryOptions(query: ApplicationsQuery)` (number, `placeholderData: keepPreviousData`).
  - `queryKeys.applicationsList(group, q)` = `["jobs", "applications", group, q]`, `queryKeys.applicationsTotal(group, q)` = `["jobs", "applications-total", group, q]`.
  - `jobs.ts`: `jobCountsQueryOptions()`, `activeApplicationCount(counts: JobCounts | undefined): number`; `checklistSchema` is exported (unchanged).
  - `documents.ts`: `PresenceSource.application_draft_present?: boolean | null`; `documentPresence` counts it as a letter.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/api/applicationsApi.test.ts`:

```ts
import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applicationsListPath,
  applicationsListQueryOptions,
  applicationsTotalQueryOptions,
  fetchJobPage,
} from "@/api/jobList";
import { activeApplicationCount, jobCountsQueryOptions } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { stubRoutes } from "../support/stubRoutes";

const ACTIVE = "statuses=DRAFTED%2CFAILED%2CGENERATING%2CAPPLIED%2CINTERVIEW%2COFFER";

describe("applications list paths", () => {
  it("asks for every active phase, newest first, in pages of 100", () => {
    expect(applicationsListPath({ group: "active", q: "" }, 0)).toBe(
      `/jobs?${ACTIVE}&is_archived=false&sort_by=date&limit=100&offset=0`,
    );
  });

  it("adds the search before the paging", () => {
    expect(applicationsListPath({ group: "active", q: "Kotlin Dev" }, 100)).toBe(
      `/jobs?${ACTIVE}&is_archived=false&sort_by=date&q=Kotlin+Dev&limit=100&offset=100`,
    );
  });

  it("asks for closed applications, one row for the counter", () => {
    expect(applicationsListPath({ group: "closed", q: "" }, 0, 1)).toBe(
      "/jobs?statuses=ACCEPTED%2CREJECTED&is_archived=false&sort_by=date&limit=1&offset=0",
    );
  });
});

describe("applications query options", () => {
  it("keys lists and totals under the jobs root by group and search", () => {
    const query = { group: "active", q: "kotlin" } as const;
    expect(applicationsListQueryOptions(query).queryKey).toEqual(["jobs", "applications", "active", "kotlin"]);
    expect(applicationsTotalQueryOptions({ group: "closed", q: "" }).queryKey).toEqual(
      queryKeys.applicationsTotal("closed", ""),
    );
    expect(queryKeys.applicationsTotal("closed", "")[0]).toBe("jobs");
  });

  it("keeps the previous answer while a new search loads", () => {
    const options = applicationsListQueryOptions({ group: "active", q: "" });
    expect(options.placeholderData).toBe(keepPreviousData);
  });

  it("reads the closed total from one row", async () => {
    const calls = stubRoutes({ "GET /jobs": { items: [{ id: "job-10", status: "REJECTED" }], total: 7 } });
    const total = new QueryClient().fetchQuery(applicationsTotalQueryOptions({ group: "closed", q: "" }));
    await expect(total).resolves.toBe(7);
    expect(new URL(calls[0]!.url).searchParams.get("limit")).toBe("1");
  });
});

describe("list item fields for Bewerbungen", () => {
  it("reads the status change time and the letter-draft flag, defaulting the flag", async () => {
    stubRoutes({
      "GET /jobs": {
        items: [
          { id: "a", status: "APPLIED", status_changed_at: "2026-10-05T09:30:00+00:00", application_draft_present: true },
          { id: "b", status: "DRAFTED" },
        ],
        total: 2,
      },
    });
    const page = await fetchJobPage(applicationsListPath({ group: "active", q: "" }, 0));
    expect(page.items[0]).toMatchObject({ status_changed_at: "2026-10-05T09:30:00+00:00", application_draft_present: true });
    expect(page.items[1]?.application_draft_present).toBe(false);
  });

  it("keeps the checklist the server sends, so the next step matches the job page", async () => {
    stubRoutes({ "GET /jobs": { items: [{ id: "a", status: "DRAFTED", checklist: { sent: true } }], total: 1 } });
    const page = await fetchJobPage(applicationsListPath({ group: "active", q: "" }, 0));
    expect(page.items[0]?.checklist).toEqual({ posting_opened: false, documents_checked: false, sent: true });
  });
});

describe("activeApplicationCount", () => {
  it("sums every active status, generating and failed included", () => {
    const counts = {
      status_counts: { OPEN: 3, DRAFTED: 2, FAILED: 1, GENERATING: 1, APPLIED: 2, INTERVIEW: 1, OFFER: 1, REJECTED: 4, ACCEPTED: 1, ARCHIVE: 9 },
    };
    expect(activeApplicationCount(counts)).toBe(8);
  });

  it("is zero without counts", () => {
    expect(activeApplicationCount(undefined)).toBe(0);
  });

  it("shares the nav's counts query", () => {
    expect(jobCountsQueryOptions().queryKey).toEqual(queryKeys.jobCounts);
  });
});
```

`web/tests/unit/domain/documents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { documentPresence } from "@/domain/documents";

const NOTHING = { cv_html_present: false, cover_letter_html_present: false };

describe("documentPresence", () => {
  it("counts a list row's letter draft as a letter", () => {
    expect(documentPresence({ ...NOTHING, application_draft_present: true })).toEqual({ cv: false, cover_letter: true });
  });

  it("still counts the detail's draft text", () => {
    expect(documentPresence({ ...NOTHING, application_draft: "Sehr geehrte …" }).cover_letter).toBe(true);
  });

  it("reports nothing without flags", () => {
    expect(documentPresence({ ...NOTHING, application_draft_present: false })).toEqual({ cv: false, cover_letter: false });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/applicationsApi.test.ts tests/unit/domain/documents.test.ts`
Expected: FAIL: `applicationsListPath` / `activeApplicationCount` / `jobCountsQueryOptions` are not exported; the draft-flag test reports `cover_letter: false`.

- [ ] **Step 3: Paths (client-free)**

Append to `web/src/api/jobListPaths.ts`:

```ts
// The server caps a page at 100; grouping by phase needs the rows, and few users have more.
export const APPLICATIONS_PAGE_SIZE = 100;
export const APPLICATION_GROUPS = ["active", "closed"] as const;
export type ApplicationGroup = (typeof APPLICATION_GROUPS)[number];

/** Decision D2: FAILED and GENERATING belong to a phase too; the client groups them (phaseOf). */
const GROUP_STATUSES: Readonly<Record<ApplicationGroup, string>> = {
  active: "DRAFTED,FAILED,GENERATING,APPLIED,INTERVIEW,OFFER",
  closed: "ACCEPTED,REJECTED",
};
export const ACTIVE_APPLICATION_STATUSES: readonly string[] = GROUP_STATUSES.active.split(",");

export interface ApplicationsQuery {
  group: ApplicationGroup;
  /** Already trimmed (domain/applications.ts searchFromParam); empty means no search. */
  q: string;
}

export function applicationsListPath(
  query: ApplicationsQuery,
  offset: number,
  limit = APPLICATIONS_PAGE_SIZE,
): string {
  const filters: Record<string, string> = {
    statuses: GROUP_STATUSES[query.group],
    is_archived: "false",
    sort_by: "date",
  };
  if (query.q) filters.q = query.q;
  return listPath(filters, offset, limit);
}
```

- [ ] **Step 4: Schema, query options and keys**

In `web/src/api/queryKeys.ts`, add after `dueApplications`:

```ts
  // Bewerbungen lists and the closed counter live under the jobs root too (realtime refreshes them).
  applicationsList: (group: string, q: string) => ["jobs", "applications", group, q] as const,
  applicationsTotal: (group: string, q: string) => ["jobs", "applications-total", group, q] as const,
```

In `web/src/api/jobList.ts`:
- change the first import to `import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";`
- change the paths import to `import { applicationsListPath, dueListPath, inboxListPath, type ApplicationsQuery, type InboxTab } from "./jobListPaths";`
- extend the re-export block with `ACTIVE_APPLICATION_STATUSES, APPLICATION_GROUPS, APPLICATIONS_PAGE_SIZE, applicationsListPath, type ApplicationGroup, type ApplicationsQuery,`
- add two fields at the end of `jobListItemSchema`:

```ts
  // Task 1: the last user status change ("since") and whether a letter draft exists (D9).
  status_changed_at: z.string().nullish(),
  application_draft_present: z.boolean().default(false),
  // Sent by the server since phase 0; nextStep needs it to tell "Bewerben" from "Als beworben markieren" (G18).
  checklist: checklistSchema.nullish(),
```

and add `import { checklistSchema } from "./jobs";` to the imports. In `web/src/api/jobs.ts`, export the existing schema: `export const checklistSchema = z.object({` (no other change).

- append:

```ts
/** Decision D3: the previous rows stay on screen while the answer for a new search loads. */
export function applicationsListQueryOptions(query: ApplicationsQuery) {
  return infiniteQueryOptions({
    queryKey: queryKeys.applicationsList(query.group, query.q),
    queryFn: ({ pageParam }) => fetchJobPage(applicationsListPath(query, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
    placeholderData: keepPreviousData,
  });
}

/** Counter of a group: one row is enough, the answer's total is the count. */
export function applicationsTotalQueryOptions(query: ApplicationsQuery) {
  return queryOptions({
    queryKey: queryKeys.applicationsTotal(query.group, query.q),
    queryFn: async () => (await fetchJobPage(applicationsListPath(query, 0, 1))).total,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 5: Counts helpers and the nav switch**

In `web/src/api/jobs.ts`, add `import { ACTIVE_APPLICATION_STATUSES } from "./jobListPaths";` and append after `openMatchCount`:

```ts
/** Bewerbungen header "n aktiv" (spec 4.2): every active application, whatever its phase. */
export function activeApplicationCount(counts: JobCounts | undefined): number {
  const byStatus = counts?.status_counts ?? {};
  return ACTIVE_APPLICATION_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
}

/** One query for the nav badges and the Bewerbungen header. */
export function jobCountsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.jobCounts, queryFn: fetchJobCounts });
}
```

In `web/src/features/shell/useNavCounts.ts`, replace the counts line with `const counts = useQuery({ ...jobCountsQueryOptions(), enabled });` and import `jobCountsQueryOptions` instead of `fetchJobCounts` (keep `openMatchCount`; keep `queryKeys`, the platforms query still uses it).

`tests/unit/features/shellBehaviour.test.tsx` mocks `fetchJobCounts` through `vi.mock("@/api/jobs", ...)`. An ESM mock does not reach the module's internal call inside `jobCountsQueryOptions`, so extend that mock to return the options with the mocked function:

```ts
vi.mock("@/api/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/jobs")>();
  const fetchJobCounts = vi.fn(async () => ({ status_counts: { OPEN: 4, APPLIED: 2 } }));
  // jobCountsQueryOptions calls the module's own fetchJobCounts; the nav must see the mocked one.
  return {
    ...actual,
    fetchJobCounts,
    jobCountsQueryOptions: () => ({ ...actual.jobCountsQueryOptions(), queryFn: fetchJobCounts }),
  };
});
```

Run `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features` and fix any other test that mocked `fetchJobCounts` the same way (expected: only this file).

- [ ] **Step 6: Document presence and the test factory**

In `web/src/domain/documents.ts`, extend the interface and the letter rule:

```ts
export interface PresenceSource {
  cv_html_present: boolean;
  cover_letter_html_present: boolean;
  application_draft?: string | null;
  /** List rows carry only this flag instead of the draft text (GET /jobs, Task 1). */
  application_draft_present?: boolean | null;
}

/** A letter generated by POST /generate may only have its text yet; the HTML is rendered lazily. */
export function documentPresence(job: PresenceSource): DocumentPresence {
  const draft = Boolean(job.application_draft) || Boolean(job.application_draft_present);
  return { cv: job.cv_html_present, cover_letter: job.cover_letter_html_present || draft };
}
```

In `web/tests/unit/support/listItemFactory.ts`, add `status_changed_at: null,` and `application_draft_present: false,` to `ITEM_DEFAULTS`. Then run `"$QA"/webrun.sh pnpm typecheck`; any other object literal typed `JobListItem` that now misses `application_draft_present` gets the field (expected: none outside the factory).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api tests/unit/domain tests/unit/features/shell`
Expected: PASS (the existing `inboxApi.test.ts` still finds the due path unchanged).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all five green (no UI change; the e2e suite runs unchanged).

---

### Task 3: Domain rules for Bewerbungen (URL, rows, grouping, empty states, strip) and `countDue`

**Files:**
- Create: `web/src/domain/applications.ts`
- Modify: `web/src/domain/dueJobs.ts`
- Test: `web/tests/unit/domain/applications.test.ts`, `web/tests/unit/domain/dueJobs.test.ts` (append)

**Interfaces:**
- Consumes: `JobListItem` (type only, `@/api/jobList`), `calendarDaysBetween`, `isApiDate`, `parseApiDate` (`domain/calendar.ts`), `documentPresence` (`domain/documents.ts`, Task 2), `isGenerating`, `phaseOf`, `type Phase` (`domain/jobStatus.ts`), `nextStep`, `isDue`, `isWarning`, `type NextStep` (`domain/nextStep.ts`).
- Produces (`domain/applications.ts`; runtime imports only from `domain/*`, so e2e fixtures may import it):
  - constants `APPLICATIONS_PATH`, `SEARCH_QUERY_KEY = "q"`, `PHASE_QUERY_KEY = "phase"`, `CLOSED_QUERY_KEY = "abgeschlossen"`, `MAX_SEARCH_LENGTH = 200`, `STRIP_TICK_MAX = 24`, `ACTIVE_PHASES`, `PHASE_FILTERS`; types `ActivePhase`, `PhaseFilter`, `DocState`, `RowWhen`, `ApplicationRow`, `PhaseGroups`, `EmptyKind`.
  - `phaseFilterFromParam(value: string | null): PhaseFilter | null`, `searchFromParam(value: string | null | undefined): string`, `closedOpenFromParam(value: string | null): boolean`, `applicationsHref(location: { q?: string; phase?: PhaseFilter | null; closedOpen?: boolean }): string`.
  - `sinceOf(item): string | null`, `docState(item): DocState`, `rowWhen(item, step, now): RowWhen`, `buildRow(item, now): ApplicationRow`, `groupByPhase(items, now): PhaseGroups`, `compareRows(a, b): number`, `sortClosed(items): JobListItem[]`, `visiblePhases(groups, filter): ActivePhase[]`, `emptyKind(input: { q; phase; shown; total }): EmptyKind | null`, `stripCounts(groups, closed): Record<PhaseFilter, number>`, `tickCount(count): { ticks: number; more: number }`.
  - `dueJobs.ts`: `countDue(items: readonly JobListItem[], now: Date, timeZone?: string): number`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/applications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/api/jobList";
import {
  applicationsHref,
  buildRow,
  closedOpenFromParam,
  docState,
  emptyKind,
  groupByPhase,
  MAX_SEARCH_LENGTH,
  phaseFilterFromParam,
  rowWhen,
  searchFromParam,
  sortClosed,
  STRIP_TICK_MAX,
  stripCounts,
  tickCount,
  visiblePhases,
} from "@/domain/applications";
import { nextStep } from "@/domain/nextStep";
import { buildListItem } from "../support/listItemFactory";

const NOW = new Date("2026-10-08T10:00:00+02:00");
const READY = { cv_html_present: true, cover_letter_html_present: true };
const when = (item: JobListItem) => rowWhen(item, nextStep(item, NOW), NOW);
const ids = (rows: readonly { item: JobListItem }[]) => rows.map((row) => row.item.id);

describe("applications URL", () => {
  it("reads the German phase values and ignores unknown ones", () => {
    expect(phaseFilterFromParam("beworben")).toBe("APPLIED");
    expect(phaseFilterFromParam("abgeschlossen")).toBe("CLOSED");
    expect(phaseFilterFromParam("APPLIED")).toBeNull();
    expect(phaseFilterFromParam(null)).toBeNull();
  });

  it("trims the search, treats spaces as no search and caps it by code points", () => {
    expect(searchFromParam("  Kotlin  ")).toBe("Kotlin");
    expect(searchFromParam("   ")).toBe("");
    expect(searchFromParam(null)).toBe("");
    const long = "🦀".repeat(MAX_SEARCH_LENGTH + 5);
    expect(Array.from(searchFromParam(long))).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("opens the closed section only for the exact value", () => {
    expect(closedOpenFromParam("1")).toBe(true);
    expect(closedOpenFromParam("yes")).toBe(false);
  });

  it("writes only what differs from the defaults", () => {
    expect(applicationsHref({})).toBe("/applications");
    expect(applicationsHref({ q: "  ", phase: null, closedOpen: false })).toBe("/applications");
    expect(applicationsHref({ q: "Kotlin Dev", phase: "INTERVIEW", closedOpen: true })).toBe(
      "/applications?q=Kotlin+Dev&phase=interview&abgeschlossen=1",
    );
  });
});

describe("docState", () => {
  it("names both, one or none of the documents", () => {
    expect(docState(buildListItem({ status: "DRAFTED", ...READY }))).toBe("both");
    expect(docState(buildListItem({ status: "DRAFTED", cv_html_present: true }))).toBe("cvOnly");
    expect(docState(buildListItem({ status: "DRAFTED", application_draft_present: true }))).toBe("letterOnly");
    expect(docState(buildListItem({ status: "DRAFTED" }))).toBe("none");
  });

  it("says the documents are being made while generating", () => {
    expect(docState(buildListItem({ status: "GENERATING", ...READY }))).toBe("running");
  });
});

describe("rowWhen", () => {
  it("shows the interview date, neutral even when it is tomorrow", () => {
    const item = buildListItem({ status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" });
    expect(when(item)).toEqual({ kind: "interview", iso: "2026-10-09T08:00:00.000Z", warn: false });
  });

  it("shows an overdue follow-up as a warning", () => {
    const item = buildListItem({ status: "APPLIED", ...READY, next_follow_up_at: "2026-10-06T07:00:00Z" });
    expect(when(item)).toMatchObject({ kind: "overdue", warn: true });
  });

  it("shows a follow-up due tomorrow as a warning", () => {
    const item = buildListItem({ status: "APPLIED", ...READY, next_follow_up_at: "2026-10-09T07:00:00Z" });
    expect(when(item)).toMatchObject({ kind: "dueSoon", warn: true });
  });

  it("shows the answer deadline of an offer", () => {
    const item = buildListItem({ status: "OFFER", next_follow_up_at: "2026-10-20T07:00:00Z" });
    expect(when(item)).toMatchObject({ kind: "answerBy", warn: false });
  });

  it("falls back to the last status change, then to the found date", () => {
    const changed = buildListItem({ status: "APPLIED", status_changed_at: "2026-10-05T08:00:00Z" });
    const found = buildListItem({ status: "DRAFTED", created_at: "2026-10-03T08:00:00Z" });
    expect(when(changed)).toEqual({ kind: "since", iso: "2026-10-05T08:00:00Z", today: false });
    expect(when(found)).toMatchObject({ kind: "since", iso: "2026-10-03T08:00:00Z" });
  });

  it("knows a change of today and a row without any date", () => {
    expect(when(buildListItem({ status: "DRAFTED", status_changed_at: "2026-10-08T06:00:00Z" }))).toMatchObject({ today: true });
    expect(when(buildListItem({ status: "DRAFTED", created_at: "not a date" }))).toEqual({ kind: "none" });
  });
});

describe("groupByPhase", () => {
  it("groups by the effective phase", () => {
    const groups = groupByPhase(
      [
        buildListItem({ id: "regen", status: "GENERATING", pre_generation_status: "APPLIED" }),
        buildListItem({ id: "first", status: "GENERATING", pre_generation_status: "DRAFTED" }),
        buildListItem({ id: "failed", status: "FAILED" }),
        buildListItem({ id: "offer", status: "OFFER" }),
        buildListItem({ id: "open", status: "OPEN" }),
        buildListItem({ id: "closed", status: "REJECTED" }),
      ],
      NOW,
    );
    expect(ids(groups.APPLIED)).toEqual(["regen"]);
    expect(ids(groups.DRAFTED).sort()).toEqual(["failed", "first"]);
    expect(ids(groups.OFFER)).toEqual(["offer"]);
    expect(ids(groups.INTERVIEW)).toEqual([]);
  });

  it("puts due rows first, earliest due on top, then the longest waiting", () => {
    const groups = groupByPhase(
      [
        buildListItem({ id: "recent", status: "APPLIED", status_changed_at: "2026-10-07T08:00:00Z" }),
        buildListItem({ id: "dueLater", status: "APPLIED", next_follow_up_at: "2026-10-09T07:00:00Z" }),
        buildListItem({ id: "old", status: "APPLIED", status_changed_at: "2026-09-20T08:00:00Z" }),
        buildListItem({ id: "overdue", status: "APPLIED", next_follow_up_at: "2026-10-01T07:00:00Z" }),
      ],
      NOW,
    );
    expect(ids(groups.APPLIED)).toEqual(["overdue", "dueLater", "old", "recent"]);
  });

  it("builds each row once with its step, date and documents", () => {
    const row = buildRow(buildListItem({ status: "DRAFTED", ...READY }), NOW);
    expect([row.step.kind, row.docs]).toEqual(["apply", "both"]);
  });

  it("reads the checklist like the job page (G18)", () => {
    const checklist = { posting_opened: true, documents_checked: true, sent: true };
    expect(buildRow(buildListItem({ status: "DRAFTED", ...READY, checklist }), NOW).step.kind).toBe("markApplied");
  });
});

describe("sortClosed", () => {
  it("shows the most recently closed first", () => {
    const rows = sortClosed([
      buildListItem({ id: "sept", status: "ACCEPTED", status_changed_at: "2026-09-20T08:00:00Z" }),
      buildListItem({ id: "oct", status: "REJECTED", status_changed_at: "2026-10-01T08:00:00Z" }),
    ]);
    expect(rows.map((item) => item.id)).toEqual(["oct", "sept"]);
  });
});

describe("visiblePhases, emptyKind and the strip", () => {
  const groups = groupByPhase([buildListItem({ id: "a", status: "APPLIED" })], NOW);

  it("hides empty phases without a filter and shows the filtered one even when empty", () => {
    expect(visiblePhases(groups, null)).toEqual(["APPLIED"]);
    expect(visiblePhases(groups, "OFFER")).toEqual(["OFFER"]);
    expect(visiblePhases(groups, "CLOSED")).toEqual([]);
  });

  it("tells first run, a search without results and an empty phase apart", () => {
    expect(emptyKind({ q: "", phase: null, shown: 0, total: 0 })).toBe("noApplications");
    expect(emptyKind({ q: "Rust", phase: null, shown: 0, total: 0 })).toBe("noMatch");
    expect(emptyKind({ q: "", phase: "OFFER", shown: 0, total: 3 })).toBe("phaseEmpty");
    expect(emptyKind({ q: "", phase: null, shown: 0, total: 2 })).toBeNull();
  });

  it("counts every phase and caps the ticks", () => {
    expect(stripCounts(groups, 4)).toEqual({ DRAFTED: 0, APPLIED: 1, INTERVIEW: 0, OFFER: 0, CLOSED: 4 });
    expect(tickCount(3)).toEqual({ ticks: 3, more: 0 });
    expect(tickCount(STRIP_TICK_MAX + 2)).toEqual({ ticks: STRIP_TICK_MAX, more: 2 });
  });
});
```

Append to `web/tests/unit/domain/dueJobs.test.ts` (and add `countDue` to its import from `@/domain/dueJobs`):

```ts
describe("countDue", () => {
  it("counts every due step without the card's limit, a neutral interview included", () => {
    const items = [
      ...["a", "b", "c", "d"].map((id) => buildListItem({ id, status: "APPLIED", next_follow_up_at: OVERDUE })),
      buildListItem({ id: "iv", status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" }),
      buildListItem({ id: "wait", status: "APPLIED", next_follow_up_at: "2026-10-30T08:00:00Z" }),
      buildListItem({ id: "drafted", status: "DRAFTED" }),
    ];
    expect(countDue(items, NOW, BERLIN)).toBe(5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/applications.test.ts tests/unit/domain/dueJobs.test.ts`
Expected: FAIL: unresolved `@/domain/applications`; `countDue` is not exported.

- [ ] **Step 3: Write `domain/applications.ts`, part 1 (URL)**

```ts
import type { JobListItem } from "@/api/jobList";
import { calendarDaysBetween, isApiDate, parseApiDate } from "./calendar";
import { documentPresence } from "./documents";
import { isGenerating, phaseOf, type Phase } from "./jobStatus";
import { isDue, isWarning, nextStep, type NextStep } from "./nextStep";

export const APPLICATIONS_PATH = "/applications";
export const SEARCH_QUERY_KEY = "q";
export const PHASE_QUERY_KEY = "phase";
export const CLOSED_QUERY_KEY = "abgeschlossen";
const CLOSED_OPEN_VALUE = "1";
/** Same cap as MAX_SEARCH_LENGTH in server/routers/jobs.py (longer input answers 422). */
export const MAX_SEARCH_LENGTH = 200;
/** Decision D4: one tick per application up to this many, then "+n". */
export const STRIP_TICK_MAX = 24;

export const ACTIVE_PHASES = ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER"] as const;
export type ActivePhase = (typeof ACTIVE_PHASES)[number];
export type PhaseFilter = ActivePhase | "CLOSED";
export const PHASE_FILTERS: readonly PhaseFilter[] = [...ACTIVE_PHASES, "CLOSED"];

// Decision D1: German URL values like the inbox (?tab=unter) and the prototype (?abgeschlossen=1).
const PHASE_PARAM: Readonly<Record<PhaseFilter, string>> = {
  DRAFTED: "vorgemerkt",
  APPLIED: "beworben",
  INTERVIEW: "interview",
  OFFER: "angebot",
  CLOSED: "abgeschlossen",
};

export function phaseFilterFromParam(value: string | null): PhaseFilter | null {
  return PHASE_FILTERS.find((filter) => PHASE_PARAM[filter] === value) ?? null;
}

/** Trimmed and capped by code points like the server; spaces alone are no search. */
export function searchFromParam(value: string | null | undefined): string {
  return Array.from((value ?? "").trim()).slice(0, MAX_SEARCH_LENGTH).join("").trim();
}

export function closedOpenFromParam(value: string | null): boolean {
  return value === CLOSED_OPEN_VALUE;
}

export interface ApplicationsLocation {
  q?: string;
  phase?: PhaseFilter | null;
  closedOpen?: boolean;
}

/** Defaults are never written, so a plain /applications is the unfiltered view. */
export function applicationsHref({ q, phase, closedOpen }: ApplicationsLocation): string {
  const params = new URLSearchParams();
  const search = searchFromParam(q);
  if (search) params.set(SEARCH_QUERY_KEY, search);
  if (phase) params.set(PHASE_QUERY_KEY, PHASE_PARAM[phase]);
  if (closedOpen) params.set(CLOSED_QUERY_KEY, CLOSED_OPEN_VALUE);
  const query = params.toString();
  return query ? `${APPLICATIONS_PATH}?${query}` : APPLICATIONS_PATH;
}
```

- [ ] **Step 4: Part 2 (row cells)**

Append:

```ts
export type DocState = "both" | "cvOnly" | "letterOnly" | "running" | "none";

/** Decision D9: the list's presence flags through the job page's rule, so both tell the same. */
export function docState(item: JobListItem): DocState {
  if (isGenerating(item)) return "running";
  const presence = documentPresence(item);
  if (presence.cv && presence.cover_letter) return "both";
  if (presence.cv) return "cvOnly";
  return presence.cover_letter ? "letterOnly" : "none";
}

type DueKind = "interview" | "answerBy" | "overdue" | "dueSoon";

export type RowWhen =
  | { kind: DueKind; iso: string; warn: boolean }
  | { kind: "since"; iso: string; today: boolean }
  | { kind: "none" };

/** The last user status change ("since"), else the found date; null without a readable date. */
export function sinceOf(item: Pick<JobListItem, "status_changed_at" | "created_at">): string | null {
  for (const iso of [item.status_changed_at, item.created_at]) {
    if (iso && isApiDate(iso)) return iso;
  }
  return null;
}

function dueKind(step: NextStep): DueKind | null {
  if (!step.due) return null;
  if (step.dateField === "interview_at") return "interview";
  if (step.kind === "decideOffer") return "answerBy";
  if (step.overdue) return "overdue";
  return isDue(step) ? "dueSoon" : null;
}

function sinceWhen(item: JobListItem, now: Date): RowWhen {
  const iso = sinceOf(item);
  if (!iso) return { kind: "none" };
  return { kind: "since", iso, today: calendarDaysBetween(parseApiDate(iso), now) <= 0 };
}

/** Decision D8 "Seit / Fällig": the step's own date when it has one worth showing, else "since". */
export function rowWhen(item: JobListItem, step: NextStep, now: Date): RowWhen {
  const kind = dueKind(step);
  if (kind && step.due) return { kind, iso: step.due.toISOString(), warn: isWarning(step) };
  return sinceWhen(item, now);
}
```

- [ ] **Step 5: Part 3 (grouping, sorting, empty states, strip)**

Append:

```ts
export interface ApplicationRow {
  item: JobListItem;
  step: NextStep;
  when: RowWhen;
  docs: DocState;
}

export type PhaseGroups = Readonly<Record<ActivePhase, readonly ApplicationRow[]>>;

export function buildRow(item: JobListItem, now: Date): ApplicationRow {
  const step = nextStep(item, now);
  return { item, step, when: rowWhen(item, step, now), docs: docState(item) };
}

function isActivePhase(phase: Phase): phase is ActivePhase {
  return (ACTIVE_PHASES as readonly string[]).includes(phase);
}

function sortTime(row: ApplicationRow): number {
  if (isDue(row.step) && row.step.due) return row.step.due.getTime();
  const since = sinceOf(row.item);
  return since ? parseApiDate(since).getTime() : Number.POSITIVE_INFINITY;
}

/** Decision D5: due rows first (earliest due on top), then the longest waiting; the id keeps it stable. */
export function compareRows(first: ApplicationRow, second: ApplicationRow): number {
  const rank = Number(!isDue(first.step)) - Number(!isDue(second.step));
  return rank || sortTime(first) - sortTime(second) || first.item.id.localeCompare(second.item.id);
}

/** Gap G4: the server cannot filter by the effective phase, so one active list is grouped here. */
export function groupByPhase(items: readonly JobListItem[], now: Date): PhaseGroups {
  const groups: Record<ActivePhase, ApplicationRow[]> = { DRAFTED: [], APPLIED: [], INTERVIEW: [], OFFER: [] };
  for (const item of items) {
    const phase = phaseOf(item);
    if (isActivePhase(phase)) groups[phase].push(buildRow(item, now));
  }
  for (const phase of ACTIVE_PHASES) groups[phase].sort(compareRows);
  return groups;
}

function closedTime(item: JobListItem): number {
  const iso = sinceOf(item);
  return iso ? parseApiDate(iso).getTime() : 0;
}

export function sortClosed(items: readonly JobListItem[]): JobListItem[] {
  return [...items].sort((first, second) => closedTime(second) - closedTime(first) || first.id.localeCompare(second.id));
}

export function visiblePhases(groups: PhaseGroups, filter: PhaseFilter | null): ActivePhase[] {
  if (filter === "CLOSED") return [];
  if (filter) return [filter];
  return ACTIVE_PHASES.filter((phase) => groups[phase].length > 0);
}

export type EmptyKind = "noApplications" | "noMatch" | "phaseEmpty";

export interface EmptyInput {
  q: string;
  phase: PhaseFilter | null;
  /** Rows of the filtered phase. */
  shown: number;
  /** Active plus closed applications for the current search. */
  total: number;
}

/** Decision D11: an empty filtered phase is not the first run, and neither is a search without hits. */
export function emptyKind({ q, phase, shown, total }: EmptyInput): EmptyKind | null {
  if (phase) return shown === 0 ? "phaseEmpty" : null;
  if (total > 0) return null;
  return q ? "noMatch" : "noApplications";
}

export function stripCounts(groups: PhaseGroups, closed: number): Record<PhaseFilter, number> {
  return {
    DRAFTED: groups.DRAFTED.length,
    APPLIED: groups.APPLIED.length,
    INTERVIEW: groups.INTERVIEW.length,
    OFFER: groups.OFFER.length,
    CLOSED: closed,
  };
}

export function tickCount(count: number): { ticks: number; more: number } {
  const ticks = Math.min(count, STRIP_TICK_MAX);
  return { ticks, more: count - ticks };
}
```

If prettier breaks `groupByPhase` or `sortClosed` over the limit, extract the initial record into `emptyGroups()` and the comparator into `byClosedTimeDesc` (named helpers, no lint disable).

- [ ] **Step 6: `countDue`**

Append to `web/src/domain/dueJobs.ts`:

```ts
/** Spec 4.1/4.2 "fällig": the card's rule without its limit (Bewerbungen header and nav badge). */
export function countDue(items: readonly JobListItem[], now: Date, timeZone?: string): number {
  return items.filter((item) => isDue(nextStep(item, now, timeZone))).length;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: PASS.

- [ ] **Step 8: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all five green.

---

### Task 4: "fällig" count and the Bewerbungen nav badge

**Files:**
- Create: `web/src/features/shell/useDueCount.ts`
- Modify: `web/src/features/shell/useNavCounts.ts`, `web/src/features/shell/Sidebar.tsx` (`NavBadge`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/shell/dueBadge.test.tsx`, `web/tests/e2e/navDue.spec.ts`

**Interfaces:**
- Consumes: `dueApplicationsQueryOptions` (`@/api/jobList`), `countDue` (Task 3), `useNow`, `CountBadge`, `NavBadge` / `NavCounts` (real code).
- Produces: `useDueCount(enabled?: boolean): number | null` (null until the due query answered); `NavCounts.applicationsDue: number`; `NavBadge` renders `CountBadge` with the sentence `nav.due` ("{count} fällig") for `itemKey === "applications"` when the count is above 0, in the sidebar and the bottom bar (both already render `NavBadge`).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/shell/dueBadge.test.tsx`:

```tsx
import { renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavBadge } from "@/features/shell/Sidebar";
import { useDueCount } from "@/features/shell/useDueCount";
import { buildListItem, pageOf } from "../../support/listItemFactory";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00+02:00");
const NO_COUNTS = { inbox: 0, sourceErrors: 0, applicationsDue: 0 };

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => vi.useRealTimers());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("useDueCount", () => {
  it("counts the due steps of the due list", async () => {
    stubRoutes({
      "GET /jobs": pageOf([
        buildListItem({ id: "a", status: "APPLIED", next_follow_up_at: "2026-10-06T07:00:00Z" }),
        buildListItem({ id: "b", status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" }),
        buildListItem({ id: "c", status: "APPLIED", next_follow_up_at: "2026-10-30T07:00:00Z" }),
      ]),
    });
    const { result } = renderHook(() => useDueCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("asks nothing while disabled", () => {
    const calls = stubRoutes({ "GET /jobs": pageOf([]) });
    const { result } = renderHook(() => useDueCount(false), { wrapper });
    expect([result.current, calls.length]).toEqual([null, 0]);
  });
});

describe("NavBadge for Bewerbungen", () => {
  it("shows the due count with a sentence for screen readers", () => {
    renderWithProviders(<NavBadge itemKey="applications" counts={{ ...NO_COUNTS, applicationsDue: 2 }} />);
    expect(screen.getByText("2 fällig")).toHaveClass("sr-only");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows nothing when nothing is due", () => {
    const { container } = renderWithProviders(<NavBadge itemKey="applications" counts={NO_COUNTS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

If `renderWithProviders` does not provide the i18n context `NavBadge` needs, wrap with the same provider the existing `tests/unit/features/shell.test.tsx` uses (read it first; do not invent a second helper).

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/shell/dueBadge.test.tsx`
Expected: FAIL: unresolved `@/features/shell/useDueCount`; `NavCounts` has no `applicationsDue` (type error in the counts literal is reported by typecheck later; vitest fails on the missing module first).

- [ ] **Step 3: Dictionary keys**

`de.ts`: `"nav.due": "{count} fällig",` — `en.ts`: `"nav.due": "{count} due",`

- [ ] **Step 4: `useDueCount.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { dueApplicationsQueryOptions } from "@/api/jobList";
import { countDue } from "@/domain/dueJobs";
import { useNow } from "@/lib/clock";

/**
 * Decision D13: "fällig" for the nav badge and the Bewerbungen header. It reads the query the inbox
 * "Anstehend" card reads, so the three never disagree (spec 4.4). Null until the list answered.
 */
export function useDueCount(enabled = true): number | null {
  const now = useNow();
  const due = useQuery({ ...dueApplicationsQueryOptions(), enabled });
  return due.data ? countDue(due.data.items, new Date(now)) : null;
}
```

- [ ] **Step 5: Counts and badge**

In `useNavCounts.ts`: add `applicationsDue: number;` to `NavCounts` (with the comment `/** Due next steps of active applications (spec 4.1). */`), import `useDueCount` from `./useDueCount`, and return `applicationsDue: useDueCount(enabled) ?? 0` (call the hook at the top of the function with the other queries, not inside the object literal, so the hook order is obvious).

In `Sidebar.tsx`, `NavBadge`, insert after the inbox branch:

```tsx
  if (itemKey === "applications" && counts.applicationsDue > 0) {
    const due = counts.applicationsDue;
    return <CountBadge count={due} label={t("nav.due", { count: due })} />;
  }
```

Then `grep -rn "sourceErrors:" "$REPO/web/tests"` and add `applicationsDue: 0` to every hand-written `NavCounts` literal the typecheck reports.

- [ ] **Step 6: Unit tests of the shell keep their fetch stubs**

The nav now asks `GET /jobs` (due list) on every page. Run `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features`; a shell test that renders the nav without a `GET /jobs` stub either gets `"GET /jobs": { items: [], total: 0 }` in its `stubRoutes` table or, where it mocks API modules (`shellBehaviour.test.tsx`), a `vi.mock("@/api/jobList", ...)` override of `dueApplicationsQueryOptions` that returns `{ ...actual.dueApplicationsQueryOptions(), queryFn: async () => ({ items: [], total: 0 }) }` (same reason as Task 2: the internal call is not mocked). Expected after the fix: PASS.

- [ ] **Step 7: Write the e2e spec**

`web/tests/e2e/navDue.spec.ts`:

```ts
import type { JobListItemBody } from "../../src/api/jobList";
import { dueListPath } from "../../src/api/jobListPaths";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { AUTHENTICATED_ROUTES } from "./support/fixtures";
import { listItem, page as pageOf } from "./support/inboxFixtures";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

// Fixed now 2026-10-08 10:00 Berlin: one overdue follow-up, one interview tomorrow, one far ahead.
const DUE: JobListItemBody[] = [
  listItem("job-7", { status: "APPLIED", next_follow_up_at: "2026-10-06T07:00:00+00:00" }),
  listItem("job-9", { status: "INTERVIEW", interview_at: "2026-10-09T08:00:00+00:00" }),
  listItem("job-8", { status: "APPLIED", next_follow_up_at: "2026-10-30T07:00:00+00:00" }),
];
const DUE_KEY = `GET ${dueListPath()}`;
const routes = (items: readonly JobListItemBody[]) => ({
  ...AUTHENTICATED_ROUTES,
  [DUE_KEY]: { body: pageOf(items) },
});

test.beforeEach(async ({ page }) => fixNow(page));

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Bewerbungen in the nav shows what is due at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      await mockApi(routes(DUE));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/inbox");
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
      const link = nav.getByRole("link", { name: /Bewerbungen/ });
      // The pill holds the visible numeral and the screen-reader sentence (CountBadge).
      await expect(link.locator(".count-badge")).toContainText("2");
      await expect(link.getByText("2 fällig")).toHaveClass("sr-only");
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `nav-due-${size}-${scheme}`);
    });
  }
}

test("no badge when nothing is due", async ({ page, mockApi }) => {
  const log = await mockApi(routes([DUE[2]!]));
  await page.goto("/inbox");
  await expect.poll(() => log.requests).toContain(DUE_KEY);
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  // The nav number is aria-hidden, so without a badge the link's name is the label alone.
  await expect(nav.getByRole("link", { name: "Bewerbungen", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Bewerbungen/ }).locator(".count-badge")).toHaveCount(0);
});
```

- [ ] **Step 8: Run unit tests, format and checkpoint**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features`, then the format command and the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 5: Bewerbungen frame: route, masthead with "n aktiv · m fällig", phase sections and rows, list states

**Files:**
- Create: `web/src/features/applications/ApplicationsPage.tsx`, `useApplicationsUrl.ts`, `useApplicationLists.ts`, `ApplicationsHeader.tsx`, `ActiveSections.tsx`, `PhaseSection.tsx`, `ApplicationListRow.tsx`, `applications.css`
- Create: `web/tests/unit/support/applicationsRoutes.ts`, `web/tests/e2e/support/applicationsFixtures.ts`
- Modify: `web/app/(app)/applications/page.tsx`, `web/app/globals.css`, `web/src/features/inbox/InboxList.tsx` (export `ListError`, no other change), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/e2e/support/inboxFixtures.ts` (export `UNKEYED_LIST`, no other change), `web/tests/e2e/shell.spec.ts` (remove the `["/applications", "Bewerbungen"]` entry from `PLACEHOLDER_ROUTES`)
- Test: `web/tests/unit/features/applications/applicationsPage.test.tsx`, `web/tests/unit/theme/applicationsStyles.test.ts`, `web/tests/e2e/applications.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`applicationsListQueryOptions`, `applicationsTotalQueryOptions`, `jobCountsQueryOptions`, `activeApplicationCount`), Task 3 (`groupByPhase`, `visiblePhases`, `emptyKind`, `ApplicationRow`, `RowWhen`, `DocState`, `PhaseFilter`, URL helpers), Task 4 (`useDueCount`), `dueApplicationsQueryOptions`, `flattenPages`, `listPhase`, `ListStatus`, `INBOX_PATH` (`domain/inbox.ts`), `ListLoading`, `ListError` (`features/inbox/InboxList.tsx`), `PHASE_LABEL` (`features/job/labels.ts`), `phaseIndex`, `useJobFormat`, `jobRoute`, `navNumber`, `Masthead`, `EmptyState`, `Button`, `Icon`, `cx`, `useNow`.
- Produces:
  - `useApplicationsUrl(): ApplicationsUrl` with `{ q: string; phase: PhaseFilter | null; closedOpen: boolean; setSearch(q: string): void; setPhase(phase: PhaseFilter | null): void; setClosedOpen(open: boolean): void }`.
  - `useActiveApplications(q)`, `type ApplicationsListQuery`, `useClosedApplications(q)`, `useClosedTotal(q)`, `usePhaseGroups(q): PhaseGroups | undefined`.
  - `ApplicationsPage()`, `ApplicationsHeader({ actions?: ReactNode })`, `ActiveSections({ url }: { url: ApplicationsUrl })`, `LoadMore({ list })`, `PhaseSection({ phase, count, children })`, `sectionTitleId(phase)`, `applicationCount(t, count)`, `PhaseRows({ rows })`, `ApplicationListRow({ row })`, `RowTitle({ item })`, `RowCell({ label, children })`.
  - CSS classes `.applications`, `.mag*`, `.arows*`, `.arow*`, `.next-cell`, `.when-cell`, `.apps-partial`; Tasks 6-9 add to `applications.css`.
  - e2e: `ACTIVE_ITEMS`, `CLOSED_ITEMS`, `applicationsRoutes(data?, extra?)`, `applicationsCounts(active, closed)`, `listRoutesFor(q, rows)`; unit: `applicationsStubs(server, extra?)`, `applicationsJobs(server)`, `type ApplicationsServer`.

- [ ] **Step 1: Test support (unit and e2e fixtures)**

`web/tests/unit/support/applicationsRoutes.ts`:

```ts
import type { JobListItem } from "@/api/jobList";
import { jsonResponse, type RecordedCall } from "./fakeFetch";
import { HTTP_OK } from "./inboxRoutes";
import type { RouteTable } from "./stubRoutes";

/** Mutable server-side rows; a test changes them to simulate what happened on the server. */
export interface ApplicationsServer {
  active: JobListItem[];
  closed: JobListItem[];
}

const DUE_STATUSES = ["APPLIED", "INTERVIEW", "OFFER", "GENERATING"];

function rowsFor(server: ApplicationsServer, statuses: string): JobListItem[] {
  if (statuses.startsWith("ACCEPTED")) return server.closed;
  if (statuses.startsWith("DRAFTED")) return server.active;
  return server.active.filter((item) => DUE_STATUSES.includes(item.status));
}

function matches(item: JobListItem, q: string | null): boolean {
  const needle = q?.toLowerCase();
  return !needle || [item.title, item.company].some((text) => text?.toLowerCase().includes(needle));
}

/** GET /jobs by group (statuses), search and paging, the way the server answers it. */
export function applicationsJobs(server: ApplicationsServer) {
  return (call: RecordedCall) => {
    const params = new URL(call.url).searchParams;
    const rows = rowsFor(server, params.get("statuses") ?? "").filter((item) => matches(item, params.get("q")));
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? rows.length);
    return jsonResponse(HTTP_OK, { items: rows.slice(offset, offset + limit), total: rows.length });
  };
}

function statusCounts(server: ApplicationsServer): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of [...server.active, ...server.closed]) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

/** Everything Bewerbungen loads; the counts come from the same rows (fixtures stay consistent). */
export function applicationsStubs(server: ApplicationsServer, extra: RouteTable = {}): RouteTable {
  return {
    "GET /jobs": applicationsJobs(server),
    "GET /jobs/counts": { status_counts: statusCounts(server) },
    ...extra,
  };
}
```

In `web/tests/e2e/support/inboxFixtures.ts`, change `const UNKEYED_LIST: MockResponse` to `export const UNKEYED_LIST: MockResponse` (nothing else).

`web/tests/e2e/support/applicationsFixtures.ts`:

```ts
// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { JobListItemBody } from "../../../src/api/jobList";
import { applicationsListPath, dueListPath } from "../../../src/api/jobListPaths";
import type { JobCountsBody } from "../../../src/api/jobs";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { listItem, page, UNKEYED_LIST } from "./inboxFixtures";
import { READY } from "./jobFixtures";
import type { MockResponse, MockRoutes, MutableRoutes } from "./mockApi";

// Fixed now (NOW_ISO) is 2026-10-08 10:00 Berlin. job-1 is the job page fixture (jobBody) as a row.
export const ACTIVE_ITEMS: JobListItemBody[] = [
  listItem("job-1", {
    title: "Senior Backend Engineer (Kotlin)",
    company: "ACME GmbH",
    status: "DRAFTED",
    status_changed_at: "2026-10-06T08:00:00+00:00",
  }),
  listItem("job-5", { title: "Platform Engineer", company: "Otto", status: "DRAFTED", ...READY, status_changed_at: "2026-10-03T08:00:00+00:00" }),
  listItem("job-6", {
    title: "Java Developer",
    company: "Hermes",
    status: "GENERATING",
    pre_generation_status: "DRAFTED",
    status_changed_at: "2026-10-07T08:00:00+00:00",
  }),
  listItem("job-7", {
    title: "Kotlin Developer",
    company: "N26",
    status: "APPLIED",
    ...READY,
    next_follow_up_at: "2026-10-06T07:00:00+00:00",
    status_changed_at: "2026-09-26T08:00:00+00:00",
  }),
  // A regeneration for an application that is out: still Beworben (Review Focus 1).
  listItem("job-8", {
    title: "Backend Engineer",
    company: "Personio",
    status: "GENERATING",
    pre_generation_status: "APPLIED",
    cv_html_present: true,
    next_follow_up_at: "2026-10-20T07:00:00+00:00",
    status_changed_at: "2026-10-02T08:00:00+00:00",
  }),
  listItem("job-9", {
    title: "Staff Engineer",
    company: "Zalando",
    status: "INTERVIEW",
    ...READY,
    interview_at: "2026-10-09T08:00:00+00:00",
    status_changed_at: "2026-10-05T08:00:00+00:00",
  }),
];

export const CLOSED_ITEMS: JobListItemBody[] = [
  listItem("job-10", { title: "Lead Developer", company: "Check24", status: "REJECTED", ...READY, status_changed_at: "2026-10-01T08:00:00+00:00" }),
  listItem("job-11", { title: "Engineering Manager", company: "Tchibo", status: "ACCEPTED", ...READY, status_changed_at: "2026-09-20T08:00:00+00:00" }),
];

const DUE_STATUSES = new Set(["APPLIED", "INTERVIEW", "OFFER", "GENERATING"]);
// The inbox fixtures show three new matches; the nav badge of Eingang stays the same everywhere.
const OPEN_MATCHES = 3;

export function applicationsCounts(
  active: readonly JobListItemBody[],
  closed: readonly JobListItemBody[],
): JobCountsBody {
  const counts: Record<string, number> = { OPEN: OPEN_MATCHES };
  for (const item of [...active, ...closed]) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return { status_counts: counts };
}

export interface ApplicationRows {
  active: readonly JobListItemBody[];
  closed: readonly JobListItemBody[];
}

/** The two lists and the closed counter for one search (q = "" is the unfiltered view). */
export function listRoutesFor(q: string, rows: ApplicationRows): [string, MockResponse][] {
  return [
    [`GET ${applicationsListPath({ group: "active", q }, 0)}`, { body: page(rows.active) }],
    [`GET ${applicationsListPath({ group: "closed", q }, 0)}`, { body: page(rows.closed) }],
    [
      `GET ${applicationsListPath({ group: "closed", q }, 0, 1)}`,
      { body: page(rows.closed.slice(0, 1), rows.closed.length) },
    ],
  ];
}

export interface ApplicationsData extends Partial<ApplicationRows> {
  /** Answers per search text, exactly as typed into the field. */
  searches?: Readonly<Record<string, ApplicationRows>>;
}

/** Everything Bewerbungen loads; counts and the due list come from the same rows. */
export function applicationsRoutes(data: ApplicationsData = {}, extra: MockRoutes = {}): MutableRoutes {
  const rows = { active: data.active ?? ACTIVE_ITEMS, closed: data.closed ?? CLOSED_ITEMS };
  const searches = Object.entries(data.searches ?? {}).flatMap(([q, found]) => listRoutesFor(q, found));
  return {
    ...AUTHENTICATED_ROUTES,
    "GET /jobs/counts": { body: applicationsCounts(rows.active, rows.closed) },
    // Every list query has an exact key; an unkeyed one must fail visibly.
    "GET /jobs": UNKEYED_LIST,
    [`GET ${dueListPath()}`]: { body: page(rows.active.filter((item) => DUE_STATUSES.has(item.status))) },
    ...Object.fromEntries(listRoutesFor("", rows)),
    ...Object.fromEntries(searches),
    ...extra,
  };
}
```

(`READY` in `jobFixtures.ts` is `{ cv_html_present: true, cover_letter_html_present: true } as const`; if it is not exported under that name, read the file and use the real name.)

What the fixtures mean (asserted by the specs): Vorgemerkt 3 (job-5 "Bewerben" "Beide fertig" "seit 5 Tagen", job-1 "Unterlagen erstellen" "Noch keine" "seit 2 Tagen", job-6 "Unterlagen werden erstellt" "Wird erstellt"), Beworben 2 (job-7 "Nachfassen" amber "überfällig seit 06.10.2026" first, job-8 "Auf Antwort warten" "Wird erstellt"), Interview 1 (job-9 "Interview vorbereiten" "Termin 09.10.2026", neutral), Angebot 0 (hidden), Abgeschlossen 2. Header "6 aktiv · 2 fällig" (job-7 overdue, job-9 interview tomorrow).

- [ ] **Step 2: Write the failing unit tests**

`web/tests/unit/features/applications/applicationsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { applicationsStubs, type ApplicationsServer } from "../../support/applicationsRoutes";
import { jsonResponse } from "../../support/fakeFetch";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/applications",
}));

const NOW = new Date("2026-10-08T10:00:00+02:00");
const NOT_FOUND = 404;
const READY = { cv_html_present: true, cover_letter_html_present: true };

function server(overrides: Partial<ApplicationsServer> = {}): ApplicationsServer {
  return {
    active: [
      buildListItem({ id: "d1", title: "Platform Engineer", company: "Otto", status: "DRAFTED", ...READY }),
      buildListItem({ id: "d2", title: "Java Developer", company: "Hermes", status: "FAILED" }),
      buildListItem({ id: "a1", title: "Kotlin Developer", company: "N26", status: "APPLIED", ...READY, next_follow_up_at: "2026-10-06T07:00:00Z" }),
    ],
    closed: [buildListItem({ id: "c1", status: "REJECTED" })],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  navigation.params = new URLSearchParams();
});
afterEach(() => vi.useRealTimers());

const sectionTitles = () =>
  screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("ApplicationsPage", () => {
  it("shows the header counts over all applications", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("3 aktiv")).toBeInTheDocument();
    expect(await screen.findByText(/· 1 fällig/)).toBeInTheDocument();
  });

  it("shows one section per phase with rows, a failed generation under Vorgemerkt", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    const drafted = await screen.findByRole("region", { name: "Vorgemerkt" });
    expect(sectionTitles()).toEqual(["Vorgemerkt", "Beworben"]);
    expect(within(drafted).getAllByRole("listitem")).toHaveLength(2);
    expect(within(drafted).getByText("2 Bewerbungen")).toHaveClass("sr-only");
    const applied = screen.getByRole("region", { name: "Beworben" });
    expect(within(applied).getByRole("link", { name: "Kotlin Developer" })).toHaveAttribute("href", "/jobs/a1");
    expect(within(applied).getByText("Nachfassen").closest(".next-cell")).toHaveClass("t-warn");
  });

  it("points to the inbox when there are no applications at all", async () => {
    stubRoutes(applicationsStubs(server({ active: [], closed: [] })));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Noch keine Bewerbungen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
  });

  it("is not the first run when only closed applications exist", async () => {
    const calls = stubRoutes(applicationsStubs(server({ active: [] })));
    renderWithProviders(<ApplicationsPage />);
    await waitFor(() => expect(calls.some((call) => call.url.includes("limit=1"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("status", { busy: true })).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Noch keine Bewerbungen" })).not.toBeInTheDocument();
  });

  it("offers a retry when the list cannot load", async () => {
    const rows = server();
    stubRoutes(applicationsStubs(rows, { "GET /jobs": () => jsonResponse(NOT_FOUND, { detail: "boom" }) }));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("Das wurde nicht gefunden.")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    vi.useRealTimers();
    stubRoutes(applicationsStubs(rows));
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("region", { name: "Beworben" })).toBeInTheDocument();
  });
});
```

(The error route is a function: a `Response` body can be read once, and every `GET /jobs` of the page (active list, closed total, due list) must get its own failing answer. The header survives the failed due list by showing only "3 aktiv".)

`web/tests/unit/theme/applicationsStyles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 4.3 #5: meaningful text is at least 13 px; the design scale names it --fs-13.
const MIN_TEXT_PX = 13;
const css = readFileSync(join(process.cwd(), "src/features/applications/applications.css"), "utf8");

function fontSizes(): string[] {
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]!.trim());
  const shorthand = [...css.matchAll(/font:\s*\d+\s+([\d.]+px)\//g)].map((match) => match[1]!);
  return [...sizes, ...shorthand];
}

describe("applications.css", () => {
  it("never sets text below 13 px", () => {
    const tooSmall = fontSizes().filter((size) => {
      const px = /^([\d.]+)px$/.exec(size);
      if (px) return Number(px[1]) < MIN_TEXT_PX;
      return /--fs-12\b/.test(size);
    });
    expect(tooSmall).toEqual([]);
  });

  it("sets stage colours through classes, not inline styles", () => {
    expect(css).toMatch(/\.mag-drafted\s*\{\s*--c:\s*var\(--st-drafted\)/);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications tests/unit/theme/applicationsStyles.test.ts`
Expected: FAIL: unresolved `@/features/applications/ApplicationsPage`; `applications.css` not found.

- [ ] **Step 4: Dictionary keys**

`de.ts`:

```ts
  "applications.deck.active": "{count} aktiv",
  "applications.deck.due": "{count} fällig",
  "applications.hint.DRAFTED": "Noch nicht beworben. Firma recherchieren, Unterlagen erstellen, dann bewerben.",
  "applications.hint.APPLIED": "Die Bewerbung ist raus. Ohne Antwort nach zehn Tagen kurz nachfassen.",
  "applications.hint.INTERVIEW": "Gespräche stehen an. Vorbereitung durchgehen und Termine im Blick behalten.",
  "applications.hint.OFFER": "Ein Angebot liegt vor. Konditionen prüfen und vor der Frist entscheiden.",
  "applications.hint.CLOSED": "Zusagen, Absagen und Rückzüge. Notizen und Unterlagen bleiben zum Nachschlagen.",
  "applications.col.job": "Stelle / Firma",
  "applications.col.next": "Nächster Schritt",
  "applications.col.when": "Seit / Fällig",
  "applications.col.docs": "Unterlagen",
  "applications.cellLabel": "{label}: ",
  "applications.count": "{count} Bewerbungen",
  "applications.countOne": "1 Bewerbung",
  "applications.docs.both": "Beide fertig",
  "applications.docs.cvOnly": "Nur Lebenslauf",
  "applications.docs.letterOnly": "Nur Anschreiben",
  "applications.docs.running": "Wird erstellt",
  "applications.docs.none": "Noch keine",
  "applications.when.interview": "Termin {date}",
  "applications.when.answerBy": "Antwort bis {date}",
  "applications.when.dueSoon": "fällig {when}",
  "applications.when.sinceToday": "seit heute",
  "applications.when.none": "–",
  "applications.empty.title": "Noch keine Bewerbungen",
  "applications.empty.text": "Merke im Eingang eine passende Stelle vor. Sie erscheint dann hier unter Vorgemerkt.",
  "applications.empty.toInbox": "Zum Eingang",
  "applications.partial": "{loaded} von {total} Bewerbungen geladen.",
```

The hint says ten days because `FOLLOW_UP_DAYS` is 10 (`domain/nextStep.ts`); the prototype's "zwei Wochen" would contradict the follow-up the app suggests.

`en.ts`:

```ts
  "applications.deck.active": "{count} active",
  "applications.deck.due": "{count} due",
  "applications.hint.DRAFTED": "Not applied yet. Research the company, create the documents, then apply.",
  "applications.hint.APPLIED": "The application is out. Without an answer after ten days, follow up briefly.",
  "applications.hint.INTERVIEW": "Interviews are coming up. Go through the preparation and keep the dates in view.",
  "applications.hint.OFFER": "An offer is on the table. Check the terms and decide before the deadline.",
  "applications.hint.CLOSED": "Acceptances, rejections and withdrawals. Notes and documents stay for reference.",
  "applications.col.job": "Job / company",
  "applications.col.next": "Next step",
  "applications.col.when": "Since / due",
  "applications.col.docs": "Documents",
  "applications.cellLabel": "{label}: ",
  "applications.count": "{count} applications",
  "applications.countOne": "1 application",
  "applications.docs.both": "Both ready",
  "applications.docs.cvOnly": "CV only",
  "applications.docs.letterOnly": "Cover letter only",
  "applications.docs.running": "Being created",
  "applications.docs.none": "None yet",
  "applications.when.interview": "Interview {date}",
  "applications.when.answerBy": "Answer by {date}",
  "applications.when.dueSoon": "due {when}",
  "applications.when.sinceToday": "since today",
  "applications.when.none": "–",
  "applications.empty.title": "No applications yet",
  "applications.empty.text": "Shortlist a suitable job in the inbox. It then appears here under Shortlisted.",
  "applications.empty.toInbox": "To the inbox",
  "applications.partial": "{loaded} of {total} applications loaded.",
```

(Check `en.ts` `phase.DRAFTED` and use its exact English word in `applications.empty.text`.)

- [ ] **Step 5: URL hook and list hooks**

`web/src/features/applications/useApplicationsUrl.ts`:

```ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  applicationsHref,
  CLOSED_QUERY_KEY,
  closedOpenFromParam,
  PHASE_QUERY_KEY,
  phaseFilterFromParam,
  SEARCH_QUERY_KEY,
  searchFromParam,
  type ApplicationsLocation,
  type PhaseFilter,
} from "@/domain/applications";

export interface ApplicationsUrl {
  q: string;
  phase: PhaseFilter | null;
  closedOpen: boolean;
  setSearch: (q: string) => void;
  setPhase: (phase: PhaseFilter | null) => void;
  setClosedOpen: (open: boolean) => void;
}

/** Decision D1: search, phase filter and the closed section live in the query string (spec 2.3). */
export function useApplicationsUrl(): ApplicationsUrl {
  const params = useSearchParams();
  const router = useRouter();
  const current = {
    q: searchFromParam(params.get(SEARCH_QUERY_KEY)),
    phase: phaseFilterFromParam(params.get(PHASE_QUERY_KEY)),
    closedOpen: closedOpenFromParam(params.get(CLOSED_QUERY_KEY)),
  };
  // replace, not push: Back leaves Bewerbungen instead of walking through every keystroke.
  const go = (patch: ApplicationsLocation) =>
    router.replace(applicationsHref({ ...current, ...patch }), { scroll: false });
  return {
    ...current,
    setSearch: (q) => go({ q }),
    setPhase: (phase) => go({ phase }),
    setClosedOpen: (closedOpen) => go({ closedOpen }),
  };
}
```

`web/src/features/applications/useApplicationLists.ts`:

```ts
"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { applicationsListQueryOptions, applicationsTotalQueryOptions } from "@/api/jobList";
import { groupByPhase, type PhaseGroups } from "@/domain/applications";
import { flattenPages } from "@/domain/inbox";
import { useNow } from "@/lib/clock";

export function useActiveApplications(q: string) {
  return useInfiniteQuery(applicationsListQueryOptions({ group: "active", q }));
}

export type ApplicationsListQuery = ReturnType<typeof useActiveApplications>;

/** Mounted only while the closed rows are shown, so they load only then (decision D2). */
export function useClosedApplications(q: string) {
  return useInfiniteQuery(applicationsListQueryOptions({ group: "closed", q }));
}

export function useClosedTotal(q: string) {
  return useQuery(applicationsTotalQueryOptions({ group: "closed", q }));
}

/** The loaded active rows by effective phase (gap G4); undefined until the first answer. */
export function usePhaseGroups(q: string): PhaseGroups | undefined {
  const list = useActiveApplications(q);
  const now = useNow();
  return list.data ? groupByPhase(flattenPages(list.data.pages), new Date(now)) : undefined;
}
```

- [ ] **Step 6: Page, header and route**

`web/src/features/applications/ApplicationsPage.tsx`:

```tsx
"use client";

import { usePrefetchInfiniteQuery, usePrefetchQuery } from "@tanstack/react-query";
import {
  applicationsListQueryOptions,
  applicationsTotalQueryOptions,
  dueApplicationsQueryOptions,
} from "@/api/jobList";
import { jobCountsQueryOptions } from "@/api/jobs";
import { ActiveSections } from "./ActiveSections";
import { ApplicationsHeader } from "./ApplicationsHeader";
import { useApplicationsUrl } from "./useApplicationsUrl";

/** All of the page's requests start at once; nothing waits for another answer (no waterfall). */
function usePrefetchApplications(q: string): void {
  usePrefetchInfiniteQuery(applicationsListQueryOptions({ group: "active", q }));
  usePrefetchQuery(applicationsTotalQueryOptions({ group: "closed", q }));
  usePrefetchQuery(jobCountsQueryOptions());
  usePrefetchQuery(dueApplicationsQueryOptions());
}

/** Bewerbungen (spec 4.2): one list of phase sections; rows open the job page (decision D10). */
export function ApplicationsPage() {
  const url = useApplicationsUrl();
  usePrefetchApplications(url.q);
  return (
    <div className="page applications">
      <ApplicationsHeader />
      <ActiveSections url={url} />
    </div>
  );
}
```

If the typecheck rejects passing the infinite options (with `placeholderData`) to `usePrefetchInfiniteQuery`, pass `{ ...options, placeholderData: undefined }` through a named helper; do not cast.

`web/src/features/applications/ApplicationsHeader.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { activeApplicationCount, jobCountsQueryOptions } from "@/api/jobs";
import { navNumber } from "@/features/shell/navigation";
import { useDueCount } from "@/features/shell/useDueCount";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";

/** Spec 4.2: "n aktiv · m fällig" plus (Task 6) the search in the actions slot. */
export function ApplicationsHeader({ actions }: { actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Masthead
      number={navNumber("applications")}
      title={t("nav.applications")}
      deck={<Deck />}
      actions={actions}
    />
  );
}

/** Over all applications: the search narrows the list, not this summary. */
function Deck() {
  const { t } = useI18n();
  const counts = useQuery(jobCountsQueryOptions());
  const due = useDueCount();
  // The deck line keeps its height while loading (applications.css), so nothing below jumps.
  if (!counts.data) return null;
  const active = t("applications.deck.active", { count: activeApplicationCount(counts.data) });
  const dueText = due === null ? null : ` · ${t("applications.deck.due", { count: due })}`;
  return (
    <>
      <b>{active}</b>
      {dueText}
    </>
  );
}
```

`web/app/(app)/applications/page.tsx` (replace the placeholder):

```tsx
import { Suspense } from "react";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";

export default function ApplicationsRoute() {
  // Search, phase and the closed section live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <ApplicationsPage />
    </Suspense>
  );
}
```

- [ ] **Step 7: Section and row components**

`web/src/features/applications/PhaseSection.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { PhaseFilter } from "@/domain/applications";
import { phaseIndex } from "@/domain/jobStatus";
import { PHASE_LABEL } from "@/features/job/labels";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";

const HINT: Readonly<Record<PhaseFilter, MessageKey>> = {
  DRAFTED: "applications.hint.DRAFTED",
  APPLIED: "applications.hint.APPLIED",
  INTERVIEW: "applications.hint.INTERVIEW",
  OFFER: "applications.hint.OFFER",
  CLOSED: "applications.hint.CLOSED",
};

// The stage colour (--c) is set per class in applications.css; no inline styles.
const SECTION_CLASS: Readonly<Record<PhaseFilter, string>> = {
  DRAFTED: "mag-drafted",
  APPLIED: "mag-applied",
  INTERVIEW: "mag-interview",
  OFFER: "mag-offer",
  CLOSED: "mag-closed",
};

export const sectionTitleId = (phase: PhaseFilter) => `phase-${phase.toLowerCase()}`;

export function applicationCount(t: Translate, count: number): string {
  return count === 1 ? t("applications.countOne") : t("applications.count", { count });
}

export interface PhaseSectionProps {
  phase: PhaseFilter;
  count: number;
  children: ReactNode;
}

/** Prototype magHead: the phase's real position, large title, count and a one-line hint. */
export function PhaseSection({ phase, count, children }: PhaseSectionProps) {
  const { t } = useI18n();
  return (
    <section className={cx("mag", SECTION_CLASS[phase])} aria-labelledby={sectionTitleId(phase)}>
      <header className="mag-head">
        <span className="mag-no" aria-hidden="true">
          {phaseIndex(phase)}
        </span>
        <h2 className="mag-title" id={sectionTitleId(phase)}>
          {t(PHASE_LABEL[phase])}
        </h2>
        <SectionCount count={count} />
        <p className="mag-hint">{t(HINT[phase])}</p>
      </header>
      {children}
    </section>
  );
}

function SectionCount({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <span className="mag-count">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{applicationCount(t, count)}</span>
    </span>
  );
}
```

`web/src/features/applications/ApplicationListRow.tsx`:

```tsx
"use client";

import { CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import type { ApplicationRow, DocState, RowWhen } from "@/domain/applications";
import { isWarning, type NextStep } from "@/domain/nextStep";
import { useJobFormat, type JobFormat } from "@/features/job/format/useJobFormat";
import { jobRoute } from "@/features/shell/routes";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";

const DOC_TEXT: Readonly<Record<DocState, MessageKey>> = {
  both: "applications.docs.both",
  cvOnly: "applications.docs.cvOnly",
  letterOnly: "applications.docs.letterOnly",
  running: "applications.docs.running",
  none: "applications.docs.none",
};

const DATE_TEXT = {
  interview: "applications.when.interview",
  answerBy: "applications.when.answerBy",
  overdue: "due.overdueSince",
} as const satisfies Record<string, MessageKey>;

export function PhaseRows({ rows }: { rows: readonly ApplicationRow[] }) {
  return (
    <ul className="arows">
      {rows.map((row) => (
        <ApplicationListRow key={row.item.id} row={row} />
      ))}
    </ul>
  );
}

/** Spec 4.2 row: the title link stretches over the row (4.3 #5); the cells only read (D10). */
export function ApplicationListRow({ row }: { row: ApplicationRow }) {
  const { t } = useI18n();
  return (
    <li className="arow">
      <RowTitle item={row.item} />
      <RowCell label="applications.col.next">
        <NextCell step={row.step} />
      </RowCell>
      <RowCell label="applications.col.when">
        <WhenText when={row.when} />
      </RowCell>
      <RowCell label="applications.col.docs">{t(DOC_TEXT[row.docs])}</RowCell>
    </li>
  );
}

export function RowTitle({ item }: { item: Pick<JobListItem, "id" | "title" | "company"> }) {
  const { t } = useI18n();
  return (
    <div className="arow-main">
      <Link className="arow-link" href={jobRoute(item.id)}>
        {item.title ?? t("job.untitled")}
      </Link>
      <p className="arow-sub">{item.company ?? t("job.unknownCompany")}</p>
    </div>
  );
}

/** The label is screen-reader text from 768 px (the column head shows it) and visible below (D12). */
export function RowCell({ label, children }: { label: MessageKey; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <p className="arow-cell">
      <span className="arow-label">{t("applications.cellLabel", { label: t(label) })}</span>
      {children}
    </p>
  );
}

/** Amber only for a deadline (isWarning, spec 4.4); a failed generation is an error: crimson, icon, words. */
function NextCell({ step }: { step: NextStep }) {
  const { t } = useI18n();
  const warn = isWarning(step);
  const failed = step.kind === "generationFailed";
  return (
    <span className={cx("next-cell", warn && "t-warn", failed && "t-danger")}>
      {warn ? <Icon icon={Clock} /> : null}
      {failed ? <Icon icon={CircleAlert} /> : null}
      {t(step.label)}
    </span>
  );
}

function WhenText({ when }: { when: RowWhen }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const warn = "warn" in when && when.warn;
  return <span className={cx("when-cell", warn && "t-warn")}>{whenText(when, format, t)}</span>;
}

function whenText(when: RowWhen, format: JobFormat, t: Translate): string {
  if (when.kind === "none") return t("applications.when.none");
  if (when.kind === "since") {
    return when.today ? t("applications.when.sinceToday") : format.relativeDays(when.iso);
  }
  if (when.kind === "dueSoon") {
    return t("applications.when.dueSoon", { when: format.relativeDays(when.iso) });
  }
  return t(DATE_TEXT[when.kind], { date: format.date(when.iso) });
}
```

- [ ] **Step 8: Active sections with their states**

In `web/src/features/inbox/InboxList.tsx`, change `function ListError(` to `export function ListError(` (nothing else).

`web/src/features/applications/ActiveSections.tsx`:

```tsx
"use client";

import { Briefcase } from "lucide-react";
import Link from "next/link";
import { visiblePhases, emptyKind, type EmptyKind, type PhaseGroups } from "@/domain/applications";
import { flattenPages, INBOX_PATH, listPhase, type ListStatus } from "@/domain/inbox";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PhaseRows } from "./ApplicationListRow";
import { PhaseSection } from "./PhaseSection";
import {
  useActiveApplications,
  useClosedTotal,
  usePhaseGroups,
  type ApplicationsListQuery,
} from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

const COLUMNS: readonly MessageKey[] = [
  "applications.col.job",
  "applications.col.next",
  "applications.col.when",
  "applications.col.docs",
];

function listStatus(list: ApplicationsListQuery): ListStatus {
  return {
    hasData: list.data !== undefined,
    isError: list.isError,
    failureCount: list.failureCount,
    itemCount: flattenPages(list.data?.pages).length,
  };
}

/** Loading, stalled, error and filled states of the active applications (decision D11). */
export function ActiveSections({ url }: { url: ApplicationsUrl }) {
  const list = useActiveApplications(url.q);
  const groups = usePhaseGroups(url.q);
  const state = listPhase(listStatus(list));
  if (state === "loading" || state === "stalled") {
    return <ListLoading stalled={state === "stalled"} />;
  }
  if (!groups) return <ListError error={list.error} onRetry={() => void list.refetch()} />;
  return <LoadedSections url={url} groups={groups} list={list} />;
}

interface LoadedSectionsProps {
  url: ApplicationsUrl;
  groups: PhaseGroups;
  list: ApplicationsListQuery;
}

function LoadedSections({ url, groups, list }: LoadedSectionsProps) {
  const empty = useEmptyKind(url, list);
  if (empty === undefined) return <ListLoading stalled={false} />;
  if (empty === "noApplications") return <FirstRunEmpty />;
  const phases = visiblePhases(groups, null);
  return (
    <div className="apps-sections" aria-busy={list.isPlaceholderData || undefined}>
      {phases.length > 0 ? <ColumnHead /> : null}
      {phases.map((phase) => (
        <PhaseSection key={phase} phase={phase} count={groups[phase].length}>
          <PhaseRows rows={groups[phase]} />
        </PhaseSection>
      ))}
      <LoadMore list={list} />
    </div>
  );
}

/**
 * Without active rows the first-run state needs the closed count too. It waits only until that
 * query settled or failed (bounded by the query, never by a timer); undefined means "still deciding".
 */
function useEmptyKind(url: ApplicationsUrl, list: ApplicationsListQuery): EmptyKind | null | undefined {
  const closed = useClosedTotal(url.q);
  const total = (list.data?.pages[0]?.total ?? 0) + (closed.data ?? 0);
  if (total === 0 && closed.data === undefined && !closed.isError) return undefined;
  return emptyKind({ q: url.q, phase: null, shown: 0, total });
}

function ColumnHead() {
  const { t } = useI18n();
  // Visual only: each cell carries its own label for screen readers (decision D5).
  return (
    <div className="arows-head" aria-hidden="true">
      {COLUMNS.map((key) => (
        <span key={key}>{t(key)}</span>
      ))}
    </div>
  );
}

function FirstRunEmpty() {
  const { t } = useI18n();
  const toInbox = (
    <Link className="btn" href={INBOX_PATH}>
      {t("applications.empty.toInbox")}
    </Link>
  );
  return (
    <EmptyState icon={Briefcase} title={t("applications.empty.title")} actions={toInbox}>
      {t("applications.empty.text")}
    </EmptyState>
  );
}

/** Decision D7: an explicit button and how much is loaded; the strip counts the loaded rows. */
export function LoadMore({ list }: { list: ApplicationsListQuery }) {
  const { t } = useI18n();
  if (!list.hasNextPage) return null;
  const loaded = flattenPages(list.data?.pages).length;
  const total = list.data?.pages.at(-1)?.total ?? loaded;
  return (
    <div className="list-foot">
      <p className="apps-partial">{t("applications.partial", { loaded, total })}</p>
      <Button size="sm" busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
        {t("inbox.more")}
      </Button>
    </div>
  );
}
```

Tasks 6 and 7 change `useEmptyKind` (search and phase) and `visiblePhases(groups, null)` (phase); keep both in these named places.

- [ ] **Step 9: Styles**

`web/src/features/applications/applications.css`:

```css
/* Bewerbungen, ported from docs/prototype/clickdummy-editorial.html (.mag, .mag-head, .mag-table, .next-cell, .stack-sm). */
@layer components {
  /* The deck keeps its line while the counts load, so the sections never jump down. */
  .applications .mast-deck {
    min-height: 1.4em;
  }
  .mag + .mag {
    margin-top: 52px;
  }
  .mag-drafted {
    --c: var(--st-drafted);
  }
  .mag-applied {
    --c: var(--st-applied);
  }
  .mag-interview {
    --c: var(--st-interview);
  }
  .mag-offer {
    --c: var(--st-offer);
  }
  .mag-closed {
    --c: var(--st-closed);
  }
  .mag-head {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto;
    column-gap: 8px;
    align-items: baseline;
    border-top: 5px solid var(--c);
    padding-top: 14px;
    margin-bottom: 6px;
  }
  .mag-no {
    font: 300 44px/0.9 var(--font-display);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }
  .mag-title {
    font: 720 44px/0.92 var(--font-display);
    letter-spacing: -0.04em;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .mag-count {
    font: 720 44px/0.9 var(--font-display);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
  }
  .mag-hint {
    grid-column: 2 / 4;
    margin-top: 10px;
    max-width: 62ch;
    font-size: var(--fs-14);
    color: var(--text-2);
  }
  .arows-head,
  .arow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 23% 17% 16%;
    column-gap: 24px;
  }
  .arows-head {
    margin-top: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line-strong);
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--text-3);
  }
  .arows {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }
  .arow {
    position: relative;
    align-items: start;
    padding: 16px 0;
    border-bottom: 1px solid var(--line);
  }
  .arow:hover {
    background: var(--hover);
  }
  .arow-link {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
  /* One link per row, stretched over it (spec 4.3 #5). */
  .arow-link::after {
    content: "";
    position: absolute;
    inset: 0;
  }
  .arow-link:focus-visible {
    outline: none;
  }
  .arow-link:focus-visible::after {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .arow-sub,
  .arow-cell {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  .arow-sub {
    margin-top: 2px;
    overflow-wrap: anywhere;
  }
  /* Screen-reader text from 768 px (the column head shows the words); visible below (D12). */
  .arow-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .next-cell {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-weight: 500;
    color: var(--text);
  }
  .next-cell.t-warn {
    color: var(--warn-text);
    font-weight: 700;
  }
  .when-cell {
    font-variant-numeric: tabular-nums;
  }
  .apps-partial {
    margin: 0 0 8px;
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  @media (max-width: 767px) {
    .mag-head {
      grid-template-columns: 36px minmax(0, 1fr) auto;
    }
    .mag-no,
    .mag-title,
    .mag-count {
      font-size: 32px;
    }
    .mag-hint {
      grid-column: 1 / -1;
    }
    .arows-head {
      display: none;
    }
    .arow {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 4px;
      min-height: 44px;
      padding: 14px 0;
    }
    .arow-label {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      color: var(--text-3);
    }
  }
}
```

Add `@import "../src/features/applications/applications.css";` to `web/app/globals.css` directly after the `inbox.css` import. Check that `.t-danger`, `.t-warn` (controls.css) and `.list-foot` (inbox.css) exist under these names; reuse them, do not redefine.

- [ ] **Step 10: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications tests/unit/theme`
Expected: PASS.

- [ ] **Step 11: Write the e2e spec**

`web/tests/e2e/applications.spec.ts`:

```ts
import type { Locator, Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { setRoutes } from "./support/mockApi";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const ACTIVE_KEY = `GET ${applicationsListPath({ group: "active", q: "" }, 0)}`;

test.beforeEach(async ({ page }) => fixNow(page));

const section = (page: Page, name: string) => page.getByRole("region", { name });
const rowsOf = (region: Locator) => region.getByRole("listitem");

async function open(page: Page) {
  await page.goto("/applications");
  await expect(section(page, "Beworben")).toBeVisible();
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Bewerbungen shows the phase sections at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await expect(page.getByRole("heading", { level: 1, name: "Bewerbungen" })).toBeVisible();
      await expect(page.getByText("6 aktiv · 2 fällig")).toBeVisible();
      await expect(page.locator(".applications").getByRole("heading", { level: 2 })).toHaveText([
        "Vorgemerkt",
        "Beworben",
        "Interview",
      ]);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-${size}-${scheme}`);
    });
  }
}

test("rows show the next step, the date and the documents", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await open(page);
  const applied = rowsOf(section(page, "Beworben"));
  await expect(applied).toHaveCount(2);
  await expect(applied.nth(0)).toContainText("Kotlin Developer");
  await expect(applied.nth(0).locator(".next-cell")).toHaveText("Nachfassen");
  await expect(applied.nth(0).locator(".next-cell")).toHaveClass(/t-warn/);
  await expect(applied.nth(0).locator(".when-cell")).toHaveText("überfällig seit 06.10.2026");
  await expect(applied.nth(0)).toContainText("Beide fertig");
  await expect(applied.nth(0).getByRole("link", { name: "Kotlin Developer" })).toHaveAttribute("href", "/jobs/job-7");
  const interview = rowsOf(section(page, "Interview")).first();
  await expect(interview.locator(".when-cell")).toHaveText("Termin 09.10.2026");
  await expect(interview.locator(".when-cell")).not.toHaveClass(/t-warn/);
});

test("a regenerating application stays in Beworben", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await open(page);
  const regenerating = rowsOf(section(page, "Beworben")).nth(1);
  await expect(regenerating).toContainText("Backend Engineer");
  await expect(regenerating.locator(".next-cell")).toHaveText("Auf Antwort warten");
  await expect(regenerating).toContainText("Wird erstellt");
  await expect(rowsOf(section(page, "Vorgemerkt")).locator(".arow-link")).toHaveText([
    "Platform Engineer",
    "Senior Backend Engineer (Kotlin)",
    "Java Developer",
  ]);
  await expect(section(page, "Angebot")).toHaveCount(0);
});

test("the first run points to the inbox", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ active: [], closed: [] }));
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "Noch keine Bewerbungen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
});

test("a failed list offers a retry", async ({ page, mockApi }) => {
  const routes = applicationsRoutes({}, { [ACTIVE_KEY]: { status: 404, body: { detail: "boom" } } });
  await mockApi(routes);
  await page.goto("/applications");
  await expect(page.getByText("Das wurde nicht gefunden.")).toBeVisible();
  await expect(page.getByText("boom")).toHaveCount(0);
  setRoutes(routes, applicationsRoutes());
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(section(page, "Beworben")).toBeVisible();
});

test("rows stack with visible labels at 375 px without horizontal scroll", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await open(page);
  const first = rowsOf(section(page, "Beworben")).first();
  await expect(first.getByText("Nächster Schritt:")).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});
```

In `web/tests/e2e/shell.spec.ts`, remove the `["/applications", "Bewerbungen"]` line from `PLACEHOLDER_ROUTES` (the page is real now and is covered here).

- [ ] **Step 12: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green; copy the screenshots back. Compare `applications-1440-light.png` with the prototype's Bewerbungen screen (`#/bewerbungen`) for hierarchy: masthead, numbered sections with a 5 px stage rule, rows on hairlines.

---

### Task 6: Search (server-side `q`, debounced URL, kept rows, result announcement)

**Files:**
- Create: `web/src/features/applications/useSearchDraft.ts`, `ApplicationSearch.tsx`, `SearchStatus.tsx`, `web/tests/unit/support/liveNavigation.ts`
- Modify: `web/src/features/applications/ApplicationsPage.tsx`, `ActiveSections.tsx`, `applications.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/applications/search.test.tsx`, `web/tests/e2e/applicationsSearch.spec.ts`

**Interfaces:**
- Consumes: `useApplicationsUrl`, `useActiveApplications`, `useClosedTotal`, `ActiveSections`, `applicationCount` (Task 5), `searchFromParam`, `MAX_SEARCH_LENGTH` (Task 3), `useDebouncedValue` (`src/lib/useDebouncedValue.ts`), `EmptyState`, `Button`, `Icon`.
- Produces:
  - `SEARCH_DEBOUNCE_MS = 300`, `SEARCH_INPUT_ID = "applications-search"`, `interface SearchDraft { value: string; setValue(value: string): void; reset(): void }`, `useSearchDraft(url: ApplicationsUrl): SearchDraft` (reset clears field and URL and focuses the field, D14).
  - `ApplicationSearch({ draft }: { draft: SearchDraft })`, `SearchStatus({ q }: { q: string })` (the page's one persistent live region, D15).
  - `ActiveSections({ url, onResetSearch }: { url: ApplicationsUrl; onResetSearch: () => void })` (new prop) with the "noMatch" empty state.
  - Unit test support: `liveNavigation` (`replace` really changes the params; `reset(query?)`) and `navigationModule(pathname)` for `vi.mock("next/navigation", ...)`; Tasks 7-9 reuse it.

- [ ] **Step 1: Live navigation for unit tests**

`web/tests/unit/support/liveNavigation.ts` (the pattern of `tests/unit/features/inbox/preview.test.tsx`, shared so later tests do not copy it):

```ts
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const listeners = new Set<() => void>();
const state = { params: new URLSearchParams() };

function setParams(params: URLSearchParams): void {
  state.params = params;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A router whose replace() really changes the query string, so URL-driven views re-render. */
export const liveNavigation = {
  replace: vi.fn((href: string) => setParams(new URL(href, "http://app").searchParams)),
  push: vi.fn(),
  reset(query = ""): void {
    liveNavigation.replace.mockClear();
    setParams(new URLSearchParams(query));
  },
};

/** The next/navigation module for vi.mock: `vi.mock("next/navigation", async () => (await import(...)).navigationModule("/x"))`. */
export function navigationModule(pathname: string) {
  return {
    useRouter: () => ({ replace: liveNavigation.replace, push: liveNavigation.push }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => state.params),
    usePathname: () => pathname,
  };
}
```

- [ ] **Step 2: Write the failing unit tests**

`web/tests/unit/features/applications/search.test.tsx`:

```tsx
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { SEARCH_DEBOUNCE_MS } from "@/features/applications/useSearchDraft";
import { applicationsJobs, applicationsStubs, type ApplicationsServer } from "../../support/applicationsRoutes";
import type { RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

const SETTLE_MS = SEARCH_DEBOUNCE_MS + 100;
const FIELD = { name: "Bewerbungen durchsuchen" };

function server(): ApplicationsServer {
  return {
    active: [
      buildListItem({ id: "d1", title: "Platform Engineer", company: "Otto", status: "DRAFTED" }),
      buildListItem({ id: "a1", title: "Kotlin Developer", company: "N26", status: "APPLIED" }),
      buildListItem({ id: "a2", title: "Java Developer", company: "Hermes", status: "APPLIED" }),
    ],
    closed: [],
  };
}

const searched = (calls: RecordedCall[]) =>
  new Set(calls.map((call) => new URL(call.url).searchParams.get("q")).filter(Boolean));

async function openPage() {
  renderWithProviders(<ApplicationsPage />);
  await screen.findByRole("region", { name: "Beworben" });
  return screen.getByRole("searchbox", FIELD);
}

beforeEach(() => liveNavigation.reset());

describe("Bewerbungen search", () => {
  it("writes the settled value to the URL once and asks the server only with it", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "Kotlin");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?q=Kotlin", { scroll: false }),
    );
    expect(liveNavigation.replace).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(searched(calls)).toEqual(new Set(["Kotlin"])));
  });

  it("narrows the sections and announces the result", async () => {
    stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "Kotlin");
    expect(await screen.findByText("1 Bewerbung gefunden")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Beworben" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Vorgemerkt" })).not.toBeInTheDocument();
  });

  it("keeps the previous rows, marked busy, while the next answer loads", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const jobs = applicationsJobs(server());
    stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs": async (call: RecordedCall) => {
          if (new URL(call.url).searchParams.get("q") === "Java") await held;
          return jobs(call);
        },
      }),
    );
    await userEvent.type(await openPage(), "Java");
    await waitFor(() => expect(document.querySelector(".apps-sections")).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("link", { name: "Kotlin Developer" })).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Kotlin Developer" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Java Developer" })).toBeInTheDocument();
  });

  it("treats spaces as no search", async () => {
    stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "   ");
    await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)));
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });

  it("offers to reset a search without hits and hands focus to the field", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Rust");
    expect(await screen.findByText("Keine Bewerbung passt zu „Rust“.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(await screen.findByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
  });

  it("starts from the URL's search", async () => {
    liveNavigation.reset("q=Kotlin");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("searchbox", FIELD)).toHaveValue("Kotlin");
    expect(await screen.findByRole("link", { name: "Kotlin Developer" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications/search.test.tsx`
Expected: FAIL: unresolved `@/features/applications/useSearchDraft`.

- [ ] **Step 4: Dictionary keys**

`de.ts`:

```ts
  "applications.search.label": "Bewerbungen durchsuchen",
  "applications.search.placeholder": "Stelle oder Firma",
  "applications.search.noneTitle": "Nichts gefunden",
  "applications.search.none": "Keine Bewerbung passt zu „{query}“.",
  "applications.search.reset": "Suche zurücksetzen",
  "applications.search.found": "{count} Bewerbungen gefunden",
  "applications.search.foundOne": "1 Bewerbung gefunden",
```

`en.ts`:

```ts
  "applications.search.label": "Search applications",
  "applications.search.placeholder": "Job or company",
  "applications.search.noneTitle": "Nothing found",
  "applications.search.none": "No application matches “{query}”.",
  "applications.search.reset": "Clear search",
  "applications.search.found": "{count} applications found",
  "applications.search.foundOne": "1 application found",
```

- [ ] **Step 5: Draft, field and status**

`web/src/features/applications/useSearchDraft.ts`:

```ts
"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { searchFromParam } from "@/domain/applications";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { ApplicationsUrl } from "./useApplicationsUrl";

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_INPUT_ID = "applications-search";

export interface SearchDraft {
  value: string;
  setValue: (value: string) => void;
  /** Clears field and URL and keeps focus in the field (decision D14). */
  reset: () => void;
}

/**
 * Decision D3: the field is typed into freely; the URL, and with it the one request, follows once
 * the value settled. Only a settled change that differs from the URL is written.
 */
export function useSearchDraft(url: ApplicationsUrl): SearchDraft {
  const [value, setValue] = useState(url.q);
  const settled = useDebouncedValue(value, SEARCH_DEBOUNCE_MS);
  const commit = useEffectEvent((next: string) => {
    if (searchFromParam(next) !== url.q) url.setSearch(next);
  });
  useEffect(() => commit(settled), [settled]);
  const reset = () => {
    setValue("");
    url.setSearch("");
    document.getElementById(SEARCH_INPUT_ID)?.focus();
  };
  return { value, setValue, reset };
}
```

`web/src/features/applications/ApplicationSearch.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { MAX_SEARCH_LENGTH } from "@/domain/applications";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { SEARCH_INPUT_ID, type SearchDraft } from "./useSearchDraft";

/** Spec 4.2 header search. Escape clears a type="search" field natively (decision D3). */
export function ApplicationSearch({ draft }: { draft: SearchDraft }) {
  const { t } = useI18n();
  const label = t("applications.search.label");
  return (
    <form className="apps-search" role="search" aria-label={label} onSubmit={(event) => event.preventDefault()}>
      <label className="sr-only" htmlFor={SEARCH_INPUT_ID}>
        {label}
      </label>
      <Icon icon={Search} />
      <input
        id={SEARCH_INPUT_ID}
        className="input"
        type="search"
        autoComplete="off"
        maxLength={MAX_SEARCH_LENGTH}
        placeholder={t("applications.search.placeholder")}
        value={draft.value}
        onChange={(event) => draft.setValue(event.target.value)}
      />
    </form>
  );
}
```

`web/src/features/applications/SearchStatus.tsx`:

```tsx
"use client";

import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useActiveApplications, useClosedTotal } from "./useApplicationLists";

function foundText(t: Translate, count: number): string {
  return count === 1 ? t("applications.search.foundOne") : t("applications.search.found", { count });
}

/**
 * Decision D15: the page's one live region. It is mounted with the page and only its text changes,
 * so screen readers hear each settled search answer (never a placeholder answer).
 */
export function SearchStatus({ q }: { q: string }) {
  const { t } = useI18n();
  const list = useActiveApplications(q);
  const closed = useClosedTotal(q);
  const settled = q !== "" && list.data !== undefined && !list.isPlaceholderData && closed.data !== undefined && !closed.isPlaceholderData;
  const count = (list.data?.pages[0]?.total ?? 0) + (closed.data ?? 0);
  return (
    <p className="sr-only" role="status">
      {settled ? foundText(t, count) : ""}
    </p>
  );
}
```

- [ ] **Step 6: Wire them into the page and the empty states**

`ApplicationsPage.tsx`: import `ApplicationSearch`, `SearchStatus`, `useSearchDraft`; the component becomes:

```tsx
export function ApplicationsPage() {
  const url = useApplicationsUrl();
  const search = useSearchDraft(url);
  usePrefetchApplications(url.q);
  return (
    <div className="page applications">
      <ApplicationsHeader actions={<ApplicationSearch draft={search} />} />
      <ActiveSections url={url} onResetSearch={search.reset} />
      <SearchStatus q={url.q} />
    </div>
  );
}
```

`ActiveSections.tsx`: add `onResetSearch: () => void` to the props of `ActiveSections` (declare `export interface ActiveSectionsProps { url: ApplicationsUrl; onResetSearch: () => void }`) and to `LoadedSectionsProps`, pass it down, and in `LoadedSections` add after the first-run line:

```tsx
  if (empty === "noMatch") return <NoMatchEmpty q={url.q} onReset={onResetSearch} />;
```

and add:

```tsx
function NoMatchEmpty({ q, onReset }: { q: string; onReset: () => void }) {
  const { t } = useI18n();
  const reset = <Button onClick={onReset}>{t("applications.search.reset")}</Button>;
  return (
    <EmptyState icon={SearchX} title={t("applications.search.noneTitle")} actions={reset}>
      {t("applications.search.none", { query: q })}
    </EmptyState>
  );
}
```

(`SearchX` from `lucide-react`.) `useEmptyKind` already passes `q: url.q`; nothing else changes there.

- [ ] **Step 7: Styles**

Append inside `@layer components` of `applications.css` (before the media query), and the two mobile rules inside the existing `@media (max-width: 767px)` block:

```css
  .apps-search {
    position: relative;
    width: 280px;
  }
  .apps-search .ico {
    position: absolute;
    top: 50%;
    left: 10px;
    translate: 0 -50%;
    color: var(--text-3);
    pointer-events: none;
  }
  .apps-search .input {
    width: 100%;
    padding-left: 34px;
  }
```

```css
    .applications .mast-actions,
    .apps-search {
      flex-basis: 100%;
      width: 100%;
    }
    .apps-search .input {
      min-height: 44px;
    }
```

- [ ] **Step 8: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications`
Expected: PASS (Task 5's page test still passes: `ActiveSections` gets its new prop from the page).

- [ ] **Step 9: Write the e2e spec**

`web/tests/e2e/applicationsSearch.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { ACTIVE_ITEMS, applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const KOTLIN = ACTIVE_ITEMS.filter((item) => item.title?.includes("Kotlin"));
const SEARCHES = {
  Kotlin: { active: KOTLIN, closed: [] },
  Rust: { active: [], closed: [] },
  "100%": { active: [], closed: [] },
};

test.beforeEach(async ({ page }) => fixNow(page));

const field = (page: Page) => page.getByRole("searchbox", { name: "Bewerbungen durchsuchen" });
const section = (page: Page, name: string) => page.getByRole("region", { name });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`a search narrows the sections at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(applicationsRoutes({ searches: SEARCHES }));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await field(page).fill("Kotlin");
      await expect(page).toHaveURL(/\/applications\?q=Kotlin$/);
      await expect(section(page, "Vorgemerkt").getByRole("listitem")).toHaveCount(1);
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(1);
      await expect(section(page, "Interview")).toHaveCount(0);
      // The header describes all applications; the search narrows only the list.
      await expect(page.getByText("6 aktiv · 2 fällig")).toBeVisible();
      await expect(page.getByText("2 Bewerbungen gefunden")).toHaveClass("sr-only");
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-search-${size}-${scheme}`);
    });
  }
}

test("a deep link restores the search", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications?q=Kotlin");
  await expect(field(page)).toHaveValue("Kotlin");
  await expect(page.getByRole("link", { name: "Kotlin Developer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Platform Engineer" })).toHaveCount(0);
});

test("a search without hits resets to everything and keeps focus in the field", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications");
  await field(page).fill("Rust");
  await expect(page.getByText("Keine Bewerbung passt zu „Rust“.")).toBeVisible();
  await page.getByRole("button", { name: "Suche zurücksetzen" }).click();
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue("");
  await expect(page).toHaveURL(/\/applications$/);
  await expect(section(page, "Interview")).toBeVisible();
});

test("wildcards are sent as typed", async ({ page, mockApi }) => {
  const log = await mockApi(applicationsRoutes({ searches: SEARCHES }));
  await page.goto("/applications");
  await field(page).fill("100%");
  const key = `GET ${applicationsListPath({ group: "active", q: "100%" }, 0)}`;
  await expect.poll(() => log.requests).toContain(key);
});
```

- [ ] **Step 10: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 7: Phase strip as the filter (counts, ticks, `?phase=`, empty phase)

**Files:**
- Create: `web/src/features/applications/PhaseStrip.tsx`
- Modify: `web/src/features/applications/ApplicationsPage.tsx`, `ActiveSections.tsx`, `applications.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/applications/strip.test.tsx`, `web/tests/e2e/applicationsFilter.spec.ts`

**Interfaces:**
- Consumes: `PHASE_FILTERS`, `stripCounts`, `tickCount`, `visiblePhases`, `emptyKind`, `ActivePhase`, `ApplicationRow` (Task 3), `usePhaseGroups`, `useClosedTotal`, `applicationCount`, `PhaseSection`, `PhaseRows` (Task 5), `liveNavigation` (Task 6), `PHASE_LABEL`, `phaseIndex`.
- Produces: `PhaseStrip({ url })`, `stripButtonId(phase: PhaseFilter): string`, `showAllPhases(url: ApplicationsUrl, phase: PhaseFilter): void` (clears the filter and focuses that phase's strip button, D14), `PhaseEmpty({ onShowAll })` (Task 8 reuses it for the closed phase). Each strip button's accessible name is `applications.strip.item` ("Vorgemerkt: 2 Bewerbungen"), set with `aria-label` so it does not depend on how inline spans are joined. `ActiveSections` honours `url.phase`.

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/applications/strip.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STRIP_TICK_MAX } from "@/domain/applications";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { applicationsStubs, type ApplicationsServer } from "../../support/applicationsRoutes";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

const EXTRA_DRAFTED = 6;

function server(drafted = 2): ApplicationsServer {
  const draftedRows = Array.from({ length: drafted }, (_, index) =>
    buildListItem({ id: `d${index}`, title: `Drafted ${index}`, status: "DRAFTED" }),
  );
  return {
    active: [...draftedRows, buildListItem({ id: "a1", title: "Kotlin Developer", status: "APPLIED" })],
    closed: [buildListItem({ id: "c1", status: "REJECTED" })],
  };
}

const strip = () => screen.getByRole("group", { name: "Phasen" });
const stripButton = (name: RegExp) => within(strip()).getByRole("button", { name });

async function openPage() {
  renderWithProviders(<ApplicationsPage />);
  await screen.findByRole("group", { name: "Phasen" });
}

beforeEach(() => liveNavigation.reset());

describe("PhaseStrip", () => {
  it("counts every phase, the closed one included", async () => {
    stubRoutes(applicationsStubs(server()));
    await openPage();
    expect(stripButton(/^Vorgemerkt/)).toHaveAccessibleName("Vorgemerkt: 2 Bewerbungen");
    expect(stripButton(/^Abgeschlossen/)).toHaveAccessibleName("Abgeschlossen: 1 Bewerbung");
    expect(stripButton(/^Angebot/)).toHaveAccessibleName("Angebot: 0 Bewerbungen");
  });

  it("filters to one phase and keeps focus on the pressed button", async () => {
    stubRoutes(applicationsStubs(server()));
    await openPage();
    await userEvent.click(stripButton(/^Beworben/));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?phase=beworben", { scroll: false });
    expect(stripButton(/^Beworben/)).toHaveAttribute("aria-pressed", "true");
    expect(stripButton(/^Beworben/)).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Vorgemerkt" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Beworben" })).toBeInTheDocument();
  });

  it("shows all phases again when the pressed one is pressed", async () => {
    liveNavigation.reset("phase=beworben");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    await userEvent.click(stripButton(/^Beworben/));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications", { scroll: false });
    expect(await screen.findByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
  });

  it("ignores an unknown phase in the URL", async () => {
    liveNavigation.reset("phase=foo");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    expect(within(strip()).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
  });

  it("offers all phases from an empty one and hands focus to its strip button", async () => {
    liveNavigation.reset("phase=angebot");
    stubRoutes(applicationsStubs(server()));
    await openPage();
    const offer = await screen.findByRole("region", { name: "Angebot" });
    expect(within(offer).getByText("In dieser Phase ist gerade keine Bewerbung.")).toBeInTheDocument();
    await userEvent.click(within(offer).getByRole("button", { name: "Alle Phasen zeigen" }));
    expect(stripButton(/^Angebot/)).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Angebot" })).not.toBeInTheDocument());
  });

  it("draws one tick per application up to the cap", async () => {
    stubRoutes(applicationsStubs(server(STRIP_TICK_MAX + EXTRA_DRAFTED)));
    await openPage();
    const drafted = stripButton(/^Vorgemerkt/);
    expect(drafted.querySelectorAll(".strip-tick")).toHaveLength(STRIP_TICK_MAX);
    expect(within(drafted).getByText(`+${EXTRA_DRAFTED}`)).toBeInTheDocument();
  });

  it("is not shown on the first run", async () => {
    stubRoutes(applicationsStubs({ active: [], closed: [] }));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("heading", { name: "Noch keine Bewerbungen" });
    expect(screen.queryByRole("group", { name: "Phasen" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications/strip.test.tsx`
Expected: FAIL: no group "Phasen".

- [ ] **Step 3: Dictionary keys**

`de.ts`:

```ts
  "applications.strip.label": "Phasen",
  "applications.strip.item": "{phase}: {count}",
  "applications.strip.more": "+{count}",
  "applications.phaseEmpty": "In dieser Phase ist gerade keine Bewerbung.",
  "applications.filter.clear": "Alle Phasen zeigen",
```

`en.ts`:

```ts
  "applications.strip.label": "Phases",
  "applications.strip.item": "{phase}: {count}",
  "applications.strip.more": "+{count}",
  "applications.phaseEmpty": "No application is in this phase right now.",
  "applications.filter.clear": "Show all phases",
```

- [ ] **Step 4: Write `PhaseStrip.tsx`**

```tsx
"use client";

import { PHASE_FILTERS, stripCounts, tickCount, type PhaseFilter } from "@/domain/applications";
import { phaseIndex } from "@/domain/jobStatus";
import { PHASE_LABEL } from "@/features/job/labels";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { applicationCount } from "./PhaseSection";
import { useClosedTotal, usePhaseGroups } from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

// The stage colour (--c) of each cell comes from applications.css.
const STRIP_CLASS: Readonly<Record<PhaseFilter, string>> = {
  DRAFTED: "strip-drafted",
  APPLIED: "strip-applied",
  INTERVIEW: "strip-interview",
  OFFER: "strip-offer",
  CLOSED: "strip-closed",
};

export const stripButtonId = (phase: PhaseFilter) => `strip-${phase.toLowerCase()}`;

/** D14: the "show all" button leaves with the filter, so focus moves to that phase's strip button. */
export function showAllPhases(url: ApplicationsUrl, phase: PhaseFilter): void {
  url.setPhase(null);
  document.getElementById(stripButtonId(phase))?.focus();
}

function useStripCounts(q: string): Record<PhaseFilter, number> | null {
  const groups = usePhaseGroups(q);
  const closed = useClosedTotal(q);
  // A failed closed count must not hide the strip; it then counts the closed phase as 0.
  const closedCount = closed.data ?? (closed.isError ? 0 : undefined);
  return groups && closedCount !== undefined ? stripCounts(groups, closedCount) : null;
}

const sum = (counts: Record<PhaseFilter, number>) =>
  PHASE_FILTERS.reduce((total, phase) => total + counts[phase], 0);

/** Decision D4: the phase overview is the only phase filter; pressing the pressed phase shows all. */
export function PhaseStrip({ url }: { url: ApplicationsUrl }) {
  const { t } = useI18n();
  const counts = useStripCounts(url.q);
  if (!counts) return <div className="strip strip-pending" aria-hidden="true" />;
  // Nothing to filter on the first run (decision D11).
  if (!url.q && !url.phase && sum(counts) === 0) return null;
  return (
    <div className="strip" role="group" aria-label={t("applications.strip.label")}>
      {PHASE_FILTERS.map((phase) => (
        <StripButton
          key={phase}
          phase={phase}
          count={counts[phase]}
          pressed={url.phase === phase}
          onPress={() => url.setPhase(url.phase === phase ? null : phase)}
        />
      ))}
    </div>
  );
}

interface StripButtonProps {
  phase: PhaseFilter;
  count: number;
  pressed: boolean;
  onPress: () => void;
}

function StripButton({ phase, count, pressed, onPress }: StripButtonProps) {
  const { t } = useI18n();
  // An explicit name: joined inline spans would read "Vorgemerkt2" in some engines.
  const name = t("applications.strip.item", { phase: t(PHASE_LABEL[phase]), count: applicationCount(t, count) });
  return (
    <button
      type="button"
      id={stripButtonId(phase)}
      className={cx("strip-item", STRIP_CLASS[phase])}
      aria-label={name}
      aria-pressed={pressed}
      onClick={onPress}
    >
      <span className="strip-head">
        <span className="strip-no" aria-hidden="true">
          {phaseIndex(phase)}
        </span>
        <span className="strip-label">{t(PHASE_LABEL[phase])}</span>
      </span>
      <span className="strip-count">{count}</span>
      <Ticks count={count} />
    </button>
  );
}

/** Decorative: the count says the same in words (usability #12, one tick per application). */
function Ticks({ count }: { count: number }) {
  const { t } = useI18n();
  const { ticks, more } = tickCount(count);
  return (
    <span className="strip-ticks" aria-hidden="true">
      {Array.from({ length: ticks }, (_, index) => (
        <i key={index} className="strip-tick" />
      ))}
      {more > 0 ? <span className="strip-more">{t("applications.strip.more", { count: more })}</span> : null}
    </span>
  );
}

/** An empty filtered phase is not the first run: say so and offer the way back (decision D11). */
export function PhaseEmpty({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useI18n();
  return (
    <div className="phase-empty">
      <p>{t("applications.phaseEmpty")}</p>
      <Button size="sm" variant="ghost" onClick={onShowAll}>
        {t("applications.filter.clear")}
      </Button>
    </div>
  );
}
```

The pending strip keeps the strip's height (CSS) while the counts load, so the sections do not jump; it is `aria-hidden` and has no live role.

- [ ] **Step 5: Honour the filter in the sections**

In `ActiveSections.tsx`:
- import `PhaseEmpty`, `showAllPhases` from `./PhaseStrip` and `type ActivePhase`, `type ApplicationRow`, `type PhaseFilter` from `@/domain/applications`;
- `useEmptyKind` takes the groups and passes the phase:

```tsx
function shownIn(groups: PhaseGroups, phase: PhaseFilter | null, closed: number): number {
  if (!phase) return 0;
  return phase === "CLOSED" ? closed : groups[phase].length;
}

function useEmptyKind(
  url: ApplicationsUrl,
  groups: PhaseGroups,
  list: ApplicationsListQuery,
): EmptyKind | null | undefined {
  const closed = useClosedTotal(url.q);
  const total = (list.data?.pages[0]?.total ?? 0) + (closed.data ?? 0);
  if (total === 0 && closed.data === undefined && !closed.isError) return undefined;
  const shown = shownIn(groups, url.phase, closed.data ?? 0);
  return emptyKind({ q: url.q, phase: url.phase, shown, total });
}
```

- `LoadedSections` becomes:

```tsx
function LoadedSections({ url, groups, list, onResetSearch }: LoadedSectionsProps) {
  const empty = useEmptyKind(url, groups, list);
  if (empty === undefined) return <ListLoading stalled={false} />;
  if (empty === "noApplications") return <FirstRunEmpty />;
  if (empty === "noMatch") return <NoMatchEmpty q={url.q} onReset={onResetSearch} />;
  const phases = visiblePhases(groups, url.phase);
  const hasRows = phases.some((phase) => groups[phase].length > 0);
  return (
    <div className="apps-sections" aria-busy={list.isPlaceholderData || undefined}>
      {hasRows ? <ColumnHead /> : null}
      {phases.map((phase) => (
        <PhaseBlock key={phase} phase={phase} rows={groups[phase]} onShowAll={() => showAllPhases(url, phase)} />
      ))}
      <LoadMore list={list} />
    </div>
  );
}

interface PhaseBlockProps {
  phase: ActivePhase;
  rows: readonly ApplicationRow[];
  onShowAll: () => void;
}

/** Only a filtered phase can be empty here; unfiltered, empty phases are not rendered (decision D5). */
function PhaseBlock({ phase, rows, onShowAll }: PhaseBlockProps) {
  return (
    <PhaseSection phase={phase} count={rows.length}>
      {rows.length > 0 ? <PhaseRows rows={rows} /> : <PhaseEmpty onShowAll={onShowAll} />}
    </PhaseSection>
  );
}
```

`emptyKind`'s "phaseEmpty" decides the closed phase in Task 8; for the active phases `PhaseBlock` reads the same fact from its rows. Do not add a second rule.

- [ ] **Step 6: Place the strip**

In `ApplicationsPage.tsx`, render `<PhaseStrip url={url} />` between `<ApplicationsHeader ... />` and `<ActiveSections ... />`.

- [ ] **Step 7: Styles**

Append inside `@layer components` (before the media query):

```css
  .strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0 16px;
    min-height: 96px;
    margin: 0 0 40px;
  }
  .strip-pending {
    border-top: 4px solid var(--line);
  }
  .strip-drafted {
    --c: var(--st-drafted);
  }
  .strip-applied {
    --c: var(--st-applied);
  }
  .strip-interview {
    --c: var(--st-interview);
  }
  .strip-offer {
    --c: var(--st-offer);
  }
  .strip-closed {
    --c: var(--st-closed);
  }
  .strip-item {
    display: grid;
    align-content: start;
    gap: 6px;
    min-height: 44px;
    padding: 10px 8px 12px;
    border: 0;
    border-top: 4px solid var(--c);
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .strip-item:hover {
    background: var(--hover);
  }
  /* Pressed is shown by an ink underline, not by colour alone. */
  .strip-item[aria-pressed="true"] {
    background: var(--selected);
    box-shadow: inset 0 -3px 0 var(--text);
  }
  .strip-item:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .strip-head {
    display: flex;
    gap: 6px;
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--text-2);
  }
  .strip-count {
    font: 720 32px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }
  .strip-ticks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    min-height: 13px;
  }
  .strip-tick {
    width: 4px;
    height: 13px;
    background: var(--c);
  }
  .strip-more {
    font-size: var(--fs-13);
    line-height: 1;
    color: var(--text-2);
  }
  .phase-empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 16px 0;
    border-bottom: 1px solid var(--line);
    font-size: var(--fs-14);
    color: var(--text-2);
  }
  .phase-empty p {
    margin: 0;
  }
```

Inside the existing `@media (max-width: 767px)` block:

```css
    .strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      min-height: 0;
    }
    .strip-count {
      font-size: 24px;
    }
    .strip-ticks,
    .strip-no {
      display: none;
    }
```

- [ ] **Step 8: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications tests/unit/theme`
Expected: PASS.

- [ ] **Step 9: Write the e2e spec**

`web/tests/e2e/applicationsFilter.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const strip = (page: Page) => page.getByRole("group", { name: "Phasen" });
const stripButton = (page: Page, phase: string) => strip(page).getByRole("button", { name: new RegExp(`^${phase}`) });
const section = (page: Page, name: string) => page.getByRole("region", { name });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`the strip filters to one phase at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await expect(stripButton(page, "Vorgemerkt")).toHaveAccessibleName("Vorgemerkt: 3 Bewerbungen");
      await stripButton(page, "Beworben").click();
      await expect(page).toHaveURL(/\?phase=beworben$/);
      await expect(stripButton(page, "Beworben")).toHaveAttribute("aria-pressed", "true");
      await expect(stripButton(page, "Beworben")).toBeFocused();
      await expect(section(page, "Vorgemerkt")).toHaveCount(0);
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(2);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-filter-${size}-${scheme}`);
    });
  }
}

test("pressing the pressed phase shows all phases again", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?phase=beworben");
  await stripButton(page, "Beworben").click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(section(page, "Vorgemerkt")).toBeVisible();
});

test("an unknown phase in the URL shows all phases", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?phase=foo&abgeschlossen=yes&q=%20%20");
  await expect(section(page, "Vorgemerkt")).toBeVisible();
  await expect(strip(page).getByRole("button", { pressed: true })).toHaveCount(0);
});

test("an empty phase offers to show all and keeps focus on the strip", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications");
  await stripButton(page, "Angebot").click();
  await expect(section(page, "Angebot")).toContainText("In dieser Phase ist gerade keine Bewerbung.");
  await section(page, "Angebot").getByRole("button", { name: "Alle Phasen zeigen" }).click();
  await expect(stripButton(page, "Angebot")).toBeFocused();
  await expect(section(page, "Angebot")).toHaveCount(0);
});

test("the strip fits 375 px in two rows", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto("/applications");
  await expect(stripButton(page, "Abgeschlossen")).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  const box = await stripButton(page, "Abgeschlossen").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
```

- [ ] **Step 10: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 8: "Abgeschlossen" collapsed (controlled disclosure, lazy closed list, outcome rows)

**Files:**
- Create: `web/src/features/applications/ClosedSection.tsx`
- Modify: `web/src/ui/Disclosure.tsx` (optional controlled mode; existing callers unchanged), `web/src/features/applications/ApplicationsPage.tsx`, `applications.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/ui/contentPrimitives.test.tsx` (append to the `Disclosure` describe), `web/tests/unit/features/applications/closed.test.tsx`, `web/tests/e2e/applicationsClosed.spec.ts`

**Interfaces:**
- Consumes: `useClosedTotal`, `useClosedApplications`, `PhaseSection`, `RowTitle`, `RowCell`, `LoadMore` (Task 5), `PhaseEmpty`, `showAllPhases` (Task 7), `sortClosed`, `sinceOf`, `emptyKind` (Task 3), `flattenPages`, `listPhase`, `ListLoading`, `ListError`, `statusLabel` (`features/job/labels.ts`), `useJobFormat`.
- Produces: `Disclosure` accepts `open?: boolean` and `onOpenChange?: (open: boolean) => void` (controlled when `open` is given); `ClosedSection({ url }: { url: ApplicationsUrl })`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("Disclosure", ...)` of `web/tests/unit/ui/contentPrimitives.test.tsx`:

```tsx
  it("follows its open prop and reports toggles in controlled mode", async () => {
    const changes: boolean[] = [];
    const { rerender } = render(
      <Disclosure label="Abgeschlossen (2)" open={false} onOpenChange={(open) => changes.push(open)}>
        Inhalt
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Abgeschlossen (2)" });
    await userEvent.click(toggle);
    expect(changes).toEqual([true]);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    rerender(
      <Disclosure label="Abgeschlossen (2)" open onOpenChange={(open) => changes.push(open)}>
        Inhalt
      </Disclosure>,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inhalt")).toBeVisible();
  });
```

`web/tests/unit/features/applications/closed.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { applicationsStubs, type ApplicationsServer } from "../../support/applicationsRoutes";
import type { RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

function server(closed = true): ApplicationsServer {
  return {
    active: [buildListItem({ id: "a1", title: "Kotlin Developer", status: "APPLIED" })],
    closed: closed
      ? [
          buildListItem({ id: "c-old", title: "Engineering Manager", status: "ACCEPTED", status_changed_at: "2026-09-20T08:00:00Z" }),
          buildListItem({ id: "c-new", title: "Lead Developer", status: "REJECTED", status_changed_at: "2026-10-01T08:00:00Z" }),
        ]
      : [],
  };
}

const closedRowsAsked = (calls: RecordedCall[]) =>
  calls.some((call) => {
    const params = new URL(call.url).searchParams;
    return params.get("statuses")?.startsWith("ACCEPTED") && params.get("limit") !== "1";
  });
const toggle = () => screen.getByRole("button", { name: "Abgeschlossen (2)" });

beforeEach(() => liveNavigation.reset());

describe("ClosedSection", () => {
  it("starts collapsed with its count and loads no closed rows", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("button", { name: "Abgeschlossen (2)" })).toHaveAttribute("aria-expanded", "false");
    expect(closedRowsAsked(calls)).toBe(false);
  });

  it("opens through the URL, keeps focus on the toggle and shows the newest outcome first", async () => {
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Abgeschlossen (2)" }));
    expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?abgeschlossen=1", { scroll: false });
    expect(toggle()).toHaveFocus();
    const closed = await screen.findByRole("region", { name: "Abgeschlossen" });
    const rows = within(closed).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").textContent)).toEqual(["Lead Developer", "Engineering Manager"]);
    expect(rows[0]).toHaveTextContent("Abgesagt");
    expect(rows[0]).toHaveTextContent("01.10.2026");
    expect(rows[1]).toHaveTextContent("Zusage angenommen");
  });

  it("shows the closed phase open, without the toggle, when the strip filters to it", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("region", { name: "Abgeschlossen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abgeschlossen (2)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Beworben" })).not.toBeInTheDocument();
  });

  it("offers all phases when the closed filter is empty", async () => {
    liveNavigation.reset("phase=abgeschlossen");
    stubRoutes(applicationsStubs(server(false)));
    renderWithProviders(<ApplicationsPage />);
    const closed = await screen.findByRole("region", { name: "Abgeschlossen" });
    await userEvent.click(within(closed).getByRole("button", { name: "Alle Phasen zeigen" }));
    expect(screen.getByRole("button", { name: /^Abgeschlossen:/ })).toHaveFocus();
  });

  it("is absent when nothing is closed", async () => {
    stubRoutes(applicationsStubs(server(false)));
    renderWithProviders(<ApplicationsPage />);
    await screen.findByRole("region", { name: "Beworben" });
    // The strip appears only once the closed count answered, so the absence below is a real answer.
    expect(await screen.findByRole("button", { name: "Abgeschlossen: 0 Bewerbungen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abgeschlossen \(/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui/contentPrimitives.test.tsx tests/unit/features/applications/closed.test.tsx`
Expected: FAIL: the controlled `Disclosure` toggles itself (`aria-expanded` "true" after the click); no "Abgeschlossen (2)" button.

- [ ] **Step 3: Controlled mode for `Disclosure`**

Replace the props interface and the `Disclosure` function in `web/src/ui/Disclosure.tsx` (keep `DisclosureToggle` as it is):

```tsx
export interface DisclosureProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode (state in the URL): the parent owns `open` and hears every toggle. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Show/hide region (prototype .disclosure); the region stays in the DOM so aria-controls resolves. */
export function Disclosure({ label, children, defaultOpen = false, open, onOpenChange }: DisclosureProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const regionId = useId();
  const shown = open ?? ownOpen;
  const toggle = () => (onOpenChange ? onOpenChange(!shown) : setOwnOpen(!shown));
  return (
    <div className="disclosure-block">
      <DisclosureToggle label={label} open={shown} regionId={regionId} onToggle={toggle} />
      <div id={regionId} className="disclosure-body" hidden={!shown}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Dictionary keys**

`de.ts`:

```ts
  "applications.closed.toggle": "Abgeschlossen ({count})",
  "applications.col.outcome": "Ausgang",
  "applications.col.closedOn": "Abgeschlossen am",
```

`en.ts`:

```ts
  "applications.closed.toggle": "Closed ({count})",
  "applications.col.outcome": "Outcome",
  "applications.col.closedOn": "Closed on",
```

- [ ] **Step 5: Write `ClosedSection.tsx`**

```tsx
"use client";

import type { JobListItem } from "@/api/jobList";
import { emptyKind, sinceOf, sortClosed } from "@/domain/applications";
import { flattenPages, listPhase } from "@/domain/inbox";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { useJobFormat } from "@/features/job/format/useJobFormat";
import { statusLabel } from "@/features/job/labels";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { LoadMore } from "./ActiveSections";
import { RowCell, RowTitle } from "./ApplicationListRow";
import { PhaseSection } from "./PhaseSection";
import { PhaseEmpty, showAllPhases } from "./PhaseStrip";
import { useClosedApplications, useClosedTotal } from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

/**
 * Spec 4.2: Abgeschlossen is collapsed (state in ?abgeschlossen=1). With the strip's closed filter it
 * shows open without the toggle. The rows load only while shown (decision D2).
 */
export function ClosedSection({ url }: { url: ApplicationsUrl }) {
  const { t } = useI18n();
  const total = useClosedTotal(url.q);
  if (url.phase === "CLOSED") return <ClosedPhase url={url} />;
  if (url.phase || !total.data) return null;
  return (
    <div className="closed-toggle">
      <Disclosure
        label={t("applications.closed.toggle", { count: total.data })}
        open={url.closedOpen}
        onOpenChange={url.setClosedOpen}
      >
        {url.closedOpen ? <ClosedList q={url.q} count={total.data} /> : null}
      </Disclosure>
    </div>
  );
}

function ClosedPhase({ url }: { url: ApplicationsUrl }) {
  const total = useClosedTotal(url.q);
  if (total.data === undefined) {
    if (!total.isError) return <ListLoading stalled={total.failureCount > 0} />;
    return <ListError error={total.error} onRetry={() => void total.refetch()} />;
  }
  const empty = emptyKind({ q: url.q, phase: "CLOSED", shown: total.data, total: total.data });
  if (empty !== "phaseEmpty") return <ClosedList q={url.q} count={total.data} />;
  return (
    <PhaseSection phase="CLOSED" count={0}>
      <PhaseEmpty onShowAll={() => showAllPhases(url, "CLOSED")} />
    </PhaseSection>
  );
}

function ClosedList({ q, count }: { q: string; count: number }) {
  const list = useClosedApplications(q);
  const rows = sortClosed(flattenPages(list.data?.pages));
  const state = listPhase({
    hasData: list.data !== undefined,
    isError: list.isError,
    failureCount: list.failureCount,
    itemCount: rows.length,
  });
  return (
    <PhaseSection phase="CLOSED" count={count}>
      {state === "loading" || state === "stalled" ? <ListLoading stalled={state === "stalled"} /> : null}
      {state === "error" ? <ListError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {rows.length > 0 ? <ClosedRows rows={rows} /> : null}
      <LoadMore list={list} />
    </PhaseSection>
  );
}

function ClosedRows({ rows }: { rows: readonly JobListItem[] }) {
  return (
    <ul className="arows">
      {rows.map((item) => (
        <ClosedRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

/** Prototype renderClosedTable: job, outcome (never the raw status) and the closing date. */
function ClosedRow({ item }: { item: JobListItem }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const closedOn = sinceOf(item);
  return (
    <li className="arow">
      <RowTitle item={item} />
      <RowCell label="applications.col.outcome">{t(statusLabel(item.status))}</RowCell>
      <RowCell label="applications.col.closedOn">
        {closedOn ? format.date(closedOn) : t("applications.when.none")}
      </RowCell>
    </li>
  );
}
```

`LoadMore` takes `ApplicationsListQuery`; the closed list has the same type (same options factory). If the typecheck disagrees, widen `LoadMore`'s prop to `Pick<ApplicationsListQuery, "data" | "hasNextPage" | "isFetchingNextPage" | "fetchNextPage">` in `ActiveSections.tsx`.

- [ ] **Step 6: Place it and style it**

In `ApplicationsPage.tsx`, render `<ClosedSection url={url} />` directly after `<ActiveSections ... />` (before `<SearchStatus ... />`).

Append inside `@layer components` of `applications.css` (closed rows reuse the `.arow` grid, so their columns line up with the active ones):

```css
  .closed-toggle {
    margin-top: 44px;
  }
  .closed-toggle .mag {
    margin-top: 18px;
  }
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui tests/unit/features/applications`
Expected: PASS (the existing `Disclosure` tests still pass in uncontrolled mode).

- [ ] **Step 8: Write the e2e spec**

`web/tests/e2e/applicationsClosed.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { applicationsListPath } from "../../src/api/jobListPaths";
import { applicationsRoutes } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const CLOSED_ROWS_KEY = `GET ${applicationsListPath({ group: "closed", q: "" }, 0)}`;

test.beforeEach(async ({ page }) => fixNow(page));

const toggle = (page: Page) => page.getByRole("button", { name: "Abgeschlossen (2)" });
const closed = (page: Page) => page.getByRole("region", { name: "Abgeschlossen" });

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`Abgeschlossen opens with its outcomes at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
      const log = await mockApi(applicationsRoutes());
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      expect(log.requests).not.toContain(CLOSED_ROWS_KEY);
      await toggle(page).click();
      await expect(page).toHaveURL(/\?abgeschlossen=1$/);
      await expect(toggle(page)).toBeFocused();
      const rows = closed(page).getByRole("listitem");
      await expect(rows.locator(".arow-link")).toHaveText(["Lead Developer", "Engineering Manager"]);
      await expect(rows.nth(0)).toContainText("Abgesagt");
      await expect(rows.nth(0)).toContainText("01.10.2026");
      await expect(rows.nth(1)).toContainText("Zusage angenommen");
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `applications-closed-${size}-${scheme}`);
    });
  }
}

test("a deep link opens Abgeschlossen", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications?abgeschlossen=1");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
});

test("the strip's closed filter shows the outcomes without the toggle", async ({ page, mockApi }) => {
  await mockApi(applicationsRoutes());
  await page.goto("/applications");
  await page.getByRole("group", { name: "Phasen" }).getByRole("button", { name: /^Abgeschlossen/ }).click();
  await expect(closed(page).getByRole("listitem")).toHaveCount(2);
  await expect(toggle(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Beworben" })).toHaveCount(0);
});
```

- [ ] **Step 9: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 9: Live updates and focus keeping in the list

**Files:**
- Create: `web/src/features/applications/useListFocus.ts`
- Modify: `web/src/features/applications/ApplicationsPage.tsx`, `applications.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/applications/listFocus.test.tsx`, `web/tests/e2e/applicationsLive.spec.ts`

**Interfaces:**
- Consumes: `ActiveSections`, `ClosedSection` (Tasks 5-8), `APPLICATIONS_PAGE_SIZE` (Task 2), `applicationsRoutes`, `ACTIVE_ITEMS`, `CLOSED_ITEMS` (Task 5 fixtures), `pushEvent`, `setRoutes`, realtime `job_updated` (`{ type, user_id, job: { id } }`, `src/realtime/events.ts`; it invalidates `queryKeys.jobsRoot` and `queryKeys.jobCounts` for a job that is in any cached list, so no realtime code changes).
- Produces: `useListFocus(): RefObject<HTMLDivElement | null>`; the page wraps `ActiveSections` and `ClosedSection` in `<div id="applications-list" role="region" aria-label="Bewerbungen nach Phase" tabIndex={-1}>` (`LIST_ID = "applications-list"` exported from `useListFocus.ts`).

- [ ] **Step 1: Write the failing unit tests**

`web/tests/unit/features/applications/listFocus.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATIONS_PAGE_SIZE } from "@/api/jobList";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { LIST_ID, useListFocus } from "@/features/applications/useListFocus";
import { applicationsStubs } from "../../support/applicationsRoutes";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

/** Two lists; `where` says which list holds the job ("a", "b" or nowhere). */
function Lists({ where }: { where: "a" | "b" | "none" }) {
  const ref = useListFocus();
  const link = <a href="/jobs/job-7">Kotlin Developer</a>;
  return (
    <>
      <button type="button">Outside</button>
      <div id={LIST_ID} ref={ref} tabIndex={-1}>
        <ul>{where === "a" ? <li>{link}</li> : null}</ul>
        <ul>{where === "b" ? <li>{link}</li> : null}</ul>
      </div>
    </>
  );
}

beforeEach(() => liveNavigation.reset());

describe("useListFocus", () => {
  it("follows the focused job when its row moves to another section", async () => {
    const view = render(<Lists where="a" />);
    screen.getByRole("link", { name: "Kotlin Developer" }).focus();
    view.rerender(<Lists where="b" />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Kotlin Developer" })).toHaveFocus());
  });

  it("hands focus to the list when the focused row leaves it", async () => {
    const view = render(<Lists where="a" />);
    screen.getByRole("link", { name: "Kotlin Developer" }).focus();
    view.rerender(<Lists where="none" />);
    await waitFor(() => expect(document.getElementById(LIST_ID)).toHaveFocus());
  });

  it("leaves focus alone when it is outside the list", async () => {
    const view = render(<Lists where="a" />);
    screen.getByRole("link", { name: "Kotlin Developer" }).focus();
    screen.getByRole("button", { name: "Outside" }).focus();
    view.rerender(<Lists where="none" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });
});

describe("Weitere laden", () => {
  it("keeps focus in the list when the button leaves after the last page", async () => {
    const active = Array.from({ length: APPLICATIONS_PAGE_SIZE + 1 }, (_, index) =>
      buildListItem({ id: `d${index}`, title: `Drafted ${index}`, status: "DRAFTED" }),
    );
    stubRoutes(applicationsStubs({ active, closed: [] }));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("100 von 101 Bewerbungen geladen.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Weitere laden" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Weitere laden" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.getElementById(LIST_ID)).toHaveFocus());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications/listFocus.test.tsx`
Expected: FAIL: unresolved `@/features/applications/useListFocus`.

- [ ] **Step 3: Dictionary keys**

`de.ts`: `"applications.list.label": "Bewerbungen nach Phase",` — `en.ts`: `"applications.list.label": "Applications by phase",`

- [ ] **Step 4: Write `useListFocus.ts`**

```ts
"use client";

import { useEffect, useRef, type RefObject } from "react";

export const LIST_ID = "applications-list";

/** The href of the last focused link inside the list, "" for another element, null for none. */
type FocusMark = string | null;

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

function restoreFocus(container: HTMLElement, mark: FocusMark): void {
  if (mark === null || !focusLost()) return;
  const link = mark ? container.querySelector<HTMLElement>(`a[href="${CSS.escape(mark)}"]`) : null;
  (link ?? container).focus();
}

function markOf(target: EventTarget | null): FocusMark {
  return target instanceof HTMLAnchorElement ? (target.getAttribute("href") ?? "") : "";
}

/** Watches focus inside the list and repairs it after DOM changes; returns the cleanup. */
function watchFocus(container: HTMLElement): () => void {
  let mark: FocusMark = null;
  const onFocusIn = (event: FocusEvent) => (mark = markOf(event.target));
  // Focus that moved to another element outside the list is the user's choice; forget the mark.
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !container.contains(next)) mark = null;
  };
  const observer = new MutationObserver(() => restoreFocus(container, mark));
  container.addEventListener("focusin", onFocusIn);
  container.addEventListener("focusout", onFocusOut);
  observer.observe(container, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    container.removeEventListener("focusin", onFocusIn);
    container.removeEventListener("focusout", onFocusOut);
  };
}

/**
 * Decision D14: a refetch may move the focused row to another section (React remounts it), drop it
 * from the list, or remove "Weitere laden". Focus then goes to the same job's link, else to the list.
 */
export function useListFocus(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? watchFocus(ref.current) : undefined), []);
  return ref;
}
```

`watchFocus` is 19 lines; if formatting pushes it over 20, move the two listeners into `focusListeners(container, setMark)` returning both handlers.

- [ ] **Step 5: Wrap the list**

In `ApplicationsPage.tsx`, import `LIST_ID`, `useListFocus` and `useI18n`, call `const listRef = useListFocus();` and `const { t } = useI18n();` at the top of `ApplicationsPage`, and wrap the two sections:

```tsx
      <div
        id={LIST_ID}
        ref={listRef}
        className="apps-list"
        role="region"
        aria-label={t("applications.list.label")}
        tabIndex={-1}
      >
        <ActiveSections url={url} onResetSearch={search.reset} />
        <ClosedSection url={url} />
      </div>
```

The function now has 18 lines; if it exceeds 20 after formatting, move the wrapper into a `ApplicationsList({ url, onResetSearch })` component in the same file.

Append to `applications.css` inside `@layer components`:

```css
  /* Programmatic focus target (decision D14); keyboard focus still shows the ring. */
  .apps-list:focus:not(:focus-visible) {
    outline: none;
  }
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/applications`
Expected: PASS.

- [ ] **Step 7: Write the e2e spec**

`web/tests/e2e/applicationsLive.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import { ACTIVE_ITEMS, applicationsRoutes, CLOSED_ITEMS } from "./support/applicationsFixtures";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { fixNow, pushEvent } from "./support/jobFixtures";
import { setRoutes, type ApiLog } from "./support/mockApi";
import { saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const section = (page: Page, name: string) => page.getByRole("region", { name });
const connected = (log: ApiLog) => expect.poll(() => log.sockets.length).toBe(1);
const job7 = ACTIVE_ITEMS.find((item) => item.id === "job-7")!;
const others = ACTIVE_ITEMS.filter((item) => item.id !== "job-7");

/** The server after the job page set job-7 to Interview with a date (what a status write leaves). */
const invited: JobListItemBody = {
  ...job7,
  status: "INTERVIEW",
  next_follow_up_at: null,
  interview_at: "2026-10-15T08:00:00+00:00",
  status_changed_at: "2026-10-08T07:00:00+00:00",
};

async function focusKotlin(page: Page) {
  const link = page.getByRole("link", { name: "Kotlin Developer" });
  await link.focus();
  await expect(link).toBeFocused();
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  for (const scheme of COLOR_SCHEMES) {
    test(`a status change elsewhere moves the row and its focus at ${size}px in ${scheme} mode`, async ({
      page,
      mockApi,
    }) => {
      const routes = applicationsRoutes();
      const log = await mockApi(routes);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/applications");
      await connected(log);
      await focusKotlin(page);
      setRoutes(routes, applicationsRoutes({ active: [...others, invited] }));
      pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
      const moved = section(page, "Interview").getByRole("link", { name: "Kotlin Developer" });
      await expect(moved).toBeFocused();
      await expect(section(page, "Beworben").getByRole("listitem")).toHaveCount(1);
      await expect(page.getByText("6 aktiv · 1 fällig")).toBeVisible();
      await saveScreenshot(page, `applications-live-${size}-${scheme}`);
    });
  }
}

test("a row that leaves the list hands focus to the list", async ({ page, mockApi }) => {
  const routes = applicationsRoutes();
  const log = await mockApi(routes);
  await page.goto("/applications");
  await connected(log);
  await focusKotlin(page);
  const rejected = { ...job7, status: "REJECTED", status_changed_at: "2026-10-08T07:00:00+00:00" };
  setRoutes(routes, applicationsRoutes({ active: others, closed: [rejected, ...CLOSED_ITEMS] }));
  pushEvent(log, { type: "job_updated", job: { id: "job-7" } });
  await expect(page.getByRole("button", { name: "Abgeschlossen (3)" })).toBeVisible();
  await expect(page.locator("#applications-list")).toBeFocused();
});
```

- [ ] **Step 8: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green; copy the screenshots back.

---

### Task 10: E2E journeys (the phase-4 exit criterion "e2e applications green")

**Files:**
- Create: `web/tests/e2e/applicationsJourneys.spec.ts`
- Test: the file itself

**Interfaces:**
- Consumes: `ACTIVE_ITEMS`, `CLOSED_ITEMS`, `applicationsRoutes` (Task 5); `inboxRoutes`, `NEW_ITEMS`, `page` (`support/inboxFixtures.ts`); `jobBody`, `jobRoutes`, `fixNow`, `NOW_ISO`, `UPDATED` (`support/jobFixtures.ts`); `applicationsListPath`, `dueListPath`, `inboxListPath`, `ACTIVE_APPLICATION_STATUSES` (`src/api/jobListPaths.ts`, client-free); `MockResponse`, `MockRoutes`, `setRoutes`.
- Produces: four journeys over one stateful fake server, so every refetch after a click sees what the real server would answer (the pattern of `inboxJourneys.spec.ts`).

- [ ] **Step 1: Write the journeys**

`web/tests/e2e/applicationsJourneys.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import type { JobListItemBody } from "../../src/api/jobList";
import {
  ACTIVE_APPLICATION_STATUSES,
  applicationsListPath,
  dueListPath,
  inboxListPath,
  type ApplicationGroup,
} from "../../src/api/jobListPaths";
import type { JobDetailBody } from "../../src/api/jobs";
import { ACTIVE_ITEMS, applicationsCounts, applicationsRoutes, CLOSED_ITEMS } from "./support/applicationsFixtures";
import { inboxRoutes, NEW_ITEMS, page as pageOf } from "./support/inboxFixtures";
import { fixNow, jobBody, jobRoutes, NOW_ISO, UPDATED } from "./support/jobFixtures";
import type { MockResponse, MockRoutes } from "./support/mockApi";
import { expect, test } from "./support/test";

// The journeys of spec section 7 that cross Eingang, Bewerbungen and the job page. Per-feature
// assertions live in applications*.spec.ts; here a small fake server keeps the rows.

const NOW_UTC = new Date(NOW_ISO).toISOString();
const ACTIVE = new Set(ACTIVE_APPLICATION_STATUSES);
const CLOSED = new Set(["ACCEPTED", "REJECTED"]);
const DUE = new Set(["APPLIED", "INTERVIEW", "OFFER", "GENERATING"]);
const OPEN = new Set(["OPEN"]);
const live = (respond: (sent: unknown) => unknown): MockResponse => ({ body: null, respond });

class FakeServer {
  private readonly rows = new Map<string, JobListItemBody>();

  constructor(rows: readonly JobListItemBody[]) {
    for (const row of rows) this.rows.set(row.id, row);
  }

  get(id: string): JobListItemBody {
    return this.rows.get(id)!;
  }

  update(id: string, patch: Partial<JobListItemBody>): void {
    this.rows.set(id, { ...this.get(id), ...patch });
  }

  where(statuses: ReadonlySet<string>): JobListItemBody[] {
    return [...this.rows.values()].filter((row) => statuses.has(row.status) && !row.is_archived);
  }

  group(group: ApplicationGroup): JobListItemBody[] {
    return this.where(group === "active" ? ACTIVE : CLOSED);
  }
}

/** What GET /jobs/job-1 answers for the server's row (the job page reads the detail). */
function detailOf(row: JobListItemBody): JobDetailBody {
  return jobBody({
    status: row.status,
    cv_html_present: row.cv_html_present ?? false,
    cover_letter_html_present: row.cover_letter_html_present ?? false,
    next_follow_up_at: row.next_follow_up_at ?? null,
    interview_at: row.interview_at ?? null,
  });
}

function listResponses(server: FakeServer): MockRoutes {
  const groups: ApplicationGroup[] = ["active", "closed"];
  const entries = groups.flatMap((group): [string, MockResponse][] => [
    [`GET ${applicationsListPath({ group, q: "" }, 0)}`, live(() => pageOf(server.group(group)))],
    [
      `GET ${applicationsListPath({ group, q: "" }, 0, 1)}`,
      live(() => pageOf(server.group(group).slice(0, 1), server.group(group).length)),
    ],
  ]);
  return {
    ...Object.fromEntries(entries),
    [`GET ${dueListPath()}`]: live(() => pageOf(server.where(DUE))),
    "GET /jobs/counts": live(() => countsOf(server)),
  };
}

/** The real counts: the inbox badge (OPEN) changes too when a match is shortlisted. */
function countsOf(server: FakeServer) {
  const { status_counts } = applicationsCounts(server.group("active"), server.group("closed"));
  return { status_counts: { ...status_counts, OPEN: server.where(OPEN).length } };
}

/** job-1's detail, status change and date patch, all written into the fake server. */
function jobOneResponses(server: FakeServer): MockRoutes {
  return {
    "GET /jobs/job-1": live(() => detailOf(server.get("job-1"))),
    "POST /jobs/job-1/status": live((sent) => {
      server.update("job-1", { status: (sent as { to: string }).to, status_changed_at: NOW_UTC });
      return detailOf(server.get("job-1"));
    }),
    "PATCH /jobs/job-1": live((sent) => {
      server.update("job-1", sent as Partial<JobListItemBody>);
      return UPDATED.body;
    }),
  };
}

function journeyRoutes(server: FakeServer) {
  const routes = applicationsRoutes();
  return { ...jobRoutes(detailOf(server.get("job-1"))), ...routes, ...listResponses(server), ...jobOneResponses(server) };
}

const others = ACTIVE_ITEMS.filter((item) => item.id !== "job-1");
const job1 = ACTIVE_ITEMS.find((item) => item.id === "job-1")!;
const section = (page: Page, name: string) => page.getByRole("region", { name });
const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });

async function changePhase(page: Page, target: string) {
  await page.getByRole("button", { name: "Phase ändern" }).click();
  await page.getByRole("menuitemradio", { name: target }).click();
}

async function backToApplications(page: Page) {
  await page.locator(".crumbs").getByRole("link", { name: "Bewerbungen" }).click();
  await expect(page).toHaveURL(/\/applications$/);
}

test.beforeEach(async ({ page }) => fixNow(page));

test("a match shortlisted in Eingang shows up under Vorgemerkt", async ({ page, mockApi }) => {
  const server = new FakeServer([...NEW_ITEMS, ...others, ...CLOSED_ITEMS]);
  const java = NEW_ITEMS.find((item) => item.title === "Backend Engineer (Java)")!;
  await mockApi({
    ...inboxRoutes(),
    ...listResponses(server),
    [`GET ${inboxListPath("new", 0)}`]: live(() => pageOf(server.where(OPEN))),
    [`GET ${inboxListPath("new", 0, 1)}`]: live(() => pageOf(server.where(OPEN).slice(0, 1), server.where(OPEN).length)),
    [`POST /jobs/${java.id}/status`]: live((sent) => {
      server.update(java.id, { status: (sent as { to: string }).to, status_changed_at: NOW_UTC });
      return jobBody({ id: java.id, status: "DRAFTED" });
    }),
  });
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Vormerken: Backend Engineer (Java)" }).click();
  await expect(page.getByRole("link", { name: "Backend Engineer (Java)" })).toHaveCount(0);
  await nav(page).getByRole("link", { name: /Bewerbungen/ }).click();
  await expect(section(page, "Vorgemerkt").getByRole("link", { name: "Backend Engineer (Java)" })).toBeVisible();
  await expect(page.getByText("6 aktiv · 2 fällig")).toBeVisible();
});

test("applying from the job page moves the row to Beworben", async ({ page, mockApi }) => {
  const server = new FakeServer([...ACTIVE_ITEMS, ...CLOSED_ITEMS]);
  await mockApi(journeyRoutes(server));
  await page.goto("/applications");
  await section(page, "Vorgemerkt").getByRole("link", { name: job1.title! }).click();
  await expect(page).toHaveURL(/\/jobs\/job-1$/);
  await changePhase(page, "Beworben");
  await page.getByRole("dialog", { name: "Ohne fertige Unterlagen?" }).getByRole("button", { name: "Trotzdem auf Beworben setzen" }).click();
  await expect(page.getByRole("list", { name: "Phase der Bewerbung" }).locator('[aria-current="step"]')).toContainText("Beworben");
  await backToApplications(page);
  const row = section(page, "Beworben").getByRole("listitem").filter({ hasText: job1.title! });
  await expect(row.locator(".next-cell")).toHaveText("Auf Antwort warten");
  await expect(row.locator(".when-cell")).toHaveText("seit heute");
  await expect(section(page, "Vorgemerkt").getByRole("listitem")).toHaveCount(2);
});

test("Nachgefasst on the job page lowers the due count in the header and the nav", async ({ page, mockApi }) => {
  const overdue = { ...job1, status: "APPLIED", cv_html_present: true, cover_letter_html_present: true, next_follow_up_at: "2026-10-06T07:00:00+00:00" };
  const server = new FakeServer([overdue, ...others, ...CLOSED_ITEMS]);
  await mockApi(journeyRoutes(server));
  await page.goto("/applications");
  await expect(page.getByText("6 aktiv · 3 fällig")).toBeVisible();
  await expect(nav(page).getByRole("link", { name: /Bewerbungen/ }).locator(".count-badge")).toContainText("3");
  await section(page, "Beworben").getByRole("link", { name: job1.title! }).click();
  await page.getByRole("complementary", { name: "Nächster Schritt" }).getByRole("button", { name: "Nachgefasst" }).click();
  await expect(page.getByText(/Nachfassen festgehalten/)).toBeVisible();
  await backToApplications(page);
  await expect(page.getByText("6 aktiv · 2 fällig")).toBeVisible();
  await expect(nav(page).getByRole("link", { name: /Bewerbungen/ }).locator(".count-badge")).toContainText("2");
});

test("closing as rejected moves the row to Abgeschlossen", async ({ page, mockApi }) => {
  const applied = { ...job1, status: "APPLIED", cv_html_present: true, cover_letter_html_present: true };
  const server = new FakeServer([applied, ...others, ...CLOSED_ITEMS]);
  await mockApi(journeyRoutes(server));
  await page.goto("/jobs/job-1");
  await changePhase(page, "Abgeschlossen");
  await page.getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" }).getByRole("button", { name: "Absage erhalten" }).click();
  await expect(page.getByRole("list", { name: "Phase der Bewerbung" }).locator('[aria-current="step"]')).toContainText("Abgesagt");
  await backToApplications(page);
  await page.getByRole("button", { name: "Abgeschlossen (3)" }).click();
  const first = section(page, "Abgeschlossen").getByRole("listitem").first();
  await expect(first).toContainText(job1.title!);
  await expect(first).toContainText("Abgesagt");
  await expect(page.getByText("5 aktiv · 2 fällig")).toBeVisible();
});
```

Notes for the implementer:
- `jobRoutes` comes first in `journeyRoutes`, so the live answers of `listResponses` and `jobOneResponses` override its static `GET /jobs/job-1`; `applicationsRoutes()` adds the shell, the unkeyed-list guard and the search-free keys, which `listResponses` then replaces with live ones.
- The first journey's header counts: five other applications plus the shortlisted job (6 active); due: job-7 (overdue) and job-9 (interview tomorrow).
- If the job page shows a toast after the status change that covers the crumbs at 1440 px, wait for it or close it; never use `force: true`.
- If a journey needs a route that is not mocked (the auto fixture names it), add the real answer to the fake server; never set `allowUnexpectedApiCalls`.

- [ ] **Step 2: Run the journeys**

Run: `"$QA"/webrun.sh sh -c 'pnpm build && pnpm exec playwright test tests/e2e/applicationsJourneys.spec.ts'`
Expected: 4 passed. A failure that shows a product bug (not a test bug) is fixed in the owning feature file with a unit test first; record it in the report.

- [ ] **Step 3: Format and checkpoint**

Run the format command, then the checkpoint. Expected: all green, the whole e2e suite included.

---

### Task 11: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`

**Interfaces:**
- Consumes: the reports of Tasks 1-10 (test counts, doc lines, any deviation).
- Produces: documentation only; no code.

- [ ] **Step 1: Progress tracker**

In `context/progress-tracker.md`:
- Phase line: `**Phase:** Frontend redesign - phase 4 (Bewerbungen \`/applications\` with search, phase strip filter and due badge) done; next is phase 5 (sources).`
- Add a status-board row `**Frontend Redesign - Phase 4 backend**` ✅ (`server/routers/jobs.py`): `GET /jobs` items carry `status_changed_at` (latest status-history time, one grouped query per page) and `application_draft_present`; `q` is trimmed and matches `%`, `_`, `\` literally; test count from Task 1's report.
- Add a row `**Frontend Redesign - Phase 4 (applications)**` ✅ with the files (`web/src/features/applications/**`, `web/src/domain/applications.ts`, `web/src/domain/dueJobs.ts` (`countDue`), `web/src/features/shell/{useDueCount,useNavCounts,Sidebar}.ts(x)`, `web/src/ui/Disclosure.tsx` (controlled mode), `web/src/api/{jobList,jobListPaths,jobs,queryKeys}.ts`, `web/app/(app)/applications/page.tsx`, `web/tests/e2e/{applications,applicationsSearch,applicationsFilter,applicationsClosed,applicationsLive,applicationsJourneys,navDue}.spec.ts`, `web/tests/e2e/support/applicationsFixtures.ts`) and the key details (D1-D15 in one sentence each where they define behaviour: URL `?q=&phase=&abgeschlossen=1`; one active list grouped by effective phase; strip filter; rows; "fällig" = `isDue`, amber = `isWarning`; nav badge; no status changes here) plus the unit and e2e counts from Task 10's checkpoint.
- Open questions (only unresolved, blocking or user-facing): G7 (no score column, veto possible), G12 (dropped listing features: platform filter, sort control, bulk archive per company), G14 (search covers title and company only).

- [ ] **Step 2: Architecture**

In `context/architecture.md`, section 2:
- extend the `jobs.py` bullet with `status_changed_at`, `application_draft_present` and the literal `q`;
- add a `src/features/applications/` bullet: URL state (`useApplicationsUrl`, `router.replace`, `?q=&phase=vorgemerkt|beworben|interview|angebot|abgeschlossen&abgeschlossen=1`), data (`["jobs","applications",group,q]` infinite pages of 100 plus `["jobs","applications-total","closed",q]`, prefetched in parallel, `keepPreviousData` for searches; grouping by `phaseOf` because the server cannot filter by effective phase), header from `jobCountsQueryOptions` and `useDueCount` (same due query as the inbox card and the nav badge), the strip filter, the closed `Disclosure` (controlled, rows loaded only when shown), `useListFocus` (MutationObserver, same-href or list container), `SearchStatus` as the page's one live region;
- extend the `src/domain/` bullet with `applications.ts` and `countDue`;
- extend the tests bullet with `support/applicationsFixtures.ts` (counts and due list derived from the same rows) and `tests/unit/support/{applicationsRoutes,liveNavigation}.ts`.

- [ ] **Step 3: UI context**

In `context/ui-context.md`, section 0, add a **Bewerbungen (`/applications`)** bullet: masthead "n aktiv · m fällig" (over all applications) with the search field (280 px, full width below 768 px); phase strip (5 toggle buttons with counts and ticks, ink underline when pressed, 3 columns below 768 px); sections with 5 px stage rule, numbered 44 px title (32 px mobile), count and hint; rows on hairlines with stretched title link, next step (amber with clock only for deadlines, crimson with alert for a failed generation), "Seit / Fällig", Unterlagen; column head from 768 px, visible cell labels below; "Abgeschlossen (n)" disclosure; empty states; the Bewerbungen nav item carries the neutral due pill "n fällig".

- [ ] **Step 4: Checkpoint**

Run: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` and `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: all green (documentation changes nothing, the checkpoint proves the final state the docs describe).

---

## Self-Review

### 1. Spec coverage

| Spec item | Task |
|---|---|
| 4.2 header "n aktiv · m fällig" | 5 (deck), 4 (`useDueCount`) |
| 4.2 search | 1 (literal `q`), 2 (paths, `keepPreviousData`), 6 (field, debounce, URL, empty state, live status) |
| 4.2 phase sections, numbered masthead, count, one-line hint | 5 (`PhaseSection`, hints) |
| 4.2 Vorgemerkt/Entwurf (DRAFTED), Beworben, Interview, Angebot | 3 (`groupByPhase`, effective phase), 5 |
| 4.2 Abgeschlossen (ACCEPTED/REJECTED) collapsed | 8 |
| 4.2 rows: job, next step, since/due date, document state; open the job page | 1 (`status_changed_at`, `application_draft_present`), 2 (`checklist` in list items), 3 (`rowWhen`, `docState`), 5 (row) |
| 4.2 phase overview strip doubles as the filter | 7 |
| 4.2 no board view | D10, G6 (nothing built) |
| 4.1 due badge on 02 Bewerbungen | 4 |
| 4.3 #1 status changes only in the phase menu | D10 (no actions here); 10 (journeys change phases on the job page) |
| 4.3 #4 terminology ("Bewerbung" from Vorgemerkt on, headings match nav) | 5 (keys), masthead title `nav.applications` |
| 4.3 #5 a11y (row link, no nested interactive, focus rings, 13 px, 44 px) | 5 (row, CSS, style test), 7 (strip 44 px), 9 (focus) |
| 4.3 #7 mobile | 5, 6, 7 (CSS-only breakpoints), e2e at 390 and 375 |
| 4.4 nextStep single source for the applications column and the due badge | 3 (`buildRow`, `countDue`), 4, 5 |
| 5 colours (amber warnings, crimson errors, no inline styles, stage colours) | 5 (`isWarning`, `t-danger` + icon), CSS classes per stage |
| 6 query keys, realtime, error normaliser, states | 2 (keys under `["jobs"]`), 5-8 (states), 9 (realtime e2e) |
| 7 unit and e2e, screenshots 1440/390 light/dark, no console errors, 375 px | every UI task; 10 journeys |
| 8 phase 4 "e2e applications green" | 10 (and the specs of 4-9) |
| Inventory B.3 `/listings` status filter, search, board; dashboard stat tiles | 6, 7, G6, G12 |

No spec requirement is without a task.

### 2. Placeholder scan

Searched the plan for "TBD", "TODO", "implement later", "fill in", "similar to Task", "add appropriate", "handle edge cases": none. Every code step shows the code. Conditional instructions name the exact fallback (e.g. Task 5 `usePrefetchInfiniteQuery` typing, Task 8 `LoadMore` prop widening, Task 9 function split) instead of leaving a choice open.

### 3. Type and name consistency (across tasks)

- `ApplicationsQuery { group; q }`, `applicationsListPath(query, offset, limit?)`, `applicationsListQueryOptions(query)`, `applicationsTotalQueryOptions(query)`: Task 2 defines; Tasks 5, 6, 8, 9, 10 use the same names and argument shapes.
- `queryKeys.applicationsList(group, q)`, `queryKeys.applicationsTotal(group, q)`: Task 2; asserted in Task 2's tests; no other task builds keys by hand.
- `PhaseFilter`, `ActivePhase`, `PHASE_FILTERS`, `ACTIVE_PHASES`, `RowWhen` (`interview | answerBy | overdue | dueSoon` with `warn`, `since` with `today`, `none`), `DocState`, `ApplicationRow`, `PhaseGroups`, `EmptyKind`: Task 3; Tasks 5-8 import exactly these.
- `emptyKind({ q, phase, shown, total })`: Task 3 signature; Task 5 passes `phase: null, shown: 0`, Task 7 passes `url.phase` and `shownIn(...)`, Task 8 passes `phase: "CLOSED"`.
- `useApplicationsUrl()` returns `{ q, phase, closedOpen, setSearch, setPhase, setClosedOpen }` (Task 5); Tasks 6-8 call only these.
- `ActiveSections`: `{ url }` in Task 5, `{ url, onResetSearch }` from Task 6 on (Task 6 states the change; the page passes it).
- `LoadMore({ list })` (Task 5) is reused by `ClosedSection` (Task 8).
- `PhaseEmpty({ onShowAll })`, `showAllPhases(url, phase)`, `stripButtonId(phase)` (Task 7) reused in Task 8.
- `useDueCount(enabled?)` (Task 4) used by `useNavCounts` (Task 4) and `ApplicationsHeader` (Task 5).
- `LIST_ID` and `useListFocus()` (Task 9) used by the page and the unit test.
- e2e: `applicationsRoutes(data?, extra?)`, `applicationsCounts(active, closed)`, `listRoutesFor(q, rows)`, `ACTIVE_ITEMS`, `CLOSED_ITEMS` (Task 5) used by Tasks 6-10; `UNKEYED_LIST` exported from `inboxFixtures.ts` (Task 5).
- unit: `applicationsStubs`, `applicationsJobs`, `ApplicationsServer` (Task 5); `liveNavigation`, `navigationModule` (Task 6) used by Tasks 7-9.

### 4. Real-code name check (read on 2026-10-09 in `web/src` and `server/`)

Verified to exist with these exact names and shapes: `jobListItemSchema`, `JobListItem`, `JobListItemBody`, `JobPage`, `JobPageBody`, `fetchJobPage`, `nextOffset`, `dueApplicationsQueryOptions`, `inboxListPath`, `dueListPath`, `INBOX_TABS`, private `listPath(filters, offset, limit)` (`api/jobList.ts`, `api/jobListPaths.ts`); `queryKeys.jobsRoot`, `queryKeys.jobCounts` (`["job-counts"]`), `queryKeys.dueApplications` (`["jobs","due"]`), `INBOX_TRIAGE_KEY` (`api/queryKeys.ts`); `fetchJobCounts`, `openMatchCount`, `JobCounts`, private `checklistSchema`, `jobPath`, `changeJobStatus`, `patchJob` (`api/jobs.ts`); `describeError` (`api/describeError.ts`, 404 text "Das wurde nicht gefunden."); `nextStep(job, now, timeZone?)`, `isDue`, `isWarning`, `NextStep` with `kind`, `label`, `due`, `dueSoon`, `overdue`, `dateField`, `FOLLOW_UP_DAYS = 10` (`domain/nextStep.ts`); `dueEntries`, `MAX_DUE_ENTRIES` (`domain/dueJobs.ts`); `phaseOf`, `phaseOfStatus`, `phaseIndex`, `PHASES`, `Phase`, `isGenerating`, `effectiveStatus` (`domain/jobStatus.ts`); `documentPresence`, `PresenceSource` (`domain/documents.ts`); `calendarDaysBetween`, `isApiDate`, `parseApiDate` (`domain/calendar.ts`); `safeHref`, `hostOf` (`domain/links.ts`); `flattenPages`, `listPhase`, `ListStatus`, `INBOX_PATH` (`domain/inbox.ts`); `ListLoading` (exported), `ListError` (private, exported by Task 5) (`features/inbox/InboxList.tsx`); `hasDueFailed`, `DueCard` (`features/inbox/DueCard.tsx`); `PHASE_LABEL`, `statusLabel` ("Abgesagt" for REJECTED, "Zusage angenommen" for ACCEPTED) (`features/job/labels.ts`); `JobCrumbs` (links to `/applications` for non-inbox jobs), `JobMetaLine`, `ScoreBox` (`features/job/JobHeader.tsx`); `useJobFormat` (`date`, `dateTime`, `relativeDays`); `jobRoute` (`features/shell/routes.ts`); `navNumber`, `MAIN_NAV`, `navKeyForJob` (`features/shell/navigation.ts`); `useNavCounts`, `NavCounts` (`inbox`, `sourceErrors`), `NavBadge`, `NavLink` with `aria-hidden` number (`features/shell/Sidebar.tsx`, `useNavCounts.ts`); `Masthead` (`title`, `number`, `deck`, `actions`, `small`), `EmptyState` (`icon`, `title`, `children`, `actions`), `Notice`, `Button` (`size`, `variant`, `busy`, `icon`), `Icon`, `CountBadge` (`count`, `label`), `Disclosure` (`label`, `children`, `defaultOpen`), `Seg`, `cx` (`src/ui`); `useNow` (`lib/clock.ts`), `useDebouncedValue` (`lib/useDebouncedValue.ts`); i18n keys `nav.applications`, `phase.*`, `next.*.title`, `status.REJECTED`, `outcome.accepted`, `due.overdueSince`, `inbox.more`, `inbox.stalled`, `error.retry`, `job.untitled`, `job.unknownCompany`, `inbox.shortlistJob` ("Vormerken: {title}"), `loading`; e2e `mockApi` (`respond`, `ApiLog.calls`, `unexpected`), `setRoutes`, `AUTHENTICATED_ROUTES`, `listItem`, `page`, `NEW_ITEMS`, `inboxRoutes`, `jobBody`, `jobRoutes`, `READY`, `UPDATED`, `NOW_ISO`, `fixNow`, `pushEvent`, `SCREENSHOT_SIZES`, `COLOR_SCHEMES`, `VIEWPORTS.narrow`, `saveScreenshot`, `horizontalOverflow`; unit `stubRoutes`, `jsonResponse`, `RecordedCall`, `buildListItem`, `pageOf`, `renderWithProviders`, `createTestQueryClient`, `HTTP_OK` (`tests/unit/support/inboxRoutes.ts`); backend `_JOB_LIST_COLUMNS` (already contains `checklist` and `pre_generation_status`), `_job_list_item`, `_apply_search_filters`, `get_jobs`, `JobStatusHistory.changed_at`, `iso_utc`, `MAX_SEARCH_LENGTH = 200`, test helpers `_listed_ids`, `make_job`, `seed`, `api_client`.

Found and handled while checking: `shellBehaviour.test.tsx` mocks `fetchJobCounts` by module export, which does not reach a call inside `jobCountsQueryOptions` (Task 2 Step 5 adapts the mock; Task 4 Step 6 does the same for the due query); `inboxRoutes.ts`'s `listOf` would treat the active applications list as the due list (so Bewerbungen gets its own `applicationsRoutes.ts`); the list schema dropped `checklist` (G18); the prototype hint "zwei Wochen" contradicts `FOLLOW_UP_DAYS = 10` (copy says ten days).

### 5. Review Focus

Each of the five lines names tests that exist in the owning tasks (checked against the test titles above). Input classes considered and covered by ordinary tests rather than listed: a search of 200+ characters (Task 3 cap, `maxLength`), more than 100 active applications (Task 9 "Weitere laden"), a failed closed count (Task 7 `useStripCounts`, Task 8 `ClosedPhase`), dark mode (every UI task's screenshots), a job with no readable date (Task 3 `rowWhen` "none").
