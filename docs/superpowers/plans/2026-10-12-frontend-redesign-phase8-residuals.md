# Frontend Redesign Phase 8 (residual items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Briefs: `.superpowers/sdd/phase8/task-N-brief.md`; dispatch: `.superpowers/sdd/phase8/impl-N.txt`.

**Goal:** Close the residual items that phases 0-7b collected for "phase 8", so phase 9 (cutover) starts from a clean backlog.

**Scope decision (user, 2026-10-12):** Phase 8 is **not** the broad QA pass of spec section 8 ("all journeys, both themes, mobile, contrast, visual review vs. prototype"). It covers only the residual items listed in the triage table below. Backlog entries that were never tagged for phase 8 (security hardening, M13-M17, IP-keyed limits, gcTime for channel saves, ...) stay untouched.

**Exit criterion:** lint, typecheck, unit, e2e and the backend suite all green; every FIX item verified by a test or a screenshot; the tracker updated.

**Sources:** `context/progress-tracker.md` (Next Up & Backlog, Status Board phase 2 row, Open Questions), `context/ui-context.md` (popstate notes), `.superpowers/sdd/phase7a/{deferred-minors.txt,final-review.md,final-fix-report.md,progress.md}`, `.superpowers/sdd/phase7b/{deferred-minors.txt,final-review.md,final-fix-report.md,rulings.md}`, the phase 1 and phase 2 plans ("deferred to phase 8"). The SDD files of phases 0-6 are lost; the tracker is their record.

## Global Constraints

- Placement: Task 4 may change `server/` and `web/`; Task 13 changes only `context/` (and the ledger); every other task changes only `web/`. One implementer at a time; tasks run strictly in the numbered order. Re-read every shared file before editing it, edit surgically, never replace whole files.
- Functions at most 20 lines, at most 3 params (eslint enforces both). Split into named helpers; a frozen value object is the escape hatch for parameters.
- No lint disables of any kind. CSS only in `.css` files (no inline `style`, no CSS-in-JS), inside the existing `@layer components` blocks.
- Text at least 13 px (`var(--fs-13)` or larger); interactive targets 44 px.
- Amber (`t-warn`, `--warn`) for warnings; crimson (`t-danger`, `--danger`) only for errors and destructive actions.
- Never render server text: no `error.message`, `detail` or upstream text in the DOM; compare it at most. Fixed sentences through `describeError`, `refusalText` or a `MessageKey`.
- Focus never on `<body>`; move focus only through `ui/focus.ts` (`isFocusLost`, `focusNextFrame`, `closeThenFocus`).
- DE/EN parity: every key added or changed in `web/src/i18n/de.ts` exists in `en.ts`; no dead keys.
- No git, not even read-only. No subagents.
- Tests first: for a behaviour change, show RED then GREEN output verbatim in the report. A refactor proves unchanged behaviour with the existing tests plus the guard test its brief names.
- Checkpoint, all green, each as its own command:
  - `~/.cache/ai-job-analyzer-qa/webrun.sh lint`
  - `~/.cache/ai-job-analyzer-qa/webrun.sh typecheck`
  - `~/.cache/ai-job-analyzer-qa/webrun.sh test`
  - `~/.cache/ai-job-analyzer-qa/webrun.sh test:e2e`
  - Backend (Task 4, and once in Task 13): `source ~/.cache/ai-job-analyzer-qa/env.sh && cd server && python -m pytest -q`
  - Prettier on the repo, not the mirror: `. ~/.cache/ai-job-analyzer-qa/env.sh && cd $QA/web && pnpm exec prettier --write $REPO/web/src $REPO/web/tests`. Copy the screenshots of the final e2e run back to `web/tests/e2e/__screenshots__/`.

## USER items: asked first

The controller asks the six USER questions below **before Task 1 is dispatched** and records each answer in `.superpowers/sdd/phase8/progress.md`. Tasks 6-11 are conditional: each runs **only if its answer is "fix"**; otherwise it is skipped and Task 13 records the decision (backlog line or doc note). An answer that picks a different option than the brief's "fix" variant is written into `.superpowers/sdd/phase8/rulings.md` before that task is dispatched, and its `impl-N.txt` gets a rulings line.

| # | Question | Options | Recommendation | Task |
| --- | --- | --- | --- | --- |
| Q1 | Checkboxes: 44 px rows app-wide? (7a M18; today the base `.check` lifts to 44 px only below 768 px, the Firmen page at every width) | A: base `.check` 44 px at every width (one rule in `ui/styles/controls.css`, desktop forms get airier). B: keep 44 px on touch widths only; desktop stays at about 23 px (WCAG 2.5.8 24 px borderline). | **A** (the 44 px target rule is a global constraint) | 6 |
| Q2 | Undo keyboard reach (M10): the toast is the last tab stop, after up to 150 inbox stops; its 10 s run out first. | A: Ctrl+Z / Cmd+Z outside text fields triggers the newest toast's "Rückgängig" (with `aria-keyshortcuts` and a visible "Strg+Z" hint). B: a skip link to the notifications region. C: keep; "Von dir aussortiert" and Bewerbungen remain the recovery path. | **C** (a working recovery path exists; a global shortcut adds a new app-wide key contract for a rare need) | 7 |
| Q3 | Search copy (7b T12): the OPEN phase label "Treffer" and the count line "4 Treffer" read alike in the search dialog. | A: count line "4 Ergebnisse" / "1 Ergebnis" (DE only; EN already says "results"). B: rename the OPEN phase label app-wide. C: keep. | **A** | 8 |
| Q4 | Due interview in Bewerbungen (N3): the row shows "Termin 09.10.2026", the inbox due card "in 1 Tag". | A: within the due window (`DUE_WINDOW_DAYS` = 2) "Termin heute" / "Termin in 1 Tag" / "Termin in 2 Tagen", the absolute date otherwise; no amber. B: keep the absolute date. | **A** (one wording for the same date) | 9 |
| Q5 | Browser Back away from a section with unsaved changes (R11; links and reload are guarded, Back is not). | A: an app-wide guard in `ui/UnsavedChanges` with a sentinel history entry and the existing leave dialog (Next.js App Router has no blocking API, so it works around the router's popstate handling). B: keep unguarded; document it. | **B** (fragile against router internals; the risk is limited to in-progress edits, reload/close stay guarded) | 10 |
| Q6 | "Im Hintergrund" counts crawls only; generation, interview prep, analysis and company research show on their own page (phase 2 deferral, 7b T10). | A: also count and list the running job tasks of this tab (client-side pending tasks; lost on reload, other tabs not seen). B: keep crawls only; record the deviation from spec 4.1/4.3 #6. | **B** (the server keeps no state for these tasks, so a count would be tab-local and misleading) | 11 |

## Triage

| # | Item | Source | Bucket | Reason |
| --- | --- | --- | --- | --- |
| 1 | Remaining rAF focus moves (`CvImport`, `useTemplateActions`, `crawlFocus`) to the shared helpers | tracker "Phase 8 notes (phase 7b)"; 7a progress.md follow-up | FIX (T1) | Three call sites, helpers exist; one focus rule app-wide. |
| 2 | Double focus move after an admin profile delete (h2, then h1) | 7b final-review M5, final-fix-report "deferred to Phase 8" | FIX (T2) | Two headings announced; local guard in `useKeepFocus`. |
| 3 | Rename `profileGone.ts` (it exports `DETAIL_HEADING_ID`, `leaveForHeading`, ...) | 7b deferred-minors T11, final-fix-report | FIX (T2) | Same folder as #2, five imports; the name misleads. |
| 4 | One wrong-password check and a shared `HTTP_BAD_REQUEST` | 7b final-review M4, final-fix-report | FIX (T3) | Drift risk, and a real bug: `FactoryReset`/`PasswordForm` match `code === "BAD_REQUEST"`, which `errors.ts` also gives every unmapped status (408), so a timeout reads as "wrong password". |
| 5 | Env-only local model address warns falsely in Routing | 7b final-review M9, tracker backlog | FIX (T4) | A false warning for a working setup; one boolean in the answer. |
| 6 | Screenshot specs settings-notifications and settings-channels-smtp capture before content loads | tracker "Phase 8 notes"; 7a progress.md | FIX (T5) | Wrong screenshots are review evidence; wait for the content. |
| 7 | `role="list"` on lists with `list-style: none` (app-wide check) | 7b deferred-minors T7, final-fix-report | FIX (T12) | Safari/VoiceOver drops list semantics for unstyled lists; 38 lists, mechanical, guard test. |
| 8 | Checkbox touch targets | tracker (7a M18), 7a final-review M18 | USER (Q1, T6) | App-wide density decision. |
| 9 | Undo keyboard reach | tracker (M10) | USER (Q2, T7) | New shortcut contract vs. existing recovery path. |
| 10 | "Treffer" vs. "N Treffer" | tracker "Phase 8 notes"; 7b deferred-minors T12 | USER (Q3, T8) | Copy. |
| 11 | Relative date for a due interview | tracker (N3) | USER (Q4, T9) | Copy. |
| 12 | Back/Forward dirty guard (popstate) | tracker "Phase 8 notes"; ui-context section 0 (Einstellungen, R11 lines); 7a T4/T11 reports; 7b R11 | USER (Q5, T10) | Fragile workaround vs. documented gap. |
| 13 | Job tasks in the sidebar activity; research not counted | tracker phase 2 row ("deferred to phase 8"), phase 2 plan contradiction 9; tracker backlog "Shell activity misses research (7b T10)" | USER (Q6, T11) | Spec requirement vs. tab-local data; one question for both. |
| 14 | Cross-tab events: a job shortlisted in another tab appears on `/applications` only at the next refetch | tracker (N2) | BACKLOG | The drop rule is spec 6 by design and focus refetch is off on purpose (`queryClient.ts`); two-tab edge case that heals at the next refetch. |
| 15 | Full-page screenshot artefact (mobile tab bar mid-page, sidebar stops at the viewport) | tracker "Phase 8 notes"; 7b R11 | BACKLOG | Capture artefact of `fullPage: true` with fixed elements, not a UI bug; fixing it re-baselines about 300 screenshots. |
| 16 | Contrast assertions in e2e | phase 1 plan (hand-off), phase 2 plan (hand-off) | BACKLOG | Part of the broad QA pass the user dropped from phase 8. |
| 17 | Two `role="status"` regions in the search dialog while loading | 7b deferred-minors T12 | BACKLOG | The count line is empty while loading, so only the skeleton speaks; no defect found. |
| 18 | Search quota and freshness | tracker backlog (7b T12, accepted) | BACKLOG | Accepted in 7b; needs a cache-root change, not a residual fix. |
| 19 | `useResultKeys` name | 7b deferred-minors T12 ("brief-mandated, keep") | BACKLOG | Ruled "keep" in 7b; no action and no tracker line. |

Totals: 6 FIX items in 6 tasks (T1-T5, T12), 6 USER questions (T6-T11, conditional), 6 BACKLOG.

## Tasks

Execution order is the numbering. Web tasks run serially. File overlap: T9 and T12 both touch `ApplicationListRow.tsx`; T8 and T12 touch the search feature (T8 only `i18n`); T12 runs last of the web tasks on purpose and re-reads every file.

### Task 1: Shared focus helpers at the last three rAF sites (FIX #1)

**Files:** modify `web/src/features/profile/cv/CvImport.tsx` (`thenRefocus`), `web/src/features/profile/templates/useTemplateActions.ts` (`focusPreviewOf`), `web/src/features/sources/crawl/crawlFocus.ts` (`useFocusHandoff`); create `web/tests/unit/ui/focusMoves.test.ts`.

- [ ] RED: guard test that no file under `web/src` other than `ui/focus.ts` calls `requestAnimationFrame` (fails with the three files listed).
- [ ] `thenRefocus` uses `closeThenFocus(action, () => document.getElementById(BUTTON_ID))`; `focusPreviewOf` and `useFocusHandoff` use `focusNextFrame` with a target function that keeps their current guard (returns `null` when focus is not ours).
- [ ] GREEN: the guard test; existing `cvImport`, `templatesSection`, `crawl` unit tests and `profileCvImport`, `profileTemplates`, `sourcesCrawl` e2e stay green unchanged.
- [ ] Checkpoint.

### Task 2: Company detail: one focus owner after a profile delete; rename `profileGone.ts` (FIX #2, #3)

**Files:** modify `web/src/features/companies/CompanyResearchPanel.tsx` (`useKeepFocus`); rename `web/src/features/companies/profileGone.ts` to `afterProfileAction.ts` and update its importers `CompaniesPage.tsx`, `CompanyAdminActions.tsx`, `CompanyDetail.tsx`, `RenameCompanyDialog.tsx`; test `web/tests/unit/features/companies/companyAdmin.test.tsx`.

- [ ] RED: unit test "after Profil löschen the profile h2 never takes focus; the h1 has it" (a `focus` listener on `#company-profile-h` records calls).
- [ ] `useKeepFocus` skips the "profile -> none" transition: that one is owned by the admin action (`leaveForHeading`, also the 404 path `useProfileGone`).
- [ ] Rename the file (no re-export shim), fix the imports.
- [ ] GREEN: new test, the existing companies unit tests and `companyAdmin.spec.ts` (h1 after delete, ruling 28).
- [ ] Checkpoint.

### Task 3: One wrong-password check; shared 400 constant (FIX #4)

**Files:** modify `web/src/features/profile/refusals.ts` (add `HTTP_BAD_REQUEST`), create `web/src/features/settings/wrongPassword.ts`, modify `web/src/features/settings/admin/WipeDialog.tsx`, `web/src/features/settings/account/FactoryReset.tsx`, `web/src/features/settings/account/PasswordForm.tsx`, `web/src/features/sources/wizard/useLinkCheck.ts`; tests `web/tests/unit/features/settings/accountSection.test.tsx`, `system.test.tsx`.

- [ ] RED: a 408 on "Alles zurücksetzen" and on the password change shows no "Das aktuelle Passwort stimmt nicht." but the generic toast.
- [ ] `isWrongPassword(error)`: `ApiError` with `status === HTTP_BAD_REQUEST` (status, not code). Used by all three dialogs; the wipe keeps its `ADMIN_REFUSAL.wrongPassword` comparison through an optional `detail` argument.
- [ ] `WipeDialog` and `useLinkCheck` import `HTTP_BAD_REQUEST` from `features/profile/refusals.ts`; their local constants go.
- [ ] GREEN: new tests plus the existing account, system and wizard tests.
- [ ] Checkpoint.

### Task 4: Local model address from the environment (FIX #5)

**Files:** `server/routers/admin.py` (`_settings_answer`), `server/tests/test_admin_contract.py`; `web/src/api/admin.ts` (`aiSettingsSchema`), `web/src/features/settings/admin/routing.ts` (`RoutingCheck`, `routingWarnings`), `web/tests/unit/features/settings/routingForm.test.tsx`, plus any e2e FakeServer that builds an `AiSettings` answer (search `ollama_base_url` in `web/tests/e2e/support`).

- [ ] RED (backend): with `OLLAMA_BASE_URL` set and no stored address, `GET /admin/settings` answers `ollama_base_url: ""` and `ollama_base_url_from_env: true`; without the env `false`; the env value itself never appears in the answer.
- [ ] `_settings_answer` adds `"ollama_base_url_from_env": bool(os.getenv("OLLAMA_BASE_URL", "").strip())`.
- [ ] RED (web): local routing with an empty stored address but `ollama_base_url_from_env: true` shows no "Für lokale Aufgaben fehlt die Adresse …".
- [ ] Schema `ollama_base_url_from_env: z.boolean().catch(false)`; `routingWarnings` warns only when both are missing.
- [ ] GREEN, backend suite, web checkpoint.

### Task 5: Screenshot specs wait for their content (FIX #6)

**Files:** `web/tests/e2e/settings.spec.ts` (section screenshot loop), `web/tests/e2e/settingsChannels.spec.ts` (SMTP screenshot test).

- [ ] Reproduce: delay the late-loading mock route by 1 s (temporary) and show that the screenshot catches the loading state; quote it.
- [ ] Before the screenshot loop: each section waits for a section-specific ready locator and for `[aria-busy="true"]` count 0 inside `main`.
- [ ] Verify: both specs with `--repeat-each=10` green; look at the 8 + 12 produced screenshots (no skeleton). Remove the temporary delay.
- [ ] Checkpoint.

### Task 6 (only if Q1 = fix): Checkboxes 44 px at every width

**Files:** `web/src/ui/styles/controls.css` (`.check`, `.check input`), `web/src/ui/styles/content.css` (the `@media (max-width: 767px)` `.check` lift), `web/src/features/companies/companies.css` (its `.check` override), the raw checkbox row in `web/src/features/sources/wizard/LinksStep.tsx` if it is under 44 px (its CSS in `sources.css`); e2e `web/tests/e2e/settingsAccount.spec.ts`.

- [ ] RED: e2e at 1440 px: each Konto archive-all `.check` label is at least 44 px high.
- [ ] Base `.check`: `min-height: 44px; align-items: center;`, `.check input { margin: 0; }`; drop the overrides it makes redundant.
- [ ] GREEN; screenshots of Konto, profile, drawer, job checklist reviewed in both themes.
- [ ] Checkpoint.

### Task 7 (only if Q2 = fix): Undo by keyboard shortcut

**Files:** `web/src/ui/ToastProvider.tsx`, `web/src/ui/toast.ts` if needed, `isTypingTarget` (move from `features/shell/GlobalSearch.tsx` to `web/src/ui/keyboard.ts` if `ui` may not import `features`), `de.ts`/`en.ts`; tests `web/tests/unit/ui/toast.test.tsx`, `web/tests/e2e/inboxTriage.spec.ts`.

- [ ] RED: unit: with an action toast shown, Ctrl+Z and Meta+Z on the body run the action once and dismiss the toast; inside a text field nothing happens; without an action toast nothing happens. e2e: Aussortieren, Ctrl+Z, the job is back under Neu.
- [ ] One document `keydown` listener while an action toast is live; the newest action toast wins; the button gets `aria-keyshortcuts="Control+Z Meta+Z"` and a visible hint.
- [ ] GREEN, checkpoint.

### Task 8 (only if Q3 = fix): Search count says "Ergebnisse"

**Files:** `web/src/i18n/de.ts` (`search.found`, `search.foundOne`); tests that assert the old text (`web/tests/unit/features/shell/globalSearch.test.tsx:98`, `web/tests/e2e/search.spec.ts:56`).

- [ ] RED: the tests expect "2 Ergebnisse" / "1 Ergebnis".
- [ ] Change the two DE values; EN stays ("results"/"1 result").
- [ ] GREEN, checkpoint.

### Task 9 (only if Q4 = fix): Relative date for a due interview

**Files:** `web/src/domain/applications.ts` (`DueKind`, `dueKind`), `web/src/features/applications/ApplicationListRow.tsx` (`whenText`); tests `web/tests/unit/domain/applications.test.ts` (its case "shows the interview date, neutral even when it is tomorrow" changes), `web/tests/e2e/applications.spec.ts:64` ("Termin 09.10.2026").

- [ ] RED: an interview tomorrow reads "Termin in 1 Tag", today "Termin heute", in 5 days (outside the window) the absolute "Termin TT.MM.JJJJ", none of them amber.
- [ ] New kind `interviewSoon` for an interview inside the due window that is not overdue; `whenText` renders it with `format.relativeDays`.
- [ ] GREEN, checkpoint.

### Task 10 (only if Q5 = fix): Back/Forward dirty guard

**Files:** `web/src/ui/UnsavedChanges.tsx`; tests `web/tests/unit/ui/unsavedChanges.test.tsx`, `web/tests/e2e/settingsJourneys.spec.ts`; `context/ui-context.md` lines on R11 in Task 13.

- [ ] RED: unit: dirty + `popstate` opens the leave dialog and the router's popstate listener does not run; e2e: dirty Konto password form, `page.goBack()`, the dialog shows, the URL stays; "Änderungen verwerfen" goes back; a clean page goes back at once.
- [ ] Sentinel entry while dirty, capture-phase `popstate` listener on `window` that stops the router's handler, re-push on "stay", `history.back()` on "leave", silent removal of the sentinel when the page becomes clean.
- [ ] GREEN, checkpoint (full e2e: every journey with history).

### Task 11 (only if Q6 = fix): Job tasks in "Im Hintergrund"

**Files:** `web/src/features/shell/ActivityButton.tsx`, `web/src/features/shell/ActivityPanel.tsx`, `web/src/realtime/usePendingTasks.ts`, `de.ts`/`en.ts`; tests `web/tests/unit/features/shell.test.tsx` (activity cases), `web/tests/e2e/shell.spec.ts`.

- [ ] RED: a running generation and a running research count in "2 Aufgaben laufen" next to no crawl, and appear in the panel with a fixed label; a stalled or failed one does not count.
- [ ] Count = running crawls + pending tasks in phase `running`; panel rows with a fixed label per task kind.
- [ ] GREEN, checkpoint.

### Task 12: `role="list"` on every list (FIX #7)

**Files:** every `<ul>` / `<ol>` in `web/src/**/*.tsx` (38 sites, listed in the brief); create `web/tests/unit/ui/listRoles.test.ts`.

- [ ] RED: guard test: every `<ul` / `<ol` in `web/src` is followed by `role="list"` as its first attribute (fails with 38 sites).
- [ ] Add `role="list"` as the first attribute at each site.
- [ ] GREEN; `getByRole("list")` queries unchanged; lint clean (no `no-redundant-roles` disable: if a rule fires, stop and report).
- [ ] Checkpoint.

### Task 13: Context docs; close phase 8

**Files:** `context/progress-tracker.md`, `context/ui-context.md`, `context/code-standards.md` (only if a rule changed), `context/architecture.md` (Task 4's answer field), `.superpowers/sdd/phase8/progress.md`.

- [ ] Phase line: phase 8 (residual items) done; next is phase 9 (cutover).
- [ ] Status Board: row "Frontend redesign - phase 8 (residual items)" ✅ with the changed files and the test counts.
- [ ] Backlog: remove every item that a FIX or a "fix" answer closed; turn each "keep" answer into its decision (backlog line or doc note); keep the six BACKLOG items, reworded without "Phase 8" (Phase 9 or later).
- [ ] ui-context: the R11 popstate sentences (Einstellungen) per the Q5 outcome; the activity note per Q6; the checkbox rule per Q1.
- [ ] Backend suite once; no web change, so no web checkpoint.
