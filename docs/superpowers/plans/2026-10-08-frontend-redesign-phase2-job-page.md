# Frontend Redesign Phase 2 (Job Page `/jobs/[id]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one job view `/jobs/[id]` of the new app: header with score, read-only phase track plus a guarded "Phase ändern" menu, the sticky "Nächster Schritt" card (apply checklist, Termine & Daten), and the five tabs Passung, Unterlagen, Firma, Interview and Verlauf, against the phase-0 backend, with realtime updates and Playwright journeys.

**Architecture:** Pure rules live in `web/src/domain/` (status-machine mirror, phase track, status guards, `nextStep(job, now)`, checklist, to-dos, reasoning and markdown parsing, pending background tasks) and are unit tested exhaustively. Server state stays in TanStack Query: every job sub-resource is keyed under `["job", id, ...]`, so the existing realtime invalidation of `["job", id]` refreshes all of them; background tasks that have no server state (re-analysis, interview prep, company research, PDF re-render) are tracked in one query-cache entry that `applyEvent` updates. Screens live in `web/src/features/job/`, one folder per tab; the route file stays thin.

**Tech Stack:** unchanged from phase 1 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (sections 4.2 job page row, 4.3, 4.4, 5, 6, 7; phase 2 in section 8). Visual and behavioural source of truth: `docs/prototype/clickdummy-editorial.html` (`renderJobDetail`, `renderNextPanel`, `renderStepper`, `renderApplyChecklist`, `renderApplyWithout`, `renderDocRow`, `renderPreview`, `renderDimPanel`, `tabFit`, `tabCompany`, `tabInterview`, `tabHistory`, `markApplied`, `stepTo`, `followUp`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (items 5, 6, 8, 17, 18, 21, 22). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.2, A.6, A.9, B.3 `/jobs/[id]`, B.4, CompanyProfileView).

## Global Constraints

- **Placement:** all code in `web/`; `frontend/` and `server/` stay untouched. Backend gaps are listed below for the controller to rule on; no task changes the backend.
- **Phase-1 fix wave is the base.** These land before this plan starts and are *not* re-planned here: `api.requestBlob` and FormData bodies in `src/api/client.ts`; `formatDate`, `formatDateTime`, `formatRelativeDays` in `src/i18n`; `.meta` in `src/theme/base.css`; `.tag` with `--line`; bottom-bar badges; the e2e auto fixture failing on console errors with a per-test allow-list. Task 0 records their exact signatures; later tasks use them only through the adapters Task 0 writes.
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`.
- **React lint (eslint-plugin-react-hooks 7, recommended incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`, created in Task 0, tested in Task 7), no synchronous `setState` in an effect body, no ref reads during render.
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}` (the parity test checks them).
- **Server state:** TanStack Query only. "Mutations update the cache optimistically only where undo exists (discard, keep, status) and otherwise invalidate" (spec 6).
- **Realtime:** all updates through `src/realtime/applyEvent.ts`. No polling anywhere in this phase. Where no event exists (interview-prep and research failures), a running task turns "stalled" after `STALL_AFTER_MS` = 3 minutes and offers a retry; that is a clock check, not a request.
- **Errors:** `describeError(error, t, overrides?)`; never show server `detail` or `generation_error` text. Allow-listed meanings only through explicit override maps.
- **Visual hard rules (spec 5):** no gradients (the crop marks of the A4 proof are 1px lines drawn with `linear-gradient` backgrounds, ported from the prototype, and are not a visual gradient), no pulsing dots, vermilion only for the next move, strong scores, the active nav item and primary buttons; errors crimson plus icon plus words.
- **Accessibility (spec 4.3 #5):** visible focus rings, control borders >= 3:1 (`--line-control`), meaningful meta text >= 13px, hit targets >= 44px on mobile, no nested interactive elements.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a command:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/nextStep.test.ts`
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror). If formatting pushes a function above 20 lines, split it into a named helper; never disable the rule.
- **Checkpoint:** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'` -> all four exit 0.
- **E2E:** `"$QA"/webrun.sh pnpm test:e2e` (builds against the mock API, then runs Playwright). Screenshots land in the mirror; copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Lockfile:** this phase adds no dependency. If a step ever runs `pnpm add`, copy `$QA/web/pnpm-lock.yaml` back to `$REPO/web/pnpm-lock.yaml`.

## Review Focus

1. **A PATCH of the checklist with only one key** silently resets the other two (the backend replaces the whole object, `extra="forbid"`, defaults `false`). Every checklist write must send all three keys. Test: Task 5 `setChecklistItem` "keeps the other two keys", Task 12 "sends all three keys when ticking one".
2. **Backend realtime payload `status` lies:** `ai.render_document_pdf` publishes `status: "DRAFTED"` (or `"FAILED"`) without changing the job. The client must never take a status from an event, only refetch. Test: Task 7 "a render event does not write the event status into the cache".
3. **Generation started on an advanced application** (`APPLIED` -> `GENERATING` -> back to `APPLIED`): the phase track, the nav highlight and the next step must not fall back to "Vorgemerkt" when the server tells us the remembered status. Test: Task 4 `phaseOf` "keeps an advanced phase while generating", Task 5 "regenerating for an applied job keeps the applied next step".
4. **Dates without an offset** (`"2026-10-08T09:00:00"`, SQLite/naive columns) must be read as UTC, not local time, and "due within 2 calendar days" must count calendar days in the user's zone (23:30 today vs 00:30 tomorrow is 1 day). Test: Task 1 `parseApiDate` "treats a missing offset as UTC" and `calendarDaysBetween` "counts calendar days, not 24-hour blocks".
5. **A PDF that the browser cannot show inline** (mobile browsers, `navigator.pdfViewerEnabled === false`) must still be readable: the preview offers "PDF öffnen" (blob URL in a new tab) and download instead of an empty box, and object URLs are revoked when the document changes or the page unmounts. Test: Task 8 `A4Preview` "offers open and download when inline PDFs are unsupported" and Task 16 `useObjectUrl` "revokes the previous URL".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | PDF preview under `X-Frame-Options: DENY` | Fetch the PDF with `api.requestBlob` and show it from a `blob:` URL in an `<object type="application/pdf">` inside the `A4Preview` primitive. A blob URL carries no response headers, so the DENY header does not apply. If `navigator.pdfViewerEnabled === false` (most mobile browsers) the paper shows "PDF öffnen" (opens the blob URL in a new tab, the native full-screen viewer) and "Herunterladen" instead. No backend header change, no pdf.js dependency. |
| D2 | "Phase ändern ▾" semantics | A real WAI-ARIA **menu button**: `button[aria-haspopup="menu"]` + `role="menu"` with `role="menuitemradio"` items (`aria-checked` on the current phase), roving focus with ArrowUp/ArrowDown/Home/End, Escape and Tab close it and return focus to the button. Why: the content is a short list of mutually exclusive commands, which is what the menu pattern is for; a dialog-style popover would put the user in a focus trap for a one-click choice. Implemented as the new primitive `ui/Menu.tsx` on the shared `layerStack`. |
| D3 | Phase menu targets | Vorgemerkt, Beworben, Interview, Angebot, Abgeschlossen. "Treffer"/`OPEN` is not offered (usability #5 and #17); `OPEN` jobs use Vormerken/Aussortieren in the next card. |
| D4 | Closing outcomes | "Zusage angenommen" -> `ACCEPTED`; "Absage erhalten" -> `REJECTED`; "Selbst abgesagt" -> `REJECTED` with the history note "Selbst abgesagt" (the backend has no `WITHDRAWN`). |
| D5 | Interview date and offer deadline | One date, `next_follow_up_at`, with a phase-dependent label: Beworben "Nachfassen am", Interview "Interviewtermin", Angebot "Antwort bis". `nextStep` reads it per phase. See backend gap G2 for the cleaner alternative. |
| D6 | Fit feedback ("Bewertung stimmt nicht") | Dropped. No endpoint stores it, and a client-only form would promise an effect ("hilft künftigen Bewertungen") that does not exist. See G1. |
| D7 | Generation progress | Honest step text without fake percentages: "Auftrag angenommen" while the start request runs, then "Wird geschrieben und als PDF gesetzt" plus "gestartet um 14:02" when this tab started it (the start time is kept in the pending-task cache; after a reload the time is unknown and omitted), then done via `job_update`. No ticking timer. See G5. |
| D8 | CV notes | The CV task reads `jobs.cv_draft` as notes (inventory A.13 #10). "Lebenslauf neu erstellen" therefore PATCHes `cv_draft` with the note (or `""`, so an old note is not reused) and then POSTs `generate-package` with `generate_cv` only. The letter uses `POST /generate {improvement_notes}`. "Beide erstellen" uses `generate-package` with both and `include_profile_documents` from the attach checkbox. |
| D9 | HTML editing | WYSIWYG like the prototype: the stored HTML is loaded into a sandboxed `iframe srcdoc` (`sandbox="allow-same-origin"`, no scripts) with `designMode="on"`; "Änderungen speichern" serialises the document, PUTs it, POSTs `render`, and shows "PDF wird neu gesetzt" until `job_update{rendered_kind}`. |
| D10 | Nav highlight on `/jobs/[id]` | Eingang when the job is `OPEN` or archived, Bewerbungen otherwise (phase-1 ruling). The breadcrumb uses the same rule. |
| D11 | Company domain | `company_domain` is never filled by the backend (G7). The Firma tab asks once for the company's web address, PATCHes `company_domain`, then starts research. |
| D12 | Tab state | `?tab=passung|unterlagen|firma|interview|verlauf` in the URL (spec 2.3); default by phase (Treffer: Passung, Vorgemerkt: Unterlagen, Beworben: Verlauf, Interview: Interview, Angebot/Abgeschlossen: Verlauf). Unterlagen before Vorgemerkt and Interview before the Interview phase show the prototype's dim panel with "Trotzdem öffnen". |
| D13 | Score recede | Big Editorial numeral up to Vorgemerkt; from Beworben on the score box gets `.recede` (40px numeral, muted colour, no band word), per spec 4.2 and usability #18. Unscored jobs show "–" and "Noch nicht bewertet". |

## Backend gaps (for the controller to rule; no task here changes the backend)

| # | Gap | Effect without a fix | Proposed minimal resolution |
|---|---|---|---|
| G1 | No endpoint for fit feedback | Feedback form dropped (D6) | **Drop** (recommended). Optional later backend task: `POST /jobs/{id}/fit-feedback {reason: "too_high"|"too_low"|"wrong_fact"|"misread", comment?: str<=1000}` into a new table, read by the analysis prompt. |
| G2 | No interview date / offer deadline column | D5 overloads `next_follow_up_at` by phase | **Client-only (D5)** for this phase. Optional small backend task: column `jobs.interview_at` (DateTime tz, nullable, Alembic migration), returned by `GET /jobs/{id}` as ISO, patchable via `JobPatchRequest.interview_at`; then `nextStep` reads it for `INTERVIEW` (one function, one field in the dates form). |
| G3 | `PATCH /jobs/{id}` cannot clear `next_follow_up_at` (`None` is ignored) | The dates form offers no "remove"; a new phase asks for its new date | **Small backend task:** in `patch_job`, set `job.next_follow_up_at = request.next_follow_up_at` when `"next_follow_up_at" in request.model_fields_set` (so an explicit `null` clears); pytest: patch `{next_follow_up_at: null}` clears, omitting it keeps. The client then sends `null` from a "Datum entfernen" button (one extra button in Task 14). |
| G4 | `GET /jobs/{id}` lacks `pre_generation_status` | During a regeneration of an advanced application the phase track shows Vorgemerkt for about a minute | **One-line backend task:** add `"pre_generation_status"` to `_JOB_DETAIL_COLUMNS` in `server/routers/jobs.py` + pytest that the detail returns it. The client schema already reads it as optional (Task 3), so it works before and after. |
| G5 | No intermediate generation step events | D7 shows started/running/done only | **Client-only (D7).** Optional: `job_update {step: "cv"|"letter"|"render"|"attach"}` from `ai.generate_application_package`. |
| G6 | Interview prep and company research publish no failure event (failures only log / retry) | A failed task would spin forever | **Client-only:** stalled after 3 minutes with retry (Global Constraints). Optional: publish `{type:"interview_prep_failed", job_id, user_id}` / `{type:"company_profile_failed", domain, user_id}`. |
| G7 | `jobs.company_domain` is never set automatically | Research needs a domain key | **Client-only (D11).** Optional: derive the domain during analysis. |
| G8 | `services/job_documents.store_generated_document` deletes earlier rows of the same `kind`, so attaching several profile documents keeps only the last `ATTACHED_CERT` and the last `ATTACHED_REFERENCE` | "Nachweise anhängen" loses attachments | **Small backend task (recommended before the cutover):** in `ai.generate_application_package`, delete existing `ATTACHED_CERT`/`ATTACHED_REFERENCE` rows of the job once before the attach loop and insert each attachment without the replace step (new parameter `replace: bool = True` on `store_generated_document`, `False` in the loop); pytest with two certificates expects two rows. |
| G9 | No `WITHDRAWN` status | D4 | **Client-only (D4).** |
| G10 | The apply date cannot be back-dated (`job_status_history.changed_at` is server time) | | **Client-only:** a past apply date goes into the status note ("Beworben am 05.10.2026") and the follow-up date is computed from it. |
| G11 | Jobs store no city, work mode or salary | Prototype meta line `Hamburg · Hybrid · 80–95k` cannot be shown | **Drop:** the meta line shows company, posting age and source host. |
| G12 | Google Drive documents cannot be viewed or downloaded (400) | | Already a deferred backend point; the UI shows "Dateien aus Google Drive lassen sich hier noch nicht öffnen." via a `BAD_REQUEST` override. |

## Spec contradictions and proposed resolutions

1. **Monogram:** spec 4.2 asks for a company monogram in the header; the Editorial prototype has none. Resolution: a small square initials monogram (`ui/Monogram.tsx`), allowed by usability #25 ("monograms only for companies"); phase 3 reuses it in inbox rows.
2. **Tab names and order:** prototype "Passung, Unternehmen, Unterlagen, Interview, Verlauf"; spec "Passung, Unterlagen, Firma, Interview, Verlauf". Resolution: spec wording and order.
3. **Layout:** the prototype stacks header, next card and tabs in one column; spec 4.2 and the usability layout want two columns with a sticky 360px right column. Resolution: spec (two columns at >= 1024px, header -> next card -> tabs -> panel below).
4. **Stepper "Offen":** usability #17 drops "Offen"; spec 4.3 says "Treffer" for inbox items. Resolution: first step labelled "Treffer", not offered as a menu target (D3).
5. **Header buttons:** the prototype header holds the primary next-step button and Aussortieren; usability #8 moves them into the next card. Resolution: the header has no action buttons.
6. **Passung feedback:** spec 4.2 lists it, the backend cannot store it. Resolution: D6 / G1.
7. **Per-document template selector** in the prototype's Unterlagen rows changes the profile-wide template. Resolution: not on the job page (that is Profil › Vorlagen, phase 6); the proof slug shows the file name and date instead of "Vorlage X, v2".
8. **Document versions** ("Probedruck v2, bearbeitet"): the backend keeps no version. Resolution: the slug shows "Probedruck vom <date>".
9. **Activity label for job tasks** (spec 4.3 #6): the phase-1 activity only tracks crawls; generation, prep and research show their progress on the job page. Resolution: adding them to the sidebar activity is deferred to phase 8 (listed in the hand-off), not silently dropped.
10. **Next step "Firma recherchieren" first** (prototype `nextStepDrafted`) is not among the spec 4.4 inputs and depends on G7. Resolution: research is offered in the Firma tab only; `nextStep` follows spec 4.4 exactly.

---

## File Map

Created (`web/`):

| Path | Responsibility |
|---|---|
| `src/api/files.ts`, `src/features/job/format/useJobFormat.ts` | Adapters over the fix-wave blob/FormData client and date helpers (Task 0) |
| `src/domain/calendar.ts` | `parseApiDate`, calendar-day difference in a time zone, date-input conversion |
| `src/api/jobDocuments.ts`, `src/api/companies.ts`, `src/api/profileDocuments.ts` | New resource modules |
| `src/domain/jobStatus.ts`, `src/domain/phaseTrack.ts`, `src/domain/statusGuards.ts` | Status mirror, phases, track, guards |
| `src/domain/documents.ts`, `src/domain/checklist.ts`, `src/domain/nextStep.ts` | Document presence, apply checklist, next step |
| `src/domain/reasoning.ts`, `src/domain/markdown.ts`, `src/domain/interviewPrep.ts`, `src/domain/todos.ts`, `src/domain/links.ts`, `src/domain/monogram.ts`, `src/domain/pendingTasks.ts` | Parsing and small rules |
| `src/lib/clock.ts` | `useNow()` clock store |
| `src/realtime/usePendingTasks.ts` | Pending background tasks in the query cache |
| `src/ui/Menu.tsx`, `src/ui/Monogram.tsx`, `src/ui/Markdown.tsx`, `src/ui/Disclosure.tsx`, `src/ui/A4Preview.tsx`, `src/ui/styles/content.css` | New primitives and their CSS |
| `src/features/job/**` | Page, header, phase change, next step, dates, tabs |
| `app/(app)/jobs/[id]/page.tsx` | Route (replaces the placeholder) |
| `tests/unit/support/jobFactory.ts`, `tests/unit/support/stubRoutes.ts` | Test data builder, route-table fetch stub |
| `tests/unit/**` (one test file per module) | Unit tests |
| `tests/e2e/support/jobFixtures.ts`, `tests/e2e/job.spec.ts`, `tests/e2e/jobJourneys.spec.ts` | E2E fixtures and journeys |

Modified: `src/api/jobs.ts`, `src/api/queryKeys.ts`, `src/realtime/events.ts`, `src/realtime/applyEvent.ts`, `src/realtime/filter.ts`, `src/ui/Stepper.tsx`, `src/ui/Field.tsx`, `src/ui/styles/layout.css`, `src/features/shell/navigation.ts`, `src/features/shell/Sidebar.tsx`, `src/features/shell/BottomBar.tsx`, `src/i18n/de.ts`, `src/i18n/en.ts`, `app/globals.css`, `tests/unit/support/fakeFetch.ts` (only if Task 0 finds it lacks body capture), `tests/unit/ui/layout.test.tsx`, `tests/e2e/support/mockApi.ts`, `tests/e2e/shell.spec.ts`, `context/progress-tracker.md`, `context/ui-context.md`, `context/architecture.md`.

Feature folder layout (`src/features/job/`):

```
JobPage.tsx  useJob.ts  JobHeader.tsx  labels.ts  job.css
phase/       PhaseTrack.tsx  PhaseMenu.tsx  PhaseChangeDialog.tsx  useChangeStatus.ts
next/        NextStepCard.tsx  NextStepActions.tsx  ApplyChecklist.tsx  ApplyWithoutDocuments.tsx
             OfferDecision.tsx  useJobActions.ts
dates/       DatesCard.tsx  DatesDrawer.tsx  datesForm.ts
tabs/        JobTabs.tsx  jobTabs.ts  DimPanel.tsx
fit/         FitTab.tsx
documents/   DocumentsTab.tsx  DocumentRow.tsx  GenerationNote.tsx  useGeneration.ts
             DocumentPreview.tsx  useDocumentFile.ts  DocumentEditor.tsx  editDocument.ts
             FilesSection.tsx  uploadRules.ts
company/     CompanyTab.tsx  CompanyDomainForm.tsx  CompanyProfileView.tsx  DeepDiveList.tsx
interview/   InterviewTab.tsx  InterviewPrepView.tsx
history/     HistoryTab.tsx  Timeline.tsx  NotesEditor.tsx  TodoList.tsx
format/      useJobFormat.ts
```

---
### Task 0: Adapters over the phase-1 fix wave

The fix wave adds `requestBlob`, FormData bodies, date helpers and a console-error allow-list. Their exact names were not final when this plan was written. This task pins them behind three tiny adapters so every later task uses one stable name; only this task has to look at the real signatures.

**Files:**
- Create: `web/src/api/files.ts`, `web/src/features/job/format/useJobFormat.ts`, `web/src/lib/clock.ts`
- Test: `web/tests/unit/api/files.test.ts`, `web/tests/unit/features/job/useJobFormat.test.tsx`

**Interfaces:**
- Consumes (fix wave, verify in Step 1): `api.requestBlob(path, init?)` returning a Blob plus the Content-Disposition filename; the FormData option of `ApiRequest`; `formatDate`, `formatDateTime`, `formatRelativeDays` in `src/i18n/`; the e2e allow-list option of the auto fixture in `tests/e2e/support/test.ts`.
- Produces:
  - `export interface DownloadedFile { blob: Blob; filename: string | null }`
  - `export function fetchFile(path: string): Promise<DownloadedFile>`
  - `export function uploadForm(path: string, form: FormData): Promise<void>`
  - `export interface JobFormat { date: (iso: string) => string; dateTime: (iso: string) => string; relativeDays: (iso: string) => string }`
  - `export function useJobFormat(): JobFormat`
  - A recorded name for the e2e console allow-list option, written into the comment at the top of `tests/e2e/support/test.ts` if not already documented there. Tasks 22 and 23 use it as `test.use({ <option>: [...] })`; this plan writes it as `allowedConsoleErrors` and the executor of Tasks 22/23 substitutes the real name.

- [ ] **Step 1: Read the fix-wave signatures**

Run:
```bash
cd "$REPO/web" && grep -n "requestBlob\|formData\|FormData\|filename" src/api/client.ts && grep -rn "export function format\(Date\|DateTime\|RelativeDays\)" src/i18n && grep -n "option\|allow" tests/e2e/support/test.ts
```
Expected: one `requestBlob` method on `ApiClient`, an `ApiRequest` field for FormData, the three date helpers with their parameter lists, and the allow-list fixture option. Write the four facts down; Steps 3 and 5 use them. If any is missing, stop and report to the controller: the fix wave is not complete.

- [ ] **Step 2: Write the failing adapter tests**

`web/tests/unit/api/files.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchFile, uploadForm } from "@/api/files";
import { createFakeFetch, jsonResponse } from "../support/fakeFetch";

const PDF_BYTES = "%PDF-1.4";

function stubFetch(response: () => Response) {
  const fake = createFakeFetch(response);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

describe("fetchFile", () => {
  it("returns the bytes and the filename of a download", async () => {
    stubFetch(
      () =>
        new Response(PDF_BYTES, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="Lebenslauf_ACME.pdf"',
          },
        }),
    );
    const file = await fetchFile("/jobs/j1/documents/4/download");
    expect(await file.blob.text()).toBe(PDF_BYTES);
    expect(file.filename).toBe("Lebenslauf_ACME.pdf");
  });

  it("rejects a missing file with NOT_FOUND", async () => {
    stubFetch(() => jsonResponse(404, { detail: "Document not found" }));
    await expect(fetchFile("/jobs/j1/documents/9/view")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("uploadForm", () => {
  it("posts the form without a JSON content type", async () => {
    const calls = stubFetch(() => jsonResponse(200, { id: 1 }));
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "text/plain" }), "a.txt");
    await uploadForm("/jobs/j1/documents", form);
    expect(calls[0]).toMatchObject({ url: "http://api.test/jobs/j1/documents", method: "POST" });
  });
});
```

`web/tests/unit/features/job/useJobFormat.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useJobFormat } from "@/features/job/format/useJobFormat";

describe("useJobFormat", () => {
  it("formats an ISO date in German", () => {
    const { result } = renderHook(() => useJobFormat());
    expect(result.current.date("2026-10-08T09:00:00+00:00")).toMatch(/08\.10\.(20)?26/);
  });

  it("formats date and time", () => {
    const { result } = renderHook(() => useJobFormat());
    expect(result.current.dateTime("2026-10-08T09:00:00Z")).toMatch(/08\.10\.(20)?26/);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/files.test.ts tests/unit/features/job/useJobFormat.test.tsx`
Expected: FAIL, "Failed to resolve import "@/api/files"" and "@/features/job/format/useJobFormat".

- [ ] **Step 4: Write the adapters**

`web/src/api/files.ts` (replace `requestBlob`/`formData` by the names found in Step 1 if they differ; if `requestBlob` already returns `{ blob, filename }` the body stays as written):

```ts
import { z } from "zod";
import { api } from "./instance";

export interface DownloadedFile {
  blob: Blob;
  /** From Content-Disposition; null when the server sent none. */
  filename: string | null;
}

// Upload endpoints answer with a small JSON object the UI does not need.
const anyBodySchema = z.unknown();

/** Binary download through the app client, so a 401 refreshes once and errors become ApiError. */
export async function fetchFile(path: string): Promise<DownloadedFile> {
  const file = await api.requestBlob(path);
  return { blob: file.blob, filename: file.filename ?? null };
}

/** Multipart upload; the browser sets the boundary, so no Content-Type is sent. */
export async function uploadForm(path: string, form: FormData): Promise<void> {
  await api.request(path, anyBodySchema, { method: "POST", formData: form });
}
```

`web/src/features/job/format/useJobFormat.ts` (adapt the three calls to the parameter lists from Step 1; the hook signature stays):

```ts
"use client";

import { useMemo } from "react";
import { formatDate, formatDateTime, formatRelativeDays } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";

export interface JobFormat {
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
  /** "heute", "seit 3 Tagen", "in 2 Tagen". */
  relativeDays: (iso: string) => string;
}

/** The one place the job page touches the i18n date helpers (phase-1 fix wave). */
export function useJobFormat(): JobFormat {
  const { language } = useI18n();
  const now = useNow();
  return useMemo(
    () => ({
      date: (iso) => formatDate(iso, language),
      dateTime: (iso) => formatDateTime(iso, language),
      relativeDays: (iso) => formatRelativeDays(iso, language, now),
    }),
    [language, now],
  );
}
```

`useNow` lives in `web/src/lib/clock.ts`; create it here (Task 7 adds its tests):

```ts
"use client";

import { useSyncExternalStore } from "react";

/** Due states and "stalled" tasks change at most by the minute; 30 s keeps them current enough. */
export const CLOCK_TICK_MS = 30_000;

const listeners = new Set<() => void>();
let current = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function tick(): void {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    current = Date.now();
    timer = setInterval(tick, CLOCK_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearInterval(timer);
  };
}

const read = (): number => current;

/** The current time as render input; render code must not call Date.now() itself (react-hooks purity). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, read, read);
}
```


- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/files.test.ts tests/unit/features/job/useJobFormat.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---

### Task 1: Calendar rules (API dates, calendar days, date inputs)

**Files:**
- Create: `web/src/domain/calendar.ts`
- Test: `web/tests/unit/domain/calendar.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`@/domain/calendar`):
  - `parseApiDate(iso: string): Date` (a missing offset means UTC)
  - `calendarDaysBetween(from: Date, to: Date, timeZone?: string): number` (whole calendar days from `from` to `to` in the zone; negative when `to` is earlier)
  - `addDays(date: Date, days: number): Date`
  - `toDateInputValue(date: Date, timeZone?: string): string` (`YYYY-MM-DD`)
  - `fromDateInputValue(value: string): Date | null` (local 09:00 of that day; null for an invalid value)
  - `DAY_MS: number`

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDaysBetween,
  fromDateInputValue,
  parseApiDate,
  toDateInputValue,
} from "@/domain/calendar";

const BERLIN = "Europe/Berlin";

describe("parseApiDate", () => {
  it("reads an offset", () => {
    expect(parseApiDate("2026-10-08T09:00:00+02:00").toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });

  it("reads Z", () => {
    expect(parseApiDate("2026-10-08T09:00:00Z").toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("treats a missing offset as UTC", () => {
    expect(parseApiDate("2026-10-08T09:00:00").toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("keeps fractional seconds without an offset", () => {
    expect(parseApiDate("2026-10-08T09:00:00.123456").toISOString()).toBe(
      "2026-10-08T09:00:00.123Z",
    );
  });
});

describe("calendarDaysBetween", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const lateEvening = new Date("2026-10-08T21:30:00Z"); // 23:30 in Berlin
    const afterMidnight = new Date("2026-10-08T22:30:00Z"); // 00:30 next day in Berlin
    expect(calendarDaysBetween(lateEvening, afterMidnight, BERLIN)).toBe(1);
  });

  it("is zero on the same calendar day", () => {
    expect(
      calendarDaysBetween(new Date("2026-10-08T05:00:00Z"), new Date("2026-10-08T20:00:00Z"), BERLIN),
    ).toBe(0);
  });

  it("is negative when the target lies in the past", () => {
    expect(
      calendarDaysBetween(new Date("2026-10-08T10:00:00Z"), new Date("2026-10-05T10:00:00Z"), BERLIN),
    ).toBe(-3);
  });

  it("is not thrown off by the daylight-saving switch", () => {
    // 2026-10-25 is the end of summer time in Berlin.
    expect(
      calendarDaysBetween(new Date("2026-10-24T10:00:00Z"), new Date("2026-10-26T10:00:00Z"), BERLIN),
    ).toBe(2);
  });
});

describe("addDays", () => {
  it("adds whole days", () => {
    expect(addDays(new Date("2026-10-08T09:00:00Z"), 10).toISOString()).toBe(
      "2026-10-18T09:00:00.000Z",
    );
  });
});

describe("date inputs", () => {
  it("formats a date for <input type=date> in the zone", () => {
    expect(toDateInputValue(new Date("2026-10-08T22:30:00Z"), BERLIN)).toBe("2026-10-09");
  });

  it("parses an input value to 09:00 local time of that day", () => {
    const parsed = fromDateInputValue("2026-10-20");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9);
    expect(parsed?.getDate()).toBe(20);
    expect(parsed?.getHours()).toBe(9);
  });

  it("rejects an empty or malformed value", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue("2026-13-40")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/calendar.test.ts`
Expected: FAIL, "Failed to resolve import "@/domain/calendar"".

- [ ] **Step 3: Implement**

`web/src/domain/calendar.ts`:

```ts
export const DAY_MS = 86_400_000;

// ISO strings from the API carry an offset or Z; naive columns (SQLite, old rows) do not.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;
// en-CA formats dates as YYYY-MM-DD, which is what <input type="date"> needs.
const ISO_DAY_LOCALE = "en-CA";
// A date picked without a time means "that day"; 09:00 keeps it on the same day in every zone near Europe.
const PICKED_DAY_HOUR = 9;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;

/** Reads an API timestamp; a value without offset is UTC (the server stores UTC). */
export function parseApiDate(iso: string): Date {
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}Z`);
}

/** The calendar day of `date` in the zone, as YYYY-MM-DD. */
export function toDateInputValue(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(ISO_DAY_LOCALE, { timeZone }).format(date);
}

/** Whole calendar days from `from` to `to` in the zone, independent of clock time and DST. */
export function calendarDaysBetween(from: Date, to: Date, timeZone?: string): number {
  const start = Date.parse(`${toDateInputValue(from, timeZone)}T00:00:00Z`);
  const end = Date.parse(`${toDateInputValue(to, timeZone)}T00:00:00Z`);
  return Math.round((end - start) / DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "2026-10-20" -> that day at 09:00 local time; null when the value is not a real date. */
export function fromDateInputValue(value: string): Date | null {
  const match = DATE_INPUT.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < FIRST_MONTH || month > LAST_MONTH) return null;
  const date = new Date(year, month - 1, day, PICKED_DAY_HOUR);
  return date.getDate() === day ? date : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/calendar.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 2: Jobs API (detail, status, patch, history, analysis, interview prep) and query keys

**Files:**
- Modify: `web/src/api/jobs.ts`, `web/src/api/queryKeys.ts`
- Create: `web/tests/unit/support/jobFactory.ts`, `web/tests/unit/support/stubRoutes.ts`
- Test: `web/tests/unit/api/jobs.test.ts`

**Interfaces:**
- Consumes: `api.request` (`@/api/instance`), `createFakeFetch`, `jsonResponse` (`tests/unit/support/fakeFetch.ts`).
- Produces (`@/api/jobs`, in addition to the existing exports):
  - types `JobDetail`, `JobDetailBody`, `JobChecklist`, `JobTodo`, `JobContact`, `JobRecruiter`, `JobSalary`, `JobHistoryEntry`, `JobHistoryBody`, `JobPatch`, `StatusChange { to: string; note?: string }`, `PrepStart = "exists" | "queued"`
  - `EMPTY_CHECKLIST: JobChecklist`
  - `jobDetailSchema`
  - `jobPath(id: string): string`
  - `fetchJob(id)`, `changeJobStatus(id, change): Promise<JobDetail>`, `patchJob(id, patch): Promise<void>`, `fetchJobHistory(id): Promise<JobHistoryEntry[]>`, `reanalyzeJob(id): Promise<void>`, `startInterviewPrep(id, regenerate: boolean): Promise<PrepStart>`
  - `jobQueryOptions(id)`, `jobHistoryQueryOptions(id)` (TanStack `queryOptions`)
- Produces (`@/api/queryKeys`): `job(id)` stays `["job", id]`; new `jobHistory(id)` `["job", id, "history"]`, `jobDocuments(id)` `["job", id, "documents"]`, `jobDocumentHtml(id, kind)` `["job", id, "html", kind]`, `jobFile(jobId, docId, version)` `["job-file", jobId, docId, version]`, `pendingTasks` `["pending-tasks"]`, `profileDocuments` `["profile-documents"]`. Everything that belongs to one job lives under `["job", id]`, so the existing realtime invalidation of `queryKeys.job(id)` refreshes all of it; file bytes live outside on purpose (they are immutable per version and expensive).
- Produces (tests): `buildJob(overrides?: Partial<JobDetail>): JobDetail`, `stubRoutes(routes: RouteTable): RecordedCall[]` with `type RouteTable = Readonly<Record<string, unknown>>` (key `"METHOD /path"`, value a JSON body, a `Response`, or `(call: RecordedCall) => Response`).

- [ ] **Step 1: Write the test support**

`web/tests/unit/support/jobFactory.ts`:

```ts
import type { JobDetail } from "@/api/jobs";

const JOB_DEFAULTS: JobDetail = {
  id: "job-1",
  title: "Senior Backend Engineer",
  company: "ACME GmbH",
  company_domain: null,
  description: "Wir suchen eine erfahrene Person für unser Plattform-Team.",
  match_score: 84,
  reasoning: null,
  application_draft: null,
  cv_draft: null,
  interview_prep_material: null,
  status: "OPEN",
  url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
  is_favorite: false,
  contact_persons: null,
  recruiter_info: null,
  salary_benchmark: null,
  notes: null,
  is_archived: false,
  archive_reason: null,
  platform_id: 1,
  generation_error: null,
  checklist: null,
  todos: null,
  created_at: "2026-10-06T07:00:00+00:00",
  next_follow_up_at: null,
  cv_html_present: false,
  cover_letter_html_present: false,
  pre_generation_status: null,
};

/** A job detail as GET /jobs/{id} returns it; tests override only what they are about. */
export function buildJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return { ...JOB_DEFAULTS, ...overrides };
}
```

`web/tests/unit/support/stubRoutes.ts`:

```ts
import { vi } from "vitest";
import { createFakeFetch, jsonResponse, type RecordedCall } from "./fakeFetch";

/** "METHOD /path" (query string ignored) -> JSON body, Response, or a function building one. */
export type RouteTable = Readonly<Record<string, unknown>>;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

function answer(value: unknown, call: RecordedCall): Response {
  if (typeof value === "function") return (value as (call: RecordedCall) => Response)(call);
  return value instanceof Response ? value : jsonResponse(HTTP_OK, value);
}

/** Stubs the global fetch; an unknown route answers 404 so a missing stub fails loudly. */
export function stubRoutes(routes: RouteTable): RecordedCall[] {
  const fake = createFakeFetch((call) => {
    const key = `${call.method} ${new URL(call.url).pathname}`;
    return key in routes
      ? answer(routes[key], call)
      : jsonResponse(HTTP_NOT_FOUND, { detail: "not stubbed" });
  });
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}
```

- [ ] **Step 2: Write the failing tests**

`web/tests/unit/api/jobs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  changeJobStatus,
  fetchJob,
  fetchJobHistory,
  patchJob,
  reanalyzeJob,
  startInterviewPrep,
} from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { buildJob } from "../support/jobFactory";
import { stubRoutes } from "../support/stubRoutes";

describe("fetchJob", () => {
  it("reads the job detail", async () => {
    stubRoutes({ "GET /jobs/job-1": buildJob({ status: "DRAFTED" }) });
    await expect(fetchJob("job-1")).resolves.toMatchObject({ id: "job-1", status: "DRAFTED" });
  });

  it("encodes the id in the path", async () => {
    const calls = stubRoutes({ "GET /jobs/a%2Fb": buildJob({ id: "a/b" }) });
    await fetchJob("a/b");
    expect(calls[0].url).toBe("http://api.test/jobs/a%2Fb");
  });

  it("shows unexpected JSON columns as empty instead of failing", async () => {
    stubRoutes({
      "GET /jobs/job-1": { ...buildJob(), contact_persons: "Frau Muster", checklist: { x: 1 } },
    });
    await expect(fetchJob("job-1")).resolves.toMatchObject({
      contact_persons: null,
      checklist: { posting_opened: false, documents_checked: false, sent: false },
    });
  });

  it("fills the presence flags with false when they are missing", async () => {
    const legacy: Record<string, unknown> = { ...buildJob() };
    delete legacy.cv_html_present;
    delete legacy.cover_letter_html_present;
    stubRoutes({ "GET /jobs/job-1": legacy });
    await expect(fetchJob("job-1")).resolves.toMatchObject({
      cv_html_present: false,
      cover_letter_html_present: false,
    });
  });
});

describe("changeJobStatus", () => {
  it("posts the target and the note and returns the new detail", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/status": buildJob({ status: "APPLIED" }) });
    const job = await changeJobStatus("job-1", { to: "APPLIED", note: "Beworben am 05.10.2026" });
    expect(job.status).toBe("APPLIED");
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      to: "APPLIED",
      note: "Beworben am 05.10.2026",
    });
  });
});

describe("patchJob", () => {
  it("sends only the given fields", async () => {
    const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" } });
    await patchJob("job-1", { notes: "Rückruf Montag" });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: '{"notes":"Rückruf Montag"}' });
  });
});

describe("fetchJobHistory", () => {
  it("reads the status history", async () => {
    stubRoutes({
      "GET /jobs/job-1/history": [
        { id: 2, from_status: "DRAFTED", to_status: "APPLIED", changed_at: null, note: null },
      ],
    });
    await expect(fetchJobHistory("job-1")).resolves.toHaveLength(1);
  });
});

describe("background starts", () => {
  it("starts a re-analysis", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/analyze": { status: "started" } });
    await reanalyzeJob("job-1");
    expect(calls[0].method).toBe("POST");
  });

  it("reports that an interview prep already exists", async () => {
    stubRoutes({
      "POST /jobs/job-1/interview-prep": { status: "exists", message: "", job_id: "job-1" },
    });
    await expect(startInterviewPrep("job-1", false)).resolves.toBe("exists");
  });

  it("uses the regenerate endpoint when asked to", async () => {
    const calls = stubRoutes({
      "POST /jobs/job-1/interview-prep/regenerate": {
        status: "queued",
        message: "",
        job_id: "job-1",
      },
    });
    await expect(startInterviewPrep("job-1", true)).resolves.toBe("queued");
    expect(calls[0].url).toContain("/interview-prep/regenerate");
  });
});

describe("queryKeys", () => {
  it("nests every job resource under the job key", () => {
    const prefix = queryKeys.job("job-1");
    expect(queryKeys.jobHistory("job-1").slice(0, 2)).toEqual(prefix);
    expect(queryKeys.jobDocuments("job-1").slice(0, 2)).toEqual(prefix);
    expect(queryKeys.jobDocumentHtml("job-1", "cv").slice(0, 2)).toEqual(prefix);
  });

  it("keeps file bytes outside the job key", () => {
    expect(queryKeys.jobFile("job-1", 4, "v1")[0]).not.toBe("job");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/jobs.test.ts`
Expected: FAIL, `fetchJob` is not exported and `queryKeys.jobHistory` is not a function.

- [ ] **Step 4: Implement the query keys**

Replace `web/src/api/queryKeys.ts` with:

```ts
/**
 * Query keys per resource (spec 6). src/realtime/applyEvent.ts invalidates with the same keys.
 * Everything that belongs to one job is nested under ["job", id], so one invalidation of
 * queryKeys.job(id) refreshes detail, history, documents and stored HTML together.
 */
export const queryKeys = {
  me: ["me"],
  languagePreference: ["settings", "language"],
  jobCounts: ["job-counts"],
  jobsRoot: ["jobs"],
  job: (id: string) => ["job", id] as const,
  jobHistory: (id: string) => ["job", id, "history"] as const,
  jobDocuments: (id: string) => ["job", id, "documents"] as const,
  jobDocumentHtml: (id: string, kind: string) => ["job", id, "html", kind] as const,
  // PDF bytes are immutable per stored version and large, so they live outside the job prefix.
  jobFile: (jobId: string, docId: number, version: string) =>
    ["job-file", jobId, docId, version] as const,
  pendingTasks: ["pending-tasks"],
  profileDocuments: ["profile-documents"],
  platforms: ["platforms"],
  activity: ["activity"],
  company: (domain: string) => ["company", domain] as const,
  templates: ["templates"],
  systemStatus: ["system-status"],
} as const;
```

- [ ] **Step 5: Implement the jobs module**

Replace `web/src/api/jobs.ts` with:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

const jobCountsSchema = z.object({ status_counts: z.record(z.string(), z.number()) });
export type JobCounts = z.infer<typeof jobCountsSchema>;
export type JobCountsBody = z.input<typeof jobCountsSchema>;

/** Page shape of GET /jobs (`{items, total}`, limit <= 100); the list queries arrive with the inbox (phase 3). */
export interface JobListPage {
  items: ReadonlyArray<{ id: string }>;
  total: number;
}

// Backend JobChecklist: exactly these keys, defaults false, replaced as a whole on PATCH.
const checklistSchema = z.object({
  posting_opened: z.boolean().default(false),
  documents_checked: z.boolean().default(false),
  sent: z.boolean().default(false),
});
export type JobChecklist = z.infer<typeof checklistSchema>;
export const EMPTY_CHECKLIST: JobChecklist = {
  posting_opened: false,
  documents_checked: false,
  sent: false,
};

const todoSchema = z.object({ id: z.string(), text: z.string(), done: z.boolean() });
export type JobTodo = z.infer<typeof todoSchema>;

// contact_persons, recruiter_info and salary_benchmark are free JSON columns that only this UI
// writes; an older or foreign shape is shown as empty instead of breaking the page.
const contactSchema = z.object({
  name: z.string(),
  role: z.string().default(""),
  email: z.string().default(""),
});
export type JobContact = z.infer<typeof contactSchema>;
const recruiterSchema = z.object({
  name: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
});
export type JobRecruiter = z.infer<typeof recruiterSchema>;
const salarySchema = z.object({
  min: z.number().nullish(),
  max: z.number().nullish(),
  note: z.string().default(""),
});
export type JobSalary = z.infer<typeof salarySchema>;

export const jobDetailSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  company_domain: z.string().nullish(),
  description: z.string().nullish(),
  match_score: z.number().nullish(),
  reasoning: z.string().nullish(),
  application_draft: z.string().nullish(),
  cv_draft: z.string().nullish(),
  interview_prep_material: z.string().nullish(),
  status: z.string(),
  url: z.string().nullish(),
  is_favorite: z.boolean().nullish(),
  contact_persons: z.array(contactSchema).nullish().catch(null),
  recruiter_info: recruiterSchema.nullish().catch(null),
  salary_benchmark: salarySchema.nullish().catch(null),
  notes: z.string().nullish(),
  is_archived: z.boolean().nullish(),
  archive_reason: z.string().nullish(),
  platform_id: z.number().int().nullish(),
  generation_error: z.string().nullish(),
  checklist: checklistSchema.nullish().catch(EMPTY_CHECKLIST),
  todos: z.array(todoSchema).nullish().catch(null),
  created_at: z.string().nullish(),
  next_follow_up_at: z.string().nullish(),
  cv_html_present: z.boolean().default(false),
  cover_letter_html_present: z.boolean().default(false),
  // Not sent by the server yet (backend gap G4); used as soon as it is.
  pre_generation_status: z.string().nullish(),
});
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type JobDetailBody = z.input<typeof jobDetailSchema>;

const historyEntrySchema = z.object({
  id: z.number().int(),
  from_status: z.string().nullish(),
  to_status: z.string(),
  changed_at: z.string().nullish(),
  note: z.string().nullish(),
});
export type JobHistoryEntry = z.infer<typeof historyEntrySchema>;
export type JobHistoryBody = z.input<typeof historyEntrySchema>;

export interface StatusChange {
  to: string;
  note?: string;
}

export interface JobPatch {
  is_archived?: boolean;
  notes?: string;
  checklist?: JobChecklist;
  todos?: readonly JobTodo[];
  next_follow_up_at?: string;
  contact_persons?: readonly JobContact[];
  recruiter_info?: JobRecruiter;
  salary_benchmark?: JobSalary;
  cv_draft?: string;
  company_domain?: string;
}

const PREP_START_STATUSES = ["exists", "queued"] as const;
export type PrepStart = (typeof PREP_START_STATUSES)[number];
const prepStartSchema = z.object({ status: z.enum(PREP_START_STATUSES) });
const statusSchema = z.object({ status: z.string() });

export function jobPath(id: string): string {
  return `/jobs/${encodeURIComponent(id)}`;
}

export async function fetchJobCounts(): Promise<JobCounts> {
  return api.request("/jobs/counts?is_archived=false", jobCountsSchema);
}

/** Inbox badge: active OPEN jobs, the "Treffer" (spec 4.3). */
export function openMatchCount(counts: JobCounts | undefined): number {
  return counts?.status_counts.OPEN ?? 0;
}

export async function fetchJob(id: string): Promise<JobDetail> {
  return api.request(jobPath(id), jobDetailSchema);
}

/** The one way to change a status (B1): validated on the server, always written to the history. */
export async function changeJobStatus(id: string, change: StatusChange): Promise<JobDetail> {
  return api.request(`${jobPath(id)}/status`, jobDetailSchema, { method: "POST", json: change });
}

/** PATCH answers {"status":"updated"}; callers invalidate the job afterwards. */
export async function patchJob(id: string, patch: JobPatch): Promise<void> {
  await api.request(jobPath(id), statusSchema, { method: "PATCH", json: patch });
}

export async function fetchJobHistory(id: string): Promise<JobHistoryEntry[]> {
  return api.request(`${jobPath(id)}/history`, z.array(historyEntrySchema));
}

/** Ends with a job_updated event once the new score is stored. */
export async function reanalyzeJob(id: string): Promise<void> {
  await api.request(`${jobPath(id)}/analyze`, statusSchema, { method: "POST" });
}

/** Ends with interview_prep_ready; "exists" means nothing was started. */
export async function startInterviewPrep(id: string, regenerate: boolean): Promise<PrepStart> {
  const suffix = regenerate ? "/interview-prep/regenerate" : "/interview-prep";
  const started = await api.request(`${jobPath(id)}${suffix}`, prepStartSchema, {
    method: "POST",
  });
  return started.status;
}

export function jobQueryOptions(id: string) {
  return queryOptions({ queryKey: queryKeys.job(id), queryFn: () => fetchJob(id) });
}

export function jobHistoryQueryOptions(id: string) {
  return queryOptions({ queryKey: queryKeys.jobHistory(id), queryFn: () => fetchJobHistory(id) });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api`
Expected: PASS (the 11 new tests plus the existing api tests).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 3: Documents, companies and profile-documents API

**Files:**
- Create: `web/src/api/jobDocuments.ts`, `web/src/api/companies.ts`, `web/src/api/profileDocuments.ts`
- Test: `web/tests/unit/api/jobDocuments.test.ts`, `web/tests/unit/api/companies.test.ts`

**Interfaces:**
- Consumes: `api.request`, `fetchFile`, `uploadForm`, `DownloadedFile` (Task 0), `jobPath`, `queryKeys` (Task 2), `ApiError` (`@/api/errors`), `stubRoutes` (Task 2).
- Produces (`@/api/jobDocuments`):
  - `type DocumentKind = "cv" | "cover_letter"`, `DOCUMENT_KINDS: readonly DocumentKind[]`, `GENERATED_KIND: Record<DocumentKind, string>` (`GENERATED_CV`, `GENERATED_LETTER`)
  - `type JobDocument`, `type JobDocumentBody`
  - `fetchJobDocuments(jobId)`, `uploadJobDocument(jobId, file: File)`, `deleteJobDocument(jobId, docId: number)`, `viewJobDocument(jobId, docId): Promise<DownloadedFile>`, `downloadJobDocument(jobId, docId): Promise<DownloadedFile>`
  - `fetchDocumentHtml(jobId, kind): Promise<string>`, `saveDocumentHtml(jobId, kind, html)`, `renderDocument(jobId, kind)`
  - `interface PackageRequest { cv: boolean; letter: boolean; includeProfileDocuments: boolean }`, `generatePackage(jobId, request)`, `generateLetter(jobId, notes: string)`, `cancelGeneration(jobId)`
  - `generatedDocument(documents: readonly JobDocument[], kind: DocumentKind): JobDocument | undefined`, `documentVersion(document: JobDocument): string`
  - `jobDocumentsQueryOptions(jobId)`, `documentHtmlQueryOptions(jobId, kind)`
- Produces (`@/api/companies`): types `CompanyProfile`, `CompanyProfileBody`, `DeepDive`, `CompanyAnalysis`, `CompanyRisk`; `fetchCompany(domain): Promise<CompanyProfile | null>` (404 -> null); `type ResearchStart = "exists" | "queued"`, `startCompanyResearch(domain, forceRefresh: boolean): Promise<ResearchStart>`; `interface DeepDiveRequest { focus: string; howToProceed: string; companyName: string; title: string; language: string }`, `runDeepDive(domain, request): Promise<string>`; `companyQueryOptions(domain)`; `deepDiveSchema`, `optionalText`, `textList` (lenient zod parts, reused by the interview prep parser).
- Produces (`@/api/profileDocuments`): `type ProfileDocument`, `type ProfileDocumentBody`, `fetchProfileDocuments()`, `profileDocumentsQueryOptions()`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/api/jobDocuments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cancelGeneration,
  documentVersion,
  fetchDocumentHtml,
  fetchJobDocuments,
  generatedDocument,
  generateLetter,
  generatePackage,
  renderDocument,
  saveDocumentHtml,
  type JobDocument,
} from "@/api/jobDocuments";
import { stubRoutes } from "../support/stubRoutes";

const CV_PDF: JobDocument = {
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  file_size: 52_000,
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
  uploaded_at: "2026-10-07T10:00:00+00:00",
};

describe("job documents", () => {
  it("lists the documents of a job", async () => {
    stubRoutes({ "GET /jobs/job-1/documents": [CV_PDF] });
    await expect(fetchJobDocuments("job-1")).resolves.toEqual([CV_PDF]);
  });

  it("finds the generated PDF of a kind", () => {
    expect(generatedDocument([CV_PDF], "cv")).toBe(CV_PDF);
    expect(generatedDocument([CV_PDF], "cover_letter")).toBeUndefined();
  });

  it("uses the upload time as version, the id when it is missing", () => {
    expect(documentVersion(CV_PDF)).toBe("2026-10-07T10:00:00+00:00");
    expect(documentVersion({ ...CV_PDF, uploaded_at: null })).toBe("4");
  });
});

describe("stored HTML", () => {
  it("reads the HTML of one kind", async () => {
    const calls = stubRoutes({ "GET /jobs/job-1/documents/html": { html: "<p>x</p>" } });
    await expect(fetchDocumentHtml("job-1", "cover_letter")).resolves.toBe("<p>x</p>");
    expect(calls[0].url).toBe("http://api.test/jobs/job-1/documents/html?kind=cover_letter");
  });

  it("saves the HTML and then asks for a render", async () => {
    const calls = stubRoutes({
      "PUT /jobs/job-1/documents/html": { ok: true },
      "POST /jobs/job-1/documents/render": { queued: true },
    });
    await saveDocumentHtml("job-1", "cv", "<p>neu</p>");
    await renderDocument("job-1", "cv");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "PUT http://api.test/jobs/job-1/documents/html?kind=cv",
      "POST http://api.test/jobs/job-1/documents/render?kind=cv",
    ]);
    expect(calls[0].body).toBe('{"html":"<p>neu</p>"}');
  });
});

describe("generation", () => {
  it("asks for the CV only with profile documents", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate-package": { status: "started" } });
    await generatePackage("job-1", { cv: true, letter: false, includeProfileDocuments: true });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      generate_cv: true,
      generate_letter: false,
      include_profile_documents: true,
    });
  });

  it("sends letter notes, null without notes", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate": { status: "started" } });
    await generateLetter("job-1", "kürzer");
    await generateLetter("job-1", "  ");
    expect(calls.map((call) => JSON.parse(call.body ?? ""))).toEqual([
      { improvement_notes: "kürzer" },
      { improvement_notes: null },
    ]);
  });

  it("cancels a running generation", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/cancel-generation": { status: "cancelled" } });
    await cancelGeneration("job-1");
    expect(calls).toHaveLength(1);
  });
});
```

`web/tests/unit/api/companies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchCompany, runDeepDive, startCompanyResearch } from "@/api/companies";
import { fetchProfileDocuments } from "@/api/profileDocuments";
import { jsonResponse } from "../support/fakeFetch";
import { stubRoutes } from "../support/stubRoutes";

const PROFILE = {
  id: 3,
  domain: "acme.de",
  name: "ACME GmbH",
  description: "",
  meta: { language: "de" },
  executive_summary: {
    assessment: "Solider Mittelständler.",
    confidence: "Moderate",
    suitable_for: ["Backend"],
    not_suitable_for: "Frontend-Fokus",
  },
  analysis: [{ area: "Kultur", assessment: "Offen", confidence: "Low" }],
  key_insights: null,
  risks: [{ title: "Fluktuation", probability: "Medium", impact: "High", description: "" }],
  market_comparison: null,
  deep_dive_buttons: [{ title: "Gehalt", focus: "Gehaltsband", how_to_proceed: "Portale" }],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T10:00:00+00:00",
};

describe("fetchCompany", () => {
  it("reads a profile and turns a single string into a list", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    const company = await fetchCompany("acme.de");
    expect(company?.executive_summary?.not_suitable_for).toEqual(["Frontend-Fokus"]);
    expect(company?.deep_dive_buttons[0]).toMatchObject({ title: "Gehalt", focus: "Gehaltsband" });
  });

  it("returns null when no research exists yet", async () => {
    stubRoutes({
      "GET /companies/acme.de": jsonResponse(404, { detail: "Company profile not found" }),
    });
    await expect(fetchCompany("acme.de")).resolves.toBeNull();
  });

  it("keeps the page alive when the AI wrote an odd shape", async () => {
    stubRoutes({ "GET /companies/acme.de": { ...PROFILE, analysis: "kaputt", risks: [42] } });
    const company = await fetchCompany("acme.de");
    expect(company?.analysis).toEqual([]);
    expect(company?.risks).toEqual([]);
  });

  it("rethrows other errors", async () => {
    stubRoutes({ "GET /companies/acme.de": jsonResponse(500, { detail: "boom" }) });
    await expect(fetchCompany("acme.de")).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
});

describe("research", () => {
  it("starts a refresh with force_refresh", async () => {
    const calls = stubRoutes({
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    await expect(startCompanyResearch("acme.de", true)).resolves.toBe("queued");
    expect(calls[0].body).toBe('{"force_refresh":true}');
  });

  it("runs a deep dive and returns its markdown", async () => {
    const calls = stubRoutes({ "POST /companies/acme.de/deep-dive": { result: "## Ergebnis" } });
    const result = await runDeepDive("acme.de", {
      focus: "Gehaltsband",
      howToProceed: "Portale",
      companyName: "ACME GmbH",
      title: "Backend",
      language: "de",
    });
    expect(result).toBe("## Ergebnis");
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      focus: "Gehaltsband",
      how_to_proceed: "Portale",
      company_name: "ACME GmbH",
      title: "Backend",
      language: "de",
    });
  });
});

describe("profile documents", () => {
  it("lists the user's certificates and references", async () => {
    stubRoutes({
      "GET /profile/documents": [
        {
          id: 1,
          doc_type: "CERTIFICATE",
          label: "AWS",
          original_filename: "aws.pdf",
          file_size: 1,
          mime_type: "application/pdf",
          created_at: null,
        },
      ],
    });
    await expect(fetchProfileDocuments()).resolves.toMatchObject([{ id: 1, label: "AWS" }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api/jobDocuments.test.ts tests/unit/api/companies.test.ts`
Expected: FAIL, unresolved imports `@/api/jobDocuments`, `@/api/companies`, `@/api/profileDocuments`.

- [ ] **Step 3: Implement `web/src/api/jobDocuments.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { fetchFile, uploadForm, type DownloadedFile } from "./files";
import { api } from "./instance";
import { jobPath } from "./jobs";
import { queryKeys } from "./queryKeys";

/** The two generated documents; the API's `kind` query value. */
export const GENERATED_KIND = { cv: "GENERATED_CV", cover_letter: "GENERATED_LETTER" } as const;
export type DocumentKind = keyof typeof GENERATED_KIND;
export const DOCUMENT_KINDS: readonly DocumentKind[] = ["cv", "cover_letter"];

const jobDocumentSchema = z.object({
  id: z.number().int(),
  original_filename: z.string(),
  file_size: z.number().nullish(),
  mime_type: z.string().nullish(),
  kind: z.string(),
  uploaded_at: z.string().nullish(),
});
export type JobDocument = z.infer<typeof jobDocumentSchema>;
export type JobDocumentBody = z.input<typeof jobDocumentSchema>;

export interface PackageRequest {
  cv: boolean;
  letter: boolean;
  includeProfileDocuments: boolean;
}

const anyBodySchema = z.unknown();
const htmlSchema = z.object({ html: z.string() });

const documentsPath = (jobId: string) => `${jobPath(jobId)}/documents`;
const documentPath = (jobId: string, docId: number) => `${documentsPath(jobId)}/${docId}`;
const kindQuery = (kind: DocumentKind) => `?kind=${kind}`;

export async function fetchJobDocuments(jobId: string): Promise<JobDocument[]> {
  return api.request(documentsPath(jobId), z.array(jobDocumentSchema));
}

export async function uploadJobDocument(jobId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await uploadForm(documentsPath(jobId), form);
}

export async function deleteJobDocument(jobId: string, docId: number): Promise<void> {
  await api.request(documentPath(jobId, docId), anyBodySchema, { method: "DELETE" });
}

/** Inline variant; the bytes are the same as the download, only the disposition differs. */
export async function viewJobDocument(jobId: string, docId: number): Promise<DownloadedFile> {
  return fetchFile(`${documentPath(jobId, docId)}/view`);
}

export async function downloadJobDocument(jobId: string, docId: number): Promise<DownloadedFile> {
  return fetchFile(`${documentPath(jobId, docId)}/download`);
}

export async function fetchDocumentHtml(jobId: string, kind: DocumentKind): Promise<string> {
  const body = await api.request(`${documentsPath(jobId)}/html${kindQuery(kind)}`, htmlSchema);
  return body.html;
}

export async function saveDocumentHtml(
  jobId: string,
  kind: DocumentKind,
  html: string,
): Promise<void> {
  const path = `${documentsPath(jobId)}/html${kindQuery(kind)}`;
  await api.request(path, anyBodySchema, { method: "PUT", json: { html } });
}

/** Queues the PDF re-render; it ends with job_update {rendered_kind}. */
export async function renderDocument(jobId: string, kind: DocumentKind): Promise<void> {
  const path = `${documentsPath(jobId)}/render${kindQuery(kind)}`;
  await api.request(path, anyBodySchema, { method: "POST" });
}

export async function generatePackage(jobId: string, request: PackageRequest): Promise<void> {
  const json = {
    generate_cv: request.cv,
    generate_letter: request.letter,
    include_profile_documents: request.includeProfileDocuments,
  };
  await api.request(`${jobPath(jobId)}/generate-package`, anyBodySchema, { method: "POST", json });
}

/** Letter only; notes refine the existing draft (empty notes write a fresh letter). */
export async function generateLetter(jobId: string, notes: string): Promise<void> {
  const json = { improvement_notes: notes.trim() === "" ? null : notes.trim() };
  await api.request(`${jobPath(jobId)}/generate`, anyBodySchema, { method: "POST", json });
}

/** The server honours it (B10): a finished task discards its result once the job left GENERATING. */
export async function cancelGeneration(jobId: string): Promise<void> {
  await api.request(`${jobPath(jobId)}/cancel-generation`, anyBodySchema, { method: "POST" });
}

export function generatedDocument(
  documents: readonly JobDocument[],
  kind: DocumentKind,
): JobDocument | undefined {
  return documents.find((document) => document.kind === GENERATED_KIND[kind]);
}

/** A re-render replaces the row, so the upload time identifies the stored bytes. */
export function documentVersion(document: JobDocument): string {
  return document.uploaded_at ?? String(document.id);
}

export function jobDocumentsQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: queryKeys.jobDocuments(jobId),
    queryFn: () => fetchJobDocuments(jobId),
  });
}

export function documentHtmlQueryOptions(jobId: string, kind: DocumentKind) {
  return queryOptions({
    queryKey: queryKeys.jobDocumentHtml(jobId, kind),
    queryFn: () => fetchDocumentHtml(jobId, kind),
  });
}
```

- [ ] **Step 4: Implement `web/src/api/companies.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError } from "./errors";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

// The profile is AI output stored as JSON: every field is optional and an odd shape degrades to
// "missing" instead of failing the whole tab.
export const optionalText = z.string().nullish().catch(null);
export const textList = z
  .union([z.string().transform((text) => [text]), z.array(z.string())])
  .nullish()
  .transform((value) => value ?? [])
  .catch([]);

export const deepDiveSchema = z.object({
  title: z.string(),
  focus: z.string().catch(""),
  why_it_matters: optionalText,
  how_to_proceed: z.string().catch(""),
  linked_findings: textList,
});
export type DeepDive = z.infer<typeof deepDiveSchema>;

const analysisSchema = z.object({
  area: z.string(),
  assessment: optionalText,
  evidence_basis: optionalText,
  confidence: optionalText,
  key_uncertainty: optionalText,
});
export type CompanyAnalysis = z.infer<typeof analysisSchema>;

const riskSchema = z.object({
  title: z.string(),
  probability: optionalText,
  impact: optionalText,
  description: optionalText,
});
export type CompanyRisk = z.infer<typeof riskSchema>;

const comparisonPointSchema = z.object({
  dimension: z.string(),
  relative_position: optionalText,
  comment: optionalText,
});

const companyProfileSchema = z.object({
  domain: z.string(),
  name: z.string().nullish(),
  executive_summary: z
    .object({
      assessment: optionalText,
      confidence: optionalText,
      suitable_for: textList,
      not_suitable_for: textList,
    })
    .nullish()
    .catch(null),
  analysis: z.array(analysisSchema).catch([]),
  key_insights: z
    .object({ facts: textList, interpretations: textList, uncertainties: textList })
    .nullish()
    .catch(null),
  risks: z.array(riskSchema).catch([]),
  market_comparison: z
    .object({ summary: optionalText, comparison_points: z.array(comparisonPointSchema).catch([]) })
    .nullish()
    .catch(null),
  deep_dive_buttons: z.array(deepDiveSchema).catch([]),
  online_resources: z.unknown(),
  analyzed_at: z.string().nullish(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type CompanyProfileBody = z.input<typeof companyProfileSchema>;

const RESEARCH_START_STATUSES = ["exists", "queued"] as const;
export type ResearchStart = (typeof RESEARCH_START_STATUSES)[number];
const researchStartSchema = z.object({ status: z.enum(RESEARCH_START_STATUSES) });
const deepDiveResultSchema = z.object({ result: z.string() });

export interface DeepDiveRequest {
  focus: string;
  howToProceed: string;
  companyName: string;
  title: string;
  language: string;
}

const companyPath = (domain: string) => `/companies/${encodeURIComponent(domain)}`;

/** null while no research exists for the domain (the API answers 404). */
export async function fetchCompany(domain: string): Promise<CompanyProfile | null> {
  try {
    return await api.request(companyPath(domain), companyProfileSchema);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/** Ends with company_profile_ready; "exists" means nothing was started. */
export async function startCompanyResearch(
  domain: string,
  forceRefresh: boolean,
): Promise<ResearchStart> {
  const json = { force_refresh: forceRefresh };
  const started = await api.request(`${companyPath(domain)}/analyze`, researchStartSchema, {
    method: "POST",
    json,
  });
  return started.status;
}

/** Synchronous AI call (can take tens of seconds); the result is not stored by the server. */
export async function runDeepDive(domain: string, request: DeepDiveRequest): Promise<string> {
  const json = {
    focus: request.focus,
    how_to_proceed: request.howToProceed,
    company_name: request.companyName,
    title: request.title,
    language: request.language,
  };
  const body = await api.request(`${companyPath(domain)}/deep-dive`, deepDiveResultSchema, {
    method: "POST",
    json,
  });
  return body.result;
}

export function companyQueryOptions(domain: string) {
  return queryOptions({ queryKey: queryKeys.company(domain), queryFn: () => fetchCompany(domain) });
}
```

- [ ] **Step 5: Implement `web/src/api/profileDocuments.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

const profileDocumentSchema = z.object({
  id: z.number().int(),
  doc_type: z.string(),
  label: z.string().nullish(),
  original_filename: z.string(),
});
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
export type ProfileDocumentBody = z.input<typeof profileDocumentSchema>;

/** Certificates and references that "generate-package" can copy into a job. */
export async function fetchProfileDocuments(): Promise<ProfileDocument[]> {
  return api.request("/profile/documents", z.array(profileDocumentSchema));
}

export function profileDocumentsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.profileDocuments, queryFn: fetchProfileDocuments });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/api`
Expected: PASS (16 new tests plus the existing ones).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 4: Status machine mirror, phases, phase track and status guards

**Files:**
- Create: `web/src/domain/jobStatus.ts`, `web/src/domain/documents.ts`, `web/src/domain/phaseTrack.ts`, `web/src/domain/statusGuards.ts`
- Test: `web/tests/unit/domain/jobStatus.test.ts`, `web/tests/unit/domain/phaseTrack.test.ts`, `web/tests/unit/domain/statusGuards.test.ts`

**Interfaces:**
- Consumes: `DOCUMENT_KINDS`, `DocumentKind` (Task 3), `parseApiDate` (Task 1).
- Produces (`@/domain/jobStatus`): `USER_STATUSES`, `type UserStatus`, `STATUS_GENERATING`, `STATUS_FAILED`, `STATUS_DRAFTED`, `ALLOWED_TRANSITIONS`, `isUserStatus(value)`, `allowedTargets(current): readonly UserStatus[]`, `canTransition(current, target): boolean`, `PHASES`, `type Phase`, `interface StatusSource { status: string; pre_generation_status?: string | null }`, `effectiveStatus(job: StatusSource): string`, `phaseOf(job: StatusSource): Phase`, `phaseIndex(phase): number`, `isGenerating(job: StatusSource): boolean`, `isClosedStatus(status: string): boolean`, `PHASE_TARGET_STATUS: Record<"DRAFTED" | "APPLIED" | "INTERVIEW" | "OFFER", UserStatus>`.
- Produces (`@/domain/documents`): `type DocumentPresence = Record<DocumentKind, boolean>`, `interface PresenceSource { cv_html_present: boolean; cover_letter_html_present: boolean; application_draft?: string | null }`, `documentPresence(job)`, `missingDocuments(presence): DocumentKind[]`, `documentsReady(presence): boolean`.
- Produces (`@/domain/phaseTrack`): `type TrackState = "past" | "current" | "future" | "skipped" | "closed"`, `interface TrackStep { phase: Phase; state: TrackState; reachedAt: string | null }`, `interface TrackHistoryEntry { to_status: string; changed_at?: string | null }`, `phaseTrack(current: Phase, history: readonly TrackHistoryEntry[]): TrackStep[]`.
- Produces (`@/domain/statusGuards`): `MENU_TARGETS`, `type MenuTarget`, `type StatusGuard` (union below), `interface GuardInput extends StatusSource { documents: DocumentPresence }`, `guardFor(input, target): StatusGuard`, `OUTCOMES`, `type OutcomeKey = "accepted" | "rejected" | "withdrawn"`, `interface Outcome { key: OutcomeKey; to: UserStatus }`.

```ts
export type StatusGuard =
  | { kind: "direct"; to: UserStatus }
  | { kind: "confirmBackward"; to: UserStatus }
  | { kind: "confirmSkip"; to: UserStatus; skipped: readonly Phase[] }
  | { kind: "applyWithoutDocuments"; to: UserStatus; missing: readonly DocumentKind[] }
  | { kind: "askOutcome" }
  | { kind: "blocked"; reason: "locked" | "current" };
```

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/jobStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowedTargets, canTransition, effectiveStatus, phaseOf } from "@/domain/jobStatus";

// Literal copy of server/core/job_status.py::ALLOWED_TRANSITIONS (phase 0). If the server table
// changes, this test must change with it.
describe("allowedTargets mirrors the server table", () => {
  it.each([
    ["OPEN", ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["DRAFTED", ["OPEN", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["APPLIED", ["OPEN", "DRAFTED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["INTERVIEW", ["OPEN", "DRAFTED", "APPLIED", "OFFER", "ACCEPTED", "REJECTED"]],
    ["OFFER", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "ACCEPTED", "REJECTED"]],
    ["ACCEPTED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"]],
    ["REJECTED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED"]],
    ["FAILED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["GENERATING", []],
    ["SEEN", []],
    ["SOMETHING_LEGACY", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
  ])("from %s", (from, targets) => {
    expect([...allowedTargets(from)].sort()).toEqual([...targets].sort());
  });
});

describe("canTransition", () => {
  it("never allows a system status as target", () => {
    expect(canTransition("DRAFTED", "GENERATING")).toBe(false);
    expect(canTransition("DRAFTED", "FAILED")).toBe(false);
    expect(canTransition("OPEN", "SEEN")).toBe(false);
  });

  it("does not treat inherited object keys as statuses", () => {
    expect(canTransition("toString", "DRAFTED")).toBe(true);
    expect(canTransition("DRAFTED", "constructor")).toBe(false);
  });
});

describe("phaseOf", () => {
  it.each([
    ["OPEN", "OPEN"],
    ["SEEN", "OPEN"],
    ["DRAFTED", "DRAFTED"],
    ["FAILED", "DRAFTED"],
    ["APPLIED", "APPLIED"],
    ["INTERVIEW", "INTERVIEW"],
    ["OFFER", "OFFER"],
    ["ACCEPTED", "CLOSED"],
    ["REJECTED", "CLOSED"],
    ["SOMETHING_LEGACY", "OPEN"],
  ])("puts %s into %s", (status, phase) => {
    expect(phaseOf({ status })).toBe(phase);
  });

  it("shows a generation without a remembered status as Vorgemerkt", () => {
    expect(phaseOf({ status: "GENERATING" })).toBe("DRAFTED");
    expect(phaseOf({ status: "GENERATING", pre_generation_status: "OPEN" })).toBe("DRAFTED");
  });

  it("keeps an advanced phase while generating", () => {
    expect(phaseOf({ status: "GENERATING", pre_generation_status: "APPLIED" })).toBe("APPLIED");
    expect(effectiveStatus({ status: "GENERATING", pre_generation_status: "OFFER" })).toBe("OFFER");
  });
});
```

`web/tests/unit/domain/phaseTrack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { phaseTrack } from "@/domain/phaseTrack";

const states = (steps: ReturnType<typeof phaseTrack>) => steps.map((step) => step.state);

describe("phaseTrack", () => {
  it("marks visited, current and future phases", () => {
    const history = [
      { to_status: "APPLIED", changed_at: "2026-10-05T10:00:00Z" },
      { to_status: "DRAFTED", changed_at: "2026-10-03T10:00:00Z" },
    ];
    expect(states(phaseTrack("APPLIED", history))).toEqual([
      "past",
      "past",
      "current",
      "future",
      "future",
      "future",
    ]);
  });

  it("marks a phase that was jumped over as skipped", () => {
    const history = [{ to_status: "APPLIED", changed_at: "2026-10-05T10:00:00Z" }];
    expect(states(phaseTrack("APPLIED", history))[1]).toBe("skipped");
  });

  it("never marks the first phase as skipped (jobs start there without a history row)", () => {
    expect(states(phaseTrack("DRAFTED", []))[0]).toBe("past");
  });

  it("shows the final phase as closed", () => {
    const history = [{ to_status: "REJECTED", changed_at: "2026-10-07T10:00:00Z" }];
    expect(states(phaseTrack("CLOSED", history))[5]).toBe("closed");
  });

  it("dates each phase with its latest arrival", () => {
    const history = [
      { to_status: "DRAFTED", changed_at: "2026-10-01T10:00:00Z" },
      { to_status: "DRAFTED", changed_at: "2026-10-04T10:00:00+02:00" },
    ];
    expect(phaseTrack("DRAFTED", history)[1].reachedAt).toBe("2026-10-04T10:00:00+02:00");
  });

  it("counts a failed generation as Vorgemerkt", () => {
    const history = [{ to_status: "FAILED", changed_at: null }];
    expect(states(phaseTrack("APPLIED", history))[1]).toBe("past");
  });
});
```

`web/tests/unit/domain/statusGuards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { guardFor, type GuardInput } from "@/domain/statusGuards";

const READY = { cv: true, cover_letter: true };
const NONE = { cv: false, cover_letter: false };
const input = (status: string, documents = READY, pre?: string): GuardInput => ({
  status,
  pre_generation_status: pre ?? null,
  documents,
});

describe("guardFor", () => {
  it("moves one phase forward directly", () => {
    expect(guardFor(input("OPEN", NONE), "DRAFTED")).toEqual({ kind: "direct", to: "DRAFTED" });
    expect(guardFor(input("APPLIED"), "INTERVIEW")).toEqual({ kind: "direct", to: "INTERVIEW" });
  });

  it("asks before moving backwards", () => {
    expect(guardFor(input("INTERVIEW"), "DRAFTED")).toEqual({
      kind: "confirmBackward",
      to: "DRAFTED",
    });
  });

  it("asks before skipping phases and names them", () => {
    expect(guardFor(input("DRAFTED"), "INTERVIEW")).toEqual({
      kind: "confirmSkip",
      to: "INTERVIEW",
      skipped: ["APPLIED"],
    });
  });

  it("warns when applying without documents and names the missing ones", () => {
    expect(guardFor(input("DRAFTED", { cv: true, cover_letter: false }), "APPLIED")).toEqual({
      kind: "applyWithoutDocuments",
      to: "APPLIED",
      missing: ["cover_letter"],
    });
  });

  it("prefers the documents warning over the skip question", () => {
    expect(guardFor(input("OPEN", NONE), "OFFER")).toMatchObject({ kind: "applyWithoutDocuments" });
  });

  it("does not warn about documents once the application is out", () => {
    expect(guardFor(input("APPLIED", NONE), "INTERVIEW")).toEqual({
      kind: "direct",
      to: "INTERVIEW",
    });
  });

  it("asks for the outcome when closing, also from a closed state", () => {
    expect(guardFor(input("OFFER"), "CLOSED")).toEqual({ kind: "askOutcome" });
    expect(guardFor(input("REJECTED"), "CLOSED")).toEqual({ kind: "askOutcome" });
  });

  it("blocks the current phase", () => {
    expect(guardFor(input("APPLIED"), "APPLIED")).toEqual({ kind: "blocked", reason: "current" });
  });

  it("lets a failed generation be repaired to Vorgemerkt", () => {
    expect(guardFor(input("FAILED"), "DRAFTED")).toEqual({ kind: "direct", to: "DRAFTED" });
  });

  it("locks every change while documents are generated", () => {
    expect(guardFor(input("GENERATING"), "APPLIED")).toEqual({ kind: "blocked", reason: "locked" });
    expect(guardFor(input("GENERATING"), "CLOSED")).toEqual({ kind: "blocked", reason: "locked" });
  });

  it("treats a reopened closed job as a backward move", () => {
    expect(guardFor(input("ACCEPTED"), "OFFER")).toEqual({ kind: "confirmBackward", to: "OFFER" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: FAIL, unresolved imports `@/domain/jobStatus`, `@/domain/phaseTrack`, `@/domain/statusGuards`.

- [ ] **Step 3: Implement `web/src/domain/jobStatus.ts`**

```ts
export const USER_STATUSES = [
  "OPEN",
  "DRAFTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STATUS_DRAFTED = "DRAFTED";
export const STATUS_GENERATING = "GENERATING";
export const STATUS_FAILED = "FAILED";

const ADVANCED_STATUSES: ReadonlySet<string> = new Set([
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]);
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["ACCEPTED", "REJECTED"]);

const allExcept = (status: UserStatus): readonly UserStatus[] =>
  USER_STATUSES.filter((candidate) => candidate !== status);

/**
 * Mirror of server/core/job_status.py::ALLOWED_TRANSITIONS (B1): permissive, backward moves and
 * skips are allowed and the UI asks instead; GENERATING and SEEN cannot be left by hand.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly UserStatus[]>> = {
  OPEN: allExcept("OPEN"),
  DRAFTED: allExcept("DRAFTED"),
  APPLIED: allExcept("APPLIED"),
  INTERVIEW: allExcept("INTERVIEW"),
  OFFER: allExcept("OFFER"),
  ACCEPTED: allExcept("ACCEPTED"),
  REJECTED: allExcept("REJECTED"),
  FAILED: USER_STATUSES,
  GENERATING: [],
  SEEN: [],
};

export function isUserStatus(value: string): value is UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value);
}

/** A status outside the table (legacy free text) may move to any user status, as on the server. */
export function allowedTargets(current: string): readonly UserStatus[] {
  return Object.hasOwn(ALLOWED_TRANSITIONS, current) ? ALLOWED_TRANSITIONS[current] : USER_STATUSES;
}

export function canTransition(current: string, target: string): boolean {
  return isUserStatus(target) && allowedTargets(current).includes(target);
}

export const PHASES = ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "CLOSED"] as const;
export type Phase = (typeof PHASES)[number];

const PHASE_OF_STATUS: Readonly<Record<string, Phase>> = {
  OPEN: "OPEN",
  SEEN: "OPEN",
  DRAFTED: "DRAFTED",
  FAILED: "DRAFTED",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  ACCEPTED: "CLOSED",
  REJECTED: "CLOSED",
};

/** Phase-menu targets other than "Abgeschlossen" map to exactly one status. */
export const PHASE_TARGET_STATUS = {
  DRAFTED: "DRAFTED",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
} as const satisfies Record<string, UserStatus>;

export interface StatusSource {
  status: string;
  pre_generation_status?: string | null;
}

export function isGenerating(job: StatusSource): boolean {
  return job.status === STATUS_GENERATING;
}

/**
 * The status that decides phase and next step. A generation for an application that is already
 * out keeps that phase (server rule status_after_generation); an earlier one counts as Vorgemerkt.
 */
export function effectiveStatus(job: StatusSource): string {
  if (!isGenerating(job)) return job.status;
  const remembered = job.pre_generation_status ?? "";
  return ADVANCED_STATUSES.has(remembered) ? remembered : STATUS_DRAFTED;
}

export function phaseOf(job: StatusSource): Phase {
  return PHASE_OF_STATUS[effectiveStatus(job)] ?? "OPEN";
}

export function phaseOfStatus(status: string): Phase {
  return PHASE_OF_STATUS[status] ?? "OPEN";
}

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
```

(`phaseOfStatus` is also exported; Task 4's track uses it for history rows.)

- [ ] **Step 4: Implement `web/src/domain/documents.ts`**

```ts
import { DOCUMENT_KINDS, type DocumentKind } from "@/api/jobDocuments";

export type DocumentPresence = Readonly<Record<DocumentKind, boolean>>;

export interface PresenceSource {
  cv_html_present: boolean;
  cover_letter_html_present: boolean;
  application_draft?: string | null;
}

/** A letter generated by POST /generate may only have its text yet; the HTML is rendered lazily. */
export function documentPresence(job: PresenceSource): DocumentPresence {
  return {
    cv: job.cv_html_present,
    cover_letter: job.cover_letter_html_present || Boolean(job.application_draft),
  };
}

export function missingDocuments(presence: DocumentPresence): DocumentKind[] {
  return DOCUMENT_KINDS.filter((kind) => !presence[kind]);
}

export function documentsReady(presence: DocumentPresence): boolean {
  return missingDocuments(presence).length === 0;
}
```

- [ ] **Step 5: Implement `web/src/domain/phaseTrack.ts`**

```ts
import { parseApiDate } from "./calendar";
import { PHASES, phaseIndex, phaseOfStatus, type Phase } from "./jobStatus";

export type TrackState = "past" | "current" | "future" | "skipped" | "closed";

export interface TrackStep {
  phase: Phase;
  state: TrackState;
  /** ISO time of the latest arrival in this phase, from the status history. */
  reachedAt: string | null;
}

export interface TrackHistoryEntry {
  to_status: string;
  changed_at?: string | null;
}

/** Read-only phase track: done, now, later, and phases that were jumped over (usability #6). */
export function phaseTrack(current: Phase, history: readonly TrackHistoryEntry[]): TrackStep[] {
  return PHASES.map((phase) => ({
    phase,
    state: stepState(phase, current, history),
    reachedAt: latestArrival(phase, history),
  }));
}

function stepState(phase: Phase, current: Phase, history: readonly TrackHistoryEntry[]): TrackState {
  const offset = phaseIndex(phase) - phaseIndex(current);
  if (offset > 0) return "future";
  if (offset === 0) return phase === "CLOSED" ? "closed" : "current";
  // Every job starts as a match without a history row, so the first phase is always done.
  const visited = phase === "OPEN" || history.some((entry) => phaseOfStatus(entry.to_status) === phase);
  return visited ? "past" : "skipped";
}

function latestArrival(phase: Phase, history: readonly TrackHistoryEntry[]): string | null {
  const times = history
    .filter((entry) => phaseOfStatus(entry.to_status) === phase && entry.changed_at)
    .map((entry) => entry.changed_at as string);
  if (times.length === 0) return null;
  return times.reduce((latest, time) =>
    parseApiDate(time) > parseApiDate(latest) ? time : latest,
  );
}
```

- [ ] **Step 6: Implement `web/src/domain/statusGuards.ts`**

```ts
import type { DocumentKind } from "@/api/jobDocuments";
import { missingDocuments, type DocumentPresence } from "./documents";
import {
  allowedTargets,
  PHASE_TARGET_STATUS,
  PHASES,
  phaseIndex,
  phaseOf,
  type Phase,
  type StatusSource,
  type UserStatus,
} from "./jobStatus";

/** "Phase ändern" offers no way back to the inbox (usability #5 and #17). */
export const MENU_TARGETS = ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "CLOSED"] as const;
export type MenuTarget = (typeof MENU_TARGETS)[number];

export type StatusGuard =
  | { kind: "direct"; to: UserStatus }
  | { kind: "confirmBackward"; to: UserStatus }
  | { kind: "confirmSkip"; to: UserStatus; skipped: readonly Phase[] }
  | { kind: "applyWithoutDocuments"; to: UserStatus; missing: readonly DocumentKind[] }
  | { kind: "askOutcome" }
  | { kind: "blocked"; reason: "locked" | "current" };

export interface GuardInput extends StatusSource {
  documents: DocumentPresence;
}

export type OutcomeKey = "accepted" | "rejected" | "withdrawn";
export interface Outcome {
  key: OutcomeKey;
  to: UserStatus;
}
// The backend has no WITHDRAWN: "Selbst abgesagt" is REJECTED plus a history note (decision D4).
export const OUTCOMES: readonly Outcome[] = [
  { key: "accepted", to: "ACCEPTED" },
  { key: "rejected", to: "REJECTED" },
  { key: "withdrawn", to: "REJECTED" },
];

const APPLIED_INDEX = phaseIndex("APPLIED");
const DRAFTED_INDEX = phaseIndex("DRAFTED");
const NEXT_PHASE = 1;

/** Which confirmation, warning or question a phase change needs (spec 4.2, usability #5/#6). */
export function guardFor(input: GuardInput, target: MenuTarget): StatusGuard {
  if (allowedTargets(input.status).length === 0) return { kind: "blocked", reason: "locked" };
  if (target === "CLOSED") return { kind: "askOutcome" };
  const to = PHASE_TARGET_STATUS[target];
  if (to === input.status) return { kind: "blocked", reason: "current" };
  return forwardOrBackward(input, to, target);
}

function forwardOrBackward(input: GuardInput, to: UserStatus, target: Phase): StatusGuard {
  const from = phaseIndex(phaseOf(input));
  const goal = phaseIndex(target);
  if (goal < from) return { kind: "confirmBackward", to };
  const missing = missingDocuments(input.documents);
  if (goal >= APPLIED_INDEX && from <= DRAFTED_INDEX && missing.length > 0) {
    return { kind: "applyWithoutDocuments", to, missing };
  }
  if (goal - from > NEXT_PHASE) return { kind: "confirmSkip", to, skipped: PHASES.slice(from + 1, goal) };
  return { kind: "direct", to };
}
```

Note: `goal === from` with a different status (FAILED -> DRAFTED) falls through to `direct`, which is the wanted repair.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: PASS (all domain tests, 42 new).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 5: Apply checklist and `nextStep(job, now)`

**Files:**
- Create: `web/src/domain/checklist.ts`, `web/src/domain/nextStep.ts`
- Modify: `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/domain/checklist.test.ts`, `web/tests/unit/domain/nextStep.test.ts`

**Interfaces:**
- Consumes: `JobChecklist`, `EMPTY_CHECKLIST` (Task 2); `parseApiDate`, `calendarDaysBetween` (Task 1); `effectiveStatus`, `isGenerating`, `StatusSource`, `UserStatus` (Task 4); `documentPresence`, `documentsReady`, `PresenceSource` (Task 4); `MessageKey` (`@/i18n/de`).
- Produces (`@/domain/checklist`): `CHECKLIST_KEYS`, `type ChecklistKey`, `checklistOf(value?: JobChecklist | null): JobChecklist`, `setChecklistItem(checklist: JobChecklist | null | undefined, key: ChecklistKey, done: boolean): JobChecklist`, `checklistComplete(checklist?: JobChecklist | null): boolean`.
- Produces (`@/domain/nextStep`): `FOLLOW_UP_DAYS = 10`, `DUE_WINDOW_DAYS = 2`, `type NextTab = "documents" | "interview"`, `type NextAction`, `type NextStepKind`, `interface NextStep { kind; label: MessageKey; text: MessageKey; due: Date | null; dueSoon: boolean; overdue: boolean; action: NextAction }`, `interface NextStepInput`, `nextStep(job: NextStepInput, now: Date, timeZone?: string): NextStep`, `isDue(step: NextStep): boolean`.

```ts
export type NextAction =
  | { type: "shortlist" }
  | { type: "restore" }
  | { type: "generate" }
  | { type: "openTab"; tab: NextTab }
  | { type: "apply" }
  | { type: "followUp" }
  | { type: "setStatus"; to: UserStatus }
  | { type: "generatePrep" }
  | { type: "decideOffer" }
  | { type: "none" };

export type NextStepKind =
  | "triage" | "restore" | "generating" | "generationFailed" | "createDocuments" | "apply"
  | "markApplied" | "awaitReply" | "followUp" | "prepareInterview" | "interviewReady"
  | "decideOffer" | "closed";
```

Rules (spec 4.4: status, documents present, checklist, follow-up date within 2 calendar days or overdue, interview date; D5: in Interview and Angebot the one date is the appointment / answer deadline):

| Effective status | Condition | kind | action | due fields |
|---|---|---|---|---|
| any | `is_archived` | restore | restore | none |
| OPEN, SEEN, unknown | | triage | shortlist | none |
| GENERATING (early) | | generating | openTab documents | none |
| FAILED | | generationFailed | generate | none |
| DRAFTED | a document missing | createDocuments | generate | none |
| DRAFTED | documents ready, checklist incomplete | apply | apply | none |
| DRAFTED | documents ready, checklist complete | markApplied | apply | none |
| APPLIED | date within 2 days or overdue | followUp | followUp | from date |
| APPLIED | otherwise (also no date) | awaitReply | setStatus INTERVIEW | from date |
| INTERVIEW | no prep | prepareInterview | generatePrep | from date |
| INTERVIEW | prep present | interviewReady | openTab interview | from date |
| OFFER | | decideOffer | decideOffer | from date |
| ACCEPTED, REJECTED | | closed | none | none |

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/checklist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checklistComplete, checklistOf, setChecklistItem } from "@/domain/checklist";

describe("setChecklistItem", () => {
  it("keeps the other two keys (the server replaces the whole object)", () => {
    const before = { posting_opened: true, documents_checked: false, sent: false };
    expect(setChecklistItem(before, "sent", true)).toEqual({
      posting_opened: true,
      documents_checked: false,
      sent: true,
    });
  });

  it("starts from all false when the job has no checklist yet", () => {
    expect(setChecklistItem(null, "documents_checked", true)).toEqual({
      posting_opened: false,
      documents_checked: true,
      sent: false,
    });
  });
});

describe("checklistComplete", () => {
  it("is true only when every item is done", () => {
    expect(checklistComplete({ posting_opened: true, documents_checked: true, sent: true })).toBe(
      true,
    );
    expect(checklistComplete({ posting_opened: true, documents_checked: true, sent: false })).toBe(
      false,
    );
    expect(checklistComplete(undefined)).toBe(false);
  });

  it("reads a missing checklist as all open", () => {
    expect(checklistOf(null)).toEqual({ posting_opened: false, documents_checked: false, sent: false });
  });
});
```

`web/tests/unit/domain/nextStep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDue, nextStep } from "@/domain/nextStep";
import { buildJob } from "../support/jobFactory";

const NOW = new Date("2026-10-08T10:00:00Z");
const BERLIN = "Europe/Berlin";
const READY_DOCS = { cv_html_present: true, cover_letter_html_present: true };
const DONE = { posting_opened: true, documents_checked: true, sent: true };
const step = (overrides: Parameters<typeof buildJob>[0]) => nextStep(buildJob(overrides), NOW, BERLIN);

describe("nextStep: Treffer", () => {
  it("asks to triage an open match", () => {
    expect(step({ status: "OPEN" })).toMatchObject({
      kind: "triage",
      label: "next.triage.title",
      action: { type: "shortlist" },
      due: null,
    });
  });

  it("offers restore for a sorted-out job", () => {
    expect(step({ status: "OPEN", is_archived: true })).toMatchObject({
      kind: "restore",
      action: { type: "restore" },
    });
  });

  it("treats an unknown legacy status like a match", () => {
    expect(step({ status: "SOMETHING_LEGACY" }).kind).toBe("triage");
  });
});

describe("nextStep: Vorgemerkt", () => {
  it("asks to create documents while one is missing", () => {
    expect(step({ status: "DRAFTED", cv_html_present: true })).toMatchObject({
      kind: "createDocuments",
      action: { type: "generate" },
    });
  });

  it("counts a letter draft without HTML as present", () => {
    expect(
      step({ status: "DRAFTED", cv_html_present: true, application_draft: "Sehr geehrte" }).kind,
    ).toBe("apply");
  });

  it("asks to apply with an incomplete checklist", () => {
    expect(step({ status: "DRAFTED", ...READY_DOCS })).toMatchObject({
      kind: "apply",
      action: { type: "apply" },
    });
  });

  it("asks to mark as applied once the checklist is complete", () => {
    expect(step({ status: "DRAFTED", ...READY_DOCS, checklist: DONE }).kind).toBe("markApplied");
  });

  it("shows a running generation", () => {
    expect(step({ status: "GENERATING" })).toMatchObject({
      kind: "generating",
      action: { type: "openTab", tab: "documents" },
    });
  });

  it("offers a retry after a failed generation", () => {
    expect(step({ status: "FAILED" })).toMatchObject({
      kind: "generationFailed",
      action: { type: "generate" },
    });
  });
});

describe("nextStep: Beworben", () => {
  it("waits for an answer without a follow-up date", () => {
    expect(step({ status: "APPLIED" })).toMatchObject({
      kind: "awaitReply",
      action: { type: "setStatus", to: "INTERVIEW" },
      due: null,
    });
  });

  it("waits while the follow-up date is more than 2 calendar days away", () => {
    const result = step({ status: "APPLIED", next_follow_up_at: "2026-10-11T07:00:00Z" });
    expect(result).toMatchObject({ kind: "awaitReply", dueSoon: false, overdue: false });
    expect(isDue(result)).toBe(false);
  });

  it("asks to follow up within 2 calendar days", () => {
    const result = step({ status: "APPLIED", next_follow_up_at: "2026-10-10T20:00:00Z" });
    expect(result).toMatchObject({ kind: "followUp", dueSoon: true, overdue: false });
    expect(isDue(result)).toBe(true);
  });

  it("asks to follow up when overdue", () => {
    expect(step({ status: "APPLIED", next_follow_up_at: "2026-10-01T07:00:00Z" })).toMatchObject({
      kind: "followUp",
      overdue: true,
      action: { type: "followUp" },
    });
  });

  it("regenerating for an applied job keeps the applied next step", () => {
    expect(
      step({ status: "GENERATING", pre_generation_status: "APPLIED" }).kind,
    ).toBe("awaitReply");
  });
});

describe("nextStep: Interview", () => {
  it("asks to prepare without a prep", () => {
    expect(step({ status: "INTERVIEW", next_follow_up_at: "2026-10-09T08:00:00Z" })).toMatchObject({
      kind: "prepareInterview",
      action: { type: "generatePrep" },
      dueSoon: true,
    });
  });

  it("opens the prep once it exists", () => {
    expect(step({ status: "INTERVIEW", interview_prep_material: "{}" })).toMatchObject({
      kind: "interviewReady",
      action: { type: "openTab", tab: "interview" },
    });
  });
});

describe("nextStep: Angebot and closed", () => {
  it("asks for a decision and carries the deadline", () => {
    const result = step({ status: "OFFER", next_follow_up_at: "2026-10-20T16:00:00Z" });
    expect(result).toMatchObject({ kind: "decideOffer", action: { type: "decideOffer" } });
    expect(result.due?.toISOString()).toBe("2026-10-20T16:00:00.000Z");
  });

  it.each(["ACCEPTED", "REJECTED"])("has nothing left to do when %s", (status) => {
    expect(step({ status })).toMatchObject({ kind: "closed", action: { type: "none" } });
  });

  it("ignores an old follow-up date once closed", () => {
    expect(isDue(step({ status: "REJECTED", next_follow_up_at: "2026-10-01T07:00:00Z" }))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/checklist.test.ts tests/unit/domain/nextStep.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Add the next-step copy to the dictionaries**

Insert into `web/src/i18n/de.ts` before `} as const;`:

```ts
  "next.kicker": "Nächster Schritt",
  "next.triage.title": "Passt die Stelle zu dir?",
  "next.triage.text":
    "Lies die Passung. Wenn du dich bewerben möchtest, merke die Stelle vor, sonst sortiere sie aus.",
  "next.restore.title": "Aussortiert",
  "next.restore.text":
    "Diese Stelle liegt nicht mehr im Eingang. Hol sie zurück, wenn du sie doch ansehen möchtest.",
  "next.generating.title": "Unterlagen werden erstellt",
  "next.generating.text": "Das läuft im Hintergrund weiter, auch wenn du die Seite verlässt.",
  "next.generationFailed.title": "Erstellung fehlgeschlagen",
  "next.generationFailed.text":
    "Die Unterlagen konnten nicht erstellt werden. Versuche es noch einmal.",
  "next.createDocuments.title": "Unterlagen erstellen",
  "next.createDocuments.text":
    "Lebenslauf und Anschreiben werden für diese Stelle zugeschnitten und als PDF gesetzt. Prüfe beides danach in der Vorschau.",
  "next.apply.title": "Bewerben",
  "next.apply.text":
    "Deine Unterlagen sind fertig. Bewirb dich direkt beim Arbeitgeber. Die App verschickt nichts selbst.",
  "next.markApplied.title": "Als beworben markieren",
  "next.markApplied.text": "Alles erledigt. Halte fest, wann du dich beworben hast.",
  "next.awaitReply.title": "Auf Antwort warten",
  "next.awaitReply.text": "Trage eine Einladung ein, sobald sie kommt.",
  "next.followUp.title": "Nachfassen",
  "next.followUp.text":
    "Eine kurze, freundliche Nachfrage per E-Mail ist jetzt üblich. Halte danach fest, dass du nachgefasst hast.",
  "next.prepareInterview.title": "Interview vorbereiten",
  "next.prepareInterview.text":
    "Erstelle eine Vorbereitung aus Stellenanzeige, Firmenrecherche und deinem Lebenslauf.",
  "next.interviewReady.title": "Vorbereitung durchgehen",
  "next.interviewReady.text":
    "Die Vorbereitung ist fertig. Geh sie einmal laut durch und ergänze eigene Beispiele in den Notizen.",
  "next.decideOffer.title": "Angebot entscheiden",
  "next.decideOffer.text":
    "Halte fest, wie du dich entschieden hast. Für eine Gehaltsverhandlung lege dir eine Notiz an.",
  "next.closed.title": "Abgeschlossen",
  "next.closed.text": "Diese Bewerbung ist abgeschlossen. Notizen und Unterlagen bleiben erhalten.",
```

Insert into `web/src/i18n/en.ts` before the closing `};`:

```ts
  "next.kicker": "Next step",
  "next.triage.title": "Is this job right for you?",
  "next.triage.text":
    "Read the fit. If you want to apply, shortlist the job; otherwise sort it out.",
  "next.restore.title": "Sorted out",
  "next.restore.text":
    "This job is no longer in the inbox. Bring it back if you want to look at it after all.",
  "next.generating.title": "Documents are being created",
  "next.generating.text": "This continues in the background, even if you leave the page.",
  "next.generationFailed.title": "Creation failed",
  "next.generationFailed.text": "The documents could not be created. Please try again.",
  "next.createDocuments.title": "Create documents",
  "next.createDocuments.text":
    "CV and cover letter are tailored to this job and set as PDF. Check both in the preview afterwards.",
  "next.apply.title": "Apply",
  "next.apply.text":
    "Your documents are ready. Apply directly with the employer. The app does not send anything itself.",
  "next.markApplied.title": "Mark as applied",
  "next.markApplied.text": "All done. Record when you applied.",
  "next.awaitReply.title": "Wait for a reply",
  "next.awaitReply.text": "Record an invitation as soon as it arrives.",
  "next.followUp.title": "Follow up",
  "next.followUp.text":
    "A short, friendly email asking about the status is usual now. Record afterwards that you followed up.",
  "next.prepareInterview.title": "Prepare the interview",
  "next.prepareInterview.text":
    "Create a preparation from the posting, the company research and your CV.",
  "next.interviewReady.title": "Go through the preparation",
  "next.interviewReady.text":
    "The preparation is ready. Go through it out loud once and add your own examples in the notes.",
  "next.decideOffer.title": "Decide on the offer",
  "next.decideOffer.text":
    "Record how you decided. For a salary negotiation, start a note.",
  "next.closed.title": "Closed",
  "next.closed.text": "This application is closed. Notes and documents are kept.",
```

- [ ] **Step 4: Implement `web/src/domain/checklist.ts`**

```ts
import { EMPTY_CHECKLIST, type JobChecklist } from "@/api/jobs";

/** Order of the apply checklist in the next-step card (prototype renderApplyChecklist). */
export const CHECKLIST_KEYS = ["posting_opened", "documents_checked", "sent"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export function checklistOf(value?: JobChecklist | null): JobChecklist {
  return { ...EMPTY_CHECKLIST, ...value };
}

/** Always returns all three keys: PATCH replaces the whole object, a missing key would reset to false. */
export function setChecklistItem(
  checklist: JobChecklist | null | undefined,
  key: ChecklistKey,
  done: boolean,
): JobChecklist {
  return { ...checklistOf(checklist), [key]: done };
}

export function checklistComplete(checklist?: JobChecklist | null): boolean {
  const full = checklistOf(checklist);
  return CHECKLIST_KEYS.every((key) => full[key]);
}
```

- [ ] **Step 5: Implement `web/src/domain/nextStep.ts`**

```ts
import type { JobChecklist } from "@/api/jobs";
import type { MessageKey } from "@/i18n/de";
import { calendarDaysBetween, parseApiDate } from "./calendar";
import { checklistComplete } from "./checklist";
import { documentPresence, documentsReady, type PresenceSource } from "./documents";
import { effectiveStatus, isGenerating, type StatusSource, type UserStatus } from "./jobStatus";

/** Days after applying until following up is suggested (prototype FOLLOW_UP_DAYS). */
export const FOLLOW_UP_DAYS = 10;
/** Spec 4.4: a date is due when it is at most this many calendar days ahead, or overdue. */
export const DUE_WINDOW_DAYS = 2;

export type NextTab = "documents" | "interview";

export type NextAction =
  | { type: "shortlist" }
  | { type: "restore" }
  | { type: "generate" }
  | { type: "openTab"; tab: NextTab }
  | { type: "apply" }
  | { type: "followUp" }
  | { type: "setStatus"; to: UserStatus }
  | { type: "generatePrep" }
  | { type: "decideOffer" }
  | { type: "none" };

export type NextStepKind =
  | "triage"
  | "restore"
  | "generating"
  | "generationFailed"
  | "createDocuments"
  | "apply"
  | "markApplied"
  | "awaitReply"
  | "followUp"
  | "prepareInterview"
  | "interviewReady"
  | "decideOffer"
  | "closed";

export interface NextStep {
  kind: NextStepKind;
  label: MessageKey;
  text: MessageKey;
  due: Date | null;
  dueSoon: boolean;
  overdue: boolean;
  action: NextAction;
}

export interface NextStepInput extends StatusSource, PresenceSource {
  is_archived?: boolean | null;
  checklist?: JobChecklist | null;
  next_follow_up_at?: string | null;
  interview_prep_material?: string | null;
}

interface DueInfo {
  due: Date | null;
  dueSoon: boolean;
  overdue: boolean;
}
type StepCore = Pick<NextStep, "kind" | "action"> & DueInfo;
type StepRule = (job: NextStepInput, due: DueInfo) => StepCore;

const NO_DUE: DueInfo = { due: null, dueSoon: false, overdue: false };
const plain = (kind: NextStepKind, action: NextAction): StepCore => ({ kind, action, ...NO_DUE });
const dated = (kind: NextStepKind, action: NextAction, due: DueInfo): StepCore => ({
  kind,
  action,
  ...due,
});

function draftedStep(job: NextStepInput): StepCore {
  if (isGenerating(job)) return plain("generating", { type: "openTab", tab: "documents" });
  if (!documentsReady(documentPresence(job))) return plain("createDocuments", { type: "generate" });
  return plain(checklistComplete(job.checklist) ? "markApplied" : "apply", { type: "apply" });
}

function appliedStep(_job: NextStepInput, due: DueInfo): StepCore {
  if (due.dueSoon || due.overdue) return dated("followUp", { type: "followUp" }, due);
  return dated("awaitReply", { type: "setStatus", to: "INTERVIEW" }, due);
}

function interviewStep(job: NextStepInput, due: DueInfo): StepCore {
  if (job.interview_prep_material) {
    return dated("interviewReady", { type: "openTab", tab: "interview" }, due);
  }
  return dated("prepareInterview", { type: "generatePrep" }, due);
}

const triage: StepRule = () => plain("triage", { type: "shortlist" });
const closed: StepRule = () => plain("closed", { type: "none" });

const RULES: Readonly<Record<string, StepRule>> = {
  OPEN: triage,
  SEEN: triage,
  FAILED: () => plain("generationFailed", { type: "generate" }),
  DRAFTED: draftedStep,
  APPLIED: appliedStep,
  INTERVIEW: interviewStep,
  OFFER: (_job, due) => dated("decideOffer", { type: "decideOffer" }, due),
  ACCEPTED: closed,
  REJECTED: closed,
};

function dueInfo(iso: string | null | undefined, now: Date, timeZone?: string): DueInfo {
  if (!iso) return NO_DUE;
  const due = parseApiDate(iso);
  const days = calendarDaysBetween(now, due, timeZone);
  return { due, dueSoon: days >= 0 && days <= DUE_WINDOW_DAYS, overdue: days < 0 };
}

/**
 * The single source of "what now" (spec 4.4). It drives the job page card, the inbox "Anstehend"
 * card, the applications column and the due badge, so `now` is injected and the result is pure.
 */
export function nextStep(job: NextStepInput, now: Date, timeZone?: string): NextStep {
  if (job.is_archived) return withCopy(plain("restore", { type: "restore" }));
  const rule = RULES[effectiveStatus(job)] ?? triage;
  return withCopy(rule(job, dueInfo(job.next_follow_up_at, now, timeZone)));
}

function withCopy(core: StepCore): NextStep {
  return {
    ...core,
    label: `next.${core.kind}.title` as MessageKey,
    text: `next.${core.kind}.text` as MessageKey,
  };
}

export function isDue(step: NextStep): boolean {
  return step.dueSoon || step.overdue;
}
```

The two casts are safe because Step 3 defines a title and a text for every `NextStepKind`; the test "every kind has copy" below pins that.

Add this test at the end of `nextStep.test.ts`:

```ts
import { de } from "@/i18n/de";

describe("next-step copy", () => {
  it.each([
    "triage",
    "restore",
    "generating",
    "generationFailed",
    "createDocuments",
    "apply",
    "markApplied",
    "awaitReply",
    "followUp",
    "prepareInterview",
    "interviewReady",
    "decideOffer",
    "closed",
  ])("has a title and a text for %s", (kind) => {
    // The array form: a dotted string would be read as a property path.
    expect(de).toHaveProperty([`next.${kind}.title`]);
    expect(de).toHaveProperty([`next.${kind}.text`]);
  });
});
```

(Move the `import { de }` line to the top of the file with the other imports.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain tests/unit/i18n`
Expected: PASS (checklist 4, nextStep 21 + 13 copy cases, i18n parity unchanged and green).

- [ ] **Step 7: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 6: Parsing rules (fit reasoning, markdown, interview prep, links, monogram) and to-dos

**Files:**
- Create: `web/src/domain/reasoning.ts`, `web/src/domain/markdown.ts`, `web/src/domain/interviewPrep.ts`, `web/src/domain/links.ts`, `web/src/domain/monogram.ts`, `web/src/domain/todos.ts`
- Test: `web/tests/unit/domain/reasoning.test.ts`, `web/tests/unit/domain/markdown.test.ts`, `web/tests/unit/domain/interviewPrep.test.ts`, `web/tests/unit/domain/links.test.ts`, `web/tests/unit/domain/todos.test.ts`

**Interfaces:**
- Consumes: `JobTodo` (Task 2), `deepDiveSchema`, `optionalText`, `textList` (Task 3).
- Produces:
  - `@/domain/reasoning`: `interface FitReasoning { summary: string; strengths: string[]; gaps: string[]; recommendation: string }`, `parseFitReasoning(markdown?: string | null): FitReasoning | null` (null when no known section heading is found; the UI then shows the whole text).
  - `@/domain/markdown`: `type MarkdownBlock = { type: "heading"; text: string } | { type: "list"; items: string[] } | { type: "paragraph"; text: string }`, `parseMarkdown(source: string): MarkdownBlock[]`, `type InlineSegment = { type: "text"; text: string } | { type: "strong"; text: string } | { type: "link"; text: string; href: string }`, `parseInline(text: string): InlineSegment[]`.
  - `@/domain/interviewPrep`: `type InterviewPrep`, `type ParsedPrep = { kind: "none" } | { kind: "unreadable" } | { kind: "prep"; prep: InterviewPrep }`, `parseInterviewPrep(raw?: string | null): ParsedPrep`.
  - `@/domain/links`: `isHttpUrl(text: string): boolean`, `resourceLinks(value: unknown): string[]`, `hostOf(url?: string | null): string | null`.
  - `@/domain/monogram`: `monogramOf(name?: string | null): string`.
  - `@/domain/todos`: `MAX_TODOS = 50`, `MAX_TODO_TEXT_LENGTH = 500`, `type TodoProblem = "empty" | "tooLong" | "tooMany"`, `type TodoResult = { ok: true; todos: JobTodo[] } | { ok: false; problem: TodoProblem }`, `addTodo(todos, text, id): TodoResult`, `toggleTodo(todos, id): JobTodo[]`, `removeTodo(todos, id): JobTodo[]`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/reasoning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFitReasoning } from "@/domain/reasoning";

const GERMAN = `## Zusammenfassung
Du passt gut. Die Rolle ist breit.

## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren
- Kafka in Produktion

## Lücken & Herausforderungen
* Kein GCP
* Reisebereitschaft 30 %

## Empfehlung
Bewirb dich.`;

const ENGLISH = `## Summary
Good fit.
## Strengths & Match
- Kotlin
## Gaps & Challenges
- No GCP
## Recommendation
Apply.`;

describe("parseFitReasoning", () => {
  it("splits the German analysis into its four sections", () => {
    expect(parseFitReasoning(GERMAN)).toEqual({
      summary: "Du passt gut. Die Rolle ist breit.",
      strengths: ["**Kotlin** seit fünf Jahren", "Kafka in Produktion"],
      gaps: ["Kein GCP", "Reisebereitschaft 30 %"],
      recommendation: "Bewirb dich.",
    });
  });

  it("reads the English headings", () => {
    expect(parseFitReasoning(ENGLISH)).toMatchObject({ strengths: ["Kotlin"], gaps: ["No GCP"] });
  });

  it("accepts bold lines as headings", () => {
    expect(parseFitReasoning("**Lücken**\n- Kein GCP")?.gaps).toEqual(["Kein GCP"]);
  });

  it("uses plain lines as items when a section has no bullets", () => {
    expect(parseFitReasoning("## Stärken\nKotlin\nKafka")?.strengths).toEqual(["Kotlin", "Kafka"]);
  });

  it("returns null for free text without known headings", () => {
    expect(parseFitReasoning("Passt gut, aber Gehalt unklar.")).toBeNull();
    expect(parseFitReasoning(null)).toBeNull();
  });
});
```

`web/tests/unit/domain/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/domain/markdown";

describe("parseMarkdown", () => {
  it("reads headings, lists and paragraphs", () => {
    expect(parseMarkdown("# Titel\n\nErster Satz\nzweiter Satz.\n\n- a\n- b\n1. c")).toEqual([
      { type: "heading", text: "Titel" },
      { type: "paragraph", text: "Erster Satz zweiter Satz." },
      { type: "list", items: ["a", "b", "c"] },
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(parseMarkdown("  \n \n")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("marks bold text", () => {
    expect(parseInline("vor **fett** nach")).toEqual([
      { type: "text", text: "vor " },
      { type: "strong", text: "fett" },
      { type: "text", text: " nach" },
    ]);
  });

  it("keeps http links", () => {
    expect(parseInline("[Karriere](https://acme.de/jobs)")).toEqual([
      { type: "link", text: "Karriere", href: "https://acme.de/jobs" },
    ]);
  });

  it("shows any other link target as plain text", () => {
    expect(parseInline("[klick](javascript:alert(1))")).toEqual([
      { type: "text", text: "[klick](javascript:alert(1))" },
    ]);
  });
});
```

`web/tests/unit/domain/interviewPrep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseInterviewPrep } from "@/domain/interviewPrep";

const PREP = {
  report_output: { executive_summary: "Gute Ausgangslage.", deep_dive_analysis: "## Tiefe" },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Systeme.",
    gap_analysis: [
      {
        requirement: "GCP",
        cv_status: "fehlt",
        gap_severity: "High",
        interview_strategy: "AWS-Erfahrung übertragen",
      },
    ],
  },
  deep_dive_buttons: [{ title: "Team", focus: "Teamgröße", how_to_proceed: "LinkedIn" }],
  confidence_assessment: { overall_confidence: "Moderate", uncertainties: "Budget" },
  social_intelligence_research: { potential_contacts: [{ name: "A. Muster", role: "CTO" }] },
};

describe("parseInterviewPrep", () => {
  it("is none without material", () => {
    expect(parseInterviewPrep(null)).toEqual({ kind: "none" });
  });

  it("reads the stored JSON string", () => {
    const parsed = parseInterviewPrep(JSON.stringify(PREP));
    expect(parsed.kind).toBe("prep");
    expect(parsed.kind === "prep" && parsed.prep.structured_prep?.gap_analysis[0].requirement).toBe(
      "GCP",
    );
  });

  it("formats contacts with their role", () => {
    const parsed = parseInterviewPrep(JSON.stringify(PREP));
    expect(
      parsed.kind === "prep" && parsed.prep.social_intelligence_research?.potential_contacts,
    ).toEqual(["A. Muster (CTO)"]);
  });

  it("is unreadable for broken JSON", () => {
    expect(parseInterviewPrep("{kaputt")).toEqual({ kind: "unreadable" });
  });

  it("is unreadable when the AI answer could not be parsed on the server", () => {
    expect(parseInterviewPrep(JSON.stringify({ error: "parse", raw_response: "x" }))).toEqual({
      kind: "unreadable",
    });
  });
});
```

`web/tests/unit/domain/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hostOf, resourceLinks } from "@/domain/links";
import { monogramOf } from "@/domain/monogram";

describe("resourceLinks", () => {
  it("collects http links from strings, lists and objects without duplicates", () => {
    expect(
      resourceLinks({
        careers: "https://acme.de/karriere",
        reviews: ["https://kununu.com/acme", "https://acme.de/karriere"],
        note: "siehe http://blog.acme.de und ftp://x",
      }),
    ).toEqual(["https://acme.de/karriere", "https://kununu.com/acme", "http://blog.acme.de"]);
  });

  it("is empty for anything else", () => {
    expect(resourceLinks(42)).toEqual([]);
    expect(resourceLinks(null)).toEqual([]);
  });
});

describe("hostOf", () => {
  it("returns the host without www", () => {
    expect(hostOf("https://www.stepstone.de/stellen/1")).toBe("stepstone.de");
  });

  it("is null for a missing or broken URL", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("keine url")).toBeNull();
  });
});

describe("monogramOf", () => {
  it.each([
    ["ACME GmbH", "AC"],
    ["Deutsche Bahn AG", "DB"],
    ["n26", "N2"],
    ["  ", "?"],
    [null, "?"],
  ])("%s -> %s", (name, initials) => {
    expect(monogramOf(name)).toBe(initials);
  });
});
```

`web/tests/unit/domain/todos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addTodo, MAX_TODO_TEXT_LENGTH, MAX_TODOS, removeTodo, toggleTodo } from "@/domain/todos";

const ONE = [{ id: "a", text: "Gehalt recherchieren", done: false }];

describe("addTodo", () => {
  it("appends a trimmed to-do", () => {
    expect(addTodo(ONE, "  Referenz anfragen ", "b")).toEqual({
      ok: true,
      todos: [...ONE, { id: "b", text: "Referenz anfragen", done: false }],
    });
  });

  it("rejects an empty text", () => {
    expect(addTodo(ONE, "   ", "b")).toEqual({ ok: false, problem: "empty" });
  });

  it("rejects a text over the server limit", () => {
    expect(addTodo(ONE, "x".repeat(MAX_TODO_TEXT_LENGTH + 1), "b")).toEqual({
      ok: false,
      problem: "tooLong",
    });
  });

  it("rejects the 51st to-do", () => {
    const full = Array.from({ length: MAX_TODOS }, (_, index) => ({
      id: String(index),
      text: "t",
      done: false,
    }));
    expect(addTodo(full, "noch eins", "x")).toEqual({ ok: false, problem: "tooMany" });
  });
});

describe("toggleTodo and removeTodo", () => {
  it("toggles one to-do", () => {
    expect(toggleTodo(ONE, "a")).toEqual([{ ...ONE[0], done: true }]);
  });

  it("removes one to-do", () => {
    expect(removeTodo(ONE, "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: FAIL, unresolved imports of the six new modules.

- [ ] **Step 3: Implement `web/src/domain/markdown.ts`**

```ts
export type MarkdownBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; href: string };

const HEADING = /^#{1,6}\s+(.+)$/;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
// Bold and [text](target); anything else stays text. Rendered as React nodes, never as HTML.
const INLINE_TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const HTTP_URL = /^https?:\/\//i;
const BOLD_MARK_LENGTH = 2;

/** Small, safe subset for AI text (reasoning, deep dives, prep): headings, lists, paragraphs. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const line of source.split("\n")) appendLine(blocks, line.trim());
  // Empty paragraphs only marked paragraph breaks.
  return blocks.filter((block) => block.type !== "paragraph" || block.text !== "");
}

function appendLine(blocks: MarkdownBlock[], line: string): void {
  const last = blocks[blocks.length - 1];
  const heading = HEADING.exec(line);
  const bullet = BULLET.exec(line);
  if (line === "") blocks.push({ type: "paragraph", text: "" });
  else if (heading) blocks.push({ type: "heading", text: heading[1].trim() });
  else if (bullet && last?.type === "list") last.items.push(bullet[1].trim());
  else if (bullet) blocks.push({ type: "list", items: [bullet[1].trim()] });
  else if (last?.type === "paragraph" && last.text !== "") last.text = `${last.text} ${line}`;
  else if (last?.type === "paragraph") last.text = line;
  else blocks.push({ type: "paragraph", text: line });
}

export function parseInline(text: string): InlineSegment[] {
  return text
    .split(INLINE_TOKEN)
    .filter((part) => part !== "")
    .map(toSegment)
    .reduce<InlineSegment[]>(mergeText, []);
}

function toSegment(part: string): InlineSegment {
  const isBold = part.startsWith("**") && part.endsWith("**") && part.length > 2 * BOLD_MARK_LENGTH;
  if (isBold) return { type: "strong", text: part.slice(BOLD_MARK_LENGTH, -BOLD_MARK_LENGTH) };
  const link = LINK.exec(part);
  if (link && HTTP_URL.test(link[2])) return { type: "link", text: link[1], href: link[2] };
  return { type: "text", text: part };
}

/** A rejected link target is split by the tokenizer; glue neighbouring text back together. */
function mergeText(segments: InlineSegment[], segment: InlineSegment): InlineSegment[] {
  const last = segments[segments.length - 1];
  if (segment.type !== "text" || last?.type !== "text") return [...segments, segment];
  return [...segments.slice(0, -1), { type: "text", text: last.text + segment.text }];
}
```

- [ ] **Step 4: Implement `web/src/domain/reasoning.ts`**

```ts
export interface FitReasoning {
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
}

type SectionKey = keyof FitReasoning;
interface Section {
  key: SectionKey | null;
  lines: string[];
}

// Headings come from intelligence/prompts.py (German and English); match loosely, the AI varies them.
const SECTION_MATCHERS: ReadonlyArray<readonly [SectionKey, RegExp]> = [
  ["gaps", /lücke|gap|herausforder|challenge/i],
  ["strengths", /stärke|strength|übereinstimm|match/i],
  ["summary", /zusammenfass|summary|fazit/i],
  ["recommendation", /empfehl|recommend/i],
];
const MARKDOWN_HEADING = /^#{1,6}\s+(.+)$/;
const BOLD_HEADING = /^\*\*(.+?)\*\*:?$/;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;

/** Splits the analysis markdown into Passt/Lücken (spec 4.2); null when its headings are unknown. */
export function parseFitReasoning(markdown?: string | null): FitReasoning | null {
  if (!markdown) return null;
  const sections = splitSections(markdown).filter((section) => section.key !== null);
  if (sections.length === 0) return null;
  const result: FitReasoning = { summary: "", strengths: [], gaps: [], recommendation: "" };
  for (const section of sections) fill(result, section);
  return result;
}

function headingOf(line: string): string | null {
  return MARKDOWN_HEADING.exec(line)?.[1] ?? BOLD_HEADING.exec(line)?.[1] ?? null;
}

function sectionKey(heading: string): SectionKey | null {
  return SECTION_MATCHERS.find(([, pattern]) => pattern.test(heading))?.[0] ?? null;
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ key: null, lines: [] }];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const heading = headingOf(line);
    if (heading !== null) sections.push({ key: sectionKey(heading), lines: [] });
    else if (line !== "") sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function fill(result: FitReasoning, section: Section): void {
  if (section.key === "strengths" || section.key === "gaps") {
    result[section.key].push(...section.lines.map((line) => BULLET.exec(line)?.[1].trim() ?? line));
  } else if (section.key) {
    result[section.key] = section.lines.join(" ");
  }
}
```

- [ ] **Step 5: Implement `web/src/domain/links.ts` and `web/src/domain/monogram.ts`**

`web/src/domain/links.ts`:

```ts
const URL_IN_TEXT = /https?:\/\/[^\s,;"'<>]+/gi;
const HTTP_URL = /^https?:\/\//i;
const WWW_PREFIX = /^www\./;
// AI output may nest links in objects of lists; two levels cover every shape seen so far.
const MAX_DEPTH = 2;

export function isHttpUrl(text: string): boolean {
  return HTTP_URL.test(text);
}

/** Every http(s) link found in an AI "online_resources" value, first occurrence first. */
export function resourceLinks(value: unknown): string[] {
  return [...new Set(collect(value, 0))];
}

function collect(value: unknown, depth: number): string[] {
  if (typeof value === "string") return value.match(URL_IN_TEXT) ?? [];
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return [];
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.flatMap((child) => collect(child, depth + 1));
}

export function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(WWW_PREFIX, "");
  } catch {
    return null;
  }
}
```

`web/src/domain/monogram.ts`:

```ts
const LEGAL_FORMS = new Set(["gmbh", "ag", "se", "kg", "ug", "mbh", "co.", "&", "inc", "ltd", "llc"]);
const MONOGRAM_LENGTH = 2;
const UNKNOWN = "?";

/** Two letters for the company square: first letters of two words, else the first two letters. */
export function monogramOf(name?: string | null): string {
  const words = (name ?? "")
    .split(/\s+/)
    .filter((word) => word !== "" && !LEGAL_FORMS.has(word.toLowerCase()));
  if (words.length === 0) return UNKNOWN;
  const letters =
    words.length > 1 ? words.slice(0, MONOGRAM_LENGTH).map((word) => word[0]).join("") : words[0];
  return letters.slice(0, MONOGRAM_LENGTH).toUpperCase();
}
```

- [ ] **Step 6: Implement `web/src/domain/interviewPrep.ts` and `web/src/domain/todos.ts`**

`web/src/domain/interviewPrep.ts`:

```ts
import { z } from "zod";
import { deepDiveSchema, optionalText, textList } from "@/api/companies";

const gapSchema = z.object({
  requirement: z.string(),
  cv_status: optionalText,
  gap_severity: optionalText,
  interview_strategy: optionalText,
});

const contactSchema = z.union([
  z.string(),
  z
    .object({ name: z.string(), role: optionalText })
    .transform((contact) => (contact.role ? `${contact.name} (${contact.role})` : contact.name)),
]);

// interview_prep_material is AI output stored as a JSON string (inventory A.6); degrade per field.
const prepSchema = z.object({
  report_output: z
    .object({ executive_summary: optionalText, deep_dive_analysis: optionalText })
    .nullish()
    .catch(null),
  structured_prep: z
    .object({ gap_analysis: z.array(gapSchema).catch([]), elevator_pitch: optionalText })
    .nullish()
    .catch(null),
  deep_dive_buttons: z.array(deepDiveSchema).catch([]),
  confidence_assessment: z
    .object({ overall_confidence: optionalText, uncertainties: textList })
    .nullish()
    .catch(null),
  social_intelligence_research: z
    .object({ potential_contacts: z.array(contactSchema).catch([]), insights_from_contacts: textList })
    .nullish()
    .catch(null),
  online_resources: z.unknown(),
  error: z.string().nullish(),
});
export type InterviewPrep = z.infer<typeof prepSchema>;

export type ParsedPrep =
  | { kind: "none" }
  | { kind: "unreadable" }
  | { kind: "prep"; prep: InterviewPrep };

export function parseInterviewPrep(raw?: string | null): ParsedPrep {
  if (!raw) return { kind: "none" };
  const parsed = prepSchema.safeParse(readJson(raw));
  // The server stores {error, raw_response} when it could not parse the AI answer.
  if (!parsed.success || parsed.data.error) return { kind: "unreadable" };
  return { kind: "prep", prep: parsed.data };
}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
```

`web/src/domain/todos.ts`:

```ts
import type { JobTodo } from "@/api/jobs";

// Server limits (database/core.py JobPatchRequest / JobTodo); checked here so the user gets a sentence, not a 422.
export const MAX_TODOS = 50;
export const MAX_TODO_TEXT_LENGTH = 500;

export type TodoProblem = "empty" | "tooLong" | "tooMany";
export type TodoResult = { ok: true; todos: JobTodo[] } | { ok: false; problem: TodoProblem };

/** `id` is injected (crypto.randomUUID in the UI) so this stays pure. */
export function addTodo(todos: readonly JobTodo[], text: string, id: string): TodoResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, problem: "empty" };
  if (trimmed.length > MAX_TODO_TEXT_LENGTH) return { ok: false, problem: "tooLong" };
  if (todos.length >= MAX_TODOS) return { ok: false, problem: "tooMany" };
  return { ok: true, todos: [...todos, { id, text: trimmed, done: false }] };
}

export function toggleTodo(todos: readonly JobTodo[], id: string): JobTodo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

export function removeTodo(todos: readonly JobTodo[], id: string): JobTodo[] {
  return todos.filter((todo) => todo.id !== id);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain`
Expected: PASS (30 new tests).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 7: Pending background tasks, clock and realtime mapping

**Files:**
- Create: `web/src/domain/pendingTasks.ts`, `web/src/realtime/usePendingTasks.ts`, `web/src/lib/clock.ts` (already created by Task 0 with the content below; keep it identical)
- Modify: `web/src/realtime/events.ts`, `web/src/realtime/applyEvent.ts`
- Test: `web/tests/unit/domain/pendingTasks.test.ts`, `web/tests/unit/lib/clock.test.tsx`, `web/tests/unit/realtime/jobEvents.test.ts`

**Interfaces:**
- Consumes: `queryKeys.pendingTasks`, `queryKeys.job`, `queryKeys.company` (Task 2); `DocumentKind` (Task 3).
- Produces (`@/domain/pendingTasks`): `interface PendingTask { startedAt: number; failed: boolean }`, `type PendingTasks = Readonly<Record<string, PendingTask>>`, `EMPTY_PENDING`, `STALL_AFTER_MS = 180_000`, `pendingTaskId` (`analysis(jobId)`, `prep(jobId)`, `research(domain)`, `render(jobId, kind)`, `renderPrefix(jobId)`, `generation(jobId)`), `startTask(tasks, id, now)`, `finishTask(tasks, id)`, `failTasks(tasks, prefix)`, `type TaskPhase = "idle" | "running" | "stalled" | "failed"`, `taskPhase(tasks, id, now): TaskPhase`.
- Produces (`@/realtime/usePendingTasks`): `usePendingTasks(): PendingTasks`, `useTaskPhase(id: string): TaskPhase`, `markTaskStarted(queryClient, id, now: number): void`, `markTaskFinished(queryClient, id): void`.
- Produces (`@/lib/clock`): `CLOCK_TICK_MS = 30_000`, `useNow(): number` (milliseconds; re-renders every 30 s while mounted).
- Changes: `job_update` events carry optional `rendered_kind` and `error` (the event's `status` is deliberately not parsed: the render task publishes a status it never wrote, Review Focus 2). `applyEvent` finishes `analysis:<id>` on `job_updated`, `prep:<id>` on `interview_prep_ready`, `research:<domain>` on `company_profile_ready`, `render:<id>:<kind>` on `job_update{rendered_kind}`, and marks `render:<id>:*` failed on `job_update{error}` without `rendered_kind`; `generation:<id>` finishes on every `job_update` without `rendered_kind`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/pendingTasks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_PENDING,
  failTasks,
  finishTask,
  pendingTaskId,
  STALL_AFTER_MS,
  startTask,
  taskPhase,
} from "@/domain/pendingTasks";

const T0 = 1_000_000;
const PREP = pendingTaskId.prep("job-1");

describe("pending tasks", () => {
  it("is idle until started", () => {
    expect(taskPhase(EMPTY_PENDING, PREP, T0)).toBe("idle");
  });

  it("runs after a start", () => {
    expect(taskPhase(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + 1)).toBe("running");
  });

  it("stalls after three minutes without an answer", () => {
    expect(taskPhase(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + STALL_AFTER_MS)).toBe(
      "stalled",
    );
  });

  it("is idle again once finished", () => {
    const tasks = finishTask(startTask(EMPTY_PENDING, PREP, T0), PREP);
    expect(taskPhase(tasks, PREP, T0 + 1)).toBe("idle");
  });

  it("marks every render of a job failed, and nothing else", () => {
    const cv = pendingTaskId.render("job-1", "cv");
    const tasks = startTask(startTask(EMPTY_PENDING, cv, T0), PREP, T0);
    const failed = failTasks(tasks, pendingTaskId.renderPrefix("job-1"));
    expect(taskPhase(failed, cv, T0 + 1)).toBe("failed");
    expect(taskPhase(failed, PREP, T0 + 1)).toBe("running");
  });

  it("keeps the earliest start when started twice", () => {
    const twice = startTask(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + 5);
    expect(twice[PREP].startedAt).toBe(T0);
  });
});
```

`web/tests/unit/lib/clock.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOCK_TICK_MS, useNow } from "@/lib/clock";

const START = Date.UTC(2026, 9, 8, 10, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("returns the current time on mount", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(START);
  });

  it("moves forward every tick", () => {
    const { result } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(CLOCK_TICK_MS));
    expect(result.current).toBe(START + CLOCK_TICK_MS);
  });
});
```

`web/tests/unit/realtime/jobEvents.test.ts`:

```ts
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, pendingTaskId, startTask, type PendingTasks } from "@/domain/pendingTasks";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import { buildJob } from "../support/jobFactory";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 8, 12, 0);

function setup(pending: PendingTasks = EMPTY_PENDING) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.job("job-1"), buildJob({ status: "DRAFTED" }));
  queryClient.setQueryData(queryKeys.pendingTasks, pending);
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError: vi.fn() };
  const send = (event: object) =>
    handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, deps);
  const pendingNow = () => queryClient.getQueryData<PendingTasks>(queryKeys.pendingTasks) ?? {};
  return { queryClient, send, pendingNow };
}

const isInvalidated = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

describe("job events", () => {
  it("invalidates the job and its documents on job_update", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobDocuments("job-1"), []);
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED" });
    expect(isInvalidated(queryClient, queryKeys.jobDocuments("job-1"))).toBe(true);
  });

  it("a render event does not write the event status into the cache", () => {
    const { queryClient, send } = setup();
    send({ type: "job_update", job_id: "job-1", status: "FAILED", rendered_kind: "cv" });
    expect(queryClient.getQueryData<{ status: string }>(queryKeys.job("job-1"))?.status).toBe(
      "DRAFTED",
    );
  });

  it("finishes the pending render of that kind", () => {
    const cv = pendingTaskId.render("job-1", "cv");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, cv, NOW));
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED", rendered_kind: "cv" });
    expect(pendingNow()[cv]).toBeUndefined();
  });

  it("marks a pending render failed on an error event", () => {
    const letter = pendingTaskId.render("job-1", "cover_letter");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, letter, NOW));
    send({ type: "job_update", job_id: "job-1", status: "FAILED", error: "weasyprint" });
    expect(pendingNow()[letter]?.failed).toBe(true);
  });

  it("finishes a pending generation on the final job_update", () => {
    const generation = pendingTaskId.generation("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, generation, NOW));
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED" });
    expect(pendingNow()[generation]).toBeUndefined();
  });

  it("finishes the re-analysis on job_updated", () => {
    const analysis = pendingTaskId.analysis("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, analysis, NOW));
    send({ type: "job_updated", job: { id: "job-1" } });
    expect(pendingNow()[analysis]).toBeUndefined();
  });

  it("finishes the interview prep", () => {
    const prep = pendingTaskId.prep("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, prep, NOW));
    send({ type: "interview_prep_ready", job_id: "job-1" });
    expect(pendingNow()[prep]).toBeUndefined();
  });

  it("finishes the company research and refreshes the profile", () => {
    const research = pendingTaskId.research("acme.de");
    const { queryClient, send, pendingNow } = setup(startTask(EMPTY_PENDING, research, NOW));
    queryClient.setQueryData(queryKeys.company("acme.de"), null);
    send({ type: "company_profile_ready", domain: "acme.de" });
    expect(pendingNow()[research]).toBeUndefined();
    expect(isInvalidated(queryClient, queryKeys.company("acme.de"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/pendingTasks.test.ts tests/unit/lib/clock.test.tsx tests/unit/realtime/jobEvents.test.ts`
Expected: FAIL, unresolved `@/domain/pendingTasks`; the realtime tests fail on the pending-task assertions.

- [ ] **Step 3: Check the clock**

`web/src/lib/clock.ts` exists since Task 0. Its tests above must pass without changes; if they fail, fix the module, not the tests.

- [ ] **Step 4: Implement `web/src/domain/pendingTasks.ts`**

```ts
import type { DocumentKind } from "@/api/jobDocuments";

export interface PendingTask {
  startedAt: number;
  failed: boolean;
}

/** Background work the server keeps no state for; finished by realtime events (applyEvent). */
export type PendingTasks = Readonly<Record<string, PendingTask>>;

export const EMPTY_PENDING: PendingTasks = {};

/** Interview prep and research publish no failure event (backend gap G6); after this, offer a retry. */
export const STALL_AFTER_MS = 180_000;

export const pendingTaskId = {
  analysis: (jobId: string) => `analysis:${jobId}`,
  prep: (jobId: string) => `prep:${jobId}`,
  research: (domain: string) => `research:${domain}`,
  render: (jobId: string, kind: DocumentKind) => `render:${jobId}:${kind}`,
  renderPrefix: (jobId: string) => `render:${jobId}:`,
  generation: (jobId: string) => `generation:${jobId}`,
};

export type TaskPhase = "idle" | "running" | "stalled" | "failed";

export function startTask(tasks: PendingTasks, id: string, now: number): PendingTasks {
  const startedAt = tasks[id] && !tasks[id].failed ? tasks[id].startedAt : now;
  return { ...tasks, [id]: { startedAt, failed: false } };
}

export function finishTask(tasks: PendingTasks, id: string): PendingTasks {
  if (!(id in tasks)) return tasks;
  const rest = { ...tasks };
  delete rest[id];
  return rest;
}

export function failTasks(tasks: PendingTasks, prefix: string): PendingTasks {
  const entries = Object.entries(tasks).map(([id, task]) =>
    id.startsWith(prefix) ? [id, { ...task, failed: true }] : [id, task],
  );
  return Object.fromEntries(entries) as PendingTasks;
}

export function taskPhase(tasks: PendingTasks, id: string, now: number): TaskPhase {
  const task = tasks[id];
  if (!task) return "idle";
  if (task.failed) return "failed";
  return now - task.startedAt >= STALL_AFTER_MS ? "stalled" : "running";
}
```

- [ ] **Step 5: Implement `web/src/realtime/usePendingTasks.ts`**

```ts
"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import {
  EMPTY_PENDING,
  finishTask,
  startTask,
  taskPhase,
  type PendingTasks,
  type TaskPhase,
} from "@/domain/pendingTasks";
import { useNow } from "@/lib/clock";

function readPending(queryClient: QueryClient): PendingTasks {
  return queryClient.getQueryData<PendingTasks>(queryKeys.pendingTasks) ?? EMPTY_PENDING;
}

/** Client-only state in the query cache, so applyEvent can finish tasks in one place (spec 6). */
export function usePendingTasks(): PendingTasks {
  const queryClient = useQueryClient();
  // The "fetch" re-reads the cache: a refetch after a reconnect must not wipe running tasks.
  const query = useQuery({
    queryKey: queryKeys.pendingTasks,
    queryFn: () => readPending(queryClient),
    initialData: EMPTY_PENDING,
    staleTime: Infinity,
  });
  return query.data;
}

export function useTaskPhase(id: string): TaskPhase {
  const tasks = usePendingTasks();
  return taskPhase(tasks, id, useNow());
}

export function markTaskStarted(queryClient: QueryClient, id: string, now: number): void {
  queryClient.setQueryData(queryKeys.pendingTasks, startTask(readPending(queryClient), id, now));
}

export function markTaskFinished(queryClient: QueryClient, id: string): void {
  queryClient.setQueryData(queryKeys.pendingTasks, finishTask(readPending(queryClient), id));
}
```

- [ ] **Step 6: Extend the event schema**

In `web/src/realtime/events.ts` replace the `job_update` line with:

```ts
  // Generation and render tasks. `status` is deliberately not parsed: ai.render_document_pdf
  // publishes a status it never wrote to the database, so the client always refetches instead.
  z.object({
    type: z.literal("job_update"),
    ...userScoped,
    job_id: z.string(),
    rendered_kind: z.enum(["cv", "cover_letter"]).optional(),
    error: z.string().nullish(),
  }),
```

- [ ] **Step 7: Map the events in `web/src/realtime/applyEvent.ts`**

Add the imports:

```ts
import {
  EMPTY_PENDING,
  failTasks,
  finishTask,
  pendingTaskId,
  type PendingTasks,
} from "@/domain/pendingTasks";
```

Add below `finishCrawl`:

```ts
function patchPending(deps: RealtimeDeps, update: (tasks: PendingTasks) => PendingTasks): void {
  deps.queryClient.setQueryData<PendingTasks>(queryKeys.pendingTasks, (tasks) =>
    update(tasks ?? EMPTY_PENDING),
  );
}

function jobUpdated(event: EventOf<"job_updated">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(event.job.id), queryKeys.jobsRoot);
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.analysis(event.job.id)));
}

function prepReady(event: EventOf<"interview_prep_ready">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(event.job_id));
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.prep(event.job_id)));
}

function companyReady(event: EventOf<"company_profile_ready">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.company(event.domain));
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.research(event.domain)));
}
```

Add the handler for `job_update` next to them:

```ts
/** Ends of generation (no rendered_kind) and of a PDF re-render (rendered_kind); both only invalidate. */
function jobUpdate(event: EventOf<"job_update">, deps: RealtimeDeps): void {
  invalidate(deps, queryKeys.job(event.job_id), queryKeys.jobsRoot);
  const kind = event.rendered_kind;
  if (kind) {
    patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.render(event.job_id, kind)));
    return;
  }
  patchPending(deps, (tasks) => finishTask(tasks, pendingTaskId.generation(event.job_id)));
  if (event.error) {
    patchPending(deps, (tasks) => failTasks(tasks, pendingTaskId.renderPrefix(event.job_id)));
  }
}
```

In the `HANDLERS` map replace the four entries:

```ts
  job_updated: jobUpdated,
  job_update: jobUpdate,
  interview_prep_ready: prepReady,
  company_profile_ready: companyReady,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/pendingTasks.test.ts tests/unit/lib/clock.test.tsx tests/unit/realtime`
Expected: PASS (6 + 2 + 8 new, existing realtime tests unchanged).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 8: UI primitives (Stepper states and heading, Menu, A4Preview, Monogram, Markdown, Disclosure, SelectField, TextAreaField, CheckField)

**Files:**
- Modify: `web/src/ui/Stepper.tsx`, `web/src/ui/Field.tsx`, `web/src/ui/styles/layout.css`, `web/app/globals.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/unit/ui/layout.test.tsx`
- Create: `web/src/ui/Menu.tsx`, `web/src/ui/A4Preview.tsx`, `web/src/ui/Monogram.tsx`, `web/src/ui/Markdown.tsx`, `web/src/ui/Disclosure.tsx`, `web/src/ui/styles/content.css`
- Test: `web/tests/unit/ui/contentPrimitives.test.tsx`, `web/tests/unit/ui/menu.test.tsx`

**Interfaces:**
- Consumes: `monogramOf` (Task 6), `parseMarkdown`, `parseInline` (Task 6), `ModalLayer`, `PanelHeader`, `Icon`, `cx`, `layerStack`, `centerInStrip` (phase 1).
- Produces:
  - `@/ui/Stepper`: `type StepState = "past" | "current" | "future" | "skipped" | "closed"`, `interface StepItem { key: string; label: string; date?: string; state: StepState }`, `Stepper({ steps, label, headingLevel? }: { steps: readonly StepItem[]; label: string; headingLevel?: 2 | 3 })`. Without `headingLevel` the label is the list's `aria-label`; with it, the label is a visible heading and the list is `aria-labelledby` it ("configurable heading"). `currentIndex` and `stepState` are removed (state comes from `phaseTrack`).
  - `@/ui/Menu`: `interface MenuItem<K> { key: K; label: string; checked?: boolean; disabled?: boolean }`, `MenuButton<K>({ buttonLabel, menuLabel, items, onSelect })`, `menuFocusIndex(key, current, count): number | null` (decision D2).
  - `@/ui/A4Preview`: `A4Preview({ title, pdfUrl, downloadName?, slug, emptyText?, busy?, children? })`.
  - `@/ui/Monogram`: `Monogram({ name }: { name?: string | null })`.
  - `@/ui/Markdown`: `Markdown({ source }: { source: string })`, `InlineText({ text }: { text: string })`.
  - `@/ui/Disclosure`: `Disclosure({ label, children, defaultOpen? })`.
  - `@/ui/Field` additions: `SelectField({ id, label, hint?, error?, children, ...selectProps })`, `TextAreaField({ id, label, hint?, error?, ...textareaProps })`, `CheckField({ id, label, checked, onChange, disabled? })` where `onChange: (checked: boolean) => void`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/ui/menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuButton, menuFocusIndex, type MenuItem } from "@/ui/Menu";

type Key = "a" | "b" | "c";
const ITEMS: readonly MenuItem<Key>[] = [
  { key: "a", label: "Vorgemerkt" },
  { key: "b", label: "Beworben", checked: true },
  { key: "c", label: "Interview", disabled: true },
];

function renderMenu(onSelect = vi.fn()) {
  render(
    <MenuButton buttonLabel="Phase ändern" menuLabel="Phase ändern" items={ITEMS} onSelect={onSelect} />,
  );
  return { onSelect, button: screen.getByRole("button", { name: "Phase ändern" }) };
}

describe("menuFocusIndex", () => {
  it.each([
    ["ArrowDown", 2, 3, 0],
    ["ArrowUp", 0, 3, 2],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
  ])("%s from %i of %i goes to %i", (key, current, count, target) => {
    expect(menuFocusIndex(key, current, count)).toBe(target);
  });

  it("ignores other keys", () => {
    expect(menuFocusIndex("a", 0, 3)).toBeNull();
  });
});

describe("MenuButton", () => {
  it("is a menu button that starts closed", () => {
    const { button } = renderMenu();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on click and focuses the checked item", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    expect(screen.getByRole("menu", { name: "Phase ändern" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveFocus();
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("moves focus with the arrow keys", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Interview" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the button", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("reports the chosen item and closes", async () => {
    const { button, onSelect } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Vorgemerkt" }));
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores a disabled item", async () => {
    const { button, onSelect } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Interview" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens with ArrowDown from the button", async () => {
    const { button } = renderMenu();
    button.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
```

`web/tests/unit/ui/contentPrimitives.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { A4Preview } from "@/ui/A4Preview";
import { Disclosure } from "@/ui/Disclosure";
import { CheckField, SelectField } from "@/ui/Field";
import { Markdown } from "@/ui/Markdown";
import { Monogram } from "@/ui/Monogram";
import { Stepper } from "@/ui/Stepper";

const PDF_URL = "blob:http://localhost/1234";

afterEach(() => {
  // Some tests pretend a browser without an inline PDF viewer.
  Reflect.deleteProperty(navigator, "pdfViewerEnabled");
});

describe("Stepper states", () => {
  const STEPS = [
    { key: "OPEN", label: "Treffer", state: "past" as const },
    { key: "DRAFTED", label: "Vorgemerkt", state: "skipped" as const },
    { key: "CLOSED", label: "Absage erhalten", state: "closed" as const, date: "07.10." },
  ];

  it("names skipped and closed phases in text", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveClass("step", "skipped");
    expect(items[1]).toHaveTextContent("übersprungen");
    expect(items[2]).toHaveTextContent("abgeschlossen");
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });

  it("can show its label as a visible heading", () => {
    render(<Stepper steps={STEPS} label="Phase" headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Phase" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Phase" })).toBeInTheDocument();
  });
});

describe("A4Preview", () => {
  it("shows the PDF from its blob URL", () => {
    const { container } = render(
      <A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="Probedruck" />,
    );
    expect(container.querySelector("object")?.getAttribute("data")).toMatch(/^blob:/);
  });

  it("offers open and download when inline PDFs are unsupported", () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} downloadName="cv.pdf" slug="" />);
    expect(screen.getByRole("link", { name: "PDF öffnen" })).toHaveAttribute("href", PDF_URL);
    expect(screen.getByRole("link", { name: "Herunterladen" })).toHaveAttribute(
      "download",
      "cv.pdf",
    );
  });

  it("shows the empty text without a PDF", () => {
    render(<A4Preview title="Lebenslauf" pdfUrl={null} emptyText="Noch nicht erstellt" slug="" />);
    expect(screen.getByText("Noch nicht erstellt")).toBeInTheDocument();
  });

  it("opens a full-screen preview", async () => {
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    await userEvent.click(screen.getByRole("button", { name: "Vorschau groß öffnen" }));
    expect(screen.getByRole("dialog", { name: "Lebenslauf" })).toBeInTheDocument();
  });

  it("shows its children instead of the PDF (editing)", () => {
    render(
      <A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="">
        <p>Editor</p>
      </A4Preview>,
    );
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vorschau groß öffnen" })).not.toBeInTheDocument();
  });
});

describe("Markdown", () => {
  it("renders headings, lists, bold text and safe links", () => {
    render(<Markdown source={"## Ergebnis\n- **Kotlin** passt\n\n[Blog](https://acme.de)"} />);
    expect(screen.getByRole("heading", { name: "Ergebnis" })).toBeInTheDocument();
    expect(screen.getByText("Kotlin").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("Disclosure", () => {
  it("toggles its region", async () => {
    render(<Disclosure label="Vollständige Begründung">Text</Disclosure>);
    const button = screen.getByRole("button", { name: "Vollständige Begründung" });
    expect(screen.getByText("Text")).not.toBeVisible();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Text")).toBeVisible();
  });
});

describe("Fields", () => {
  it("connects a select to its hint and error", () => {
    render(
      <SelectField id="kind" label="Art" hint="Pflicht" error="Bitte wählen">
        <option value="">-</option>
      </SelectField>,
    );
    expect(screen.getByLabelText("Art")).toHaveAttribute("aria-describedby", "kind-hint kind-error");
    expect(screen.getByLabelText("Art")).toHaveAttribute("aria-invalid", "true");
  });

  it("reports a checkbox change as a boolean", async () => {
    const changes: boolean[] = [];
    render(<CheckField id="sent" label="Abgeschickt" checked={false} onChange={(v) => changes.push(v)} />);
    await userEvent.click(screen.getByLabelText("Abgeschickt"));
    expect(changes).toEqual([true]);
  });
});

describe("Monogram", () => {
  it("is decorative", () => {
    const { container } = render(<Monogram name="ACME GmbH" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("AC");
  });
});
```

In `web/tests/unit/ui/layout.test.tsx`, replace the whole `describe("Stepper", ...)` block with the new API (same behaviour, states given explicitly):

```tsx
describe("Stepper", () => {
  const STEPS = [
    { key: "OPEN", label: "Treffer", state: "past" as const },
    { key: "DRAFTED", label: "Vorgemerkt", date: "07.10.", state: "current" as const },
    { key: "APPLIED", label: "Beworben", state: "future" as const },
  ];

  it("marks past, current and future phases", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("step", "past");
    expect(items[1]).toHaveClass("step", "current");
    expect(items[2]).toHaveClass("step", "future");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("states done, current and upcoming in text, not only by colour", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("erledigt");
    expect(items[1]).toHaveTextContent("aktuell");
    expect(items[2]).toHaveTextContent("offen");
  });

  it("centres the current step inside an overflowing strip", () => {
    stubStripLayout({ strip: "stepper", item: ".step.current", overflow: true });
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.getByRole("list").scrollLeft).toBe(300);
  });

  it("does not scroll a strip that fits", () => {
    stubStripLayout({ strip: "stepper", item: ".step.current", overflow: false });
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.getByRole("list").scrollLeft).toBe(0);
  });

  it("is read-only", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui`
Expected: FAIL, unresolved `@/ui/Menu`, `@/ui/A4Preview`, `@/ui/Markdown`, `@/ui/Disclosure`, `@/ui/Monogram`; `SelectField`/`CheckField` not exported; Stepper state tests fail.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts` (before `} as const;`):

```ts
  "step.skipped": "übersprungen",
  "step.closed": "abgeschlossen",
  "preview.open": "PDF öffnen",
  "preview.download": "Herunterladen",
  "preview.unsupported": "Dein Browser zeigt PDFs hier nicht direkt an.",
  "preview.expand": "Vorschau groß öffnen",
```

`web/src/i18n/en.ts` (before `};`):

```ts
  "step.skipped": "skipped",
  "step.closed": "closed",
  "preview.open": "Open PDF",
  "preview.download": "Download",
  "preview.unsupported": "Your browser cannot show PDFs here directly.",
  "preview.expand": "Open large preview",
```

- [ ] **Step 4: Rewrite `web/src/ui/Stepper.tsx`**

```tsx
"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "./cx";
import { centerInStrip } from "./scrollStrip";

export type StepState = "past" | "current" | "future" | "skipped" | "closed";

export interface StepItem {
  key: string;
  label: string;
  date?: string;
  state: StepState;
}

export interface StepperProps {
  steps: readonly StepItem[];
  /** Accessible name; rendered as a visible heading when headingLevel is set. */
  label: string;
  headingLevel?: 2 | 3;
}

// "closed" is the final phase reached; it is the current position like "current".
const ACTIVE_STATES: ReadonlySet<StepState> = new Set<StepState>(["current", "closed"]);

/** Read-only phase track: ink for done, vermilion for now, dotted for skipped (usability #6). */
export function Stepper({ steps, label, headingLevel }: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const headingId = useId();
  useCenterActiveStep(listRef, steps.findIndex((step) => ACTIVE_STATES.has(step.state)));
  const columns = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` };
  const naming = headingLevel ? { "aria-labelledby": headingId } : { "aria-label": label };
  return (
    <>
      {headingLevel ? <StepperHeading id={headingId} level={headingLevel} text={label} /> : null}
      <ol ref={listRef} className="stepper" style={columns} {...naming}>
        {steps.map((step) => (
          <StepEntry key={step.key} step={step} />
        ))}
      </ol>
    </>
  );
}

function StepperHeading({ id, level, text }: { id: string; level: 2 | 3; text: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Heading id={id} className="sec-title-sm stepper-heading">
      {text}
    </Heading>
  );
}

function StepEntry({ step }: { step: StepItem }) {
  const { t } = useI18n();
  const active = ACTIVE_STATES.has(step.state);
  return (
    <li className={cx("step", step.state)} aria-current={active ? "step" : undefined}>
      <span className="step-label">{step.label}</span>
      <span className="sr-only">{t(`step.${step.state}`)}</span>
      <span className="step-date">{step.date ?? ""}</span>
    </li>
  );
}

/** Mobile shows the stepper as a horizontal scroller; centre the current phase without scrolling the page. */
function useCenterActiveStep(listRef: RefObject<HTMLOListElement | null>, index: number): void {
  useEffect(() => {
    const list = listRef.current;
    centerInStrip(list, list?.children.item(index));
  }, [listRef, index]);
}
```

Add to `web/src/ui/styles/layout.css` after the `.step.current .step-date` rule:

```css
  /* Skipped: a dotted track and plain label, so "jumped over" never reads as "done" (usability #6). */
  .step.skipped::before {
    background: none;
    border-top: 4px dotted var(--line-control);
    height: 0;
  }
  .step.skipped .step-label {
    font-weight: 500;
  }
  .step.closed {
    color: var(--text);
  }
  .step.closed::before {
    background: var(--text);
    height: 8px;
    top: -2px;
  }
  .step.closed .step-label {
    font-weight: 700;
  }
  .stepper-heading {
    margin-top: 34px;
  }
  .stepper-heading + .stepper {
    margin-top: 10px;
  }
```

- [ ] **Step 5: Implement `web/src/ui/Menu.tsx`**

```tsx
"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { Icon } from "./Icon";
import { isTopLayer, pushLayer } from "./layerStack";

export interface MenuItem<K extends string> {
  key: K;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface MenuButtonProps<K extends string> {
  buttonLabel: string;
  menuLabel: string;
  items: readonly MenuItem<K>[];
  onSelect: (key: K) => void;
}

const FOCUS_STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
const ITEM_SELECTOR = '[role="menuitemradio"]';

/** Roving focus inside the menu (WAI-ARIA menu pattern); null for keys the menu does not handle. */
export function menuFocusIndex(key: string, current: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = FOCUS_STEP[key];
  return step === undefined ? null : (current + step + count) % count;
}

/**
 * Menu button (decision D2): a short list of mutually exclusive commands. Arrow keys move,
 * Escape closes and returns focus to the button, Tab closes and moves on.
 */
export function MenuButton<K extends string>(props: MenuButtonProps<K>) {
  const menu = useMenuState();
  const menuId = useId();
  const choose = (key: K) => {
    menu.close(true);
    props.onSelect(key);
  };
  return (
    <div className="pop-anchor">
      <MenuTrigger label={props.buttonLabel} menuId={menuId} menu={menu} />
      {menu.open ? (
        <MenuList id={menuId} label={props.menuLabel} items={props.items} onSelect={choose} onClose={menu.close} />
      ) : null}
    </div>
  );
}

function useMenuState() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };
  return { open, setOpen, buttonRef, close };
}

type MenuState = ReturnType<typeof useMenuState>;

function MenuTrigger({ label, menuId, menu }: { label: string; menuId: string; menu: MenuState }) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    menu.setOpen(true);
  };
  return (
    <button
      ref={menu.buttonRef}
      type="button"
      className="btn btn-sm"
      aria-haspopup="menu"
      aria-expanded={menu.open}
      aria-controls={menu.open ? menuId : undefined}
      onClick={() => menu.setOpen(!menu.open)}
      onKeyDown={onKeyDown}
    >
      <span>{label}</span>
      <Icon icon={ChevronDown} />
    </button>
  );
}

interface MenuListProps<K extends string> {
  id: string;
  label: string;
  items: readonly MenuItem<K>[];
  onSelect: (key: K) => void;
  onClose: (returnFocus: boolean) => void;
}

function MenuList<K extends string>({ id, label, items, onSelect, onClose }: MenuListProps<K>) {
  const listRef = useRef<HTMLDivElement>(null);
  useMenuLayer(listRef, onClose);
  return (
    <div
      ref={listRef}
      id={id}
      role="menu"
      aria-label={label}
      className="popover down-right anim-pop menu"
      onKeyDown={(event) => moveFocus(event, listRef.current)}
    >
      {items.map((item) => (
        <MenuEntry key={item.key} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

function MenuEntry<K extends string>({ item, onSelect }: { item: MenuItem<K>; onSelect: (key: K) => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      tabIndex={-1}
      className="pop-item"
      aria-checked={item.checked ?? false}
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (!item.disabled) onSelect(item.key);
      }}
    >
      <span>{item.label}</span>
      {item.checked ? <Icon icon={Check} className="pop-check" /> : null}
    </button>
  );
}

function menuItems(list: HTMLElement | null): HTMLElement[] {
  return list ? Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : [];
}

function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>, list: HTMLElement | null): void {
  const items = menuItems(list);
  const current = items.findIndex((item) => item === document.activeElement);
  const target = menuFocusIndex(event.key, current, items.length);
  if (target === null) return;
  event.preventDefault();
  items[target]?.focus();
}

function useMenuLayer(listRef: RefObject<HTMLDivElement | null>, onClose: (returnFocus: boolean) => void) {
  const close = useEffectEvent(onClose);
  useEffect(() => listenWhileOpen(listRef, close), [listRef]);
}

/** Registers the menu as top layer, focuses the checked item and closes on Escape, Tab or outside click. */
function listenWhileOpen(
  listRef: RefObject<HTMLDivElement | null>,
  close: (returnFocus: boolean) => void,
): () => void {
  const layer = pushLayer();
  const items = menuItems(listRef.current);
  (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  const onKey = menuKeyHandler(layer.id, close);
  const onPointer = outsidePointerHandler(listRef, close);
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", onPointer);
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", onPointer);
    layer.pop();
  };
}

function menuKeyHandler(layerId: symbol, close: (returnFocus: boolean) => void) {
  return (event: KeyboardEvent) => {
    if (!isTopLayer(layerId)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };
}

function outsidePointerHandler(
  listRef: RefObject<HTMLDivElement | null>,
  close: (returnFocus: boolean) => void,
) {
  return (event: MouseEvent) => {
    const anchor = listRef.current?.parentElement;
    if (anchor && event.target instanceof Node && !anchor.contains(event.target)) close(false);
  };
}
```

- [ ] **Step 6: Implement `Monogram`, `Markdown`, `Disclosure`**

`web/src/ui/Monogram.tsx`:

```tsx
import { monogramOf } from "@/domain/monogram";

/** Company initials in a ruled square; decorative, the company name is always printed next to it. */
export function Monogram({ name }: { name?: string | null }) {
  return (
    <span className="monogram" aria-hidden="true">
      {monogramOf(name)}
    </span>
  );
}
```

`web/src/ui/Markdown.tsx`:

```tsx
import { parseInline, parseMarkdown, type MarkdownBlock } from "@/domain/markdown";

/** AI markdown as React nodes (never as HTML), so model output cannot inject markup. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      {parseMarkdown(source).map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.type === "heading") {
    return (
      <h4 className="sec-title-sm">
        <InlineText text={block.text} />
      </h4>
    );
  }
  if (block.type === "list") return <ListBlock items={block.items} />;
  return (
    <p>
      <InlineText text={block.text} />
    </p>
  );
}

function ListBlock({ items }: { items: readonly string[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>
          <InlineText text={item} />
        </li>
      ))}
    </ul>
  );
}

export function InlineText({ text }: { text: string }) {
  return parseInline(text).map((segment, index) => {
    if (segment.type === "strong") return <strong key={index}>{segment.text}</strong>;
    if (segment.type === "link") {
      return (
        <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer">
          {segment.text}
        </a>
      );
    }
    return <span key={index}>{segment.text}</span>;
  });
}
```

`web/src/ui/Disclosure.tsx`:

```tsx
"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface DisclosureProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Show/hide region (prototype .disclosure); the region stays in the DOM so aria-controls resolves. */
export function Disclosure({ label, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className="disclosure-block">
      <button
        type="button"
        className="disclosure"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={ChevronRight} />
        {label}
      </button>
      <div id={regionId} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add `SelectField`, `TextAreaField`, `CheckField` to `web/src/ui/Field.tsx`**

Add the imports `import type { SelectHTMLAttributes, TextareaHTMLAttributes } from "react";` (merge into the existing `react` type import) and `import { Select } from "./Select";`, then append:

```tsx
export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

/** Select inside a Field with hint and error wired through aria-describedby. */
export function SelectField({ id, label, hint, error, children, ...selectProps }: SelectFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...selectProps}
      >
        {children}
      </Select>
    </Field>
  );
}

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({ id, label, hint, error, className, ...areaProps }: TextAreaFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className={cx("input", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...areaProps}
      />
    </Field>
  );
}

export interface CheckFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Checkbox with its label as the click target (prototype .check). */
export function CheckField({ id, label, checked, onChange, disabled }: CheckFieldProps) {
  return (
    <label className="check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
```

- [ ] **Step 8: Implement `web/src/ui/A4Preview.tsx`**

```tsx
"use client";

import { Maximize2 } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";
import { cx } from "./cx";
import { ModalLayer } from "./ModalLayer";
import { PanelHeader } from "./PanelHeader";

export interface A4PreviewProps {
  /** Accessible name of the document, e.g. "Lebenslauf". */
  title: string;
  /** blob: URL of the PDF (decision D1: the API forbids framing its own URLs). */
  pdfUrl: string | null;
  downloadName?: string;
  /** The proof slug line under the sheet. */
  slug: ReactNode;
  emptyText?: string;
  busy?: boolean;
  /** Replaces the PDF on the sheet, e.g. the HTML editor. */
  children?: ReactNode;
}

// Fit the page width inside the sheet; ignored by viewers that do not support it.
const PDF_VIEW_FRAGMENT = "#view=FitH";
const BLANK_LINE_WIDTHS = [60, 38, 0, 90, 84, 88, 70, 0, 92, 86, 64, 0, 80, 90, 74];
const noSubscribe = () => () => {};

/** Mobile browsers mostly have no inline PDF viewer; they then get open/download (Review Focus 5). */
function useInlinePdfSupport(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => navigator.pdfViewerEnabled !== false,
    () => true,
  );
}

/** The printed proof: an A4 sheet on the desk with crop marks and a slug line. */
export function A4Preview(props: A4PreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = props.pdfUrl !== null && !props.children;
  return (
    <div className="desk">
      <div className="proof">
        <div className={cx("paper", props.busy && "generating")}>
          <PaperContent {...props} />
        </div>
      </div>
      <div className="proof-slug">{props.slug}</div>
      {canExpand ? <ExpandButton onOpen={() => setExpanded(true)} /> : null}
      {expanded && props.pdfUrl ? (
        <FullPreview {...props} pdfUrl={props.pdfUrl} onClose={() => setExpanded(false)} />
      ) : null}
    </div>
  );
}

function PaperContent({ title, pdfUrl, downloadName, emptyText, children }: A4PreviewProps) {
  const inline = useInlinePdfSupport();
  if (children) return children;
  if (!pdfUrl) return <BlankPaper text={emptyText} />;
  const fallback = <PdfFallback pdfUrl={pdfUrl} downloadName={downloadName} />;
  if (!inline) return fallback;
  return (
    <object className="paper-pdf" type="application/pdf" data={`${pdfUrl}${PDF_VIEW_FRAGMENT}`} aria-label={title}>
      {fallback}
    </object>
  );
}

function BlankPaper({ text }: { text?: string }) {
  return (
    <>
      <div className="pp-lines" aria-hidden="true">
        {BLANK_LINE_WIDTHS.map((width, index) => (
          <i key={index} style={{ width: `${width}%`, opacity: width === 0 ? 0 : undefined }} />
        ))}
      </div>
      {text ? (
        <div className="pp-blank">
          <p>{text}</p>
        </div>
      ) : null}
    </>
  );
}

function PdfFallback({ pdfUrl, downloadName }: { pdfUrl: string; downloadName?: string }) {
  const { t } = useI18n();
  return (
    <div className="pp-blank a4-fallback">
      <p>{t("preview.unsupported")}</p>
      <div className="row">
        <a className="btn btn-sm" href={pdfUrl} target="_blank" rel="noopener noreferrer">
          {t("preview.open")}
        </a>
        <a className="btn btn-sm" href={pdfUrl} download={downloadName ?? ""}>
          {t("preview.download")}
        </a>
      </div>
    </div>
  );
}

function ExpandButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="sm" variant="ghost" className="a4-expand" icon={Maximize2} onClick={onOpen}>
      {t("preview.expand")}
    </Button>
  );
}

function FullPreview(props: A4PreviewProps & { pdfUrl: string; onClose: () => void }) {
  return createPortal(
    <ModalLayer className="a4-full anim-pop" label={props.title} onClose={props.onClose}>
      <PanelHeader title={props.title} onClose={props.onClose} />
      <div className="a4-full-body">
        <PaperContent {...props} slug={null} />
      </div>
    </ModalLayer>,
    document.body,
  );
}
```

- [ ] **Step 9: Port the CSS**

Create `web/src/ui/styles/content.css` (ported from the prototype: `.desk`, `.proof`, `.paper`, `.pp-*`, `.disclosure`, plus the new monogram, menu, markdown and full-screen preview rules):

```css
/* Content primitives: A4 proof, monogram, menu, markdown, disclosure. Ported from the Editorial prototype. */
@layer components {
  .monogram {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: none;
    border: 2px solid var(--text);
    border-radius: var(--r-ctl);
    font: 700 16px/1 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .menu {
    min-width: 220px;
    padding: 4px 0;
  }
  .menu .pop-item[aria-checked="true"] {
    font-weight: 700;
  }
  .menu .pop-item[aria-disabled="true"] {
    color: var(--text-3);
    cursor: not-allowed;
  }

  .md > * + * {
    margin-top: 8px;
  }
  .md ul {
    margin: 0;
    padding-left: 18px;
  }
  .md li + li {
    margin-top: 4px;
  }

  .disclosure {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 0;
    padding: 4px 0;
    min-height: 32px;
    cursor: pointer;
    color: var(--text);
    font-weight: 600;
    font-size: var(--fs-13);
  }
  .disclosure:hover {
    color: var(--accent-text);
  }
  .disclosure .ico {
    transition: transform var(--t-fast) var(--ease);
  }
  .disclosure[aria-expanded="true"] .ico {
    transform: rotate(90deg);
  }
  .disclosure-body {
    margin-top: 10px;
    color: var(--text-2);
    max-width: 68ch;
    font-size: var(--fs-14);
  }

  /* The printed proof: an A4 sheet on the desk with crop marks and a slug line. Stays light in dark mode. */
  .desk {
    background: var(--desk);
    padding: 26px 22px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  /* Crop marks: eight 1px lines drawn as backgrounds (not a visual gradient). */
  .proof {
    position: relative;
    width: 100%;
    max-width: 460px;
    padding: 18px;
    --m: var(--mark);
    background:
      linear-gradient(var(--m), var(--m)) left 0 top 18px / 12px 1px no-repeat,
      linear-gradient(var(--m), var(--m)) left 18px top 0 / 1px 12px no-repeat,
      linear-gradient(var(--m), var(--m)) right 0 top 18px / 12px 1px no-repeat,
      linear-gradient(var(--m), var(--m)) right 18px top 0 / 1px 12px no-repeat,
      linear-gradient(var(--m), var(--m)) left 0 bottom 18px / 12px 1px no-repeat,
      linear-gradient(var(--m), var(--m)) left 18px bottom 0 / 1px 12px no-repeat,
      linear-gradient(var(--m), var(--m)) right 0 bottom 18px / 12px 1px no-repeat,
      linear-gradient(var(--m), var(--m)) right 18px bottom 0 / 1px 12px no-repeat;
  }
  .proof-slug {
    width: 100%;
    max-width: 460px;
    padding: 0 18px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    font-size: var(--fs-13);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .proof-slug b {
    color: var(--text);
    font-weight: 700;
  }
  .paper {
    width: 100%;
    aspect-ratio: 210 / 297;
    background: var(--paper);
    color: var(--paper-ink);
    box-shadow:
      0 0 0 1px oklch(0.2 0.008 60 / 0.06),
      0 2px 3px oklch(0.2 0.008 60 / 0.06),
      0 22px 40px -22px oklch(0.2 0.008 60 / 0.4);
    container-type: inline-size;
    overflow: hidden;
    font-family: var(--font-serif);
    position: relative;
  }
  .paper-pdf,
  .paper iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .pp-blank {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 12px;
    text-align: center;
    padding: 12cqw;
    font-family: var(--font-ui);
  }
  .pp-blank p {
    font-size: max(13px, 3.4cqw);
    color: var(--paper-muted);
  }
  .pp-lines {
    position: absolute;
    inset: 9cqw 9.5cqw;
    display: flex;
    flex-direction: column;
    gap: 2.4cqw;
    opacity: 0.55;
  }
  .pp-lines i {
    display: block;
    height: 1.6cqw;
    background: var(--paper-rule);
  }
  .a4-expand {
    display: none;
  }
  .a4-full {
    position: fixed;
    inset: 0;
    z-index: 51;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }
  .a4-full .panel-head {
    padding: 12px 16px;
  }
  .a4-full-body {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  @media (max-width: 767px) {
    .desk {
      padding: 18px 8px 14px;
      margin: 0 -16px;
    }
    .proof {
      padding: 14px;
    }
    /* Usability #22: the sheet text is about 8px at 343px; offer the full-screen view. */
    .a4-expand {
      display: inline-flex;
      min-height: 44px;
    }
  }
}
```

Add to `web/app/globals.css` after the `layout.css` import:

```css
@import "../src/ui/styles/content.css";
```

Check that `--mark`, `--paper-rule`, `--font-serif`, `--t-fast` and `--ease` exist in `web/src/theme/tokens.css` (`grep -n -- "--mark\|--paper-rule\|--font-serif\|--t-fast\|--ease" "$REPO"/web/src/theme/tokens.css`). If one is missing, copy its light and dark values from the prototype's `:root` and `:root[data-mode="dark"]` blocks into `tokens.css`.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/ui`
Expected: PASS (menu 12, content primitives 13, layout Stepper 5 plus the unchanged ui tests).

- [ ] **Step 11: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 9: Job page frame (route, states, header, layout, nav highlight, tabs with URL state)

**Files:**
- Modify: `web/app/(app)/jobs/[id]/page.tsx`, `web/src/features/shell/navigation.ts`, `web/src/features/shell/Sidebar.tsx`, `web/src/features/shell/BottomBar.tsx`, `web/app/globals.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`, `web/tests/e2e/shell.spec.ts`
- Create: `web/src/features/job/JobPage.tsx`, `web/src/features/job/useJob.ts`, `web/src/features/job/JobHeader.tsx`, `web/src/features/job/labels.ts`, `web/src/features/job/job.css`, `web/src/features/job/tabs/jobTabs.ts`, `web/src/features/job/tabs/JobTabs.tsx`, `web/src/features/job/tabs/DimPanel.tsx`, `web/src/features/shell/useActiveNavKey.ts`
- Test: `web/tests/unit/features/job/jobPage.test.tsx`, `web/tests/unit/features/job/jobTabs.test.ts`, `web/tests/unit/features/shell/activeNav.test.tsx`

**Interfaces:**
- Consumes: `jobQueryOptions`, `JobDetail` (Task 2); `phaseOf`, `phaseIndex`, `Phase`, `UserStatus` (Task 4); `OutcomeKey` (Task 4); `DocumentKind` (Task 3); `hostOf` (Task 6); `Monogram` (Task 8); `useJobFormat` (Task 0); `ScoreMeter`'s `BAND_LABEL`, `roundScore`, `scoreBand`, `PageSkeleton`, `PageError`, `EmptyState`, `Tabs`, `TabPanel` (phase 1); `stubRoutes`, `buildJob`, `renderWithProviders` (tests).
- Produces:
  - `JobPage({ jobId }: { jobId: string })` (`@/features/job/JobPage`) and inside it `JobView({ job })` with three insertion points that later tasks fill: `<PhaseTrack job={job} />` after the header (Task 10), `<NextStepCard job={job} />` and `<DatesCard job={job} />` in the side column (Tasks 11 and 13).
  - `useJob(id)` returning the TanStack query result (`@/features/job/useJob`).
  - `labels.ts`: `PHASE_LABEL: Record<Phase, MessageKey>`, `OUTCOME_LABEL: Record<OutcomeKey, MessageKey>`, `DOCUMENT_LABEL: Record<DocumentKind, MessageKey>`, `statusLabel(status: string): MessageKey`, `currentPhaseLabel(job: { status: string; pre_generation_status?: string | null }): MessageKey` (the outcome for closed jobs).
  - `tabs/jobTabs.ts`: `JOB_TABS`, `type JobTab = "fit" | "documents" | "company" | "interview" | "history"`, `tabFromParam(value: string | null): JobTab | null`, `tabParam(tab: JobTab): string`, `defaultTab(phase: Phase): JobTab`, `type DimReason = "documents" | "interview"`, `dimReason(tab: JobTab, phase: Phase): DimReason | null`, `TAB_QUERY_KEY = "tab"`.
  - `tabs/JobTabs.tsx`: `JobTabs({ job })`, `useOpenTab(): (tab: JobTab) => void` (used by the next step card), and `TAB_PANELS: Record<JobTab, (props: { job: JobDetail }) => ReactNode>` which Tasks 14, 15, 19, 20 and 21 each update to point at their real tab.
  - `@/features/shell/navigation`: `jobIdFromPath(pathname): string | null`, `navKeyForJob(job: { status: string; is_archived?: boolean | null }): NavKey`, `navKeyForPath(pathname): NavKey | null`.
  - `@/features/shell/useActiveNavKey`: `useActiveNavKey(enabled: boolean): NavKey | null`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/jobTabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultTab, dimReason, tabFromParam, tabParam } from "@/features/job/tabs/jobTabs";

describe("job tabs", () => {
  it("round-trips the German URL words", () => {
    expect(tabParam("documents")).toBe("unterlagen");
    expect(tabFromParam("unterlagen")).toBe("documents");
    expect(tabFromParam("firma")).toBe("company");
  });

  it("ignores unknown tab words", () => {
    expect(tabFromParam("hacked")).toBeNull();
    expect(tabFromParam(null)).toBeNull();
  });

  it.each([
    ["OPEN", "fit"],
    ["DRAFTED", "documents"],
    ["APPLIED", "history"],
    ["INTERVIEW", "interview"],
    ["OFFER", "history"],
    ["CLOSED", "history"],
  ] as const)("opens %s on %s", (phase, tab) => {
    expect(defaultTab(phase)).toBe(tab);
  });

  it("dims Unterlagen before Vorgemerkt and Interview before the interview phase", () => {
    expect(dimReason("documents", "OPEN")).toBe("documents");
    expect(dimReason("documents", "DRAFTED")).toBeNull();
    expect(dimReason("interview", "APPLIED")).toBe("interview");
    expect(dimReason("interview", "INTERVIEW")).toBeNull();
    expect(dimReason("interview", "CLOSED")).toBeNull();
  });
});
```

`web/tests/unit/features/job/jobPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobPage } from "@/features/job/JobPage";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

// next/navigation needs the App Router at runtime; it is the framework boundary here.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const JOB_ROUTES = { "GET /jobs/job-1/history": [] };

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

function showJob(overrides: Parameters<typeof buildJob>[0] = {}) {
  stubRoutes({ ...JOB_ROUTES, "GET /jobs/job-1": buildJob(overrides) });
  renderWithProviders(<JobPage jobId="job-1" />);
}

describe("JobPage header", () => {
  it("shows title, company and a strong score", async () => {
    showJob({ match_score: 84.4 });
    expect(await screen.findByRole("heading", { level: 1, name: "Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText("ACME GmbH")).toBeInTheDocument();
    expect(screen.getByLabelText("Passung 84 von 100")).toHaveTextContent("84");
    expect(screen.getByText("Stark")).toBeInTheDocument();
  });

  it("lets the score recede from Beworben on", async () => {
    showJob({ status: "APPLIED" });
    const score = await screen.findByLabelText("Passung 84 von 100");
    expect(score.closest(".jd-scorebox")).toHaveClass("recede");
  });

  it("says when a job has no score yet", async () => {
    showJob({ match_score: null });
    expect(await screen.findByText("Noch nicht bewertet")).toBeInTheDocument();
  });

  it("links the posting in a new tab", async () => {
    showJob();
    const link = await screen.findByRole("link", { name: /Stellenanzeige/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leads back to Eingang for a match and to Bewerbungen for an application", async () => {
    showJob({ status: "APPLIED" });
    const crumbs = await screen.findByRole("navigation", { name: "Brotkrumen" });
    expect(crumbs.querySelector("a")).toHaveAttribute("href", "/applications");
  });

  it("explains a job below the threshold", async () => {
    showJob({ is_archived: true, archive_reason: "THRESHOLD" });
    expect(await screen.findByText(/unter deinem Schwellwert/)).toBeInTheDocument();
  });
});

describe("JobPage states", () => {
  it("shows a not-found page for an unknown id", async () => {
    stubRoutes({ "GET /jobs/job-1": jsonResponse(404, { detail: "Job not found" }) });
    renderWithProviders(<JobPage jobId="job-1" />);
    expect(await screen.findByRole("heading", { name: "Stelle nicht gefunden" })).toBeInTheDocument();
  });

  it("shows a generic error with retry, never the server text", async () => {
    stubRoutes({ "GET /jobs/job-1": jsonResponse(500, { detail: "psycopg2 exploded" }) });
    renderWithProviders(<JobPage jobId="job-1" />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByText(/psycopg2/)).not.toBeInTheDocument();
  });
});

describe("JobPage tabs", () => {
  it("opens the tab of the phase by default", async () => {
    showJob({ status: "DRAFTED" });
    expect(await screen.findByRole("tab", { name: "Unterlagen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("restores the tab from the URL", async () => {
    navigation.search = "tab=verlauf";
    showJob();
    expect(await screen.findByRole("tab", { name: "Verlauf" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("writes the chosen tab into the URL", async () => {
    showJob();
    await userEvent.click(await screen.findByRole("tab", { name: "Firma" }));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=firma", { scroll: false });
  });

  it("dims Unterlagen for a match and still opens it on request", async () => {
    navigation.search = "tab=unterlagen";
    showJob({ status: "OPEN" });
    expect(await screen.findByText("Unterlagen werden ab Vorgemerkt erstellt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trotzdem öffnen" }));
    expect(screen.queryByText("Unterlagen werden ab Vorgemerkt erstellt")).not.toBeInTheDocument();
  });
});
```

`web/tests/unit/features/shell/activeNav.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { jobIdFromPath, navKeyForJob } from "@/features/shell/navigation";
import { useActiveNavKey } from "@/features/shell/useActiveNavKey";
import { buildJob } from "../../support/jobFactory";
import { createTestQueryClient } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ pathname: "/jobs/job-1" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("job navigation rules", () => {
  it("reads the job id from the path", () => {
    expect(jobIdFromPath("/jobs/job-1")).toBe("job-1");
    expect(jobIdFromPath("/jobs/job-1/")).toBe("job-1");
    expect(jobIdFromPath("/jobs")).toBeNull();
    expect(jobIdFromPath("/inbox")).toBeNull();
  });

  it.each([
    [{ status: "OPEN" }, "inbox"],
    [{ status: "DRAFTED", is_archived: true }, "inbox"],
    [{ status: "DRAFTED" }, "applications"],
    [{ status: "REJECTED" }, "applications"],
  ])("puts %o under %s", (job, key) => {
    expect(navKeyForJob(job)).toBe(key);
  });
});

describe("useActiveNavKey", () => {
  it("highlights Bewerbungen on an application's page", async () => {
    stubRoutes({ "GET /jobs/job-1": buildJob({ status: "APPLIED" }) });
    const { result } = renderHook(() => useActiveNavKey(true), { wrapper });
    await waitFor(() => expect(result.current).toBe("applications"));
  });

  it("uses the path elsewhere", () => {
    navigation.pathname = "/sources/3";
    const { result } = renderHook(() => useActiveNavKey(true), { wrapper });
    expect(result.current).toBe("sources");
    navigation.pathname = "/jobs/job-1";
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job tests/unit/features/shell/activeNav.test.tsx`
Expected: FAIL, unresolved `@/features/job/JobPage`, `@/features/job/tabs/jobTabs`, `@/features/shell/useActiveNavKey`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "job.crumbs": "Brotkrumen",
  "job.posting": "Stellenanzeige",
  "job.foundOn": "Gefunden am {date}",
  "job.via": "über {host}",
  "job.scoreAria": "Passung {score} von 100",
  "job.scoreOf": "Passung von 100",
  "job.unscored": "Noch nicht bewertet",
  "job.archivedThreshold": "Automatisch aussortiert: Die Passung liegt unter deinem Schwellwert.",
  "job.archivedUser": "Von dir aussortiert.",
  "job.notFoundTitle": "Stelle nicht gefunden",
  "job.notFoundText": "Diese Stelle gibt es nicht mehr oder sie gehört zu einem anderen Konto.",
  "job.untitled": "Ohne Titel",
  "job.unknownCompany": "Unbekannte Firma",
  "phase.label": "Phase der Bewerbung",
  "phase.OPEN": "Treffer",
  "phase.DRAFTED": "Vorgemerkt",
  "phase.APPLIED": "Beworben",
  "phase.INTERVIEW": "Interview",
  "phase.OFFER": "Angebot",
  "phase.CLOSED": "Abgeschlossen",
  "outcome.accepted": "Zusage angenommen",
  "outcome.rejected": "Absage erhalten",
  "outcome.withdrawn": "Selbst abgesagt",
  "status.GENERATING": "Unterlagen in Arbeit",
  "status.FAILED": "Erstellung fehlgeschlagen",
  "status.SEEN": "Bekannt",
  "status.unknown": "Unbekannter Status",
  "doc.cv": "Lebenslauf",
  "doc.cover_letter": "Anschreiben",
  "tab.label": "Details zur Stelle",
  "tab.fit": "Passung",
  "tab.documents": "Unterlagen",
  "tab.company": "Firma",
  "tab.interview": "Interview",
  "tab.history": "Verlauf",
  "dim.documents.title": "Unterlagen werden ab Vorgemerkt erstellt",
  "dim.documents.text":
    "Merke die Stelle zuerst vor. Dann werden Lebenslauf und Anschreiben auf diese Stelle zugeschnitten.",
  "dim.interview.title": "Interview-Vorbereitung ab Phase Interview",
  "dim.interview.text":
    "Sobald du eingeladen bist, erstellt die KI hier Fragen, Gesprächspunkte und Rückfragen für diese Firma.",
  "dim.open": "Trotzdem öffnen",
```

`web/src/i18n/en.ts`:

```ts
  "job.crumbs": "Breadcrumbs",
  "job.posting": "Job posting",
  "job.foundOn": "Found on {date}",
  "job.via": "via {host}",
  "job.scoreAria": "Fit {score} of 100",
  "job.scoreOf": "Fit out of 100",
  "job.unscored": "Not scored yet",
  "job.archivedThreshold": "Sorted out automatically: the fit is below your threshold.",
  "job.archivedUser": "Sorted out by you.",
  "job.notFoundTitle": "Job not found",
  "job.notFoundText": "This job no longer exists or belongs to another account.",
  "job.untitled": "Untitled",
  "job.unknownCompany": "Unknown company",
  "phase.label": "Application phase",
  "phase.OPEN": "Match",
  "phase.DRAFTED": "Shortlisted",
  "phase.APPLIED": "Applied",
  "phase.INTERVIEW": "Interview",
  "phase.OFFER": "Offer",
  "phase.CLOSED": "Closed",
  "outcome.accepted": "Offer accepted",
  "outcome.rejected": "Rejection received",
  "outcome.withdrawn": "Withdrawn by me",
  "status.GENERATING": "Documents in progress",
  "status.FAILED": "Creation failed",
  "status.SEEN": "Known",
  "status.unknown": "Unknown status",
  "doc.cv": "CV",
  "doc.cover_letter": "Cover letter",
  "tab.label": "Job details",
  "tab.fit": "Fit",
  "tab.documents": "Documents",
  "tab.company": "Company",
  "tab.interview": "Interview",
  "tab.history": "History",
  "dim.documents.title": "Documents are created from Shortlisted on",
  "dim.documents.text":
    "Shortlist the job first. Then CV and cover letter are tailored to this job.",
  "dim.interview.title": "Interview preparation from the Interview phase on",
  "dim.interview.text":
    "Once you are invited, the AI creates questions, talking points and questions to ask this company here.",
  "dim.open": "Open anyway",
```

- [ ] **Step 4: Navigation rules and the active-nav hook**

Append to `web/src/features/shell/navigation.ts`:

```ts
const JOB_PATH = /^\/jobs\/([^/]+)\/?$/;

export function jobIdFromPath(pathname: string): string | null {
  const match = JOB_PATH.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Decision D10 (phase-1 ruling): matches and sorted-out jobs live in Eingang, applications in Bewerbungen. */
export function navKeyForJob(job: { status: string; is_archived?: boolean | null }): NavKey {
  return job.status === "OPEN" || job.is_archived ? "inbox" : "applications";
}

export function navKeyForPath(pathname: string): NavKey | null {
  return MAIN_NAV.find((item) => isActivePath(pathname, item.href))?.key ?? null;
}
```

`web/src/features/shell/useActiveNavKey.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { jobQueryOptions } from "@/api/jobs";
import { jobIdFromPath, navKeyForJob, navKeyForPath, type NavKey } from "./navigation";

/** The highlighted main-nav item; on a job page it follows the job (shares the page's query). */
export function useActiveNavKey(enabled: boolean): NavKey | null {
  const pathname = usePathname() ?? "";
  const jobId = jobIdFromPath(pathname);
  const job = useQuery({ ...jobQueryOptions(jobId ?? ""), enabled: enabled && jobId !== null });
  if (jobId === null) return navKeyForPath(pathname);
  return job.data ? navKeyForJob(job.data) : null;
}
```

In `web/src/features/shell/Sidebar.tsx`: in `Sidebar`, add `const activeKey = useActiveNavKey(user !== undefined);` and pass `active={activeKey === item.key}` to `NavLink`; change `NavLink` to take `{ item, counts, active }: { item: NavItem; counts: NavCounts; active: boolean }`, drop its `usePathname()` call and render `aria-current={active ? "page" : undefined}`. Import `useActiveNavKey` from `./useActiveNavKey`; keep `isActivePath` only if still used by `SidebarFoot`.

In `web/src/features/shell/BottomBar.tsx`: add `const activeKey = useActiveNavKey(signedIn);` and pass `active={activeKey === item.key}` to `BottomBarLink` instead of `isActivePath(pathname, item.href)`. Keep the `pathname` only for `isMoreActive`. (If the fix wave changed these components, apply the same substitution to whatever now computes `aria-current` for the main items.)

- [ ] **Step 5: Labels, tab rules and the job query hook**

`web/src/features/job/labels.ts`:

```ts
import type { DocumentKind } from "@/api/jobDocuments";
import { phaseOf, type Phase, type StatusSource } from "@/domain/jobStatus";
import type { OutcomeKey } from "@/domain/statusGuards";
import type { MessageKey } from "@/i18n/de";

export const PHASE_LABEL: Readonly<Record<Phase, MessageKey>> = {
  OPEN: "phase.OPEN",
  DRAFTED: "phase.DRAFTED",
  APPLIED: "phase.APPLIED",
  INTERVIEW: "phase.INTERVIEW",
  OFFER: "phase.OFFER",
  CLOSED: "phase.CLOSED",
};

export const OUTCOME_LABEL: Readonly<Record<OutcomeKey, MessageKey>> = {
  accepted: "outcome.accepted",
  rejected: "outcome.rejected",
  withdrawn: "outcome.withdrawn",
};

export const DOCUMENT_LABEL: Readonly<Record<DocumentKind, MessageKey>> = {
  cv: "doc.cv",
  cover_letter: "doc.cover_letter",
};

const STATUS_LABEL: Readonly<Record<string, MessageKey>> = {
  OPEN: "phase.OPEN",
  DRAFTED: "phase.DRAFTED",
  APPLIED: "phase.APPLIED",
  INTERVIEW: "phase.INTERVIEW",
  OFFER: "phase.OFFER",
  ACCEPTED: "outcome.accepted",
  REJECTED: "outcome.rejected",
  GENERATING: "status.GENERATING",
  FAILED: "status.FAILED",
  SEEN: "status.SEEN",
};

/** Label of a raw status, e.g. in the history timeline. */
export function statusLabel(status: string): MessageKey {
  return STATUS_LABEL[status] ?? "status.unknown";
}

/** The phase name, except that a closed job shows its outcome (prototype renderStepper). */
export function currentPhaseLabel(job: StatusSource): MessageKey {
  const phase = phaseOf(job);
  return phase === "CLOSED" ? statusLabel(job.status) : PHASE_LABEL[phase];
}
```

`web/src/features/job/tabs/jobTabs.ts`:

```ts
import { phaseIndex, type Phase } from "@/domain/jobStatus";

export const JOB_TABS = ["fit", "documents", "company", "interview", "history"] as const;
export type JobTab = (typeof JOB_TABS)[number];
export type DimReason = "documents" | "interview";

export const TAB_QUERY_KEY = "tab";

// German words in the URL, like the rest of the product's addresses (spec 2.3: URL state).
const TAB_PARAM: Readonly<Record<JobTab, string>> = {
  fit: "passung",
  documents: "unterlagen",
  company: "firma",
  interview: "interview",
  history: "verlauf",
};

const DEFAULT_TAB: Readonly<Record<Phase, JobTab>> = {
  OPEN: "fit",
  DRAFTED: "documents",
  APPLIED: "history",
  INTERVIEW: "interview",
  OFFER: "history",
  CLOSED: "history",
};

export function tabParam(tab: JobTab): string {
  return TAB_PARAM[tab];
}

export function tabFromParam(value: string | null): JobTab | null {
  return JOB_TABS.find((tab) => TAB_PARAM[tab] === value) ?? null;
}

/** Decision D12: the tab that holds the phase's work. */
export function defaultTab(phase: Phase): JobTab {
  return DEFAULT_TAB[phase];
}

/** Prototype tabDim: tabs that make no sense yet show a hint first (closed jobs never dim). */
export function dimReason(tab: JobTab, phase: Phase): DimReason | null {
  if (tab === "documents" && phase === "OPEN") return "documents";
  const beforeInterview = phaseIndex(phase) < phaseIndex("INTERVIEW");
  return tab === "interview" && beforeInterview ? "interview" : null;
}
```

`web/src/features/job/useJob.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { jobQueryOptions } from "@/api/jobs";

export function useJob(id: string) {
  return useQuery(jobQueryOptions(id));
}
```

- [ ] **Step 6: Header, tabs and page**

`web/src/features/job/JobHeader.tsx`:

```tsx
"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { phaseIndex, phaseOf } from "@/domain/jobStatus";
import { hostOf } from "@/domain/links";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import { navKeyForJob } from "@/features/shell/navigation";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { useJobFormat } from "./format/useJobFormat";

const RECEDE_FROM = phaseIndex("APPLIED");
const BAND_CLASS = { strong: "strong", possible: null, weak: "weak" } as const;

export function JobCrumbs({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const inbox = navKeyForJob(job) === "inbox";
  return (
    <nav className="crumbs" aria-label={t("job.crumbs")}>
      <Link href={inbox ? "/inbox" : "/applications"}>{t(inbox ? "nav.inbox" : "nav.applications")}</Link>
      <Icon icon={ChevronRight} />
      <span>{job.company ?? t("job.unknownCompany")}</span>
    </nav>
  );
}

/** Title block (spec 4.2): monogram, title, company, meta, posting link and the big score. */
export function JobHeader({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <header className="jd-head">
      <Monogram name={job.company} />
      <div className="jd-headline">
        <h1 className="jd-title" id="jd-title">
          {job.title ?? t("job.untitled")}
        </h1>
        <p className="jd-meta">{job.company ?? t("job.unknownCompany")}</p>
        <JobMetaLine job={job} />
        <ArchiveNote job={job} />
      </div>
      <ScoreBox score={job.match_score} recede={phaseIndex(phaseOf(job)) >= RECEDE_FROM} />
    </header>
  );
}

function JobMetaLine({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const host = hostOf(job.url);
  return (
    <p className="jd-meta jd-meta-sub">
      {job.created_at ? <span>{t("job.foundOn", { date: format.date(job.created_at) })}</span> : null}
      {host ? <span>{t("job.via", { host })}</span> : null}
      {job.url ? (
        <a className="link" href={job.url} target="_blank" rel="noopener noreferrer">
          {t("job.posting")}
          <Icon icon={ExternalLink} />
        </a>
      ) : null}
    </p>
  );
}

function ArchiveNote({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  if (!job.is_archived) return null;
  const key = job.archive_reason === "THRESHOLD" ? "job.archivedThreshold" : "job.archivedUser";
  return <p className="jd-meta jd-meta-sub">{t(key)}</p>;
}

function ScoreBox({ score, recede }: { score: number | null | undefined; recede: boolean }) {
  const { t } = useI18n();
  if (score === null || score === undefined) {
    return <div className="jd-scorebox unscored">{t("job.unscored")}</div>;
  }
  const shown = roundScore(score);
  const band = scoreBand(shown);
  return (
    <div className={cx("jd-scorebox", BAND_CLASS[band], recede && "recede")}>
      <div className="jd-score" aria-label={t("job.scoreAria", { score: shown })}>
        {shown}
      </div>
      <div className="jd-band">
        <span className="jd-band-w">{t(BAND_LABEL[band])}</span>
        <span className="jd-band-of">{t("job.scoreOf")}</span>
      </div>
    </div>
  );
}
```

`web/src/features/job/tabs/DimPanel.tsx`:

```tsx
"use client";

import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import type { DimReason } from "./jobTabs";

export function DimPanel({ reason, onOpen }: { reason: DimReason; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div className="dim-panel">
      <h3>{t(`dim.${reason}.title`)}</h3>
      <p>{t(`dim.${reason}.text`)}</p>
      <div className="row">
        <Button size="sm" onClick={onOpen}>
          {t("dim.open")}
        </Button>
      </div>
    </div>
  );
}
```

`web/src/features/job/tabs/JobTabs.tsx`:

```tsx
"use client";

import { Construction } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { TabPanel, Tabs } from "@/ui/Tabs";
import { DimPanel } from "./DimPanel";
import {
  defaultTab,
  dimReason,
  JOB_TABS,
  TAB_QUERY_KEY,
  tabFromParam,
  tabParam,
  type JobTab,
} from "./jobTabs";

const TAB_ID_PREFIX = "jd";

/** Interim panel until the tab's own task (14, 15, 19, 20, 21) replaces its entry below. */
function PendingPanel() {
  const { t } = useI18n();
  return (
    <EmptyState icon={Construction} title={t("placeholder.deck")}>
      {null}
    </EmptyState>
  );
}

export const TAB_PANELS: Readonly<Record<JobTab, (props: { job: JobDetail }) => ReactNode>> = {
  fit: PendingPanel,
  documents: PendingPanel,
  company: PendingPanel,
  interview: PendingPanel,
  history: PendingPanel,
};

/** Switches the tab through the URL (?tab=), so reloads and links restore it (decision D12). */
export function useOpenTab(): (tab: JobTab) => void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  return (tab) => router.replace(`${pathname}?${TAB_QUERY_KEY}=${tabParam(tab)}`, { scroll: false });
}

export function JobTabs({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  const selected = tabFromParam(useSearchParams().get(TAB_QUERY_KEY)) ?? defaultTab(phaseOf(job));
  const items = JOB_TABS.map((key) => ({ key, label: t(`tab.${key}`) }));
  return (
    <section className="jd-tabs">
      <Tabs items={items} selected={selected} onSelect={openTab} label={t("tab.label")} idPrefix={TAB_ID_PREFIX} />
      <TabPanel idPrefix={TAB_ID_PREFIX} selected={selected}>
        <TabContent key={selected} job={job} tab={selected} />
      </TabPanel>
    </section>
  );
}

function TabContent({ job, tab }: { job: JobDetail; tab: JobTab }) {
  const [forced, setForced] = useState(false);
  const reason = dimReason(tab, phaseOf(job));
  if (reason && !forced) return <DimPanel reason={reason} onOpen={() => setForced(true)} />;
  const Panel = TAB_PANELS[tab];
  return <Panel job={job} />;
}
```

The `EmptyState` children prop is required; pass `{null}` as written. Replace `PendingPanel` with the real panels one by one (Tasks 14, 15, 19, 20, 21); the last of those tasks deletes `PendingPanel` and its imports.

`web/src/features/job/JobPage.tsx`:

```tsx
"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { ApiError } from "@/api/errors";
import { PageError } from "@/features/shell/PageError";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { PageSkeleton } from "@/ui/Skeleton";
import { JobCrumbs, JobHeader } from "./JobHeader";
import { JobTabs } from "./tabs/JobTabs";
import { useJob } from "./useJob";

const isNotFound = (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND";

/** The one job view (spec 4.2): replaces the side panel, the modal and the old detail page. */
export function JobPage({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  if (job.data) return <JobView job={job.data} />;
  if (job.isError && isNotFound(job.error)) return <JobNotFound />;
  if (job.isError) return <PageError error={job.error} onRetry={() => void job.refetch()} />;
  return <PageSkeleton />;
}

/** Desktop: tabs left, sticky next-step column right. Mobile: header, next card, tabs (DOM order). */
function JobView({ job }: { job: JobDetail }) {
  return (
    <article className="page jd" aria-labelledby="jd-title">
      <JobCrumbs job={job} />
      <JobHeader job={job} />
      <div className="jd-grid">
        <aside className="jd-side" />
        <div className="jd-main">
          <JobTabs job={job} />
        </div>
      </div>
    </article>
  );
}

function JobNotFound() {
  const { t } = useI18n();
  const back = (
    <Link className="btn" href="/inbox">
      {t("notFound.back")}
    </Link>
  );
  return (
    <div className="page">
      <EmptyState icon={SearchX} title={t("job.notFoundTitle")} actions={back}>
        {t("job.notFoundText")}
      </EmptyState>
    </div>
  );
}
```

`web/app/(app)/jobs/[id]/page.tsx`:

```tsx
import { Suspense } from "react";
import { JobPage } from "@/features/job/JobPage";

export default async function JobRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // JobTabs reads the query string (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <JobPage jobId={id} />
    </Suspense>
  );
}
```

- [ ] **Step 7: Page CSS**

`web/src/features/job/job.css` (ported from the prototype's job-detail block; the two-column grid follows spec 4.2 and the usability layout):

```css
/* Job page, ported from docs/prototype/clickdummy-editorial.html (job detail) plus the spec 4.2 grid. */
@layer components {
  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-13);
    color: var(--text-3);
    margin-bottom: 14px;
  }
  .crumbs a {
    color: var(--text-2);
    font-weight: 600;
    text-decoration: none;
  }
  .crumbs a:hover {
    color: var(--text);
  }
  .jd-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 18px 24px;
    align-items: start;
    border-top: var(--rule-w) solid var(--rule);
    padding-top: 18px;
  }
  .jd-title {
    font: 700 clamp(28px, 4.2vw, 50px) / 1 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.035em;
    max-width: 20ch;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  .jd-meta {
    margin-top: 12px;
    color: var(--text-2);
    font-size: var(--fs-14);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: center;
  }
  .jd-meta-sub {
    margin-top: 4px;
    font-size: var(--fs-13);
  }
  .jd-scorebox {
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .jd-score {
    font: 760 clamp(76px, 9vw, 140px) / 0.78 var(--font-display);
    font-optical-sizing: auto;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.06em;
  }
  .jd-band {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 2px solid currentColor;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    min-width: 100%;
  }
  .jd-band-w {
    font: 650 22px/1 var(--font-display);
    font-optical-sizing: auto;
  }
  .jd-band-of {
    font-size: var(--fs-13);
    color: var(--text-3);
  }
  .jd-scorebox.strong {
    color: var(--accent-text);
  }
  .jd-scorebox.weak {
    color: var(--text-3);
  }
  .jd-scorebox.unscored {
    font-size: var(--fs-13);
    color: var(--text-3);
  }
  /* Spec 4.2 / usability #18: from Beworben on the score is history, not the headline. */
  .jd-scorebox.recede {
    color: var(--text-3);
  }
  .jd-scorebox.recede .jd-score {
    font-size: 40px;
    font-weight: 600;
  }
  .jd-scorebox.recede .jd-band-w {
    display: none;
  }

  .jd-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 40px;
    margin-top: 30px;
  }
  .jd-side {
    grid-column: 2;
    grid-row: 1;
    position: sticky;
    top: 24px;
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .jd-main {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    container-type: inline-size;
  }
  .jd-main .tabs {
    margin-top: 0;
  }
  .dim-panel {
    padding: 28px 0;
    max-width: 54ch;
  }
  .dim-panel h3 {
    font: 650 22px/1.15 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }
  .dim-panel p {
    color: var(--text-2);
    font-size: var(--fs-14);
  }
  .dim-panel .row {
    margin-top: 16px;
  }

  @media (max-width: 1023px) {
    .jd-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }
    .jd-side,
    .jd-main {
      grid-column: 1;
      grid-row: auto;
      position: static;
    }
  }
  @media (max-width: 767px) {
    .jd-head {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 14px;
      padding-top: 14px;
    }
    .jd-scorebox {
      grid-column: 1 / -1;
      flex-direction: row;
      align-items: baseline;
      gap: 12px;
      text-align: left;
    }
    .jd-title {
      font-size: 28px;
    }
    .jd-score {
      font-size: 56px;
    }
    .jd-band {
      margin-top: 0;
      border-top: 0;
      align-items: flex-start;
    }
    .jd-band-of {
      display: none;
    }
  }
}
```

Add to `web/app/globals.css` after the `content.css` import:

```css
@import "../src/features/job/job.css";
```

- [ ] **Step 8: Drop the job placeholder from the phase-1 e2e test**

In `web/tests/e2e/shell.spec.ts`, remove the entry `["/jobs/job-1", "Stelle"],` from `PLACEHOLDER_ROUTES` (the route is no longer a placeholder; Task 22 covers it). If `page.job` in the dictionaries is now unused (`grep -rn '"page.job"' "$REPO"/web/src`), delete the key from `de.ts` and `en.ts`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features`
Expected: PASS (jobTabs 10, jobPage 12, activeNav 6 plus the existing shell tests).

- [ ] **Step 10: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green; the build lists `/jobs/[id]` as a dynamic route.

---
### Task 10: Phase track, "Phase ändern" menu, guard dialog and status changes with undo

**Files:**
- Create: `web/src/features/job/phase/PhaseTrack.tsx`, `web/src/features/job/phase/PhaseChangeDialog.tsx`, `web/src/features/job/phase/useChangeStatus.ts`
- Modify: `web/src/features/job/JobPage.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/phaseChange.test.tsx`

**Interfaces:**
- Consumes: `changeJobStatus`, `jobHistoryQueryOptions`, `JobDetail` (Task 2); `phaseOf`, `isUserStatus`, `UserStatus` (Task 4); `phaseTrack` (Task 4); `guardFor`, `MENU_TARGETS`, `OUTCOMES`, `StatusGuard`, `MenuTarget`, `Outcome` (Task 4); `documentPresence` (Task 4); `Stepper`, `MenuButton`, `TextAreaField` (Task 8); `Dialog`, `PanelHeader`, `Button`, `useToast` (phase 1); `describeError`; `PHASE_LABEL`, `OUTCOME_LABEL`, `DOCUMENT_LABEL`, `currentPhaseLabel` (Task 9); `useOpenTab` (Task 9); `useJobFormat` (Task 0).
- Produces:
  - `useChangeStatus(job: JobDetail): { changeStatus: (change: { to: UserStatus; note?: string }) => Promise<JobDetail | null>; isPending: boolean }` — on success the response replaces `["job", id]`, history, lists and counts are invalidated, and a toast with "Rückgängig" (10 s, phase-1 toast rule) moves back to the previous user status through the same endpoint; failures show a toast and resolve to `null`.
  - `PhaseTrack({ job })`, `PhaseChangeDialog({ job, guard, onClose })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/phaseChange.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { PhaseTrack } from "@/features/job/phase/PhaseTrack";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const READY = { cv_html_present: true, cover_letter_html_present: true };
const HISTORY = [
  { id: 1, from_status: "OPEN", to_status: "DRAFTED", changed_at: "2026-10-03T10:00:00Z", note: null },
];

beforeEach(() => navigation.replace.mockReset());

/** Echoes the posted target as the new status, like the server does. */
function setup(job: JobDetail, statusResponse?: Response): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": HISTORY,
    "POST /jobs/job-1/status":
      statusResponse ??
      ((call: RecordedCall) => jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to })),
  });
  renderWithProviders(<PhaseTrack job={job} />);
  return calls;
}

const statusPosts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "POST").map((call) => JSON.parse(call.body ?? ""));

async function choose(target: string) {
  await userEvent.click(screen.getByRole("button", { name: "Phase ändern" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: target }));
}

describe("PhaseTrack", () => {
  it("shows the read-only track with dates and a skipped phase", async () => {
    setup(buildJob({ status: "INTERVIEW", ...READY }));
    const items = await screen.findAllByRole("listitem");
    expect(items[1]).toHaveTextContent("03.10.");
    expect(items[2]).toHaveClass("skipped");
    expect(items[3]).toHaveAttribute("aria-current", "step");
  });

  it("names the outcome on a closed job", async () => {
    setup(buildJob({ status: "REJECTED" }));
    const items = await screen.findAllByRole("listitem");
    expect(items[5]).toHaveTextContent("Absage erhalten");
  });

  it("moves one phase forward without asking", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Beworben");
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
  });

  it("asks before moving back and sends the note", async () => {
    const calls = setup(buildJob({ status: "INTERVIEW", ...READY }));
    await choose("Vorgemerkt");
    const dialog = screen.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
    await userEvent.type(within(dialog).getByLabelText("Notiz für den Verlauf (optional)"), "Absage zurückgezogen");
    await userEvent.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "DRAFTED", note: "Absage zurückgezogen" }]),
    );
  });

  it("asks before skipping phases", async () => {
    setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Interview");
    expect(screen.getByRole("dialog", { name: "Beworben überspringen?" })).toBeInTheDocument();
  });

  it("warns before applying without documents and offers to create them", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", cv_html_present: true }));
    await choose("Beworben");
    const dialog = screen.getByRole("dialog", { name: "Ohne fertige Unterlagen?" });
    expect(dialog).toHaveTextContent("Anschreiben");
    await userEvent.click(within(dialog).getByRole("button", { name: "Unterlagen erstellen" }));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=unterlagen", { scroll: false });
    expect(statusPosts(calls)).toEqual([]);
  });

  it("closes as withdrawn with a history note", async () => {
    const calls = setup(buildJob({ status: "OFFER", ...READY }));
    await choose("Abgeschlossen");
    const dialog = screen.getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Selbst abgesagt" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "REJECTED", note: "Selbst abgesagt" }]),
    );
  });

  it("closes as accepted", async () => {
    const calls = setup(buildJob({ status: "OFFER", ...READY }));
    await choose("Abgeschlossen");
    await userEvent.click(screen.getByRole("button", { name: "Zusage angenommen" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "ACCEPTED" }]));
  });

  it("locks the menu while documents are generated", async () => {
    setup(buildJob({ status: "GENERATING" }));
    await userEvent.click(await screen.findByRole("button", { name: "Phase ändern" }));
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/bleibt die Phase gesperrt/)).toBeInTheDocument();
  });

  it("undoes a change from the toast", async () => {
    const calls = setup(buildJob({ status: "DRAFTED", ...READY }));
    await choose("Beworben");
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }, { to: "DRAFTED" }]));
  });

  it("says when the server refuses the change", async () => {
    setup(
      buildJob({ status: "DRAFTED", ...READY }),
      jsonResponse(409, { detail: "Cannot change status from 'GENERATING' to 'APPLIED'" }),
    );
    await choose("Beworben");
    expect(await screen.findByText("Diese Phase lässt sich gerade nicht setzen.")).toBeInTheDocument();
    expect(screen.queryByText(/GENERATING/)).not.toBeInTheDocument();
  });
});
```

Note: the 409 answer maps to `BAD_REQUEST` in the phase-1 normaliser (no explicit 409 entry), so the override in Step 4 maps `BAD_REQUEST` (400 for a system target, 409 for a locked state).

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/phaseChange.test.tsx`
Expected: FAIL, unresolved `@/features/job/phase/PhaseTrack`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "phase.change": "Phase ändern",
  "phase.locked": "Solange die Unterlagen erstellt werden, bleibt die Phase gesperrt.",
  "phase.since": "seit {date}",
  "phase.changed": "Phase: {phase}.",
  "phase.undo": "Rückgängig",
  "phase.undone": "Rückgängig gemacht: wieder {phase}.",
  "phase.refused": "Diese Phase lässt sich gerade nicht setzen.",
  "guard.note": "Notiz für den Verlauf (optional)",
  "guard.cancel": "Abbrechen",
  "guard.backward.title": "Zurück auf {phase}?",
  "guard.backward.text": "Spätere Einträge bleiben im Verlauf erhalten.",
  "guard.backward.confirm": "Zurücksetzen",
  "guard.skip.title": "{phases} überspringen?",
  "guard.skip.text": "Die Phase springt direkt auf {phase}. Das wird im Verlauf festgehalten.",
  "guard.skip.confirm": "Auf {phase} setzen",
  "guard.noDocs.title": "Ohne fertige Unterlagen?",
  "guard.noDocs.text": "Es fehlt: {missing}. Hast du dich mit eigenen Unterlagen beworben?",
  "guard.noDocs.confirm": "Trotzdem auf {phase} setzen",
  "guard.noDocs.create": "Unterlagen erstellen",
  "guard.outcome.title": "Wie ist die Bewerbung ausgegangen?",
  "list.and": " und ",
```

`web/src/i18n/en.ts`:

```ts
  "phase.change": "Change phase",
  "phase.locked": "While the documents are being created, the phase stays locked.",
  "phase.since": "since {date}",
  "phase.changed": "Phase: {phase}.",
  "phase.undo": "Undo",
  "phase.undone": "Undone: back to {phase}.",
  "phase.refused": "This phase cannot be set right now.",
  "guard.note": "Note for the history (optional)",
  "guard.cancel": "Cancel",
  "guard.backward.title": "Back to {phase}?",
  "guard.backward.text": "Later entries stay in the history.",
  "guard.backward.confirm": "Move back",
  "guard.skip.title": "Skip {phases}?",
  "guard.skip.text": "The phase jumps straight to {phase}. This is recorded in the history.",
  "guard.skip.confirm": "Set to {phase}",
  "guard.noDocs.title": "Without finished documents?",
  "guard.noDocs.text": "Missing: {missing}. Did you apply with your own documents?",
  "guard.noDocs.confirm": "Set to {phase} anyway",
  "guard.noDocs.create": "Create documents",
  "guard.outcome.title": "How did the application end?",
  "list.and": " and ",
```

- [ ] **Step 4: Implement `web/src/features/job/phase/useChangeStatus.ts`**

```ts
"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { changeJobStatus, type JobDetail, type StatusChange } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { isUserStatus, type UserStatus } from "@/domain/jobStatus";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast, type ToastApi } from "@/ui/ToastProvider";
import { currentPhaseLabel } from "../labels";

export interface StatusChangeInput {
  to: UserStatus;
  note?: string;
}

// 400 (system target) and 409 (locked state) both normalise to BAD_REQUEST.
const REFUSED = { BAD_REQUEST: "phase.refused" } as const;

function storeJob(queryClient: QueryClient, job: JobDetail): void {
  queryClient.setQueryData(queryKeys.job(job.id), job);
  for (const queryKey of [queryKeys.jobHistory(job.id), queryKeys.jobsRoot, queryKeys.jobCounts]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** The only status write of the UI (spec success criterion 2): server-validated, with history and undo. */
export function useChangeStatus(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (change: StatusChange) => changeJobStatus(job.id, change),
    onSuccess: (updated) => storeJob(queryClient, updated),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t, REFUSED) }),
  });
  const changeStatus = async (input: StatusChangeInput): Promise<JobDetail | null> => {
    const updated = await mutation.mutateAsync(input).catch(() => null);
    if (updated) announce({ toast, t, previous: job.status, updated, undo: mutation.mutate });
    return updated;
  };
  return { changeStatus, isPending: mutation.isPending };
}

interface Announcement {
  toast: ToastApi;
  t: Translate;
  previous: string;
  updated: JobDetail;
  undo: (change: StatusChange) => void;
}

function announce({ toast, t, previous, updated, undo }: Announcement): void {
  const message = t("phase.changed", { phase: t(currentPhaseLabel(updated)) });
  // A failed generation (FAILED) is not a user status, so there is nothing to go back to.
  const action = isUserStatus(previous)
    ? { label: t("phase.undo"), onAction: () => undo({ to: previous }) }
    : undefined;
  toast.show({ message, action });
}
```

`changeStatus` sends only the keys it was given, so a change without a note posts `{ "to": ... }` (the tests compare exact bodies). `useChangeStatus` is 20 lines or less after formatting; if Prettier breaks it above 20, move the `useMutation({...})` call into `function useStatusMutation(job: JobDetail)` returning the mutation.

- [ ] **Step 5: Implement `web/src/features/job/phase/PhaseChangeDialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { JobDetail } from "@/api/jobs";
import type { Outcome, StatusGuard } from "@/domain/statusGuards";
import { OUTCOMES } from "@/domain/statusGuards";
import { phaseOfStatus, type UserStatus } from "@/domain/jobStatus";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { TextAreaField } from "@/ui/Field";
import { PanelHeader } from "@/ui/PanelHeader";
import { DOCUMENT_LABEL, OUTCOME_LABEL, PHASE_LABEL } from "../labels";
import { useOpenTab } from "../tabs/JobTabs";
import { useChangeStatus } from "./useChangeStatus";

/** Guards that need the user's answer before the status changes. */
export type DialogGuard = Exclude<StatusGuard, { kind: "direct" } | { kind: "blocked" }>;

export interface PhaseChangeDialogProps {
  job: JobDetail;
  guard: DialogGuard;
  onClose: () => void;
}

export function PhaseChangeDialog({ job, guard, onClose }: PhaseChangeDialogProps) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const { changeStatus, isPending } = useChangeStatus(job);
  const confirm = async (to: UserStatus, fixedNote?: string) => {
    const text = [fixedNote, note.trim()].filter(Boolean).join(" · ");
    if (await changeStatus(text ? { to, note: text } : { to })) onClose();
  };
  const title = dialogTitle(guard, t);
  return (
    <Dialog open onClose={onClose} label={title}>
      <div className="panel-in">
        <PanelHeader title={title} onClose={onClose} />
        <GuardBody guard={guard} t={t} />
        <TextAreaField id="phase-note" label={t("guard.note")} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        <GuardActions
          guard={guard}
          busy={isPending}
          onConfirm={(to, fixed) => void confirm(to, fixed)}
          onClose={onClose}
        />
      </div>
    </Dialog>
  );
}

const phaseName = (to: UserStatus, t: Translate) => t(PHASE_LABEL[phaseOfStatus(to)]);

function dialogTitle(guard: DialogGuard, t: Translate): string {
  if (guard.kind === "askOutcome") return t("guard.outcome.title");
  if (guard.kind === "applyWithoutDocuments") return t("guard.noDocs.title");
  if (guard.kind === "confirmBackward") return t("guard.backward.title", { phase: phaseName(guard.to, t) });
  const phases = guard.skipped.map((phase) => t(PHASE_LABEL[phase])).join(t("list.and"));
  return t("guard.skip.title", { phases });
}

function GuardBody({ guard, t }: { guard: DialogGuard; t: Translate }) {
  if (guard.kind === "confirmBackward") return <p className="prose">{t("guard.backward.text")}</p>;
  if (guard.kind === "confirmSkip") {
    return <p className="prose">{t("guard.skip.text", { phase: phaseName(guard.to, t) })}</p>;
  }
  if (guard.kind === "applyWithoutDocuments") {
    const missing = guard.missing.map((kind) => t(DOCUMENT_LABEL[kind])).join(t("list.and"));
    return <p className="prose">{t("guard.noDocs.text", { missing })}</p>;
  }
  return null;
}

interface GuardActionsProps {
  guard: DialogGuard;
  busy: boolean;
  onConfirm: (to: UserStatus, fixedNote?: string) => void;
  onClose: () => void;
}

function GuardActions({ guard, busy, onConfirm, onClose }: GuardActionsProps) {
  const { t } = useI18n();
  return (
    <div className="row panel-actions">
      {guard.kind === "askOutcome" ? (
        <OutcomeButtons busy={busy} onConfirm={onConfirm} />
      ) : (
        <ConfirmButton guard={guard} busy={busy} onConfirm={onConfirm} />
      )}
      {guard.kind === "applyWithoutDocuments" ? <CreateDocumentsButton onClose={onClose} /> : null}
      <Button variant="ghost" onClick={onClose}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

function OutcomeButtons({ busy, onConfirm }: Pick<GuardActionsProps, "busy" | "onConfirm">) {
  const { t } = useI18n();
  const noteOf = (outcome: Outcome) => (outcome.key === "withdrawn" ? t(OUTCOME_LABEL.withdrawn) : undefined);
  return OUTCOMES.map((outcome) => (
    <Button key={outcome.key} busy={busy} onClick={() => onConfirm(outcome.to, noteOf(outcome))}>
      {t(OUTCOME_LABEL[outcome.key])}
    </Button>
  ));
}

type ConfirmGuard = Exclude<DialogGuard, { kind: "askOutcome" }>;

function ConfirmButton({ guard, busy, onConfirm }: { guard: ConfirmGuard } & Pick<GuardActionsProps, "busy" | "onConfirm">) {
  const { t } = useI18n();
  const phase = phaseName(guard.to, t);
  const label =
    guard.kind === "confirmBackward"
      ? t("guard.backward.confirm")
      : t(guard.kind === "confirmSkip" ? "guard.skip.confirm" : "guard.noDocs.confirm", { phase });
  return (
    <Button variant="primary" busy={busy} onClick={() => onConfirm(guard.to)}>
      {label}
    </Button>
  );
}

function CreateDocumentsButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  return (
    <Button
      onClick={() => {
        onClose();
        openTab("documents");
      }}
    >
      {t("guard.noDocs.create")}
    </Button>
  );
}
```

The dialog note for "Selbst abgesagt" plus a user note becomes "Selbst abgesagt · <note>", so the history shows both.

- [ ] **Step 6: Implement `web/src/features/job/phase/PhaseTrack.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { jobHistoryQueryOptions, type JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { phaseOf } from "@/domain/jobStatus";
import { phaseTrack, type TrackStep } from "@/domain/phaseTrack";
import { guardFor, MENU_TARGETS, type MenuTarget, type StatusGuard } from "@/domain/statusGuards";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { MenuButton } from "@/ui/Menu";
import { Stepper, type StepItem } from "@/ui/Stepper";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { currentPhaseLabel, PHASE_LABEL } from "../labels";
import { PhaseChangeDialog, type DialogGuard } from "./PhaseChangeDialog";
import { useChangeStatus } from "./useChangeStatus";

/** Read-only stepper plus the one place to change a status (usability #6, spec 4.2). */
export function PhaseTrack({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const steps = useTrackItems(job);
  const [guard, setGuard] = useState<DialogGuard | null>(null);
  const { changeStatus } = useChangeStatus(job);
  const select = (target: MenuTarget) => {
    const next = guardFor({ ...job, documents: documentPresence(job) }, target);
    if (next.kind === "direct") void changeStatus({ to: next.to });
    else if (next.kind !== "blocked") setGuard(next);
  };
  return (
    <div className="jd-phase">
      <Stepper steps={steps} label={t("phase.label")} />
      <PhaseMenu job={job} onSelect={select} />
      {guard ? <PhaseChangeDialog job={job} guard={guard} onClose={() => setGuard(null)} /> : null}
    </div>
  );
}

function useTrackItems(job: JobDetail): StepItem[] {
  const { t } = useI18n();
  const format = useJobFormat();
  const history = useQuery(jobHistoryQueryOptions(job.id)).data ?? [];
  return phaseTrack(phaseOf(job), history).map((step) => ({
    key: step.phase,
    state: step.state,
    label: t(step.state === "closed" ? currentPhaseLabel(job) : PHASE_LABEL[step.phase]),
    date: stepDate(step, format, t),
  }));
}

function stepDate(step: TrackStep, format: JobFormat, t: Translate): string | undefined {
  if (!step.reachedAt || step.state === "future" || step.state === "skipped") return undefined;
  const date = format.date(step.reachedAt);
  return step.state === "current" ? t("phase.since", { date }) : date;
}

function PhaseMenu({ job, onSelect }: { job: JobDetail; onSelect: (target: MenuTarget) => void }) {
  const { t } = useI18n();
  const phase = phaseOf(job);
  const items = MENU_TARGETS.map((target) => {
    const guard: StatusGuard = guardFor({ ...job, documents: documentPresence(job) }, target);
    const blocked = guard.kind === "blocked";
    return { key: target, label: t(PHASE_LABEL[target]), checked: target === phase, disabled: blocked };
  });
  const locked = items.every((item) => item.disabled);
  return (
    <div className="jd-phase-menu">
      <MenuButton buttonLabel={t("phase.change")} menuLabel={t("phase.change")} items={items} onSelect={onSelect} />
      {locked ? <p className="meta">{t("phase.locked")}</p> : null}
    </div>
  );
}
```

Note on the "current" target: `guardFor` returns `blocked/current` for the phase the job is in, so that item is shown checked and disabled; "Abgeschlossen" stays enabled for a closed job (changing the outcome). With every item disabled (`GENERATING`), the locked hint is shown.

The locked hint is rendered next to the button whenever every item is disabled, so it is visible with the menu open or closed.

- [ ] **Step 7: Mount it and style it**

In `web/src/features/job/JobPage.tsx`, import `PhaseTrack` from `./phase/PhaseTrack` and render `<PhaseTrack job={job} />` directly after `<JobHeader job={job} />` in `JobView`.

Append to `web/src/features/job/job.css` inside the `@layer components` block:

```css
  .jd-phase {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 16px;
    align-items: end;
  }
  .jd-phase .stepper {
    margin-top: 34px;
  }
  .jd-phase-menu {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    padding-bottom: 6px;
  }
  .jd-phase-menu .meta {
    max-width: 28ch;
    text-align: right;
  }
  .panel-actions {
    margin-top: 18px;
    flex-wrap: wrap;
  }
  @media (max-width: 767px) {
    .jd-phase {
      grid-template-columns: minmax(0, 1fr);
    }
    .jd-phase-menu {
      align-items: stretch;
    }
    .jd-phase-menu .meta {
      text-align: left;
      max-width: none;
    }
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (11 new phase tests plus Task 9's).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 11: "Nächster Schritt" card and its actions (incl. generation and job actions hooks)

**Files:**
- Create: `web/src/features/job/next/NextStepCard.tsx`, `web/src/features/job/next/NextStepActions.tsx`, `web/src/features/job/next/OfferDecision.tsx`, `web/src/features/job/next/useJobActions.ts`, `web/src/features/job/documents/useGeneration.ts`
- Modify: `web/src/features/job/JobPage.tsx`, `web/src/features/job/labels.ts`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/nextStepCard.test.tsx`, `web/tests/unit/features/job/generation.test.ts`

**Interfaces:**
- Consumes: `nextStep`, `isDue`, `FOLLOW_UP_DAYS`, `NextStep`, `NextAction` (Task 5); `patchJob`, `startInterviewPrep`, `JobDetail` (Task 2); `generatePackage`, `generateLetter`, `cancelGeneration`, `DocumentKind` (Task 3); `documentPresence`, `missingDocuments`, `DocumentPresence` (Task 4); `phaseOf`, `Phase` (Task 4); `addDays` (Task 1); `markTaskStarted`, `markTaskFinished`, `useTaskPhase` (Task 7); `pendingTaskId` (Task 7); `useNow` (Task 7); `useChangeStatus` (Task 10); `useOpenTab` (Task 9); `useJobFormat` (Task 0).
- Produces:
  - `@/features/job/documents/useGeneration`: `type GenerationRequest = { kind: "both"; includeProfileDocuments: boolean } | { kind: "cv"; notes: string; includeProfileDocuments: boolean } | { kind: "cover_letter"; notes: string }`, `runGeneration(jobId, request): Promise<void>`, `missingRequest(presence: DocumentPresence): GenerationRequest`, `type GenerationProblem = "profileIncomplete" | "unknown"`, `generationProblem(error?: string | null): GenerationProblem | null`, `useGeneration(job): { start: (request: GenerationRequest) => void; starting: boolean; cancel: () => void; cancelling: boolean }`.
  - `@/features/job/next/useJobActions`: `usePatchJob(job)` (TanStack mutation over `patchJob` that invalidates job, lists and counts and toasts errors), `useJobActions(job): { dismiss: () => void; restore: () => void; followedUp: () => void; startPrep: (regenerate: boolean) => void; busy: boolean }`.
  - `labels.ts` addition: `DATE_LABEL: Readonly<Partial<Record<Phase, MessageKey>>>` (`APPLIED` -> "Nachfassen am", `INTERVIEW` -> "Interviewtermin", `OFFER` -> "Antwort bis"; decision D5), used by Task 13 too.
  - `NextStepCard({ job })` with an `extras` slot that Task 12 fills (`ApplyChecklist`, `ApplyWithoutDocuments`).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/generation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generationProblem, missingRequest, runGeneration } from "@/features/job/documents/useGeneration";
import { stubRoutes } from "../../support/stubRoutes";

describe("missingRequest", () => {
  it("creates both when both are missing", () => {
    expect(missingRequest({ cv: false, cover_letter: false })).toEqual({
      kind: "both",
      includeProfileDocuments: true,
    });
  });

  it("creates only the missing letter", () => {
    expect(missingRequest({ cv: true, cover_letter: false })).toEqual({
      kind: "cover_letter",
      notes: "",
    });
  });

  it("creates only the missing CV", () => {
    expect(missingRequest({ cv: false, cover_letter: true })).toEqual({
      kind: "cv",
      notes: "",
      includeProfileDocuments: true,
    });
  });
});

describe("runGeneration", () => {
  it("stores the CV note (decision D8) before asking for the CV only", async () => {
    const calls = stubRoutes({
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /jobs/job-1/generate-package": { status: "started" },
    });
    await runGeneration("job-1", { kind: "cv", notes: " Führung betonen ", includeProfileDocuments: false });
    expect(calls.map((call) => [call.method, JSON.parse(call.body ?? "")])).toEqual([
      ["PATCH", { cv_draft: "Führung betonen" }],
      ["POST", { generate_cv: true, generate_letter: false, include_profile_documents: false }],
    ]);
  });

  it("writes the letter through /generate", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/generate": { status: "started" } });
    await runGeneration("job-1", { kind: "cover_letter", notes: "kürzer" });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({ improvement_notes: "kürzer" });
  });
});

describe("generationProblem", () => {
  it.each([
    ["Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen.", "profileIncomplete"],
    ["Profile incomplete. Please add your resume in the settings.", "profileIncomplete"],
    ["Traceback (most recent call last): boom", "unknown"],
  ])("%s -> %s", (error, problem) => {
    expect(generationProblem(error)).toBe(problem);
  });

  it("is null without an error", () => {
    expect(generationProblem(null)).toBeNull();
  });
});
```

`web/tests/unit/features/job/nextStepCard.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date("2026-10-08T10:00:00Z");
const READY = { cv_html_present: true, cover_letter_html_present: true };

beforeEach(() => {
  // Only Date is faked, so promises and user-event timers keep running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  navigation.replace.mockReset();
});

afterEach(() => vi.useRealTimers());

function show(job: JobDetail): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": [],
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/status": (call: RecordedCall) =>
      jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to }),
    "POST /jobs/job-1/generate-package": { status: "started" },
    "POST /jobs/job-1/generate": { status: "started" },
    "POST /jobs/job-1/interview-prep": { status: "queued", message: "", job_id: "job-1" },
    "GET /jobs/job-1": job,
  });
  renderWithProviders(<NextStepCard job={job} />);
  return calls;
}

const bodyOf = (calls: RecordedCall[], method: string, path: string) =>
  calls
    .filter((call) => call.method === method && call.url.endsWith(path))
    .map((call) => JSON.parse(call.body ?? "null"));

describe("NextStepCard", () => {
  it("offers Vormerken and Aussortieren for a match", async () => {
    const calls = show(buildJob({ status: "OPEN" }));
    expect(screen.getByRole("heading", { name: "Passt die Stelle zu dir?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vormerken" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "DRAFTED" }]));
  });

  it("sorts out with undo", async () => {
    const calls = show(buildJob({ status: "OPEN" }));
    await userEvent.click(screen.getByRole("button", { name: "Aussortieren" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    await waitFor(() =>
      expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([{ is_archived: true }, { is_archived: false }]),
    );
  });

  it("restores a sorted-out job", async () => {
    const calls = show(buildJob({ status: "OPEN", is_archived: true, archive_reason: "USER" }));
    await userEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    await waitFor(() => expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([{ is_archived: false }]));
  });

  it("creates both documents when none exists", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(screen.getByRole("button", { name: "Unterlagen erstellen" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: true },
      ]),
    );
  });

  it("explains an incomplete profile after a failed generation", () => {
    show(buildJob({ status: "FAILED", generation_error: "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen." }));
    expect(screen.getByText(/Dein Profil ist unvollständig/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Profil" })).toHaveAttribute("href", "/profile");
  });

  it("never shows raw generation errors", () => {
    show(buildJob({ status: "FAILED", generation_error: "Traceback: KeyError 'cv_data'" }));
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
  });

  it("warns when following up is overdue and records it", async () => {
    const calls = show(buildJob({ status: "APPLIED", ...READY, next_follow_up_at: "2026-10-01T07:00:00Z" }));
    expect(screen.getByRole("region", { name: "Nachfassen" })).toHaveClass("tone-warn");
    expect(screen.getByText(/überfällig/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nachgefasst" }));
    await waitFor(() =>
      expect(bodyOf(calls, "PATCH", "/jobs/job-1")).toEqual([
        { next_follow_up_at: "2026-10-18T10:00:00.000Z" },
      ]),
    );
  });

  it("records an invitation", async () => {
    const calls = show(buildJob({ status: "APPLIED", ...READY }));
    await userEvent.click(screen.getByRole("button", { name: "Einladung eintragen" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "INTERVIEW" }]));
  });

  it("starts the interview prep and opens its tab", async () => {
    const calls = show(buildJob({ status: "INTERVIEW", ...READY }));
    await userEvent.click(screen.getByRole("button", { name: "Interview vorbereiten" }));
    await waitFor(() => expect(bodyOf(calls, "POST", "/interview-prep")).toHaveLength(1));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=interview", { scroll: false });
  });

  it("records a declined offer with a note", async () => {
    const calls = show(buildJob({ status: "OFFER", ...READY, next_follow_up_at: "2026-10-20T16:00:00Z" }));
    expect(screen.getByText(/Antwort bis/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Angebot abgelehnt" }));
    await waitFor(() =>
      expect(bodyOf(calls, "POST", "/status")).toEqual([{ to: "REJECTED", note: "Angebot abgelehnt" }]),
    );
  });

  it("has no action once closed", () => {
    show(buildJob({ status: "ACCEPTED" }));
    expect(screen.getByRole("heading", { name: "Abgeschlossen" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/nextStepCard.test.tsx tests/unit/features/job/generation.test.ts`
Expected: FAIL, unresolved `@/features/job/next/NextStepCard` and `@/features/job/documents/useGeneration`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "next.shortlist": "Vormerken",
  "next.dismiss": "Aussortieren",
  "next.restoreAction": "Wiederherstellen",
  "next.createAction": "Unterlagen erstellen",
  "next.retry": "Erneut erstellen",
  "next.progress": "Fortschritt ansehen",
  "next.followedUp": "Nachgefasst",
  "next.invite": "Einladung eintragen",
  "next.prepare": "Interview vorbereiten",
  "next.openPrep": "Vorbereitung öffnen",
  "next.overdue": "überfällig",
  "next.dueOn": "{label} {date}",
  "next.dismissed": "Aussortiert: {company}.",
  "next.restored": "{company} ist wieder im Eingang.",
  "next.followUpSaved": "Nachfassen festgehalten. Nächste Erinnerung am {date}.",
  "next.profileIncomplete": "Dein Profil ist unvollständig. Hinterlege deinen Lebenslauf unter Profil.",
  "next.toProfile": "Zum Profil",
  "next.prepStarted": "Die Vorbereitung wird erstellt. Du kannst weiterarbeiten.",
  "next.prepExists": "Die Vorbereitung liegt schon vor.",
  "offer.accepted": "Angebot angenommen",
  "offer.declined": "Angebot abgelehnt",
  "offer.note": "Gehaltsverhandlung: Notiz anlegen",
  "dates.APPLIED": "Nachfassen am",
  "dates.INTERVIEW": "Interviewtermin",
  "dates.OFFER": "Antwort bis",
```

`web/src/i18n/en.ts`:

```ts
  "next.shortlist": "Shortlist",
  "next.dismiss": "Sort out",
  "next.restoreAction": "Restore",
  "next.createAction": "Create documents",
  "next.retry": "Create again",
  "next.progress": "View progress",
  "next.followedUp": "Followed up",
  "next.invite": "Record invitation",
  "next.prepare": "Prepare interview",
  "next.openPrep": "Open preparation",
  "next.overdue": "overdue",
  "next.dueOn": "{label} {date}",
  "next.dismissed": "Sorted out: {company}.",
  "next.restored": "{company} is back in the inbox.",
  "next.followUpSaved": "Follow-up recorded. Next reminder on {date}.",
  "next.profileIncomplete": "Your profile is incomplete. Add your CV under Profile.",
  "next.toProfile": "Go to profile",
  "next.prepStarted": "The preparation is being created. You can keep working.",
  "next.prepExists": "The preparation already exists.",
  "offer.accepted": "Offer accepted",
  "offer.declined": "Offer declined",
  "offer.note": "Salary negotiation: start a note",
  "dates.APPLIED": "Follow up on",
  "dates.INTERVIEW": "Interview date",
  "dates.OFFER": "Answer by",
```

Append to `web/src/features/job/labels.ts`:

```ts
/** Decision D5: one date (next_follow_up_at) whose meaning follows the phase. */
export const DATE_LABEL: Readonly<Partial<Record<Phase, MessageKey>>> = {
  APPLIED: "dates.APPLIED",
  INTERVIEW: "dates.INTERVIEW",
  OFFER: "dates.OFFER",
};
```

- [ ] **Step 4: Implement `web/src/features/job/documents/useGeneration.ts`**

```ts
"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { cancelGeneration, generateLetter, generatePackage } from "@/api/jobDocuments";
import { patchJob, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import type { DocumentPresence } from "@/domain/documents";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskFinished, markTaskStarted } from "@/realtime/usePendingTasks";
import { useToast } from "@/ui/ToastProvider";

export type GenerationRequest =
  | { kind: "both"; includeProfileDocuments: boolean }
  | { kind: "cv"; notes: string; includeProfileDocuments: boolean }
  | { kind: "cover_letter"; notes: string };

export type GenerationProblem = "profileIncomplete" | "unknown";

// The only generation_error texts the UI may interpret (server workers, German and English).
const PROFILE_INCOMPLETE = /^(profil unvollständig|profile incomplete)/i;
// The package attaches profile documents by default (backend default include_profile_documents=true).
const ATTACH_BY_DEFAULT = true;

/** Decision D8: CV notes travel in jobs.cv_draft; an empty note clears an old one. */
export async function runGeneration(jobId: string, request: GenerationRequest): Promise<void> {
  if (request.kind === "cover_letter") return generateLetter(jobId, request.notes);
  if (request.kind === "cv") {
    await patchJob(jobId, { cv_draft: request.notes.trim() });
    return generatePackage(jobId, { cv: true, letter: false, includeProfileDocuments: request.includeProfileDocuments });
  }
  return generatePackage(jobId, { cv: true, letter: true, includeProfileDocuments: request.includeProfileDocuments });
}

/** Creates only what is missing, so a finished document is never overwritten by accident. */
export function missingRequest(presence: DocumentPresence): GenerationRequest {
  if (!presence.cv && !presence.cover_letter) return { kind: "both", includeProfileDocuments: ATTACH_BY_DEFAULT };
  if (!presence.cv) return { kind: "cv", notes: "", includeProfileDocuments: ATTACH_BY_DEFAULT };
  return { kind: "cover_letter", notes: "" };
}

export function generationProblem(error?: string | null): GenerationProblem | null {
  if (!error) return null;
  return PROFILE_INCOMPLETE.test(error.trim()) ? "profileIncomplete" : "unknown";
}

function refreshJob(queryClient: QueryClient, jobId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.job(jobId) });
}

function useStartGeneration(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (request: GenerationRequest) => runGeneration(job.id, request),
    onSuccess: () => {
      markTaskStarted(queryClient, pendingTaskId.generation(job.id), Date.now());
      refreshJob(queryClient, job.id);
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function useCancelGeneration(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: () => cancelGeneration(job.id),
    onSuccess: () => {
      markTaskFinished(queryClient, pendingTaskId.generation(job.id));
      refreshJob(queryClient, job.id);
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** Start and cancel; the end arrives as job_update (applyEvent finishes the pending task). */
export function useGeneration(job: JobDetail) {
  const start = useStartGeneration(job);
  const cancel = useCancelGeneration(job);
  return {
    start: start.mutate,
    starting: start.isPending,
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  };
}
```

- [ ] **Step 5: Implement `web/src/features/job/next/useJobActions.ts`**

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { patchJob, startInterviewPrep, type JobDetail, type JobPatch } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { addDays } from "@/domain/calendar";
import { FOLLOW_UP_DAYS } from "@/domain/nextStep";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { useToast } from "@/ui/ToastProvider";
import { useJobFormat } from "../format/useJobFormat";
import { useOpenTab } from "../tabs/JobTabs";

/** PATCH, then refresh the job, its lists and the nav counts. */
export function usePatchJob(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (patch: JobPatch) => patchJob(job.id, patch),
    onSuccess: () => {
      for (const queryKey of [queryKeys.job(job.id), queryKeys.jobsRoot, queryKeys.jobCounts]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function usePrepStart(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (regenerate: boolean) => startInterviewPrep(job.id, regenerate),
    onSuccess: (started) => {
      if (started === "queued") markTaskStarted(queryClient, pendingTaskId.prep(job.id), Date.now());
      toast.show({ message: t(started === "queued" ? "next.prepStarted" : "next.prepExists") });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

type PatchMutation = ReturnType<typeof usePatchJob>;

/** "Nachgefasst": the next reminder moves FOLLOW_UP_DAYS ahead (history only records statuses). */
function useFollowedUp(patch: PatchMutation): () => void {
  const { t } = useI18n();
  const toast = useToast();
  const format = useJobFormat();
  return () => {
    // Event handler, not render: reading the clock here is fine.
    const next = addDays(new Date(), FOLLOW_UP_DAYS).toISOString();
    const message = t("next.followUpSaved", { date: format.date(next) });
    patch.mutate({ next_follow_up_at: next }, { onSuccess: () => toast.show({ message }) });
  };
}

function useArchiveActions(job: JobDetail, patch: PatchMutation) {
  const { t } = useI18n();
  const toast = useToast();
  const company = job.company ?? "";
  const restore = () => patch.mutate({ is_archived: false });
  const undo = { label: t("phase.undo"), onAction: restore };
  return {
    dismiss: () =>
      patch.mutate(
        { is_archived: true },
        { onSuccess: () => toast.show({ message: t("next.dismissed", { company }), action: undo }) },
      ),
    restore: () =>
      patch.mutate(
        { is_archived: false },
        { onSuccess: () => toast.show({ message: t("next.restored", { company }) }) },
      ),
  };
}

export function useJobActions(job: JobDetail) {
  const patch = usePatchJob(job);
  const prep = usePrepStart(job);
  const openTab = useOpenTab();
  const startPrep = (regenerate: boolean) => {
    prep.mutate(regenerate);
    openTab("interview");
  };
  return {
    ...useArchiveActions(job, patch),
    followedUp: useFollowedUp(patch),
    startPrep,
    busy: patch.isPending || prep.isPending,
  };
}
```

- [ ] **Step 6: Implement the card, actions and offer decision**

`web/src/features/job/next/OfferDecision.tsx`:

```tsx
"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useChangeStatus } from "../phase/useChangeStatus";
import { useOpenTab } from "../tabs/JobTabs";

/** Prototype offer row: accept, decline (REJECTED plus note, decision D4) or start a negotiation note. */
export function OfferDecision({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  const openTab = useOpenTab();
  return (
    <div className="row" id="offer-decision">
      <Button variant="primary" busy={isPending} onClick={() => void changeStatus({ to: "ACCEPTED" })}>
        {t("offer.accepted")}
      </Button>
      <Button busy={isPending} onClick={() => void changeStatus({ to: "REJECTED", note: t("offer.declined") })}>
        {t("offer.declined")}
      </Button>
      <Button variant="ghost" onClick={() => openTab("history")}>
        {t("offer.note")}
      </Button>
    </div>
  );
}
```

`web/src/features/job/next/NextStepActions.tsx`:

```tsx
"use client";

import { Archive, Bookmark, Check, CalendarPlus, FileText, MessageSquare, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import type { NextAction, NextStep } from "@/domain/nextStep";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { generationProblem, missingRequest, useGeneration } from "../documents/useGeneration";
import { useChangeStatus } from "../phase/useChangeStatus";
import { useOpenTab } from "../tabs/JobTabs";
import { OfferDecision } from "./OfferDecision";
import { useJobActions } from "./useJobActions";

interface ActionProps {
  job: JobDetail;
  step: NextStep;
}

function TriageActions({ job }: ActionProps) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  const actions = useJobActions(job);
  return (
    <div className="row">
      <Button variant="primary" icon={Bookmark} busy={isPending} onClick={() => void changeStatus({ to: "DRAFTED" })}>
        {t("next.shortlist")}
      </Button>
      <Button icon={Archive} busy={actions.busy} onClick={actions.dismiss}>
        {t("next.dismiss")}
      </Button>
    </div>
  );
}

function RestoreAction({ job }: ActionProps) {
  const { t } = useI18n();
  const actions = useJobActions(job);
  return (
    <Button icon={RotateCcw} busy={actions.busy} onClick={actions.restore}>
      {t("next.restoreAction")}
    </Button>
  );
}

function GenerateAction({ job, step }: ActionProps) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const label = step.kind === "generationFailed" ? "next.retry" : "next.createAction";
  return (
    <>
      <ProfileHint error={job.generation_error} />
      <Button variant="primary" icon={FileText} busy={generation.starting} onClick={() => generation.start(missingRequest(documentPresence(job)))}>
        {t(label)}
      </Button>
    </>
  );
}

/** Only an allow-listed meaning of generation_error is shown; raw text never (spec 6). */
function ProfileHint({ error }: { error?: string | null }) {
  const { t } = useI18n();
  if (generationProblem(error) !== "profileIncomplete") return null;
  return (
    <p className="next-hint">
      {t("next.profileIncomplete")}{" "}
      <Link className="link" href="/profile">
        {t("next.toProfile")}
      </Link>
    </p>
  );
}

function OpenTabAction({ step }: ActionProps) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  const action = step.action as Extract<NextAction, { type: "openTab" }>;
  return (
    <Button variant="primary" icon={action.tab === "interview" ? MessageSquare : FileText} onClick={() => openTab(action.tab)}>
      {t(action.tab === "interview" ? "next.openPrep" : "next.progress")}
    </Button>
  );
}

function FollowUpAction({ job }: ActionProps) {
  const { t } = useI18n();
  const actions = useJobActions(job);
  return (
    <Button variant="primary" icon={Check} busy={actions.busy} onClick={actions.followedUp}>
      {t("next.followedUp")}
    </Button>
  );
}

function InviteAction({ job }: ActionProps) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  return (
    <Button variant="primary" icon={CalendarPlus} busy={isPending} onClick={() => void changeStatus({ to: "INTERVIEW" })}>
      {t("next.invite")}
    </Button>
  );
}

function PrepAction({ job }: ActionProps) {
  const { t } = useI18n();
  const actions = useJobActions(job);
  return (
    <Button variant="primary" icon={MessageSquare} busy={actions.busy} onClick={() => actions.startPrep(false)}>
      {t("next.prepare")}
    </Button>
  );
}

const NoAction = () => null;

const ACTION_VIEWS: Readonly<Record<NextAction["type"], (props: ActionProps) => ReactNode>> = {
  shortlist: TriageActions,
  restore: RestoreAction,
  generate: GenerateAction,
  openTab: OpenTabAction,
  // The apply checklist is the action (Task 12), rendered in the card's extras.
  apply: NoAction,
  followUp: FollowUpAction,
  setStatus: InviteAction,
  generatePrep: PrepAction,
  decideOffer: ({ job }) => <OfferDecision job={job} />,
  none: NoAction,
};

export function NextStepActions({ job, step }: ActionProps) {
  const View = ACTION_VIEWS[step.action.type];
  return <View job={job} step={step} />;
}
```

The `setStatus` action is only produced for the invitation (`to: "INTERVIEW"`, Task 5), so `InviteAction` handles it.

`web/src/features/job/next/NextStepCard.tsx`:

```tsx
"use client";

import type { JobDetail } from "@/api/jobs";
import { isDue, nextStep, type NextStep } from "@/domain/nextStep";
import { phaseOf } from "@/domain/jobStatus";
import { useNow } from "@/lib/clock";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { useJobFormat } from "../format/useJobFormat";
import { DATE_LABEL } from "../labels";
import { NextStepActions } from "./NextStepActions";

const CARD_TITLE_ID = "next-step-title";

/** Spec 4.2 / usability #8: the one card with every control for the next move. */
export function NextStepCard({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const step = nextStep(job, new Date(useNow()));
  return (
    <section className={cx("next", isDue(step) && "tone-warn")} aria-labelledby={CARD_TITLE_ID}>
      <div className="next-kicker">{t("next.kicker")}</div>
      <h2 className="next-title" id={CARD_TITLE_ID}>
        {t(step.label)}
      </h2>
      <DueLine job={job} step={step} />
      <p className="next-text">{t(step.text)}</p>
      <div className="next-actions">
        <NextStepActions job={job} step={step} />
      </div>
    </section>
  );
}

function DueLine({ job, step }: { job: JobDetail; step: NextStep }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const label = DATE_LABEL[phaseOf(job)];
  if (!step.due || !label || !job.next_follow_up_at) return null;
  return (
    <p className={cx("next-due", step.overdue && "t-warn")}>
      {t("next.dueOn", { label: t(label), date: format.date(job.next_follow_up_at) })}
      {step.overdue ? ` · ${t("next.overdue")}` : null}
    </p>
  );
}
```

`new Date(useNow())` builds a Date from the clock value, which is a pure read; `nextStep` gets the browser's time zone by default (`timeZone` undefined), matching what the user sees.

Mount: in `web/src/features/job/JobPage.tsx` replace `<aside className="jd-side" />` with:

```tsx
        <aside className="jd-side">
          <NextStepCard job={job} />
        </aside>
```

and import `NextStepCard` from `./next/NextStepCard`.

- [ ] **Step 7: Card CSS**

Append to `web/src/features/job/job.css` inside the layer:

```css
  /* Next step: a pull-out with a signal bar, not a box (prototype .next). */
  .next {
    padding: 2px 0 2px 22px;
    border-left: 5px solid var(--accent);
  }
  .next.tone-warn {
    border-left-color: var(--warn);
  }
  .next-kicker {
    font-size: var(--fs-13);
    color: var(--accent-text);
    font-weight: 700;
  }
  .next.tone-warn .next-kicker {
    color: var(--warn-text);
  }
  .next-title {
    font: 700 clamp(22px, 2.4vw, 30px) / 1.1 var(--font-display);
    font-optical-sizing: auto;
    margin-top: 4px;
    letter-spacing: -0.028em;
    text-wrap: balance;
  }
  .next-due {
    margin-top: 6px;
    font-size: var(--fs-13);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .next-text {
    color: var(--text-2);
    margin-top: 8px;
    font-size: 15px;
  }
  .next-hint {
    margin-top: 10px;
    font-size: var(--fs-13);
  }
  .next-actions {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  /* Usability #23: in dark mode the card sits on a soft accent field instead of a glaring bar alone. */
  :root[data-mode="dark"] .next {
    background: var(--accent-soft);
    padding: 14px 16px 16px 18px;
  }
  @media (max-width: 767px) {
    .next {
      padding-left: 16px;
    }
    .next-title {
      font-size: 23px;
    }
    .next-actions .btn {
      min-height: 44px;
    }
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (generation 8, next step card 11, earlier job tests unchanged).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 12: Apply checklist and "apply without documents" inside the card

**Files:**
- Create: `web/src/features/job/next/ApplyChecklist.tsx`, `web/src/features/job/next/ApplyWithoutDocuments.tsx`, `web/src/features/job/next/NextStepExtras.tsx`, `web/src/features/job/documents/saveFile.ts`
- Modify: `web/src/features/job/next/NextStepCard.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/applyChecklist.test.tsx`

**Interfaces:**
- Consumes: `setChecklistItem`, `checklistOf`, `CHECKLIST_KEYS`, `ChecklistKey` (Task 5); `FOLLOW_UP_DAYS` (Task 5); `addDays`, `fromDateInputValue`, `toDateInputValue` (Task 1); `documentPresence` (Task 4); `jobDocumentsQueryOptions`, `generatedDocument`, `downloadJobDocument`, `DOCUMENT_KINDS` (Task 3); `DownloadedFile` (Task 0); `usePatchJob` (Task 11); `useChangeStatus` (Task 10); `CheckField`, `TextField` (phase 1 / Task 8); `useNow` (Task 7); `DOCUMENT_LABEL` (Task 9).
- Produces:
  - `saveFile(file: DownloadedFile, fallbackName: string): void` (`@/features/job/documents/saveFile`) — triggers a browser download from a blob and revokes the URL; reused by Tasks 16 and 18.
  - `DRIVE_UNSUPPORTED: ErrorMessageOverrides` (`{ BAD_REQUEST: "files.driveUnsupported" }`, same module) — Google Drive files answer 400 (G12).
  - `NextStepExtras({ job, step })`: the checklist for `apply`/`markApplied`, the apply-without-documents control for Vorgemerkt jobs whose documents are not ready.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/applyChecklist.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date("2026-10-08T10:00:00Z");
const READY = { status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true };
const DOCUMENTS = [
  { id: 4, original_filename: "Lebenslauf_ACME.pdf", file_size: 1, mime_type: "application/pdf", kind: "GENERATED_CV", uploaded_at: null },
  { id: 5, original_filename: "Anschreiben_ACME.pdf", file_size: 1, mime_type: "application/pdf", kind: "GENERATED_LETTER", uploaded_at: null },
];
const pdf = () => new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
});

afterEach(() => vi.useRealTimers());

function show(job: JobDetail): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/history": [],
    "GET /jobs/job-1/documents": DOCUMENTS,
    "GET /jobs/job-1/documents/4/download": pdf,
    "GET /jobs/job-1/documents/5/download": pdf,
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/status": (call: RecordedCall) =>
      jsonResponse(200, { ...job, status: JSON.parse(call.body ?? "").to }),
  });
  renderWithProviders(<NextStepCard job={job} />);
  return calls;
}

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));
const statusPosts = (calls: RecordedCall[]) =>
  calls.filter((call) => call.url.endsWith("/status")).map((call) => JSON.parse(call.body ?? ""));

describe("ApplyChecklist", () => {
  it("shows the three steps with their stored state", () => {
    show(buildJob({ ...READY, checklist: { posting_opened: true, documents_checked: false, sent: false } }));
    expect(screen.getByLabelText("Stellenanzeige geöffnet")).toBeChecked();
    expect(screen.getByLabelText("Unterlagen geprüft")).not.toBeChecked();
    expect(screen.getByLabelText("Beim Arbeitgeber abgeschickt")).not.toBeChecked();
  });

  it("sends all three keys when ticking one", async () => {
    const calls = show(buildJob({ ...READY, checklist: { posting_opened: true, documents_checked: false, sent: false } }));
    await userEvent.click(screen.getByLabelText("Beim Arbeitgeber abgeschickt"));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: true, documents_checked: false, sent: true } },
      ]),
    );
  });

  it("ticks the posting step when the posting is opened", async () => {
    const calls = show(buildJob(READY));
    await userEvent.click(screen.getByRole("link", { name: "Anzeige bei ACME GmbH öffnen" }));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: true, documents_checked: false, sent: false } },
      ]),
    );
  });

  it("downloads both PDFs and ticks the documents step", async () => {
    const calls = show(buildJob(READY));
    await userEvent.click(screen.getByRole("button", { name: "Beide PDFs herunterladen" }));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        { checklist: { posting_opened: false, documents_checked: true, sent: false } },
      ]),
    );
    expect(calls.filter((call) => call.url.endsWith("/download"))).toHaveLength(2);
  });

  it("marks as applied today and suggests a follow-up date", async () => {
    const calls = show(buildJob(READY));
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
    await waitFor(() => expect(patches(calls)[0].next_follow_up_at).toMatch(/^2026-10-18T/));
  });

  it("records a past apply date in the note", async () => {
    const calls = show(buildJob(READY));
    const date = screen.getByLabelText("Datum der Bewerbung");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-05");
    await userEvent.click(screen.getByRole("button", { name: "Als beworben markieren" }));
    await waitFor(() =>
      expect(statusPosts(calls)).toEqual([{ to: "APPLIED", note: "Beworben am 05.10.2026" }]),
    );
  });
});

describe("ApplyWithoutDocuments", () => {
  it("warns which document is missing before marking as applied", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    await userEvent.click(screen.getByRole("button", { name: "Ohne Unterlagen als beworben markieren" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Lebenslauf fertig, Anschreiben fehlt");
    await userEvent.click(screen.getByRole("button", { name: "Trotzdem als beworben markieren" }));
    await waitFor(() => expect(statusPosts(calls)).toEqual([{ to: "APPLIED" }]));
  });

  it("can be cancelled", async () => {
    show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(screen.getByRole("button", { name: "Ohne Unterlagen als beworben markieren" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

The toast regions are permanent `role="alert"`/`role="status"` landmarks (phase 1). If `getByRole("alert")` finds more than one element, narrow it with `screen.getByText(/Lebenslauf fertig, Anschreiben fehlt/).closest('[role="alert"]')` as the phase-1 login test does.

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/applyChecklist.test.tsx`
Expected: FAIL, the checklist labels are not found.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "checklist.label": "Bewerbungs-Checkliste",
  "checklist.step1": "Stellenanzeige öffnen",
  "checklist.step2": "Unterlagen prüfen und herunterladen",
  "checklist.step3": "Beim Arbeitgeber abschicken",
  "checklist.posting_opened": "Stellenanzeige geöffnet",
  "checklist.documents_checked": "Unterlagen geprüft",
  "checklist.sent": "Beim Arbeitgeber abgeschickt",
  "checklist.openPosting": "Anzeige bei {company} öffnen",
  "checklist.downloadBoth": "Beide PDFs herunterladen",
  "checklist.applyDate": "Datum der Bewerbung",
  "checklist.markApplied": "Als beworben markieren",
  "checklist.appliedOn": "Beworben am {date}",
  "checklist.invalidDate": "Bitte ein gültiges Datum wählen, nicht in der Zukunft.",
  "applyWithout.open": "Ohne Unterlagen als beworben markieren",
  "applyWithout.ready": "{doc} fertig",
  "applyWithout.missing": "{doc} fehlt",
  "applyWithout.question": "Hast du dich mit eigenen Unterlagen beworben?",
  "applyWithout.confirm": "Trotzdem als beworben markieren",
  "files.driveUnsupported": "Dateien aus Google Drive lassen sich hier noch nicht öffnen.",
```

`web/src/i18n/en.ts`:

```ts
  "checklist.label": "Application checklist",
  "checklist.step1": "Open the posting",
  "checklist.step2": "Check and download the documents",
  "checklist.step3": "Send it to the employer",
  "checklist.posting_opened": "Posting opened",
  "checklist.documents_checked": "Documents checked",
  "checklist.sent": "Sent to the employer",
  "checklist.openPosting": "Open the posting at {company}",
  "checklist.downloadBoth": "Download both PDFs",
  "checklist.applyDate": "Date of application",
  "checklist.markApplied": "Mark as applied",
  "checklist.appliedOn": "Applied on {date}",
  "checklist.invalidDate": "Please pick a valid date that is not in the future.",
  "applyWithout.open": "Mark as applied without documents",
  "applyWithout.ready": "{doc} ready",
  "applyWithout.missing": "{doc} missing",
  "applyWithout.question": "Did you apply with your own documents?",
  "applyWithout.confirm": "Mark as applied anyway",
  "files.driveUnsupported": "Files stored in Google Drive cannot be opened here yet.",
```

- [ ] **Step 4: Implement `web/src/features/job/documents/saveFile.ts`**

```ts
import type { ErrorMessageOverrides } from "@/api/describeError";
import type { DownloadedFile } from "@/api/files";

/** Google Drive files answer 400 on view/download (backend gap G12). */
export const DRIVE_UNSUPPORTED: ErrorMessageOverrides = { BAD_REQUEST: "files.driveUnsupported" };

/** Hands a fetched file to the browser's download; the bytes came through apiFetch (cookies, refresh). */
export function saveFile(file: DownloadedFile, fallbackName: string): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename ?? fallbackName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Implement the checklist**

`web/src/features/job/next/ApplyChecklist.tsx`:

```tsx
"use client";

import { Check, Download, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { describeError } from "@/api/describeError";
import {
  DOCUMENT_KINDS,
  downloadJobDocument,
  generatedDocument,
  jobDocumentsQueryOptions,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { addDays, fromDateInputValue, toDateInputValue } from "@/domain/calendar";
import { checklistOf, setChecklistItem, type ChecklistKey } from "@/domain/checklist";
import { FOLLOW_UP_DAYS } from "@/domain/nextStep";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Button } from "@/ui/Button";
import { CheckField, TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { useToast } from "@/ui/ToastProvider";
import { DRIVE_UNSUPPORTED, saveFile } from "../documents/saveFile";
import { useJobFormat } from "../format/useJobFormat";
import { useChangeStatus } from "../phase/useChangeStatus";
import { usePatchJob } from "./useJobActions";

/** Prototype renderApplyChecklist, inside the next-step card (usability #8); stored in jobs.checklist (B7). */
export function ApplyChecklist({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const patch = usePatchJob(job);
  const tick = (key: ChecklistKey, done = true) =>
    patch.mutate({ checklist: setChecklistItem(job.checklist, key, done) });
  return (
    <ol className="checklist" aria-label={t("checklist.label")}>
      <ChecklistStep job={job} number={1} item="posting_opened" onTick={tick}>
        <PostingLink job={job} onOpen={() => tick("posting_opened")} />
      </ChecklistStep>
      <ChecklistStep job={job} number={2} item="documents_checked" onTick={tick}>
        <DownloadBoth job={job} onDone={() => tick("documents_checked")} />
      </ChecklistStep>
      <ChecklistStep job={job} number={3} item="sent" onTick={tick}>
        <MarkApplied job={job} />
      </ChecklistStep>
    </ol>
  );
}

interface ChecklistStepProps {
  job: JobDetail;
  number: number;
  item: ChecklistKey;
  onTick: (key: ChecklistKey, done: boolean) => void;
  children: ReactNode;
}

const STEP_TITLE = { posting_opened: "checklist.step1", documents_checked: "checklist.step2", sent: "checklist.step3" } as const;

function ChecklistStep({ job, number, item, onTick, children }: ChecklistStepProps) {
  const { t } = useI18n();
  const done = checklistOf(job.checklist)[item];
  return (
    <li className={done ? "cl-item done" : "cl-item"}>
      <span className="cl-num" aria-hidden="true">
        {done ? <Icon icon={Check} /> : number}
      </span>
      <div className="cl-body">
        <div className="cl-title">{t(STEP_TITLE[item])}</div>
        <CheckField id={`checklist-${item}`} label={t(`checklist.${item}`)} checked={done} onChange={(value) => onTick(item, value)} />
        <div className="row">{children}</div>
      </div>
    </li>
  );
}

function PostingLink({ job, onOpen }: { job: JobDetail; onOpen: () => void }) {
  const { t } = useI18n();
  if (!job.url) return null;
  return (
    <a className="btn btn-sm" href={job.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
      <Icon icon={ExternalLink} />
      <span>{t("checklist.openPosting", { company: job.company ?? "" })}</span>
    </a>
  );
}

async function downloadGenerated(jobId: string, documents: readonly JobDocument[]): Promise<void> {
  for (const kind of DOCUMENT_KINDS) {
    const document = generatedDocument(documents, kind);
    if (document) saveFile(await downloadJobDocument(jobId, document.id), document.original_filename);
  }
}

function DownloadBoth({ job, onDone }: { job: JobDetail; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadGenerated(job.id, documents);
      onDone();
    } catch (error) {
      toast.show({ tone: "error", message: describeError(error, t, DRIVE_UNSUPPORTED) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" icon={Download} busy={busy} onClick={() => void download()}>
      {t("checklist.downloadBoth")}
    </Button>
  );
}
```

`web/src/features/job/next/ApplyChecklist.tsx` continues with the apply-date step:

```tsx
/** Step 3: the status change itself. A past date goes into the history note (backend gap G10). */
function MarkApplied({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const today = toDateInputValue(new Date(useNow()));
  const [value, setValue] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const markApplied = useMarkApplied(job);
  const submit = () => {
    const picked = fromDateInputValue(value);
    if (!picked || value > today) return setError(t("checklist.invalidDate"));
    setError(undefined);
    void markApplied(picked, value !== today);
  };
  return (
    <div className="apply-row">
      <TextField id="apply-date" type="date" label={t("checklist.applyDate")} value={value} max={today} error={error} onChange={(event) => setValue(event.target.value)} />
      <Button size="sm" icon={Check} onClick={submit}>
        {t("checklist.markApplied")}
      </Button>
    </div>
  );
}

function useMarkApplied(job: JobDetail) {
  const { t } = useI18n();
  const format = useJobFormat();
  const { changeStatus } = useChangeStatus(job);
  const patch = usePatchJob(job);
  return async (picked: Date, backdated: boolean) => {
    const note = backdated ? t("checklist.appliedOn", { date: format.date(picked.toISOString()) }) : undefined;
    const updated = await changeStatus(note ? { to: "APPLIED", note } : { to: "APPLIED" });
    if (updated) patch.mutate({ next_follow_up_at: addDays(picked, FOLLOW_UP_DAYS).toISOString() });
  };
}
```

`value > today` compares `YYYY-MM-DD` strings, which order like dates.

- [ ] **Step 6: Implement "apply without documents" and the extras slot**

`web/src/features/job/next/ApplyWithoutDocuments.tsx`:

```tsx
"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { DOCUMENT_KINDS } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { DOCUMENT_LABEL } from "../labels";
import { useChangeStatus } from "../phase/useChangeStatus";

/** Prototype renderApplyWithout: an inline warning naming what is missing (spec 4.2 guard). */
export function ApplyWithoutDocuments({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [warning, setWarning] = useState(false);
  const { changeStatus, isPending } = useChangeStatus(job);
  if (!warning) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setWarning(true)}>
        {t("applyWithout.open")}
      </Button>
    );
  }
  return (
    <div className="row">
      <Button size="sm" busy={isPending} onClick={() => void changeStatus({ to: "APPLIED" })}>
        {t("applyWithout.confirm")}
      </Button>
      <MissingWarning job={job} />
      <Button size="sm" variant="ghost" onClick={() => setWarning(false)}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

function MissingWarning({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const presence = documentPresence(job);
  const parts = DOCUMENT_KINDS.map((kind) =>
    t(presence[kind] ? "applyWithout.ready" : "applyWithout.missing", { doc: t(DOCUMENT_LABEL[kind]) }),
  );
  return (
    <span className="inline-warn" role="alert">
      <Icon icon={TriangleAlert} />
      <span>
        {parts.join(", ")}. {t("applyWithout.question")}
      </span>
    </span>
  );
}
```

`web/src/features/job/next/NextStepExtras.tsx`:

```tsx
"use client";

import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import type { NextStep, NextStepKind } from "@/domain/nextStep";
import { ApplyChecklist } from "./ApplyChecklist";
import { ApplyWithoutDocuments } from "./ApplyWithoutDocuments";

const CHECKLIST_KINDS: ReadonlySet<NextStepKind> = new Set<NextStepKind>(["apply", "markApplied"]);
const NOT_READY_KINDS: ReadonlySet<NextStepKind> = new Set<NextStepKind>([
  "createDocuments",
  "generating",
  "generationFailed",
]);

export function NextStepExtras({ job, step }: { job: JobDetail; step: NextStep }) {
  if (CHECKLIST_KINDS.has(step.kind)) return <ApplyChecklist job={job} />;
  if (NOT_READY_KINDS.has(step.kind) && phaseOf(job) === "DRAFTED") return <ApplyWithoutDocuments job={job} />;
  return null;
}
```

In `NextStepCard.tsx`, render `<NextStepExtras job={job} step={step} />` as the last child of `.next-actions` (import it from `./NextStepExtras`).

- [ ] **Step 7: Checklist CSS**

Append to `web/src/features/job/job.css`:

```css
  .checklist {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    width: 100%;
  }
  .cl-item {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
    align-items: start;
  }
  .cl-item:first-child {
    border-top: 0;
  }
  .cl-num {
    font: 600 24px/1 var(--font-display);
    font-optical-sizing: auto;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
    display: flex;
  }
  .cl-num .ico {
    width: 22px;
    height: 22px;
    color: var(--accent-text);
  }
  .cl-item.done .cl-title {
    color: var(--text-2);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .cl-title {
    font-weight: 600;
  }
  .cl-body .row {
    margin-top: 6px;
  }
  .apply-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }
  .apply-row .field {
    margin: 0;
  }
  .inline-warn {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-size: var(--fs-13);
    color: var(--text);
    padding: 5px 10px 5px 8px;
    border-radius: var(--r-ctl);
    background: var(--warn-soft);
    border-left: 3px solid var(--warn);
  }
  .inline-warn > .ico {
    color: var(--warn-text);
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (8 new checklist tests, the Task 11 card tests still green).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 13: "Termine & Daten" (date, contacts, recruiter, salary benchmark)

**Files:**
- Create: `web/src/features/job/dates/datesForm.ts`, `web/src/features/job/dates/DatesCard.tsx`, `web/src/features/job/dates/DatesDrawer.tsx`
- Modify: `web/src/features/job/JobPage.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/datesForm.test.ts`, `web/tests/unit/features/job/datesCard.test.tsx`

**Interfaces:**
- Consumes: `JobDetail`, `JobPatch`, `JobContact` (Task 2); `fromDateInputValue`, `toDateInputValue`, `parseApiDate` (Task 1); `phaseOf` (Task 4); `DATE_LABEL` (Task 11); `usePatchJob` (Task 11); `Drawer`, `PanelHeader`, `TextField`, `TextAreaField`, `Button` (phase 1 / Task 8); `useJobFormat` (Task 0).
- Produces (`@/features/job/dates/datesForm`):
  - `interface ContactRow { name: string; role: string; email: string }`
  - `interface DatesForm { date: string; contacts: ContactRow[]; recruiterName: string; recruiterEmail: string; recruiterPhone: string; salaryMin: string; salaryMax: string; salaryNote: string }`
  - `type DatesField = "date" | "recruiterEmail" | "salaryMin" | "salaryMax" | \`contact.${number}.email\``, `type DatesProblem = "invalidDate" | "invalidEmail" | "invalidAmount" | "minAboveMax"`
  - `formFromJob(job: JobDetail): DatesForm`, `validateDatesForm(form): Partial<Record<DatesField, DatesProblem>>`, `patchFromForm(form): JobPatch`, `MAX_CONTACTS = 10`
- Produces: `DatesCard({ job })` mounted below the next step card.

Notes: the date cannot be removed once set (backend gap G3): an empty date field leaves the stored date untouched, and the form says so in a hint.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/datesForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formFromJob, patchFromForm, validateDatesForm, type DatesForm } from "@/features/job/dates/datesForm";
import { buildJob } from "../../support/jobFactory";

const EMPTY: DatesForm = {
  date: "",
  contacts: [],
  recruiterName: "",
  recruiterEmail: "",
  recruiterPhone: "",
  salaryMin: "",
  salaryMax: "",
  salaryNote: "",
};

describe("formFromJob", () => {
  it("reads the stored values", () => {
    const form = formFromJob(
      buildJob({
        next_follow_up_at: "2026-10-20T07:00:00Z",
        contact_persons: [{ name: "Anna Muster", role: "Teamlead", email: "anna@acme.de" }],
        recruiter_info: { name: "Ben", email: "ben@agentur.de", phone: "" },
        salary_benchmark: { min: 75000, max: 90000, note: "laut Kununu" },
      }),
    );
    expect(form).toMatchObject({
      date: "2026-10-20",
      recruiterName: "Ben",
      salaryMin: "75000",
      salaryMax: "90000",
      salaryNote: "laut Kununu",
    });
    expect(form.contacts).toHaveLength(1);
  });

  it("starts empty", () => {
    expect(formFromJob(buildJob())).toEqual(EMPTY);
  });
});

describe("validateDatesForm", () => {
  it("accepts an empty form", () => {
    expect(validateDatesForm(EMPTY)).toEqual({});
  });

  it("rejects a minimum above the maximum", () => {
    expect(validateDatesForm({ ...EMPTY, salaryMin: "90000", salaryMax: "80000" })).toEqual({
      salaryMax: "minAboveMax",
    });
  });

  it("rejects negative or broken amounts", () => {
    expect(validateDatesForm({ ...EMPTY, salaryMin: "-1", salaryMax: "8o" })).toEqual({
      salaryMin: "invalidAmount",
      salaryMax: "invalidAmount",
    });
  });

  it("rejects a mail address without @", () => {
    expect(
      validateDatesForm({ ...EMPTY, contacts: [{ name: "A", role: "", email: "anna" }], recruiterEmail: "x" }),
    ).toEqual({ "contact.0.email": "invalidEmail", recruiterEmail: "invalidEmail" });
  });

  it("rejects an impossible date", () => {
    expect(validateDatesForm({ ...EMPTY, date: "2026-02-30" })).toEqual({ date: "invalidDate" });
  });
});

describe("patchFromForm", () => {
  it("drops contact rows without a name and keeps the date untouched when empty", () => {
    const patch = patchFromForm({
      ...EMPTY,
      contacts: [{ name: " ", role: "x", email: "" }, { name: "Anna", role: "", email: "" }],
      salaryMin: "75000",
    });
    expect(patch).toEqual({
      contact_persons: [{ name: "Anna", role: "", email: "" }],
      recruiter_info: { name: "", email: "", phone: "" },
      salary_benchmark: { min: 75000, max: null, note: "" },
    });
  });

  it("sends a picked date as ISO time", () => {
    expect(patchFromForm({ ...EMPTY, date: "2026-10-20" }).next_follow_up_at).toMatch(/^2026-10-20T/);
  });
});
```

`web/tests/unit/features/job/datesCard.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatesCard } from "@/features/job/dates/DatesCard";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("DatesCard", () => {
  it("names the date after the phase", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ status: "INTERVIEW", next_follow_up_at: "2026-10-20T07:00:00Z" })} />);
    const card = screen.getByRole("region", { name: "Termine & Daten" });
    expect(within(card).getByText("Interviewtermin")).toBeInTheDocument();
    expect(within(card).getByText(/20\.10\./)).toBeInTheDocument();
  });

  it("edits contacts and salary in a drawer and saves them in one PATCH", async () => {
    const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" } });
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    const drawer = screen.getByRole("dialog", { name: "Termine & Daten" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Kontakt hinzufügen" }));
    await userEvent.type(within(drawer).getByLabelText("Name 1"), "Anna Muster");
    await userEvent.type(within(drawer).getByLabelText("Gehalt von (€ im Jahr)"), "75000");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(JSON.parse(calls[0].body ?? "")).toMatchObject({
        contact_persons: [{ name: "Anna Muster", role: "", email: "" }],
        salary_benchmark: { min: 75000, max: null, note: "" },
      }),
    );
  });

  it("does not save an invalid salary range", async () => {
    const calls = stubRoutes({ "PATCH /jobs/job-1": { status: "updated" } });
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Gehalt von (€ im Jahr)"), "90000");
    await userEvent.type(screen.getByLabelText("Gehalt bis (€ im Jahr)"), "80000");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Das Minimum liegt über dem Maximum.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/datesForm.test.ts tests/unit/features/job/datesCard.test.tsx`
Expected: FAIL, unresolved `@/features/job/dates/*`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "dates.title": "Termine & Daten",
  "dates.edit": "Bearbeiten",
  "dates.save": "Speichern",
  "dates.date": "Datum",
  "dates.dateHint": "Ein gespeichertes Datum lässt sich ändern, aber nicht entfernen.",
  "dates.contacts": "Kontakte",
  "dates.recruiter": "Recruiter",
  "dates.salary": "Gehaltsrahmen",
  "dates.none": "–",
  "dates.addContact": "Kontakt hinzufügen",
  "dates.removeContact": "Kontakt {number} entfernen",
  "dates.contactName": "Name {number}",
  "dates.contactRole": "Rolle {number}",
  "dates.contactEmail": "E-Mail {number}",
  "dates.recruiterName": "Name des Recruiters",
  "dates.recruiterEmail": "E-Mail des Recruiters",
  "dates.recruiterPhone": "Telefon des Recruiters",
  "dates.salaryMin": "Gehalt von (€ im Jahr)",
  "dates.salaryMax": "Gehalt bis (€ im Jahr)",
  "dates.salaryNote": "Quelle oder Notiz zum Gehalt",
  "dates.salaryRange": "{min} – {max} €",
  "dates.saved": "Termine und Daten gespeichert.",
  "dates.problem.invalidDate": "Bitte ein gültiges Datum wählen.",
  "dates.problem.invalidEmail": "Bitte eine gültige E-Mail-Adresse eingeben.",
  "dates.problem.invalidAmount": "Bitte einen Betrag ohne Nachkommastellen eingeben.",
  "dates.problem.minAboveMax": "Das Minimum liegt über dem Maximum.",
```

`web/src/i18n/en.ts`:

```ts
  "dates.title": "Dates & details",
  "dates.edit": "Edit",
  "dates.save": "Save",
  "dates.date": "Date",
  "dates.dateHint": "A stored date can be changed but not removed.",
  "dates.contacts": "Contacts",
  "dates.recruiter": "Recruiter",
  "dates.salary": "Salary range",
  "dates.none": "–",
  "dates.addContact": "Add contact",
  "dates.removeContact": "Remove contact {number}",
  "dates.contactName": "Name {number}",
  "dates.contactRole": "Role {number}",
  "dates.contactEmail": "Email {number}",
  "dates.recruiterName": "Recruiter name",
  "dates.recruiterEmail": "Recruiter email",
  "dates.recruiterPhone": "Recruiter phone",
  "dates.salaryMin": "Salary from (€ per year)",
  "dates.salaryMax": "Salary up to (€ per year)",
  "dates.salaryNote": "Source or note on the salary",
  "dates.salaryRange": "{min} – {max} €",
  "dates.saved": "Dates and details saved.",
  "dates.problem.invalidDate": "Please pick a valid date.",
  "dates.problem.invalidEmail": "Please enter a valid email address.",
  "dates.problem.invalidAmount": "Please enter an amount without decimals.",
  "dates.problem.minAboveMax": "The minimum is above the maximum.",
```

- [ ] **Step 4: Implement `web/src/features/job/dates/datesForm.ts`**

```ts
import type { JobDetail, JobPatch } from "@/api/jobs";
import { fromDateInputValue, parseApiDate, toDateInputValue } from "@/domain/calendar";

export const MAX_CONTACTS = 10;

export interface ContactRow {
  name: string;
  role: string;
  email: string;
}

export interface DatesForm {
  date: string;
  contacts: ContactRow[];
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  salaryMin: string;
  salaryMax: string;
  salaryNote: string;
}

export type DatesField =
  | "date"
  | "recruiterEmail"
  | "salaryMin"
  | "salaryMax"
  | `contact.${number}.email`;
export type DatesProblem = "invalidDate" | "invalidEmail" | "invalidAmount" | "minAboveMax";
export type DatesProblems = Partial<Record<DatesField, DatesProblem>>;

const WHOLE_AMOUNT = /^\d+$/;
// Deliberately loose: the address is only shown and used as a mailto link.
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const amountText = (value?: number | null) => (value === null || value === undefined ? "" : String(value));

export function formFromJob(job: JobDetail): DatesForm {
  return {
    date: job.next_follow_up_at ? toDateInputValue(parseApiDate(job.next_follow_up_at)) : "",
    contacts: (job.contact_persons ?? []).map((contact) => ({ ...contact })),
    recruiterName: job.recruiter_info?.name ?? "",
    recruiterEmail: job.recruiter_info?.email ?? "",
    recruiterPhone: job.recruiter_info?.phone ?? "",
    salaryMin: amountText(job.salary_benchmark?.min),
    salaryMax: amountText(job.salary_benchmark?.max),
    salaryNote: job.salary_benchmark?.note ?? "",
  };
}

const badEmail = (value: string) => value.trim() !== "" && !EMAIL.test(value.trim());
const badAmount = (value: string) => value.trim() !== "" && !WHOLE_AMOUNT.test(value.trim());

export function validateDatesForm(form: DatesForm): DatesProblems {
  const problems: DatesProblems = {};
  if (form.date !== "" && fromDateInputValue(form.date) === null) problems.date = "invalidDate";
  form.contacts.forEach((contact, index) => {
    if (badEmail(contact.email)) problems[`contact.${index}.email`] = "invalidEmail";
  });
  if (badEmail(form.recruiterEmail)) problems.recruiterEmail = "invalidEmail";
  if (badAmount(form.salaryMin)) problems.salaryMin = "invalidAmount";
  if (badAmount(form.salaryMax)) problems.salaryMax = "invalidAmount";
  if (!problems.salaryMin && !problems.salaryMax && minAboveMax(form)) problems.salaryMax = "minAboveMax";
  return problems;
}

function minAboveMax(form: DatesForm): boolean {
  return form.salaryMin !== "" && form.salaryMax !== "" && Number(form.salaryMin) > Number(form.salaryMax);
}

const amountOf = (value: string): number | null => (value.trim() === "" ? null : Number(value.trim()));

/** One PATCH for the whole card; an empty date leaves the stored one untouched (backend gap G3). */
export function patchFromForm(form: DatesForm): JobPatch {
  const picked = form.date === "" ? null : fromDateInputValue(form.date);
  const patch: JobPatch = {
    contact_persons: form.contacts
      .map((contact) => ({ name: contact.name.trim(), role: contact.role.trim(), email: contact.email.trim() }))
      .filter((contact) => contact.name !== ""),
    recruiter_info: {
      name: form.recruiterName.trim(),
      email: form.recruiterEmail.trim(),
      phone: form.recruiterPhone.trim(),
    },
    salary_benchmark: { min: amountOf(form.salaryMin), max: amountOf(form.salaryMax), note: form.salaryNote.trim() },
  };
  return picked ? { ...patch, next_follow_up_at: picked.toISOString() } : patch;
}
```

- [ ] **Step 5: Implement the card and the drawer**

`web/src/features/job/dates/DatesCard.tsx`:

```tsx
"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useJobFormat } from "../format/useJobFormat";
import { DATE_LABEL } from "../labels";
import { DatesDrawer } from "./DatesDrawer";

const CARD_TITLE_ID = "dates-title";

/** Small "Termine & Daten" card under the next step (spec 4.2). */
export function DatesCard({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <section className="jd-card" aria-labelledby={CARD_TITLE_ID}>
      <div className="row-between">
        <h2 className="sec-title-sm" id={CARD_TITLE_ID}>
          {t("dates.title")}
        </h2>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
          {t("dates.edit")}
        </Button>
      </div>
      <DatesList job={job} />
      {editing ? <DatesDrawer job={job} onClose={() => setEditing(false)} /> : null}
    </section>
  );
}

function DatesList({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const none = t("dates.none");
  const salary = job.salary_benchmark;
  return (
    <dl className="kv kv-compact">
      <dt>{t(DATE_LABEL[phaseOf(job)] ?? "dates.date")}</dt>
      <dd className="num">{job.next_follow_up_at ? format.date(job.next_follow_up_at) : none}</dd>
      <dt>{t("dates.contacts")}</dt>
      <dd>{job.contact_persons?.length ? <ContactList contacts={job.contact_persons} /> : none}</dd>
      <dt>{t("dates.recruiter")}</dt>
      <dd>{[job.recruiter_info?.name, job.recruiter_info?.email, job.recruiter_info?.phone].filter(Boolean).join(" · ") || none}</dd>
      <dt>{t("dates.salary")}</dt>
      <dd className="num">{salary && (salary.min || salary.max) ? t("dates.salaryRange", { min: salary.min ?? none, max: salary.max ?? none }) : none}</dd>
    </dl>
  );
}

function ContactList({ contacts }: { contacts: NonNullable<JobDetail["contact_persons"]> }) {
  return (
    <ul className="plain-list">
      {contacts.map((contact, index) => (
        <li key={index}>
          {[contact.name, contact.role].filter(Boolean).join(", ")}
          {contact.email ? (
            <>
              {" · "}
              <a className="link" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

`web/src/features/job/dates/DatesDrawer.tsx`:

```tsx
"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { TextAreaField, TextField } from "@/ui/Field";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { DATE_LABEL } from "../labels";
import { usePatchJob } from "../next/useJobActions";
import {
  formFromJob,
  MAX_CONTACTS,
  patchFromForm,
  validateDatesForm,
  type ContactRow,
  type DatesField,
  type DatesForm,
  type DatesProblems,
} from "./datesForm";

type SetForm = (update: (form: DatesForm) => DatesForm) => void;

export function DatesDrawer({ job, onClose }: { job: JobDetail; onClose: () => void }) {
  const { t } = useI18n();
  const { form, setForm, submit, error } = useDatesSubmit(job, onClose);
  const fields = { form, setForm, error };
  return (
    <Drawer open onClose={onClose} label={t("dates.title")} variant="narrow">
      <form className="panel-in" onSubmit={submit}>
        <PanelHeader title={t("dates.title")} onClose={onClose} />
        <DateField job={job} {...fields} />
        <ContactRows contacts={form.contacts} setForm={setForm} error={error} />
        <RecruiterFields {...fields} />
        <SalaryFields {...fields} />
        <Button type="submit" variant="primary" className="mt-4">
          {t("dates.save")}
        </Button>
      </form>
    </Drawer>
  );
}

function useDatesSubmit(job: JobDetail, onClose: () => void) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => formFromJob(job));
  const [problems, setProblems] = useState<DatesProblems>({});
  const save = useSave(job, onClose);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateDatesForm(form);
    setProblems(found);
    if (Object.keys(found).length === 0) save(form);
  };
  const error = (field: DatesField) => {
    const problem = problems[field];
    return problem ? t(`dates.problem.${problem}`) : undefined;
  };
  return { form, setForm: setForm as SetForm, submit, error };
}

function DateField({ job, form, setForm, error }: FieldsProps & { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <TextField
      id="dates-date"
      type="date"
      label={t(DATE_LABEL[phaseOf(job)] ?? "dates.date")}
      hint={t("dates.dateHint")}
      value={form.date}
      error={error("date")}
      onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
    />
  );
}

function useSave(job: JobDetail, onClose: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const patch = usePatchJob(job);
  return (form: DatesForm) =>
    patch.mutate(patchFromForm(form), {
      onSuccess: () => {
        toast.show({ tone: "success", message: t("dates.saved") });
        onClose();
      },
    });
}

interface FieldsProps {
  form: DatesForm;
  setForm: SetForm;
  error: (field: DatesField) => string | undefined;
}

function ContactRows({ contacts, setForm, error }: { contacts: ContactRow[] } & Omit<FieldsProps, "form">) {
  const { t } = useI18n();
  const add = () => setForm((form) => ({ ...form, contacts: [...form.contacts, { name: "", role: "", email: "" }] }));
  return (
    <fieldset className="dates-group">
      <legend className="sec-title-sm">{t("dates.contacts")}</legend>
      {contacts.map((contact, index) => (
        <ContactFields key={index} index={index} contact={contact} setForm={setForm} error={error} />
      ))}
      {contacts.length < MAX_CONTACTS ? (
        <Button size="sm" icon={Plus} onClick={add}>
          {t("dates.addContact")}
        </Button>
      ) : null}
    </fieldset>
  );
}

interface ContactFieldsProps extends Omit<FieldsProps, "form"> {
  index: number;
  contact: ContactRow;
}

function ContactFields({ index, contact, setForm, error }: ContactFieldsProps) {
  const { t } = useI18n();
  const number = index + 1;
  const update = (patch: Partial<ContactRow>) =>
    setForm((form) => ({ ...form, contacts: form.contacts.map((row, at) => (at === index ? { ...row, ...patch } : row)) }));
  const remove = () => setForm((form) => ({ ...form, contacts: form.contacts.filter((_, at) => at !== index) }));
  return (
    <div className="dates-contact">
      <TextField id={`contact-${index}-name`} label={t("dates.contactName", { number })} value={contact.name} onChange={(event) => update({ name: event.target.value })} />
      <TextField id={`contact-${index}-role`} label={t("dates.contactRole", { number })} value={contact.role} onChange={(event) => update({ role: event.target.value })} />
      <TextField id={`contact-${index}-email`} type="email" label={t("dates.contactEmail", { number })} value={contact.email} error={error(`contact.${index}.email`)} onChange={(event) => update({ email: event.target.value })} />
      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t("dates.removeContact", { number })} onClick={remove} />
    </div>
  );
}

function RecruiterFields({ form, setForm, error }: FieldsProps) {
  const { t } = useI18n();
  const set = (key: "recruiterName" | "recruiterEmail" | "recruiterPhone") => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <fieldset className="dates-group">
      <legend className="sec-title-sm">{t("dates.recruiter")}</legend>
      <TextField id="recruiter-name" label={t("dates.recruiterName")} value={form.recruiterName} onChange={(event) => set("recruiterName")(event.target.value)} />
      <TextField id="recruiter-email" type="email" label={t("dates.recruiterEmail")} value={form.recruiterEmail} error={error("recruiterEmail")} onChange={(event) => set("recruiterEmail")(event.target.value)} />
      <TextField id="recruiter-phone" type="tel" label={t("dates.recruiterPhone")} value={form.recruiterPhone} onChange={(event) => set("recruiterPhone")(event.target.value)} />
    </fieldset>
  );
}

function SalaryFields({ form, setForm, error }: FieldsProps) {
  const { t } = useI18n();
  const set = (key: "salaryMin" | "salaryMax" | "salaryNote") => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <fieldset className="dates-group">
      <legend className="sec-title-sm">{t("dates.salary")}</legend>
      <TextField id="salary-min" inputMode="numeric" label={t("dates.salaryMin")} value={form.salaryMin} error={error("salaryMin")} onChange={(event) => set("salaryMin")(event.target.value)} />
      <TextField id="salary-max" inputMode="numeric" label={t("dates.salaryMax")} value={form.salaryMax} error={error("salaryMax")} onChange={(event) => set("salaryMax")(event.target.value)} />
      <TextAreaField id="salary-note" rows={2} label={t("dates.salaryNote")} value={form.salaryNote} onChange={(event) => set("salaryNote")(event.target.value)} />
    </fieldset>
  );
}
```

Mount it: in `JobPage.tsx` add `<DatesCard job={job} />` after `<NextStepCard job={job} />` inside the aside (import from `./dates/DatesCard`).

- [ ] **Step 6: CSS**

Append to `web/src/features/job/job.css`:

```css
  .jd-card {
    border-top: 2px solid var(--rule);
    padding-top: 10px;
  }
  .kv {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    gap: 0 24px;
  }
  .kv dt,
  .kv dd {
    padding: 12px 0;
    border-top: 1px solid var(--line);
    margin: 0;
    font-size: var(--fs-14);
  }
  .kv dt {
    font: 650 15px/1.35 var(--font-display);
    font-optical-sizing: auto;
  }
  .kv-compact {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0 12px;
  }
  .kv-compact dt,
  .kv-compact dd {
    padding: 8px 0;
    font-size: var(--fs-13);
  }
  .plain-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .dates-group {
    border: 0;
    margin: 18px 0 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .dates-contact {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    gap: 8px;
    align-items: end;
  }
  @media (max-width: 767px) {
    .kv {
      grid-template-columns: 1fr;
    }
    .kv dd {
      border-top: 0;
      padding-top: 0;
    }
    .dates-contact {
      grid-template-columns: 1fr;
    }
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (datesForm 9, datesCard 3).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 14: Passung tab (Passt/Lücken, full reasoning, posting text, re-analysis)

**Files:**
- Create: `web/src/features/job/fit/FitTab.tsx`, `web/src/features/job/TaskState.tsx`
- Modify: `web/src/features/job/tabs/JobTabs.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/fitTab.test.tsx`

**Interfaces:**
- Consumes: `parseFitReasoning` (Task 6); `Markdown`, `InlineText`, `Disclosure` (Task 8); `reanalyzeJob` (Task 2); `pendingTaskId`, `TaskPhase` (Task 7); `markTaskStarted`, `useTaskPhase` (Task 7); `roundScore`, `scoreBand`, `BAND_LABEL` (phase 1); `TAB_PANELS` (Task 9).
- Produces:
  - `FitTab({ job })`, registered as `TAB_PANELS.fit`.
  - `TaskState({ phase, runningText, onRetry })` (`@/features/job/TaskState`): shared running/stalled/failed line for background tasks (re-analysis here; interview prep, research and render later). Running shows a spinner and the text (`role="status"`); stalled and failed show a warning notice with "Erneut versuchen".
  - `useStartTask<T>(taskId, start: () => Promise<T>)` (same module): a mutation that marks the pending task and toasts errors; returns `{ run: () => void; pending: boolean }`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/fitTab.test.tsx`:

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId, STALL_AFTER_MS } from "@/domain/pendingTasks";
import { FitTab } from "@/features/job/fit/FitTab";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00Z");
const REASONING = `## Zusammenfassung
Du passt gut.
## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren
- Kafka
## Lücken & Herausforderungen
- Kein GCP
## Empfehlung
Bewirb dich.`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("FitTab", () => {
  it("lists what fits and what is missing", () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    expect(screen.getByRole("heading", { name: /Passt/ })).toHaveTextContent("2");
    expect(screen.getByRole("heading", { name: /Lücken/ })).toHaveTextContent("1");
    expect(screen.getByText("Kotlin").tagName).toBe("STRONG");
    expect(screen.getByText(/Du passt gut/)).toBeInTheDocument();
  });

  it("shows unknown reasoning formats as text", () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: "Passt gut, aber Gehalt unklar." })} />);
    expect(screen.getByText("Passt gut, aber Gehalt unklar.")).toBeInTheDocument();
  });

  it("keeps the posting text behind a disclosure", async () => {
    stubRoutes({});
    renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    await userEvent.click(screen.getByRole("button", { name: "Text der Stellenanzeige" }));
    expect(screen.getByText(/Plattform-Team/)).toBeVisible();
  });

  it("starts a first analysis and shows that it runs", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/analyze": { status: "started" } });
    renderWithProviders(<FitTab job={buildJob({ reasoning: null, match_score: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Jetzt bewerten" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText("Wird bewertet …")).toBeInTheDocument();
  });

  it("offers a retry when the analysis stalls", () => {
    stubRoutes({});
    const { queryClient } = renderWithProviders(<FitTab job={buildJob({ reasoning: REASONING })} />);
    act(() =>
      queryClient.setQueryData(queryKeys.pendingTasks, {
        [pendingTaskId.analysis("job-1")]: { startedAt: NOW.getTime() - STALL_AFTER_MS, failed: false },
      }),
    );
    expect(screen.getByText(/dauert ungewöhnlich lange/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/fitTab.test.tsx`
Expected: FAIL, unresolved `@/features/job/fit/FitTab`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "fit.passes": "Passt",
  "fit.gaps": "Lücken",
  "fit.recommendation": "Empfehlung",
  "fit.fullReasoning": "Vollständige Begründung",
  "fit.description": "Text der Stellenanzeige",
  "fit.noDescription": "Zu dieser Stelle ist kein Anzeigentext gespeichert.",
  "fit.none": "Keine Angaben.",
  "fit.noScoreTitle": "Noch keine Bewertung",
  "fit.noScoreText": "Die KI vergleicht die Anzeige mit deinem Profil und begründet die Passung.",
  "fit.scoreNow": "Jetzt bewerten",
  "fit.rescore": "Neu bewerten",
  "fit.running": "Wird bewertet …",
  "fit.provenance": "Bewertung durch die KI anhand deines Profils",
  "task.stalled": "Das dauert ungewöhnlich lange. Möglicherweise ist es fehlgeschlagen.",
  "task.failed": "Das hat nicht geklappt.",
```

`web/src/i18n/en.ts`:

```ts
  "fit.passes": "Fits",
  "fit.gaps": "Gaps",
  "fit.recommendation": "Recommendation",
  "fit.fullReasoning": "Full reasoning",
  "fit.description": "Text of the posting",
  "fit.noDescription": "No posting text is stored for this job.",
  "fit.none": "Nothing listed.",
  "fit.noScoreTitle": "Not scored yet",
  "fit.noScoreText": "The AI compares the posting with your profile and explains the fit.",
  "fit.scoreNow": "Score now",
  "fit.rescore": "Score again",
  "fit.running": "Scoring …",
  "fit.provenance": "Scored by the AI against your profile",
  "task.stalled": "This is taking unusually long. It may have failed.",
  "task.failed": "That did not work.",
```

(The stall test matches `/dauert ungewöhnlich lange/`; `error.retry` "Erneut versuchen" exists since phase 1.)

- [ ] **Step 4: Implement `web/src/features/job/TaskState.tsx`**

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { describeError } from "@/api/describeError";
import type { TaskPhase } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { useToast } from "@/ui/ToastProvider";

export interface TaskStateProps {
  phase: TaskPhase;
  runningText: string;
  onRetry: () => void;
}

/** Progress text for server tasks without cancel (spec 9: no client-only cancel; spec 4.3 #6). */
export function TaskState({ phase, runningText, onRetry }: TaskStateProps) {
  const { t } = useI18n();
  if (phase === "idle") return null;
  if (phase === "running") {
    return (
      <p className="task-line" role="status">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{runningText}</span>
      </p>
    );
  }
  return (
    <Notice tone="warn">
      {t(phase === "stalled" ? "task.stalled" : "task.failed")}{" "}
      <Button size="sm" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </Notice>
  );
}

/** Starts a server task and records it as pending; the matching realtime event ends it (Task 7). */
export function useStartTask<T>(taskId: string, start: () => Promise<T>, onStarted?: (result: T) => boolean) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: start,
    onSuccess: (result) => {
      // onStarted may report that nothing was started (e.g. "exists"), then nothing is pending.
      if (onStarted?.(result) ?? true) markTaskStarted(queryClient, taskId, Date.now());
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
  return { run: () => mutation.mutate(), pending: mutation.isPending };
}
```

- [ ] **Step 5: Implement `web/src/features/job/fit/FitTab.tsx`**

```tsx
"use client";

import { Check, RefreshCw, X, type LucideIcon } from "lucide-react";
import { reanalyzeJob, type JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { parseFitReasoning, type FitReasoning } from "@/domain/reasoning";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { Icon } from "@/ui/Icon";
import { InlineText, Markdown } from "@/ui/Markdown";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { TaskState, useStartTask } from "../TaskState";

/** Prototype tabFit: summary, Passt / Lücken, full reasoning, posting text, re-analysis. */
export function FitTab({ job }: { job: JobDetail }) {
  const fit = parseFitReasoning(job.reasoning);
  return (
    <div className="fit">
      {job.reasoning ? <FitBody job={job} fit={fit} /> : <NoScore job={job} />}
      <PostingText description={job.description} />
      {job.reasoning ? <Provenance job={job} /> : null}
    </div>
  );
}

function FitBody({ job, fit }: { job: JobDetail; fit: FitReasoning | null }) {
  const { t } = useI18n();
  if (!fit) return <Markdown source={job.reasoning ?? ""} />;
  return (
    <>
      <FitSummary score={job.match_score} summary={fit.summary} />
      <div className="fit-grid">
        <FitList title={t("fit.passes")} items={fit.strengths} icon={Check} tone="fit-ok" />
        <FitList title={t("fit.gaps")} items={fit.gaps} icon={X} tone="fit-gap" />
      </div>
      {fit.recommendation ? (
        <p className="fit-rec">
          <b>{t("fit.recommendation")}:</b> <InlineText text={fit.recommendation} />
        </p>
      ) : null}
      <div className="rationale">
        <Disclosure label={t("fit.fullReasoning")}>
          <Markdown source={job.reasoning ?? ""} />
        </Disclosure>
      </div>
    </>
  );
}

function FitSummary({ score, summary }: { score: number | null | undefined; summary: string }) {
  const { t } = useI18n();
  const shown = score === null || score === undefined ? null : roundScore(score);
  return (
    <p className="fit-summary">
      {shown === null ? null : (
        <>
          <b className="num">{shown}</b> · {t(BAND_LABEL[scoreBand(shown)])}.{" "}
        </>
      )}
      <InlineText text={summary} />
    </p>
  );
}

interface FitListProps {
  title: string;
  items: readonly string[];
  icon: LucideIcon;
  tone: "fit-ok" | "fit-gap";
}

function FitList({ title, items, icon, tone }: FitListProps) {
  const { t } = useI18n();
  return (
    <div className={tone}>
      <h3 className="sec-title-sm">
        {title} <span className="count-plain">{items.length}</span>
      </h3>
      <ul className="fit-list">
        {items.length === 0 ? <li>{t("fit.none")}</li> : null}
        {items.map((item, index) => (
          <li key={index}>
            <Icon icon={icon} />
            <span>
              <InlineText text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PostingText({ description }: { description?: string | null }) {
  const { t } = useI18n();
  return (
    <div className="rationale">
      <Disclosure label={t("fit.description")}>
        <p className="posting-text">{description || t("fit.noDescription")}</p>
      </Disclosure>
    </div>
  );
}

function useAnalysis(job: JobDetail) {
  const taskId = pendingTaskId.analysis(job.id);
  const task = useStartTask(taskId, () => reanalyzeJob(job.id));
  return { ...task, phase: useTaskPhase(taskId) };
}

function NoScore({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const analysis = useAnalysis(job);
  return (
    <div className="dim-panel">
      <h3>{t("fit.noScoreTitle")}</h3>
      <p>{t("fit.noScoreText")}</p>
      <TaskState phase={analysis.phase} runningText={t("fit.running")} onRetry={analysis.run} />
      {analysis.phase === "idle" ? (
        <div className="row">
          <Button busy={analysis.pending} onClick={analysis.run}>
            {t("fit.scoreNow")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Provenance({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const analysis = useAnalysis(job);
  return (
    <div className="provenance">
      <span>{t("fit.provenance")}</span>
      <TaskState phase={analysis.phase} runningText={t("fit.running")} onRetry={analysis.run} />
      {analysis.phase === "idle" ? (
        <Button size="sm" variant="ghost" icon={RefreshCw} busy={analysis.pending} onClick={analysis.run}>
          {t("fit.rescore")}
        </Button>
      ) : null}
    </div>
  );
}
```

Register it: in `web/src/features/job/tabs/JobTabs.tsx` import `FitTab` from `../fit/FitTab` and set `fit: FitTab` in `TAB_PANELS`.

- [ ] **Step 6: CSS**

Append to `web/src/features/job/job.css` (ported from the prototype's fit block):

```css
  .fit-summary {
    font: 400 clamp(19px, 2.8cqi, 24px) / 1.35 var(--font-display);
    font-optical-sizing: auto;
    letter-spacing: -0.012em;
    max-width: 44ch;
  }
  .fit-summary b {
    font-weight: 700;
  }
  .fit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 36px;
    margin-top: 30px;
  }
  .fit-grid > div > h3 {
    padding-top: 10px;
    border-top: 2px solid var(--rule);
  }
  .fit-list {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }
  .fit-list li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
    font-size: var(--fs-13);
  }
  .fit-list li:first-child {
    border-top: 0;
  }
  .fit-ok .ico {
    color: var(--accent-text);
  }
  .fit-gap .ico {
    color: var(--text-3);
  }
  .fit-rec {
    margin-top: 22px;
    max-width: 68ch;
    font-size: var(--fs-14);
  }
  .rationale {
    margin-top: 20px;
  }
  .posting-text {
    white-space: pre-line;
  }
  .provenance {
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    font-size: var(--fs-13);
    color: var(--text-3);
  }
  .task-line {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: var(--fs-13);
    color: var(--text-2);
  }
  @media (max-width: 767px) {
    .fit-grid {
      grid-template-columns: 1fr;
      gap: 22px;
    }
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (5 new fit tests).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 15: Unterlagen tab, part 1 (Bewerbungsmappe: generate, regenerate with notes, attach, cancel, errors)

**Files:**
- Create: `web/src/features/job/documents/DocumentsTab.tsx`, `web/src/features/job/documents/DocumentRow.tsx`, `web/src/features/job/documents/GenerationNote.tsx`, `web/src/features/job/documents/AttachProfileDocuments.tsx`
- Modify: `web/src/features/job/tabs/JobTabs.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/documentsTab.test.tsx`

**Interfaces:**
- Consumes: `useGeneration`, `GenerationRequest`, `generationProblem` (Task 11); `documentPresence` (Task 4); `isGenerating` (Task 4); `jobDocumentsQueryOptions`, `generatedDocument`, `DocumentKind`, `DOCUMENT_KINDS` (Task 3); `profileDocumentsQueryOptions` (Task 3); `usePendingTasks`, `pendingTaskId` (Task 7); `formatTime` (`@/i18n/formatTime`, phase 1); `CheckField`, `TextField` (Task 8); `DOCUMENT_LABEL` (Task 9); `useJobFormat` (Task 0).
- Produces:
  - `DocumentsTab({ job })` registered as `TAB_PANELS.documents`, with local state `attach: boolean` (Task 16 adds the preview column and its `preview: DocumentKind` state).
  - `DocumentRow({ job, kind, attach, actions? })` where `actions?: ReactNode` is extra row buttons (Task 16 adds download, Task 17 adds edit).
  - Verb family (usability #21): every generation entry point says "Erstellen" (nothing exists yet) or "Neu erstellen" (it exists); both open the same optional "Hinweis an die KI" field.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/documentsTab.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import type { RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CERT = { id: 1, doc_type: "CERTIFICATE", label: "AWS", original_filename: "aws.pdf" };

function show(job: JobDetail, profileDocuments: unknown[] = [CERT]): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [],
    "GET /profile/documents": profileDocuments,
    "PATCH /jobs/job-1": { status: "updated" },
    "POST /jobs/job-1/generate-package": { status: "started" },
    "POST /jobs/job-1/generate": { status: "started" },
    "POST /jobs/job-1/cancel-generation": { status: "cancelled" },
  });
  renderWithProviders(<DocumentsTab job={job} />);
  return calls;
}

const posted = (calls: RecordedCall[], path: string) =>
  calls.filter((call) => call.method !== "GET" && call.url.endsWith(path)).map((call) => JSON.parse(call.body ?? "null"));

describe("DocumentsTab", () => {
  it("creates both documents with the profile attachments", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    expect(screen.getAllByText("Nicht erstellt")).toHaveLength(2);
    expect(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Beide erstellen" }));
    await waitFor(() =>
      expect(posted(calls, "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: true, include_profile_documents: true },
      ]),
    );
  });

  it("leaves the attachments out when unticked", async () => {
    const calls = show(buildJob({ status: "DRAFTED" }));
    await userEvent.click(await screen.findByLabelText("Nachweise aus dem Profil anhängen (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Beide erstellen" }));
    await waitFor(() => expect(posted(calls, "/generate-package")[0].include_profile_documents).toBe(false));
  });

  it("regenerates the CV with a note", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true }));
    const row = screen.getByRole("group", { name: "Lebenslauf" });
    await userEvent.click(within(row).getByRole("button", { name: "Neu erstellen" }));
    await userEvent.type(within(row).getByLabelText("Hinweis an die KI (optional)"), "Führung betonen");
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    await waitFor(() => expect(posted(calls, "/jobs/job-1")).toEqual([{ cv_draft: "Führung betonen" }]));
    await waitFor(() =>
      expect(posted(calls, "/generate-package")).toEqual([
        { generate_cv: true, generate_letter: false, include_profile_documents: true },
      ]),
    );
  });

  it("creates the letter through /generate", async () => {
    const calls = show(buildJob({ status: "DRAFTED", cv_html_present: true }));
    const row = screen.getByRole("group", { name: "Anschreiben" });
    await userEvent.click(within(row).getByRole("button", { name: "Erstellen" }));
    await userEvent.click(within(row).getByRole("button", { name: "Jetzt erstellen" }));
    await waitFor(() => expect(posted(calls, "/generate")).toEqual([{ improvement_notes: null }]));
  });

  it("shows a running generation and cancels it", async () => {
    const calls = show(buildJob({ status: "GENERATING" }));
    expect(screen.getByText("Wird geschrieben und als PDF gesetzt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beide erstellen" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Erstellung abbrechen" }));
    await waitFor(() => expect(posted(calls, "/cancel-generation")).toHaveLength(1));
  });

  it("reports a failed generation without the server text", () => {
    show(buildJob({ status: "FAILED", generation_error: "openai.APIError 500" }));
    expect(screen.getByText("Die Unterlagen konnten nicht erstellt werden.")).toBeInTheDocument();
    expect(screen.queryByText(/APIError/)).not.toBeInTheDocument();
  });

  it("points to the profile when there is nothing to attach", async () => {
    show(buildJob({ status: "DRAFTED" }), []);
    expect(await screen.findByText("Keine Nachweise im Profil.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/documentsTab.test.tsx`
Expected: FAIL, unresolved `@/features/job/documents/DocumentsTab`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "docs.title": "Bewerbungsmappe",
  "docs.intro":
    "Beide Dokumente werden aus deinem Profil und der Stellenanzeige geschrieben und mit deiner Vorlage als PDF gesetzt.",
  "docs.createBoth": "Beide erstellen",
  "docs.recreateBoth": "Beide neu erstellen",
  "docs.create": "Erstellen",
  "docs.recreate": "Neu erstellen",
  "docs.createNow": "Jetzt erstellen",
  "docs.note": "Hinweis an die KI (optional)",
  "docs.notePlaceholder": "z. B. kürzer, Führung betonen",
  "docs.stateNone": "Nicht erstellt",
  "docs.stateReady": "Fertig · Probedruck vom {date}",
  "docs.stateReadyUndated": "Fertig",
  "docs.stateRunning": "Wird erstellt",
  "docs.running": "Wird geschrieben und als PDF gesetzt",
  "docs.startedAt": "gestartet um {time}",
  "docs.cancel": "Erstellung abbrechen",
  "docs.failed": "Die Unterlagen konnten nicht erstellt werden.",
  "docs.attach": "Nachweise aus dem Profil anhängen ({count})",
  "docs.attachNone": "Keine Nachweise im Profil.",
  "docs.attachManage": "Nachweise verwalten",
```

`web/src/i18n/en.ts`:

```ts
  "docs.title": "Application folder",
  "docs.intro":
    "Both documents are written from your profile and the posting and set as PDF with your template.",
  "docs.createBoth": "Create both",
  "docs.recreateBoth": "Create both again",
  "docs.create": "Create",
  "docs.recreate": "Create again",
  "docs.createNow": "Create now",
  "docs.note": "Note to the AI (optional)",
  "docs.notePlaceholder": "e.g. shorter, stress leadership",
  "docs.stateNone": "Not created",
  "docs.stateReady": "Ready · proof of {date}",
  "docs.stateReadyUndated": "Ready",
  "docs.stateRunning": "Being created",
  "docs.running": "Being written and set as PDF",
  "docs.startedAt": "started at {time}",
  "docs.cancel": "Cancel creation",
  "docs.failed": "The documents could not be created.",
  "docs.attach": "Attach certificates from the profile ({count})",
  "docs.attachNone": "No certificates in the profile.",
  "docs.attachManage": "Manage certificates",
```

- [ ] **Step 4: Implement the generation note and the attachment checkbox**

`web/src/features/job/documents/GenerationNote.tsx`:

```tsx
"use client";

import { LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { isGenerating } from "@/domain/jobStatus";
import { pendingTaskId } from "@/domain/pendingTasks";
import { formatTime } from "@/i18n/formatTime";
import { useI18n } from "@/i18n/useI18n";
import { usePendingTasks } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { generationProblem, useGeneration } from "./useGeneration";

/** Decision D7: honest progress text; cancel is offered because the server honours it (B10). */
export function GenerationNote({ job }: { job: JobDetail }) {
  if (isGenerating(job)) return <RunningNote job={job} />;
  if (job.status === "FAILED" || job.generation_error) return <FailedNote error={job.generation_error} />;
  return null;
}

function RunningNote({ job }: { job: JobDetail }) {
  const { t, language } = useI18n();
  const generation = useGeneration(job);
  const startedAt = usePendingTasks()[pendingTaskId.generation(job.id)]?.startedAt;
  return (
    <div className="gen-note" role="status">
      <Icon icon={LoaderCircle} className="spin" />
      <span>
        {t("docs.running")}
        {startedAt ? `, ${t("docs.startedAt", { time: formatTime(startedAt, language) })}` : null}
      </span>
      <Button size="sm" variant="ghost" icon={X} busy={generation.cancelling} onClick={generation.cancel}>
        {t("docs.cancel")}
      </Button>
    </div>
  );
}

function FailedNote({ error }: { error?: string | null }) {
  const { t } = useI18n();
  const profile = generationProblem(error) === "profileIncomplete";
  return (
    <Notice tone="error">
      {t(profile ? "next.profileIncomplete" : "docs.failed")}{" "}
      {profile ? (
        <Link className="link" href="/profile">
          {t("next.toProfile")}
        </Link>
      ) : null}
    </Notice>
  );
}
```

`web/src/features/job/documents/AttachProfileDocuments.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { profileDocumentsQueryOptions } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { CheckField } from "@/ui/Field";

const PROFILE_DOCUMENTS_HREF = "/profile?section=documents";

/** Certificates and references the package copies into the job (inventory A.9 / C.1). */
export function AttachProfileDocuments({ attach, onChange }: { attach: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  const documents = useQuery(profileDocumentsQueryOptions()).data;
  if (!documents) return null;
  if (documents.length === 0) {
    return (
      <p className="meta">
        {t("docs.attachNone")}{" "}
        <Link className="link" href={PROFILE_DOCUMENTS_HREF}>
          {t("docs.attachManage")}
        </Link>
      </p>
    );
  }
  return (
    <div className="attach">
      <CheckField id="attach-profile-documents" label={t("docs.attach", { count: documents.length })} checked={attach} onChange={onChange} />
      <p className="meta">{documents.map((document) => document.label || document.original_filename).join(", ")}</p>
    </div>
  );
}
```

- [ ] **Step 5: Implement the rows and the tab**

`web/src/features/job/documents/DocumentRow.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { generatedDocument, jobDocumentsQueryOptions, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { useJobFormat } from "../format/useJobFormat";
import { DOCUMENT_LABEL } from "../labels";
import { useGeneration, type GenerationRequest } from "./useGeneration";

export interface DocumentRowProps {
  job: JobDetail;
  kind: DocumentKind;
  attach: boolean;
  actions?: ReactNode;
}

/** Prototype renderDocRow: name, state, one verb family of actions (the preview has its own switch). */
export function DocumentRow({ job, kind, attach, actions }: DocumentRowProps) {
  const { t } = useI18n();
  const [noteOpen, setNoteOpen] = useState(false);
  const exists = documentPresence(job)[kind];
  const busy = isGenerating(job);
  return (
    <div className="docrow" role="group" aria-label={t(DOCUMENT_LABEL[kind])}>
      <div className="docrow-top">
        <Icon icon={busy ? LoaderCircle : FileText} className={busy ? "spin" : undefined} />
        <div>
          <span className="docrow-name">{t(DOCUMENT_LABEL[kind])}</span>
          <RowState job={job} kind={kind} />
        </div>
      </div>
      <div className="docrow-actions">
        <Button size="sm" icon={exists ? RefreshCw : undefined} disabled={busy} onClick={() => setNoteOpen(!noteOpen)}>
          {t(exists ? "docs.recreate" : "docs.create")}
        </Button>
        {actions}
      </div>
      {noteOpen && !busy ? <NotePanel job={job} kind={kind} attach={attach} onDone={() => setNoteOpen(false)} /> : null}
    </div>
  );
}

function RowState({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const document = generatedDocument(useQuery(jobDocumentsQueryOptions(job.id)).data ?? [], kind);
  const exists = documentPresence(job)[kind];
  let text = t("docs.stateNone");
  if (isGenerating(job)) text = t("docs.stateRunning");
  else if (exists && document?.uploaded_at) text = t("docs.stateReady", { date: format.dateTime(document.uploaded_at) });
  else if (exists) text = t("docs.stateReadyUndated");
  return (
    <div className="docrow-state" aria-live="polite">
      {text}
    </div>
  );
}

function requestFor(kind: DocumentKind, notes: string, attach: boolean): GenerationRequest {
  return kind === "cv" ? { kind: "cv", notes, includeProfileDocuments: attach } : { kind: "cover_letter", notes };
}

interface NotePanelProps {
  job: JobDetail;
  kind: DocumentKind;
  attach: boolean;
  onDone: () => void;
}

function NotePanel({ job, kind, attach, onDone }: NotePanelProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  const generation = useGeneration(job);
  const submit = () => {
    generation.start(requestFor(kind, notes, attach));
    onDone();
  };
  return (
    <div className="docrow-instr">
      <TextField id={`note-${kind}`} label={t("docs.note")} placeholder={t("docs.notePlaceholder")} value={notes} onChange={(event) => setNotes(event.target.value)} />
      <div className="row">
        <Button size="sm" variant="primary" busy={generation.starting} onClick={submit}>
          {t("docs.createNow")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("guard.cancel")}
        </Button>
      </div>
    </div>
  );
}
```

Note: `NotePanel` closes immediately after starting (`onDone`); the mutation keeps running inside `useGeneration`'s query-client-level mutation, so the request completes even though the panel unmounts (TanStack mutations are not cancelled on unmount; `onSuccess` callbacks defined in `useMutation` options still run).

`web/src/features/job/documents/DocumentsTab.tsx`:

```tsx
"use client";

import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DOCUMENT_KINDS } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence, documentsReady } from "@/domain/documents";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { AttachProfileDocuments } from "./AttachProfileDocuments";
import { DocumentRow } from "./DocumentRow";
import { GenerationNote } from "./GenerationNote";
import { useGeneration } from "./useGeneration";

/** Prototype tabDocs ("Bewerbungsmappe"): rows left, A4 preview right (Task 16), files below (Task 18). */
export function DocumentsTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [attach, setAttach] = useState(true);
  return (
    <div className="mappe">
      <div>
        <MappeHead job={job} attach={attach} />
        <p className="prose small">{t("docs.intro")}</p>
        <GenerationNote job={job} />
        {DOCUMENT_KINDS.map((kind) => (
          <DocumentRow key={kind} job={job} kind={kind} attach={attach} />
        ))}
        <AttachProfileDocuments attach={attach} onChange={setAttach} />
      </div>
    </div>
  );
}

function MappeHead({ job, attach }: { job: JobDetail; attach: boolean }) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const ready = documentsReady(documentPresence(job));
  return (
    <div className="mappe-head">
      <h3 className="sec-title">{t("docs.title")}</h3>
      <Button
        size="sm"
        icon={ready ? RefreshCw : FileText}
        disabled={isGenerating(job)}
        busy={generation.starting}
        onClick={() => generation.start({ kind: "both", includeProfileDocuments: attach })}
      >
        {t(ready ? "docs.recreateBoth" : "docs.createBoth")}
      </Button>
    </div>
  );
}
```

Register it: in `JobTabs.tsx` set `documents: DocumentsTab` (import from `../documents/DocumentsTab`).

- [ ] **Step 6: CSS**

Append to `web/src/features/job/job.css` (prototype `.mappe`, `.docrow*`):

```css
  .mappe {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }
  @container (min-width: 760px) {
    .mappe {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 440px);
      align-items: start;
    }
  }
  .mappe-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 10px;
    border-top: 2px solid var(--rule);
  }
  .mappe .prose.small {
    margin: 6px 0 14px;
  }
  .docrow {
    padding: 16px 0;
    border-top: 1px solid var(--line);
  }
  .docrow:last-of-type {
    border-bottom: 1px solid var(--line);
  }
  .docrow-top {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
  }
  .docrow-name {
    font: 650 18px/1.2 var(--font-display);
    font-optical-sizing: auto;
    color: var(--text);
  }
  .docrow-state {
    font-size: var(--fs-13);
    color: var(--text-2);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .docrow-actions,
  .docrow-instr {
    margin: 10px 0 0 32px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .docrow-instr {
    display: grid;
    gap: 8px;
  }
  .gen-note {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
    font-size: var(--fs-13);
  }
  .attach {
    margin-top: 14px;
  }
  @media (max-width: 767px) {
    .docrow-actions,
    .docrow-instr {
      margin-left: 0;
    }
    .docrow-actions .btn {
      min-height: 44px;
    }
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (7 new documents-tab tests).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 16: Unterlagen tab, part 2 (A4 PDF preview from a blob URL, preview switch, download)

**Files:**
- Create: `web/src/features/job/documents/useDocumentFile.ts`, `web/src/features/job/documents/DocumentPreview.tsx`, `web/src/features/job/documents/DownloadButton.tsx`
- Modify: `web/src/features/job/documents/DocumentsTab.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/documentPreview.test.tsx`

**Interfaces:**
- Consumes: `jobDocumentsQueryOptions`, `generatedDocument`, `documentVersion`, `viewJobDocument`, `downloadJobDocument`, `DocumentKind`, `DOCUMENT_KINDS` (Task 3); `queryKeys.jobFile` (Task 2); `A4Preview` (Task 8); `Seg` (phase 1); `saveFile`, `DRIVE_UNSUPPORTED` (Task 12); `isGenerating` (Task 4); `DOCUMENT_LABEL` (Task 9); `useJobFormat` (Task 0).
- Produces:
  - `useObjectUrl(blob?: Blob): string | null` — creates one object URL per blob and revokes it when the blob changes or the component unmounts (Review Focus 5).
  - `useDocumentFile(jobId, document?: JobDocument)` — TanStack query on `queryKeys.jobFile(jobId, id, version)` (stale forever; a re-render changes `uploaded_at` and therefore the key).
  - `DocumentPreview({ job, kind, onKindChange, editor? })` where `editor?: ReactNode` replaces the PDF on the sheet (Task 17).
  - `DownloadButton({ job, kind })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/documentPreview.test.tsx`:

```tsx
import { renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import { useObjectUrl } from "@/features/job/documents/useDocumentFile";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CV = { id: 4, original_filename: "Lebenslauf_ACME.pdf", file_size: 9, mime_type: "application/pdf", kind: "GENERATED_CV", uploaded_at: "2026-10-07T10:00:00Z" };
const LETTER = { ...CV, id: 5, original_filename: "Anschreiben_ACME.pdf", kind: "GENERATED_LETTER" };
const READY = buildJob({ status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true });
const pdf = () => new Response("%PDF-1.4", { headers: { "Content-Type": "application/pdf" } });
let urlCount = 0;

beforeEach(() => {
  urlCount = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:http://localhost/${(urlCount += 1)}`),
    revokeObjectURL: vi.fn(),
  });
});

function show(routes: Record<string, unknown> = {}) {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [CV, LETTER],
    "GET /profile/documents": [],
    "GET /jobs/job-1/documents/4/view": pdf,
    "GET /jobs/job-1/documents/5/view": pdf,
    "GET /jobs/job-1/documents/4/download": pdf,
    ...routes,
  });
  const view = renderWithProviders(<DocumentsTab job={READY} />);
  return { calls, ...view };
}

describe("DocumentPreview", () => {
  it("shows the CV PDF from a blob URL", async () => {
    const { container } = show();
    await waitFor(() => expect(container.querySelector("object")?.getAttribute("data")).toMatch(/^blob:/));
    expect(screen.getByText(/Probedruck vom/)).toBeInTheDocument();
  });

  it("switches to the letter with the preview seg", async () => {
    const { calls } = show();
    await userEvent.click(screen.getByRole("button", { name: "Anschreiben", pressed: false }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/documents/5/view"))).toBe(true));
  });

  it("explains that Drive files cannot be shown", async () => {
    show({ "GET /jobs/job-1/documents/4/view": jsonResponse(400, { detail: "Viewing Google Drive files in app is not yet implemented." }) });
    expect(await screen.findByText("Dateien aus Google Drive lassen sich hier noch nicht öffnen.")).toBeInTheDocument();
  });

  it("downloads the PDF", async () => {
    const { calls } = show();
    const [download] = screen.getAllByRole("button", { name: "PDF herunterladen" });
    await userEvent.click(download);
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/documents/4/download"))).toBe(true));
  });
});

describe("useObjectUrl", () => {
  it("revokes the previous URL when the blob changes and on unmount", () => {
    const first = new Blob(["a"]);
    const { result, rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: first as Blob | undefined },
    });
    const firstUrl = result.current;
    rerender({ blob: new Blob(["b"]) });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(result.current);
  });

  it("is null without a blob", () => {
    const { result } = renderHook(() => useObjectUrl(undefined));
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/documentPreview.test.tsx`
Expected: FAIL, unresolved `@/features/job/documents/useDocumentFile`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "preview.title": "Vorschau",
  "preview.switch": "Vorschau wählen",
  "preview.proof": "Probedruck vom {date}",
  "preview.noProof": "Noch kein Druck",
  "preview.setting": "Wird gesetzt",
  "preview.missing": "{doc} noch nicht erstellt",
  "preview.downloadPdf": "PDF herunterladen",
```

`web/src/i18n/en.ts`:

```ts
  "preview.title": "Preview",
  "preview.switch": "Choose preview",
  "preview.proof": "Proof of {date}",
  "preview.noProof": "No proof yet",
  "preview.setting": "Being set",
  "preview.missing": "{doc} not created yet",
  "preview.downloadPdf": "Download PDF",
```

- [ ] **Step 4: Implement `web/src/features/job/documents/useDocumentFile.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { documentVersion, viewJobDocument, type JobDocument } from "@/api/jobDocuments";
import { queryKeys } from "@/api/queryKeys";

// Unused PDF bytes leave memory after a minute; the key changes with every new version anyway.
const FILE_GC_MS = 60_000;

export function useDocumentFile(jobId: string, document?: JobDocument) {
  return useQuery({
    queryKey: queryKeys.jobFile(jobId, document?.id ?? -1, document ? documentVersion(document) : ""),
    queryFn: () => viewJobDocument(jobId, (document as JobDocument).id),
    enabled: document !== undefined,
    staleTime: Infinity,
    gcTime: FILE_GC_MS,
  });
}

/** One object URL per blob, revoked when the blob changes or the view goes away (decision D1). */
export function useObjectUrl(blob?: Blob): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
```

- [ ] **Step 5: Implement the preview and the download button**

`web/src/features/job/documents/DownloadButton.tsx`:

```tsx
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { describeError } from "@/api/describeError";
import { downloadJobDocument, generatedDocument, jobDocumentsQueryOptions, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import { DRIVE_UNSUPPORTED, saveFile } from "./saveFile";

export function DownloadButton({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const toast = useToast();
  const document = generatedDocument(useQuery(jobDocumentsQueryOptions(job.id)).data ?? [], kind);
  const download = useMutation({
    mutationFn: (target: NonNullable<typeof document>) => downloadJobDocument(job.id, target.id),
    onSuccess: (file, target) => saveFile(file, target.original_filename),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t, DRIVE_UNSUPPORTED) }),
  });
  if (!document) return null;
  return (
    <Button size="sm" icon={Download} busy={download.isPending} onClick={() => download.mutate(document)}>
      {t("preview.downloadPdf")}
    </Button>
  );
}
```

`web/src/features/job/documents/DocumentPreview.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describeError } from "@/api/describeError";
import { DOCUMENT_KINDS, generatedDocument, jobDocumentsQueryOptions, type DocumentKind, type JobDocument } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Notice } from "@/ui/Notice";
import { Seg } from "@/ui/Seg";
import { useJobFormat } from "../format/useJobFormat";
import { DOCUMENT_LABEL } from "../labels";
import { DRIVE_UNSUPPORTED } from "./saveFile";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";

export interface DocumentPreviewProps {
  job: JobDetail;
  kind: DocumentKind;
  onKindChange: (kind: DocumentKind) => void;
  /** Replaces the PDF while the HTML is edited (Task 17). */
  editor?: ReactNode;
  busy?: boolean;
}

/** Prototype renderPreview: the seg is the only preview switch (usability #21). */
export function DocumentPreview({ job, kind, onKindChange, editor, busy }: DocumentPreviewProps) {
  const { t } = useI18n();
  const options = DOCUMENT_KINDS.map((value) => ({ value, label: t(DOCUMENT_LABEL[value]) }));
  const document = generatedDocument(useQuery(jobDocumentsQueryOptions(job.id)).data ?? [], kind);
  return (
    <div>
      <div className="preview-head">
        <h3 className="sec-title-sm">{t("preview.title")}</h3>
        <Seg options={options} value={kind} onChange={onKindChange} label={t("preview.switch")} />
      </div>
      <PreviewSheet job={job} kind={kind} document={document} editor={editor} busy={busy || isGenerating(job)} />
    </div>
  );
}

interface PreviewSheetProps {
  job: JobDetail;
  kind: DocumentKind;
  document?: JobDocument;
  editor?: ReactNode;
  busy: boolean;
}

function PreviewSheet({ job, kind, document, editor, busy }: PreviewSheetProps) {
  const { t } = useI18n();
  const file = useDocumentFile(job.id, document);
  const pdfUrl = useObjectUrl(file.data?.blob);
  if (file.isError) return <Notice tone="error">{describeError(file.error, t, DRIVE_UNSUPPORTED)}</Notice>;
  return (
    <A4Preview
      title={t(DOCUMENT_LABEL[kind])}
      pdfUrl={pdfUrl}
      downloadName={document?.original_filename}
      slug={<ProofSlug document={document} busy={busy} />}
      emptyText={t("preview.missing", { doc: t(DOCUMENT_LABEL[kind]) })}
      busy={busy}
    >
      {editor}
    </A4Preview>
  );
}

function ProofSlug({ document, busy }: { document?: JobDocument; busy: boolean }) {
  const { t } = useI18n();
  const format = useJobFormat();
  let state = t("preview.noProof");
  if (busy) state = t("preview.setting");
  else if (document?.uploaded_at) state = t("preview.proof", { date: format.dateTime(document.uploaded_at) });
  return (
    <>
      <b>{state}</b>
      <span>{document?.original_filename ?? ""}</span>
    </>
  );
}
```

`A4Preview` renders `children` only when they are truthy, so `{editor}` being `undefined` shows the PDF.

- [ ] **Step 6: Wire the preview column and the download action**

Replace the body of `DocumentsTab` in `DocumentsTab.tsx` with the two-column version (add `import type { DocumentKind } from "@/api/jobDocuments";` next to the `DOCUMENT_KINDS` import, plus `DocumentPreview` and `DownloadButton` imports):

```tsx
export function DocumentsTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<DocumentKind>("cv");
  const [attach, setAttach] = useState(true);
  return (
    <div className="mappe">
      <div>
        <MappeHead job={job} attach={attach} />
        <p className="prose small">{t("docs.intro")}</p>
        <GenerationNote job={job} />
        {DOCUMENT_KINDS.map((kind) => (
          <DocumentRow key={kind} job={job} kind={kind} attach={attach} actions={<DownloadButton job={job} kind={kind} />} />
        ))}
        <AttachProfileDocuments attach={attach} onChange={setAttach} />
      </div>
      <DocumentPreview job={job} kind={preview} onKindChange={setPreview} />
    </div>
  );
}
```

Append to `web/src/features/job/job.css`:

```css
  .preview-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 8px;
    padding-top: 10px;
    border-top: 2px solid var(--rule);
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (6 new preview tests, Task 15 tests unchanged).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 17: Unterlagen tab, part 3 (edit the HTML on the sheet, save, re-render with progress)

**Files:**
- Create: `web/src/features/job/documents/editDocument.ts`, `web/src/features/job/documents/DocumentEditor.tsx`, `web/src/features/job/documents/useDocumentEdit.ts`, `web/src/features/job/documents/RenderStatus.tsx`
- Modify: `web/src/features/job/documents/DocumentsTab.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/editDocument.test.ts`, `web/tests/unit/features/job/documentEdit.test.tsx`

**Interfaces:**
- Consumes: `documentHtmlQueryOptions`, `saveDocumentHtml`, `renderDocument`, `DocumentKind` (Task 3); `queryKeys` (Task 2); `pendingTaskId`, `markTaskStarted`, `useTaskPhase` (Task 7); `TaskState` (Task 14); `DocumentPreview` with `editor` and `busy` (Task 16); `documentPresence`, `isGenerating` (Task 4).
- Produces:
  - `serializeDocument(doc: Document): string` (`<!DOCTYPE html>` + the root element's outer HTML).
  - `DocumentEditor({ html, title, frameRef })` — sandboxed `iframe srcdoc` (`sandbox="allow-same-origin"`, no scripts) with `designMode = "on"` after load (decision D9).
  - `useDocumentEdit(job): { editing: DocumentKind | null; start: (kind) => void; stop: () => void; frameRef; save: () => void; saving: boolean }`.
  - `RenderStatus({ job, kind })` — "PDF wird neu gesetzt …" while `render:<id>:<kind>` runs, warning with retry when it failed or stalled.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/editDocument.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { serializeDocument } from "@/features/job/documents/editDocument";

describe("serializeDocument", () => {
  it("keeps head styles and the edited body, with a doctype", () => {
    const doc = new DOMParser().parseFromString(
      "<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>alt</p></body></html>",
      "text/html",
    );
    doc.body.querySelector("p")!.textContent = "neu";
    const html = serializeDocument(doc);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>p{color:red}</style>");
    expect(html).toContain("<p>neu</p>");
  });
});
```

`web/tests/unit/features/job/documentEdit.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsTab } from "@/features/job/documents/DocumentsTab";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CV = { id: 4, original_filename: "Lebenslauf_ACME.pdf", file_size: 9, mime_type: "application/pdf", kind: "GENERATED_CV", uploaded_at: "2026-10-07T10:00:00Z" };
const READY = buildJob({ status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true });

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

function show() {
  return stubRoutes({
    "GET /jobs/job-1/documents": [CV],
    "GET /profile/documents": [],
    "GET /jobs/job-1/documents/4/view": () => new Response("%PDF-1.4"),
    "GET /jobs/job-1/documents/html": { html: "<html><body><p>alt</p></body></html>" },
    "PUT /jobs/job-1/documents/html": { ok: true },
    "POST /jobs/job-1/documents/render": { queued: true },
  });
}

describe("editing a document", () => {
  it("loads the stored HTML onto the sheet", async () => {
    show();
    renderWithProviders(<DocumentsTab job={READY} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    const frame = await screen.findByTitle("Lebenslauf bearbeiten");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("<p>alt</p>");
  });

  it("saves the edited HTML, asks for a render and shows the progress", async () => {
    const calls = show();
    renderWithProviders(<DocumentsTab job={READY} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    const frame = (await screen.findByTitle("Lebenslauf bearbeiten")) as HTMLIFrameElement;
    // jsdom does not load srcdoc; write the "edited" document directly.
    frame.contentDocument!.body.innerHTML = "<p>neu</p>";
    await userEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() => expect(calls.map((call) => call.method)).toEqual(expect.arrayContaining(["PUT", "POST"])));
    const put = calls.find((call) => call.method === "PUT");
    expect(JSON.parse(put?.body ?? "").html).toContain("<p>neu</p>");
    expect(await screen.findByText("PDF wird neu gesetzt …")).toBeInTheDocument();
  });

  it("discards the edit without saving", async () => {
    const calls = show();
    renderWithProviders(<DocumentsTab job={READY} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    await screen.findByTitle("Lebenslauf bearbeiten");
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(screen.queryByTitle("Lebenslauf bearbeiten")).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/editDocument.test.ts tests/unit/features/job/documentEdit.test.tsx`
Expected: FAIL, unresolved `@/features/job/documents/editDocument`; no "Bearbeiten" button.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "edit.start": "Bearbeiten",
  "edit.save": "Änderungen speichern",
  "edit.discard": "Verwerfen",
  "edit.hint": "Klicke in den Text, um ihn direkt zu ändern.",
  "edit.frameTitle": "{doc} bearbeiten",
  "edit.rendering": "PDF wird neu gesetzt …",
  "edit.saved": "Änderungen gespeichert. Das PDF wird neu gesetzt.",
```

`web/src/i18n/en.ts`:

```ts
  "edit.start": "Edit",
  "edit.save": "Save changes",
  "edit.discard": "Discard",
  "edit.hint": "Click into the text to change it directly.",
  "edit.frameTitle": "Edit {doc}",
  "edit.rendering": "PDF is being set again …",
  "edit.saved": "Changes saved. The PDF is being set again.",
```

- [ ] **Step 4: Implement serialisation, editor and render status**

`web/src/features/job/documents/editDocument.ts`:

```ts
const DOCTYPE = "<!DOCTYPE html>";

/** The edited document as the server stores it (cv_html / cover_letter_html). */
export function serializeDocument(doc: Document): string {
  return `${DOCTYPE}\n${doc.documentElement.outerHTML}`;
}
```

`web/src/features/job/documents/DocumentEditor.tsx`:

```tsx
"use client";

import type { RefObject } from "react";

export interface DocumentEditorProps {
  html: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
}

/**
 * Decision D9: the stored HTML on the sheet, editable in place. The sandbox allows no scripts, so
 * AI-generated markup cannot run; allow-same-origin only lets this page read the edited document.
 */
export function DocumentEditor({ html, title, frameRef }: DocumentEditorProps) {
  const enableEditing = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc) doc.designMode = "on";
  };
  return <iframe ref={frameRef} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={enableEditing} />;
}
```

`web/src/features/job/documents/RenderStatus.tsx`:

```tsx
"use client";

import type { DocumentKind } from "@/api/jobDocuments";
import { renderDocument } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { TaskState, useStartTask } from "../TaskState";

/** Progress of a PDF re-render; it ends with job_update {rendered_kind} (applyEvent). */
export function RenderStatus({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const taskId = pendingTaskId.render(job.id, kind);
  const phase = useTaskPhase(taskId);
  const retry = useStartTask(taskId, () => renderDocument(job.id, kind));
  return <TaskState phase={phase} runningText={t("edit.rendering")} onRetry={retry.run} />;
}

export function useRenderRunning(jobId: string, kind: DocumentKind): boolean {
  return useTaskPhase(pendingTaskId.render(jobId, kind)) === "running";
}
```

- [ ] **Step 5: Implement `web/src/features/job/documents/useDocumentEdit.ts`**

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { describeError } from "@/api/describeError";
import { renderDocument, saveDocumentHtml, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { useToast } from "@/ui/ToastProvider";
import { serializeDocument } from "./editDocument";

interface EditSave {
  kind: DocumentKind;
  html: string;
}

async function saveAndRender(jobId: string, edit: EditSave): Promise<void> {
  await saveDocumentHtml(jobId, edit.kind, edit.html);
  await renderDocument(jobId, edit.kind);
}

function useSaveEdit(job: JobDetail, onSaved: () => void) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (edit: EditSave) => saveAndRender(job.id, edit),
    onSuccess: (_result, edit) => {
      markTaskStarted(queryClient, pendingTaskId.render(job.id, edit.kind), Date.now());
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobDocumentHtml(job.id, edit.kind) });
      toast.show({ tone: "success", message: t("edit.saved") });
      onSaved();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** Edit -> PUT html -> POST render -> wait for job_update {rendered_kind} (inventory A.2). */
export function useDocumentEdit(job: JobDetail) {
  const [editing, setEditing] = useState<DocumentKind | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const saveEdit = useSaveEdit(job, () => setEditing(null));
  const save = () => {
    const doc = frameRef.current?.contentDocument;
    if (editing && doc) saveEdit.mutate({ kind: editing, html: serializeDocument(doc) });
  };
  return { editing, start: setEditing, stop: () => setEditing(null), frameRef, save, saving: saveEdit.isPending };
}
```

- [ ] **Step 6: Final `DocumentsTab.tsx`**

Replace the whole file with:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { documentHtmlQueryOptions, DOCUMENT_KINDS, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence, documentsReady } from "@/domain/documents";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { DOCUMENT_LABEL } from "../labels";
import { AttachProfileDocuments } from "./AttachProfileDocuments";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentRow } from "./DocumentRow";
import { DownloadButton } from "./DownloadButton";
import { GenerationNote } from "./GenerationNote";
import { RenderStatus, useRenderRunning } from "./RenderStatus";
import { useDocumentEdit } from "./useDocumentEdit";
import { useGeneration } from "./useGeneration";

type DocumentEdit = ReturnType<typeof useDocumentEdit>;

/** Prototype tabDocs ("Bewerbungsmappe"): rows left, the A4 proof right (spec 4.2 Unterlagen). */
export function DocumentsTab({ job }: { job: JobDetail }) {
  const [preview, setPreview] = useState<DocumentKind>("cv");
  const edit = useDocumentEdit(job);
  const startEdit = (kind: DocumentKind) => {
    setPreview(kind);
    edit.start(kind);
  };
  return (
    <div className="mappe">
      <MappeColumn job={job} onEdit={startEdit} />
      <PreviewColumn job={job} preview={preview} onPreview={setPreview} edit={edit} />
    </div>
  );
}

function MappeColumn({ job, onEdit }: { job: JobDetail; onEdit: (kind: DocumentKind) => void }) {
  const { t } = useI18n();
  const [attach, setAttach] = useState(true);
  return (
    <div>
      <MappeHead job={job} attach={attach} />
      <p className="prose small">{t("docs.intro")}</p>
      <GenerationNote job={job} />
      {DOCUMENT_KINDS.map((kind) => (
        <DocumentRow key={kind} job={job} kind={kind} attach={attach} actions={<RowActions job={job} kind={kind} onEdit={onEdit} />} />
      ))}
      <AttachProfileDocuments attach={attach} onChange={setAttach} />
    </div>
  );
}

function RowActions({ job, kind, onEdit }: { job: JobDetail; kind: DocumentKind; onEdit: (kind: DocumentKind) => void }) {
  const { t } = useI18n();
  const editable = documentPresence(job)[kind] && !isGenerating(job);
  return (
    <>
      {editable ? (
        <Button size="sm" icon={Pencil} onClick={() => onEdit(kind)}>
          {t("edit.start")}
        </Button>
      ) : null}
      <DownloadButton job={job} kind={kind} />
      <RenderStatus job={job} kind={kind} />
    </>
  );
}

interface PreviewColumnProps {
  job: JobDetail;
  preview: DocumentKind;
  onPreview: (kind: DocumentKind) => void;
  edit: DocumentEdit;
}

function PreviewColumn({ job, preview, onPreview, edit }: PreviewColumnProps) {
  const editing = edit.editing === preview;
  const rendering = useRenderRunning(job.id, preview);
  return (
    <div>
      <DocumentPreview
        job={job}
        kind={preview}
        onKindChange={onPreview}
        busy={rendering}
        editor={editing ? <EditorSheet job={job} kind={preview} edit={edit} /> : undefined}
      />
      {editing ? <EditBar edit={edit} /> : null}
    </div>
  );
}

function EditorSheet({ job, kind, edit }: { job: JobDetail; kind: DocumentKind; edit: DocumentEdit }) {
  const { t } = useI18n();
  const html = useQuery(documentHtmlQueryOptions(job.id, kind)).data;
  if (html === undefined) return <p className="pp-blank">{t("loading")}</p>;
  return <DocumentEditor html={html} title={t("edit.frameTitle", { doc: t(DOCUMENT_LABEL[kind]) })} frameRef={edit.frameRef} />;
}

function EditBar({ edit }: { edit: DocumentEdit }) {
  const { t } = useI18n();
  return (
    <div className="edit-bar">
      <Button size="sm" variant="primary" busy={edit.saving} onClick={edit.save}>
        {t("edit.save")}
      </Button>
      <Button size="sm" variant="ghost" onClick={edit.stop}>
        {t("edit.discard")}
      </Button>
      <span>{t("edit.hint")}</span>
    </div>
  );
}

function MappeHead({ job, attach }: { job: JobDetail; attach: boolean }) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const ready = documentsReady(documentPresence(job));
  return (
    <div className="mappe-head">
      <h3 className="sec-title">{t("docs.title")}</h3>
      <Button
        size="sm"
        icon={ready ? RefreshCw : FileText}
        disabled={isGenerating(job)}
        busy={generation.starting}
        onClick={() => generation.start({ kind: "both", includeProfileDocuments: attach })}
      >
        {t(ready ? "docs.recreateBoth" : "docs.createBoth")}
      </Button>
    </div>
  );
}
```

Note: `RenderStatus` renders nothing while idle, so the row only shows it during a render. The "Bearbeiten" button sits before "PDF herunterladen" in every row; the edit test takes the first "Bearbeiten" (the CV row).

Append to `web/src/features/job/job.css`:

```css
  .edit-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
    font-size: var(--fs-13);
    color: var(--text-2);
    flex-wrap: wrap;
  }
  .paper iframe {
    background: var(--paper);
    outline: 2px dashed var(--accent);
    outline-offset: 4px;
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (4 new edit tests; Tasks 15/16 tests still green).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 18: Unterlagen tab, part 4 (files: upload with validation, view, download, delete with confirm)

**Files:**
- Create: `web/src/features/job/documents/uploadRules.ts`, `web/src/features/job/documents/FilesSection.tsx`, `web/src/features/job/documents/FileViewer.tsx`
- Modify: `web/src/features/job/documents/DocumentsTab.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/uploadRules.test.ts`, `web/tests/unit/features/job/filesSection.test.tsx`

**Interfaces:**
- Consumes: `fetchJobDocuments` via `jobDocumentsQueryOptions`, `uploadJobDocument`, `deleteJobDocument`, `downloadJobDocument`, `JobDocument` (Task 3); `queryKeys` (Task 2); `useDocumentFile`, `useObjectUrl` (Task 16); `A4Preview` (Task 8); `saveFile`, `DRIVE_UNSUPPORTED` (Task 12); `Dialog`, `PanelHeader`, `Button`, `Notice` (phase 1).
- Produces:
  - `uploadRules.ts`: `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`, `ACCEPTED_UPLOAD_TYPES` (mirror of `server/routers/jobs.py::ALLOWED_MIME_TYPES`), `UPLOAD_ACCEPT` (the `accept` attribute), `type UploadProblem = "tooLarge" | "unsupportedType"`, `uploadProblem(file: { size: number; type: string }): UploadProblem | null`, `formatFileSize(bytes: number, language: Language): string`, `previewKind(mimeType?: string | null): "pdf" | "image" | null`.
  - `FilesSection({ job })` rendered at the end of the Mappe column.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/uploadRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatFileSize, MAX_UPLOAD_BYTES, previewKind, uploadProblem } from "@/features/job/documents/uploadRules";

describe("uploadProblem", () => {
  it("accepts a PDF up to 10 MB", () => {
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES, type: "application/pdf" })).toBeNull();
  });

  it("rejects a file over 10 MB", () => {
    expect(uploadProblem({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toBe("tooLarge");
  });

  it("rejects a type the server refuses", () => {
    expect(uploadProblem({ size: 1, type: "application/zip" })).toBe("unsupportedType");
    expect(uploadProblem({ size: 1, type: "" })).toBe("unsupportedType");
  });
});

describe("formatFileSize", () => {
  it.each([
    [900, "900 B"],
    [52_000, "51 KB"],
    [3_500_000, "3,3 MB"],
  ])("%i bytes read %s", (bytes, text) => {
    expect(formatFileSize(bytes, "de")).toBe(text);
  });
});

describe("previewKind", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["image/png", "image"],
    ["text/plain", null],
    [null, null],
  ])("%s -> %s", (mime, kind) => {
    expect(previewKind(mime)).toBe(kind);
  });
});
```

`web/tests/unit/features/job/filesSection.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilesSection } from "@/features/job/documents/FilesSection";
import type { RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const UPLOAD = { id: 9, original_filename: "zeugnis.png", file_size: 52_000, mime_type: "image/png", kind: "UPLOADED", uploaded_at: "2026-10-07T10:00:00Z" };
const CV = { ...UPLOAD, id: 4, original_filename: "Lebenslauf_ACME.pdf", mime_type: "application/pdf", kind: "GENERATED_CV" };
const user = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

function show(): RecordedCall[] {
  const calls = stubRoutes({
    "GET /jobs/job-1/documents": [UPLOAD, CV],
    "POST /jobs/job-1/documents": { id: 10 },
    "DELETE /jobs/job-1/documents/9": { status: "deleted" },
    "GET /jobs/job-1/documents/9/view": () => new Response("png", { headers: { "Content-Type": "image/png" } }),
  });
  renderWithProviders(<FilesSection job={buildJob()} />);
  return calls;
}

describe("FilesSection", () => {
  it("lists every file with its kind and size", async () => {
    show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Hochgeladen");
    expect(row).toHaveTextContent("51 KB");
    expect(screen.getByText("Lebenslauf_ACME.pdf").closest("li")).toHaveTextContent("Lebenslauf (erstellt)");
  });

  it("uploads an allowed file", async () => {
    const calls = show();
    await user.upload(await screen.findByLabelText("Datei hochladen"), new File(["%PDF"], "referenz.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
  });

  it("rejects a file over 10 MB before uploading", async () => {
    const calls = show();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "gross.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Datei hochladen"), big);
    expect(screen.getByText("gross.pdf ist größer als 10 MB.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("rejects an unsupported type before uploading", async () => {
    const calls = show();
    await user.upload(await screen.findByLabelText("Datei hochladen"), new File(["x"], "a.zip", { type: "application/zip" }));
    expect(screen.getByText(/a.zip: Dieser Dateityp wird nicht unterstützt/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("deletes only after confirming", async () => {
    const calls = show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png löschen" }));
    const dialog = screen.getByRole("dialog", { name: "Datei löschen?" });
    await user.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
  });

  it("shows an image in the viewer", async () => {
    show();
    const row = (await screen.findByText("zeugnis.png")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "zeugnis.png ansehen" }));
    expect(await screen.findByRole("img", { name: "zeugnis.png" })).toHaveAttribute("src", "blob:x");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/uploadRules.test.ts tests/unit/features/job/filesSection.test.tsx`
Expected: FAIL, unresolved modules.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "files.title": "Dateien",
  "files.upload": "Datei hochladen",
  "files.uploadHint": "PDF, Word, Bild oder Text, höchstens 10 MB.",
  "files.empty": "Noch keine Dateien zu dieser Stelle.",
  "files.tooLarge": "{name} ist größer als 10 MB.",
  "files.unsupportedType": "{name}: Dieser Dateityp wird nicht unterstützt.",
  "files.uploaded": "{name} hochgeladen.",
  "files.view": "{name} ansehen",
  "files.download": "{name} herunterladen",
  "files.delete": "{name} löschen",
  "files.deleteTitle": "Datei löschen?",
  "files.deleteText": "{name} wird endgültig gelöscht.",
  "files.deleteConfirm": "Löschen",
  "files.deleted": "{name} gelöscht.",
  "files.noPreview": "Für diesen Dateityp gibt es keine Vorschau. Lade die Datei herunter.",
  "files.kind.UPLOADED": "Hochgeladen",
  "files.kind.GENERATED_CV": "Lebenslauf (erstellt)",
  "files.kind.GENERATED_LETTER": "Anschreiben (erstellt)",
  "files.kind.ATTACHED_CERT": "Zertifikat aus dem Profil",
  "files.kind.ATTACHED_REFERENCE": "Referenz aus dem Profil",
  "files.kind.other": "Datei",
```

`web/src/i18n/en.ts`:

```ts
  "files.title": "Files",
  "files.upload": "Upload file",
  "files.uploadHint": "PDF, Word, image or text, at most 10 MB.",
  "files.empty": "No files for this job yet.",
  "files.tooLarge": "{name} is larger than 10 MB.",
  "files.unsupportedType": "{name}: This file type is not supported.",
  "files.uploaded": "{name} uploaded.",
  "files.view": "View {name}",
  "files.download": "Download {name}",
  "files.delete": "Delete {name}",
  "files.deleteTitle": "Delete file?",
  "files.deleteText": "{name} will be deleted permanently.",
  "files.deleteConfirm": "Delete",
  "files.deleted": "{name} deleted.",
  "files.noPreview": "There is no preview for this file type. Download the file.",
  "files.kind.UPLOADED": "Uploaded",
  "files.kind.GENERATED_CV": "CV (generated)",
  "files.kind.GENERATED_LETTER": "Cover letter (generated)",
  "files.kind.ATTACHED_CERT": "Certificate from the profile",
  "files.kind.ATTACHED_REFERENCE": "Reference from the profile",
  "files.kind.other": "File",
```

- [ ] **Step 4: Implement `web/src/features/job/documents/uploadRules.ts`**

```ts
import type { MessageKey } from "@/i18n/de";
import type { Language } from "@/i18n/languages";

// Mirror of server/routers/jobs.py ALLOWED_MIME_TYPES and MAX_FILE_SIZE (413/415 otherwise).
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
export const UPLOAD_ACCEPT = ACCEPTED_UPLOAD_TYPES.join(",");

export type UploadProblem = "tooLarge" | "unsupportedType";

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const KNOWN_KINDS = new Set(["UPLOADED", "GENERATED_CV", "GENERATED_LETTER", "ATTACHED_CERT", "ATTACHED_REFERENCE"]);

/** Checked before the request, so the user gets a sentence about the file instead of a failed upload. */
export function uploadProblem(file: { size: number; type: string }): UploadProblem | null {
  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) return "unsupportedType";
  return file.size > MAX_UPLOAD_BYTES ? "tooLarge" : null;
}

export function formatFileSize(bytes: number, language: Language): string {
  if (bytes < KILOBYTE) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${Math.round(bytes / KILOBYTE)} KB`;
  const megabytes = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / MEGABYTE);
  return `${megabytes} MB`;
}

export function previewKind(mimeType?: string | null): "pdf" | "image" | null {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType?.startsWith("image/") ? "image" : null;
}

export function fileKindLabel(kind: string): MessageKey {
  return KNOWN_KINDS.has(kind) ? (`files.kind.${kind}` as MessageKey) : "files.kind.other";
}
```

(`fileKindLabel` is also exported; `FilesSection` uses it.)

- [ ] **Step 5: Implement the viewer and the section**

`web/src/features/job/documents/FileViewer.tsx`:

```tsx
"use client";

import { describeError } from "@/api/describeError";
import type { JobDocument } from "@/api/jobDocuments";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { DRIVE_UNSUPPORTED } from "./saveFile";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";
import { previewKind } from "./uploadRules";

/** PDF on the A4 sheet, images as images (inventory B.4 JobDocumentsTab viewer); others download only. */
export function FileViewer({ jobId, document, onClose }: { jobId: string; document: JobDocument; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} label={document.original_filename}>
      <div className="panel-in">
        <PanelHeader title={document.original_filename} onClose={onClose} />
        <ViewerBody jobId={jobId} document={document} />
      </div>
    </Dialog>
  );
}

function ViewerBody({ jobId, document }: { jobId: string; document: JobDocument }) {
  const { t } = useI18n();
  const kind = previewKind(document.mime_type);
  const file = useDocumentFile(jobId, kind ? document : undefined);
  const url = useObjectUrl(file.data?.blob);
  if (!kind) return <p className="prose">{t("files.noPreview")}</p>;
  if (file.isError) return <Notice tone="error">{describeError(file.error, t, DRIVE_UNSUPPORTED)}</Notice>;
  if (!url) return <p className="prose">{t("loading")}</p>;
  if (kind === "image") return <img className="file-image" src={url} alt={document.original_filename} />;
  return <A4Preview title={document.original_filename} pdfUrl={url} downloadName={document.original_filename} slug={null} />;
}
```

`web/src/features/job/documents/FilesSection.tsx`:

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { describeError } from "@/api/describeError";
import {
  deleteJobDocument,
  downloadJobDocument,
  jobDocumentsQueryOptions,
  uploadJobDocument,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { useJobFormat } from "../format/useJobFormat";
import { FileViewer } from "./FileViewer";
import { DRIVE_UNSUPPORTED, saveFile } from "./saveFile";
import { fileKindLabel, formatFileSize, previewKind, UPLOAD_ACCEPT, uploadProblem } from "./uploadRules";

const UPLOAD_INPUT_ID = "job-file-upload";

/** Inventory B.4 JobDocumentsTab "Files": upload, list, view, download, delete (with confirm now). */
export function FilesSection({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const [viewing, setViewing] = useState<JobDocument | null>(null);
  const [deleting, setDeleting] = useState<JobDocument | null>(null);
  return (
    <section className="files" aria-labelledby="files-title">
      <h3 className="sec-title-sm" id="files-title">
        {t("files.title")}
      </h3>
      <UploadControl job={job} />
      {documents.length === 0 ? <p className="meta">{t("files.empty")}</p> : null}
      <ul className="file-list">
        {documents.map((document) => (
          <FileRow key={document.id} job={job} document={document} onView={setViewing} onDelete={setDeleting} />
        ))}
      </ul>
      {viewing ? <FileViewer jobId={job.id} document={viewing} onClose={() => setViewing(null)} /> : null}
      {deleting ? <DeleteDialog job={job} document={deleting} onClose={() => setDeleting(null)} /> : null}
    </section>
  );
}

function useInvalidateDocuments(jobId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.jobDocuments(jobId) });
}

function UploadControl({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const toast = useToast();
  const refresh = useInvalidateDocuments(job.id);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadJobDocument(job.id, file),
    onSuccess: (_result, file) => {
      refresh();
      toast.show({ tone: "success", message: t("files.uploaded", { name: file.name }) });
    },
    onError: (error) => setProblem(describeError(error, t)),
  });
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const found = uploadProblem(file);
    setProblem(found ? t(`files.${found}`, { name: file.name }) : null);
    if (!found) upload.mutate(file);
  };
  return (
    <div className="upload">
      <label className="btn btn-sm" htmlFor={UPLOAD_INPUT_ID}>
        <Icon icon={Upload} />
        <span>{t("files.upload")}</span>
      </label>
      <input id={UPLOAD_INPUT_ID} className="sr-only" type="file" accept={UPLOAD_ACCEPT} aria-describedby="upload-hint" onChange={onChange} />
      <p className="meta" id="upload-hint">{t("files.uploadHint")}</p>
      {problem ? <Notice tone="error">{problem}</Notice> : null}
    </div>
  );
}

interface FileRowProps {
  job: JobDetail;
  document: JobDocument;
  onView: (document: JobDocument) => void;
  onDelete: (document: JobDocument) => void;
}

function FileRow({ job, document, onView, onDelete }: FileRowProps) {
  const { t, language } = useI18n();
  const format = useJobFormat();
  const name = document.original_filename;
  const meta = [
    t(fileKindLabel(document.kind)),
    document.file_size ? formatFileSize(document.file_size, language) : null,
    document.uploaded_at ? format.date(document.uploaded_at) : null,
  ].filter(Boolean);
  return (
    <li className="file-row">
      <div>
        <div className="file-name">{name}</div>
        <div className="meta">{meta.join(" · ")}</div>
      </div>
      <div className="row">
        {previewKind(document.mime_type) ? (
          <Button size="sm" variant="ghost" iconOnly icon={Eye} aria-label={t("files.view", { name })} onClick={() => onView(document)} />
        ) : null}
        <FileDownload job={job} document={document} />
        <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t("files.delete", { name })} onClick={() => onDelete(document)} />
      </div>
    </li>
  );
}

function FileDownload({ job, document }: { job: JobDetail; document: JobDocument }) {
  const { t } = useI18n();
  const toast = useToast();
  const download = useMutation({
    mutationFn: () => downloadJobDocument(job.id, document.id),
    onSuccess: (file) => saveFile(file, document.original_filename),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t, DRIVE_UNSUPPORTED) }),
  });
  const name = document.original_filename;
  return (
    <Button size="sm" variant="ghost" iconOnly icon={Download} busy={download.isPending} aria-label={t("files.download", { name })} onClick={() => download.mutate()} />
  );
}

function DeleteDialog({ job, document, onClose }: { job: JobDetail; document: JobDocument; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const refresh = useInvalidateDocuments(job.id);
  const name = document.original_filename;
  const remove = useMutation({
    mutationFn: () => deleteJobDocument(job.id, document.id),
    onSuccess: () => {
      refresh();
      toast.show({ message: t("files.deleted", { name }) });
      onClose();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
  return (
    <Dialog open onClose={onClose} label={t("files.deleteTitle")}>
      <div className="panel-in">
        <PanelHeader title={t("files.deleteTitle")} onClose={onClose} />
        <p className="prose">{t("files.deleteText", { name })}</p>
        <div className="row panel-actions">
          <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
            {t("files.deleteConfirm")}
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

`UploadControl` and `DeleteDialog` cross 20 lines after formatting; split each mutation into a hook (`useUpload(job, setProblem)`, `useDeleteFile(job, document, onClose)`) in the same file before the checkpoint, keeping the components render-only.

The file label works as the upload button: it is focusable through the input (`.sr-only` keeps the input in the tab order) and the label text is its accessible name ("Datei hochladen"). Add a visible focus ring for the label when the input is focused (CSS below).

Mount: in `DocumentsTab.tsx`, render `<FilesSection job={job} />` as the last child of `MappeColumn` (import from `./FilesSection`).

- [ ] **Step 6: CSS**

Append to `web/src/features/job/job.css`:

```css
  .files {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 2px solid var(--rule);
    display: grid;
    gap: 12px;
  }
  .upload {
    display: grid;
    gap: 6px;
    justify-items: start;
  }
  /* The real input is visually hidden; show its focus on the label that acts as the button. */
  .upload:has(input:focus-visible) label {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .file-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .file-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .file-image {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    margin: 0 auto;
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (uploadRules 10, filesSection 6).

- [ ] **Step 8: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green. (`@next/next/no-img-element` would warn on `<img>`: the image is a local `blob:` URL that `next/image` cannot optimise. Add the justified suppression on that line: `{/* eslint-disable-next-line @next/next/no-img-element -- blob: URL of a private file; next/image cannot load it */}`.)

---
### Task 19: Firma tab (company domain, research start/refresh, profile view, deep dives)

**Files:**
- Create: `web/src/features/job/company/companyDomain.ts`, `web/src/features/job/company/CompanyTab.tsx`, `web/src/features/job/company/CompanyDomainForm.tsx`, `web/src/features/job/company/CompanyProfileView.tsx`, `web/src/features/job/company/DeepDiveList.tsx`
- Modify: `web/src/features/job/tabs/JobTabs.tsx`, `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/companyDomain.test.ts`, `web/tests/unit/features/job/companyTab.test.tsx`

**Interfaces:**
- Consumes: `companyQueryOptions`, `startCompanyResearch`, `runDeepDive`, `CompanyProfile`, `DeepDive` (Task 3); `patchJob` via `usePatchJob` (Task 11); `resourceLinks` (Task 6); `pendingTaskId`, `useTaskPhase` (Task 7); `TaskState`, `useStartTask` (Task 14); `Markdown`, `Disclosure` (Task 8); `Tag` (phase 1); `useJobFormat` (Task 0).
- Produces:
  - `normalizeDomain(input: string): string | null` (`https://www.acme.de/karriere` -> `acme.de`; null when it is not a host name).
  - `CompanyTab({ job })` registered as `TAB_PANELS.company`.
  - `CompanyProfileView({ profile })` (reused by `/companies` in phase 7), `DeepDiveList({ domain, companyName, jobTitle, items })` (reused by the Interview tab, Task 20).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/companyDomain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/features/job/company/companyDomain";

describe("normalizeDomain", () => {
  it.each([
    ["acme.de", "acme.de"],
    ["https://www.acme.de/karriere?x=1", "acme.de"],
    ["  ACME.DE ", "acme.de"],
    ["jobs.acme.co.uk", "jobs.acme.co.uk"],
  ])("%s -> %s", (input, domain) => {
    expect(normalizeDomain(input)).toBe(domain);
  });

  it.each(["", "acme", "acme gmbh", "http://", "javascript:alert(1)"])("rejects %s", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});
```

`web/tests/unit/features/job/companyTab.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompanyTab } from "@/features/job/company/CompanyTab";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PROFILE = {
  domain: "acme.de",
  name: "ACME GmbH",
  executive_summary: { assessment: "Solider Mittelständler.", confidence: "Moderate", suitable_for: ["Backend"], not_suitable_for: [] },
  analysis: [{ area: "Kultur", assessment: "Offen und direkt.", confidence: "Low" }],
  key_insights: null,
  risks: [{ title: "Fluktuation", probability: "Medium", impact: "High", description: "Viele Wechsel." }],
  market_comparison: null,
  deep_dive_buttons: [{ title: "Gehalt", focus: "Gehaltsband", how_to_proceed: "Portale", why_it_matters: "Verhandlung" }],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T10:00:00Z",
};
const notFound = () => jsonResponse(404, { detail: "Company profile not found" });
const bodies = (calls: RecordedCall[], suffix: string) =>
  calls.filter((call) => call.method !== "GET" && call.url.endsWith(suffix)).map((call) => JSON.parse(call.body ?? "null"));

describe("CompanyTab", () => {
  it("asks for the company's web address once and starts the research", async () => {
    const calls = stubRoutes({
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(screen.getByLabelText("Web-Adresse der Firma"), "https://www.acme.de/jobs");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() => expect(bodies(calls, "/jobs/job-1")).toEqual([{ company_domain: "acme.de" }]));
    await waitFor(() => expect(bodies(calls, "/analyze")).toEqual([{ force_refresh: false }]));
  });

  it("rejects something that is not a web address", async () => {
    const calls = stubRoutes({});
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(screen.getByLabelText("Web-Adresse der Firma"), "ACME GmbH");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    expect(screen.getByText("Bitte eine Web-Adresse wie acme.de eingeben.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("starts the research and shows that it runs", async () => {
    stubRoutes({
      "GET /companies/acme.de": notFound,
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Firma recherchieren" }));
    expect(await screen.findByText(/Firmenrecherche läuft/)).toBeInTheDocument();
  });

  it("shows the profile with sections and refreshes it on request", async () => {
    const calls = stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("Solider Mittelständler.")).toBeInTheDocument();
    expect(screen.getByText("Fluktuation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://acme.de/karriere" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Alle Firmen" })).toHaveAttribute("href", "/companies?domain=acme.de");
    await userEvent.click(screen.getByRole("button", { name: "Neu recherchieren" }));
    await waitFor(() => expect(bodies(calls, "/analyze")).toEqual([{ force_refresh: true }]));
  });

  it("runs a deep dive and shows its result", async () => {
    stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": { result: "## Ergebnis\n- 75 bis 90 k" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    expect(await screen.findByText("75 bis 90 k")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/companyDomain.test.ts tests/unit/features/job/companyTab.test.tsx`
Expected: FAIL, unresolved modules.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "company.domainLabel": "Web-Adresse der Firma",
  "company.domainHint": "Die Recherche braucht die Web-Adresse, z. B. acme.de. Sie wird für diese Stelle gespeichert.",
  "company.domainInvalid": "Bitte eine Web-Adresse wie acme.de eingeben.",
  "company.domainPlaceholder": "acme.de",
  "company.changeDomain": "Web-Adresse ändern",
  "company.research": "Firma recherchieren",
  "company.refresh": "Neu recherchieren",
  "company.running": "Firmenrecherche läuft. Das dauert meist unter einer Minute, du kannst weiterarbeiten.",
  "company.emptyTitle": "Noch keine Recherche zu {company}",
  "company.emptyText":
    "Die KI fasst Lage, Kultur, Risiken und Marktposition zusammen. Das Anschreiben und die Interview-Vorbereitung nutzen diese Punkte.",
  "company.stamp": "Recherchiert am {date} · {domain}",
  "company.all": "Alle Firmen",
  "company.summary": "Gesamtbewertung",
  "company.confidence": "Sicherheit: {level}",
  "company.suitable": "Passt zu dir",
  "company.notSuitable": "Passt weniger",
  "company.analysis": "Detailanalyse",
  "company.evidence": "Grundlage",
  "company.uncertainty": "Offene Frage",
  "company.insights": "Erkenntnisse",
  "company.facts": "Fakten",
  "company.interpretations": "Deutungen",
  "company.uncertainties": "Unklar",
  "company.risks": "Risiken",
  "company.riskLevel": "Wahrscheinlichkeit: {probability} · Auswirkung: {impact}",
  "company.market": "Marktvergleich",
  "company.deepDives": "Tiefenrecherche",
  "company.sources": "Quellen",
  "company.whyItMatters": "Warum wichtig",
  "company.howToProceed": "Vorgehen",
  "company.runDeepDive": "Jetzt recherchieren",
  "company.restartDeepDive": "Neu starten",
  "company.deepDiveRunning": "Recherchiert …",
  "company.notSet": "–",
```

`web/src/i18n/en.ts`:

```ts
  "company.domainLabel": "Company web address",
  "company.domainHint": "The research needs the web address, e.g. acme.de. It is stored for this job.",
  "company.domainInvalid": "Please enter a web address like acme.de.",
  "company.domainPlaceholder": "acme.com",
  "company.changeDomain": "Change web address",
  "company.research": "Research company",
  "company.refresh": "Research again",
  "company.running": "Company research is running. It usually takes less than a minute; you can keep working.",
  "company.emptyTitle": "No research on {company} yet",
  "company.emptyText":
    "The AI summarises the situation, culture, risks and market position. The cover letter and the interview preparation use these points.",
  "company.stamp": "Researched on {date} · {domain}",
  "company.all": "All companies",
  "company.summary": "Overall assessment",
  "company.confidence": "Confidence: {level}",
  "company.suitable": "Suits you",
  "company.notSuitable": "Suits you less",
  "company.analysis": "Detailed analysis",
  "company.evidence": "Basis",
  "company.uncertainty": "Open question",
  "company.insights": "Insights",
  "company.facts": "Facts",
  "company.interpretations": "Interpretations",
  "company.uncertainties": "Unclear",
  "company.risks": "Risks",
  "company.riskLevel": "Probability: {probability} · Impact: {impact}",
  "company.market": "Market comparison",
  "company.deepDives": "Deep dives",
  "company.sources": "Sources",
  "company.whyItMatters": "Why it matters",
  "company.howToProceed": "Approach",
  "company.runDeepDive": "Research now",
  "company.restartDeepDive": "Start over",
  "company.deepDiveRunning": "Researching …",
  "company.notSet": "–",
```

- [ ] **Step 4: Implement `web/src/features/job/company/companyDomain.ts`**

```ts
const PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;
const WWW_PREFIX = /^www\./;
// Host names only: labels of letters, digits and hyphens, at least one dot, a letter TLD.
const HOST_NAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.acme.de/karriere" -> "acme.de"; null when the input is not a web address. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(PROTOCOL, "");
  const host = withoutProtocol.split(/[/?#]/)[0].replace(WWW_PREFIX, "");
  return HOST_NAME.test(host) ? host : null;
}
```

- [ ] **Step 5: Implement the domain form, the deep dives and the profile view**

`web/src/features/job/company/CompanyDomainForm.tsx`:

```tsx
"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { startCompanyResearch } from "@/api/companies";
import { describeError } from "@/api/describeError";
import type { JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { usePatchJob } from "../next/useJobActions";
import { normalizeDomain } from "./companyDomain";

async function startResearch(queryClient: QueryClient, domain: string): Promise<void> {
  if ((await startCompanyResearch(domain, false)) === "queued") {
    markTaskStarted(queryClient, pendingTaskId.research(domain), Date.now());
  }
}

/** Decision D11: company_domain is never set by the server (G7); ask once, store it, research. */
export function CompanyDomainForm({ job, onDone }: { job: JobDetail; onDone?: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(job.company_domain ?? "");
  const [error, setError] = useState<string | undefined>();
  const patch = usePatchJob(job);
  const research = (domain: string) =>
    startResearch(queryClient, domain)
      .then(onDone)
      .catch((failure: unknown) => toast.show({ tone: "error", message: describeError(failure, t) }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const domain = normalizeDomain(value);
    if (!domain) return setError(t("company.domainInvalid"));
    patch.mutate({ company_domain: domain }, { onSuccess: () => void research(domain) });
  };
  return (
    <form className="company-domain" onSubmit={submit}>
      <TextField id="company-domain" label={t("company.domainLabel")} hint={t("company.domainHint")} placeholder={t("company.domainPlaceholder")} value={value} error={error} onChange={(event) => setValue(event.target.value)} />
      <Button type="submit" icon={Building2} busy={patch.isPending}>
        {t("company.research")}
      </Button>
    </form>
  );
}
```

After the PATCH succeeds the job refetches with the new domain, `CompanyTab` switches to the research view, and its query of `/companies/<domain>` shows the result once `company_profile_ready` arrives.

`web/src/features/job/company/DeepDiveList.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { runDeepDive, type DeepDive } from "@/api/companies";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { Markdown } from "@/ui/Markdown";
import { Notice } from "@/ui/Notice";

export interface DeepDiveListProps {
  domain: string;
  companyName: string;
  jobTitle: string;
  items: readonly DeepDive[];
}

/** CompanyProfileView "Tiefenrecherche": synchronous AI call per item; the result is not stored (A.6). */
export function DeepDiveList({ domain, companyName, jobTitle, items }: DeepDiveListProps) {
  return (
    <ol className="deep-dives">
      {items.map((item, index) => (
        <li key={index}>
          <Disclosure label={item.title}>
            <DeepDiveItem domain={domain} context={{ companyName, jobTitle }} item={item} />
          </Disclosure>
        </li>
      ))}
    </ol>
  );
}

interface DeepDiveItemProps {
  domain: string;
  context: { companyName: string; jobTitle: string };
  item: DeepDive;
}

function DeepDiveItem({ domain, context, item }: DeepDiveItemProps) {
  const { t, language } = useI18n();
  const run = useMutation({
    mutationFn: () =>
      runDeepDive(domain, { focus: item.focus, howToProceed: item.how_to_proceed, companyName: context.companyName, title: context.jobTitle, language }),
  });
  return (
    <div className="deep-dive">
      <p>{item.focus}</p>
      {item.why_it_matters ? <p className="meta">{t("company.whyItMatters")}: {item.why_it_matters}</p> : null}
      {run.data ? <Markdown source={run.data} /> : null}
      {run.isError ? <Notice tone="error">{describeError(run.error, t)}</Notice> : null}
      <Button size="sm" busy={run.isPending} onClick={() => (run.data ? run.reset() : run.mutate())}>
        {t(run.data ? "company.restartDeepDive" : "company.runDeepDive")}
      </Button>
    </div>
  );
}
```

`web/src/features/job/company/CompanyProfileView.tsx`:

```tsx
"use client";

import type { CompanyAnalysis, CompanyProfile, CompanyRisk } from "@/api/companies";
import { resourceLinks } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { Tag } from "@/ui/Tag";

/** Inventory "CompanyProfileView": every section only when present, in the Editorial kv style. */
export function CompanyProfileView({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="company-profile">
      <SummarySection profile={profile} />
      <AnalysisSection areas={profile.analysis} />
      <InsightsSection profile={profile} />
      <RisksSection risks={profile.risks} />
      <MarketSection profile={profile} />
      <SourcesSection value={profile.online_resources} />
    </div>
  );
}

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul className="plain-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function SummarySection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const summary = profile.executive_summary;
  if (!summary) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.summary")}</h3>
      {summary.assessment ? <p className="prose">{summary.assessment}</p> : null}
      {summary.confidence ? <Tag>{t("company.confidence", { level: summary.confidence })}</Tag> : null}
      <dl className="kv">
        <dt>{t("company.suitable")}</dt>
        <dd>{summary.suitable_for.length ? <TextList items={summary.suitable_for} /> : t("company.notSet")}</dd>
        <dt>{t("company.notSuitable")}</dt>
        <dd>{summary.not_suitable_for.length ? <TextList items={summary.not_suitable_for} /> : t("company.notSet")}</dd>
      </dl>
    </section>
  );
}

function AnalysisSection({ areas }: { areas: readonly CompanyAnalysis[] }) {
  const { t } = useI18n();
  if (areas.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.analysis")}</h3>
      {areas.map((area, index) => (
        <Disclosure key={index} label={area.area}>
          {area.assessment ? <p>{area.assessment}</p> : null}
          {area.evidence_basis ? <p className="meta">{t("company.evidence")}: {area.evidence_basis}</p> : null}
          {area.key_uncertainty ? <p className="meta">{t("company.uncertainty")}: {area.key_uncertainty}</p> : null}
        </Disclosure>
      ))}
    </section>
  );
}

function InsightsSection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const insights = profile.key_insights;
  if (!insights) return null;
  const groups = [
    ["company.facts", insights.facts],
    ["company.interpretations", insights.interpretations],
    ["company.uncertainties", insights.uncertainties],
  ] as const;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.insights")}</h3>
      <dl className="kv">
        {groups.filter(([, items]) => items.length > 0).map(([key, items]) => (
          <div key={key} className="kv-row">
            <dt>{t(key)}</dt>
            <dd><TextList items={items} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RisksSection({ risks }: { risks: readonly CompanyRisk[] }) {
  const { t } = useI18n();
  if (risks.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.risks")}</h3>
      <ul className="prep-list">
        {risks.map((risk, index) => (
          <li key={index}>
            <div className="prep-q">{risk.title}</div>
            <div className="meta">{t("company.riskLevel", { probability: risk.probability ?? "–", impact: risk.impact ?? "–" })}</div>
            {risk.description ? <div className="prep-a">{risk.description}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketSection({ profile }: { profile: CompanyProfile }) {
  const { t } = useI18n();
  const market = profile.market_comparison;
  if (!market) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.market")}</h3>
      {market.summary ? <p className="prose">{market.summary}</p> : null}
      <ul className="prep-list">
        {market.comparison_points.map((point, index) => (
          <li key={index}>
            <div className="prep-q">{[point.dimension, point.relative_position].filter(Boolean).join(": ")}</div>
            {point.comment ? <div className="prep-a">{point.comment}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourcesSection({ value }: { value: unknown }) {
  const { t } = useI18n();
  const links = resourceLinks(value);
  if (links.length === 0) return null;
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.sources")}</h3>
      <ul className="plain-list">
        {links.map((link) => (
          <li key={link}>
            <a className="link code" href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`<div>` inside `<dl>` grouping `dt`/`dd` is valid HTML; give `.kv-row` `display: contents` in CSS so the grid layout of `.kv` keeps working.

- [ ] **Step 6: Implement `web/src/features/job/company/CompanyTab.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { companyQueryOptions, startCompanyResearch, type CompanyProfile } from "@/api/companies";
import type { JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { useJobFormat } from "../format/useJobFormat";
import { TaskState, useStartTask } from "../TaskState";
import { CompanyDomainForm } from "./CompanyDomainForm";
import { CompanyProfileView } from "./CompanyProfileView";
import { DeepDiveList } from "./DeepDiveList";

/** Prototype tabCompany: research start/refresh with live state (company_profile_ready). */
export function CompanyTab({ job }: { job: JobDetail }) {
  const [changingDomain, setChangingDomain] = useState(false);
  if (!job.company_domain || changingDomain) {
    return <CompanyDomainForm job={job} onDone={() => setChangingDomain(false)} />;
  }
  return <CompanyResearch job={job} domain={job.company_domain} onChangeDomain={() => setChangingDomain(true)} />;
}

function useResearch(domain: string, force: boolean) {
  const taskId = pendingTaskId.research(domain);
  const task = useStartTask(taskId, () => startCompanyResearch(domain, force), (started) => started === "queued");
  return { ...task, phase: useTaskPhase(taskId) };
}

interface ResearchProps {
  job: JobDetail;
  domain: string;
  onChangeDomain: () => void;
}

function CompanyResearch({ job, domain, onChangeDomain }: ResearchProps) {
  const { t } = useI18n();
  const company = useQuery(companyQueryOptions(domain));
  if (company.isPending) return <p className="meta">{t("loading")}</p>;
  if (!company.data) return <NoResearch job={job} domain={domain} />;
  return (
    <>
      <CompanyProfileView profile={company.data} />
      <section className="prep-sec">
        <h3 className="sec-title-sm">{t("company.deepDives")}</h3>
        <DeepDiveList domain={domain} companyName={job.company ?? domain} jobTitle={job.title ?? ""} items={company.data.deep_dive_buttons} />
      </section>
      <ResearchStamp profile={company.data} domain={domain} onChangeDomain={onChangeDomain} />
    </>
  );
}

function NoResearch({ job, domain }: { job: JobDetail; domain: string }) {
  const { t } = useI18n();
  const research = useResearch(domain, false);
  return (
    <div className="dim-panel">
      <h3>{t("company.emptyTitle", { company: job.company ?? domain })}</h3>
      <p>{t("company.emptyText")}</p>
      <TaskState phase={research.phase} runningText={t("company.running")} onRetry={research.run} />
      {research.phase === "idle" ? (
        <div className="row">
          <Button icon={Building2} busy={research.pending} onClick={research.run}>
            {t("company.research")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ResearchStamp({ profile, domain, onChangeDomain }: { profile: CompanyProfile; domain: string; onChangeDomain: () => void }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const research = useResearch(domain, true);
  return (
    <div className="ai-stamp">
      {profile.analyzed_at ? <span>{t("company.stamp", { date: format.dateTime(profile.analyzed_at), domain })}</span> : null}
      <TaskState phase={research.phase} runningText={t("company.running")} onRetry={research.run} />
      {research.phase === "idle" ? (
        <Button size="sm" variant="ghost" icon={RefreshCw} busy={research.pending} onClick={research.run}>
          {t("company.refresh")}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onChangeDomain}>
        {t("company.changeDomain")}
      </Button>
      <Link className="link" href={`/companies?domain=${encodeURIComponent(domain)}`}>
        {t("company.all")}
      </Link>
    </div>
  );
}
```

`useStartTask` takes the third argument `onStarted` (Task 14): a research that answers `"exists"` starts nothing, so nothing is marked pending. Register the tab: `company: CompanyTab` in `TAB_PANELS`.

- [ ] **Step 7: CSS**

Append to `web/src/features/job/job.css`:

```css
  .company-domain {
    display: grid;
    gap: 12px;
    max-width: 460px;
    justify-items: start;
  }
  .prep-sec + .prep-sec {
    margin-top: 30px;
  }
  .prep-sec > h3 {
    padding-top: 10px;
    border-top: 2px solid var(--rule);
    margin-bottom: 10px;
  }
  .prep-list {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }
  .prep-list li {
    padding: 12px 0;
    border-top: 1px solid var(--line);
    font-size: var(--fs-14);
  }
  .prep-list li:first-child {
    border-top: 0;
  }
  .prep-q {
    font-weight: 600;
  }
  .prep-a {
    color: var(--text-2);
    margin-top: 3px;
  }
  .kv-row {
    display: contents;
  }
  .deep-dives {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .deep-dives > li {
    border-top: 1px solid var(--line);
    padding: 6px 0;
  }
  .deep-dive {
    display: grid;
    gap: 8px;
    justify-items: start;
  }
  .ai-stamp {
    font-size: var(--fs-13);
    color: var(--text-3);
    margin-top: 18px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (companyDomain 9, companyTab 5).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 20: Interview tab (prep generate/regenerate, live state, rendered prep)

**Files:**
- Create: `web/src/features/job/interview/InterviewTab.tsx`, `web/src/features/job/interview/InterviewPrepView.tsx`
- Modify: `web/src/features/job/tabs/JobTabs.tsx`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/interviewTab.test.tsx`

**Interfaces:**
- Consumes: `parseInterviewPrep`, `InterviewPrep` (Task 6); `startInterviewPrep` (Task 2); `pendingTaskId`, `useTaskPhase` (Task 7); `TaskState`, `useStartTask` (Task 14); `DeepDiveList` (Task 19); `Markdown` (Task 8); `resourceLinks` (Task 6); `Tag`, `Notice` (phase 1); `phaseOf` (Task 4); `useJobFormat` (Task 0).
- Produces: `InterviewTab({ job })` registered as `TAB_PANELS.interview`; `InterviewPrepView({ job, prep })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/interviewTab.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterviewTab } from "@/features/job/interview/InterviewTab";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PREP = JSON.stringify({
  report_output: { executive_summary: "Gute Ausgangslage.", deep_dive_analysis: "Mehr Tiefe." },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Systeme.",
    gap_analysis: [{ requirement: "GCP", cv_status: "fehlt", gap_severity: "High", interview_strategy: "AWS-Erfahrung übertragen" }],
  },
  deep_dive_buttons: [],
  confidence_assessment: { overall_confidence: "Moderate", uncertainties: ["Budget"] },
});
const QUEUED = { status: "queued", message: "", job_id: "job-1" };

describe("InterviewTab", () => {
  it("creates a preparation and shows that it runs", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/interview-prep": QUEUED });
    renderWithProviders(<InterviewTab job={buildJob({ status: "INTERVIEW" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Vorbereitung erstellen" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
  });

  it("renders the preparation", () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: PREP, next_follow_up_at: "2026-10-12T08:00:00Z" })} />,
    );
    expect(screen.getByText("Gute Ausgangslage.")).toBeInTheDocument();
    expect(screen.getByText("Ich baue robuste Systeme.")).toBeInTheDocument();
    expect(screen.getByText("GCP")).toBeInTheDocument();
    expect(screen.getByText("AWS-Erfahrung übertragen")).toBeInTheDocument();
    expect(screen.getByText(/Termin:/)).toHaveTextContent("12.10.");
  });

  it("regenerates on request", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/interview-prep/regenerate": QUEUED });
    renderWithProviders(<InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: PREP })} />);
    await userEvent.click(screen.getByRole("button", { name: "Neu erstellen" }));
    await waitFor(() => expect(calls[0].url).toContain("/interview-prep/regenerate"));
  });

  it("offers a new attempt when the stored preparation is unreadable", async () => {
    stubRoutes({});
    renderWithProviders(<InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: "{kaputt" })} />);
    expect(screen.getByText("Die gespeicherte Vorbereitung ließ sich nicht lesen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neu erstellen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/interviewTab.test.tsx`
Expected: FAIL, unresolved `@/features/job/interview/InterviewTab`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "prep.emptyTitle": "Noch keine Vorbereitung",
  "prep.emptyText":
    "Erstellt eine Einschätzung deiner Ausgangslage, deinen Elevator Pitch, Strategien für Lücken und Rückfragen an {company}.",
  "prep.create": "Vorbereitung erstellen",
  "prep.recreate": "Neu erstellen",
  "prep.running": "Vorbereitung wird erstellt …",
  "prep.unreadable": "Die gespeicherte Vorbereitung ließ sich nicht lesen.",
  "prep.appointment": "Termin: {date}",
  "prep.summary": "Deine Ausgangslage",
  "prep.pitch": "Elevator Pitch",
  "prep.gaps": "Lücken und Strategie",
  "prep.cvStatus": "Im Lebenslauf: {status}",
  "prep.severity": "Gewicht: {level}",
  "prep.depth": "Vertiefung",
  "prep.contacts": "Mögliche Ansprechpartner",
  "prep.confidence": "Sicherheit der Einschätzung: {level}",
  "prep.uncertainties": "Offene Punkte",
  "prep.stamp": "KI-Vorbereitung",
```

`web/src/i18n/en.ts`:

```ts
  "prep.emptyTitle": "No preparation yet",
  "prep.emptyText":
    "Creates an assessment of your position, your elevator pitch, strategies for gaps and questions to ask {company}.",
  "prep.create": "Create preparation",
  "prep.recreate": "Create again",
  "prep.running": "Preparation is being created …",
  "prep.unreadable": "The stored preparation could not be read.",
  "prep.appointment": "Appointment: {date}",
  "prep.summary": "Your position",
  "prep.pitch": "Elevator pitch",
  "prep.gaps": "Gaps and strategy",
  "prep.cvStatus": "In your CV: {status}",
  "prep.severity": "Weight: {level}",
  "prep.depth": "In depth",
  "prep.contacts": "Possible contacts",
  "prep.confidence": "Confidence of the assessment: {level}",
  "prep.uncertainties": "Open points",
  "prep.stamp": "AI preparation",
```

The test "regenerates on request" looks for "Neu erstellen"; the Unterlagen tab uses the same German words ("docs.recreate"), which is the one verb family on purpose.

- [ ] **Step 4: Implement the tab and the view**

`web/src/features/job/interview/InterviewTab.tsx`:

```tsx
"use client";

import { MessageSquare, RefreshCw } from "lucide-react";
import { startInterviewPrep, type JobDetail } from "@/api/jobs";
import { parseInterviewPrep } from "@/domain/interviewPrep";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { TaskState, useStartTask } from "../TaskState";
import { InterviewPrepView } from "./InterviewPrepView";

function usePrep(job: JobDetail, regenerate: boolean) {
  const taskId = pendingTaskId.prep(job.id);
  const task = useStartTask(taskId, () => startInterviewPrep(job.id, regenerate), (started) => started === "queued");
  return { ...task, phase: useTaskPhase(taskId) };
}

/** Prototype tabInterview; ends with interview_prep_ready (no polling, inventory C.2). */
export function InterviewTab({ job }: { job: JobDetail }) {
  const parsed = parseInterviewPrep(job.interview_prep_material);
  if (parsed.kind === "none") return <NoPrep job={job} />;
  return (
    <>
      {parsed.kind === "prep" ? <InterviewPrepView job={job} prep={parsed.prep} /> : <UnreadablePrep />}
      <RegenerateStamp job={job} />
    </>
  );
}

function NoPrep({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const prep = usePrep(job, false);
  return (
    <div className="dim-panel">
      <h3>{t("prep.emptyTitle")}</h3>
      <p>{t("prep.emptyText", { company: job.company ?? "" })}</p>
      <TaskState phase={prep.phase} runningText={t("prep.running")} onRetry={prep.run} />
      {prep.phase === "idle" ? (
        <div className="row">
          <Button icon={MessageSquare} busy={prep.pending} onClick={prep.run}>
            {t("prep.create")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function UnreadablePrep() {
  const { t } = useI18n();
  return <Notice tone="warn">{t("prep.unreadable")}</Notice>;
}

function RegenerateStamp({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const prep = usePrep(job, true);
  return (
    <div className="ai-stamp">
      <span>{t("prep.stamp")}</span>
      <TaskState phase={prep.phase} runningText={t("prep.running")} onRetry={prep.run} />
      {prep.phase === "idle" ? (
        <Button size="sm" variant="ghost" icon={RefreshCw} busy={prep.pending} onClick={prep.run}>
          {t("prep.recreate")}
        </Button>
      ) : null}
    </div>
  );
}
```

`web/src/features/job/interview/InterviewPrepView.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import type { InterviewPrep } from "@/domain/interviewPrep";
import { phaseOf } from "@/domain/jobStatus";
import { resourceLinks } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { Markdown } from "@/ui/Markdown";
import { Tag } from "@/ui/Tag";
import { DeepDiveList } from "../company/DeepDiveList";
import { useJobFormat } from "../format/useJobFormat";

type Gap = NonNullable<InterviewPrep["structured_prep"]>["gap_analysis"][number];

/** Inventory B.4 JobInterviewTab: every section of the prep JSON, in the prototype's prep-sec style. */
export function InterviewPrepView({ job, prep }: { job: JobDetail; prep: InterviewPrep }) {
  const { t } = useI18n();
  const summary = prep.report_output?.executive_summary;
  const pitch = prep.structured_prep?.elevator_pitch;
  const depth = prep.report_output?.deep_dive_analysis;
  return (
    <div className="prep">
      <Appointment job={job} />
      {summary ? <PrepSection title={t("prep.summary")}><Markdown source={summary} /></PrepSection> : null}
      {pitch ? <PrepSection title={t("prep.pitch")}><p className="prose">{pitch}</p></PrepSection> : null}
      <GapSection gaps={prep.structured_prep?.gap_analysis ?? []} />
      {depth ? <PrepSection title={t("prep.depth")}><Markdown source={depth} /></PrepSection> : null}
      <ContactsSection prep={prep} />
      <ConfidenceSection prep={prep} />
      <DeepDiveSection job={job} prep={prep} />
    </div>
  );
}

function PrepSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{title}</h3>
      {children}
    </section>
  );
}

function Appointment({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  if (phaseOf(job) !== "INTERVIEW" || !job.next_follow_up_at) return null;
  return <p className="prose num">{t("prep.appointment", { date: format.dateTime(job.next_follow_up_at) })}</p>;
}

function GapSection({ gaps }: { gaps: readonly Gap[] }) {
  const { t } = useI18n();
  if (gaps.length === 0) return null;
  return (
    <PrepSection title={t("prep.gaps")}>
      <ul className="prep-list">
        {gaps.map((gap, index) => (
          <li key={index}>
            <div className="prep-q">{gap.requirement}</div>
            <div className="tags">
              {gap.gap_severity ? <Tag>{t("prep.severity", { level: gap.gap_severity })}</Tag> : null}
              {gap.cv_status ? <Tag>{t("prep.cvStatus", { status: gap.cv_status })}</Tag> : null}
            </div>
            {gap.interview_strategy ? <div className="prep-a">{gap.interview_strategy}</div> : null}
          </li>
        ))}
      </ul>
    </PrepSection>
  );
}

function ContactsSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const social = prep.social_intelligence_research;
  const items = [...(social?.potential_contacts ?? []), ...(social?.insights_from_contacts ?? [])];
  if (items.length === 0) return null;
  return (
    <PrepSection title={t("prep.contacts")}>
      <ul className="prep-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </PrepSection>
  );
}

function ConfidenceSection({ prep }: { prep: InterviewPrep }) {
  const { t } = useI18n();
  const confidence = prep.confidence_assessment;
  if (!confidence) return null;
  return (
    <PrepSection title={t("prep.uncertainties")}>
      {confidence.overall_confidence ? <p className="meta">{t("prep.confidence", { level: confidence.overall_confidence })}</p> : null}
      <ul className="prep-list">
        {confidence.uncertainties.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </PrepSection>
  );
}

function DeepDiveSection({ job, prep }: { job: JobDetail; prep: InterviewPrep }) {
  const { t } = useI18n();
  const links = resourceLinks(prep.online_resources);
  // The deep-dive endpoint only uses the path value as a label; fall back to the company name.
  const domain = job.company_domain ?? job.company ?? job.id;
  if (prep.deep_dive_buttons.length === 0 && links.length === 0) return null;
  return (
    <PrepSection title={t("company.deepDives")}>
      <DeepDiveList domain={domain} companyName={job.company ?? domain} jobTitle={job.title ?? ""} items={prep.deep_dive_buttons} />
      <ul className="plain-list">
        {links.map((link) => (
          <li key={link}>
            <a className="link code" href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
          </li>
        ))}
      </ul>
    </PrepSection>
  );
}
```

Register the tab: `interview: InterviewTab` in `TAB_PANELS`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (4 new interview tests).

- [ ] **Step 6: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 21: Verlauf tab (status history with notes, free notes with autosave, to-dos)

**Files:**
- Create: `web/src/features/job/history/HistoryTab.tsx`, `web/src/features/job/history/Timeline.tsx`, `web/src/features/job/history/NotesEditor.tsx`, `web/src/features/job/history/TodoList.tsx`
- Modify: `web/src/features/job/tabs/JobTabs.tsx` (last tab: also delete `PendingPanel`, the `Construction` and `EmptyState` imports), `web/src/features/job/job.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Test: `web/tests/unit/features/job/historyTab.test.tsx`

**Interfaces:**
- Consumes: `jobHistoryQueryOptions`, `patchJob`, `JobDetail`, `JobTodo`, `JobHistoryEntry` (Task 2); `queryKeys` (Task 2); `addTodo`, `toggleTodo`, `removeTodo`, `MAX_TODO_TEXT_LENGTH`, `TodoProblem` (Task 6); `phaseOfStatus` (Task 4); `parseApiDate` (Task 1); `statusLabel` (Task 9); `TextAreaField`, `TextField`, `CheckField` (Task 8); `useJobFormat` (Task 0).
- Produces: `HistoryTab({ job })` registered as `TAB_PANELS.history`; `AUTOSAVE_DELAY_MS = 800` (the old UI's debounce, inventory B.4).

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/job/historyTab.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { HistoryTab } from "@/features/job/history/HistoryTab";
import type { RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const HISTORY = [
  { id: 2, from_status: "DRAFTED", to_status: "APPLIED", changed_at: "2026-10-05T10:00:00Z", note: "Beworben am 05.10.2026" },
  { id: 1, from_status: "OPEN", to_status: "DRAFTED", changed_at: "2026-10-03T10:00:00Z", note: null },
];
const TODOS = [{ id: "a", text: "Gehalt recherchieren", done: false }];

function show(job: JobDetail): RecordedCall[] {
  const calls = stubRoutes({ "GET /jobs/job-1/history": HISTORY, "PATCH /jobs/job-1": { status: "updated" } });
  renderWithProviders(<HistoryTab job={job} />);
  return calls;
}

const patches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? ""));

describe("Timeline", () => {
  it("lists every phase change with its note, newest first", async () => {
    show(buildJob({ status: "APPLIED" }));
    const timeline = await screen.findByRole("list", { name: "Verlauf" });
    const items = within(timeline).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Phase: Beworben");
    expect(items[0]).toHaveTextContent("Beworben am 05.10.2026");
    expect(items[1]).toHaveTextContent("Phase: Vorgemerkt");
    expect(items[items.length - 1]).toHaveTextContent("Gefunden");
  });
});

describe("NotesEditor", () => {
  it("saves the notes after a pause in typing", async () => {
    const calls = show(buildJob({ notes: "" }));
    await userEvent.type(screen.getByLabelText("Notizen"), "Rückruf Montag");
    await waitFor(() => expect(patches(calls)).toEqual([{ notes: "Rückruf Montag" }]), { timeout: 2000 });
    expect(await screen.findByText("Gespeichert")).toBeInTheDocument();
  });
});

describe("TodoList", () => {
  it("adds a to-do and sends the whole list", async () => {
    const calls = show(buildJob({ todos: TODOS }));
    await userEvent.type(screen.getByLabelText("Neue Aufgabe"), "Referenz anfragen{Enter}");
    await waitFor(() => expect(patches(calls)[0].todos).toHaveLength(2));
    expect(patches(calls)[0].todos[1]).toMatchObject({ text: "Referenz anfragen", done: false });
  });

  it("toggles and removes a to-do", async () => {
    const calls = show(buildJob({ todos: TODOS }));
    await userEvent.click(screen.getByLabelText("Gehalt recherchieren"));
    await waitFor(() => expect(patches(calls)[0]).toEqual({ todos: [{ ...TODOS[0], done: true }] }));
    await userEvent.click(screen.getByRole("button", { name: "Gehalt recherchieren löschen" }));
    await waitFor(() => expect(patches(calls)[1]).toEqual({ todos: [] }));
  });

  it("explains a too long to-do instead of sending it", async () => {
    const calls = show(buildJob({ todos: [] }));
    const input = screen.getByLabelText("Neue Aufgabe");
    await userEvent.click(input);
    await userEvent.paste("x".repeat(501));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Höchstens 500 Zeichen.")).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("counts the done to-dos", () => {
    show(buildJob({ todos: [...TODOS, { id: "b", text: "Mappe drucken", done: true }] }));
    expect(screen.getByText("1 von 2 erledigt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job/historyTab.test.tsx`
Expected: FAIL, unresolved `@/features/job/history/HistoryTab`.

- [ ] **Step 3: Add the dictionary keys**

`web/src/i18n/de.ts`:

```ts
  "history.title": "Verlauf",
  "history.phase": "Phase: {phase}",
  "history.found": "Gefunden",
  "notes.label": "Notizen",
  "notes.placeholder": "z. B. Ansprechpartnerin, Gehaltsvorstellung, Eindrücke aus dem Gespräch",
  "notes.idle": "Wird beim Tippen gespeichert.",
  "notes.saving": "Wird gespeichert …",
  "notes.saved": "Gespeichert",
  "notes.failed": "Nicht gespeichert. Tippe weiter oder versuche es gleich noch einmal.",
  "todo.title": "Aufgaben",
  "todo.new": "Neue Aufgabe",
  "todo.add": "Hinzufügen",
  "todo.delete": "{text} löschen",
  "todo.progress": "{done} von {total} erledigt",
  "todo.empty": "Aufgabe darf nicht leer sein.",
  "todo.tooLong": "Höchstens 500 Zeichen.",
  "todo.tooMany": "Höchstens 50 Aufgaben pro Stelle.",
```

`web/src/i18n/en.ts`:

```ts
  "history.title": "History",
  "history.phase": "Phase: {phase}",
  "history.found": "Found",
  "notes.label": "Notes",
  "notes.placeholder": "e.g. contact person, salary expectation, impressions from the interview",
  "notes.idle": "Saved while you type.",
  "notes.saving": "Saving …",
  "notes.saved": "Saved",
  "notes.failed": "Not saved. Keep typing or try again in a moment.",
  "todo.title": "To-dos",
  "todo.new": "New to-do",
  "todo.add": "Add",
  "todo.delete": "Delete {text}",
  "todo.progress": "{done} of {total} done",
  "todo.empty": "A to-do cannot be empty.",
  "todo.tooLong": "At most 500 characters.",
  "todo.tooMany": "At most 50 to-dos per job.",
```

- [ ] **Step 4: Implement the timeline**

`web/src/features/job/history/Timeline.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { jobHistoryQueryOptions, type JobDetail, type JobHistoryEntry } from "@/api/jobs";
import { parseApiDate } from "@/domain/calendar";
import { phaseOfStatus } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { useJobFormat } from "../format/useJobFormat";
import { statusLabel } from "../labels";

// Stage colours from tokens.css (--st-*), one per phase.
const PHASE_COLOR = {
  OPEN: "var(--st-open)",
  DRAFTED: "var(--st-drafted)",
  APPLIED: "var(--st-applied)",
  INTERVIEW: "var(--st-interview)",
  OFFER: "var(--st-offer)",
  CLOSED: "var(--st-closed)",
} as const;

const newestFirst = (a: JobHistoryEntry, b: JobHistoryEntry) =>
  parseApiDate(b.changed_at ?? "").getTime() - parseApiDate(a.changed_at ?? "").getTime();

/** Every status change with its note (B1 history), and the day the job was found. */
export function Timeline({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const history = [...(useQuery(jobHistoryQueryOptions(job.id)).data ?? [])].sort(newestFirst);
  return (
    <ol className="timeline" aria-label={t("history.title")}>
      {history.map((entry) => (
        <TimelineEntry key={entry.id} entry={entry} />
      ))}
      {job.created_at ? <FoundEntry createdAt={job.created_at} /> : null}
    </ol>
  );
}

function TimelineEntry({ entry }: { entry: JobHistoryEntry }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const color = PHASE_COLOR[phaseOfStatus(entry.to_status)];
  return (
    <li>
      <span className="tl-date">{entry.changed_at ? format.dateTime(entry.changed_at) : ""}</span>
      <span className="tl-dot" style={{ "--c": color } as CSSProperties}>
        <i />
      </span>
      <div>
        <div className="tl-title">{t("history.phase", { phase: t(statusLabel(entry.to_status)) })}</div>
        {entry.note ? <div className="tl-sub">{entry.note}</div> : null}
      </div>
    </li>
  );
}

function FoundEntry({ createdAt }: { createdAt: string }) {
  const { t } = useI18n();
  const format = useJobFormat();
  return (
    <li>
      <span className="tl-date">{format.dateTime(createdAt)}</span>
      <span className="tl-dot">
        <i />
      </span>
      <div>{t("history.found")}</div>
    </li>
  );
}
```

A row without `changed_at` sorts as `Invalid Date` (NaN); `parseApiDate("")` gives an invalid date and `NaN` comparisons keep the server order, which is newest first already.

- [ ] **Step 5: Implement notes with autosave**

`web/src/features/job/history/NotesEditor.tsx`:

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { patchJob, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField } from "@/ui/Field";

/** Debounce of the old UI's notes autosave (inventory B.4 JobDocumentsTab). */
export const AUTOSAVE_DELAY_MS = 800;
const NOTES_ROWS = 9;

function useNotesAutosave(job: JobDetail) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(job.notes ?? "");
  const [saved, setSaved] = useState(job.notes ?? "");
  const { mutate, isPending, isError } = useMutation({
    mutationFn: (notes: string) => patchJob(job.id, { notes }),
    onSuccess: (_result, notes) => {
      setSaved(notes);
      // Keep the cached job in step without a refetch per keystroke pause.
      queryClient.setQueryData<JobDetail>(queryKeys.job(job.id), (old) => (old ? { ...old, notes } : old));
    },
  });
  useEffect(() => {
    if (draft === saved) return;
    const timer = setTimeout(() => mutate(draft), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, saved, mutate]);
  return { draft, setDraft, state: notesState({ dirty: draft !== saved, isPending, isError, hasNotes: saved !== "" }) };
}

function notesState(input: { dirty: boolean; isPending: boolean; isError: boolean; hasNotes: boolean }): MessageKey {
  if (input.isError && !input.isPending) return "notes.failed";
  if (input.dirty || input.isPending) return "notes.saving";
  return input.hasNotes ? "notes.saved" : "notes.idle";
}

export function NotesEditor({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const notes = useNotesAutosave(job);
  return (
    <section>
      <TextAreaField id="job-notes" label={t("notes.label")} rows={NOTES_ROWS} placeholder={t("notes.placeholder")} value={notes.draft} onChange={(event) => notes.setDraft(event.target.value)} />
      <p className="hint" aria-live="polite">
        {t(notes.state)}
      </p>
    </section>
  );
}
```

A failed save retries on the next keystroke (the effect runs again because `draft` changes); the message says so.

- [ ] **Step 6: Implement the to-dos and the tab**

`web/src/features/job/history/TodoList.tsx`:

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import { patchJob, type JobDetail, type JobTodo } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { addTodo, removeTodo, toggleTodo } from "@/domain/todos";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";

/** To-dos stored in jobs.todos (B7); every change sends the whole list (PATCH replaces it). */
function useTodos(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (todos: JobTodo[]) => patchJob(job.id, { todos }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) }),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
  // While a save runs, show what was sent; the refetch then confirms it.
  const todos = save.isPending && save.variables ? save.variables : (job.todos ?? []);
  return { todos, save: save.mutate };
}

export function TodoList({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const { todos, save } = useTodos(job);
  const done = todos.filter((todo) => todo.done).length;
  return (
    <section className="todos" aria-labelledby="todos-title">
      <div className="row-between">
        <h3 className="sec-title-sm" id="todos-title">
          {t("todo.title")}
        </h3>
        {todos.length > 0 ? <span className="meta">{t("todo.progress", { done, total: todos.length })}</span> : null}
      </div>
      <ul className="plain-list todo-list">
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={() => save(toggleTodo(todos, todo.id))} onRemove={() => save(removeTodo(todos, todo.id))} />
        ))}
      </ul>
      <NewTodo todos={todos} onAdd={save} />
    </section>
  );
}

interface TodoItemProps {
  todo: JobTodo;
  onToggle: () => void;
  onRemove: () => void;
}

function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  const { t } = useI18n();
  return (
    <li className="todo">
      <CheckField id={`todo-${todo.id}`} label={todo.text} checked={todo.done} onChange={onToggle} />
      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t("todo.delete", { text: todo.text })} onClick={onRemove} />
    </li>
  );
}

function NewTodo({ todos, onAdd }: { todos: readonly JobTodo[]; onAdd: (todos: JobTodo[]) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Event handler: generating an id here is fine (not during render).
    const result = addTodo(todos, text, crypto.randomUUID());
    if (!result.ok) return setError(t(`todo.${result.problem}`));
    setError(undefined);
    setText("");
    onAdd(result.todos);
  };
  return (
    <form className="todo-new" onSubmit={submit}>
      <TextField id="todo-new" label={t("todo.new")} value={text} error={error} onChange={(event) => setText(event.target.value)} />
      <Button type="submit" size="sm" icon={Plus}>
        {t("todo.add")}
      </Button>
    </form>
  );
}
```

`web/src/features/job/history/HistoryTab.tsx`:

```tsx
"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { NotesEditor } from "./NotesEditor";
import { Timeline } from "./Timeline";
import { TodoList } from "./TodoList";

/** Prototype tabHistory plus the to-dos that used to live in localStorage (C.2, now B7). */
export function HistoryTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <div className="fit-grid history">
      <section>
        <h3 className="sec-title-sm">{t("history.title")}</h3>
        <Timeline job={job} />
      </section>
      <div className="history-side">
        <NotesEditor job={job} />
        <TodoList job={job} />
      </div>
    </div>
  );
}
```

Register it: `history: HistoryTab` in `TAB_PANELS`. All five entries now point to real tabs: delete `PendingPanel` and its imports (`Construction`, `EmptyState`) from `JobTabs.tsx`.

The timeline heading "Verlauf" and the list's `aria-label` "Verlauf" both name the history; the test uses the list role.

- [ ] **Step 7: CSS**

Append to `web/src/features/job/job.css` (prototype `.timeline`):

```css
  .history {
    margin-top: 0;
  }
  .history > section > .sec-title-sm {
    margin-bottom: 12px;
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .timeline li {
    display: grid;
    grid-template-columns: 110px 14px minmax(0, 1fr);
    gap: 12px;
    position: relative;
    padding-bottom: 16px;
    font-size: var(--fs-13);
  }
  .tl-date {
    color: var(--text-3);
    text-align: right;
    font-variant-numeric: tabular-nums;
    padding-top: 1px;
  }
  .tl-dot {
    position: relative;
    display: flex;
    justify-content: center;
  }
  .tl-dot i {
    width: 9px;
    height: 9px;
    border-radius: 1px;
    background: var(--c, var(--line-strong));
    margin-top: 5px;
    position: relative;
    z-index: 1;
  }
  .timeline li:not(:last-child) .tl-dot::after {
    content: "";
    position: absolute;
    top: 14px;
    bottom: -16px;
    width: 1px;
    background: var(--line-strong);
  }
  .tl-title {
    font-weight: 500;
  }
  .tl-sub {
    color: var(--text-2);
  }
  .history-side {
    display: grid;
    gap: 28px;
    align-content: start;
  }
  .todo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 4px 0;
  }
  .todo-new {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    margin-top: 10px;
  }
  .todo-new .field {
    flex: 1;
    margin: 0;
  }
  @media (max-width: 767px) {
    .timeline li {
      grid-template-columns: 76px 14px minmax(0, 1fr);
    }
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/job`
Expected: PASS (6 new history tests).

- [ ] **Step 9: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 22: E2E support, job fixtures, page screenshots and layout checks

**Files:**
- Modify: `web/tests/e2e/support/mockApi.ts`
- Create: `web/tests/e2e/support/jobFixtures.ts`, `web/tests/e2e/job.spec.ts`

**Interfaces:**
- Consumes: the phase-1 e2e support (`mockApi`, `setRoutes`, `AUTHENTICATED_ROUTES`, `ADMIN_USER_ID`, `SCREENSHOT_SIZES`, `COLOR_SCHEMES`, `VIEWPORTS`, `saveScreenshot`, `horizontalOverflow`), the auto fixture with its console-error allow-list (name recorded in Task 0; written here as `allowedConsoleErrors`), the zod input types `JobDetailBody`, `JobHistoryBody`, `JobDocumentBody`, `CompanyProfileBody`, `ProfileDocumentBody`.
- Produces:
  - `MockResponse` gains `contentType?: string` (a string body with a content type is sent raw, e.g. a PDF); route keys may include the query string (`"GET /jobs/job-1/documents/html?kind=cv"`), which wins over the key without query; `ApiLog.calls: { key: string; body: unknown }[]` records each request's parsed JSON body.
  - `jobFixtures.ts`: `JOB_ID`, `NOW_ISO`, `jobBody(overrides?)`, `READY_DOCUMENTS`, `CV_DOCUMENT`, `LETTER_DOCUMENT`, `HISTORY`, `PDF_RESPONSE`, `COMPANY_PROFILE`, `PREP_MATERIAL`, `jobRoutes(job: JobDetailBody, extra?: MockRoutes): MutableRoutes`, `jobUrl(tab?: string): string`, `pushEvent(log: ApiLog, event: object): void`.

- [ ] **Step 1: Extend the mock API**

Replace `web/tests/e2e/support/mockApi.ts` with:

```ts
import type { Page, Request, Route, WebSocketRoute } from "@playwright/test";
import { MOCK_API_PREFIX } from "./constants";

export interface MockResponse {
  status?: number;
  body: unknown;
  /** With a string body, sends the body raw with this type (e.g. application/pdf). */
  contentType?: string;
}

/** Keys are "METHOD /path" or, more specific, "METHOD /path?query" (e.g. "GET /jobs/counts"). */
export type MockRoutes = Readonly<Record<string, MockResponse>>;

/** Routes a test may extend after the page is loaded, e.g. when a login call creates the session. */
export type MutableRoutes = Record<string, MockResponse>;

export interface ApiCall {
  key: string;
  body: unknown;
}

export interface ApiLog {
  requests: string[];
  unexpected: string[];
  /** Every mocked call with its JSON body (null without one), for request assertions. */
  calls: ApiCall[];
  /** Accepted realtime sockets; a test pushes an event with `sockets[0].send(JSON.stringify(...))`. */
  sockets: WebSocketRoute[];
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** Adds `more` to routes already handed to the mock; later requests see them. */
export function setRoutes(routes: MutableRoutes, more: MockRoutes): void {
  Object.assign(routes, more);
}

export async function mockApi(page: Page, routes: MockRoutes): Promise<ApiLog> {
  const log: ApiLog = { requests: [], unexpected: [], calls: [], sockets: [] };
  await page.route(`**${MOCK_API_PREFIX}/**`, (route) => fulfil(route, routes, log));
  // Accept the realtime socket without a server; tests push events through log.sockets.
  await page.routeWebSocket(new RegExp(`${MOCK_API_PREFIX}/ws$`), (socket) => {
    log.sockets.push(socket);
  });
  return log;
}

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

async function fulfil(route: Route, routes: MockRoutes, log: ApiLog): Promise<void> {
  const keys = routeKeys(route.request());
  const key = keys.exact in routes ? keys.exact : keys.plain;
  log.requests.push(key);
  log.calls.push({ key, body: jsonBody(route.request()) });
  const response = routes[key];
  if (!response) log.unexpected.push(key);
  await route.fulfill(toFulfilment(response));
}

function toFulfilment(response: MockResponse | undefined) {
  if (!response) return { status: HTTP_NOT_FOUND, json: { detail: "not mocked" } };
  const status = response.status ?? HTTP_OK;
  if (response.contentType && typeof response.body === "string") {
    return { status, body: response.body, contentType: response.contentType };
  }
  return { status, json: response.body };
}
```

Run the phase-1 e2e suite once to confirm nothing changed for the old tests:

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: all phase-1 tests pass (the job placeholder test was removed in Task 9).

- [ ] **Step 2: Write the job fixtures**

`web/tests/e2e/support/jobFixtures.ts`:

```ts
import type { CompanyProfileBody } from "../../../src/api/companies";
import type { JobDocumentBody } from "../../../src/api/jobDocuments";
import type { JobDetailBody, JobHistoryBody } from "../../../src/api/jobs";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import { ADMIN_USER_ID, AUTHENTICATED_ROUTES } from "./fixtures";
import type { ApiLog, MockResponse, MockRoutes, MutableRoutes } from "./mockApi";

export const JOB_ID = "job-1";
/** Fixed "now" of every job test (page.clock.setFixedTime), so due dates are stable. */
export const NOW_ISO = "2026-10-08T10:00:00+02:00";

const REASONING = `## Zusammenfassung
Du passt gut: Kotlin und Kafka sind dein Alltag, das Team sucht genau das.

## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren in Produktion
- Kafka und transaktionale Outbox
- Fachliche Führung eines kleinen Teams

## Lücken & Herausforderungen
- Keine Erfahrung mit GCP
- Reisebereitschaft 20 %

## Empfehlung
Bewirb dich und betone den Umbau des Zahlungsdienstes.`;

export function jobBody(overrides: Partial<JobDetailBody> = {}): JobDetailBody {
  return {
    id: JOB_ID,
    title: "Senior Backend Engineer (Kotlin)",
    company: "ACME GmbH",
    company_domain: null,
    description: "Wir suchen eine erfahrene Person für unser Plattform-Team in Hamburg.",
    match_score: 86,
    reasoning: REASONING,
    status: "OPEN",
    url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
    is_archived: false,
    checklist: null,
    todos: [{ id: "t1", text: "Gehaltsband recherchieren", done: false }],
    notes: "",
    created_at: "2026-10-03T07:00:00+00:00",
    next_follow_up_at: null,
    cv_html_present: false,
    cover_letter_html_present: false,
    ...overrides,
  };
}

export const CV_DOCUMENT: JobDocumentBody = {
  id: 4,
  original_filename: "Lebenslauf_ACME.pdf",
  file_size: 48_000,
  mime_type: "application/pdf",
  kind: "GENERATED_CV",
  uploaded_at: "2026-10-07T09:12:00+00:00",
};
export const LETTER_DOCUMENT: JobDocumentBody = {
  ...CV_DOCUMENT,
  id: 5,
  original_filename: "Anschreiben_ACME.pdf",
  kind: "GENERATED_LETTER",
};
export const READY_DOCUMENTS = [CV_DOCUMENT, LETTER_DOCUMENT];
export const READY = { cv_html_present: true, cover_letter_html_present: true } as const;

export const HISTORY: JobHistoryBody[] = [
  { id: 1, from_status: "OPEN", to_status: "DRAFTED", changed_at: "2026-10-04T08:00:00+00:00", note: null },
];

const PROFILE_DOCUMENTS: ProfileDocumentBody[] = [
  { id: 1, doc_type: "CERTIFICATE", label: "AWS Solutions Architect", original_filename: "aws.pdf" },
];

// A minimal one-page PDF; Chromium's headless shell has no PDF viewer, so the page shows its fallback.
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
export const PDF_RESPONSE: MockResponse = { body: PDF, contentType: "application/pdf" };

export const COMPANY_PROFILE: CompanyProfileBody = {
  domain: "acme.de",
  name: "ACME GmbH",
  executive_summary: {
    assessment: "Solider Mittelständler mit wachsendem Plattform-Team.",
    confidence: "Moderate",
    suitable_for: ["Backend-Entwicklung mit Verantwortung"],
    not_suitable_for: ["Reine Frontend-Rollen"],
  },
  analysis: [{ area: "Kultur", assessment: "Direkt und pragmatisch.", confidence: "Low" }],
  key_insights: { facts: ["Rund 400 Beschäftigte"], interpretations: [], uncertainties: [] },
  risks: [{ title: "Fluktuation", probability: "Medium", impact: "Medium", description: "Mehrere Wechsel im Management." }],
  market_comparison: null,
  deep_dive_buttons: [{ title: "Gehaltsband", focus: "Gehalt Senior Backend", how_to_proceed: "Portale auswerten" }],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T12:00:00+00:00",
};

export const PREP_MATERIAL = JSON.stringify({
  report_output: { executive_summary: "Deine Erfahrung mit Zahlungssystemen ist der stärkste Punkt.", deep_dive_analysis: "" },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Backend-Systeme und führe kleine Teams.",
    gap_analysis: [{ requirement: "GCP", cv_status: "fehlt", gap_severity: "Medium", interview_strategy: "AWS-Erfahrung übertragen" }],
  },
  deep_dive_buttons: [],
  confidence_assessment: { overall_confidence: "Moderate", uncertainties: ["Budget des Teams"] },
});

const path = (suffix = "") => `/jobs/${JOB_ID}${suffix}`;

/** Everything the job page loads, plus the authenticated shell. */
export function jobRoutes(job: JobDetailBody, extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    [`GET ${path()}`]: { body: job },
    [`GET ${path("/history")}`]: { body: HISTORY },
    [`GET ${path("/documents")}`]: { body: job.cv_html_present ? READY_DOCUMENTS : [] },
    [`GET ${path("/documents/4/view")}`]: PDF_RESPONSE,
    [`GET ${path("/documents/5/view")}`]: PDF_RESPONSE,
    "GET /profile/documents": { body: PROFILE_DOCUMENTS },
    ...extra,
  };
}

export function jobUrl(tab?: string): string {
  return tab ? `${path()}?tab=${tab}` : path();
}

/** Sends a realtime event for the signed-in user through the mocked socket. */
export function pushEvent(log: ApiLog, event: object): void {
  log.sockets[0].send(JSON.stringify({ user_id: ADMIN_USER_ID, ...event }));
}
```

- [ ] **Step 3: Write the page spec**

`web/tests/e2e/job.spec.ts`:

```ts
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { jobBody, jobRoutes, jobUrl, NOW_ISO, READY } from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const STATES = {
  open: jobBody({ status: "OPEN" }),
  drafted: jobBody({ status: "DRAFTED", ...READY }),
  interview: jobBody({ status: "INTERVIEW", ...READY, next_follow_up_at: "2026-10-09T08:00:00+00:00" }),
} as const;
const TAB_OF_STATE = { open: undefined, drafted: "unterlagen", interview: "verlauf" } as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

for (const [state, job] of Object.entries(STATES) as [keyof typeof STATES, (typeof STATES)[keyof typeof STATES]][]) {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`job page (${state}) renders at ${size}px in ${scheme} mode`, async ({ page, mockApi }) => {
        await mockApi(jobRoutes(job));
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(jobUrl(TAB_OF_STATE[state]));
        await expect(page.getByRole("heading", { level: 1, name: "Senior Backend Engineer (Kotlin)" })).toBeVisible();
        await saveScreenshot(page, `job-${state}-${size}-${scheme}`);
      });
    }
  }

  test(`job page (${state}) has no horizontal scroll at 375 px`, async ({ page, mockApi }) => {
    await mockApi(jobRoutes(job));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(jobUrl(TAB_OF_STATE[state]));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test("highlights Eingang for a match", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.open));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Eingang/ })).toHaveAttribute("aria-current", "page");
});

test("highlights Bewerbungen for an application", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Bewerbungen/ })).toHaveAttribute("aria-current", "page");
});

test("orders header, next step and tabs on mobile", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto(jobUrl());
  const card = await page.getByRole("region", { name: "Bewerben" }).boundingBox();
  const tabs = await page.getByRole("tablist", { name: "Details zur Stelle" }).boundingBox();
  expect(card && tabs && card.y < tabs.y).toBe(true);
});

test("opens the A4 preview full screen on mobile", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto(jobUrl("unterlagen"));
  await page.getByRole("button", { name: "Vorschau groß öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Lebenslauf" })).toBeVisible();
  await saveScreenshot(page, "job-preview-fullscreen-390-light");
});

test("shows the next step beside the tabs on desktop", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const card = await page.getByRole("region", { name: "Bewerben" }).boundingBox();
  const tabs = await page.getByRole("tablist", { name: "Details zur Stelle" }).boundingBox();
  expect(card && tabs && card.x > tabs.x + tabs.width).toBe(true);
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: all tests pass (phase 1 plus 12 screenshots, 3 overflow checks, 5 layout tests). Copy the screenshots back:
`mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/`

- [ ] **Step 5: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---
### Task 23: E2E journeys (documents, edit and re-render, apply, interview prep, offer, close, research, phase change)

**Files:**
- Create: `web/tests/e2e/jobJourneys.spec.ts`

**Interfaces:**
- Consumes: Task 22's fixtures and mock extensions (`jobRoutes`, `jobBody`, `READY`, `READY_DOCUMENTS`, `COMPANY_PROFILE`, `PREP_MATERIAL`, `jobUrl`, `pushEvent`, `NOW_ISO`, `setRoutes`, `ApiLog.calls`), the auto fixture's console allow-list option (`allowedConsoleErrors`, real name from Task 0).
- Produces: the spec 7 journeys for this phase: generate documents, edit and re-render, apply with checklist, apply without documents warning, interview prep, offer, close as accepted/rejected, company research, phase change with backward confirm. Each journey runs under the auto fixture, so an unmocked call or a console error fails it.

- [ ] **Step 1: Write the journeys**

`web/tests/e2e/jobJourneys.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import {
  COMPANY_PROFILE,
  jobBody,
  jobRoutes,
  jobUrl,
  NOW_ISO,
  pushEvent,
  PREP_MATERIAL,
  READY,
  READY_DOCUMENTS,
} from "./support/jobFixtures";
import { setRoutes, type ApiLog } from "./support/mockApi";
import { expect, test } from "./support/test";

const STARTED = { body: { status: "started" } };
const UPDATED = { body: { status: "updated" } };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_ISO));
});

const bodiesOf = (log: ApiLog, key: string) => log.calls.filter((call) => call.key === key).map((call) => call.body);

async function openJob(page: Page, tab?: string) {
  await page.goto(jobUrl(tab));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function changePhase(page: Page, target: string) {
  await page.getByRole("button", { name: "Phase ändern" }).click();
  await page.getByRole("menuitemradio", { name: target }).click();
}

test("generates both documents and shows them when the server is done", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "DRAFTED" }), { "POST /jobs/job-1/generate-package": STARTED });
  const log = await mockApi(routes);
  await openJob(page);
  // The next GET of the job (after the start) already reports the running generation.
  setRoutes(routes, { "GET /jobs/job-1": { body: jobBody({ status: "GENERATING" }) } });
  await page.getByRole("button", { name: "Unterlagen erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Unterlagen werden erstellt" })).toBeVisible();
  expect(bodiesOf(log, "POST /jobs/job-1/generate-package")).toEqual([
    { generate_cv: true, generate_letter: true, include_profile_documents: true },
  ]);
  setRoutes(routes, {
    "GET /jobs/job-1": { body: jobBody({ status: "DRAFTED", ...READY }) },
    "GET /jobs/job-1/documents": { body: READY_DOCUMENTS },
  });
  pushEvent(log, { type: "job_update", job_id: "job-1", status: "DRAFTED" });
  await expect(page.getByRole("heading", { name: "Bewerben" })).toBeVisible();
});

test("edits the CV on the sheet and re-renders the PDF", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "DRAFTED", ...READY }), {
    "GET /jobs/job-1/documents/html?kind=cv": { body: { html: "<html><body><p>Profil</p></body></html>" } },
    "PUT /jobs/job-1/documents/html?kind=cv": { body: { ok: true } },
    "POST /jobs/job-1/documents/render?kind=cv": { body: { queued: true } },
  });
  const log = await mockApi(routes);
  await openJob(page, "unterlagen");
  await page.getByRole("group", { name: "Lebenslauf" }).getByRole("button", { name: "Bearbeiten" }).click();
  const frame = page.frameLocator('iframe[title="Lebenslauf bearbeiten"]');
  await frame.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" mit Führung");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByText("PDF wird neu gesetzt …").first()).toBeVisible();
  expect(String((bodiesOf(log, "PUT /jobs/job-1/documents/html?kind=cv")[0] as { html: string }).html)).toContain("mit Führung");
  pushEvent(log, { type: "job_update", job_id: "job-1", status: "DRAFTED", rendered_kind: "cv" });
  await expect(page.getByText("PDF wird neu gesetzt …")).toHaveCount(0);
});

test("applies with the checklist", async ({ page, mockApi }) => {
  const drafted = jobBody({ status: "DRAFTED", ...READY });
  const routes = jobRoutes(drafted, {
    "PATCH /jobs/job-1": UPDATED,
    "POST /jobs/job-1/status": { body: jobBody({ status: "APPLIED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await page.getByLabel("Beim Arbeitgeber abgeschickt").check();
  await expect.poll(() => bodiesOf(log, "PATCH /jobs/job-1")).toEqual([
    { checklist: { posting_opened: false, documents_checked: false, sent: true } },
  ]);
  setRoutes(routes, { "GET /jobs/job-1": { body: jobBody({ status: "APPLIED", ...READY }) } });
  await page.getByRole("button", { name: "Als beworben markieren" }).click();
  await expect(page.getByRole("heading", { name: "Auf Antwort warten" })).toBeVisible();
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "APPLIED" }]);
});

test("warns before applying without documents", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "DRAFTED", cv_html_present: true }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "APPLIED", cv_html_present: true }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await changePhase(page, "Beworben");
  const dialog = page.getByRole("dialog", { name: "Ohne fertige Unterlagen?" });
  await expect(dialog).toContainText("Anschreiben");
  await dialog.getByRole("button", { name: "Trotzdem auf Beworben setzen" }).click();
  await expect.poll(() => bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "APPLIED" }]);
});

test("prepares the interview and shows the preparation when it is ready", async ({ page, mockApi }) => {
  const interview = jobBody({ status: "INTERVIEW", ...READY, next_follow_up_at: "2026-10-12T08:00:00+00:00" });
  const routes = jobRoutes(interview, {
    "POST /jobs/job-1/interview-prep": { body: { status: "queued", message: "", job_id: "job-1" } },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await page.getByRole("button", { name: "Interview vorbereiten" }).click();
  await expect(page.getByText("Vorbereitung wird erstellt …")).toBeVisible();
  setRoutes(routes, { "GET /jobs/job-1": { body: { ...interview, interview_prep_material: PREP_MATERIAL } } });
  pushEvent(log, { type: "interview_prep_ready", job_id: "job-1" });
  await expect(page.getByText("Ich baue robuste Backend-Systeme und führe kleine Teams.")).toBeVisible();
});

test("accepts an offer", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "OFFER", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "ACCEPTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await page.getByRole("button", { name: "Angebot angenommen" }).click();
  await expect(page.getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();
  expect(bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "ACCEPTED" }]);
});

test("closes an application as rejected through the phase menu", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "APPLIED", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "REJECTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await changePhase(page, "Abgeschlossen");
  await page.getByRole("dialog", { name: "Wie ist die Bewerbung ausgegangen?" }).getByRole("button", { name: "Absage erhalten" }).click();
  await expect.poll(() => bodiesOf(log, "POST /jobs/job-1/status")).toEqual([{ to: "REJECTED" }]);
  await expect(page.getByRole("list", { name: "Phase der Bewerbung" })).toContainText("Absage erhalten");
});

test("asks before moving an application back", async ({ page, mockApi }) => {
  const routes = jobRoutes(jobBody({ status: "INTERVIEW", ...READY }), {
    "POST /jobs/job-1/status": { body: jobBody({ status: "DRAFTED", ...READY }) },
  });
  const log = await mockApi(routes);
  await openJob(page);
  await changePhase(page, "Vorgemerkt");
  const dialog = page.getByRole("dialog", { name: "Zurück auf Vorgemerkt?" });
  await dialog.getByLabel("Notiz für den Verlauf (optional)").fill("Termin abgesagt");
  await dialog.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect.poll(() => bodiesOf(log, "POST /jobs/job-1/status")).toEqual([
    { to: "DRAFTED", note: "Termin abgesagt" },
  ]);
});

test.describe("company research", () => {
  // The profile does not exist yet: the API answers 404 and Chromium logs that response.
  test.use({ allowedConsoleErrors: [/status of 404/] });

  test("researches the company and shows the profile when it is ready", async ({ page, mockApi }) => {
    const routes = jobRoutes(jobBody({ status: "DRAFTED", ...READY, company_domain: "acme.de" }), {
      "GET /companies/acme.de": { status: 404, body: { detail: "Company profile not found" } },
      "POST /companies/acme.de/analyze": { body: { status: "queued", domain: "acme.de", message: "" } },
    });
    const log = await mockApi(routes);
    await openJob(page, "firma");
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText(/Firmenrecherche läuft/)).toBeVisible();
    setRoutes(routes, { "GET /companies/acme.de": { body: COMPANY_PROFILE } });
    pushEvent(log, { type: "company_profile_ready", domain: "acme.de" });
    await expect(page.getByText("Solider Mittelständler mit wachsendem Plattform-Team.")).toBeVisible();
  });
});
```

If the fix wave named the allow-list option differently, replace `allowedConsoleErrors` with that name (Task 0, Step 1).

- [ ] **Step 2: Run the journeys**

Run: `"$QA"/webrun.sh pnpm test:e2e`
Expected: all tests pass, including the 9 journeys. A failing journey with an "unexpected" call in the auto-fixture assertion means a route is missing in that journey's `jobRoutes(..., extra)`; add the route there, never silence the fixture.

- [ ] **Step 3: Format and checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build'`
Expected: all green.

---

### Task 24: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/ui-context.md`, `context/architecture.md`

**Interfaces:**
- Consumes: the counts printed by the last checkpoint (`pnpm test` summary `Tests  N passed`) and by `pnpm test:e2e` (`M passed`).
- Produces: up-to-date context for phase 3.

- [ ] **Step 1: Collect the numbers**

Run: `"$QA"/webrun.sh pnpm test 2>&1 | grep -E "Test Files|Tests "` and `"$QA"/webrun.sh pnpm test:e2e 2>&1 | grep -E "passed|failed"`
Expected: unit summary and e2e summary; use them as `<unit count>` and `<e2e count>` below.

- [ ] **Step 2: Update `context/progress-tracker.md`**

Replace the Phase line of section 1 with:

```markdown
**Phase:** Frontend redesign - phase 2 (job page `/jobs/[id]` with all tabs) done; next is phase 3 (inbox with onboarding, import and threshold).
```

Add this row at the end of the Status Board table:

```markdown
| **Frontend Redesign - Phase 2 (job page)** | ✅ Completed (`web/src/features/job/**`, `web/src/domain/{jobStatus,phaseTrack,statusGuards,documents,checklist,nextStep,reasoning,markdown,interviewPrep,todos,links,monogram,pendingTasks,calendar}.ts`, `web/src/api/{jobs,jobDocuments,companies,profileDocuments,files}.ts`, `web/src/ui/{Menu,A4Preview,Monogram,Markdown,Disclosure}.tsx`, `web/app/(app)/jobs/[id]/page.tsx`) | One job view: header with score (recedes from Beworben), read-only phase track with skipped/closed states and a guarded "Phase ändern" menu (backward/skip confirm, apply-without-documents warning, outcome question), sticky "Nächster Schritt" card from `domain/nextStep` with apply checklist and "Termine & Daten", tabs Passung / Unterlagen (generate, notes, cancel, A4 preview from blob URLs, HTML edit + re-render, files) / Firma (research, deep dives) / Interview / Verlauf (history, notes autosave, to-dos). Realtime via `applyEvent` and the pending-task cache; no polling. <unit count> unit tests and <e2e count> Playwright tests green. |
```

Add to section 4 (ADRs):

```markdown
* **Frontend redesign - job page rulings (phase 2):** (D1) PDFs are fetched through the API client and shown from `blob:` URLs in `<object>` (the API keeps `X-Frame-Options: DENY`); browsers without an inline PDF viewer get "PDF öffnen"/download. (D2) "Phase ändern" is a WAI-ARIA menu button (`ui/Menu.tsx`), not a dialog. (D4) "Selbst abgesagt" is `REJECTED` plus a history note. (D5) `next_follow_up_at` is the one date of a job; its meaning follows the phase (Nachfassen / Interviewtermin / Antwort bis). (D6) No fit-feedback form (no backend). (D8) CV notes travel in `jobs.cv_draft`. (D9) HTML editing happens in a sandboxed `iframe srcdoc` with `designMode`. (D11) The Firma tab asks once for the company web address (`company_domain`). Background tasks without server state (re-analysis, interview prep, research, PDF re-render, generation start time) live in the `["pending-tasks"]` query entry that `applyEvent` finishes; prep and research turn "stalled" after 3 minutes because the backend publishes no failure event.
* **Job sub-resources under one key:** everything of a job is cached under `["job", id, ...]` (detail, history, documents, stored HTML), so one realtime invalidation refreshes all of it; PDF bytes live under `["job-file", jobId, docId, uploaded_at]` and never refetch for the same version.
```

In section 5 (Open Questions) remove the item "**A4 PDF preview (phase 2):** ..." (resolved by D1) and add only the backend gaps the controller left open (from the plan's "Backend gaps" table), each as one line, for example:

```markdown
* **Job page backend gaps (phase 2 plan, G2/G3/G4/G8):** interview date column, clearing `next_follow_up_at` via PATCH, `pre_generation_status` in `GET /jobs/{id}`, attaching several profile documents of one kind. The UI works without them (see the plan's rulings); each is a small backend task.
* **Job tasks in the sidebar activity (spec 4.3 #6):** generation, interview prep and research progress show on the job page only; adding them to "Im Hintergrund" is deferred to phase 8.
```

- [ ] **Step 3: Update `context/ui-context.md`**

In section 0, extend the **Primitives** bullet with: "`Stepper` (read-only; states past/current/future/skipped/closed, each also as screen-reader text; optional visible heading via `headingLevel`), `MenuButton` (WAI-ARIA menu with `menuitemradio`, arrow keys, Escape returns focus), `A4Preview` (A4 proof on the desk from a `blob:` PDF URL, open/download fallback without an inline viewer, full-screen dialog on mobile), `Monogram` (company initials, decorative), `Markdown`/`InlineText` (AI text as React nodes: headings, lists, bold, http links only), `Disclosure`, `SelectField`, `TextAreaField`, `CheckField`."

Add a bullet after **States**:

```markdown
- **Job page (`/jobs/[id]`):** header (monogram, title, meta, posting link, big score; `.recede` from Beworben on), phase track plus "Phase ändern" menu with all guards, two columns at >= 1024 px (tabs left, sticky 360 px "Nächster Schritt" + "Termine & Daten" right), single column below (header, next card, tabs). Tabs live in `?tab=` (passung, unterlagen, firma, interview, verlauf). Generation entry points use one verb family: "Erstellen" / "Neu erstellen", each with an optional "Hinweis an die KI". Background tasks show text progress (`TaskState`), never percentages; cancel only for generation. The nav highlights Eingang for matches and sorted-out jobs, Bewerbungen otherwise.
```

- [ ] **Step 4: Update `context/architecture.md`**

In the `web/` block of section 2, add:

```markdown
  - `src/domain/`: pure rules, unit tested: status-machine mirror of `server/core/job_status.py` (`jobStatus.ts`), phase track, status guards, `nextStep(job, now)` (single source for the next-step card, the inbox "Anstehend" card, the applications column and the due badge), checklist, to-dos, reasoning/markdown/interview-prep parsing, pending background tasks.
  - `src/features/job/`: the job page (`/jobs/[id]`), one folder per tab.
```

- [ ] **Step 5: Final checkpoint**

Run the format command, then: `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build' && "$QA"/webrun.sh pnpm test:e2e`
Expected: all green. Copy the screenshots back for the phase review (command in "How to run anything").

---

## Self-Review

**Spec coverage (phase 2 row: "Job page with all tabs"; done when "e2e journeys for documents, phases and company green"):**

| Spec item | Task |
|---|---|
| 4.2 header: monogram, title, company, meta, posting link, big score with band; score recedes from Beworben | 9 (D13, contradiction 1) |
| 4.2 read-only stepper + "Phase ändern ▾" with all guards (backward/skip confirm, apply without documents, outcome on close) | 4 (rules), 8 (Stepper, Menu), 10 |
| 4.2 two columns, sticky next-step card with all controls, apply checklist inside, "Termine & Daten" (follow-up date, contacts, recruiter, salary) | 9 (grid), 11, 12, 13 |
| 4.2 tabs: Passung (Passt/Lücken, re-analyse; feedback dropped D6) | 14 |
| 4.2 Unterlagen: generate/regenerate with notes, A4 preview of the PDF, edit HTML then re-render, uploads, profile documents attach, download | 15, 16, 17, 18 |
| 4.2 Firma: profile and deep dives, research start/refresh | 19 |
| 4.2 Interview: prep generate/regenerate | 20 |
| 4.2 Verlauf: history with notes, free notes, to-dos | 21 |
| 4.3 #1 status only through the phase menu, all guards; #3 checklist in the card, Vormerken/Aussortieren for OPEN; #4 terminology; #5 a11y (menu pattern, focus, 44 px); #6 step text, cancel only for generation; #7 fullscreen A4 on mobile, stepper/tab scroll-into-view (phase 1 primitives) | 10, 11, 12, 8, 15, 16 |
| 4.4 `nextStep(job, now)` `{kind, label, due?, action}`, unit tested per status | 5 |
| 5 visual rules, tokens, contrast | 8, 9 (CSS ported, no new colours) |
| 6 query keys, realtime -> cache, optimistic only with undo, error texts | 2, 7, 10 (undo), 11 |
| 7 unit tests for domain; e2e journeys (generate, edit + re-render, apply with checklist, apply without documents, interview prep, offer, close accepted/rejected, company research, phase change with backward confirm); screenshots 1440/390 both themes; no horizontal scroll at 375; no console errors | 1-21, 22, 23 |
| Inventory B.3/B.4 features (description, re-analyse, cancel, documents list/view/download/delete, notes autosave, to-dos, history, CompanyProfileView sections, deep dives, interview prep sections) | 14-21 |
| Nav highlight on `/jobs/[id]` (phase-1 ruling) | 9 |
| ISO date helper | 0 (adapter over the fix wave), 1 (calendar rules) |

Deferred on purpose: job tasks in the sidebar activity (phase 8, contradiction 9), `/companies` page itself (phase 7; the Firma tab links to it), contrast assertions in e2e (phase 8, as in phase 1).

**Placeholder scan:** no TBD/TODO. Two adapter points are explicit and bounded: Task 0 Step 1 records the fix-wave names, and Tasks 22/23 use the recorded allow-list option name. `PendingPanel` (Task 9) is a deliberate interim panel that Tasks 14-21 replace and Task 21 deletes.

**Type consistency:** `JobDetail` fields (`cv_html_present`, `cover_letter_html_present`, `pre_generation_status`, `checklist`, `todos`, `next_follow_up_at`) are the same in Tasks 2, 4, 5, 11-21 and the e2e fixtures; `DocumentKind` is `"cv" | "cover_letter"` everywhere (API query value and `DOCUMENT_LABEL` keys); `pendingTaskId.*` names match between Task 7 (`applyEvent`), 11 (generation), 14 (analysis), 17 (render), 19 (research) and 20 (prep); `useStartTask(taskId, start, onStarted?)` keeps one signature in Tasks 14, 17, 19, 20; `StatusGuard` kinds match between Task 4 and the dialog in Task 10; `TAB_PANELS` keys are the `JobTab` keys of Task 9.

**Review Focus:** each of the five items has a named test in its owning task: checklist keys (Task 5 `setChecklistItem`, Task 12 "sends all three keys"), event status (Task 7), advanced phase while generating (Task 4 `phaseOf`, Task 5 regenerating), naive dates and calendar days (Task 1), inline-PDF fallback and URL revocation (Task 8 `A4Preview`, Task 16 `useObjectUrl`).
