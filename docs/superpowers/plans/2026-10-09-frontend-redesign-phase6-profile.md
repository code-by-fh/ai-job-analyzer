# Frontend Redesign Phase 6 (Profil `/profile`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Profil (`/profile`): a masthead and an in-page sub-nav (vertical list on desktop, a 2x2 seg on mobile) with four sections that each save on their own: **Ziel** (Wunschrolle, Kenntnisse, Mindestgehalt, Ort, Präferenzen, gesprochene Sprachen), **Lebenslauf** (PDF import with AI parse, experience and projects editor, education, completeness hint), **Nachweise** (profile documents: upload, view, download, delete) and **Vorlagen** (CV and letter templates: upload with AI fill and live state, the `annotation_rejected` and failed states, select default, preview, delete), on top of four backend tasks that close the security and contract gaps these screens depend on.

**Architecture:** Four backend tasks (server only, pytest TDD) come first: bounded and type-checked uploads with a safe download header for profile documents; the profile contract (field limits, the CV import as a sync, routed, validated, bounded endpoint); the template lifecycle (a distinct failed state, task time limits, selection and delete rules); and a sandboxed template preview rendered with the owner's own profile. On the web, wire contracts go to `web/src/api/` (`profilePaths.ts` stays client-free for e2e fixtures), pure rules to `web/src/domain/profile.ts` and `web/src/domain/templates.ts`, and the screen to `web/src/features/profile/`. Sections reuse the phase 5 section-save model (`DrawerSection`, `useSectionForm`, `useDirtySections`, one partial `POST /settings` per section, B2). The template live state needs no polling: `template_ready` already invalidates the `["templates"]` prefix (`applyEvent.ts`), and a reconnect refetches active queries.

**Tech Stack:** unchanged from phases 1-5 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0; backend FastAPI, SQLAlchemy 2, pydantic 2, pypdf, slowapi, Celery, Redis, pytest on in-memory SQLite). No new dependency, no migration (the template `status` column is a free string; `annotation_failed` is a new value).

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 6 row "Profile", done when "e2e profile green"; section 4.2 `/profile` row; section 3 B2 "Profile and settings forms save independently" and B3 `template_ready`; section 7 journey "profile save (notification credentials survive)"; 4.3 #4, #5, #6, #7; 5; 6). Visual and behavioural source of truth: `docs/prototype/clickdummy-editorial.html` (`renderProfile`, `PROFILE_TABS`, `profileGoal`, `chipEditor`, `profileCV`, `profileTemplates`, `tplThumb`, `profileCerts`, CSS block `/* profile */`: `.subnav-tabs`, `.form-max`, `.entry*`, `.gallery`, `.tpl*`, `.thumb-*`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (#20 "Profil/Einstellungen sub-nav: in-page vertical list on desktop, seg on mobile", #22 ">= 44px targets for chip-remove x", #26 "Profile completeness hint on Profil › Lebenslauf (Lebenslauf ohne Ergebnisse -> schwächere Bewertungen)", layout "Profil/Einstellungen: pane max ~900px, 200px in-page sub-nav left, form cards right (form max 620px)"). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.0 documents and DocumentTemplate, A.5 `/settings`, `/settings/template`, `/settings/upload-cv`, A.9 profile documents and templates, A.11 WebSocket, A.13 #1, B.3 `/profile` and `DocumentTemplateGallery`, B.6 profile completion, C.1 "Profile document view/download", C.2 template polling, C.3 #2).

## Global Constraints

- **Placement:** web code in `web/`, backend code in `server/`; `frontend/` stays untouched. Backend Tasks 1-4 change only `server/`; web Tasks 5-13 change only `web/`; Task 14 changes only `context/`.
- **Base:** phase 5 is closed (its final wave green) before web Task 5 starts. Names in this plan are the real exported names of `web/src` and `server/` as of 2026-10-09 (listed in the Self-Review name check). Plan code never compiled: before writing, read the real exports of every module you import; if a name drifted, adapt the call, never the behaviour (phase 3 R5, phase 4 R5).
- **One implementer at a time for web.** All web tasks share the build mirror `$QA/web`; never run two web tasks in parallel. Backend Tasks 1-4 run strictly in order (Tasks 1 and 2 share `core/uploads.py`, Tasks 2 and 3 edit `routers/settings.py`, Tasks 3 and 4 edit `routers/templates.py`) and may run in parallel with web Task 5 only (Task 5 does not depend on them at runtime: every new field is optional in the schemas). Web Tasks 6-13 need Tasks 1-4 merged (their fixtures model the new contract).
- **Shared files:** re-read every shared file right before editing it (`de.ts`, `en.ts`, `queryKeys.ts`, `profileDocuments.ts`, `mockApi.ts`, `fixtures.ts`, `shell.spec.ts`, `globals.css`, `FileViewer.tsx`, `uploadRules.ts`, `routers/settings.py`, `routers/templates.py`, `routers/profile_documents.py`, `database/core.py`, `workers/tasks/fill_cv_template.py`, `workers/tasks/time_limits.py`, `tests/factories.py`); add or change only the lines named, never replace a whole file (phase 3 preflight 26).
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`; pass an object instead), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`. **Never disable a lint rule**; split into named helpers or sub-components instead. If Prettier pushes a function above 20 lines, split it. Python: type hints on new signatures, `status.*` constants instead of raw integers in new code, functions small and named, constants for codes, no bare `except:`; broad `except Exception` only where the code documents why.
- **React lint (eslint-plugin-react-hooks 7 incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`; event handlers may read the clock), no synchronous `setState` in an effect body (adopt server values with the previous-value pattern during render, phase 4 R27), no ref reads during render. An effect that must call the latest props uses `useEffectEvent`.
- **CSS:** component CSS lives in plain `.css` files inside `@layer components { ... }` (new file `src/features/profile/profile.css`, imported from `app/globals.css` after `sources.css`). No new inline `style` props. The guard test `tests/unit/theme/cssFiles.test.ts` fails on a markdown fence line in any CSS file. Utilities only for layout spacing. **Layout is CSS-driven:** the pane depends on the main column (which depends on the sidebar), so it uses a container query on `.profile` (`container-type: inline-size; container-name: profile`), never a viewport `@media` for the pane layout and never `useMediaQuery` (no hydration reflow).
- **Layers:** overlays use only the app `Dialog` (confirmations, document viewer, template preview); the full-screen A4 preview keeps its existing class. Stacking comes from the tokens `--z-drawer-scrim`, `--z-drawer`, `--z-dialog-scrim`, `--z-dialog` (`theme/tokens.css`); never hard-code a z-index for a layer.
- **Type size:** meaningful text (hints, meta lines, entry sub-lines, file size and date, template state lines, chip text) is at least 13 px (`var(--fs-13)`); the prototype's `.thumb-state` at `--fs-12` becomes `--fs-13`.
- **Colours (spec 5):** crimson (`Notice tone="error"`, `Button variant="danger"`) only for errors and destructive deletes, always with an icon and words. Amber (`Notice tone="warn"`, `--warn-text`) only for warnings: the template states "verworfen", "fehlgeschlagen" and "hängt" (they are usable-but-degraded, not errors). Vermilion only for primary buttons, the active nav item and focus; the default template's outline is **ink** (`--text`), not the prototype's vermilion outline (D9). No new spinner or pulsing indicator (the one allowed motion indicator is a running crawl): buttons use the existing `Button busy`, and long background states (AI template fill, CV import) are static text plus `aria-busy`.
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}`. Key blocks in this plan show the DE value with the EN value as a trailing `//` comment; the dictionaries themselves carry no comments. Reuse existing keys instead of adding twins: `nav.profile`, `dates.save` ("Speichern"), `sources.saved` ("Gespeichert."), `guard.cancel` ("Abbrechen"), `dialog.close`, `error.retry`, `loading`, `files.view`, `files.download`, `files.delete`, `files.deleteTitle`, `files.deleteText`, `files.deleteConfirm`, `files.deleted`, `files.uploaded`, `files.noPreview`, `files.driveUnsupported`, `files.serverTooLarge`, `files.serverUnsupportedType`, `files.tooLarge`, `files.unsupportedType`, `preview.title`, `unsaved.*`, `onboard.ai.*` (through `AiSetupAction`).
- **No raw server text:** server `detail`/`msg` text is never shown. Errors go through `describeError(error, t, overrides?)`; field errors from a 422 through `fieldErrorsFrom(error, toProfileField)` and a fixed text per field. Template statuses go through `templateState()` and `TEMPLATE_STATE_TEXT`; unknown statuses read as ready. File names and template names are user data and are shown as React text (escaped), never as HTML.
- **Untrusted HTML:** template HTML and preview HTML are only ever shown inside `<iframe sandbox="" srcDoc={prepareForEditing(html)}>` (no `allow-scripts`, no `allow-same-origin`; `prepareForEditing` strips active content and prepends the editor CSP). Never `dangerouslySetInnerHTML`.
- **URLs:** every external `href` passes `safeHref()` (`src/domain/links.ts`); this phase has none. App links use `profileHref(section)` (Task 5) and the existing `AI_SETTINGS_HREF` through `AiSetupAction`.
- **Unsaved changes:** every editing section reports dirtiness through one page-level `useDirtySections()` (it drives `useUnsavedChanges().setDirty`, the leave dialog for in-app links including the sub-nav links, and the unload warning). Only the open section is mounted, so leaving it (after "Änderungen verwerfen") drops its draft and its flag (`useReportDirty`). The CV import is inactive while the Lebenslauf form has unsaved edits (D6).
- **Live regions:** toasts keep their two persistent regions. This phase adds exactly one page region, `ProfileLiveStatus` (Task 6), mounted from the first render and never conditionally, fed by the page announcer (`useProfileAnnounce`) through `useClearThenSet` (`src/ui/useAnnouncement.ts`). It announces the start of a CV import and each template that leaves the AI fill during this visit; nothing else. Field errors keep `role="alert"` (existing `Field`).
- **Focus:** focus never falls to `<body>`. A control that disappears after its own action hands focus to a named target: a removed chip to its input, a removed CV entry to its list's "Eintrag hinzufügen" button, a deleted document or template to the section heading (`tabIndex={-1}`).
- **Gave-up queries:** a section with no data shows its error (not the skeleton) as soon as `givenUp(query)` (`src/api/queryState.ts`) is true.
- **Queries start in parallel:** the page prefetches the profile, profile documents, document templates, file templates and the setup status at mount (`usePrefetchQuery`), whatever section is open; no component waits for one query before starting another. Previews load only when opened.
- **States:** every section has loading (skeleton lines, `ListLoading`), error (`ListError` with retry, as soon as `givenUp`) and empty states (copy in the tasks).
- **Accessibility (spec 4.3 #5):** the sub-nav is a `<nav>` of links with `aria-current="page"` (not tabs, D2); visible focus rings; control borders >= 3:1 (`--line-control`); hit targets >= 44 px below 768 px (chip remove buttons, nav links, row icon buttons, template card buttons); icon-only buttons have an `aria-label` that names the item; no nested interactive elements (a template card is a `<li>` with separate buttons, not a button).
- **E2E:** every UI task ships its own Playwright spec. The auto fixtures fail a test on any unmocked API call and any console error. Fixtures are typed with the `z.input` types of the real schemas and import runtime values only from client-free modules (`src/api/profilePaths.ts`, `src/domain/profile.ts`, `src/domain/templates.ts`, `tests/e2e/support/*`); never from `src/api/profile.ts`, `src/api/templates.ts`, `src/api/profileDocuments.ts` or any module that imports `src/api/instance.ts` (type-only imports are fine). Each UI spec saves screenshots at 1440 and 390 in both `COLOR_SCHEMES` through `saveScreenshot`, **with the pointer moved away first** (`await page.mouse.move(0, 0)`), and checks `horizontalOverflow(page) === 0`; the frame (Task 6) is also checked at `VIEWPORTS.narrow` (375) for every section.
- **FakeServer models the real server and does not echo:** `support/profileServer.ts` (Task 6, extended per task) answers from its own state with the real server's rules (partial `POST /settings`, masked secrets on `GET /settings`, field limits as 422, 413/415 for uploads, 409 for a processing template, delete resets the default), and a request body is never returned as the answer.
- **Reuse, do not add a second:** `DrawerSection` and `useSectionForm` (`features/sources/drawer/`), `useDirtySections`, `givenUp`, `useClearThenSet`, `describeError`, `fieldErrorsFrom`, `useUnsavedChanges`, `Dialog`, `PanelHeader`, `A4Preview`, `prepareForEditing`, `useObjectUrl`, `saveFile`, `DRIVE_UNSUPPORTED`, `formatFileSize`, `viewKind`, `uploadProblem`, `FileContent` (exported from `FileViewer.tsx` in Task 10), `AiSetupAction`, `ListLoading`, `ListError`, `Masthead`, `EmptyState`, `Notice`, `Button`, `Seg`, `TextField`, `TextAreaField`, `Tag`, `useToast`, `useNow`, `formatDate`, `navNumber`, `PROFILE_HREF`, `setupStatusQueryOptions`, `profileDocumentsQueryOptions`, `live`, `reply`, `setRoutes`, `pushEvent`, `fixNow`, `saveScreenshot`, `horizontalOverflow`. No polling.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a unit test:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/profile.test.ts`
- **Run one e2e spec:** only through `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profile.spec.ts` (it builds with the mock API URL first). **Build mirror note:** a plain `pnpm build` bakes in the real API URL and makes every following `playwright test` fail; if you build separately, use `NEXT_PUBLIC_API_URL=http://localhost:3101/mock-api pnpm build`.
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"` (formats the repo files, not the mirror).
- **Checkpoint (every web task):** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` -> all five exit 0. If the combined form is blocked, run the five as separate commands; all must pass. `test:e2e` is part of every checkpoint, also for tasks without UI.
- **Screenshots:** they land in the mirror; copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Backend tests (Tasks 1-4):** `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""` (append a path or node id for a subset). The backend checkpoint is the full suite.
- **Lockfile:** this phase adds no dependency.

## Review Focus

1. **Saving the profile next to stored notification credentials.** The user has Pushover, Resend, Mailjet and SMTP credentials and Google Drive connected, then saves Ziel, then Lebenslauf, then picks a default template, then imports a CV. Expected: every request carries only its own section's fields; no secret, no `__masked__` and no notification field is ever sent or shown; all credentials and the storage setting are unchanged afterwards. Test: Task 2 `test_profile_save_from_the_web_keeps_every_credential`, `test_cv_import_keeps_every_credential`; Task 5 unit "the profile schema drops secrets and notification fields"; Task 7 unit "Speichern sends only the goal fields"; Task 13 journey "profile save (notification credentials survive)" (asserts the sent bodies and the FakeServer's stored secrets).
2. **A CV import that meets unsaved edits, an existing CV or a bad file.** The user has edited an entry in Lebenslauf and then picks a PDF; or the profile already holds experience; or the file is a scanned PDF without text, a renamed `.docx`, an `.PDF` in capitals, 10 MB + 1 byte, or the AI answers garbage. Expected: the import is inactive while the Lebenslauf form is dirty ("Erst speichern oder verwerfen."); with existing data a dialog says what gets replaced before anything is sent; a refused file gets a fixed sentence (413, 415, "kein Text", "KI konnte nicht lesen") and nothing in the profile changes; a valid capital `.PDF` with any declared type works; stored values the CV does not name are kept. Test: Task 2 `test_cv_import_refuses_a_non_pdf_even_with_a_pdf_name`, `test_cv_import_accepts_an_uppercase_extension_and_any_declared_type`, `test_cv_import_refuses_a_file_over_the_limit`, `test_cv_import_without_text_is_a_field_error`, `test_cv_import_parse_failure_is_502_and_changes_nothing`, `test_cv_import_keeps_stored_values_the_cv_does_not_name`; Task 9 unit "inactive while the form is dirty", "asks before replacing existing data", "maps each refusal to its sentence", e2e "a scanned PDF changes nothing".
3. **Template live state when the event is missed or the AI fill never ends.** The user uploads a CV template and leaves the page; the socket is down when `template_ready` arrives; the AI output is rejected by the Jinja check; the AI call raises; the worker dies (hard kill) and the row stays `processing`; the user tries to make a processing template the default; the user deletes the current default. Expected: a returning or reconnecting page shows the stored state (refetch); rejected and failed show an amber line saying the template is used without profile data; a `processing` row older than 15 minutes reads "hängt" with "Löschen" as the way out; a processing template cannot become the default (button absent, server 409); deleting the default makes the bundled "Klassisch" the default on server and screen. Test: Task 3 `test_ai_failure_marks_the_template_failed_and_tells_the_owner`, `test_soft_time_limit_during_the_ai_call_marks_it_failed`, `test_store_failure_marks_it_failed`, `test_a_template_still_being_filled_cannot_become_the_default`, `test_deleting_the_selected_template_resets_the_default`; Task 5 unit `templateState` (stall boundary), `defaultRef` (deleted default); Task 12 unit "a processing card has no Als Standard", "announces each template that leaves the fill once", e2e "a rejected fill shows the warning after the event" and "a stalled fill offers delete".
4. **Odd and hostile files in Nachweise.** A proof named `Zeugnis "Müller" Łódź.pdf`; an HTML file renamed `bild.png` and sent as `image/png`; a `text/html` upload; 10 MB + 1 byte; a document stored on Google Drive; another user's document id. Expected: the download works and the browser saves the original name (RFC 5987 `filename*`); the renamed HTML and `text/html` are refused with 415 without the type in the body; the oversized file is refused with 413 before it is held in memory in full; a Drive document lists with view and download inactive and a reason; a foreign id is 404 for view, download and delete. Test: Task 1 `test_download_name_with_quotes_and_non_latin_characters`, `test_upload_refuses_bytes_that_do_not_match_the_declared_type`, `test_upload_refuses_an_unlisted_type_without_echoing_it`, `test_upload_refuses_a_file_over_the_limit_without_echo`, `test_drive_document_is_listed_as_not_downloadable`, `test_foreign_document_is_not_found_for_view_download_and_delete`; Task 10 unit "a Drive document has no view or download", e2e "downloads keep the original file name".
5. **Hostile template HTML in the preview.** A stored CV template with `{{ cycler.__init__.__globals__.os.popen(...) }}` (stored before the save check existed), a template with `<script>` and `onerror=`, a profile value `<script>alert(1)</script>`, a foreign template id, a bundled key like `../../etc/passwd`. Expected: the server refuses the hostile template with 422 `template_rejected` without running it; profile values are escaped; foreign and unknown references are 404; the web shows the preview only in a script-less sandboxed frame behind the editor CSP, and nothing in the page or its title changes. Test: Task 4 `test_preview_of_a_hostile_stored_template_is_refused_without_running_it`, `test_preview_values_are_escaped`, `test_preview_of_another_users_template_is_not_found`, `test_preview_of_an_unknown_bundled_key_is_not_found`; Task 11 unit "the preview frame has an empty sandbox and the CSP", e2e "a script in the preview never runs".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | URL state | `/profile?section=lebenslauf|nachweise|vorlagen`; the default "Ziel" has no parameter. The parameter name matches the settings contract (`?section=`, `AI_SETTINGS_HREF`), the values match the visible German labels like the inbox (`?tab=unter`). An unknown value shows Ziel and is not rewritten. One builder `profileHref(section)` and one parser `sectionFromParam(value)` in `domain/profile.ts`. Sub-nav links use normal `Link` navigation (push): the sections are sub-pages, Back walks them. |
| D2 | Sub-nav | Usability #20: an in-page `<nav aria-label="Profilbereiche">` with four links (Ziel, Lebenslauf, Nachweise, Vorlagen, in the spec's order), `aria-current="page"` on the open one. Desktop: a 200 px vertical list left of the pane (pane max 900 px, forms max 620 px). Below a 720 px wide `.profile` container: one row as a seg (2x2 below 420 px), links >= 44 px. Links, not WAI-ARIA tabs, because each section is its own URL and the unsaved-changes guard intercepts in-app links (`UnsavedChanges.tsx`), so a dirty section asks before the switch. Only the open section is rendered. |
| D3 | Save model | Each editable section is its own `<form>` (`DrawerSection`) with its own "Speichern", inactive (focusable, `aria-disabled`) while clean, and sends only its own fields in one partial `POST /settings` (B2; `_apply_partial_update` writes only `model_fields_set`): Ziel sends `role, skills, min_salary, location, preferences, spoken_languages`; Lebenslauf sends `cv_data`. Success writes the sent values into the `["settings","profile"]` cache, invalidates it and `["setup-status"]` (`profile_complete`), toasts "Gespeichert." A section adopts a background refetch only while it is clean (`useSectionForm`). The page never sends a notification field, a secret or `__masked__`; the profile schema does not even parse them. |
| D4 | Ziel fields | Spec 4.2 wins over the prototype: **Wunschrolle** (text, 200), **Kenntnisse** (chip editor over the stored comma string, joined with ", "; a chip <= 100 chars, the joined string <= 2000), **Mindestgehalt** (text with `inputMode="numeric"`, 50, hint "Brutto pro Jahr in Euro"; the server stores a string and legacy values such as "60k" stay editable), **Ort** (text, 200; one string, not the prototype's location chips, because the server stores one), **Präferenzen** (textarea, 5000, hint naming Arbeitsmodell and Ausschlusskriterien), **Gesprochene Sprachen** (chip editor, <= 20 entries of <= 50 chars). Skills are in Ziel because the spec lists them there (the prototype shows them under Lebenslauf). |
| D5 | Lebenslauf editor | One form: Berufserfahrung and Projekte as entry lists (read view with "Bearbeiten"; edit view with the fields, "Fertig" and "Entfernen"; "Eintrag hinzufügen" appends an empty entry in edit view and focuses its first field; at most 30 per list), then Ausbildung (textarea, 5000). Edits stay drafts until "Speichern"; "Entfernen" needs no dialog because nothing is stored until saved (leaving asks through the unsaved guard). Entries whose fields are all blank are dropped on save (`cleanCv`). Experience fields: Rolle, Arbeitgeber, Zeitraum, Beschreibung (hint "Konkrete Ergebnisse helfen der KI am meisten, z. B. Zahlen und Technologien."); project fields: Name, Technologien, Beschreibung. |
| D6 | CV import | A secondary button "Lebenslauf importieren (PDF)" at the top of Lebenslauf. Inactive while the Lebenslauf form is dirty (title "Erst speichern oder verwerfen."), so an import never races a draft (Ziel cannot hold a draft at the same time: only the open section is mounted, and leaving it asks first); without an AI provider (`setup-status.ai_configured` false) it is replaced by the sentence "Für den Import muss eine KI eingerichtet sein." plus `AiSetupAction`. Client check first (PDF by type or `.pdf` name in any case, <= 10 MB). When the profile already has a role, skills or CV entries, a `Dialog` asks "Lebenslauf übernehmen?" and says what is replaced ("Berufserfahrung, Projekte und Ausbildung werden ersetzt. Rolle, Kenntnisse, Ort und Gehalt werden ersetzt, wenn der Lebenslauf sie nennt."). The server stores the result itself (today's behaviour), so success refetches the profile; toast "Lebenslauf übernommen. Prüfe Ziel und Lebenslauf." While it runs (up to a minute, sync AI call) the button is busy and the page region says "Der Lebenslauf wird gelesen. Das kann bis zu einer Minute dauern." Refusals map to fixed sentences (413, 415, 422 `cv_no_text`, 5xx). |
| D7 | Completeness hint | Usability #26 on Lebenslauf, from the **stored** profile (what the AI reads), as an info `Notice` above the form: "Noch unvollständig: {list}. Ein Lebenslauf ohne Ergebnisse führt zu schwächeren Bewertungen." The list names, in order: Wunschrolle, Kenntnisse (both with a link "Unter Ziel ergänzen"), Berufserfahrung, Ergebnisse in der Berufserfahrung (an experience entry without description), Ausbildung. No percentage (the old 8-field bar mixed goals and CV). Hidden when nothing is missing. |
| D8 | Nachweise | List rows (name = label or file name, Art "Zertifikat"/"Referenz", size, upload date) with icon buttons Ansehen (PDF and images only), Herunterladen, Löschen (confirmation `Dialog` with the existing `files.delete*` texts). Upload: a `Seg` "Art" (Zertifikat default, Referenz) and a file button (multiple; PDF, Word, JPEG, PNG, WEBP; <= 10 MB each, checked first); files upload one after the other in one mutation scope, each with its own toast. A Google Drive document (`downloadable: false`) keeps its row with Ansehen and Herunterladen inactive and the title "Dateien aus Google Drive lassen sich hier noch nicht öffnen." The viewer is the job page's (`FileContent` in a `Dialog`, PDF on the A4 sheet). Uploading invalidates `["profile-documents"]`, which the job page's attach list reads too. |
| D9 | Vorlagen gallery | Two sections, Lebenslauf and Anschreiben, each a grid of cards (CSS thumbnail as in the prototype, `aria-hidden`), built from the bundled file templates (`GET /profile/templates`, e.g. "classic" -> "Klassisch", meta "Mitgeliefert"), global admin templates (meta "Für alle") and the user's own (meta "Hochgeladen am {date}"). The default card has an **ink** 3 px outline and the line "Standard für neue Bewerbungen"; other ready cards offer "Als Standard" (`PATCH /settings/template`). Every card offers "Vorschau"; own cards offer "Löschen" (confirmation; when it is the default the text adds "Danach wird „Klassisch“ verwendet."). The stored default that is not in the gallery (deleted, foreign) reads as the bundled default, like the server's fallback. |
| D10 | Upload and live state | A last card per section "Lebenslauf-Vorlage hochladen" / "Briefvorlage hochladen" (HTML only, <= 1,000,000 characters, checked after reading the file as text; name = file name without extension, trimmed, <= 100). CV uploads start the AI fill (server status `processing`); the card shows "KI setzt Platzhalter ein …" (static text, `aria-busy`), no Als Standard. `template_ready` invalidates `["templates"]`; the card then shows ready, or an amber line for `annotation_rejected` ("Die KI-Platzhalter wurden verworfen. Die Vorlage wird ohne deine Profildaten verwendet.") or `annotation_failed` ("Die KI konnte die Vorlage nicht befüllen. Sie wird ohne deine Profildaten verwendet."). Both stay selectable (they render, without profile data) but the line stays visible. A `processing` card whose `updated_at` is older than 15 minutes is "stalled": "Das dauert ungewöhnlich lange. Lösche die Vorlage und lade sie erneut hoch." The page region announces each template that leaves the fill during the visit ("„{name}“ ist bereit." / "... verworfen." / "... fehlgeschlagen."). Answers the open question "`template_ready` consumers": invalidation is enough for the live state, together with the reconnect refetch and the stall rule for a lost worker. |
| D11 | Preview | "Vorschau" opens a `Dialog` with the A4 sheet (`A4Preview` children) showing `GET /document-templates/preview?doc_type=&template=` (Task 4): the template rendered with the user's own profile (name, role, skills, experience, projects, education) and, for letters, a fixed sample text and company, so the bundled "Klassisch" can be previewed too. The HTML is shown in `<iframe sandbox="" srcDoc={prepareForEditing(html)}>`. 422 reads "Diese Vorlage lässt sich nicht darstellen."; the full-screen button is not offered (it exists for PDFs only). |
| D12 | Mobile | CSS only. The sub-nav becomes a seg (D2); forms take the full width; chip remove buttons, entry buttons, row icon buttons and card buttons are 44 px; Nachweise rows stack (name and meta, then the buttons); the gallery is two columns down to 340 px, then one; dialogs are full screen (existing overlay rule below 768 px). |
| D13 | Live region | `ProfileLiveStatus`: one persistent visually hidden `<p role="status">` rendered by the page, text from a small external store (`createAnnouncer`, Task 6) through `useSyncExternalStore` and `useClearThenSet(id)`, so the same sentence twice is read twice. Writers: the CV import start (event handler) and `useTemplateOutcomes` (effect over the gallery). |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | `POST /profile/documents` reads the whole upload into memory before the size check, trusts the client's `Content-Type`, echoes the rejected type (`"File type not allowed: text/html"`) and an invalid `doc_type`, and the download header puts the raw file name into `filename="..."` (a quote breaks it; a name outside Latin-1 raises a 500) | **Backend Task 1:** `core/uploads.py` reads at most limit + 1 bytes, checks magic bytes against the declared type, refuses with fixed codes (`file_too_large` 413, `unsupported_type` 415, `invalid_doc_type` 422 on the field), and builds `Content-Disposition` with an ASCII fallback and RFC 5987 `filename*`. The label is bounded (200), the stored file name truncated (255). |
| G2 | `GET /profile/documents` does not say which documents can be viewed (Drive documents answer 400) | **Backend Task 1:** each item carries `downloadable` (stored in the database). |
| G3 | `SettingsData` has no length limits; every profile field goes into each AI prompt | **Backend Task 2:** limits on every profile field and on the CV lists (role 200, skills 2000, min_salary 50, location 200, preferences 5000, spoken languages 20 x 50, 30 entries per list, entry titles 200, duration 100, entry texts and education 5000); a refusal is a 422 on the field and never echoes the input (existing `_without_input_echo`). Entry fields default to `""`, so a missing field is no error. The web mirrors the limits (`PROFILE_LIMITS`). |
| G4 | `POST /settings/upload-cv` is `async def` around a blocking AI call (it stalls the API event loop for up to a minute), reads any size, checks only `filename.endswith(".pdf")`, sends unlimited text to the AI, always uses OpenRouter (ignores the provider routing that `ai_configured` reports), stores the AI's JSON unvalidated (any shape lands in `cv_data`) and overwrites the role with an empty string when the AI returns one; two different refusals share 400 and their German detail | **Backend Task 2:** a sync endpoint; 10 MB cap; `%PDF-` signature (any name, any declared type); the first 10 pages and 30,000 characters; the provider routed for `job_analysis` (the task `ai_configured` checks, so onboarding and import agree); the answer validated into `ParsedCv` (same limits); only non-empty values replace stored ones, the CV data is replaced as a whole; fixed codes: 413 `file_too_large`, 415 `unsupported_type`, 422 `cv_no_text` on `file`, 502 `cv_parse_failed`. Rate limit 10/min stays. |
| G5 | The fill task resets the status to `None` when the AI call fails, so the web cannot tell a failed fill from a finished one; a DB error while storing leaves `processing` forever without an event; the task has no time limit | **Backend Task 3:** status `annotation_failed` (AI error, soft time limit, store failure), always with `template_ready`; soft/hard limits 660/720 s (above the 600 s Ollama timeout). A hard kill still leaves `processing`: the web's stall rule (D10) covers it. |
| G6 | A `processing` template can be made the default (generation then renders the unannotated HTML); deleting the default leaves the profile pointing at a missing id; a template name may be empty or unbounded | **Backend Task 3:** `_check_template_selection` answers 409 `template_processing`; delete resets a selection that named the template to `None` (the bundled default); create/update trim the name and require 1-100 characters (422 on `name`). |
| G7 | No way to preview a bundled template, and a user template's raw HTML shows its Jinja tags | **Backend Task 4:** `GET /document-templates/preview` renders with the owner's profile through the same renderers as the generation (user CV templates through the isolated sandbox `render_jinja2_template`), owner-scoped through `find_usable_template`, bundled keys only from `list_templates()`, 422 `template_rejected` (fixed), rate limit 20/min. |
| G8 | The prototype offers "Speichern und offene Stellen neu bewerten" | **Dropped** (no backend; a bulk re-analysis costs one AI call per open job). Reported to the user as a product question. |
| G9 | The prototype has an "Arbeitsmodell" seg and location chips | **Dropped**: no backend field; Präferenzen (free text, read by the AI) and one Ort field cover them (D4). Reversible. |
| G10 | The prototype's Nachweise have a per-document "Bei Bewerbungen beilegen" flag and a document date | **Dropped**: no backend field; the job page's per-job attach choice (phase 2, `useAttachChoice`) decides per application. The row shows the upload date instead. Reversible. |
| G11 | The prototype accepts DOCX and PDF templates | **HTML only**: the server stores and renders HTML (`MAX_TEMPLATE_HTML_LENGTH`). |
| G12 | The prototype deck says "Zuletzt geändert am …" | **Dropped**: the profile has no change time. The deck is the prototype's first sentence. |
| G13 | `GET /settings` returns the whole profile with masked secrets; three web queries already read it with narrow schemas | `profileQueryOptions()` reads it with a profile-only schema under `["settings","profile"]` (zod strips every other key). A fourth small request next to language and time zone is accepted (cached). |
| G14 | `mockApi` `respond(sent)` gets only parsed JSON, so a FakeServer cannot read a multipart file name or a preview query | **Task 6:** `respond(sent, request)` also receives the Playwright `Request` (existing callers ignore it). |
| G15 | `routers/jobs.py` builds its document download headers the same unsafe way as G1 | **Not changed here** (surgical; its upload/download endpoints are untested, see the tracker risk). Recorded in the tracker by Task 14. |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `core/uploads.py` (new) | `read_upload`, `read_upload_sync`, `check_size`, `matches_type`, `require_type`, `content_disposition`, `field_error`, codes (Task 1) |
| `routers/profile_documents.py` | bounded typed upload, fixed codes, `downloadable`, safe header (Task 1) |
| `database/core.py` | profile and CV limits, entry defaults (Task 2); template name constraints (Task 3) |
| `routers/settings.py` | sync, routed, validated CV import (Task 2); selection refuses a processing template (Task 3) |
| `workers/tasks/fill_cv_template.py`, `workers/tasks/time_limits.py` | `annotation_failed`, time limits, always an event (Task 3) |
| `services/template_access.py` | `TEMPLATE_STATUS_PROCESSING` (Task 3) |
| `routers/templates.py` | delete resets the default (Task 3); preview endpoint (Task 4) |
| `services/template_preview.py` (new) | `PreviewSource`, `render_preview`, `file_template_exists` (Task 4) |
| `tests/factories.py` | `make_profile_document` (Task 1) |
| `tests/test_uploads.py`, `tests/test_profile_documents_contract.py`, `tests/test_profile_contract.py`, `tests/test_template_lifecycle.py`, `tests/test_template_preview.py` (new) | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/api/profilePaths.ts` | client-free paths, limits, accepted types, statuses (Task 5) |
| `src/api/profile.ts` | profile query, partial save, CV import (Task 5) |
| `src/api/templates.ts` | template list, file templates, preview, default, upload, delete (Task 5) |
| `src/domain/profile.ts` | sections and URL, skills chips, CV gaps, `cleanCv`, field mapping (Task 5) |
| `src/domain/templates.ts` | kinds, `templateState`, `galleryOf`, `defaultRef`, `canBeDefault`, `templateOutcome` (Task 5) |
| `src/features/profile/ProfilePage.tsx`, `ProfileNav.tsx`, `useProfileSection.ts`, `announcer.ts`, `ProfileLiveStatus.tsx`, `SectionState.tsx`, `profile.css` | frame (Task 6) |
| `src/features/profile/goal/GoalSection.tsx`, `goalDraft.ts`, `ChipListField.tsx`, `useProfileSave.ts` | Ziel (Task 7) |
| `src/features/profile/cv/CvSection.tsx`, `EntryList.tsx`, `entryFields.ts`, `CvGapsNotice.tsx` | Lebenslauf (Task 8) |
| `src/features/profile/cv/CvImport.tsx`, `useCvImport.ts` | CV import (Task 9) |
| `src/features/profile/proofs/ProofsSection.tsx`, `ProofUpload.tsx`, `ProofRow.tsx`, `ProofViewer.tsx`, `useProofs.ts` | Nachweise (Task 10) |
| `src/features/profile/templates/TemplatesSection.tsx`, `TemplateGallery.tsx`, `TemplateCardView.tsx`, `TemplatePreview.tsx`, `useTemplateActions.ts`, `labels.ts` | Vorlagen gallery (Task 11) |
| `src/features/profile/templates/TemplateUpload.tsx`, `useTemplateUpload.ts`, `useTemplateOutcomes.ts`, `TemplateStateLine.tsx` | upload and live state (Task 12) |
| `tests/unit/api/profileApi.test.ts`, `tests/unit/domain/profile.test.ts`, `tests/unit/domain/templates.test.ts`, `tests/unit/features/profile/*.test.tsx`, `tests/unit/support/profileRoutes.ts`, `tests/unit/theme/profileStyles.test.ts` | unit tests |
| `tests/e2e/support/profileFixtures.ts`, `tests/e2e/support/profileServer.ts`, `tests/e2e/profile*.spec.ts` | fixtures, fake server, specs |

Web, modified: `app/(app)/profile/page.tsx`, `app/globals.css`, `src/api/profileDocuments.ts`, `src/api/queryKeys.ts`, `src/features/job/documents/FileViewer.tsx` (export `FileContent`), `src/features/job/documents/uploadRules.ts` (`uploadProblem` takes the accepted list), `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/e2e/support/mockApi.ts` (`respond(sent, request)`), `tests/e2e/shell.spec.ts` (drop `/profile` from the placeholder routes), `tests/unit/realtime/handleMessage.test.ts` (preview refresh), `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`, `context/code-standards.md`.

Task order: backend 1 -> 2 -> 3 -> 4 (strict); web Task 5 may run beside backend Tasks 1-4; web Tasks 6 -> 13 strictly in order after Task 4; Task 14 last (needs every report).

---
### Task 1: Backend: profile document uploads (bounded read, real type, safe download name, owner scoping)

**Files:**
- Create: `server/core/uploads.py`, `server/tests/test_uploads.py`, `server/tests/test_profile_documents_contract.py`
- Modify: `server/routers/profile_documents.py` (`upload_profile_document`, `_serialize`, `_serve`, new `_checked_upload`, `_stored_name`), `server/tests/factories.py` (`make_profile_document`)

**Interfaces:**
- Consumes: `get_storage_service` (`services/storage.py`), `ProfileDocument`, `UserProfile` (`database/core.py`), the `api_client`/`seed`/`session_factory` fixtures (`tests/conftest.py`), `make_user`, `OTHER_USER_ID`, `fetch` (`tests/factories.py`).
- Produces:
  - `core/uploads.py`: `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`; codes `FILE_TOO_LARGE = "file_too_large"`, `UNSUPPORTED_TYPE = "unsupported_type"`; `PDF_TYPE = "application/pdf"`; `check_size(content: bytes, max_bytes: int) -> bytes` (413); `async read_upload(file: UploadFile, max_bytes: int) -> bytes`; `read_upload_sync(file: UploadFile, max_bytes: int) -> bytes`; `matches_type(content: bytes, mime_type: str) -> bool`; `require_type(content: bytes, mime_type: str) -> None` (415); `content_disposition(disposition: str, filename: str) -> str`; `field_error(field: str, code: str) -> dict` (one pydantic-shaped 422 item, `loc ["body", field]`).
  - `GET /profile/documents` items: `{id, doc_type, label, original_filename, file_size, mime_type, created_at, downloadable}`.
  - `POST /profile/documents`: 413 `{"detail": "file_too_large"}`, 415 `{"detail": "unsupported_type"}` (declared type not allowed, or bytes not matching it), 422 `[{"loc": ["body", "doc_type"], "msg": "invalid_doc_type", ...}]`, 422 on `label` over 200 characters.
  - `GET /profile/documents/{id}/download|view`: `Content-Disposition: <disposition>; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>`.

- [ ] **Step 1: Write the failing tests**

`server/tests/factories.py`, add `ProfileDocument` to the `database.core` import and:

```python
PDF_BYTES = b"%PDF-1.7\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n"


def make_profile_document(**overrides) -> ProfileDocument:
    fields = {
        "id": 70,
        "user_id": TEST_USER_ID,
        "doc_type": "CERTIFICATE",
        "label": "Zeugnis.pdf",
        "filename": "db://Zeugnis.pdf",
        "original_filename": "Zeugnis.pdf",
        "file_size": len(PDF_BYTES),
        "mime_type": "application/pdf",
        "content": PDF_BYTES,
    }
    fields.update(overrides)
    return ProfileDocument(**fields)
```

`server/tests/test_uploads.py`:

```python
import pytest
from fastapi import HTTPException

from core.uploads import check_size, content_disposition, matches_type

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 8
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 8
WEBP = b"RIFF\x10\0\0\0WEBPVP8 "
DOC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 8
DOCX = b"PK\x03\x04" + b"\0" * 8
HTML = b"<html><script>alert(1)</script></html>"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@pytest.mark.parametrize("content,mime", [
    (b"%PDF-1.4", "application/pdf"), (PNG, "image/png"), (JPEG, "image/jpeg"),
    (WEBP, "image/webp"), (DOC, "application/msword"), (DOCX, DOCX_TYPE),
])
def test_matching_signatures_pass(content, mime):
    assert matches_type(content, mime)


@pytest.mark.parametrize("content,mime", [
    (HTML, "image/png"), (HTML, "application/pdf"), (PNG, "application/pdf"),
    (b"RIFF\x10\0\0\0WAVEfmt ", "image/webp"), (b"%PDF-1.4", "text/html"), (b"", "application/pdf"),
])
def test_mismatching_or_unknown_types_fail(content, mime):
    assert not matches_type(content, mime)


def test_check_size_refuses_one_byte_over_with_a_fixed_code():
    with pytest.raises(HTTPException) as refused:
        check_size(b"x" * 11, 10)
    assert (refused.value.status_code, refused.value.detail) == (413, "file_too_large")


def test_content_disposition_survives_quotes_and_non_latin_names():
    header = content_disposition("attachment", 'Zeugnis "Łódź".pdf')
    header.encode("latin-1")  # Starlette encodes headers as Latin-1; this must not raise
    assert header == (
        "attachment; filename=\"Zeugnis ___d__.pdf\"; "
        "filename*=UTF-8''Zeugnis%20%22%C5%81%C3%B3d%C5%BA%22.pdf"
    )


def test_content_disposition_falls_back_for_a_name_without_safe_characters():
    assert content_disposition("inline", "ÄÖÜ").startswith('inline; filename="___"')
    assert content_disposition("inline", "  ").startswith('inline; filename="document"')
```

(Every character outside `[A-Za-z0-9._ -]` becomes one `_`: `"`, `Ł`, `ó`, `ź` and `"`, so the fallback is `Zeugnis ___d__.pdf`.)

`server/tests/test_profile_documents_contract.py`:

```python
"""Profile documents: bounded typed uploads, fixed refusals, safe download names, owner scoping."""

import pytest

from database.core import ProfileDocument
from tests.factories import OTHER_USER_ID, PDF_BYTES, fetch, make_profile_document, make_user

HTML = b"<html><script>alert(1)</script></html>"
DOC_ID = 70


def _upload(api_client, content=PDF_BYTES, mime="application/pdf", name="Zeugnis.pdf", **form):
    data = {"doc_type": "CERTIFICATE", **form}
    return api_client.post("/profile/documents", files={"file": (name, content, mime)}, data=data)


def test_upload_stores_a_pdf_and_lists_it_as_downloadable(api_client):
    assert _upload(api_client).status_code == 200
    [item] = api_client.get("/profile/documents").json()
    assert (item["original_filename"], item["mime_type"], item["file_size"], item["downloadable"]) == (
        "Zeugnis.pdf", "application/pdf", len(PDF_BYTES), True,
    )


def test_upload_refuses_a_file_over_the_limit_without_echo(api_client, monkeypatch):
    monkeypatch.setattr("routers.profile_documents.MAX_FILE_SIZE", len(PDF_BYTES) - 1)
    response = _upload(api_client)
    assert (response.status_code, response.json()) == (413, {"detail": "file_too_large"})


def test_upload_refuses_bytes_that_do_not_match_the_declared_type(api_client, session_factory):
    response = _upload(api_client, content=HTML, mime="image/png", name="bild.png")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})
    with session_factory() as db:
        assert db.query(ProfileDocument).count() == 0


def test_upload_refuses_an_unlisted_type_without_echoing_it(api_client):
    response = _upload(api_client, content=HTML, mime="text/html", name="x.html")
    assert response.status_code == 415
    assert "text/html" not in response.text


def test_upload_refuses_an_unknown_doc_type_on_the_field(api_client):
    response = _upload(api_client, doc_type="PASSWORD_SECRET_4711")
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "doc_type"]
    assert "PASSWORD_SECRET_4711" not in response.text


def test_upload_refuses_an_overlong_label(api_client):
    response = _upload(api_client, label="x" * 201)
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, ["body", "label"])


def test_download_name_with_quotes_and_non_latin_characters(api_client, seed):
    seed(make_profile_document(original_filename='Zeugnis "Łódź".pdf'))
    response = api_client.get(f"/profile/documents/{DOC_ID}/download")
    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith(
        "filename*=UTF-8''Zeugnis%20%22%C5%81%C3%B3d%C5%BA%22.pdf"
    )
    assert response.content == PDF_BYTES


@pytest.mark.parametrize("method,suffix", [("get", "/view"), ("get", "/download"), ("delete", "")])
def test_foreign_document_is_not_found_for_view_download_and_delete(api_client, seed, session_factory, method, suffix):
    seed(make_user(OTHER_USER_ID), make_profile_document(user_id=OTHER_USER_ID))
    response = getattr(api_client, method)(f"/profile/documents/{DOC_ID}{suffix}")
    assert response.status_code == 404
    assert fetch(session_factory, ProfileDocument, DOC_ID) is not None


def test_drive_document_is_listed_as_not_downloadable(api_client, seed):
    seed(make_profile_document(filename="gdrive://Zeugnis.pdf", content=None))
    [item] = api_client.get("/profile/documents").json()
    assert item["downloadable"] is False
    assert api_client.get(f"/profile/documents/{DOC_ID}/view").status_code == 400
```

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_uploads.py tests/test_profile_documents_contract.py`
Expected: FAIL: `ModuleNotFoundError: No module named 'core.uploads'`; the contract tests fail on the missing `downloadable` key, 200 for the renamed HTML, the echoed type, 400 instead of 422 for `doc_type`, and a 500 (`UnicodeEncodeError`) for the Łódź download.

- [ ] **Step 3: The upload module**

`server/core/uploads.py`:

```python
"""Bounded reading, content type checks and download headers for user uploads.

Used by the profile documents (routers/profile_documents.py) and the CV import (routers/settings.py).
Every refusal is a fixed code: the client's file name and declared type are never echoed.
"""

import re
from urllib.parse import quote

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
FILE_TOO_LARGE = "file_too_large"
UNSUPPORTED_TYPE = "unsupported_type"
PDF_TYPE = "application/pdf"
WEBP_TYPE = "image/webp"
_WEBP_CONTAINER, _WEBP_FORMAT = b"RIFF", b"WEBP"
_WEBP_FORMAT_OFFSET = 8
_SIGNATURES = {
    PDF_TYPE: b"%PDF-",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
    "application/msword": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
}
_UNSAFE_NAME_CHARACTER = re.compile(r"[^A-Za-z0-9._ -]")
FALLBACK_FILENAME = "document"


def check_size(content: bytes, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    if len(content) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=FILE_TOO_LARGE)
    return content


async def read_upload(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Reads at most one byte past the limit, so an oversized upload is never held in memory in full."""
    return check_size(await file.read(max_bytes + 1), max_bytes)


def read_upload_sync(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """The same for sync endpoints, which FastAPI runs in its threadpool."""
    return check_size(file.file.read(max_bytes + 1), max_bytes)


def matches_type(content: bytes, mime_type: str) -> bool:
    """True when the bytes start like the declared type; the client's Content-Type alone is not trusted."""
    if mime_type == WEBP_TYPE:
        end = _WEBP_FORMAT_OFFSET + len(_WEBP_FORMAT)
        return content.startswith(_WEBP_CONTAINER) and content[_WEBP_FORMAT_OFFSET:end] == _WEBP_FORMAT
    signature = _SIGNATURES.get(mime_type)
    return signature is not None and content.startswith(signature)


def require_type(content: bytes, mime_type: str) -> None:
    if not matches_type(content, mime_type):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_TYPE)


def content_disposition(disposition: str, filename: str) -> str:
    """ASCII fallback plus RFC 5987 filename*: quotes cannot break the header, and a name outside
    Latin-1 cannot make Starlette's header encoding raise."""
    fallback = _UNSAFE_NAME_CHARACTER.sub("_", filename).strip() or FALLBACK_FILENAME
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


def field_error(field: str, code: str) -> dict:
    """One 422 item shaped like pydantic's, so the web maps it onto its form field."""
    return {"type": "value_error", "loc": ["body", field], "msg": code}
```

(Use the 413 constant the installed Starlette defines without a deprecation warning: newer versions name it `HTTP_413_CONTENT_TOO_LARGE`. Check with `python -W error -c "from fastapi import status; status.HTTP_413_REQUEST_ENTITY_TOO_LARGE"`; the value stays 413.)

- [ ] **Step 4: The router**

In `server/routers/profile_documents.py`: import `status` from fastapi and `read_upload, require_type, content_disposition, field_error, UNSUPPORTED_TYPE` from `core.uploads`; add the constants and helpers, and replace the head of `upload_profile_document`, `_serialize` and the `Response` headers of `_serve`:

```python
MAX_LABEL_LENGTH = 200
MAX_FILENAME_LENGTH = 255
INVALID_DOC_TYPE = "invalid_doc_type"
DB_PREFIX = "db://"
FALLBACK_NAME = "document"


def _serialize(d: ProfileDocument) -> dict:
    return {
        "id": d.id,
        "doc_type": d.doc_type,
        "label": d.label,
        "original_filename": d.original_filename,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "created_at": iso_utc(d.created_at),
        # Drive files cannot be served yet (400 on view/download); the web disables their buttons.
        "downloadable": d.filename.startswith(DB_PREFIX),
    }


async def _checked_upload(file: UploadFile, doc_type: str) -> tuple[bytes, str]:
    """The bytes and type of an allowed upload; every refusal is a fixed code (no echo)."""
    if doc_type not in VALID_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=[field_error("doc_type", INVALID_DOC_TYPE)])
    mime = file.content_type or ""
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_TYPE)
    content = await read_upload(file, MAX_FILE_SIZE)
    require_type(content, mime)
    return content, mime


def _stored_name(file: UploadFile) -> str:
    return (file.filename or FALLBACK_NAME)[:MAX_FILENAME_LENGTH]
```

`upload_profile_document` keeps its signature except `label: str = Form("", max_length=MAX_LABEL_LENGTH)`; its body starts with `content, mime = await _checked_upload(file, doc_type)` and `name = _stored_name(file)`, and uses `name` wherever it used `file.filename` (`f"gdrive://{name}"`, `f"{DB_PREFIX}{name}"`, `label=label or name`, `original_filename=name`). The old three checks (doc_type, size, mime) are removed. If the function is still above 20 lines, move the storage branch (Drive upload or DB blob) into `async def _stored_location(storage, upload: _Upload) -> tuple[str, bytes | None]`, where `_Upload` is a small frozen dataclass `(content, name, mime)`, so the helper keeps to two parameters.

`_serve`: `headers={"Content-Disposition": content_disposition(disposition, doc.original_filename)}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_uploads.py tests/test_profile_documents_contract.py tests/test_profile_documents_router.py tests/test_profile_documents.py`
Expected: PASS. If `test_profile_documents_router.py::test_upload_profile_document` sent bytes that are not a PDF under `application/pdf`, change its fixture bytes to start with `%PDF-` (the test's intent is a valid upload); if `test_upload_profile_document_invalid_type` expected 400/415 with the old text, expect 415 `unsupported_type`.

- [ ] **Step 6: Checkpoint**

Run the full backend suite. Expected: all green.

---

### Task 2: Backend: profile contract (field limits, credentials survive, a safe CV import)

**Files:**
- Modify: `server/database/core.py` (limit constants; `ExperienceItem`, `ProjectItem`, `CVDataModel`, `SettingsData`), `server/routers/settings.py` (`CV_PARSE_SYSTEM_PROMPT`, `extract_text_from_pdf`, `parse_cv_with_ai`, `ParsedCv`, `upload_cv`, new `_profile_for`, `_store_parsed_cv`)
- Create: `server/tests/test_profile_contract.py`

**Interfaces:**
- Consumes: `read_upload_sync`, `require_type`, `field_error`, `PDF_TYPE`, `MAX_UPLOAD_BYTES` (Task 1); `get_client_and_model`, `SETUP_AI_TASK` (`intelligence/service.py`); `limiter` (`routers/deps.py`); `_without_input_echo` (existing, `main.py`).
- Produces:
  - `database/core.py` constants `MAX_ROLE_LENGTH = 200`, `MAX_SKILLS_LENGTH = 2000`, `MAX_SALARY_LENGTH = 50`, `MAX_LOCATION_LENGTH = 200`, `MAX_PREFERENCES_LENGTH = 5000`, `MAX_SPOKEN_LANGUAGES = 20`, `MAX_SPOKEN_LANGUAGE_LENGTH = 50`, `MAX_CV_ENTRIES = 30`, `MAX_ENTRY_TITLE_LENGTH = 200`, `MAX_ENTRY_DURATION_LENGTH = 100`, `MAX_ENTRY_TEXT_LENGTH = 5000`, `MAX_EDUCATION_LENGTH = 5000`. Entry fields default to `""`.
  - `POST /settings`: a value over its limit is 422 with `loc ["body", <field>, ...]`, input never echoed; omitted fields and every credential stay as stored (B2, unchanged).
  - `POST /settings/upload-cv` (sync, 10/min): 413 `file_too_large`; 415 `unsupported_type` (bytes are not a PDF, whatever the name or declared type); 422 `[{"loc": ["body", "file"], "msg": "cv_no_text"}]`; 502 `{"detail": "cv_parse_failed"}`; 200 `{"status": "success", "data": {role, skills, min_salary, location, cv_data}}` with the **stored** values.

- [ ] **Step 1: Write the failing tests**

`server/tests/test_profile_contract.py`:

```python
"""The web's profile sections and CV import: limits, independent saves, a bounded routed import."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from database.core import UserProfile
from routers.deps import limiter
from routers.settings import ParsedCv
from tests.factories import PDF_BYTES, TEST_USER_ID, make_profile

CREDENTIALS = {
    "pushover_user_key": "PUSH_USER_4711", "pushover_api_token": "PUSH_TOKEN_4711",
    "resend_api_key": "RESEND_KEY_4711", "resend_from_email": "jobs@example.com",
    "mailjet_api_key": "MJ_KEY_4711", "mailjet_secret_key": "MJ_SECRET_4711", "mailjet_from_email": "mj@example.com",
    "smtp_host": "smtp.example.com", "smtp_port": 587, "smtp_user": "me", "smtp_password": "SMTP_PW_4711",
    "smtp_from_email": "me@example.com", "email_global_recipient": "me@example.com",
    "google_drive_refresh_token": "DRIVE_TOKEN_4711", "google_drive_email": "me@gmail.com",
    "active_storage_service": "GOOGLE_DRIVE", "active_notification_service": "PUSHOVER",
}
SECRETS = ("PUSH_TOKEN_4711", "RESEND_KEY_4711", "MJ_KEY_4711", "MJ_SECRET_4711", "SMTP_PW_4711", "DRIVE_TOKEN_4711")
GOAL_BODY = {"role": "Lead", "skills": "Kotlin, Java", "min_salary": "80000", "location": "Hamburg",
             "preferences": "Hybrid", "spoken_languages": ["Deutsch", "Englisch"]}
CV_BODY = {"cv_data": {"experience": [{"company": "Acme", "role": "Dev", "duration": "2020-", "description": "APIs"}],
                       "projects": [], "education": "BSc"}}
PARSED = {"role": "Backend Dev", "skills": "Python", "min_salary": "", "location": "",
          "cv_data": {"experience": [{"company": "Neu GmbH", "role": "Dev"}], "projects": [], "education": "MSc"}}


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    limiter.reset()
    yield
    limiter.reset()


def _stored(session_factory) -> UserProfile:
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()


def test_profile_save_from_the_web_keeps_every_credential(api_client, seed, session_factory):
    seed(make_profile(**CREDENTIALS))
    assert api_client.post("/settings", json=GOAL_BODY).status_code == 200
    assert api_client.post("/settings", json=CV_BODY).status_code == 200
    profile = _stored(session_factory)
    assert {key: getattr(profile, key) for key in CREDENTIALS} == CREDENTIALS
    assert (profile.role, profile.cv_data["education"]) == ("Lead", "BSc")
    body = api_client.get("/settings").text
    assert not any(secret in body for secret in SECRETS)


@pytest.mark.parametrize("body,loc", [
    ({"role": "x" * 201}, ["body", "role"]),
    ({"skills": "x" * 2001}, ["body", "skills"]),
    ({"preferences": "x" * 5001}, ["body", "preferences"]),
    ({"spoken_languages": ["de"] * 21}, ["body", "spoken_languages"]),
    ({"spoken_languages": ["x" * 51]}, ["body", "spoken_languages", 0]),
    ({"cv_data": {"experience": [{}] * 31}}, ["body", "cv_data", "experience"]),
    ({"cv_data": {"experience": [{"description": "x" * 5001}]}}, ["body", "cv_data", "experience", 0, "description"]),
    ({"cv_data": {"education": "x" * 5001}}, ["body", "cv_data", "education"]),
])
def test_profile_fields_over_their_limit_are_refused_on_the_field(api_client, body, loc):
    response = api_client.post("/settings", json=body)
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, loc)
    assert "x" * 50 not in response.text


def test_entries_without_every_field_are_saved_with_empty_strings(api_client, seed, session_factory):
    seed(make_profile())
    api_client.post("/settings", json={"cv_data": {"experience": [{"company": "Acme"}]}})
    assert _stored(session_factory).cv_data["experience"] == [
        {"company": "Acme", "role": "", "duration": "", "description": ""},
    ]


def _import(api_client, content=PDF_BYTES, name="cv.pdf", mime="application/pdf", text="x" * 80, parsed=PARSED):
    routed = MagicMock(return_value=(None, "model"))
    answer = None if parsed is None else ParsedCv.model_validate(parsed)
    with patch("routers.settings.extract_text_from_pdf", return_value=text), \
         patch("routers.settings.get_client_and_model", routed), \
         patch("routers.settings.parse_cv_with_ai", return_value=answer) as parse:
        response = api_client.post("/settings/upload-cv", files={"file": (name, content, mime)})
    return response, parse, routed


def test_cv_import_stores_non_empty_values_and_replaces_the_cv_data(api_client, seed, session_factory):
    seed(make_profile(role="Old", skills="Old", location="Berlin"))
    response, _, _ = _import(api_client)
    profile = _stored(session_factory)
    assert (profile.role, profile.skills, profile.location) == ("Backend Dev", "Python", "Berlin")
    assert profile.cv_data["experience"] == [{"company": "Neu GmbH", "role": "Dev", "duration": "", "description": ""}]
    assert response.json()["data"]["location"] == "Berlin"


def test_cv_import_keeps_stored_values_the_cv_does_not_name(api_client, seed, session_factory):
    seed(make_profile(role="Lead", min_salary="80000"))
    _import(api_client, parsed={**PARSED, "role": "  "})
    assert (_stored(session_factory).role, _stored(session_factory).min_salary) == ("Lead", "80000")


def test_cv_import_keeps_every_credential(api_client, seed, session_factory):
    seed(make_profile(**CREDENTIALS))
    _import(api_client)
    profile = _stored(session_factory)
    assert {key: getattr(profile, key) for key in CREDENTIALS} == CREDENTIALS


def test_cv_import_refuses_a_non_pdf_even_with_a_pdf_name(api_client):
    response, parse, _ = _import(api_client, content=b"PK\x03\x04docx", name="cv.pdf")
    assert (response.status_code, response.json()) == (415, {"detail": "unsupported_type"})
    parse.assert_not_called()


def test_cv_import_accepts_an_uppercase_extension_and_any_declared_type(api_client, seed):
    seed(make_profile())
    response, _, _ = _import(api_client, name="CV.PDF", mime="application/octet-stream")
    assert response.status_code == 200


def test_cv_import_refuses_a_file_over_the_limit(api_client, monkeypatch):
    monkeypatch.setattr("routers.settings.MAX_CV_BYTES", len(PDF_BYTES) - 1)
    response, parse, _ = _import(api_client)
    assert (response.status_code, response.json()) == (413, {"detail": "file_too_large"})
    parse.assert_not_called()


def test_cv_import_without_text_is_a_field_error(api_client):
    response, parse, _ = _import(api_client, text="   ")
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert (error["loc"], error["msg"]) == (["body", "file"], "cv_no_text")
    parse.assert_not_called()


def test_cv_import_parse_failure_is_502_and_changes_nothing(api_client, seed, session_factory):
    seed(make_profile(role="Lead"))
    response, _, _ = _import(api_client, parsed=None)
    assert (response.status_code, response.json()) == (502, {"detail": "cv_parse_failed"})
    assert _stored(session_factory).role == "Lead"


def test_cv_import_uses_the_provider_routed_for_job_analysis(api_client, seed):
    seed(make_profile())
    _, _, routed = _import(api_client)
    assert routed.call_args.args[0] == "job_analysis"


def _ai_answering(text: str):
    message = SimpleNamespace(content=text)
    completion = SimpleNamespace(choices=[SimpleNamespace(message=message)])
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_: completion)))


def test_parse_refuses_an_answer_of_the_wrong_shape():
    from routers.settings import parse_cv_with_ai
    assert parse_cv_with_ai("cv", _ai_answering('["not", "an", "object"]'), "m") is None
    assert parse_cv_with_ai("cv", _ai_answering("no json at all"), "m") is None


def test_parse_fills_missing_fields_with_empty_strings():
    from routers.settings import parse_cv_with_ai
    parsed = parse_cv_with_ai("cv", _ai_answering('```json {"cv_data": {"experience": [{"company": "A"}]}} ```'), "m")
    assert (parsed.role, parsed.cv_data.experience[0].role) == ("", "")


def test_pdf_text_is_limited_to_the_first_pages_and_characters(monkeypatch):
    from routers import settings
    pages = [SimpleNamespace(extract_text=lambda i=i: f"page{i} " + "y" * 5000) for i in range(12)]
    monkeypatch.setattr(settings, "PdfReader", lambda _stream: SimpleNamespace(pages=pages))
    text = settings.extract_text_from_pdf(PDF_BYTES)
    assert "page9" in text or len(text) == settings.CV_MAX_TEXT_CHARS
    assert "page10" not in text and len(text) <= settings.CV_MAX_TEXT_CHARS
```

(Until Step 4 exists the module fails to collect on `from routers.settings import ParsedCv`; that is the expected red. The `fresh_rate_limits` fixture keeps the 10/min limit from tripping across the import tests; if `limiter.reset()` does not exist in the installed slowapi, use `limiter._storage.reset()`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_profile_contract.py`
Expected: FAIL at collection with `ImportError: cannot import name 'ParsedCv'`. With a temporary empty `class ParsedCv(BaseModel): pass` in `routers/settings.py` (removed in Step 4) the tests fail on their own: over-limit bodies answer 200; a missing entry field answers 422; the renamed DOCX answers 400 instead of 415; the parse failure answers 500 instead of 502; `get_client_and_model` is never called.

- [ ] **Step 3: Limits on the models**

In `server/database/core.py` (add `Annotated` to the `typing` import), above `ExperienceItem`:

```python
# Every profile field goes into each AI prompt; the web mirrors these (src/api/profilePaths.ts).
MAX_ROLE_LENGTH = 200
MAX_SKILLS_LENGTH = 2000
MAX_SALARY_LENGTH = 50
MAX_LOCATION_LENGTH = 200
MAX_PREFERENCES_LENGTH = 5000
MAX_SPOKEN_LANGUAGES = 20
MAX_SPOKEN_LANGUAGE_LENGTH = 50
MAX_CV_ENTRIES = 30
MAX_ENTRY_TITLE_LENGTH = 200
MAX_ENTRY_DURATION_LENGTH = 100
MAX_ENTRY_TEXT_LENGTH = 5000
MAX_EDUCATION_LENGTH = 5000

EntryTitle = Annotated[str, Field(max_length=MAX_ENTRY_TITLE_LENGTH)]
EntryText = Annotated[str, Field(max_length=MAX_ENTRY_TEXT_LENGTH)]
SpokenLanguage = Annotated[str, Field(max_length=MAX_SPOKEN_LANGUAGE_LENGTH)]


class ExperienceItem(BaseModel):
    company: EntryTitle = ""
    role: EntryTitle = ""
    duration: Annotated[str, Field(max_length=MAX_ENTRY_DURATION_LENGTH)] = ""
    description: EntryText = ""


class ProjectItem(BaseModel):
    name: EntryTitle = ""
    tech_stack: EntryTitle = ""
    description: EntryText = ""


class CVDataModel(BaseModel):
    experience: List[ExperienceItem] = Field(default_factory=list, max_length=MAX_CV_ENTRIES)
    projects: List[ProjectItem] = Field(default_factory=list, max_length=MAX_CV_ENTRIES)
    education: str = Field("", max_length=MAX_EDUCATION_LENGTH)
```

In `SettingsData`, only the profile fields change (credential fields untouched):

```python
    role: str = Field(None, max_length=MAX_ROLE_LENGTH)
    skills: str = Field(None, max_length=MAX_SKILLS_LENGTH)
    min_salary: str = Field(None, max_length=MAX_SALARY_LENGTH)
    location: str = Field(None, max_length=MAX_LOCATION_LENGTH)
    preferences: str = Field(None, max_length=MAX_PREFERENCES_LENGTH)
    cv_data: CVDataModel = None
    job_urls: List[str] = None
    spoken_languages: List[SpokenLanguage] = Field(None, max_length=MAX_SPOKEN_LANGUAGES)
```

(The defaults stay `None` without `Optional`, so an explicit `null` is still refused, `test_save_profile_rejects_explicit_null_for_profile_field`.)

- [ ] **Step 4: The CV import**

In `server/routers/settings.py`: import `status` from fastapi; `read_upload_sync, require_type, field_error, PDF_TYPE, MAX_UPLOAD_BYTES` from `core.uploads`; `get_client_and_model, SETUP_AI_TASK` from `intelligence.service`; `CVDataModel` and the five `MAX_*` constants used below from `database.core`. Drop the now unused `get_openrouter_client` and `get_current_model` imports if nothing else in the file uses them. Move the prompt text unchanged into `CV_PARSE_SYSTEM_PROMPT = """..."""` at module level, then:

```python
MAX_CV_BYTES = MAX_UPLOAD_BYTES
CV_MAX_PAGES = 10
CV_MAX_TEXT_CHARS = 30_000
MIN_CV_TEXT_CHARS = 50
CV_NO_TEXT = "cv_no_text"
CV_PARSE_FAILED = "cv_parse_failed"
# The fields a CV may fill; empty answers keep the stored value (the import must not blank a goal).
_IMPORTED_TEXT_FIELDS = ("role", "skills", "min_salary", "location")


class ParsedCv(BaseModel):
    """The AI's answer, validated like a profile save; a missing field becomes empty."""

    role: str = Field("", max_length=MAX_ROLE_LENGTH)
    skills: str = Field("", max_length=MAX_SKILLS_LENGTH)
    min_salary: str = Field("", max_length=MAX_SALARY_LENGTH)
    location: str = Field("", max_length=MAX_LOCATION_LENGTH)
    cv_data: CVDataModel = Field(default_factory=CVDataModel)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Text of the first pages, bounded: a long PDF must not become an unbounded AI prompt."""
    try:
        pages = list(PdfReader(io.BytesIO(file_bytes)).pages)[:CV_MAX_PAGES]
        text = "\n".join(page.extract_text() or "" for page in pages)
    except Exception as e:  # pypdf raises many types for broken files; a broken file reads as no text
        logger.error(f"PDF Read Error: {e}")
        return ""
    return text[:CV_MAX_TEXT_CHARS]


def parse_cv_with_ai(cv_text: str, client, model: str) -> Optional[ParsedCv]:
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": CV_PARSE_SYSTEM_PROMPT},
                      {"role": "user", "content": f"Hier ist der Lebenslauf:\n\n{cv_text}"}],
            temperature=0.0,
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "")
        return ParsedCv.model_validate(json.loads(content))
    except Exception as e:  # any AI, JSON or shape failure is one fixed answer to the user
        logger.error(f"AI Parse Error: {e}")
        return None


def _profile_for(db: Session, user_id: int) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    return profile


def _store_parsed_cv(db: Session, user_id: int, parsed: ParsedCv) -> dict:
    """Non-empty values replace stored ones; the CV data is replaced as a whole."""
    profile = _profile_for(db, user_id)
    for field in _IMPORTED_TEXT_FIELDS:
        value = getattr(parsed, field).strip()
        if value:
            setattr(profile, field, value)
    profile.cv_data = parsed.cv_data.model_dump()
    db.commit()
    stored = {field: getattr(profile, field) for field in _IMPORTED_TEXT_FIELDS}
    return {**stored, "cv_data": profile.cv_data}


@router.post("/settings/upload-cv")
@limiter.limit("10/minute")
def upload_cv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Sync on purpose: the AI call blocks, so FastAPI must run it in the threadpool, not on the event loop.
    content = read_upload_sync(file, MAX_CV_BYTES)
    require_type(content, PDF_TYPE)
    text = extract_text_from_pdf(content)
    if len(text.strip()) < MIN_CV_TEXT_CHARS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=[field_error("file", CV_NO_TEXT)])
    client, model = get_client_and_model(SETUP_AI_TASK, db)
    parsed = parse_cv_with_ai(text, client, model)
    if parsed is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=CV_PARSE_FAILED)
    return {"status": "success", "data": _store_parsed_cv(db, current_user.id, parsed)}
```

(`SETUP_AI_TASK` is `"job_analysis"`, the routing `is_ai_configured` checks: onboarding's "KI eingerichtet" and a working import then agree. `list(...pages)[:CV_MAX_PAGES]` reads page objects lazily in pypdf; if your pypdf supports slicing `reader.pages[:n]` directly, use that.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_profile_contract.py tests/test_settings_router.py`
Expected: PASS. A pre-existing test that posted `cv_data` items with missing fields and expected 422 now gets 200: update its expectation (entry fields default to `""` by design, G3).

- [ ] **Step 6: Checkpoint**

Run the full backend suite. Expected: all green.

---

### Task 3: Backend: template lifecycle (failed state, time limits, selection and delete rules, name limits)

**Files:**
- Modify: `server/workers/tasks/fill_cv_template.py`, `server/workers/tasks/time_limits.py`, `server/services/template_access.py`, `server/routers/templates.py` (`create_document_template`, `delete_document_template`, new `_clear_selection`), `server/routers/settings.py` (`_check_template_selection`), `server/database/core.py` (`DocumentTemplateCreate`, `DocumentTemplateUpdate`, the `status` column comment)
- Create: `server/tests/test_template_lifecycle.py`

**Interfaces:**
- Consumes: `find_usable_template`, `looks_like_template_id` (`services/template_access.py`); `OLLAMA_REQUEST_TIMEOUT_SECONDS` (`intelligence/service.py`); `make_template`, `make_profile`, `events_of_type`, `fetch` (`tests/factories.py`).
- Produces:
  - Statuses: `None` (ready), `TEMPLATE_STATUS_PROCESSING = "processing"` (`services/template_access.py`), `TEMPLATE_STATUS_ANNOTATION_REJECTED = "annotation_rejected"` (existing), `TEMPLATE_STATUS_ANNOTATION_FAILED = "annotation_failed"` (new, `fill_cv_template.py`). Every end of the fill task except a hard kill publishes `template_ready {template_id, user_id}` (payload unchanged).
  - `FILL_SOFT_TIME_LIMIT_SECONDS = 660`, `FILL_HARD_TIME_LIMIT_SECONDS = 720` (`time_limits.py`).
  - `PATCH /settings/template` and `POST /settings`: a processing template -> 409 `{"detail": "template_processing"}`.
  - `DELETE /document-templates/{id}`: a profile selection naming it becomes `None`.
  - `POST/PUT /document-templates`: `name` trimmed, 1-100 characters, else 422 on `["body", "name"]`.

- [ ] **Step 1: Write the failing tests**

`server/tests/test_template_lifecycle.py`:

```python
"""The CV template fill always ends in a state the web can show; selection and delete keep the default sane."""

from unittest.mock import patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from database.core import DocumentTemplate, UserProfile
from intelligence.service import OLLAMA_REQUEST_TIMEOUT_SECONDS
from tests.factories import TEST_USER_ID, events_of_type, fetch, make_profile, make_template, make_user
from workers.tasks.fill_cv_template import TEMPLATE_STATUS_ANNOTATION_FAILED, fill_cv_template_task

TEMPLATE_ID = 40
PLAIN_HTML = "<p>Jane Doe</p>"
NO_AI = (None, "test-model")


def _fill(session_factory, seed, fake_redis, **patches):
    seed(make_user(), make_template(html=PLAIN_HTML, status="processing"))
    annotate = patches.get("annotate", lambda *_a, **_k: "<p>{{ name }}</p>")
    with patch("workers.tasks.fill_cv_template.SessionLocal", session_factory), \
         patch("workers.tasks.fill_cv_template.redis.from_url", return_value=fake_redis), \
         patch("workers.tasks.fill_cv_template.get_client_and_model", return_value=NO_AI), \
         patch("workers.tasks.fill_cv_template.annotate_cv_template_with_jinja2", side_effect=annotate), \
         patch("workers.tasks.fill_cv_template._store_annotation", **patches.get("store", {})):
        fill_cv_template_task(TEMPLATE_ID, TEST_USER_ID)
    return fetch(session_factory, DocumentTemplate, TEMPLATE_ID)


def _raise(error):
    def _raiser(*_args, **_kwargs):
        raise error
    return _raiser


def test_ai_failure_marks_the_template_failed_and_tells_the_owner(session_factory, seed, fake_redis):
    template = _fill(session_factory, seed, fake_redis, annotate=_raise(RuntimeError("provider down")))
    assert (template.html, template.status) == (PLAIN_HTML, TEMPLATE_STATUS_ANNOTATION_FAILED)
    assert events_of_type(fake_redis, "template_ready") == [
        {"type": "template_ready", "template_id": TEMPLATE_ID, "user_id": TEST_USER_ID},
    ]


def test_soft_time_limit_during_the_ai_call_marks_it_failed(session_factory, seed, fake_redis):
    template = _fill(session_factory, seed, fake_redis, annotate=_raise(SoftTimeLimitExceeded()))
    assert template.status == TEMPLATE_STATUS_ANNOTATION_FAILED


def test_store_failure_marks_it_failed(session_factory, seed, fake_redis):
    template = _fill(session_factory, seed, fake_redis, store={"return_value": False})
    assert template.status == TEMPLATE_STATUS_ANNOTATION_FAILED
    assert len(events_of_type(fake_redis, "template_ready")) == 1


def test_fill_task_limits_sit_above_the_ai_timeout():
    soft, hard = fill_cv_template_task.soft_time_limit, fill_cv_template_task.time_limit
    assert OLLAMA_REQUEST_TIMEOUT_SECONDS < soft < hard


@pytest.mark.parametrize("name", ["   ", "x" * 101])
def test_create_refuses_an_empty_or_overlong_name(api_client, name):
    response = api_client.post("/document-templates", json={"doc_type": "COVER_LETTER", "name": name, "html": "<p/>"})
    assert (response.status_code, response.json()["detail"][0]["loc"]) == (422, ["body", "name"])


def test_create_trims_the_name(api_client):
    response = api_client.post("/document-templates", json={"doc_type": "COVER_LETTER", "name": " Mein Brief ", "html": "<p/>"})
    assert response.json()["name"] == "Mein Brief"


def test_deleting_the_selected_template_resets_the_default(api_client, seed, session_factory):
    seed(make_template(), make_profile(cv_template=str(TEMPLATE_ID), cover_letter_template="classic"))
    assert api_client.delete(f"/document-templates/{TEMPLATE_ID}").status_code == 200
    with session_factory() as db:
        profile = db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()
    assert (profile.cv_template, profile.cover_letter_template) == (None, "classic")


@pytest.mark.parametrize("path,method", [("/settings/template", "patch"), ("/settings", "post")])
def test_a_template_still_being_filled_cannot_become_the_default(api_client, seed, path, method):
    seed(make_template(status="processing"), make_profile())
    response = getattr(api_client, method)(path, json={"cv_template": str(TEMPLATE_ID)})
    assert (response.status_code, response.json()) == (409, {"detail": "template_processing"})


@pytest.mark.parametrize("status", ["annotation_rejected", TEMPLATE_STATUS_ANNOTATION_FAILED, None])
def test_a_finished_template_can_become_the_default_whatever_the_fill_did(api_client, seed, status):
    seed(make_template(status=status), make_profile())
    assert api_client.patch("/settings/template", json={"cv_template": str(TEMPLATE_ID)}).status_code == 200
```

(`api_client` patches `routers.templates.SessionLocal` already (`_MODULES_WITH_OWN_SESSIONS`). For the create tests a `COVER_LETTER` template avoids the Celery dispatch; for CV creates elsewhere keep the existing `no_annotation` pattern. `make_user` is seeded by `api_client`; do not seed it again in API tests.)

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_template_lifecycle.py`
Expected: FAIL: `ImportError: cannot import name 'TEMPLATE_STATUS_ANNOTATION_FAILED'`; after a stub, the AI failure leaves `None`; the task has no time limits (`None < 660` raises `TypeError`); names are not checked; the deleted default stays `"40"`; a processing template is accepted (200).

- [ ] **Step 3: Statuses, limits and the task**

`server/workers/tasks/time_limits.py`, append:

```python
# The CV template fill is one AI call, which may take up to OLLAMA_REQUEST_TIMEOUT_SECONDS (600 s).
FILL_SOFT_TIME_LIMIT_SECONDS = 660
FILL_HARD_TIME_LIMIT_SECONDS = 720
```

`server/services/template_access.py`, below the imports:

```python
# DocumentTemplate.status while the AI fill runs; such a template cannot be selected yet.
TEMPLATE_STATUS_PROCESSING = "processing"
```

`server/workers/tasks/fill_cv_template.py` becomes (imports extended by `FILL_SOFT_TIME_LIMIT_SECONDS`, `FILL_HARD_TIME_LIMIT_SECONDS`):

```python
TEMPLATE_READY_EVENT = "template_ready"
# The AI output failed the save-time check; the unannotated template stays and remains usable.
TEMPLATE_STATUS_ANNOTATION_REJECTED = "annotation_rejected"
# The AI call failed or timed out, or storing its result failed; the unannotated template stays usable.
TEMPLATE_STATUS_ANNOTATION_FAILED = "annotation_failed"


def _publish_template_ready(template_id: int, user_id: int) -> None:
    """Tell the owner's browser the fill ended, so the gallery need not poll."""
    redis_url = os.getenv("CELERY_RESULT_BACKEND", "redis://ai-job-agent-redis:6379/0")
    redis.from_url(redis_url).publish(
        "job_updates",
        json.dumps({"type": TEMPLATE_READY_EVENT, "template_id": template_id, "user_id": user_id}),
    )


def _end(template_id: int, user_id: int, status) -> None:
    """Every end except a hard kill leaves a visible state and tells the browser."""
    _set_status(template_id, user_id, status)
    _publish_template_ready(template_id, user_id)


@celery_app.task(
    name="ai.fill_cv_template",
    soft_time_limit=FILL_SOFT_TIME_LIMIT_SECONDS,
    time_limit=FILL_HARD_TIME_LIMIT_SECONDS,
)
def fill_cv_template_task(template_id: int, user_id: int):
    """Annotate a user-uploaded CV template with Jinja2 variables (one-time, on upload).

    If the template already contains Jinja2 syntax it is saved as-is; otherwise the AI adds
    {{ name }}, {% for exp in experience %}, etc. Profile data is injected at render time.
    """
    logger.info(f"[TASK] annotate_cv_template template={template_id} user={user_id}")
    loaded = _load(template_id, user_id)
    if loaded is None:
        return
    template_html, client, model = loaded
    try:
        annotated_html = _annotated(template_html, client, model)
    except Exception as e:  # AI errors and SoftTimeLimitExceeded alike: the original stays usable
        logger.error(f"Annotation failed for template {template_id}: {e}", exc_info=True)
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_FAILED)
        return
    _finish(template_id, user_id, annotated_html)


def _load(template_id: int, user_id: int):
    """(html, client, model) of the owner's CV template, read before the AI call so no session is held."""
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.doc_type == "CV",
            DocumentTemplate.user_id == user_id,
        ).first()
        if not template:
            logger.error(f"CV template {template_id} not found for user {user_id}")
            return None
        client, model = get_client_and_model("cv_tailoring", db)
        return template.html, client, model
    finally:
        db.close()


def _annotated(template_html: str, client, model: str) -> str:
    if has_jinja2_syntax(template_html):
        return template_html
    return annotate_cv_template_with_jinja2(template_html, model=model, client=client)


def _finish(template_id: int, user_id: int, annotated_html: str) -> None:
    try:
        # AI output is untrusted like the upload: strip scripts and on* handlers, then check the Jinja.
        checked_html = validate_template(annotated_html, CV_DOC_TYPE)
    except TemplateRejected:
        logger.error(f"AI annotation of template {template_id} rejected, keeping the original", exc_info=True)
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_REJECTED)
        return
    if _store_annotation(template_id, user_id, checked_html):
        _publish_template_ready(template_id, user_id)
    else:
        _end(template_id, user_id, TEMPLATE_STATUS_ANNOTATION_FAILED)


def _store_annotation(template_id: int, user_id: int, html: str) -> bool:
    """Store the annotated HTML and mark the template ready; False when the database refused."""
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id, DocumentTemplate.user_id == user_id,
        ).first()
        if template:
            template.html, template.status = html, None
            db.commit()
        logger.info(f"annotate_cv_template complete template={template_id}")
        return True
    except Exception as e:  # any DB error: the caller marks the template failed instead of leaving "processing"
        logger.error(f"annotate_cv_template DB write failed: {e}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()
```

`_set_status` stays as it is. (`_store_annotation` returns `True` for a template deleted meanwhile: there is nothing to mark, and the event is harmless. The existing `test_template_task_hardening.py` tests keep passing: rejected and valid paths are unchanged.)

- [ ] **Step 4: Selection, delete and names**

`server/database/core.py`: comment on `DocumentTemplate.status` -> `# None = ready | "processing" = AI fill running | "annotation_rejected" = AI output refused | "annotation_failed" = AI call or store failed; the original is kept in both`. Add `StringConstraints` to the pydantic import and:

```python
MAX_TEMPLATE_NAME_LENGTH = 100
TemplateName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEMPLATE_NAME_LENGTH)]
```

`DocumentTemplateCreate.name: TemplateName`; `DocumentTemplateUpdate.name: Optional[TemplateName] = None`.

`server/routers/templates.py` (import `UserProfile` from `database.core`):

```python
_SELECTION_FIELDS = ("cv_template", "cover_letter_template")


def _clear_selection(db, user_id: int, template_id: int) -> None:
    """A deleted default falls back to the bundled template instead of naming a missing id."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile is None:
        return
    for field in _SELECTION_FIELDS:
        if getattr(profile, field) == str(template_id):
            setattr(profile, field, None)
```

In `delete_document_template`, call `_clear_selection(db, current_user.id, template_id)` right after `db.delete(t)` (same commit). In `create_document_template`, replace the literal `"processing"` with `TEMPLATE_STATUS_PROCESSING` (imported from `services.template_access`).

`server/routers/settings.py`, `_check_template_selection` (import `TEMPLATE_STATUS_PROCESSING` and `status`):

```python
TEMPLATE_PROCESSING = "template_processing"


def _check_template_selection(db: Session, user_id: int, selection: dict) -> None:
    """Reject a template id the user may not use, or one the AI is still filling.

    File template keys such as "classic" pass unchanged. A purely numeric value that is not a
    usable id (unknown, foreign, wrong type, out of range or non-ASCII digits) is rejected.
    """
    for field, doc_type in _TEMPLATE_FIELD_DOC_TYPES.items():
        template_ref = selection.get(field)
        if not looks_like_template_id(template_ref):
            continue
        template = find_usable_template(db, template_ref, user_id, doc_type)
        if template is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field}: template not found")
        if template.status == TEMPLATE_STATUS_PROCESSING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TEMPLATE_PROCESSING)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_template_lifecycle.py tests/test_template_task_hardening.py tests/test_document_templates_api.py tests/test_document_templates_router.py tests/test_template_access.py tests/test_settings_router.py`
Expected: PASS. A pre-existing test that created a template with an empty name must now send a name.

- [ ] **Step 6: Checkpoint**

Run the full backend suite. Expected: all green.

---

### Task 4: Backend: template preview (sandboxed render with the owner's profile)

**Files:**
- Create: `server/services/template_preview.py`, `server/tests/test_template_preview.py`
- Modify: `server/routers/templates.py` (`GET /document-templates/preview`, `_preview_source`, `_rendered`)

**Interfaces:**
- Consumes: `render_jinja2_template`, `fill_template`, `TemplateRejected` (`services/template_filler.py`); `render_cv_html`, `render_cover_letter_html`, `list_templates` (`services/document_renderer.py`); `find_usable_template`, `looks_like_template_id` (`services/template_access.py`); `limiter` (`routers/deps.py`); `make_template`, `make_profile`, `OTHER_USER_ID` (`tests/factories.py`).
- Produces:
  - `services/template_preview.py`: `PreviewSource(doc_type: str, template_html: Optional[str] = None, file_key: Optional[str] = None)` (frozen dataclass), `render_preview(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str` (raises `TemplateRejected`), `file_template_exists(doc_type: str, key: str) -> bool`, `cv_context(user, profile) -> dict`.
  - `GET /document-templates/preview?doc_type=CV|COVER_LETTER&template=<id or file key>` (20/min) -> `{"html": str}`; 404 `Template not found` for foreign, unknown or wrong-type ids and unknown file keys; 422 `{"detail": "template_rejected"}` when the sandbox refuses; 422 (pydantic) for another `doc_type` or a `template` longer than 64.

- [ ] **Step 1: Write the failing tests**

`server/tests/test_template_preview.py`:

```python
"""The template preview renders with the owner's profile through the generation's renderers and sandbox."""

import pytest

from routers.deps import limiter
from tests.factories import OTHER_USER_ID, make_profile, make_template, make_user

TEMPLATE_ID = 40
PREVIEW = "/document-templates/preview"
CV_HTML = "<h1>{{ name }}</h1>{% for e in experience %}<p>{{ e.company }}</p>{% endfor %}"
CV_DATA = {"experience": [{"company": "Acme", "role": "Dev", "duration": "", "description": ""}], "projects": [], "education": ""}


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    limiter.reset()
    yield
    limiter.reset()


def _preview(api_client, template, doc_type="CV"):
    return api_client.get(PREVIEW, params={"doc_type": doc_type, "template": template})


def test_preview_of_an_own_cv_template_renders_the_profile(api_client, seed):
    seed(make_template(html=CV_HTML), make_profile(cv_data=CV_DATA))
    response = _preview(api_client, str(TEMPLATE_ID))
    assert response.status_code == 200
    assert "user501" in response.json()["html"] and "Acme" in response.json()["html"]


def test_preview_of_the_bundled_cv_template(api_client, seed):
    seed(make_profile(cv_data=CV_DATA))
    html = _preview(api_client, "classic").json()["html"]
    assert "user501" in html and "Acme" in html


def test_preview_of_a_letter_template_fills_the_slots_in_the_profile_language(api_client, seed):
    seed(make_template(doc_type="COVER_LETTER", html='<p data-slot="body"></p><p data-slot="sender_name"></p>'),
         make_profile(language="en"))
    html = _preview(api_client, str(TEMPLATE_ID), "COVER_LETTER").json()["html"]
    assert "Your cover letter" in html and "user501" in html


def test_preview_of_another_users_template_is_not_found(api_client, seed):
    seed(make_user(OTHER_USER_ID), make_template(user_id=OTHER_USER_ID, html=CV_HTML))
    assert _preview(api_client, str(TEMPLATE_ID)).status_code == 404


@pytest.mark.parametrize("ref", ["nope", "../../etc/passwd", "99999"])
def test_preview_of_an_unknown_bundled_key_is_not_found(api_client, ref):
    assert _preview(api_client, ref).status_code == 404


def test_preview_of_a_letter_id_as_a_cv_is_not_found(api_client, seed):
    seed(make_template(doc_type="COVER_LETTER", html="<p/>"))
    assert _preview(api_client, str(TEMPLATE_ID), "CV").status_code == 404


def test_preview_of_a_hostile_stored_template_is_refused_without_running_it(api_client, seed, tmp_path):
    marker = tmp_path / "pwned"
    payload = "<p>{{ cycler.__init__.__globals__.os.popen('touch %s').read() }}</p>" % marker
    seed(make_template(html=payload), make_profile())  # stored directly: older rows predate the save check
    response = _preview(api_client, str(TEMPLATE_ID))
    assert (response.status_code, response.json()) == (422, {"detail": "template_rejected"})
    assert not marker.exists()


def test_preview_values_are_escaped(api_client, seed):
    seed(make_template(html="<p>{{ role }}</p>"), make_profile(role="<script>alert(1)</script>"))
    html = _preview(api_client, str(TEMPLATE_ID)).json()["html"]
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_preview_doc_type_and_reference_are_validated(api_client):
    assert _preview(api_client, "classic", "XY").status_code == 422
    assert _preview(api_client, "x" * 65).status_code == 422
```

(The CV renders run the real isolated child process, like `test_template_sandbox.py`; a few seconds is expected. `user501` is `make_user()`'s username.)

- [ ] **Step 2: Run them to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_template_preview.py`
Expected: FAIL: 404/405 for every preview call (no such route).

- [ ] **Step 3: The preview service**

`server/services/template_preview.py`:

```python
"""What a template looks like with the user's own profile: the preview on Profil › Vorlagen.

The same renderers as the generation (workers/tasks/package.py), without any AI call: a user CV
template renders in the isolated Jinja2 sandbox, a user letter template through the slot filler,
a bundled template through the file renderer.
"""

import datetime
from dataclasses import dataclass
from typing import Optional

from database.core import User, UserProfile
from services.document_renderer import list_templates, render_cover_letter_html, render_cv_html
from services.template_filler import fill_template, render_jinja2_template

CV_DOC_TYPE = "CV"
FILE_CATEGORY = {"CV": "cv", "COVER_LETTER": "cover_letter"}
DATE_FORMAT = "%d.%m.%Y"
DEFAULT_LANGUAGE = "de"
# Stand-ins for the per-job parts of a letter, in the profile's language.
SAMPLE_LETTER = {
    "de": {"company": "Beispiel GmbH", "body": "Hier steht dein Anschreiben, zugeschnitten auf die Stelle."},
    "en": {"company": "Example Ltd", "body": "Your cover letter for the position appears here."},
}


@dataclass(frozen=True)
class PreviewSource:
    doc_type: str
    template_html: Optional[str] = None
    file_key: Optional[str] = None


def _text(profile: Optional[UserProfile], field: str) -> str:
    return (getattr(profile, field, None) or "") if profile else ""


def cv_context(user: User, profile: Optional[UserProfile]) -> dict:
    """The keys the generation's tailored CV data carries, filled from the stored profile."""
    cv = (profile.cv_data if profile else None) or {}
    return {
        "name": user.username,
        "role": _text(profile, "role"),
        "skills": _text(profile, "skills"),
        "location": _text(profile, "location"),
        "summary": "",
        "experience": cv.get("experience") or [],
        "projects": cv.get("projects") or [],
        "education": cv.get("education") or "",
    }


def file_template_exists(doc_type: str, key: str) -> bool:
    return key in list_templates().get(FILE_CATEGORY[doc_type], [])


def render_preview(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str:
    """Raises TemplateRejected (fixed message) when the sandbox refuses a user CV template."""
    if source.doc_type == CV_DOC_TYPE:
        context = cv_context(user, profile)
        if source.template_html is not None:
            return render_jinja2_template(source.template_html, context)
        return render_cv_html(context, template_key=source.file_key)
    return _letter_preview(user, profile, source)


def _letter_preview(user: User, profile: Optional[UserProfile], source: PreviewSource) -> str:
    sample = SAMPLE_LETTER.get(_text(profile, "language"), SAMPLE_LETTER[DEFAULT_LANGUAGE])
    if source.template_html is None:
        return render_cover_letter_html(letter_markdown=sample["body"], template_key=source.file_key,
                                        sender_name=user.username, company=sample["company"])
    return fill_template(source.template_html, {
        "sender_name": user.username, "company": sample["company"], "body": sample["body"],
        "location": _text(profile, "location"), "date": datetime.date.today().strftime(DATE_FORMAT),
        "role": _text(profile, "role"), "skills": _text(profile, "skills"),
    })
```

- [ ] **Step 4: The endpoint**

In `server/routers/templates.py` (imports: `Literal` from typing; `Query, Request, status` from fastapi; `limiter` from `routers.deps`; `UserProfile` from `database.core`; `find_usable_template, looks_like_template_id` from `services.template_access`; `PreviewSource, render_preview, file_template_exists` from `services.template_preview`; `TemplateRejected` from `services.template_filler`). Declare the route **before** any other `/document-templates/{...}` GET route:

```python
PREVIEW_RATE = "20/minute"  # each CV preview spawns a bounded render child (up to 15 s CPU)
MAX_TEMPLATE_REF_LENGTH = 64
TEMPLATE_REJECTED = "template_rejected"
TEMPLATE_NOT_FOUND = "Template not found"


def _preview_source(db, user_id: int, doc_type: str, ref: str) -> PreviewSource:
    """Own or global templates by id, bundled ones by key; anything else is not found."""
    if looks_like_template_id(ref):
        template = find_usable_template(db, ref, user_id, doc_type)
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TEMPLATE_NOT_FOUND)
        return PreviewSource(doc_type, template_html=template.html)
    if not file_template_exists(doc_type, ref):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TEMPLATE_NOT_FOUND)
    return PreviewSource(doc_type, file_key=ref)


def _rendered(user: User, profile, source: PreviewSource) -> str:
    try:
        return render_preview(user, profile, source)
    except TemplateRejected as rejected:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=TEMPLATE_REJECTED) from rejected


@router.get("/document-templates/preview")
@limiter.limit(PREVIEW_RATE)
def preview_document_template(
    request: Request,
    doc_type: Literal["CV", "COVER_LETTER"],
    template: str = Query(min_length=1, max_length=MAX_TEMPLATE_REF_LENGTH),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        source = _preview_source(db, current_user.id, doc_type, template)
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        return {"html": _rendered(current_user, profile, source)}
    finally:
        db.close()
```

(A sync route on purpose: the render child blocks. `file_template_exists` compares against the directory listing, so `../../etc/passwd` can never reach the file loader.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_template_preview.py tests/test_template_sandbox.py tests/test_document_templates_router.py`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run the full backend suite. Expected: all green.

---

### Task 5: Web contract layer: profile, templates and documents API, domain rules

**Files:**
- Create: `web/src/api/profilePaths.ts`, `web/src/api/profile.ts`, `web/src/api/templates.ts`, `web/src/domain/profile.ts`, `web/src/domain/templates.ts`, `web/tests/unit/api/profileApi.test.ts`, `web/tests/unit/domain/profile.test.ts`, `web/tests/unit/domain/templates.test.ts`
- Modify: `web/src/api/profileDocuments.ts`, `web/src/api/queryKeys.ts`, `web/tests/unit/realtime/handleMessage.test.ts`

**Interfaces:**
- Consumes: `api` (`api/instance.ts`), `fetchFile` (`api/files.ts`), `queryKeys`, `DownloadedFile`; the server contract of Tasks 1-4.
- Produces:
  - `api/profilePaths.ts` (client-free): `SETTINGS_PATH`, `UPLOAD_CV_PATH`, `TEMPLATE_SELECTION_PATH`, `PROFILE_DOCUMENTS_PATH`, `FILE_TEMPLATES_PATH`, `DOCUMENT_TEMPLATES_PATH`, `TEMPLATE_PREVIEW_PATH`, `profileDocumentPath(id)`, `profileDocumentFilePath(id, mode: "view" | "download")`, `documentTemplatePath(id)`, `templatePreviewPath(docType, ref)`, `PROFILE_LIMITS`, `MAX_FILE_BYTES`, `PROOF_TYPES`, `PROOF_DOC_TYPES`, `ProofDocType`, `TEMPLATE_DOC_TYPES`, `TemplateDocType`, `MAX_TEMPLATE_HTML_LENGTH`, `MAX_TEMPLATE_NAME_LENGTH`, `DEFAULT_FILE_TEMPLATE`, `TEMPLATE_STATUS`, `SECRET_MASK`.
  - `api/profile.ts`: `Profile`, `ProfileBody`, `CvData`, `Experience`, `Project`, `GoalFields`, `ProfilePatch`, `EMPTY_CV`, `profileQueryOptions()`, `saveProfile(patch: ProfilePatch): Promise<void>`, `importCv(file: File): Promise<void>`.
  - `api/templates.ts`: `DocumentTemplate`, `DocumentTemplateBody`, `FileTemplates`, `FileTemplatesBody`, `TemplatePreviewBody`, `documentTemplatesQueryOptions()`, `fileTemplatesQueryOptions()`, `templatePreviewQueryOptions(docType, ref)`, `selectDefaultTemplate({ docType, ref })`, `uploadTemplate({ docType, name, html })`, `deleteTemplate(id)`.
  - `api/profileDocuments.ts`: `ProfileDocument` gains `file_size`, `mime_type`, `created_at`, `downloadable` (boolean, `true` when absent); new `uploadProfileDocument({ file, docType })`, `deleteProfileDocument(id)`, `viewProfileDocument(id)`, `downloadProfileDocument(id)`.
  - `queryKeys.profile = ["settings", "profile"]`, `queryKeys.templateList = ["templates", "list"]`, `queryKeys.templatePreview(docType, ref) = ["templates", "preview", docType, ref]`, `queryKeys.fileTemplates = ["file-templates"]`, `queryKeys.profileDocumentFile(id, version) = ["profile-document-file", id, version]`. Both template keys sit under the `["templates"]` prefix that `applyEvent` already invalidates on `template_ready`.
  - `domain/profile.ts`: `PROFILE_SECTIONS`, `ProfileSection`, `DEFAULT_SECTION`, `sectionFromParam`, `profileHref`, `splitSkills`, `joinSkills`, `chipProblem`, `ChipProblem`, `CvGap`, `cvGaps`, `hasCvContent`, `cleanCv`, `ProfileField`, `toProfileField`.
  - `domain/templates.ts`: `TemplateKind`, `TEMPLATE_KINDS`, `DOC_TYPE_OF`, `SELECTION_FIELD`, `TEMPLATE_STALL_MS`, `TemplateState`, `templateState`, `TemplateOrigin`, `TemplateCard`, `galleryOf`, `defaultRef`, `canBeDefault`, `TemplateOutcome`, `templateOutcome`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/domain/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  chipProblem,
  cleanCv,
  cvGaps,
  joinSkills,
  profileHref,
  sectionFromParam,
  splitSkills,
  toProfileField,
} from "@/domain/profile";

const ENTRY = { company: "Acme", role: "Dev", duration: "2020-", description: "APIs, 40 % faster" };
const BLANK = { company: " ", role: "", duration: "", description: "" };
const LIMITS = { maxItems: 2, maxLength: 5 };

describe("profile sections", () => {
  it("parses known sections and falls back to Ziel", () => {
    expect(sectionFromParam("vorlagen")).toBe("vorlagen");
    expect(sectionFromParam("VORLAGEN")).toBe("ziel");
    expect(sectionFromParam(null)).toBe("ziel");
  });

  it("writes no parameter for the default section", () => {
    expect(profileHref("ziel")).toBe("/profile");
    expect(profileHref("nachweise")).toBe("/profile?section=nachweise");
  });
});

describe("skills", () => {
  it("splits the stored string, trims, drops empties and case duplicates", () => {
    expect(splitSkills(" Kotlin, java ,, Java, Spring Boot ")).toEqual(["Kotlin", "java", "Spring Boot"]);
    expect(splitSkills("")).toEqual([]);
  });

  it("joins with a comma and a space", () => {
    expect(joinSkills(["Kotlin", "Java"])).toBe("Kotlin, Java");
  });

  it("names the problem of a chip before it is added", () => {
    expect(chipProblem([], "  ", LIMITS)).toBe("empty");
    expect(chipProblem(["Go"], "go", LIMITS)).toBe("duplicate");
    expect(chipProblem([], "Kotlin", LIMITS)).toBe("tooLong");
    expect(chipProblem(["a", "b"], "c", LIMITS)).toBe("full");
    expect(chipProblem(["a"], "b", LIMITS)).toBeNull();
  });

  it("refuses a comma inside a skill chip, because the server stores skills comma separated", () => {
    expect(chipProblem([], "a,b", { ...LIMITS, noComma: true })).toBe("comma");
  });
});

describe("CV gaps (usability #26)", () => {
  const full = { role: "Lead", skills: "Kotlin", cv_data: { experience: [ENTRY], projects: [], education: "BSc" } };

  it("is empty for a complete profile", () => {
    expect(cvGaps(full)).toEqual([]);
  });

  it("names every gap in order, results last before education", () => {
    const thin = { role: " ", skills: "", cv_data: { experience: [{ ...ENTRY, description: "" }], projects: [], education: "" } };
    expect(cvGaps(thin)).toEqual(["role", "skills", "results", "education"]);
  });

  it("reports missing experience instead of missing results", () => {
    expect(cvGaps({ ...full, cv_data: { ...full.cv_data, experience: [] } })).toEqual(["experience"]);
  });
});

describe("cleanCv", () => {
  it("trims fields and drops entries that are entirely blank", () => {
    const cleaned = cleanCv({ experience: [ENTRY, BLANK], projects: [{ name: "", tech_stack: "", description: "" }], education: " BSc " });
    expect(cleaned).toEqual({ experience: [ENTRY], projects: [], education: "BSc" });
  });
});

describe("toProfileField", () => {
  it("maps server locations onto the form fields", () => {
    expect(toProfileField("role")).toBe("role");
    expect(toProfileField("spoken_languages.0")).toBe("spoken_languages");
    expect(toProfileField("cv_data.experience.3.description")).toBe("cv_data");
    expect(toProfileField("pushover_api_token")).toBeNull();
  });
});
```

`web/tests/unit/domain/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DocumentTemplate } from "@/api/templates";
import {
  canBeDefault,
  defaultRef,
  galleryOf,
  templateOutcome,
  templateState,
  TEMPLATE_STALL_MS,
} from "@/domain/templates";

const NOW = Date.parse("2026-10-09T10:00:00Z");
const template = (overrides: Partial<DocumentTemplate> = {}): DocumentTemplate => ({
  id: 7,
  doc_type: "CV",
  name: "Meine Vorlage",
  is_admin: false,
  user_id: 1,
  status: null,
  created_at: "2026-10-09T09:00:00Z",
  updated_at: "2026-10-09T09:58:00Z",
  ...overrides,
});
const FILES = { cv: ["classic"], cover_letter: ["classic"] };

describe("templateState", () => {
  it("maps the server statuses and treats unknown ones as ready", () => {
    expect(templateState(template(), NOW)).toBe("ready");
    expect(templateState(template({ status: "processing" }), NOW)).toBe("processing");
    expect(templateState(template({ status: "annotation_rejected" }), NOW)).toBe("rejected");
    expect(templateState(template({ status: "annotation_failed" }), NOW)).toBe("failed");
    expect(templateState(template({ status: "something_new" }), NOW)).toBe("ready");
  });

  it("calls a fill stalled once it ran longer than the limit", () => {
    const at = (age: number) => new Date(NOW - age).toISOString();
    expect(templateState(template({ status: "processing", updated_at: at(TEMPLATE_STALL_MS) }), NOW)).toBe("processing");
    expect(templateState(template({ status: "processing", updated_at: at(TEMPLATE_STALL_MS + 1) }), NOW)).toBe("stalled");
    expect(templateState(template({ status: "processing", updated_at: null, created_at: null }), NOW)).toBe("processing");
  });
});

describe("galleryOf", () => {
  it("lists bundled, global and own templates of one kind in that order", () => {
    const cards = galleryOf({
      kind: "cv",
      files: FILES,
      templates: [template(), template({ id: 8, is_admin: true, user_id: null, name: "Firma" }), template({ id: 9, doc_type: "COVER_LETTER" })],
      now: NOW,
    });
    expect(cards.map((card) => [card.ref, card.origin])).toEqual([
      ["classic", "builtin"],
      ["8", "global"],
      ["7", "own"],
    ]);
  });
});

describe("defaultRef", () => {
  const cards = galleryOf({ kind: "cv", files: FILES, templates: [template()], now: NOW });

  it("uses the stored selection when it is in the gallery", () => {
    expect(defaultRef("cv", { cv_template: "7", cover_letter_template: null }, cards)).toBe("7");
  });

  it("falls back to the bundled template for a missing, deleted or foreign selection", () => {
    expect(defaultRef("cv", { cv_template: null, cover_letter_template: null }, cards)).toBe("classic");
    expect(defaultRef("cv", { cv_template: "99", cover_letter_template: null }, cards)).toBe("classic");
  });
});

describe("canBeDefault and templateOutcome", () => {
  it("never offers a template the AI is still filling", () => {
    const [card] = galleryOf({ kind: "cv", files: { cv: [], cover_letter: [] }, templates: [template({ status: "processing" })], now: NOW });
    expect(canBeDefault(card!)).toBe(false);
  });

  it("reports only the step out of the fill", () => {
    expect(templateOutcome("processing", "ready")).toBe("ready");
    expect(templateOutcome("stalled", "rejected")).toBe("rejected");
    expect(templateOutcome("processing", "failed")).toBe("failed");
    expect(templateOutcome(undefined, "ready")).toBeNull();
    expect(templateOutcome("ready", "ready")).toBeNull();
    expect(templateOutcome("processing", "stalled")).toBeNull();
  });
});
```

`web/tests/unit/api/profileApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { importCv, profileQueryOptions, saveProfile } from "@/api/profile";
import { deleteProfileDocument, fetchProfileDocuments, uploadProfileDocument } from "@/api/profileDocuments";
import { templatePreviewPath } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { deleteTemplate, documentTemplatesQueryOptions, selectDefaultTemplate, uploadTemplate } from "@/api/templates";
import { createTestQueryClient } from "../support/render";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const STORED = {
  id: 3, user_id: 1, role: "Lead", skills: "Kotlin", min_salary: null, location: "Hamburg",
  preferences: null, spoken_languages: null, cv_data: {}, cv_template: "7", cover_letter_template: null,
  pushover_api_token: "__masked__", smtp_password: "__masked__", smtp_host: "smtp.example.com",
};

describe("profile api", () => {
  it("the profile schema drops secrets and notification fields and fills legacy gaps", async () => {
    stubRoutes({ "GET /settings": STORED });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile).toEqual({
      role: "Lead", skills: "Kotlin", min_salary: "", location: "Hamburg", preferences: "",
      spoken_languages: [], cv_data: { experience: [], projects: [], education: "" },
      cv_template: "7", cover_letter_template: null,
    });
    expect(profileQueryOptions().queryKey).toEqual(queryKeys.profile);
  });

  it("fills missing entry fields of legacy CV data", async () => {
    stubRoutes({ "GET /settings": { ...STORED, cv_data: { experience: [{ company: "Acme" }], education: null } } });
    const profile = await createTestQueryClient().fetchQuery(profileQueryOptions());
    expect(profile.cv_data.experience).toEqual([{ company: "Acme", role: "", duration: "", description: "" }]);
  });

  it("saves exactly the patch it is given", async () => {
    const calls = stubRoutes({ "POST /settings": { status: "saved" } });
    await saveProfile({ role: "Lead" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ role: "Lead" });
  });

  it("sends the CV as multipart under 'file'", async () => {
    const calls = stubRoutes({ "POST /settings/upload-cv": { status: "success", data: {} } });
    await importCv(new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    expect((calls[0]!.rawBody as FormData).get("file")).toBeInstanceOf(File);
  });
});

describe("templates api", () => {
  it("lists under the templates prefix that realtime invalidates", () => {
    expect(documentTemplatesQueryOptions().queryKey.slice(0, 1)).toEqual(queryKeys.templates);
  });

  it("selects a default per kind", async () => {
    const calls = stubRoutes({ "PATCH /settings/template": { status: "saved" } });
    await selectDefaultTemplate({ docType: "COVER_LETTER", ref: "classic" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ cover_letter_template: "classic" });
  });

  it("uploads JSON and deletes by id", async () => {
    const created = { id: 9, doc_type: "CV", name: "Mine", is_admin: false, user_id: 1, status: "processing" };
    const calls = stubRoutes({ "POST /document-templates": created, "DELETE /document-templates/9": { ok: true } });
    expect(await uploadTemplate({ docType: "CV", name: "Mine", html: "<p/>" })).toMatchObject({ id: 9, status: "processing" });
    await deleteTemplate(9);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ doc_type: "CV", name: "Mine", html: "<p/>" });
  });

  it("encodes the preview query", () => {
    expect(templatePreviewPath("CV", "7")).toBe("/document-templates/preview?doc_type=CV&template=7");
  });
});

describe("profile documents api", () => {
  it("reads downloadable and treats an older answer without it as downloadable", async () => {
    stubRoutes({ "GET /profile/documents": [
      { id: 1, doc_type: "CERTIFICATE", label: null, original_filename: "a.pdf", downloadable: false },
      { id: 2, doc_type: "REFERENCE", label: "Ref", original_filename: "b.pdf" },
    ] });
    const [drive, db] = await fetchProfileDocuments();
    expect([drive!.downloadable, db!.downloadable]).toEqual([false, true]);
  });

  it("uploads with the type and deletes by id", async () => {
    const calls = stubRoutes({ "POST /profile/documents": { id: 3 }, "DELETE /profile/documents/3": { status: "deleted" } });
    await uploadProfileDocument({ file: new File(["%PDF-"], "z.pdf", { type: "application/pdf" }), docType: "REFERENCE" });
    await deleteProfileDocument(3);
    expect((calls[0]!.rawBody as FormData).get("doc_type")).toBe("REFERENCE");
    expect(calls[1]!.method).toBe("DELETE");
  });
});
```

In `web/tests/unit/realtime/handleMessage.test.ts`, extend "invalidates the templates when one is ready": also seed `queryKeys.templatePreview("CV", "7")` and `queryKeys.templateList` and assert both are invalidated.

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/profile.test.ts tests/unit/domain/templates.test.ts tests/unit/api/profileApi.test.ts tests/unit/realtime/handleMessage.test.ts`
Expected: FAIL: the modules `@/domain/profile`, `@/domain/templates`, `@/api/profile`, `@/api/templates`, `@/api/profilePaths` do not exist; `queryKeys.templatePreview` is undefined.

- [ ] **Step 3: Client-free paths and limits**

`web/src/api/profilePaths.ts`:

```ts
/**
 * Paths, limits and codes of the profile endpoints. Client-free (no API client import), so the
 * e2e fixtures and FakeServer can import them at runtime.
 */
export const SETTINGS_PATH = "/settings";
export const UPLOAD_CV_PATH = "/settings/upload-cv";
export const TEMPLATE_SELECTION_PATH = "/settings/template";
export const PROFILE_DOCUMENTS_PATH = "/profile/documents";
export const FILE_TEMPLATES_PATH = "/profile/templates";
export const DOCUMENT_TEMPLATES_PATH = "/document-templates";
export const TEMPLATE_PREVIEW_PATH = "/document-templates/preview";

export const profileDocumentPath = (id: number) => `${PROFILE_DOCUMENTS_PATH}/${id}`;
export const profileDocumentFilePath = (id: number, mode: "view" | "download") =>
  `${profileDocumentPath(id)}/${mode}`;
export const documentTemplatePath = (id: number) => `${DOCUMENT_TEMPLATES_PATH}/${id}`;

export const TEMPLATE_DOC_TYPES = ["CV", "COVER_LETTER"] as const;
export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

export function templatePreviewPath(docType: TemplateDocType, ref: string): string {
  const query = new URLSearchParams({ doc_type: docType, template: ref });
  return `${TEMPLATE_PREVIEW_PATH}?${query.toString()}`;
}

// Mirrors server/database/core.py (Task 2); the server answers 422 on the field otherwise.
export const PROFILE_LIMITS = {
  role: 200,
  skills: 2000,
  skill: 100,
  minSalary: 50,
  location: 200,
  preferences: 5000,
  spokenLanguages: 20,
  spokenLanguage: 50,
  cvEntries: 30,
  entryTitle: 200,
  entryDuration: 100,
  entryText: 5000,
  education: 5000,
} as const;

// Mirrors server/routers/profile_documents.py and core/uploads.py (413/415 otherwise).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PROOF_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const PROOF_DOC_TYPES = ["CERTIFICATE", "REFERENCE"] as const;
export type ProofDocType = (typeof PROOF_DOC_TYPES)[number];

// Mirrors server/database/core.py MAX_TEMPLATE_HTML_LENGTH and MAX_TEMPLATE_NAME_LENGTH.
export const MAX_TEMPLATE_HTML_LENGTH = 1_000_000;
export const MAX_TEMPLATE_NAME_LENGTH = 100;
/** The bundled template the server falls back to (services/document_renderer.py). */
export const DEFAULT_FILE_TEMPLATE = "classic";
export const TEMPLATE_STATUS = {
  processing: "processing",
  rejected: "annotation_rejected",
  failed: "annotation_failed",
} as const;
/** What GET /settings answers for a stored secret; the profile never parses or sends it. */
export const SECRET_MASK = "__masked__";
```

- [ ] **Step 4: Profile and templates API**

`web/src/api/profile.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { SETTINGS_PATH, UPLOAD_CV_PATH } from "./profilePaths";
import { queryKeys } from "./queryKeys";

// Legacy rows hold nulls, {} or entries with missing keys; the form always gets strings and lists.
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");
const listOf = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);

const experienceSchema = z.object({ company: text, role: text, duration: text, description: text });
const projectSchema = z.object({ name: text, tech_stack: text, description: text });
const cvDataSchema = z.object({
  experience: listOf(experienceSchema),
  projects: listOf(projectSchema),
  education: text,
});

export const EMPTY_CV: z.infer<typeof cvDataSchema> = { experience: [], projects: [], education: "" };

// Only profile fields: zod drops every other key, so secrets and notification settings that
// GET /settings also returns are never read, kept or sent back (spec B2, Review Focus 1).
const profileSchema = z.object({
  role: text,
  skills: text,
  min_salary: text,
  location: text,
  preferences: text,
  spoken_languages: listOf(z.string()),
  cv_data: cvDataSchema.nullish().transform((value) => value ?? EMPTY_CV),
  cv_template: z.string().nullish(),
  cover_letter_template: z.string().nullish(),
});
const savedSchema = z.object({ status: z.string() });
const anyBodySchema = z.unknown();

export type Profile = z.infer<typeof profileSchema>;
export type ProfileBody = z.input<typeof profileSchema>;
export type CvData = Profile["cv_data"];
export type Experience = CvData["experience"][number];
export type Project = CvData["projects"][number];
export type GoalFields = Pick<
  Profile,
  "role" | "skills" | "min_salary" | "location" | "preferences" | "spoken_languages"
>;
export type ProfilePatch = Partial<GoalFields> | { cv_data: CvData };

export function profileQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.profile,
    queryFn: () => api.request(SETTINGS_PATH, profileSchema),
  });
}

/** One section's fields; the server writes only the keys present (B2). */
export async function saveProfile(patch: ProfilePatch): Promise<void> {
  await api.request(SETTINGS_PATH, savedSchema, { method: "POST", json: patch });
}

/** The server parses and stores the CV itself; the caller refetches the profile. */
export async function importCv(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api.request(UPLOAD_CV_PATH, anyBodySchema, { method: "POST", formData: form });
}
```

`web/src/api/templates.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import {
  DOCUMENT_TEMPLATES_PATH,
  documentTemplatePath,
  FILE_TEMPLATES_PATH,
  TEMPLATE_SELECTION_PATH,
  templatePreviewPath,
  type TemplateDocType,
} from "./profilePaths";
import { queryKeys } from "./queryKeys";

const documentTemplateSchema = z.object({
  id: z.number().int(),
  doc_type: z.string(),
  name: z.string(),
  is_admin: z.boolean().nullish(),
  user_id: z.number().int().nullish(),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
const fileTemplatesSchema = z.object({ cv: z.array(z.string()), cover_letter: z.array(z.string()) });
const previewSchema = z.object({ html: z.string() });
const anyBodySchema = z.unknown();

export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export type DocumentTemplateBody = z.input<typeof documentTemplateSchema>;
export type FileTemplates = z.infer<typeof fileTemplatesSchema>;
export type FileTemplatesBody = z.input<typeof fileTemplatesSchema>;
export type TemplatePreviewBody = z.input<typeof previewSchema>;

const SELECTION_KEY: Record<TemplateDocType, string> = {
  CV: "cv_template",
  COVER_LETTER: "cover_letter_template",
};

export function documentTemplatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.templateList,
    queryFn: () => api.request(DOCUMENT_TEMPLATES_PATH, z.array(documentTemplateSchema)),
  });
}

export function fileTemplatesQueryOptions() {
  // The bundled templates only change with a deployment.
  return queryOptions({
    queryKey: queryKeys.fileTemplates,
    queryFn: () => api.request(FILE_TEMPLATES_PATH, fileTemplatesSchema),
    staleTime: Infinity,
  });
}

export function templatePreviewQueryOptions(docType: TemplateDocType, ref: string) {
  return queryOptions({
    queryKey: queryKeys.templatePreview(docType, ref),
    queryFn: async () => (await api.request(templatePreviewPath(docType, ref), previewSchema)).html,
  });
}

export async function selectDefaultTemplate(input: { docType: TemplateDocType; ref: string }) {
  const json = { [SELECTION_KEY[input.docType]]: input.ref };
  await api.request(TEMPLATE_SELECTION_PATH, anyBodySchema, { method: "PATCH", json });
}

export async function uploadTemplate(input: {
  docType: TemplateDocType;
  name: string;
  html: string;
}): Promise<DocumentTemplate> {
  const json = { doc_type: input.docType, name: input.name, html: input.html };
  return api.request(DOCUMENT_TEMPLATES_PATH, documentTemplateSchema, { method: "POST", json });
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.request(documentTemplatePath(id), anyBodySchema, { method: "DELETE" });
}
```

`web/src/api/profileDocuments.ts` becomes (existing exports unchanged in name and behaviour):

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { fetchFile, uploadForm, type DownloadedFile } from "./files";
import { api } from "./instance";
import {
  PROFILE_DOCUMENTS_PATH,
  profileDocumentFilePath,
  profileDocumentPath,
  type ProofDocType,
} from "./profilePaths";
import { queryKeys } from "./queryKeys";

const profileDocumentSchema = z.object({
  id: z.number().int(),
  doc_type: z.string(),
  label: z.string().nullish(),
  original_filename: z.string(),
  file_size: z.number().int().nullish(),
  mime_type: z.string().nullish(),
  created_at: z.string().nullish(),
  // Absent before server Task 1; Drive files answer 400 on view/download.
  downloadable: z
    .boolean()
    .nullish()
    .transform((value) => value ?? true),
});
const anyBodySchema = z.unknown();
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
export type ProfileDocumentBody = z.input<typeof profileDocumentSchema>;

/** Certificates and references that "generate-package" can copy into a job. */
export async function fetchProfileDocuments(): Promise<ProfileDocument[]> {
  return api.request(PROFILE_DOCUMENTS_PATH, z.array(profileDocumentSchema));
}

export function profileDocumentsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.profileDocuments, queryFn: fetchProfileDocuments });
}

export async function uploadProfileDocument(input: { file: File; docType: ProofDocType }) {
  const form = new FormData();
  form.append("file", input.file);
  form.append("doc_type", input.docType);
  await uploadForm(PROFILE_DOCUMENTS_PATH, form);
}

export async function deleteProfileDocument(id: number): Promise<void> {
  await api.request(profileDocumentPath(id), anyBodySchema, { method: "DELETE" });
}

export function viewProfileDocument(id: number): Promise<DownloadedFile> {
  return fetchFile(profileDocumentFilePath(id, "view"));
}

export function downloadProfileDocument(id: number): Promise<DownloadedFile> {
  return fetchFile(profileDocumentFilePath(id, "download"));
}
```

`web/src/api/queryKeys.ts`, add next to `templates` and `profileDocuments` (keep `templates`, which `applyEvent` invalidates as a prefix):

```ts
  // GET /settings read with the profile-only schema (api/profile.ts); secrets are never parsed.
  profile: ["settings", "profile"],
  // Under the templates prefix: template_ready refreshes the list and every preview (Task 5).
  templateList: ["templates", "list"],
  templatePreview: (docType: string, ref: string) => ["templates", "preview", docType, ref] as const,
  fileTemplates: ["file-templates"],
  // Bytes of one stored profile document; immutable per upload.
  profileDocumentFile: (id: number, version: string) => ["profile-document-file", id, version] as const,
```

- [ ] **Step 5: Domain rules**

`web/src/domain/profile.ts`:

```ts
import type { CvData, Profile } from "@/api/profile";
import { PROFILE_HREF } from "@/features/shell/navigation";

export const PROFILE_SECTIONS = ["ziel", "lebenslauf", "nachweise", "vorlagen"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export const DEFAULT_SECTION: ProfileSection = "ziel";
const SECTION_PARAM = "section";
const SKILL_SEPARATOR = ",";
const SKILL_JOINER = ", ";

export function sectionFromParam(value: string | null): ProfileSection {
  return PROFILE_SECTIONS.find((section) => section === value) ?? DEFAULT_SECTION;
}

/** D1: the default section has no parameter. */
export function profileHref(section: ProfileSection): string {
  if (section === DEFAULT_SECTION) return PROFILE_HREF;
  return `${PROFILE_HREF}?${new URLSearchParams({ [SECTION_PARAM]: section }).toString()}`;
}

function withoutCaseDuplicates(items: readonly string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The server stores skills as one comma separated string. */
export function splitSkills(skills: string): string[] {
  const items = skills.split(SKILL_SEPARATOR).map((item) => item.trim());
  return withoutCaseDuplicates(items.filter((item) => item.length > 0));
}

export function joinSkills(items: readonly string[]): string {
  return items.join(SKILL_JOINER);
}

export type ChipProblem = "empty" | "duplicate" | "tooLong" | "full" | "comma";

export interface ChipLimits {
  maxItems: number;
  maxLength: number;
  /** Skills: a comma would split one chip into two on the next load. */
  noComma?: boolean;
}

export function chipProblem(
  items: readonly string[],
  value: string,
  limits: ChipLimits,
): ChipProblem | null {
  const chip = value.trim();
  if (!chip) return "empty";
  if (limits.noComma && chip.includes(SKILL_SEPARATOR)) return "comma";
  if (chip.length > limits.maxLength) return "tooLong";
  if (items.some((item) => item.toLowerCase() === chip.toLowerCase())) return "duplicate";
  return items.length >= limits.maxItems ? "full" : null;
}

export type CvGap = "role" | "skills" | "experience" | "results" | "education";
type GapInput = Pick<Profile, "role" | "skills" | "cv_data">;

const blank = (value: string) => value.trim().length === 0;

/** Usability #26: what the AI misses, read from the stored profile (D7). */
export function cvGaps(profile: GapInput): CvGap[] {
  const { experience, education } = profile.cv_data;
  const gaps: CvGap[] = [];
  if (blank(profile.role)) gaps.push("role");
  if (blank(profile.skills)) gaps.push("skills");
  if (experience.length === 0) gaps.push("experience");
  else if (experience.some((entry) => blank(entry.description))) gaps.push("results");
  if (blank(education)) gaps.push("education");
  return gaps;
}

/** D6: whether an import would replace something the user already entered. */
export function hasCvContent(profile: GapInput): boolean {
  const { experience, projects, education } = profile.cv_data;
  const filled = [profile.role, profile.skills, education].some((value) => !blank(value));
  return filled || experience.length > 0 || projects.length > 0;
}

function trimmed<T extends Record<string, string>>(entry: T): T {
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.trim()])) as T;
}

function filledEntries<T extends Record<string, string>>(entries: readonly T[]): T[] {
  return entries.map(trimmed).filter((entry) => Object.values(entry).some((value) => value));
}

/** D5: what a save sends; entirely blank entries are dropped. */
export function cleanCv(cv: CvData): CvData {
  return {
    experience: filledEntries(cv.experience),
    projects: filledEntries(cv.projects),
    education: cv.education.trim(),
  };
}

export type ProfileField =
  | "role"
  | "skills"
  | "min_salary"
  | "location"
  | "preferences"
  | "spoken_languages"
  | "cv_data";

const PROFILE_FIELDS: readonly ProfileField[] = [
  "role",
  "skills",
  "min_salary",
  "location",
  "preferences",
  "spoken_languages",
  "cv_data",
];

/** A 422 location ("cv_data.experience.3.description") onto the form field it belongs to. */
export function toProfileField(serverField: string): ProfileField | null {
  const head = serverField.split(".")[0];
  return PROFILE_FIELDS.find((field) => field === head) ?? null;
}
```

(`domain/profile.ts` imports `PROFILE_HREF` from `features/shell/navigation.ts`, which imports only lucide icons and a type: it stays client-free for e2e imports. If `navigation.ts` gains a client import later, inline the constant.)

`web/src/domain/templates.ts`:

```ts
import type { Profile } from "@/api/profile";
import {
  DEFAULT_FILE_TEMPLATE,
  TEMPLATE_STATUS,
  type TemplateDocType,
} from "@/api/profilePaths";
import type { DocumentTemplate, FileTemplates } from "@/api/templates";

export type TemplateKind = "cv" | "letter";
export const TEMPLATE_KINDS: readonly TemplateKind[] = ["cv", "letter"];
export const DOC_TYPE_OF: Readonly<Record<TemplateKind, TemplateDocType>> = {
  cv: "CV",
  letter: "COVER_LETTER",
};
export const SELECTION_FIELD = {
  cv: "cv_template",
  letter: "cover_letter_template",
} as const satisfies Record<TemplateKind, keyof Profile>;
const FILE_CATEGORY = { cv: "cv", letter: "cover_letter" } as const satisfies Record<
  TemplateKind,
  keyof FileTemplates
>;

/** D10: a fill running this long lost its worker (hard kill); the AI call alone ends after 11 min. */
export const TEMPLATE_STALL_MS = 15 * 60_000;

export type TemplateState = "ready" | "processing" | "stalled" | "rejected" | "failed";
type StateInput = Pick<DocumentTemplate, "status" | "updated_at" | "created_at">;

function startedAt(template: StateInput): number | null {
  const stamp = template.updated_at ?? template.created_at;
  return stamp ? Date.parse(stamp) : null;
}

export function templateState(template: StateInput, now: number): TemplateState {
  if (template.status === TEMPLATE_STATUS.rejected) return "rejected";
  if (template.status === TEMPLATE_STATUS.failed) return "failed";
  if (template.status !== TEMPLATE_STATUS.processing) return "ready";
  const started = startedAt(template);
  return started !== null && now - started > TEMPLATE_STALL_MS ? "stalled" : "processing";
}

export type TemplateOrigin = "builtin" | "global" | "own";

export interface TemplateCard {
  /** What the server stores as the selection: a file key or the template id as a string. */
  ref: string;
  name: string;
  origin: TemplateOrigin;
  state: TemplateState;
  /** The DocumentTemplate id; null for a bundled template. */
  id: number | null;
  createdAt: string | null;
}

interface GalleryInput {
  kind: TemplateKind;
  files: FileTemplates;
  templates: readonly DocumentTemplate[];
  now: number;
}

function builtinCard(key: string): TemplateCard {
  return { ref: key, name: key, origin: "builtin", state: "ready", id: null, createdAt: null };
}

function templateCard(template: DocumentTemplate, now: number): TemplateCard {
  return {
    ref: String(template.id),
    name: template.name,
    origin: template.is_admin ? "global" : "own",
    state: templateState(template, now),
    id: template.id,
    createdAt: template.created_at ?? null,
  };
}

/** D9: bundled first, then global, then own templates of one kind. */
export function galleryOf({ kind, files, templates, now }: GalleryInput): TemplateCard[] {
  const ofKind = templates.filter((template) => template.doc_type === DOC_TYPE_OF[kind]);
  const cards = ofKind.map((template) => templateCard(template, now));
  return [
    ...files[FILE_CATEGORY[kind]].map(builtinCard),
    ...cards.filter((card) => card.origin === "global"),
    ...cards.filter((card) => card.origin === "own"),
  ];
}

type Selection = Pick<Profile, "cv_template" | "cover_letter_template">;

/** The stored default, or the server's fallback when it names nothing in the gallery. */
export function defaultRef(kind: TemplateKind, selection: Selection, cards: readonly TemplateCard[]) {
  const stored = selection[SELECTION_FIELD[kind]];
  return cards.some((card) => card.ref === stored) && stored ? stored : DEFAULT_FILE_TEMPLATE;
}

export function canBeDefault(card: TemplateCard): boolean {
  return card.state !== "processing" && card.state !== "stalled";
}

export type TemplateOutcome = "ready" | "rejected" | "failed";
const FILLING: readonly TemplateState[] = ["processing", "stalled"];
const OUTCOMES: readonly TemplateState[] = ["ready", "rejected", "failed"];

/** D13: a card that left the AI fill since it was last seen; null for anything else. */
export function templateOutcome(
  previous: TemplateState | undefined,
  next: TemplateState,
): TemplateOutcome | null {
  if (!previous || !FILLING.includes(previous) || !OUTCOMES.includes(next)) return null;
  return next as TemplateOutcome;
}
```

(`builtinCard` uses the key as the name; the card component maps known keys through `FILE_TEMPLATE_LABEL`, Task 11.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/profile.test.ts tests/unit/domain/templates.test.ts tests/unit/api/profileApi.test.ts tests/unit/realtime/handleMessage.test.ts tests/unit/api/companies.test.ts tests/unit/features/job/documentsTab.test.tsx`
Expected: PASS (the two job-page tests prove the extended document schema still reads their fixtures).

- [ ] **Step 7: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 6: Profil frame: route, masthead, sub-nav, URL, section states, live region, FakeServer

**Files:**
- Create: `web/src/features/profile/ProfilePage.tsx`, `ProfileNav.tsx`, `ProfileSectionFrame.tsx`, `SectionState.tsx`, `useProfileSection.ts`, `useReportDirty.ts`, `announcer.ts`, `ProfileLiveStatus.tsx`, `labels.ts`, `profile.css`; the four section entry files `goal/GoalSection.tsx`, `cv/CvSection.tsx`, `proofs/ProofsSection.tsx`, `templates/TemplatesSection.tsx` (frame only here; Tasks 7-12 fill them); `web/tests/unit/features/profile/profilePage.test.tsx`, `web/tests/unit/support/profileRoutes.ts`, `web/tests/unit/theme/profileStyles.test.ts`, `web/tests/e2e/support/profileFixtures.ts`, `web/tests/e2e/support/profileServer.ts`, `web/tests/e2e/profile.spec.ts`
- Modify: `web/app/(app)/profile/page.tsx`, `web/app/globals.css` (import `profile.css` after `sources.css`), `web/tests/e2e/support/mockApi.ts` (`respond(sent, request)`), `web/tests/e2e/shell.spec.ts` (remove `["/profile", "Profil"]` from `PLACEHOLDER_ROUTES`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `profileQueryOptions` (Task 5), `profileDocumentsQueryOptions`, `documentTemplatesQueryOptions`, `fileTemplatesQueryOptions` (Task 5), `setupStatusQueryOptions`, `sectionFromParam`, `profileHref`, `PROFILE_SECTIONS`, `ProfileSection` (Task 5), `useDirtySections`, `ReportDirty` (`features/sources/drawer/useDirtySections.ts`), `givenUp`, `useClearThenSet`, `ListLoading`, `ListError` (`features/inbox/InboxList.tsx`), `Masthead`, `navNumber`.
- Produces:
  - `ProfilePage()`; `SectionProps = { report: ReportDirty }` (every section component takes it).
  - `ProfileSectionFrame({ section, children })`: `<section>` with `h2` (`tabIndex={-1}`, id `profileHeadingId(section)`) and the intro line.
  - `SectionState<T>({ query, children: (data: T) => ReactNode })`: loading skeleton, error with retry (`givenUp`), else the children.
  - `useReportDirty(report, section, dirty)`: reports and clears on unmount.
  - `announcer.ts`: `createAnnouncer()`, `AnnouncerContext`, `useProfileAnnounce(): (text: string) => void`, `useLastAnnouncement()`.
  - `labels.ts`: `SECTION_LABEL`, `SECTION_INTRO` (`Record<ProfileSection, MessageKey>`), `profileHeadingId(section)`.
  - e2e: `ProfileServer` (state: `profile` incl. secrets, `documents`, `templates`, `files`, `saved` bodies) with `settings()`; `profileRoutes(server, extra?)`; fixtures `STORED_PROFILE`, `E2E_SECRETS`, `PROFILE_DOCUMENTS`, `DOCUMENT_TEMPLATES`, `FILE_TEMPLATES`; `mockApi` `MockResponse.respond(sent, request)`.
  - unit: `profileStubs(overrides?)`, `PROFILE`, `STORED_SETTINGS`.

- [ ] **Step 1: e2e support (fixtures, FakeServer, `respond` with the request)**

`web/tests/e2e/support/mockApi.ts`: `respond?: (sent: unknown, request: Request) => unknown;` in `MockResponse`; `live = (respond: (sent: unknown, request: Request) => unknown): MockResponse`; `answerOf(response, sent, request)` passes `request` to `respond`; `jsonAnswer(response, sent, request)` and `fulfil` pass `route.request()` along. Existing `respond` functions ignore the second argument; nothing else changes.

`web/tests/e2e/support/profileFixtures.ts`:

```ts
import type { ProfileBody } from "../../../src/api/profile";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import type { DocumentTemplateBody, FileTemplatesBody } from "../../../src/api/templates";

// Stored next to the profile like on the real server; GET /settings masks them (Review Focus 1).
export const E2E_SECRETS = {
  pushover_api_token: "PUSH_TOKEN_E2E_4711",
  resend_api_key: "RESEND_KEY_E2E_4711",
  smtp_password: "SMTP_PW_E2E_4711",
  google_drive_refresh_token: "DRIVE_TOKEN_E2E_4711",
} as const;
export const E2E_NOTIFICATION_FIELDS = {
  pushover_user_key: "push-user",
  resend_from_email: "jobs@example.com",
  smtp_host: "smtp.example.com",
  email_global_recipient: "me@example.com",
  active_notification_service: "PUSHOVER",
  active_storage_service: "GOOGLE_DRIVE",
} as const;

export const STORED_PROFILE: ProfileBody = {
  role: "Senior Backend-Entwickler (Java/Kotlin)",
  skills: "Java 21, Kotlin, Spring Boot, PostgreSQL",
  min_salary: "78000",
  location: "Hamburg oder remote",
  preferences: "Hybrid, höchstens zwei Bürotage pro Woche.",
  spoken_languages: ["Deutsch (Muttersprache)", "Englisch (fließend)"],
  cv_data: {
    experience: [
      {
        company: "Hanseatic Commerce GmbH",
        role: "Senior Backend Engineer",
        duration: "03/2021 – heute",
        description: "Checkout- und Zahlungsdienste für 2 Mio. Kund:innen.",
      },
    ],
    projects: [{ name: "kotlin-outbox", tech_stack: "Kotlin, Spring", description: "Transaktionale Outbox." }],
    education: "B.Sc. Informatik, Universität Hamburg, 2015",
  },
  cv_template: "classic",
  cover_letter_template: null,
};

export const PROFILE_DOCUMENTS: ProfileDocumentBody[] = [
  {
    id: 1,
    doc_type: "REFERENCE",
    label: "Arbeitszeugnis Nordlicht Software AG.pdf",
    original_filename: "Arbeitszeugnis Nordlicht Software AG.pdf",
    file_size: 421_888,
    mime_type: "application/pdf",
    created_at: "2026-08-12T09:00:00+00:00",
    downloadable: true,
  },
  {
    id: 2,
    doc_type: "CERTIFICATE",
    label: "AWS Developer.png",
    original_filename: "AWS Developer.png",
    file_size: 1_258_291,
    mime_type: "image/png",
    created_at: "2026-09-01T09:00:00+00:00",
    downloadable: false,
  },
];

export const DOCUMENT_TEMPLATES: DocumentTemplateBody[] = [
  {
    id: 7,
    doc_type: "CV",
    name: "Zweispaltig",
    is_admin: true,
    user_id: null,
    status: null,
    created_at: "2026-08-01T09:00:00+00:00",
    updated_at: "2026-08-01T09:00:00+00:00",
  },
  {
    id: 8,
    doc_type: "CV",
    name: "lebenslauf_2025",
    is_admin: false,
    user_id: 1,
    status: "annotation_rejected",
    created_at: "2026-08-12T09:00:00+00:00",
    updated_at: "2026-08-12T09:01:00+00:00",
  },
];

export const FILE_TEMPLATES: FileTemplatesBody = { cv: ["classic"], cover_letter: ["classic"] };
```

`web/tests/e2e/support/profileServer.ts` (later tasks add methods, each with the real server's rule in its doc comment):

```ts
import {
  DOCUMENT_TEMPLATES_PATH,
  FILE_TEMPLATES_PATH,
  PROFILE_DOCUMENTS_PATH,
  SECRET_MASK,
  SETTINGS_PATH,
} from "../../../src/api/profilePaths";
import type { ProfileBody } from "../../../src/api/profile";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import type { DocumentTemplateBody, FileTemplatesBody } from "../../../src/api/templates";
import { AUTHENTICATED_ROUTES, SETUP_DONE } from "./fixtures";
import { live, type MockRoutes, type MutableRoutes } from "./mockApi";
import {
  DOCUMENT_TEMPLATES,
  E2E_NOTIFICATION_FIELDS,
  E2E_SECRETS,
  FILE_TEMPLATES,
  PROFILE_DOCUMENTS,
  STORED_PROFILE,
} from "./profileFixtures";

type Stored = ProfileBody & Record<string, unknown>;
const SECRET_KEYS = Object.keys(E2E_SECRETS);

/**
 * The profile endpoints by the rules of routers/settings.py, profile_documents.py and
 * templates.py: answers come from this state, never from the request body.
 */
export class ProfileServer {
  profile: Stored;
  readonly documents: ProfileDocumentBody[];
  readonly templates: DocumentTemplateBody[];
  readonly files: FileTemplatesBody;
  /** Every POST /settings body, for "sends only its own fields" assertions. */
  readonly saved: Record<string, unknown>[] = [];
  aiConfigured = true;

  constructor(profile: ProfileBody = STORED_PROFILE) {
    this.profile = { ...structuredClone(profile), ...E2E_SECRETS, ...E2E_NOTIFICATION_FIELDS };
    this.documents = structuredClone(PROFILE_DOCUMENTS);
    this.templates = structuredClone(DOCUMENT_TEMPLATES);
    this.files = structuredClone(FILE_TEMPLATES);
  }

  /** GET /settings: the whole row, secrets replaced by the mask (deps._mask_profile). */
  settings(): Stored {
    const masked: Stored = { ...structuredClone(this.profile), language: "de", timezone: "Europe/Berlin" };
    for (const key of SECRET_KEYS) if (masked[key]) masked[key] = SECRET_MASK;
    return masked;
  }

  setupStatus() {
    const complete = Boolean(this.profile.role?.trim() && this.profile.skills?.trim());
    return { ...SETUP_DONE, ai_configured: this.aiConfigured, profile_complete: complete };
  }
}

export function profileRoutes(server = new ProfileServer(), extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    [`GET ${SETTINGS_PATH}`]: live(() => server.settings()),
    "GET /setup-status": live(() => server.setupStatus()),
    [`GET ${PROFILE_DOCUMENTS_PATH}`]: live(() => structuredClone(server.documents)),
    [`GET ${DOCUMENT_TEMPLATES_PATH}`]: live(() => structuredClone(server.templates)),
    [`GET ${FILE_TEMPLATES_PATH}`]: live(() => structuredClone(server.files)),
    ...extra,
  };
}
```

(`GET /settings` also answers the shell's language and time zone queries, which is why `settings()` carries `language` and `timezone`.)

`web/tests/unit/support/profileRoutes.ts`:

```ts
import type { ProfileBody } from "@/api/profile";
import type { RouteTable } from "./stubRoutes";

export const PROFILE: ProfileBody = {
  role: "Lead",
  skills: "Kotlin, Java",
  min_salary: "80000",
  location: "Hamburg",
  preferences: "Hybrid",
  spoken_languages: ["Deutsch"],
  cv_data: {
    experience: [{ company: "Acme", role: "Dev", duration: "2020 – heute", description: "APIs" }],
    projects: [],
    education: "BSc",
  },
  cv_template: "classic",
  cover_letter_template: null,
};
/** What GET /settings really answers: the profile plus masked secrets the web must ignore. */
export const STORED_SETTINGS = { ...PROFILE, pushover_api_token: "__masked__", smtp_host: "smtp.example.com" };

export function profileStubs(overrides: RouteTable = {}): RouteTable {
  return {
    "GET /settings": STORED_SETTINGS,
    "GET /setup-status": { has_source: true, ai_configured: true, profile_complete: true, has_jobs: true },
    "GET /profile/documents": [],
    "GET /document-templates": [],
    "GET /profile/templates": { cv: ["classic"], cover_letter: ["classic"] },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`web/tests/unit/features/profile/profilePage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";
import { jsonResponse } from "../../support/fakeFetch";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

describe("ProfilePage", () => {
  it("shows the masthead, the sub-nav in spec order and Ziel by default", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Profil" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Profilbereiche" });
    const links = Array.from(nav.querySelectorAll("a")).map((link) => link.textContent);
    expect(links).toEqual(["Ziel", "Lebenslauf", "Nachweise", "Vorlagen"]);
    expect(screen.getByRole("link", { name: "Ziel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
  });

  it("opens the section named in the URL and links the others", () => {
    liveNavigation.reset("section=vorlagen");
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Lebenslauf" })).toHaveAttribute("href", "/profile?section=lebenslauf");
  });

  it("starts every profile query at mount, whatever section is open", async () => {
    const calls = stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await waitFor(() => {
      const paths = calls.map((call) => new URL(call.url).pathname);
      expect(paths).toEqual(expect.arrayContaining(["/settings", "/profile/documents", "/document-templates", "/profile/templates", "/setup-status"]));
    });
  });

  it("has exactly one persistent live region", () => {
    stubRoutes(profileStubs());
    const { container } = renderWithProviders(<ProfilePage />);
    expect(container.querySelectorAll("[role=status].sr-only")).toHaveLength(1);
  });

  it("shows the error with a retry when the profile cannot be loaded", async () => {
    stubRoutes(profileStubs({ "GET /settings": () => jsonResponse(500, { detail: "boom" }) }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(screen.queryByText("boom")).toBeNull();
  });
});
```

(Use whichever `liveNavigation.reset(query)` signature `tests/unit/support/liveNavigation.ts` exports; `sourcesPage.test.tsx` calls `liveNavigation.reset("quelle=999")`.)

`web/tests/unit/theme/profileStyles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/profile/profile.css"), "utf8");

describe("profile.css", () => {
  it("lays the pane out by the main column, not the viewport", () => {
    expect(css).toMatch(/container:\s*profile\s*\/\s*inline-size/);
    expect(css).toMatch(/@container profile \(max-width: 719px\)/);
    expect(css).not.toMatch(/@media/);
  });

  it("uses no text size below 13 px and no hard-coded z-index", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect(css).not.toMatch(/z-index/);
  });

  it("gives the mobile sub-nav links 44 px", () => {
    const mobile = css.slice(css.indexOf("@container profile (max-width: 719px)"));
    expect(mobile).toMatch(/\.profile-nav a\s*{[^}]*min-height:\s*44px/);
  });
});
```

`web/tests/e2e/profile.spec.ts`:

```ts
import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

const SECTIONS = [
  ["ziel", "Ziel"],
  ["lebenslauf", "Lebenslauf"],
  ["nachweise", "Nachweise"],
  ["vorlagen", "Vorlagen"],
] as const;

const subNav = (page: Page) => page.getByRole("navigation", { name: "Profilbereiche" });

test("the sub-nav switches sections and Back walks them", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  await subNav(page).getByRole("link", { name: "Vorlagen" }).click();
  await expect(page).toHaveURL(/\/profile\?section=vorlagen$/);
  await expect(page.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
  await expect(subNav(page).getByRole("link", { name: "Ziel" })).toHaveAttribute("aria-current", "page");
});

test("an unknown section shows Ziel", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile?section=passwoerter");
  await expect(page.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
});

test("the profile nav item is active", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/profile?section=nachweise");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Profil/ })).toHaveAttribute("aria-current", "page");
});

for (const [section, title] of SECTIONS) {
  test(`${title}: no horizontal scroll at 375 px, screenshots`, async ({ page, mockApi }) => {
    await mockApi(profileRoutes(new ProfileServer()));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(`/profile?section=${section}`);
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    for (const [width, viewport] of [["1440", VIEWPORTS.desktop], ["390", VIEWPORTS.mobile]] as const) {
      for (const scheme of COLOR_SCHEMES) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.mouse.move(0, 0);
        await saveScreenshot(page, `profile-${section}-${width}-${scheme}`);
      }
    }
  });
}
```

(If earlier specs set the colour scheme another way (e.g. the stored theme), copy that helper instead of `emulateMedia`; read `sources.spec.ts` first.)

- [ ] **Step 3: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/profilePage.test.tsx tests/unit/theme/profileStyles.test.ts`
Expected: FAIL: `@/features/profile/ProfilePage` and `profile.css` do not exist.

- [ ] **Step 4: Frame code**

`web/src/features/profile/labels.ts`:

```ts
import type { ProfileSection } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";

export const SECTION_LABEL: Readonly<Record<ProfileSection, MessageKey>> = {
  ziel: "profile.section.ziel",
  lebenslauf: "profile.section.lebenslauf",
  nachweise: "profile.section.nachweise",
  vorlagen: "profile.section.vorlagen",
};

export const SECTION_INTRO: Readonly<Record<ProfileSection, MessageKey>> = {
  ziel: "profile.intro.ziel",
  lebenslauf: "profile.intro.lebenslauf",
  nachweise: "profile.intro.nachweise",
  vorlagen: "profile.intro.vorlagen",
};

/** The focus target after an item of the section disappears (Global Constraints, Focus). */
export const profileHeadingId = (section: ProfileSection) => `profile-${section}-h`;
```

`web/src/features/profile/useProfileSection.ts`:

```ts
"use client";

import { useSearchParams } from "next/navigation";
import { sectionFromParam, type ProfileSection } from "@/domain/profile";

export function useProfileSection(): ProfileSection {
  return sectionFromParam(useSearchParams().get("section"));
}
```

`web/src/features/profile/useReportDirty.ts`:

```ts
"use client";

import { useEffect } from "react";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";

/** Only the open section is mounted: when the user leaves it (after the leave question), its flag goes. */
export function useReportDirty(report: ReportDirty, section: string, dirty: boolean): void {
  useEffect(() => report(section, dirty), [report, section, dirty]);
  useEffect(() => () => report(section, false), [report, section]);
}
```

`web/src/features/profile/announcer.ts`:

```ts
"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export interface Announcement {
  id: number;
  text: string;
}

export interface Announcer {
  say: (text: string) => void;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => Announcement | null;
}

/**
 * D13: the page's one live region reads from this store, so an effect (a template that left the
 * AI fill) or an event handler (the CV import) can announce without a React state update in an
 * effect body. Each message gets a new id, so the same words are read again.
 */
export function createAnnouncer(): Announcer {
  let last: Announcement | null = null;
  const listeners = new Set<() => void>();
  return {
    say: (text) => {
      last = { id: (last?.id ?? 0) + 1, text };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => last,
  };
}

export const AnnouncerContext = createContext<Announcer | null>(null);

function useAnnouncer(): Announcer {
  const announcer = useContext(AnnouncerContext);
  if (!announcer) throw new Error("profile announcements need the ProfilePage");
  return announcer;
}

export function useProfileAnnounce(): (text: string) => void {
  return useAnnouncer().say;
}

const NONE = () => null;

export function useLastAnnouncement(): Announcement | null {
  const announcer = useAnnouncer();
  return useSyncExternalStore(announcer.subscribe, announcer.snapshot, NONE);
}
```

`web/src/features/profile/ProfileLiveStatus.tsx`:

```tsx
"use client";

import { useClearThenSet } from "@/ui/useAnnouncement";
import { useLastAnnouncement } from "./announcer";

const NO_ANNOUNCEMENT = 0;

/** The page's one persistent live region (D13); mounted from the first render, never conditional. */
export function ProfileLiveStatus() {
  const last = useLastAnnouncement();
  const shown = useClearThenSet(last?.id ?? NO_ANNOUNCEMENT);
  return (
    <p role="status" className="sr-only">
      {shown && last ? last.text : ""}
    </p>
  );
}
```

`web/src/features/profile/SectionState.tsx`:

```tsx
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { givenUp } from "@/api/queryState";
import { ListError, ListLoading } from "@/features/inbox/InboxList";

interface SectionStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}

/** Loading, then the data; a request that failed or is being retried shows its error (RB13). */
export function SectionState<T>({ query, children }: SectionStateProps<T>) {
  if (query.data !== undefined) return children(query.data);
  if (givenUp(query)) return <ListError error={query.error} onRetry={() => void query.refetch()} />;
  return <ListLoading stalled={false} />;
}
```

`web/src/features/profile/ProfileSectionFrame.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { ProfileSection } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { profileHeadingId, SECTION_INTRO, SECTION_LABEL } from "./labels";

export function ProfileSectionFrame({ section, children }: { section: ProfileSection; children?: ReactNode }) {
  const { t } = useI18n();
  const headingId = profileHeadingId(section);
  return (
    <section className="profile-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="sec-title" tabIndex={-1}>
        {t(SECTION_LABEL[section])}
      </h2>
      <p className="prose profile-intro">{t(SECTION_INTRO[section])}</p>
      {children}
    </section>
  );
}
```

The four entry files, each the frame only for now (Tasks 7, 8, 10 and 11 replace the body and add the `{ report }: SectionProps` parameter where the section edits), e.g. `web/src/features/profile/goal/GoalSection.tsx`:

```tsx
"use client";

import { ProfileSectionFrame } from "../ProfileSectionFrame";

export function GoalSection() {
  return <ProfileSectionFrame section="ziel" />;
}
```

and likewise `CvSection` (`"lebenslauf"`, `cv/CvSection.tsx`), `ProofsSection` (`"nachweise"`, `proofs/ProofsSection.tsx`), `TemplatesSection` (`"vorlagen"`, `templates/TemplatesSection.tsx`). A function without parameters satisfies `SECTION_BODY`'s `(props: SectionProps) => ReactNode`.

`web/src/features/profile/ProfileNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PROFILE_SECTIONS, profileHref, type ProfileSection } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { SECTION_LABEL } from "./labels";

/** D2: links, not tabs: each section is a URL, and the unsaved guard intercepts in-app links. */
export function ProfileNav({ current }: { current: ProfileSection }) {
  const { t } = useI18n();
  return (
    <nav className="profile-nav" aria-label={t("profile.nav")}>
      <ul>
        {PROFILE_SECTIONS.map((section) => (
          <li key={section}>
            <Link href={profileHref(section)} aria-current={section === current ? "page" : undefined}>
              {t(SECTION_LABEL[section])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`web/src/features/profile/ProfilePage.tsx`:

```tsx
"use client";

import { usePrefetchQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { profileQueryOptions } from "@/api/profile";
import { profileDocumentsQueryOptions } from "@/api/profileDocuments";
import { setupStatusQueryOptions } from "@/api/setup";
import { documentTemplatesQueryOptions, fileTemplatesQueryOptions } from "@/api/templates";
import type { ProfileSection } from "@/domain/profile";
import { navNumber } from "@/features/shell/navigation";
import { useDirtySections, type ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { AnnouncerContext, createAnnouncer } from "./announcer";
import { CvSection } from "./cv/CvSection";
import { GoalSection } from "./goal/GoalSection";
import { ProfileLiveStatus } from "./ProfileLiveStatus";
import { ProfileNav } from "./ProfileNav";
import { ProofsSection } from "./proofs/ProofsSection";
import { TemplatesSection } from "./templates/TemplatesSection";
import { useProfileSection } from "./useProfileSection";

export interface SectionProps {
  report: ReportDirty;
}

const SECTION_BODY: Readonly<Record<ProfileSection, (props: SectionProps) => ReactNode>> = {
  ziel: GoalSection,
  lebenslauf: CvSection,
  nachweise: ProofsSection,
  vorlagen: TemplatesSection,
};

/** Constraint "queries start in parallel": every section's data is asked for at mount. */
function usePrefetchProfile(): void {
  usePrefetchQuery(profileQueryOptions());
  usePrefetchQuery(profileDocumentsQueryOptions());
  usePrefetchQuery(documentTemplatesQueryOptions());
  usePrefetchQuery(fileTemplatesQueryOptions());
  usePrefetchQuery(setupStatusQueryOptions());
}

export function ProfilePage() {
  const [announcer] = useState(createAnnouncer);
  usePrefetchProfile();
  return (
    <AnnouncerContext value={announcer}>
      <ProfileFrame />
    </AnnouncerContext>
  );
}

function ProfileFrame() {
  const { t } = useI18n();
  const section = useProfileSection();
  const { report } = useDirtySections();
  const Body = SECTION_BODY[section];
  return (
    <div className="page profile">
      <Masthead number={navNumber("profile")} title={t("nav.profile")} deck={t("profile.deck")} />
      <div className="profile-layout">
        <ProfileNav current={section} />
        <div className="profile-pane">
          <Body report={report} />
        </div>
      </div>
      <ProfileLiveStatus />
    </div>
  );
}
```

(Check the other pages for the page wrapper class (`page` or the `Masthead` placement in `SourcesPage.tsx`) and copy it; the shell may already provide the outer padding.)

`web/app/(app)/profile/page.tsx`:

```tsx
import { Suspense } from "react";
import { ProfilePage } from "@/features/profile/ProfilePage";

export default function ProfileRoute() {
  // The open section lives in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
```

`web/src/features/profile/profile.css`:

```css
@layer components {
  .profile {
    container: profile / inline-size;
  }
  /* Usability layout: 200 px sub-nav, pane up to about 900 px, forms up to 620 px. */
  .profile-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 40px;
    max-width: 1140px;
  }
  .profile-pane {
    min-width: 0;
    max-width: 900px;
  }
  .profile-nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    position: sticky;
    top: 24px;
  }
  .profile-nav a {
    display: block;
    padding: 9px 12px;
    border-left: 3px solid transparent;
    color: var(--text-2);
    font-size: var(--fs-14);
  }
  .profile-nav a[aria-current="page"] {
    border-left-color: var(--accent);
    color: var(--text);
    font-weight: 600;
  }
  .profile-intro {
    margin-top: 4px;
    max-width: 62ch;
  }
  .profile-section .form-max {
    max-width: 620px;
  }
  @container profile (max-width: 719px) {
    .profile-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .profile-nav ul {
      position: static;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      border: 1px solid var(--line-control);
      border-radius: var(--r-ctl);
    }
    .profile-nav a {
      min-height: 44px;
      display: grid;
      place-items: center;
      padding: 6px 4px;
      border-left: 0;
      text-align: center;
    }
    .profile-nav a[aria-current="page"] {
      background: var(--text);
      color: var(--surface);
    }
  }
  @container profile (max-width: 419px) {
    .profile-nav ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
```

(The selected seg is ink, like the app's `.seg [aria-pressed="true"]`; read `controls.css` and reuse its exact tokens. Check that `--surface` on `--text` passes 4.5:1 in both themes with `tests/unit/support/contrast.ts` if you pick other tokens.)

i18n keys (`de.ts` / `en.ts`):

```ts
  "profile.deck": "Daran misst die KI jede Stelle, und daraus schreibt sie jede Unterlage.", // "The AI measures every job against this and writes every document from it."
  "profile.nav": "Profilbereiche", // "Profile sections"
  "profile.section.ziel": "Ziel", // "Goal"
  "profile.section.lebenslauf": "Lebenslauf", // "CV"
  "profile.section.nachweise": "Nachweise", // "Credentials"
  "profile.section.vorlagen": "Vorlagen", // "Templates"
  "profile.intro.ziel": "Wonach du suchst. Die KI vergleicht jede gefundene Stelle damit.", // "What you are looking for. The AI compares every job it finds with it."
  "profile.intro.lebenslauf": "Was du mitbringst. Daraus schreibt die KI Lebenslauf und Anschreiben für jede Stelle.", // "What you bring. The AI writes the CV and cover letter for each job from it."
  "profile.intro.nachweise": "Zeugnisse, Zertifikate und Referenzen. Du kannst sie bei jeder Bewerbung anhängen.", // "References and certificates. You can attach them to any application."
  "profile.intro.vorlagen": "Die Standardvorlage wird für neue Bewerbungen verwendet. Eigene Vorlagen kannst du hochladen.", // "The default template is used for new applications. You can upload your own templates."
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/profilePage.test.tsx tests/unit/theme/profileStyles.test.ts tests/unit/i18n/parity.test.ts` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profile.spec.ts tests/e2e/shell.spec.ts`
Expected: PASS. Copy the screenshots back.

- [ ] **Step 6: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 7: Ziel: the goal form with chip editors and the shared profile save

**Files:**
- Create: `web/src/features/profile/useProfileSave.ts`, `web/src/features/profile/goal/goalDraft.ts`, `web/src/features/profile/goal/GoalFields.tsx`, `web/src/features/profile/goal/ChipListField.tsx`, `web/tests/unit/features/profile/goalSection.test.tsx`, `web/tests/unit/features/profile/chipListField.test.tsx`, `web/tests/e2e/profileGoal.spec.ts`
- Modify: `web/src/features/profile/goal/GoalSection.tsx`, `web/src/features/profile/profile.css`, `web/tests/e2e/support/profileServer.ts` (`save`, route `POST /settings`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `profileQueryOptions`, `saveProfile`, `Profile`, `GoalFields`, `ProfilePatch` (Task 5); `splitSkills`, `joinSkills`, `chipProblem`, `ChipLimits`, `toProfileField`, `ProfileField` (Task 5); `PROFILE_LIMITS`; `DrawerSection` (`features/sources/drawer/DrawerSection.tsx`), `useSectionForm`, `SectionForm`; `ProfileSectionFrame`, `SectionState`, `useReportDirty`, `SectionProps` (Task 6); `fieldErrorsFrom`, `describeError`, `useToast`, `TextField`, `TextAreaField`, `Field`.
- Produces:
  - `useProfileSave()`: `useMutation` over `ProfilePatch` in scope `PROFILE_SAVE_SCOPE` (`{ id: "profile-save" }`); success writes the patch into `["settings","profile"]`, invalidates it and `["setup-status"]`, toasts "Gespeichert."; an error without field errors toasts `describeError`. `profileFieldErrors(error): ProfileField[]`.
  - `GoalDraft`, `goalDraftOf(fields: GoalFields): GoalDraft`, `goalPatch(draft: GoalDraft): GoalFields`.
  - `ChipListField({ id, label, hint?, error?, items, onChange, limits })`.
  - e2e `ProfileServer.save(sent)`: partial update, explicit `null` and over-limit values refused with 422 on the field.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/chipListField.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChipListField } from "@/features/profile/goal/ChipListField";
import { renderWithProviders } from "../../support/render";

function Harness({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  return (
    <form>
      <ChipListField id="chips" label="Kenntnisse" items={items} onChange={setItems} limits={{ maxItems: 3, maxLength: 10, noComma: true }} />
    </form>
  );
}

describe("ChipListField", () => {
  it("adds with Enter without submitting the form and clears the input", async () => {
    renderWithProviders(<Harness initial={["Kotlin"]} />);
    await userEvent.type(screen.getByLabelText("Kenntnisse"), "Go{Enter}");
    expect(screen.getByRole("list", { name: "Kenntnisse: Einträge" })).toHaveTextContent("KotlinGo");
    expect(screen.getByLabelText("Kenntnisse")).toHaveValue("");
  });

  it("refuses a duplicate, a comma and a full list with a fixed sentence", async () => {
    renderWithProviders(<Harness initial={["Kotlin", "Java", "Go"]} />);
    const input = screen.getByLabelText("Kenntnisse");
    await userEvent.type(input, "kotlin{Enter}");
    expect(screen.getByText("Schon in der Liste.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "a,b{Enter}");
    expect(screen.getByText("Ohne Komma: jede Kenntnis einzeln hinzufügen.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Rust{Enter}");
    expect(screen.getByText("Höchstens 3 Einträge.")).toBeVisible();
  });

  it("removes a chip by its named button and moves focus to the input", async () => {
    renderWithProviders(<Harness initial={["Kotlin", "Java"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Kotlin entfernen" }));
    expect(screen.queryByRole("button", { name: "Kotlin entfernen" })).toBeNull();
    expect(screen.getByLabelText("Kenntnisse")).toHaveFocus();
  });
});
```

`web/tests/unit/features/profile/goalSection.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { GoalSection } from "@/features/profile/goal/GoalSection";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { PROFILE, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
const saveButton = () => screen.getByRole("button", { name: "Speichern" });

describe("Ziel", () => {
  it("keeps Speichern inactive until something changes", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Wunschrolle");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("Speichern sends only the goal fields, skills joined, and toasts", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Kenntnisse"), "Go{Enter}");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    const post = calls.find((call) => call.method === "POST")!;
    const body = JSON.parse(post.body!);
    expect(Object.keys(body).sort()).toEqual(GOAL_KEYS);
    expect(body.skills).toBe("Kotlin, Java, Go");
    expect(post.body).not.toContain("__masked__");
  });

  it("does not let a background refetch overwrite a draft", async () => {
    stubRoutes(profileStubs());
    const { queryClient } = renderWithProviders(<ProfilePage />);
    const role = await screen.findByLabelText("Wunschrolle");
    await userEvent.clear(role);
    await userEvent.type(role, "Architekt");
    queryClient.setQueryData(queryKeys.profile, { ...PROFILE, spoken_languages: [], role: "Anders" });
    await waitFor(() => expect(role).toHaveValue("Architekt"));
  });

  it("shows a 422 on its field with the app's sentence, never the server's", async () => {
    const refused = { detail: [{ type: "string_too_long", loc: ["body", "preferences"], msg: "String should have at most 5000 characters" }] };
    stubRoutes(profileStubs({ "POST /settings": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ort"), " Nord");
    await userEvent.click(saveButton());
    expect(await screen.findByText("Dieser Text ist zu lang. Bitte kürzen.")).toBeVisible();
    expect(screen.queryByText(/String should have/)).toBeNull();
  });

  it("reports unsaved edits to the leave guard and clears them on unmount", async () => {
    stubRoutes(profileStubs());
    const report = vi.fn();
    const { unmount } = renderWithProviders(<GoalSection report={report} />);
    await userEvent.type(await screen.findByLabelText("Ort"), "x");
    expect(report).toHaveBeenLastCalledWith("ziel", true);
    unmount();
    expect(report).toHaveBeenLastCalledWith("ziel", false);
  });
});
```

`web/tests/e2e/profileGoal.spec.ts`:

```ts
import { VIEWPORTS } from "./support/constants";
import { horizontalOverflow } from "./support/page";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { STORED_PROFILE } from "./support/profileFixtures";
import { expect, test } from "./support/test";

const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];

test("Ziel saves, survives a reload and sends only its fields", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile");
  await page.getByLabel("Wunschrolle").fill("Staff Engineer");
  await page.getByLabel("Gesprochene Sprachen", { exact: true }).fill("Französisch (Grundkenntnisse)");
  await page.getByLabel("Gesprochene Sprachen", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Staff Engineer");
  await expect(page.getByRole("list", { name: "Gesprochene Sprachen: Einträge" })).toContainText("Französisch (Grundkenntnisse)");
  expect(server.saved.map((body) => Object.keys(body).sort())).toEqual([GOAL_KEYS]);
});

test("leaving Ziel with unsaved edits asks first", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.goto("/profile");
  await page.getByLabel("Ort").fill("Berlin");
  await page.getByRole("navigation", { name: "Profilbereiche" }).getByRole("link", { name: "Lebenslauf" }).click();
  const dialog = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByLabel("Ort")).toHaveValue("Berlin");
  await page.getByRole("navigation", { name: "Profilbereiche" }).getByRole("link", { name: "Lebenslauf" }).click();
  await page.getByRole("dialog", { name: "Änderungen verwerfen?" }).getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(page).toHaveURL(/section=lebenslauf$/);
});

test("a legacy value over the limit shows on its field", async ({ page, mockApi }) => {
  const server = new ProfileServer({ ...STORED_PROFILE, preferences: "x".repeat(5001) });
  await mockApi(profileRoutes(server));
  await page.goto("/profile");
  await page.getByLabel("Wunschrolle").fill("Lead");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dieser Text ist zu lang. Bitte kürzen.")).toBeVisible();
  expect(server.profile.role).toBe(STORED_PROFILE.role);
});

test("chip remove buttons are 44 px on mobile and nothing scrolls sideways", async ({ page, mockApi }) => {
  await mockApi(profileRoutes());
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/profile");
  const remove = page.getByRole("button", { name: "Kotlin entfernen" });
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBe(0);
});
```

(The textarea has `maxLength` 5000, but a stored longer legacy value is shown untruncated; `fill` on another field leaves it, so the whole-section save sends it and the server refuses it.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/chipListField.test.tsx tests/unit/features/profile/goalSection.test.tsx`
Expected: FAIL: `ChipListField` does not exist; Ziel renders no fields.

- [ ] **Step 3: Draft, save hook and chip editor**

`web/src/features/profile/goal/goalDraft.ts`:

```ts
import type { GoalFields } from "@/api/profile";
import { joinSkills, splitSkills } from "@/domain/profile";

export interface GoalDraft {
  role: string;
  skills: string[];
  min_salary: string;
  location: string;
  preferences: string;
  spoken_languages: string[];
}

export function goalDraftOf(fields: GoalFields): GoalDraft {
  return {
    role: fields.role,
    skills: splitSkills(fields.skills),
    min_salary: fields.min_salary,
    location: fields.location,
    preferences: fields.preferences,
    spoken_languages: [...fields.spoken_languages],
  };
}

/** D3: what Speichern sends; also the dirty comparison, so trailing spaces alone are not "unsaved". */
export function goalPatch(draft: GoalDraft): GoalFields {
  return {
    role: draft.role.trim(),
    skills: joinSkills(draft.skills),
    min_salary: draft.min_salary.trim(),
    location: draft.location.trim(),
    preferences: draft.preferences.trim(),
    spoken_languages: [...draft.spoken_languages],
  };
}
```

`web/src/features/profile/useProfileSave.ts`:

```ts
"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { saveProfile, type Profile, type ProfilePatch } from "@/api/profile";
import { queryKeys } from "@/api/queryKeys";
import { toProfileField, type ProfileField } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** Profile writes (section saves and the CV import) reach the server one after the other. */
export const PROFILE_SAVE_SCOPE = { id: "profile-save" };

export function profileFieldErrors(error: unknown): ProfileField[] {
  return fieldErrorsFrom(error, toProfileField);
}

function storeSaved(queryClient: QueryClient, patch: ProfilePatch): void {
  queryClient.setQueryData<Profile>(queryKeys.profile, (profile) =>
    profile ? { ...profile, ...patch } : profile,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
  // profile_complete (role and skills) drives the onboarding and the import hint.
  void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
}

/** D3: one partial POST /settings per section (B2). */
export function useProfileSave() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: PROFILE_SAVE_SCOPE,
    mutationFn: saveProfile,
    onSuccess: (_answer, patch) => {
      storeSaved(queryClient, patch);
      toast.show({ message: t("sources.saved"), tone: "success" });
    },
    onError: (error) => {
      if (profileFieldErrors(error).length === 0)
        toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}
```

`web/src/features/profile/goal/ChipListField.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { chipProblem, type ChipLimits, type ChipProblem } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { Icon } from "@/ui/Icon";

export interface ChipListFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  limits: ChipLimits;
}

const PROBLEM_TEXT: Readonly<Record<Exclude<ChipProblem, "empty">, MessageKey>> = {
  duplicate: "profile.chip.duplicate",
  tooLong: "profile.chip.tooLong",
  full: "profile.chip.full",
  comma: "profile.chip.comma",
};

/** Prototype chipEditor: one entry at a time, Enter or "Hinzufügen"; a named remove button per chip. */
export function ChipListField(props: ChipListFieldProps) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<ChipProblem | null>(null);
  const shown = problem && problem !== "empty" ? t(PROBLEM_TEXT[problem], problemValues(props.limits)) : undefined;
  return (
    <Field id={props.id} label={props.label} hint={props.hint} error={props.error ?? shown}>
      <ChipInput {...props} onProblem={setProblem} />
      <ChipItems {...props} />
    </Field>
  );
}

function problemValues(limits: ChipLimits) {
  return { max: limits.maxItems, length: limits.maxLength };
}

function ChipInput(props: ChipListFieldProps & { onProblem: (problem: ChipProblem | null) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const add = () => {
    const found = chipProblem(props.items, text, props.limits);
    props.onProblem(found);
    if (found) return;
    props.onChange([...props.items, text.trim()]);
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault(); // Enter adds a chip; it must not submit the section form.
    add();
  };
  return (
    <div className="chip-input">
      <input id={props.id} className="input" value={text} placeholder={t("profile.chip.placeholder")}
        maxLength={props.limits.maxLength} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} />
      <Button size="sm" onClick={add}>{t("profile.chip.add")}</Button>
    </div>
  );
}

function ChipItems({ id, label, items, onChange }: ChipListFieldProps) {
  const { t } = useI18n();
  const remove = (index: number) => {
    onChange(items.filter((_item, position) => position !== index));
    document.getElementById(id)?.focus(); // the removed button is gone; the input is the next place to act
  };
  return (
    // Its own name: the input already carries the field label, and two elements with one name confuse lookups.
    <ul className="chip-list" aria-label={t("profile.chip.list", { label })}>
      {items.map((item, index) => (
        <li key={item} className="tag chip-item">
          <span>{item}</span>
          <button type="button" className="chip-remove" aria-label={t("profile.chip.remove", { item })} onClick={() => remove(index)}>
            <Icon icon={X} />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

(Read `src/ui/Field.tsx` first: if `Field` renders the `label` for the first input only and sets `aria-describedby` through `describedBy(...)`, pass the same ids to the inner `<input>` (`aria-describedby={describedBy({ id, hint, error })}`, `aria-invalid={Boolean(error)}`), exactly as `TextField` does. Items are unique case-insensitively, so `key={item}` is stable.)

- [ ] **Step 4: The section**

`web/src/features/profile/goal/GoalFields.tsx`:

```tsx
"use client";

import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField, TextField } from "@/ui/Field";
import { ChipListField } from "./ChipListField";
import type { GoalDraft } from "./goalDraft";

export type GoalErrors = Partial<Record<keyof GoalDraft, MessageKey>>;

interface GoalFieldsProps {
  draft: GoalDraft;
  onChange: (patch: Partial<GoalDraft>) => void;
  errors: GoalErrors;
}

const ID = "pf-goal";
const SKILL_LIMITS = { maxItems: PROFILE_LIMITS.skills, maxLength: PROFILE_LIMITS.skill, noComma: true };
const LANGUAGE_LIMITS = { maxItems: PROFILE_LIMITS.spokenLanguages, maxLength: PROFILE_LIMITS.spokenLanguage };

export function GoalFields({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = (key: keyof GoalDraft) => (errors[key] ? t(errors[key], ERROR_VALUES) : undefined);
  return (
    <>
      <TextField id={`${ID}-role`} label={t("profile.goal.role")} hint={t("profile.goal.roleHint")} error={error("role")}
        value={draft.role} maxLength={PROFILE_LIMITS.role} onChange={(e) => onChange({ role: e.target.value })} />
      <ChipListField id={`${ID}-skills`} label={t("profile.goal.skills")} hint={t("profile.goal.skillsHint")} error={error("skills")}
        items={draft.skills} limits={SKILL_LIMITS} onChange={(skills) => onChange({ skills })} />
      <TextField id={`${ID}-salary`} label={t("profile.goal.minSalary")} hint={t("profile.goal.minSalaryHint")} error={error("min_salary")}
        inputMode="numeric" value={draft.min_salary} maxLength={PROFILE_LIMITS.minSalary} onChange={(e) => onChange({ min_salary: e.target.value })} />
      <TextField id={`${ID}-location`} label={t("profile.goal.location")} hint={t("profile.goal.locationHint")} error={error("location")}
        value={draft.location} maxLength={PROFILE_LIMITS.location} onChange={(e) => onChange({ location: e.target.value })} />
      <TextAreaField id={`${ID}-preferences`} label={t("profile.goal.preferences")} hint={t("profile.goal.preferencesHint")} error={error("preferences")}
        rows={4} value={draft.preferences} maxLength={PROFILE_LIMITS.preferences} onChange={(e) => onChange({ preferences: e.target.value })} />
      <ChipListField id={`${ID}-languages`} label={t("profile.goal.languages")} hint={t("profile.goal.languagesHint")} error={error("spoken_languages")}
        items={draft.spoken_languages} limits={LANGUAGE_LIMITS} onChange={(spoken_languages) => onChange({ spoken_languages })} />
    </>
  );
}

const ERROR_VALUES = {
  max: PROFILE_LIMITS.spokenLanguages,
  length: PROFILE_LIMITS.spokenLanguage,
  skillsMax: PROFILE_LIMITS.skills,
};
```

(`SKILL_LIMITS.maxItems` uses the joined-string limit as a generous item bound; the real bound is the joined length, checked on submit. Prettier will break the long JSX lines; `GoalFields` is markup, but if lint counts it above 20 lines, split it into `GoalTextFields` (role, salary, location, preferences) and `GoalChipFields` (skills, languages).)

`web/src/features/profile/goal/GoalSection.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { profileQueryOptions, type Profile } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { ProfileField } from "@/domain/profile";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import type { SectionProps } from "../ProfilePage";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { profileFieldErrors, useProfileSave } from "../useProfileSave";
import { useReportDirty } from "../useReportDirty";
import { GoalFields, type GoalErrors } from "./GoalFields";
import { goalDraftOf, goalPatch, type GoalDraft } from "./goalDraft";

const SECTION = "ziel";
const TOO_LONG = "profile.error.tooLong";
const SERVER_ERROR_TEXT: Partial<Record<ProfileField, GoalErrors[keyof GoalErrors]>> = {
  role: TOO_LONG,
  min_salary: TOO_LONG,
  location: TOO_LONG,
  preferences: TOO_LONG,
  skills: "profile.error.skillsTooLong",
  spoken_languages: "profile.error.languages",
};

function clientErrors(draft: GoalDraft): GoalErrors {
  return goalPatch(draft).skills.length > PROFILE_LIMITS.skills ? { skills: "profile.error.skillsTooLong" } : {};
}

function serverErrors(error: unknown): GoalErrors {
  const entries = profileFieldErrors(error).map((field) => [field, SERVER_ERROR_TEXT[field]] as const);
  return Object.fromEntries(entries.filter(([, text]) => text)) as GoalErrors;
}

function useGoalSubmit(form: SectionForm<GoalDraft>) {
  const save = useProfileSave();
  const [errors, setErrors] = useState<GoalErrors>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = clientErrors(form.draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || !form.dirty) return;
    const patch = goalPatch(form.draft);
    save.mutate(patch, {
      onSuccess: () => form.commit(goalDraftOf(patch)),
      onError: (error) => setErrors(serverErrors(error)),
    });
  };
  return { submit, errors, busy: save.isPending };
}

function GoalForm({ profile, report }: SectionProps & { profile: Profile }) {
  const { t } = useI18n();
  const form = useSectionForm(goalDraftOf(profile), goalPatch);
  const { submit, errors, busy } = useGoalSubmit(form);
  useReportDirty(report, SECTION, form.dirty);
  return (
    <div className="form-max">
      <DrawerSection id="pf-goal" title={t("profile.goal.title")} onSubmit={submit} busy={busy} dirty={form.dirty}>
        <GoalFields draft={form.draft} onChange={form.set} errors={errors} />
      </DrawerSection>
    </div>
  );
}

export function GoalSection({ report }: SectionProps) {
  const query = useQuery(profileQueryOptions());
  return (
    <ProfileSectionFrame section="ziel">
      <SectionState query={query}>{(profile) => <GoalForm profile={profile} report={report} />}</SectionState>
    </ProfileSectionFrame>
  );
}
```

`profile.css`, add inside the layer:

```css
  .chip-input {
    display: flex;
    gap: 8px;
  }
  .chip-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip-item {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--fs-13);
  }
  .chip-remove {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--r-ctl);
    color: var(--text-2);
  }
  .chip-remove:hover {
    color: var(--text);
  }
```

and inside `@container profile (max-width: 719px)`:

```css
    .chip-remove {
      width: 44px;
      height: 44px;
    }
```

i18n keys:

```ts
  "profile.goal.title": "Gesuchte Stelle", // "Target position"
  "profile.goal.role": "Wunschrolle", // "Target role"
  "profile.goal.roleHint": "Wird mit dem Titel jeder Stelle abgeglichen.", // "Compared with the title of every job."
  "profile.goal.skills": "Kenntnisse", // "Skills"
  "profile.goal.skillsHint": "Einzeln hinzufügen, mit Enter oder „Hinzufügen“.", // "Add one at a time, with Enter or “Add”."
  "profile.goal.minSalary": "Mindestgehalt", // "Minimum salary"
  "profile.goal.minSalaryHint": "Brutto pro Jahr in Euro.", // "Gross per year in euros."
  "profile.goal.location": "Ort", // "Location"
  "profile.goal.locationHint": "Wohnort oder Wunschort, z. B. „Hamburg oder remote“.", // "Where you live or want to work, e.g. “Hamburg or remote”."
  "profile.goal.preferences": "Präferenzen", // "Preferences"
  "profile.goal.preferencesHint": "In eigenen Worten: Arbeitsmodell, Branchen, Ausschlusskriterien. Die KI liest das bei jeder Bewertung.", // "In your own words: work model, industries, deal breakers. The AI reads this for every rating."
  "profile.goal.languages": "Gesprochene Sprachen", // "Spoken languages"
  "profile.goal.languagesHint": "Mit Niveau, z. B. „Englisch (fließend)“.", // "With level, e.g. “English (fluent)”."
  "profile.chip.list": "{label}: Einträge", // "{label}: entries"
  "profile.chip.add": "Hinzufügen", // "Add"
  "profile.chip.placeholder": "Eingeben und Enter drücken", // "Type and press Enter"
  "profile.chip.remove": "{item} entfernen", // "Remove {item}"
  "profile.chip.duplicate": "Schon in der Liste.", // "Already in the list."
  "profile.chip.tooLong": "Höchstens {length} Zeichen.", // "At most {length} characters."
  "profile.chip.full": "Höchstens {max} Einträge.", // "At most {max} entries."
  "profile.chip.comma": "Ohne Komma: jede Kenntnis einzeln hinzufügen.", // "No commas: add each skill on its own."
  "profile.error.tooLong": "Dieser Text ist zu lang. Bitte kürzen.", // "This text is too long. Please shorten it."
  "profile.error.skillsTooLong": "Zusammen höchstens {skillsMax} Zeichen. Entferne einige Kenntnisse.", // "At most {skillsMax} characters in total. Remove some skills."
  "profile.error.languages": "Höchstens {max} Sprachen mit je {length} Zeichen.", // "At most {max} languages of {length} characters each."
```

(The chip texts take `{max}` and `{length}` from `problemValues`; check how `t()` treats unused values: `translate.ts` may require exactly the placeholders of the key. If so, pass per-key values.)

`web/tests/e2e/support/profileServer.ts`, add to the class and the routes (`POST ${SETTINGS_PATH}`: `live((sent) => server.save(sent))`; import `reply`, `PROFILE_LIMITS`):

```ts
  /**
   * POST /settings (routers/settings.py save_settings, B2): writes only the keys sent; an explicit
   * null or a value over its limit is a 422 on that field and nothing is written.
   */
  save(sent: unknown): unknown {
    const body = sent as Record<string, unknown>;
    this.saved.push(structuredClone(body));
    const refused = Object.keys(body).find((key) => isRefused(key, body[key]));
    if (refused) return reply(HTTP_UNPROCESSABLE, { detail: [{ type: "value_error", loc: ["body", refused], msg: "refused" }] });
    Object.assign(this.profile, body);
    return { status: "saved" };
  }
```

with module helpers:

```ts
const HTTP_UNPROCESSABLE = 422;
const TEXT_LIMIT: Readonly<Record<string, number>> = {
  role: PROFILE_LIMITS.role,
  skills: PROFILE_LIMITS.skills,
  min_salary: PROFILE_LIMITS.minSalary,
  location: PROFILE_LIMITS.location,
  preferences: PROFILE_LIMITS.preferences,
};

function isRefused(key: string, value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.length > (TEXT_LIMIT[key] ?? Infinity);
  if (key === "spoken_languages") return (value as string[]).length > PROFILE_LIMITS.spokenLanguages;
  if (key === "cv_data") return cvRefused(value as { experience?: unknown[]; projects?: unknown[] });
  return false;
}

function cvRefused(cv: { experience?: unknown[]; projects?: unknown[] }): boolean {
  return [cv.experience ?? [], cv.projects ?? []].some((list) => list.length > PROFILE_LIMITS.cvEntries);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileGoal.spec.ts tests/e2e/profile.spec.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 8: Lebenslauf: experience, projects and education editor with the completeness hint

**Files:**
- Create: `web/src/features/profile/cv/EntryList.tsx`, `web/src/features/profile/cv/entryFields.ts`, `web/src/features/profile/cv/CvForm.tsx`, `web/src/features/profile/cv/CvGapsNotice.tsx`, `web/tests/unit/features/profile/cvSection.test.tsx`, `web/tests/e2e/profileCv.spec.ts`
- Modify: `web/src/features/profile/cv/CvSection.tsx`, `web/src/features/profile/profile.css`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `profileQueryOptions`, `CvData`, `Experience`, `Project`, `Profile` (Task 5); `cleanCv`, `cvGaps`, `CvGap`, `profileHref` (Task 5); `PROFILE_LIMITS`; `useProfileSave`, `profileFieldErrors` (Task 7); `DrawerSection`, `useSectionForm`; `ProfileSectionFrame`, `SectionState`, `useReportDirty`, `SectionProps` (Task 6); `Notice`, `Button`, `TextField`, `TextAreaField`.
- Produces:
  - `CvSection({ report })` with the internal `CvBody({ profile, report })`, which Task 9 extends with `<CvImport profile={profile} dirty={form.dirty} />` above the hint.
  - `EntryList<T extends Record<string, string>>({ id, title, entries, fields, empty, summary, onChange })`.
  - `EXPERIENCE_FIELDS`, `PROJECT_FIELDS`, `EMPTY_EXPERIENCE`, `EMPTY_PROJECT`, `experienceSummary`, `projectSummary`, `EntryField<T>`, `EntrySummary`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/cvSection.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { liveNavigation } from "../../support/liveNavigation";
import { PROFILE, STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=lebenslauf"));
afterEach(() => vi.unstubAllGlobals());

const thin = { ...STORED_SETTINGS, cv_data: { experience: [{ ...PROFILE.cv_data!.experience![0]!, description: "" }], projects: [], education: "" } };

describe("Lebenslauf", () => {
  it("adds an entry in edit view, focuses its first field and saves only cv_data", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    const add = await screen.findAllByRole("button", { name: "Eintrag hinzufügen" });
    await userEvent.click(add[0]!);
    expect(screen.getByLabelText("Rolle")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Rolle"), "Architekt");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText("Gespeichert.");
    const body = JSON.parse(calls.find((call) => call.method === "POST")!.body!);
    expect(Object.keys(body)).toEqual(["cv_data"]);
    expect(body.cv_data.experience).toHaveLength(2);
  });

  it("drops a blank new entry on save and does not count it as unsaved", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    const add = await screen.findAllByRole("button", { name: "Eintrag hinzufügen" });
    await userEvent.click(add[0]!);
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAttribute("aria-disabled", "true");
  });

  it("removing an entry moves focus to its list's add button", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dev bearbeiten" }));
    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    expect(screen.getAllByRole("button", { name: "Eintrag hinzufügen" })[0]).toHaveFocus();
  });

  it("names what is missing, from the stored profile", async () => {
    stubRoutes(profileStubs({ "GET /settings": thin }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText(/Noch unvollständig: Ergebnisse in der Berufserfahrung und Ausbildung\./)).toBeVisible();
  });

  it("shows no hint for a complete profile", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByRole("heading", { level: 3, name: "Berufserfahrung" });
    expect(screen.queryByText(/Noch unvollständig/)).toBeNull();
  });

  it("offers no add button past 30 entries", async () => {
    const many = Array.from({ length: 30 }, (_v, i) => ({ company: `Firma ${i}`, role: "Dev", duration: "", description: "x" }));
    stubRoutes(profileStubs({ "GET /settings": { ...STORED_SETTINGS, cv_data: { experience: many, projects: [], education: "BSc" } } }));
    renderWithProviders(<ProfilePage />);
    const [add] = await screen.findAllByRole("button", { name: "Eintrag hinzufügen" });
    expect(add).toHaveAttribute("aria-disabled", "true");
  });
});
```

`web/tests/e2e/profileCv.spec.ts`:

```ts
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

test("an edited entry and the education survive a reload; only cv_data is sent", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await page.getByRole("button", { name: "Senior Backend Engineer bearbeiten" }).click();
  await page.getByLabel("Beschreibung").fill("Checkout für 2 Mio. Kund:innen, Ausfallzeit um 70 % gesenkt.");
  await page.getByRole("button", { name: "Fertig" }).click();
  await page.getByLabel("Ausbildung").fill("M.Sc. Informatik, TU Hamburg, 2017");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ausfallzeit um 70 % gesenkt.")).toBeVisible();
  await expect(page.getByLabel("Ausbildung")).toHaveValue("M.Sc. Informatik, TU Hamburg, 2017");
  expect(server.saved.map((body) => Object.keys(body))).toEqual([["cv_data"]]);
});

test("the hint disappears once the stored CV is complete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.profile.cv_data = { ...server.profile.cv_data!, education: "" };
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await expect(page.getByText(/Noch unvollständig: Ausbildung/)).toBeVisible();
  await page.getByLabel("Ausbildung").fill("B.Sc. Informatik");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(/Noch unvollständig/)).toHaveCount(0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/cvSection.test.tsx`
Expected: FAIL: Lebenslauf renders only its heading.

- [ ] **Step 3: Entry fields and list**

`web/src/features/profile/cv/entryFields.ts`:

```ts
import type { Experience, Project } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";

export interface EntryField<T> {
  key: keyof T & string;
  label: MessageKey;
  max: number;
  multiline?: boolean;
  hint?: MessageKey;
}

export interface EntrySummary {
  title: string;
  sub: string;
  text: string;
}

export const EMPTY_EXPERIENCE: Experience = { company: "", role: "", duration: "", description: "" };
export const EMPTY_PROJECT: Project = { name: "", tech_stack: "", description: "" };

export const EXPERIENCE_FIELDS: readonly EntryField<Experience>[] = [
  { key: "role", label: "profile.cv.exp.role", max: PROFILE_LIMITS.entryTitle },
  { key: "company", label: "profile.cv.exp.company", max: PROFILE_LIMITS.entryTitle },
  { key: "duration", label: "profile.cv.exp.duration", max: PROFILE_LIMITS.entryDuration },
  {
    key: "description",
    label: "profile.cv.description",
    max: PROFILE_LIMITS.entryText,
    multiline: true,
    hint: "profile.cv.descriptionHint",
  },
];

export const PROJECT_FIELDS: readonly EntryField<Project>[] = [
  { key: "name", label: "profile.cv.project.name", max: PROFILE_LIMITS.entryTitle },
  { key: "tech_stack", label: "profile.cv.project.tech", max: PROFILE_LIMITS.entryTitle },
  { key: "description", label: "profile.cv.description", max: PROFILE_LIMITS.entryText, multiline: true },
];

const joined = (...parts: string[]) => parts.filter((part) => part.trim()).join(" · ");

export function experienceSummary(entry: Experience): EntrySummary {
  return { title: entry.role || entry.company, sub: joined(entry.company, entry.duration), text: entry.description };
}

export function projectSummary(entry: Project): EntrySummary {
  return { title: entry.name, sub: entry.tech_stack, text: entry.description };
}
```

`web/src/features/profile/cv/EntryList.tsx`:

```tsx
"use client";

import { Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextAreaField, TextField } from "@/ui/Field";
import type { EntryField, EntrySummary } from "./entryFields";

export interface EntryListProps<T extends Record<string, string>> {
  id: string;
  title: string;
  entries: readonly T[];
  fields: readonly EntryField<T>[];
  empty: T;
  summary: (entry: T) => EntrySummary;
  onChange: (entries: T[]) => void;
}

const addButtonId = (listId: string) => `${listId}-add`;

/** D5: entries are drafts of the Lebenslauf form; Speichern of the form stores them. */
export function EntryList<T extends Record<string, string>>(props: EntryListProps<T>) {
  const [editing, setEditing] = useState<number | null>(null);
  const update = (index: number, entry: T) =>
    props.onChange(props.entries.map((current, position) => (position === index ? entry : current)));
  const remove = (index: number) => {
    props.onChange(props.entries.filter((_entry, position) => position !== index));
    setEditing(null);
    document.getElementById(addButtonId(props.id))?.focus();
  };
  const add = () => {
    props.onChange([...props.entries, props.empty]);
    setEditing(props.entries.length);
  };
  return (
    <section className="entry-list" aria-labelledby={`${props.id}-h`}>
      <ListHead id={props.id} title={props.title} full={props.entries.length >= PROFILE_LIMITS.cvEntries} onAdd={add} />
      <Entries {...props} editing={editing} onEdit={setEditing} onUpdate={update} onRemove={remove} />
    </section>
  );
}

function ListHead({ id, title, full, onAdd }: { id: string; title: string; full: boolean; onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <div className="section-head">
      <h3 id={`${id}-h`} className="sec-title-sm">{title}</h3>
      <Button id={addButtonId(id)} size="sm" icon={Plus} inactive={full} title={full ? t("profile.cv.full") : undefined} onClick={onAdd}>
        {t("profile.cv.add")}
      </Button>
    </div>
  );
}

interface EntriesProps<T extends Record<string, string>> extends EntryListProps<T> {
  editing: number | null;
  onEdit: (index: number | null) => void;
  onUpdate: (index: number, entry: T) => void;
  onRemove: (index: number) => void;
}

function Entries<T extends Record<string, string>>(props: EntriesProps<T>) {
  const { t } = useI18n();
  if (props.entries.length === 0) return <p className="meta">{t("profile.cv.none")}</p>;
  return (
    <ol className="entries">
      {props.entries.map((entry, index) =>
        props.editing === index ? (
          <EntryEditor key={index} {...props} entry={entry} index={index} />
        ) : (
          <EntryView key={index} summary={props.summary(entry)} onEdit={() => props.onEdit(index)} />
        ),
      )}
    </ol>
  );
}

function EntryView({ summary, onEdit }: { summary: EntrySummary; onEdit: () => void }) {
  const { t } = useI18n();
  const title = summary.title || t("profile.cv.untitled");
  return (
    <li className="entry">
      <div>
        <div className="entry-title">{title}</div>
        {summary.sub ? <div className="entry-sub">{summary.sub}</div> : null}
        {summary.text ? <p className="entry-text">{summary.text}</p> : null}
      </div>
      <Button size="sm" variant="ghost" icon={Pencil} aria-label={t("profile.cv.edit", { title })} onClick={onEdit}>
        {t("profile.cv.editShort")}
      </Button>
    </li>
  );
}

function EntryEditor<T extends Record<string, string>>(props: EntriesProps<T> & { entry: T; index: number }) {
  const { t } = useI18n();
  const first = useRef<HTMLDivElement>(null);
  // The editor replaces the button that opened it; its first field is where the user continues.
  useEffect(() => first.current?.querySelector<HTMLElement>("input, textarea")?.focus(), []);
  return (
    <li className="entry entry-editing">
      <div ref={first} className="entry-fields">
        {props.fields.map((field) => (
          <EntryInput key={field.key} listId={props.id} index={props.index} field={field}
            value={props.entry[field.key]} onChange={(value) => props.onUpdate(props.index, { ...props.entry, [field.key]: value })} />
        ))}
      </div>
      <div className="row">
        <Button size="sm" onClick={() => props.onEdit(null)}>{t("profile.cv.done")}</Button>
        <Button size="sm" variant="ghost" onClick={() => props.onRemove(props.index)}>{t("profile.cv.remove")}</Button>
      </div>
    </li>
  );
}

interface EntryInputProps<T> {
  listId: string;
  index: number;
  field: EntryField<T>;
  value: string;
  onChange: (value: string) => void;
}

function EntryInput<T>({ listId, index, field, value, onChange }: EntryInputProps<T>) {
  const { t } = useI18n();
  const shared = { id: `${listId}-${index}-${field.key}`, label: t(field.label), maxLength: field.max, value };
  const hint = field.hint ? t(field.hint) : undefined;
  if (field.multiline)
    return <TextAreaField {...shared} hint={hint} rows={3} onChange={(event) => onChange(event.target.value)} />;
  return <TextField {...shared} hint={hint} onChange={(event) => onChange(event.target.value)} />;
}
```

(Entries have no stable id; the index key is correct here because entries are only appended or removed, and the editor closes on remove. "Fertig" closes the editor; the `EntryView` that replaces it then holds the focus target: in `Entries`, give `EntryView` an `autoFocusEdit` flag for the index that was just closed and focus its button in an effect, the same way `EntryEditor` focuses its first field, so focus does not fall to `<body>`.)

- [ ] **Step 4: Form, hint and section**

`web/src/features/profile/cv/CvForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import type { CvData } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import { cleanCv } from "@/domain/profile";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { profileFieldErrors, useProfileSave } from "../useProfileSave";
import { EntryList } from "./EntryList";
import { EMPTY_EXPERIENCE, EMPTY_PROJECT, EXPERIENCE_FIELDS, experienceSummary, PROJECT_FIELDS, projectSummary } from "./entryFields";

function useCvSubmit(form: SectionForm<CvData>) {
  const save = useProfileSave();
  const [refused, setRefused] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRefused(false);
    if (!form.dirty) return;
    const cv_data = cleanCv(form.draft);
    save.mutate({ cv_data }, {
      onSuccess: () => form.commit(cv_data),
      onError: (error) => setRefused(profileFieldErrors(error).includes("cv_data")),
    });
  };
  return { submit, refused, busy: save.isPending };
}

export function CvForm({ form }: { form: SectionForm<CvData> }) {
  const { t } = useI18n();
  const { submit, refused, busy } = useCvSubmit(form);
  return (
    <DrawerSection id="pf-cv" title={t("profile.cv.title")} onSubmit={submit} busy={busy} dirty={form.dirty}>
      {refused ? <Notice tone="error">{t("profile.cv.refused")}</Notice> : null}
      <EntryList id="pf-cv-exp" title={t("profile.cv.experience")} entries={form.draft.experience} fields={EXPERIENCE_FIELDS}
        empty={EMPTY_EXPERIENCE} summary={experienceSummary} onChange={(experience) => form.set({ experience })} />
      <EntryList id="pf-cv-projects" title={t("profile.cv.projects")} entries={form.draft.projects} fields={PROJECT_FIELDS}
        empty={EMPTY_PROJECT} summary={projectSummary} onChange={(projects) => form.set({ projects })} />
      <TextAreaField id="pf-cv-education" label={t("profile.cv.education")} rows={3} maxLength={PROFILE_LIMITS.education}
        value={form.draft.education} onChange={(event) => form.set({ education: event.target.value })} />
    </DrawerSection>
  );
}
```

`web/src/features/profile/cv/CvGapsNotice.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { Profile } from "@/api/profile";
import { cvGaps, profileHref, type CvGap } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";

const GAP_LABEL: Readonly<Record<CvGap, MessageKey>> = {
  role: "profile.gap.role",
  skills: "profile.gap.skills",
  experience: "profile.gap.experience",
  results: "profile.gap.results",
  education: "profile.gap.education",
};

/** D7 / usability #26: what the AI misses, from the stored profile (not the draft). */
export function CvGapsNotice({ profile }: { profile: Profile }) {
  const { t, language } = useI18n();
  const gaps = cvGaps(profile);
  if (gaps.length === 0) return null;
  const list = new Intl.ListFormat(language, { type: "conjunction" }).format(gaps.map((gap) => t(GAP_LABEL[gap])));
  const inGoal = gaps.includes("role") || gaps.includes("skills");
  return (
    <Notice tone="info">
      {t("profile.cv.gaps", { list })}{" "}
      {inGoal ? <Link className="link" href={profileHref("ziel")}>{t("profile.cv.toGoal")}</Link> : null}
    </Notice>
  );
}
```

`web/src/features/profile/cv/CvSection.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { profileQueryOptions, type Profile } from "@/api/profile";
import { cleanCv } from "@/domain/profile";
import { useSectionForm } from "@/features/sources/drawer/useSectionForm";
import type { SectionProps } from "../ProfilePage";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { useReportDirty } from "../useReportDirty";
import { CvForm } from "./CvForm";
import { CvGapsNotice } from "./CvGapsNotice";

const SECTION = "lebenslauf";

function CvBody({ profile, report }: SectionProps & { profile: Profile }) {
  // cleanCv as the effect: a blank new entry or trailing spaces are not unsaved edits.
  const form = useSectionForm(profile.cv_data, cleanCv);
  useReportDirty(report, SECTION, form.dirty);
  return (
    <div className="form-max">
      <CvGapsNotice profile={profile} />
      <CvForm form={form} />
    </div>
  );
}

export function CvSection({ report }: SectionProps) {
  const query = useQuery(profileQueryOptions());
  return (
    <ProfileSectionFrame section="lebenslauf">
      <SectionState query={query}>{(profile) => <CvBody profile={profile} report={report} />}</SectionState>
    </ProfileSectionFrame>
  );
}
```

`profile.css`, inside the layer (from the prototype's `/* profile */` block, sizes lifted to 13 px):

```css
  .entry-list {
    display: grid;
    gap: 8px;
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 2px solid var(--rule);
  }
  .entry {
    padding: 16px 0;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .entry-editing {
    grid-template-columns: minmax(0, 1fr);
  }
  .entry-fields {
    display: grid;
    gap: 12px;
  }
  .entry-title {
    font: 650 18px/1.25 var(--font-display);
    letter-spacing: -0.015em;
  }
  .entry-sub {
    color: var(--text-2);
    font-size: var(--fs-13);
    margin-top: 2px;
  }
  .entry-text {
    color: var(--text-2);
    font-size: var(--fs-14);
    margin-top: 6px;
    max-width: 70ch;
    white-space: pre-line;
  }
```

i18n keys:

```ts
  "profile.cv.title": "Lebenslaufdaten", // "CV data"
  "profile.cv.experience": "Berufserfahrung", // "Experience"
  "profile.cv.projects": "Projekte", // "Projects"
  "profile.cv.education": "Ausbildung", // "Education"
  "profile.cv.add": "Eintrag hinzufügen", // "Add entry"
  "profile.cv.full": "Höchstens 30 Einträge.", // "At most 30 entries."
  "profile.cv.none": "Noch keine Einträge.", // "No entries yet."
  "profile.cv.untitled": "Ohne Titel", // "Untitled"
  "profile.cv.edit": "{title} bearbeiten", // "Edit {title}"
  "profile.cv.editShort": "Bearbeiten", // "Edit"
  "profile.cv.done": "Fertig", // "Done"
  "profile.cv.remove": "Entfernen", // "Remove"
  "profile.cv.exp.role": "Rolle", // "Role"
  "profile.cv.exp.company": "Arbeitgeber", // "Employer"
  "profile.cv.exp.duration": "Zeitraum", // "Period"
  "profile.cv.project.name": "Name", // "Name"
  "profile.cv.project.tech": "Technologien", // "Technologies"
  "profile.cv.description": "Beschreibung", // "Description"
  "profile.cv.descriptionHint": "Konkrete Ergebnisse helfen der KI am meisten, z. B. Zahlen und Technologien.", // "Concrete results help the AI most, e.g. numbers and technologies."
  "profile.cv.refused": "Ein Eintrag ist zu lang. Bitte kürze die Beschreibungen.", // "An entry is too long. Please shorten the descriptions."
  "profile.cv.gaps": "Noch unvollständig: {list}. Ein Lebenslauf ohne Ergebnisse führt zu schwächeren Bewertungen.", // "Still incomplete: {list}. A CV without results leads to weaker ratings."
  "profile.cv.toGoal": "Unter Ziel ergänzen", // "Complete under Goal"
  "profile.gap.role": "Wunschrolle", // "target role"
  "profile.gap.skills": "Kenntnisse", // "skills"
  "profile.gap.experience": "Berufserfahrung", // "experience"
  "profile.gap.results": "Ergebnisse in der Berufserfahrung", // "results in your experience"
  "profile.gap.education": "Ausbildung", // "education"
```

(The unit test's "Noch unvollständig: Ergebnisse in der Berufserfahrung und Ausbildung." is the German `Intl.ListFormat` conjunction.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileCv.spec.ts tests/e2e/profile.spec.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 9: Lebenslauf: CV import (PDF upload and AI parse)

**Files:**
- Create: `web/src/features/profile/cv/CvImport.tsx`, `web/src/features/profile/cv/useCvImport.ts`, `web/tests/unit/features/profile/cvImport.test.tsx`, `web/tests/e2e/profileCvImport.spec.ts`
- Modify: `web/src/features/profile/cv/CvSection.tsx` (`CvBody` renders `<CvImport profile={profile} dirty={form.dirty} />` above the hint), `web/src/features/profile/profile.css`, `web/tests/e2e/support/profileServer.ts` (`importCv`, `IMPORTED_CV`, `SCANNED_MARKER`, route `POST /settings/upload-cv`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `importCv` (Task 5), `hasCvContent` (Task 5), `MAX_FILE_BYTES`, `setupStatusQueryOptions`, `PROFILE_SAVE_SCOPE` (Task 7), `useProfileAnnounce` (Task 6), `AiSetupAction` (`features/inbox/onboarding/AiSetupAction.tsx`), `Dialog`, `PanelHeader`, `Button`, `Notice`, `describeError`, `useToast`.
- Produces: `CvImport({ profile, dirty })`; `useCvImport()` (mutation over `File`); `cvFileProblem(file): "unsupportedType" | "tooLarge" | null`; e2e `ProfileServer.importCv(request)` with `SCANNED_MARKER`, `IMPORTED_CV`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/cvImport.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=lebenslauf"));
afterEach(() => vi.unstubAllGlobals());

const EMPTY = { ...STORED_SETTINGS, role: "", skills: "", cv_data: { experience: [], projects: [], education: "" } };
const pdf = () => new File(["%PDF-1.4"], "Lebenslauf.PDF", { type: "application/pdf" });
const importButton = () => screen.findByRole("button", { name: "Lebenslauf importieren (PDF)" });
const fileInput = () => document.querySelector<HTMLInputElement>("#pf-cv-import-file")!;
const uploads = (calls: { url: string }[]) => calls.filter((call) => call.url.endsWith("/settings/upload-cv"));

describe("CV import", () => {
  it("imports into an empty profile without asking and refetches", async () => {
    const calls = stubRoutes(profileStubs({ "GET /settings": EMPTY, "POST /settings/upload-cv": { status: "success", data: {} } }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText("Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.")).toBeVisible();
    expect(uploads(calls)).toHaveLength(1);
  });

  it("asks before replacing existing data; Abbrechen sends nothing", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings/upload-cv": { status: "success", data: {} } }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await userEvent.upload(fileInput(), pdf());
    const dialog = await screen.findByRole("dialog", { name: "Lebenslauf übernehmen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(uploads(calls)).toHaveLength(0);
  });

  it("is inactive while the form is dirty", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), " und mehr");
    const button = await importButton();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Erst speichern oder verwerfen.");
  });

  it("refuses a non-PDF before sending it", async () => {
    const calls = stubRoutes(profileStubs({ "GET /settings": EMPTY }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await userEvent.upload(fileInput(), new File(["x"], "cv.docx", { type: "application/msword" }), { applyAccept: false });
    expect(await screen.findByText("cv.docx: Dieser Dateityp wird nicht unterstützt.")).toBeVisible();
    expect(uploads(calls)).toHaveLength(0);
  });

  it.each([
    [413, { detail: "file_too_large" }, "Die Datei ist größer als 10 MB."],
    [415, { detail: "unsupported_type" }, "Das ist kein PDF. Bitte lade deinen Lebenslauf als PDF hoch."],
    [422, { detail: [{ type: "value_error", loc: ["body", "file"], msg: "cv_no_text" }] }, "In diesem PDF steht kein lesbarer Text (eingescannt?). Bitte lade ein PDF mit Text hoch."],
    [502, { detail: "cv_parse_failed" }, "Die KI konnte den Lebenslauf nicht lesen. Versuche es später noch einmal."],
  ])("maps each refusal to its sentence (%i)", async (status, body, sentence) => {
    stubRoutes(profileStubs({ "GET /settings": EMPTY, "POST /settings/upload-cv": () => jsonResponse(status, body) }));
    renderWithProviders(<ProfilePage />);
    await importButton();
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(sentence)).toBeVisible();
  });

  it("without an AI provider shows the sentence and no button", async () => {
    stubRoutes(profileStubs({ "GET /setup-status": { has_source: true, ai_configured: false, profile_complete: true, has_jobs: true } }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText(/Für den Import muss eine KI eingerichtet sein\./)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Lebenslauf importieren (PDF)" })).toBeNull());
  });
});
```

(`AiSetupAction` reads `/me`; add `"GET /me": { id: 1, username: "admin", is_admin: true }` to `profileStubs` if it is not served yet.)

`web/tests/e2e/profileCvImport.spec.ts`:

```ts
import { ProfileServer, profileRoutes, SCANNED_MARKER } from "./support/profileServer";
import { expect, test } from "./support/test";

const pdf = (content: string) => ({ name: "Lebenslauf.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n${content}`) });
const EMPTY = { role: "", skills: "", min_salary: "", location: "", preferences: "", spoken_languages: [],
  cv_data: { experience: [], projects: [], education: "" }, cv_template: null, cover_letter_template: null };

test("an import into an empty profile fills Ziel and Lebenslauf", async ({ page, mockApi }) => {
  const server = new ProfileServer(EMPTY);
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await page.locator("#pf-cv-import-file").setInputFiles(pdf("Jonas Weber"));
  await expect(page.getByText("Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.")).toBeVisible();
  await expect(page.getByText("Hanseatic Commerce GmbH").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Profilbereiche" }).getByRole("link", { name: "Ziel" }).click();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Backend-Entwickler");
});

test("a scanned PDF changes nothing", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const before = structuredClone(server.profile);
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await page.locator("#pf-cv-import-file").setInputFiles(pdf(SCANNED_MARKER));
  await page.getByRole("dialog", { name: "Lebenslauf übernehmen?" }).getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText(/kein lesbarer Text/)).toBeVisible();
  expect(server.profile).toEqual(before);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/cvImport.test.tsx`
Expected: FAIL: no import button.

- [ ] **Step 3: Hook and component**

`web/src/features/profile/cv/useCvImport.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import { importCv } from "@/api/profile";
import { MAX_FILE_BYTES } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { useProfileAnnounce } from "../announcer";
import { PROFILE_SAVE_SCOPE } from "../useProfileSave";

const PDF_TYPE = "application/pdf";
const PDF_EXTENSION = ".pdf";
// Task 2's fixed codes, by status: the server's words are never shown.
const IMPORT_ERRORS: ErrorMessageOverrides = {
  PAYLOAD_TOO_LARGE: "files.serverTooLarge",
  UNSUPPORTED_MEDIA_TYPE: "profile.cv.import.notPdf",
  VALIDATION_ERROR: "profile.cv.import.noText",
  SERVER_ERROR: "profile.cv.import.failed",
};

/** Checked before the request; the server checks the bytes again (Task 2). */
export function cvFileProblem(file: File): "unsupportedType" | "tooLarge" | null {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith(PDF_EXTENSION);
  if (!isPdf) return "unsupportedType";
  return file.size > MAX_FILE_BYTES ? "tooLarge" : null;
}

/** D6: the server parses and stores; the profile is refetched, and clean sections adopt it. */
export function useCvImport() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = useProfileAnnounce();
  const { t } = useI18n();
  return useMutation({
    scope: PROFILE_SAVE_SCOPE,
    mutationFn: importCv,
    onMutate: () => announce(t("profile.cv.import.reading")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      toast.show({ message: t("profile.cv.import.done"), tone: "success" });
    },
    onError: (error) => toast.show({ message: describeError(error, t, IMPORT_ERRORS), tone: "error" }),
  });
}
```

`web/src/features/profile/cv/CvImport.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import type { Profile } from "@/api/profile";
import { setupStatusQueryOptions } from "@/api/setup";
import { hasCvContent } from "@/domain/profile";
import { AiSetupAction } from "@/features/inbox/onboarding/AiSetupAction";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { cvFileProblem, useCvImport } from "./useCvImport";

const INPUT_ID = "pf-cv-import-file";
const PROBLEM_TEXT = { unsupportedType: "files.unsupportedType", tooLarge: "files.tooLarge" } as const;

interface CvImportProps {
  profile: Profile;
  /** D6: an import never races unsaved edits of the Lebenslauf form. */
  dirty: boolean;
}

export function CvImport({ profile, dirty }: CvImportProps) {
  const { t } = useI18n();
  const setup = useQuery(setupStatusQueryOptions());
  if (setup.data && !setup.data.ai_configured) {
    return (
      <p className="meta cv-import">
        {t("profile.cv.import.noAi")} <AiSetupAction className="link" />
      </p>
    );
  }
  return <ImportControl profile={profile} dirty={dirty} />;
}

function ImportControl({ profile, dirty }: CvImportProps) {
  const { t } = useI18n();
  const toast = useToast();
  const run = useCvImport();
  const [pending, setPending] = useState<File | null>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be picked again after a refusal
    if (!file) return;
    const problem = cvFileProblem(file);
    if (problem) return toast.show({ message: t(PROBLEM_TEXT[problem], { name: file.name }), tone: "error" });
    if (hasCvContent(profile)) setPending(file);
    else run.mutate(file);
  };
  return (
    <div className="cv-import">
      <Button icon={FileUp} busy={run.isPending} inactive={dirty} title={dirty ? t("profile.cv.import.dirty") : undefined}
        onClick={() => document.getElementById(INPUT_ID)?.click()}>
        {t("profile.cv.import.action")}
      </Button>
      <input id={INPUT_ID} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept="application/pdf,.pdf" onChange={pick} />
      {run.isPending ? <Notice tone="info">{t("profile.cv.import.reading")}</Notice> : null}
      <ConfirmImport file={pending} onCancel={() => setPending(null)} onConfirm={(file) => { setPending(null); run.mutate(file); }} />
    </div>
  );
}

function ConfirmImport(props: { file: File | null; onCancel: () => void; onConfirm: (file: File) => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={props.file !== null} onClose={props.onCancel} label={t("profile.cv.import.confirmTitle")}>
      <div className="panel-in">
        <PanelHeader title={t("profile.cv.import.confirmTitle")} onClose={props.onCancel} />
        <p className="prose">{t("profile.cv.import.confirmText")}</p>
        <div className="row dialog-actions">
          <Button variant="primary" onClick={() => props.file && props.onConfirm(props.file)}>{t("profile.cv.import.confirm")}</Button>
          <Button onClick={props.onCancel}>{t("guard.cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
```

(Read `FilesSection.tsx` for the dialog markup the app already uses (`panel-in`, the actions row class) and copy it. `onMutate` announces through the page region; the toast regions announce the end.)

`CvSection.tsx`, in `CvBody` above `<CvGapsNotice ... />`: `<CvImport profile={profile} dirty={form.dirty} />`.

`profile.css`: `.cv-import { display: grid; gap: 10px; justify-items: start; margin-bottom: 16px; }`.

i18n keys:

```ts
  "profile.cv.import.action": "Lebenslauf importieren (PDF)", // "Import CV (PDF)"
  "profile.cv.import.dirty": "Erst speichern oder verwerfen.", // "Save or discard first."
  "profile.cv.import.noAi": "Für den Import muss eine KI eingerichtet sein.", // "Importing needs an AI provider."
  "profile.cv.import.reading": "Der Lebenslauf wird gelesen. Das kann bis zu einer Minute dauern.", // "Reading the CV. This can take up to a minute."
  "profile.cv.import.done": "Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.", // "CV imported. Check Goal and CV."
  "profile.cv.import.confirmTitle": "Lebenslauf übernehmen?", // "Import this CV?"
  "profile.cv.import.confirmText": "Berufserfahrung, Projekte und Ausbildung werden ersetzt. Rolle, Kenntnisse, Ort und Gehalt werden ersetzt, wenn der Lebenslauf sie nennt.", // "Experience, projects and education are replaced. Role, skills, location and salary are replaced where the CV names them."
  "profile.cv.import.confirm": "Übernehmen", // "Import"
  "profile.cv.import.notPdf": "Das ist kein PDF. Bitte lade deinen Lebenslauf als PDF hoch.", // "This is not a PDF. Please upload your CV as a PDF."
  "profile.cv.import.noText": "In diesem PDF steht kein lesbarer Text (eingescannt?). Bitte lade ein PDF mit Text hoch.", // "This PDF has no readable text (scanned?). Please upload a PDF with text."
  "profile.cv.import.failed": "Die KI konnte den Lebenslauf nicht lesen. Versuche es später noch einmal.", // "The AI could not read the CV. Please try again later."
```

`web/tests/e2e/support/profileServer.ts`, add (route `POST ${UPLOAD_CV_PATH}`: `live((_sent, request) => server.importCv(request))`):

```ts
/** A PDF whose text the e2e server treats as missing, like a scan (server: 422 cv_no_text). */
export const SCANNED_MARKER = "SCANNED_IMAGE_ONLY";
/** What the fake AI reads from any other PDF. */
export const IMPORTED_CV = {
  role: "Backend-Entwickler",
  skills: "Kotlin, Java",
  min_salary: "",
  location: "",
  cv_data: {
    experience: [{ company: "Hanseatic Commerce GmbH", role: "Senior Backend Engineer", duration: "2021 – heute", description: "Checkout." }],
    projects: [],
    education: "B.Sc. Informatik",
  },
};
const IMPORTED_TEXT_FIELDS = ["role", "skills", "min_salary", "location"] as const;
```

```ts
  /**
   * POST /settings/upload-cv (Task 2): the bytes must be a PDF (415), the PDF must hold text
   * (422 cv_no_text on file); non-empty values replace stored ones, the CV data is replaced.
   */
  importCv(request: Request): unknown {
    const bytes = request.postDataBuffer()?.toString("latin1") ?? "";
    if (!bytes.includes("%PDF-")) return reply(HTTP_UNSUPPORTED, { detail: "unsupported_type" });
    if (bytes.includes(SCANNED_MARKER)) {
      return reply(HTTP_UNPROCESSABLE, { detail: [{ type: "value_error", loc: ["body", "file"], msg: "cv_no_text" }] });
    }
    for (const field of IMPORTED_TEXT_FIELDS) if (IMPORTED_CV[field]) this.profile[field] = IMPORTED_CV[field];
    this.profile.cv_data = structuredClone(IMPORTED_CV.cv_data);
    return { status: "success", data: structuredClone(IMPORTED_CV) };
  }
```

(`HTTP_UNSUPPORTED = 415`; `Request` is Playwright's type, imported with `import type { Request } from "@playwright/test"`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileCvImport.spec.ts tests/e2e/profileCv.spec.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 10: Nachweise: profile documents with upload, view, download and delete

**Files:**
- Create: `web/src/features/profile/proofs/ProofUpload.tsx`, `ProofList.tsx`, `ProofViewer.tsx`, `DeleteProofDialog.tsx`, `useProofs.ts`, `labels.ts`; `web/tests/unit/features/profile/proofsSection.test.tsx`, `web/tests/e2e/profileProofs.spec.ts`
- Modify: `web/src/features/profile/proofs/ProofsSection.tsx`, `web/src/features/job/documents/FileViewer.tsx` (export `FileContent`), `web/src/features/job/documents/uploadRules.ts` (`uploadProblem(file, accepted = ACCEPTED_UPLOAD_TYPES)`), `web/src/features/profile/profile.css`, `web/tests/e2e/support/profileServer.ts` (`uploadDocument`, `deleteDocument`, per-document routes), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `profileDocumentsQueryOptions`, `uploadProfileDocument`, `deleteProfileDocument`, `viewProfileDocument`, `downloadProfileDocument`, `ProfileDocument` (Task 5); `PROOF_TYPES`, `PROOF_DOC_TYPES`, `ProofDocType`, `profileDocumentPath`, `profileDocumentFilePath` (Task 5); `queryKeys.profileDocumentFile`; `uploadProblem`, `formatFileSize`, `viewKind`, `saveFile`, `DRIVE_UNSUPPORTED`, `useObjectUrl`, `FileContent`; `Seg`, `Dialog`, `PanelHeader`, `Button`, `EmptyState`, `Notice`, `useToast`, `formatDate`; `ProfileSectionFrame`, `SectionState`, `profileHeadingId` (Task 6).
- Produces: `ProofsSection()`; `useUploadProofs()`, `useDeleteProof()`, `useDownloadProof(document)`, `useProofFile(document)`; `PROOF_TYPE_LABEL: Record<ProofDocType, MessageKey>`; `FileContent` exported from `FileViewer.tsx`; e2e `ProfileServer.uploadDocument(request)`, `ProfileServer.deleteDocument(id)`, `documentRoutes(server, id)`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/proofsSection.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=nachweise"));
afterEach(() => vi.unstubAllGlobals());

const PDF_DOC = { id: 1, doc_type: "REFERENCE", label: "Zeugnis Nordlicht.pdf", original_filename: "Zeugnis Nordlicht.pdf",
  file_size: 421_888, mime_type: "application/pdf", created_at: "2026-08-12T09:00:00Z", downloadable: true };
const DRIVE_DOC = { ...PDF_DOC, id: 2, label: "AWS.png", original_filename: "AWS.png", mime_type: "image/png", downloadable: false };
const WORD_DOC = { ...PDF_DOC, id: 3, label: "Referenz.docx", original_filename: "Referenz.docx",
  mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

describe("Nachweise", () => {
  it("lists each document with type, size and date", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [PDF_DOC] }));
    renderWithProviders(<ProfilePage />);
    const row = (await screen.findByText("Zeugnis Nordlicht.pdf")).closest("li")!;
    expect(row).toHaveTextContent("Referenz · 412 KB · 12.08.2026");
  });

  it("a Drive document has no view or download, and says why", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [DRIVE_DOC] }));
    renderWithProviders(<ProfilePage />);
    const download = await screen.findByRole("button", { name: "AWS.png herunterladen" });
    expect(download).toHaveAttribute("aria-disabled", "true");
    expect(download).toHaveAttribute("title", "Dateien aus Google Drive lassen sich hier noch nicht öffnen.");
    expect(screen.getByRole("button", { name: "AWS.png ansehen" })).toHaveAttribute("aria-disabled", "true");
  });

  it("offers no viewer for Word files", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [WORD_DOC] }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Referenz.docx");
    expect(screen.queryByRole("button", { name: "Referenz.docx ansehen" })).toBeNull();
  });

  it("uploads with the chosen type and refuses a wrong file before sending", async () => {
    const calls = stubRoutes(profileStubs({ "POST /profile/documents": { id: 4 } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Referenz" }));
    const input = screen.getByLabelText("Dokument hochladen");
    await userEvent.upload(input, [new File(["%PDF-"], "a.pdf", { type: "application/pdf" }), new File(["x"], "b.txt", { type: "text/plain" })], { applyAccept: false });
    expect(await screen.findByText("b.txt: Dieser Dateityp wird nicht unterstützt.")).toBeVisible();
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect((posts[0]!.rawBody as FormData).get("doc_type")).toBe("REFERENCE");
  });

  it("asks before deleting and moves focus to the heading", async () => {
    stubRoutes(profileStubs({ "GET /profile/documents": [PDF_DOC], "DELETE /profile/documents/1": { status: "deleted" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Zeugnis Nordlicht.pdf löschen" }));
    const dialog = screen.getByRole("dialog", { name: "Datei löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("Zeugnis Nordlicht.pdf gelöscht.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Nachweise" })).toHaveFocus();
  });

  it("shows the empty state", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText("Noch keine Nachweise")).toBeVisible();
  });

  it("maps a server refusal of the upload to a fixed sentence", async () => {
    stubRoutes(profileStubs({ "POST /profile/documents": () => jsonResponse(415, { detail: "unsupported_type" }) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Dokument hochladen"), new File(["x"], "bild.png", { type: "image/png" }));
    expect(await screen.findByText(/Dateityp/)).toBeVisible();
    expect(screen.queryByText("unsupported_type")).toBeNull();
  });
});
```

`web/tests/e2e/profileProofs.spec.ts`:

```ts
import { profileDocumentFilePath } from "../../src/api/profilePaths";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");

test("upload, view on the A4 sheet, download with the original name, delete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=nachweise");
  await page.getByLabel("Dokument hochladen").setInputFiles({ name: "Arbeitszeugnis Łódź.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("Arbeitszeugnis Łódź.pdf hochgeladen.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Arbeitszeugnis Łódź.pdf" });
  await expect(row).toContainText("Zertifikat");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf ansehen" }).click();
  await expect(page.getByRole("dialog", { name: "Arbeitszeugnis Łódź.pdf" }).locator("object, .a4-fallback")).toBeVisible();
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf herunterladen" }).click();
  expect((await download).suggestedFilename()).toBe("Arbeitszeugnis Łódź.pdf");
  await row.getByRole("button", { name: "Arbeitszeugnis Łódź.pdf löschen" }).click();
  await page.getByRole("dialog", { name: "Datei löschen?" }).getByRole("button", { name: "Löschen" }).click();
  await expect(row).toHaveCount(0);
  expect(log.requests).toContain(`GET ${profileDocumentFilePath(3, "view")}`);
});

test("a renamed HTML file is refused by the server and not listed", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=nachweise");
  await page.getByLabel("Dokument hochladen").setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: Buffer.from("<html></html>") });
  await expect(page.getByText("Dieser Dateityp wird nicht unterstützt.").first()).toBeVisible();
  expect(server.documents.map((document) => document.original_filename)).not.toContain("bild.png");
});

test("the job page's attach list sees a new document", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=nachweise");
  await page.getByLabel("Dokument hochladen").setInputFiles({ name: "AWS.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("AWS.pdf hochgeladen.")).toBeVisible();
  expect(server.documents).toHaveLength(3);
});
```

(The fixture documents have ids 1 and 2, so the first upload gets id 3. An e2e spec may import runtime values from `src/api/profilePaths.ts`: it is client-free. If Chromium sanitises the suggested name, assert the value the browser reports for a plain-ASCII name first and record the difference in the report instead of weakening the backend test.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/proofsSection.test.tsx`
Expected: FAIL: Nachweise renders only its heading.

- [ ] **Step 3: Shared bits**

`web/src/features/job/documents/uploadRules.ts`: `uploadProblem` takes the accepted list (the job page's call is unchanged):

```ts
/** Checked before the request, so the user gets a sentence about the file instead of a failed upload. */
export function uploadProblem(
  file: { size: number; type: string },
  accepted: readonly string[] = ACCEPTED_UPLOAD_TYPES,
): UploadProblem | null {
  if (!accepted.includes(file.type)) return "unsupportedType";
  return file.size > MAX_UPLOAD_BYTES ? "tooLarge" : null;
}
```

`web/src/features/job/documents/FileViewer.tsx`: `export function FileContent(...)` (only the keyword is added; the profile viewer reuses it).

- [ ] **Step 4: Hooks**

`web/src/features/profile/proofs/useProofs.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import {
  deleteProfileDocument,
  downloadProfileDocument,
  uploadProfileDocument,
  viewProfileDocument,
  type ProfileDocument,
} from "@/api/profileDocuments";
import { queryKeys } from "@/api/queryKeys";
import { DRIVE_UNSUPPORTED, saveFile } from "@/features/job/documents/saveFile";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

const UPLOAD_ERRORS: ErrorMessageOverrides = {
  PAYLOAD_TOO_LARGE: "files.serverTooLarge",
  UNSUPPORTED_MEDIA_TYPE: "files.serverUnsupportedType",
};
const UPLOAD_SCOPE = { id: "profile-documents" };
const FILE_GC_MS = 60_000;
const PDF_TYPE = "application/pdf";

/** D8: one file after the other; the list refreshes after each (the job page reads the same key). */
export function useUploadProofs() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: UPLOAD_SCOPE,
    mutationFn: uploadProfileDocument,
    onSuccess: (_answer, { file }) => toast.show({ message: t("files.uploaded", { name: file.name }), tone: "success" }),
    onError: (error) => toast.show({ message: describeError(error, t, UPLOAD_ERRORS), tone: "error" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.profileDocuments }),
  });
}

export function useDeleteProof(onDeleted: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (document: ProfileDocument) => deleteProfileDocument(document.id),
    onSuccess: (_answer, document) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profileDocuments });
      toast.show({ message: t("files.deleted", { name: document.original_filename }), tone: "success" });
      onDeleted();
    },
    onError: (error) => toast.show({ message: describeError(error, t), tone: "error" }),
  });
}

export function useDownloadProof(document: ProfileDocument) {
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: () => downloadProfileDocument(document.id),
    onSuccess: (file) => saveFile(file, document.original_filename),
    onError: (error) => toast.show({ message: describeError(error, t, DRIVE_UNSUPPORTED), tone: "error" }),
  });
}

/** The bytes for the viewer, typed with the stored mime type (phase 2 D1: sniffing browsers refuse octet-stream PDFs). */
export function useProofFile(document: ProfileDocument) {
  return useQuery({
    queryKey: queryKeys.profileDocumentFile(document.id, document.created_at ?? ""),
    queryFn: async () => {
      const file = await viewProfileDocument(document.id);
      return new Blob([file.blob], { type: document.mime_type || PDF_TYPE });
    },
    staleTime: Infinity,
    gcTime: FILE_GC_MS,
  });
}
```

`web/src/features/profile/proofs/labels.ts`:

```ts
import type { ProofDocType } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";

export const PROOF_TYPE_LABEL: Readonly<Record<ProofDocType, MessageKey>> = {
  CERTIFICATE: "profile.proofs.type.CERTIFICATE",
  REFERENCE: "profile.proofs.type.REFERENCE",
};

/** A stored type the web does not know reads as a neutral "Nachweis". */
export function proofTypeLabel(docType: string): MessageKey {
  return PROOF_TYPE_LABEL[docType as ProofDocType] ?? "profile.proofs.type.other";
}
```

- [ ] **Step 5: Components**

`web/src/features/profile/proofs/ProofUpload.tsx`:

```tsx
"use client";

import { Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { PROOF_DOC_TYPES, PROOF_TYPES, type ProofDocType } from "@/api/profilePaths";
import { uploadProblem } from "@/features/job/documents/uploadRules";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { Seg } from "@/ui/Seg";
import { PROOF_TYPE_LABEL } from "./labels";
import { useUploadProofs } from "./useProofs";

const INPUT_ID = "pf-proof-upload";
const HINT_ID = "pf-proof-upload-hint";
const ACCEPT = PROOF_TYPES.join(",");

function useProofPicker(docType: ProofDocType, onProblems: (texts: string[]) => void) {
  const { t } = useI18n();
  const upload = useUploadProofs();
  return (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const problems = files.flatMap((file) => {
      const found = uploadProblem(file, PROOF_TYPES);
      if (!found) upload.mutate({ file, docType });
      return found ? [t(`files.${found}`, { name: file.name })] : [];
    });
    onProblems(problems);
  };
}

/** D8: the type first, then one or more files; each file is checked before it is sent. */
export function ProofUpload() {
  const { t } = useI18n();
  const [docType, setDocType] = useState<ProofDocType>("CERTIFICATE");
  const [problems, setProblems] = useState<string[]>([]);
  const onChange = useProofPicker(docType, setProblems);
  const options = PROOF_DOC_TYPES.map((value) => ({ value, label: t(PROOF_TYPE_LABEL[value]) }));
  return (
    <div className="proof-upload">
      <Seg options={options} value={docType} onChange={setDocType} label={t("profile.proofs.type")} />
      <label className="btn btn-sm" htmlFor={INPUT_ID}>
        <Icon icon={Upload} />
        <span>{t("profile.proofs.upload")}</span>
      </label>
      <input id={INPUT_ID} className="sr-only" type="file" multiple accept={ACCEPT} aria-describedby={HINT_ID} onChange={onChange} />
      <p className="meta" id={HINT_ID}>{t("profile.proofs.uploadHint")}</p>
      <div role="alert">
        {problems.length > 0 ? <Notice tone="error" announce={false}>{problems.join(" ")}</Notice> : null}
      </div>
    </div>
  );
}
```

(The label + `sr-only` input is the pattern of the job page's `UploadControl`; the input keeps the accessible name "Dokument hochladen" through the label. The alert container is mounted before any problem exists, so a new one is announced.)

`web/src/features/profile/proofs/ProofList.tsx`:

```tsx
"use client";

import { Download, Eye, Trash2, type LucideIcon } from "lucide-react";
import type { ProfileDocument } from "@/api/profileDocuments";
import { formatFileSize, viewKind } from "@/features/job/documents/uploadRules";
import { formatDate } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { proofTypeLabel } from "./labels";
import { useDownloadProof } from "./useProofs";

export interface ProofListProps {
  documents: readonly ProfileDocument[];
  onView: (document: ProfileDocument) => void;
  onDelete: (document: ProfileDocument) => void;
}

export function ProofList({ documents, onView, onDelete }: ProofListProps) {
  return (
    <ul className="file-list proof-list">
      {documents.map((document) => (
        <ProofRow key={document.id} document={document} onView={onView} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function useProofMeta(document: ProfileDocument): string {
  const { t, language } = useI18n();
  return [
    t(proofTypeLabel(document.doc_type)),
    document.file_size ? formatFileSize(document.file_size, language) : null,
    document.created_at ? formatDate(document.created_at, language) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ProofRow({ document, onView, onDelete }: Omit<ProofListProps, "documents"> & { document: ProfileDocument }) {
  const name = document.label || document.original_filename;
  return (
    <li className="file-row">
      <div>
        <div className="file-name">{name}</div>
        <div className="meta">{useProofMeta(document)}</div>
      </div>
      <div className="row">
        <ProofActions document={document} name={name} onView={onView} onDelete={onDelete} />
      </div>
    </li>
  );
}

function ProofActions(props: Omit<ProofListProps, "documents"> & { document: ProfileDocument; name: string }) {
  const { t } = useI18n();
  const download = useDownloadProof(props.document);
  const { name, document } = props;
  const blocked = document.downloadable ? undefined : t("files.driveUnsupported");
  return (
    <>
      {viewKind(document.mime_type) ? (
        <RowButton icon={Eye} label={t("files.view", { name })} blocked={blocked} onClick={() => props.onView(document)} />
      ) : null}
      <RowButton icon={Download} label={t("files.download", { name })} blocked={blocked} busy={download.isPending} onClick={() => download.mutate()} />
      <RowButton icon={Trash2} label={t("files.delete", { name })} onClick={() => props.onDelete(document)} />
    </>
  );
}

function RowButton(props: { icon: LucideIcon; label: string; blocked?: string; busy?: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" iconOnly icon={props.icon} aria-label={props.label} title={props.blocked}
      inactive={Boolean(props.blocked)} busy={props.busy} onClick={props.onClick} />
  );
}
```

(Profile documents are PDFs or images, so `viewKind` never returns "text" here.)

`web/src/features/profile/proofs/ProofViewer.tsx`:

```tsx
"use client";

import type { ProfileDocument } from "@/api/profileDocuments";
import { describeError } from "@/api/describeError";
import { FileContent } from "@/features/job/documents/FileViewer";
import { DRIVE_UNSUPPORTED } from "@/features/job/documents/saveFile";
import { useObjectUrl } from "@/features/job/documents/useDocumentFile";
import { viewKind } from "@/features/job/documents/uploadRules";
import { useI18n } from "@/i18n/useI18n";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { useProofFile } from "./useProofs";

/** D8: the job page's viewer (PDF on the A4 sheet, images inline) for a profile document. */
export function ProofViewer({ document, onClose }: { document: ProfileDocument; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} label={document.original_filename}>
      <div className="panel-in">
        <PanelHeader title={document.original_filename} onClose={onClose} />
        <ViewerBody document={document} />
      </div>
    </Dialog>
  );
}

function ViewerBody({ document }: { document: ProfileDocument }) {
  const { t } = useI18n();
  const kind = viewKind(document.mime_type);
  const file = useProofFile(document);
  const url = useObjectUrl(file.data);
  if (!kind) return <p className="prose">{t("files.noPreview")}</p>;
  if (file.isError) return <Notice tone="error">{describeError(file.error, t, DRIVE_UNSUPPORTED)}</Notice>;
  if (!url) return <p className="prose">{t("loading")}</p>;
  return <FileContent kind={kind} url={url} name={document.original_filename} />;
}
```

`web/src/features/profile/proofs/DeleteProofDialog.tsx`:

```tsx
"use client";

import type { ProfileDocument } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { profileHeadingId } from "../labels";
import { useDeleteProof } from "./useProofs";

const focusHeading = () => document.getElementById(profileHeadingId("nachweise"))?.focus();

export function DeleteProofDialog({ document: proof, onClose }: { document: ProfileDocument; onClose: () => void }) {
  const { t } = useI18n();
  const remove = useDeleteProof(() => {
    onClose();
    focusHeading(); // the row and its button are gone; the section heading is the next anchor
  });
  return (
    <Dialog open onClose={onClose} label={t("files.deleteTitle")}>
      <div className="panel-in">
        <PanelHeader title={t("files.deleteTitle")} onClose={onClose} />
        <p className="prose">{t("files.deleteText", { name: proof.original_filename })}</p>
        <div className="row dialog-actions">
          <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate(proof)}>{t("files.deleteConfirm")}</Button>
          <Button onClick={onClose}>{t("guard.cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
```

(If `ModalLayer` returns focus to the delete button after `onClose`, that button no longer exists; calling `focusHeading` after `onClose` in the same handler wins only if `ModalLayer` restores focus synchronously in its cleanup. Check the order in `ModalLayer.tsx`; if focus still lands on `<body>`, call `focusHeading` in a `requestAnimationFrame`, as the sources delete does (`focusSourceOrTitle`).)

`web/src/features/profile/proofs/ProofsSection.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { useState } from "react";
import { profileDocumentsQueryOptions, type ProfileDocument } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { DeleteProofDialog } from "./DeleteProofDialog";
import { ProofList } from "./ProofList";
import { ProofUpload } from "./ProofUpload";
import { ProofViewer } from "./ProofViewer";

export function ProofsSection() {
  const query = useQuery(profileDocumentsQueryOptions());
  return (
    <ProfileSectionFrame section="nachweise">
      <ProofUpload />
      <SectionState query={query}>{(documents) => <ProofBody documents={documents} />}</SectionState>
    </ProfileSectionFrame>
  );
}

function ProofBody({ documents }: { documents: ProfileDocument[] }) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<ProfileDocument | null>(null);
  const [deleting, setDeleting] = useState<ProfileDocument | null>(null);
  if (documents.length === 0) {
    return <EmptyState icon={Award} title={t("profile.proofs.emptyTitle")}>{t("profile.proofs.emptyText")}</EmptyState>;
  }
  return (
    <>
      <ProofList documents={documents} onView={setViewing} onDelete={setDeleting} />
      {viewing ? <ProofViewer document={viewing} onClose={() => setViewing(null)} /> : null}
      {deleting ? <DeleteProofDialog document={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}
```

`profile.css`, inside the layer:

```css
  .proof-upload {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    margin: 16px 0 20px;
  }
  .proof-upload [role="alert"] {
    flex-basis: 100%;
  }
```

and inside `@container profile (max-width: 719px)` (row buttons 44 px; the job page's `.file-row` already stacks, check `job.css` and add only what is missing):

```css
    .proof-list .btn-sm {
      min-width: 44px;
      min-height: 44px;
    }
```

i18n keys:

```ts
  "profile.proofs.type": "Art", // "Type"
  "profile.proofs.type.CERTIFICATE": "Zertifikat", // "Certificate"
  "profile.proofs.type.REFERENCE": "Referenz", // "Reference"
  "profile.proofs.type.other": "Nachweis", // "Document"
  "profile.proofs.upload": "Dokument hochladen", // "Upload document"
  "profile.proofs.uploadHint": "PDF, Word oder Bild, höchstens 10 MB pro Datei.", // "PDF, Word or image, at most 10 MB per file."
  "profile.proofs.emptyTitle": "Noch keine Nachweise", // "No documents yet"
  "profile.proofs.emptyText": "Lade Zeugnisse, Zertifikate und Referenzen hoch. Bei jeder Bewerbung wählst du, welche angehängt werden.", // "Upload references and certificates. For each application you choose which ones to attach."
```

`web/tests/e2e/support/profileServer.ts` additions (the `ProfileServer` needs the routes object to register per-document routes, as `sourcesServer.ts` does for new sources; `profileRoutes` creates the object, passes it as `server.routes`, and registers `documentRoutes(server, id)` for every fixture document):

```ts
const HTTP_TOO_LARGE = 413;
const PDF_SIGNATURE = "%PDF-";
const PNG_SIGNATURE = "\u0089PNG";
const SIGNATURE: Readonly<Record<string, string>> = { "application/pdf": PDF_SIGNATURE, "image/png": PNG_SIGNATURE };

/** One field of a multipart body; the e2e uploads are small, so a text scan is enough. */
function multipartValue(body: string, pattern: RegExp): string | null {
  return pattern.exec(body)?.[1] ?? null;
}
```

```ts
  routes: MutableRoutes | null = null;
  maxBytes = MAX_FILE_BYTES;
  private documentSeq = 2;

  /**
   * POST /profile/documents (Task 1): allowed declared type (415), bytes matching it (415), size
   * (413); stores the file name and the type sent and answers the stored row.
   */
  uploadDocument(request: Request): unknown {
    const body = request.postDataBuffer()?.toString("utf8") ?? "";
    const filename = multipartValue(body, /filename="([^"]*)"/);
    const mime = multipartValue(body, /Content-Type: ([^\r\n]+)\r\n\r\n/);
    const docType = multipartValue(body, /name="doc_type"\r\n\r\n([^\r\n]*)/);
    if (!filename || !mime || !PROOF_TYPES.includes(mime)) return reply(HTTP_UNSUPPORTED, { detail: "unsupported_type" });
    const content = body.slice(body.indexOf("\r\n\r\n", body.indexOf("filename=")) + 4);
    if (SIGNATURE[mime] && !content.startsWith(SIGNATURE[mime])) return reply(HTTP_UNSUPPORTED, { detail: "unsupported_type" });
    if (content.length > this.maxBytes) return reply(HTTP_TOO_LARGE, { detail: "file_too_large" });
    return this.storeDocument({ filename, mime, docType: docType ?? "CERTIFICATE", size: content.length });
  }

  private storeDocument(upload: { filename: string; mime: string; docType: string; size: number }): ProfileDocumentBody {
    this.documentSeq += 1;
    const document = { id: this.documentSeq, doc_type: upload.docType, label: upload.filename, original_filename: upload.filename,
      file_size: upload.size, mime_type: upload.mime, created_at: NOW_ISO, downloadable: true };
    this.documents.unshift(document);
    if (this.routes) setRoutes(this.routes, documentRoutes(this, document.id));
    return structuredClone(document);
  }

  /** DELETE /profile/documents/{id}: owner's document only (404 otherwise). */
  deleteDocument(id: number): unknown {
    const index = this.documents.findIndex((document) => document.id === id);
    if (index < 0) return reply(HTTP_NOT_FOUND, { detail: "Document not found" });
    this.documents.splice(index, 1);
    return { status: "deleted" };
  }
```

```ts
/** The per-document calls; view and download answer PDF bytes (a Drive document answers 400). */
export function documentRoutes(server: ProfileServer, id: number): MockRoutes {
  const file = (): unknown => {
    const document = server.documents.find((entry) => entry.id === id);
    return document?.downloadable === false ? reply(HTTP_BAD_REQUEST, { detail: "File not available" }) : PDF_BYTES;
  };
  return {
    [`DELETE ${profileDocumentPath(id)}`]: live(() => server.deleteDocument(id)),
    [`GET ${profileDocumentFilePath(id, "view")}`]: { body: PDF_BYTES, contentType: "application/pdf", respond: file },
    [`GET ${profileDocumentFilePath(id, "download")}`]: { body: PDF_BYTES, contentType: "application/pdf", respond: file },
  };
}
```

(`PDF_BYTES` is a `%PDF-` string; reuse `PDF` from `jobFixtures.ts` if it is exported, else define it here. A `reply` from a `contentType` route is sent as raw bytes (see `mockApi.ts`): for the Drive case keep the route without `contentType` and answer JSON instead; the e2e test above never opens a Drive document, so if that complicates the route, leave Drive files without view/download routes (the buttons are inactive anyway). Route `POST ${PROFILE_DOCUMENTS_PATH}`: `live((_sent, request) => server.uploadDocument(request))`. `NOW_ISO` comes from `jobFixtures.ts`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile tests/unit/features/job/filesSection.test.tsx tests/unit/features/job/uploadRules.test.ts` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileProofs.spec.ts tests/e2e/jobJourneys.spec.ts`
Expected: PASS (the job-page tests prove the shared helpers are unchanged for their callers).

- [ ] **Step 7: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 11: Vorlagen: gallery, default selection, sandboxed preview, delete

**Files:**
- Create: `web/src/features/profile/templates/TemplateGallery.tsx`, `TemplateCardView.tsx`, `TemplatePreview.tsx`, `DeleteTemplateDialog.tsx`, `useTemplateActions.ts`, `labels.ts`; `web/tests/unit/features/profile/templatesSection.test.tsx`, `web/tests/e2e/profileTemplates.spec.ts`
- Modify: `web/src/features/profile/templates/TemplatesSection.tsx`, `web/src/features/profile/profile.css`, `web/tests/e2e/support/profileServer.ts` (`selectTemplate`, `deleteTemplate`, `preview`, `hostilePreview`, routes), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `documentTemplatesQueryOptions`, `fileTemplatesQueryOptions`, `templatePreviewQueryOptions`, `selectDefaultTemplate`, `deleteTemplate`, `DocumentTemplate`, `FileTemplates` (Task 5); `galleryOf`, `defaultRef`, `canBeDefault`, `TEMPLATE_KINDS`, `DOC_TYPE_OF`, `SELECTION_FIELD`, `TemplateCard`, `TemplateKind` (Task 5); `profileQueryOptions`, `Profile`; `prepareForEditing` (`features/job/documents/editDocument.ts`); `A4Preview`, `Dialog`, `PanelHeader`, `Button`, `Notice`, `useNow`, `formatDate`, `cx`; `ProfileSectionFrame`, `SectionState`, `profileHeadingId` (Task 6).
- Produces: `TemplatesSection()`; `TemplateGallery({ kind, profile, templates, files })`; `TemplateCardView({ card, kind, isDefault, onPreview, onDelete })` (Task 12 adds the state line); `TemplatePreview({ kind, card, onClose })`; `useSelectDefault()`, `useDeleteTemplate(onDeleted)`; `FILE_TEMPLATE_LABEL`, `KIND_TITLE`, `cardName(card, t)`; e2e `ProfileServer.selectTemplate(sent)`, `.deleteTemplate(id)`, `.preview(request)`, `hostilePreview` flag.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/templatesSection.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=vorlagen"));
afterEach(() => vi.unstubAllGlobals());

const OWN = { id: 9, doc_type: "CV", name: "Mein Layout", is_admin: false, user_id: 1, status: null, created_at: "2026-08-12T09:00:00Z", updated_at: "2026-08-12T09:00:00Z" };
const cvGallery = () => screen.getByRole("region", { name: "Lebenslauf" });
const card = (name: string) => within(cvGallery()).getByText(name).closest("li")!;

describe("Vorlagen gallery", () => {
  it("lists bundled and own templates per kind and marks the default", async () => {
    stubRoutes(profileStubs({ "GET /document-templates": [OWN] }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    expect(card("Klassisch")).toHaveTextContent("Standard für neue Bewerbungen");
    expect(within(card("Mein Layout")).getByRole("button", { name: "Als Standard" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Anschreiben" })).getByText("Klassisch")).toBeVisible();
  });

  it("selects a default and moves the marker", async () => {
    const calls = stubRoutes(profileStubs({ "GET /document-templates": [OWN], "PATCH /settings/template": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Mein Layout");
    await userEvent.click(within(card("Mein Layout")).getByRole("button", { name: "Als Standard" }));
    expect(await screen.findByText("„Mein Layout“ ist jetzt Standard für neue Bewerbungen.")).toBeVisible();
    expect(JSON.parse(calls.find((call) => call.method === "PATCH")!.body!)).toEqual({ cv_template: "9" });
    expect(card("Mein Layout")).toHaveTextContent("Standard für neue Bewerbungen");
  });

  it("a deleted default reads as the bundled one", async () => {
    stubRoutes(profileStubs({ "GET /settings": { ...STORED_SETTINGS, cv_template: "99" } }));
    renderWithProviders(<ProfilePage />);
    await screen.findAllByText("Standard für neue Bewerbungen");
    expect(card("Klassisch")).toHaveTextContent("Standard für neue Bewerbungen");
  });

  it("the preview frame has an empty sandbox and the CSP", async () => {
    stubRoutes(profileStubs({ "GET /document-templates/preview": { html: "<html><body><script>parent.x=1</script><h1>Jonas</h1></body></html>" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(within(await screen.findByRole("region", { name: "Lebenslauf" })).getByRole("button", { name: "Vorschau von Klassisch" }));
    const frame = await screen.findByTitle("Vorschau von Klassisch");
    expect(frame).toHaveAttribute("sandbox", "");
    const srcdoc = frame.getAttribute("srcdoc")!;
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).not.toContain("<script");
  });

  it("a template the server cannot render says so", async () => {
    stubRoutes(profileStubs({ "GET /document-templates/preview": () => jsonResponse(422, { detail: "template_rejected" }) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(within(await screen.findByRole("region", { name: "Lebenslauf" })).getByRole("button", { name: "Vorschau von Klassisch" }));
    expect(await screen.findByText("Diese Vorlage lässt sich nicht darstellen.")).toBeVisible();
  });

  it("deletes an own template after asking, with the default note when it is the default", async () => {
    stubRoutes(profileStubs({ "GET /settings": { ...STORED_SETTINGS, cv_template: "9" }, "GET /document-templates": [OWN], "DELETE /document-templates/9": { ok: true } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mein Layout löschen" }));
    const dialog = screen.getByRole("dialog", { name: "Vorlage löschen?" });
    expect(dialog).toHaveTextContent("Danach wird „Klassisch“ verwendet.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    expect(await screen.findByText("„Mein Layout“ gelöscht.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Vorlagen" })).toHaveFocus();
  });

  it("never offers delete for bundled or global templates", async () => {
    stubRoutes(profileStubs({ "GET /document-templates": [{ ...OWN, id: 5, is_admin: true, user_id: null, name: "Firma" }] }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText("Firma");
    expect(screen.queryByRole("button", { name: /löschen$/ })).toBeNull();
  });
});
```

`web/tests/e2e/profileTemplates.spec.ts`:

```ts
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, SANDBOX_PROBE, test } from "./support/test";

test.use({ allowedConsoleErrors: [SANDBOX_PROBE] });

test("make a template the default, reload, delete it, and the bundled one is the default again", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  const gallery = page.getByRole("region", { name: "Lebenslauf" });
  const own = gallery.getByRole("listitem").filter({ hasText: "lebenslauf_2025" });
  await own.getByRole("button", { name: "Als Standard" }).click();
  await page.reload();
  await expect(own).toContainText("Standard für neue Bewerbungen");
  await own.getByRole("button", { name: "lebenslauf_2025 löschen" }).click();
  await page.getByRole("dialog", { name: "Vorlage löschen?" }).getByRole("button", { name: "Löschen" }).click();
  await expect(gallery.getByRole("listitem").filter({ hasText: "Klassisch" })).toContainText("Standard für neue Bewerbungen");
  expect(server.profile.cv_template).toBeNull();
});

test("a script in the preview never runs", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  server.hostilePreview = true;
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await page.getByRole("region", { name: "Lebenslauf" }).getByRole("button", { name: "Vorschau von Klassisch" }).click();
  await expect(page.frameLocator("iframe[title='Vorschau von Klassisch']").getByRole("heading", { name: "Jonas Weber" })).toBeVisible();
  expect(await page.title()).not.toBe("pwned");
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/templatesSection.test.tsx`
Expected: FAIL: Vorlagen renders only its heading.

- [ ] **Step 3: Labels and actions**

`web/src/features/profile/templates/labels.ts`:

```ts
import type { TemplateCard, TemplateKind } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

/** Bundled template keys are server file names; known ones get a translated name (D9). */
export const FILE_TEMPLATE_LABEL: Readonly<Record<string, MessageKey>> = {
  classic: "profile.templates.classic",
};

export const KIND_TITLE: Readonly<Record<TemplateKind, MessageKey>> = {
  cv: "profile.templates.kind.cv",
  letter: "profile.templates.kind.letter",
};

export function cardName(card: TemplateCard, t: Translate): string {
  const label = card.origin === "builtin" ? FILE_TEMPLATE_LABEL[card.ref] : undefined;
  return label ? t(label) : card.name;
}
```

(`FILE_TEMPLATE_LABEL` must not be read with prototype keys such as `constructor`: use `Object.hasOwn(FILE_TEMPLATE_LABEL, card.ref)` or a `Map`, as `domain/levels.ts` does.)

`web/src/features/profile/templates/useTemplateActions.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import type { Profile } from "@/api/profile";
import { queryKeys } from "@/api/queryKeys";
import { deleteTemplate, selectDefaultTemplate } from "@/api/templates";
import { DOC_TYPE_OF, SELECTION_FIELD, type TemplateKind } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

interface Selection {
  kind: TemplateKind;
  ref: string;
  name: string;
}

export function useSelectDefault() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ kind, ref }: Selection) => selectDefaultTemplate({ docType: DOC_TYPE_OF[kind], ref }),
    onSuccess: (_answer, { kind, ref, name }) => {
      queryClient.setQueryData<Profile>(queryKeys.profile, (profile) =>
        profile ? { ...profile, [SELECTION_FIELD[kind]]: ref } : profile,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.show({ message: t("profile.templates.selected", { name }), tone: "success" });
    },
    // 409: the AI is still filling it (Task 3); the button is hidden for such cards, a second tab may differ.
    onError: (error) =>
      toast.show({ message: describeError(error, t, { CONFLICT: "profile.templates.stillFilling" }), tone: "error" }),
  });
}

export function useDeleteTemplate(onDeleted: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ id }: { id: number; name: string }) => deleteTemplate(id),
    onSuccess: (_answer, { name }) => {
      // The server may have reset the default (Task 3), so the profile refreshes too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.show({ message: t("profile.templates.deleted", { name }), tone: "success" });
      onDeleted();
    },
    onError: (error) => toast.show({ message: describeError(error, t), tone: "error" }),
  });
}
```

- [ ] **Step 4: Card, gallery, preview, delete, section**

`web/src/features/profile/templates/TemplateCardView.tsx`:

```tsx
"use client";

import { Eye, Trash2 } from "lucide-react";
import { canBeDefault, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { formatDate } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { cardName } from "./labels";
import { useSelectDefault } from "./useTemplateActions";

export interface TemplateCardViewProps {
  card: TemplateCard;
  kind: TemplateKind;
  isDefault: boolean;
  onPreview: (card: TemplateCard) => void;
  onDelete: (card: TemplateCard) => void;
}

const THUMB_LINES = 9;
const LINES = Array.from({ length: THUMB_LINES }, (_value, index) => index);

function Thumb({ kind }: { kind: TemplateKind }) {
  return (
    <div className={cx("tpl-thumb", kind === "letter" && "is-letter")} aria-hidden="true">
      <div className="thumb-in">{LINES.map((line) => <i key={line} />)}</div>
    </div>
  );
}

function useCardMeta(card: TemplateCard): string {
  const { t, language } = useI18n();
  if (card.origin === "builtin") return t("profile.templates.builtin");
  if (card.origin === "global") return t("profile.templates.global");
  return card.createdAt ? t("profile.templates.uploadedOn", { date: formatDate(card.createdAt, language) }) : "";
}

export function TemplateCardView({ card, kind, isDefault, onPreview, onDelete }: TemplateCardViewProps) {
  const { t } = useI18n();
  const name = cardName(card, t);
  return (
    <li className={cx("tpl", isDefault && "is-default")}>
      <Thumb kind={kind} />
      <div>
        <div className="tpl-name">{name}</div>
        <div className="tpl-meta">{useCardMeta(card)}</div>
      </div>
      <div className="row tpl-actions">
        <DefaultControl card={card} kind={kind} name={name} isDefault={isDefault} />
        <Button size="sm" variant="ghost" icon={Eye} aria-label={t("profile.templates.previewOf", { name })} onClick={() => onPreview(card)}>
          {t("preview.title")}
        </Button>
        {card.origin === "own" ? (
          <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t("profile.templates.deleteOf", { name })} onClick={() => onDelete(card)} />
        ) : null}
      </div>
    </li>
  );
}

function DefaultControl(props: { card: TemplateCard; kind: TemplateKind; name: string; isDefault: boolean }) {
  const { t } = useI18n();
  const select = useSelectDefault();
  if (props.isDefault) return <span className="meta">{t("profile.templates.isDefault")}</span>;
  if (!canBeDefault(props.card)) return null;
  return (
    <Button size="sm" busy={select.isPending} onClick={() => select.mutate({ kind: props.kind, ref: props.card.ref, name: props.name })}>
      {t("profile.templates.makeDefault")}
    </Button>
  );
}
```

`web/src/features/profile/templates/TemplateGallery.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Profile } from "@/api/profile";
import type { DocumentTemplate, FileTemplates } from "@/api/templates";
import { defaultRef, galleryOf, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { DeleteTemplateDialog } from "./DeleteTemplateDialog";
import { KIND_TITLE } from "./labels";
import { TemplateCardView } from "./TemplateCardView";
import { TemplatePreview } from "./TemplatePreview";

export interface TemplateGalleryProps {
  kind: TemplateKind;
  profile: Profile;
  templates: readonly DocumentTemplate[];
  files: FileTemplates;
}

export function TemplateGallery({ kind, profile, templates, files }: TemplateGalleryProps) {
  const { t } = useI18n();
  const now = useNow();
  const cards = galleryOf({ kind, files, templates, now });
  const current = defaultRef(kind, profile, cards);
  const [previewing, setPreviewing] = useState<TemplateCard | null>(null);
  const [deleting, setDeleting] = useState<TemplateCard | null>(null);
  const headingId = `pf-templates-${kind}-h`;
  return (
    <section className="section tpl-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="sec-title-sm">{t(KIND_TITLE[kind])}</h3>
      <ul className="gallery">
        {cards.map((card) => (
          <TemplateCardView key={card.ref} card={card} kind={kind} isDefault={card.ref === current} onPreview={setPreviewing} onDelete={setDeleting} />
        ))}
      </ul>
      {previewing ? <TemplatePreview kind={kind} card={previewing} onClose={() => setPreviewing(null)} /> : null}
      {deleting ? <DeleteTemplateDialog card={deleting} isDefault={deleting.ref === current} onClose={() => setDeleting(null)} /> : null}
    </section>
  );
}
```

`web/src/features/profile/templates/TemplatePreview.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { describeError } from "@/api/describeError";
import { templatePreviewQueryOptions } from "@/api/templates";
import { DOC_TYPE_OF, type TemplateCard, type TemplateKind } from "@/domain/templates";
import { prepareForEditing } from "@/features/job/documents/editDocument";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { cardName } from "./labels";

export function TemplatePreview({ kind, card, onClose }: { kind: TemplateKind; card: TemplateCard; onClose: () => void }) {
  const { t } = useI18n();
  const title = t("profile.templates.previewOf", { name: cardName(card, t) });
  return (
    <Dialog open onClose={onClose} label={title}>
      <div className="panel-in tpl-preview">
        <PanelHeader title={title} onClose={onClose} />
        <PreviewBody kind={kind} card={card} title={title} />
      </div>
    </Dialog>
  );
}

function PreviewBody({ kind, card, title }: { kind: TemplateKind; card: TemplateCard; title: string }) {
  const { t } = useI18n();
  const preview = useQuery(templatePreviewQueryOptions(DOC_TYPE_OF[kind], card.ref));
  if (preview.isError) {
    const text = describeError(preview.error, t, { VALIDATION_ERROR: "profile.templates.previewRejected" });
    return <Notice tone="error">{text}</Notice>;
  }
  return (
    <A4Preview title={title} pdfUrl={null} slug={t("profile.templates.previewSlug")} busy={preview.isPending}>
      {preview.data ? <PreviewFrame html={preview.data} title={title} /> : null}
    </A4Preview>
  );
}

/**
 * Template and preview HTML are untrusted (uploads, AI output): no scripts, no same-origin access,
 * active content stripped and the editor CSP prepended (Global Constraints, Untrusted HTML).
 */
function PreviewFrame({ html, title }: { html: string; title: string }) {
  const srcDoc = useMemo(() => prepareForEditing(html), [html]);
  return <iframe className="tpl-preview-frame" title={title} sandbox="" srcDoc={srcDoc} />;
}
```

(`A4Preview` shows its blank sheet while `children` is null and the busy note while loading; with `children` set it shows them instead of a PDF and offers no full-screen button, D11.)

`web/src/features/profile/templates/DeleteTemplateDialog.tsx`:

```tsx
"use client";

import type { TemplateCard } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { profileHeadingId } from "../labels";
import { useDeleteTemplate } from "./useTemplateActions";

export function DeleteTemplateDialog({ card, isDefault, onClose }: { card: TemplateCard; isDefault: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const remove = useDeleteTemplate(() => {
    onClose();
    document.getElementById(profileHeadingId("vorlagen"))?.focus();
  });
  const text = t("profile.templates.deleteText", { name: card.name });
  return (
    <Dialog open onClose={onClose} label={t("profile.templates.deleteTitle")}>
      <div className="panel-in">
        <PanelHeader title={t("profile.templates.deleteTitle")} onClose={onClose} />
        <p className="prose">{isDefault ? `${text} ${t("profile.templates.deleteDefault")}` : text}</p>
        <div className="row dialog-actions">
          <Button variant="danger" busy={remove.isPending} onClick={() => card.id !== null && remove.mutate({ id: card.id, name: card.name })}>
            {t("files.deleteConfirm")}
          </Button>
          <Button onClick={onClose}>{t("guard.cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
```

(Same focus caveat as `DeleteProofDialog`, Task 10.)

`web/src/features/profile/templates/TemplatesSection.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { profileQueryOptions } from "@/api/profile";
import { documentTemplatesQueryOptions, fileTemplatesQueryOptions } from "@/api/templates";
import { TEMPLATE_KINDS } from "@/domain/templates";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { TemplateGallery } from "./TemplateGallery";

export function TemplatesSection() {
  const templates = useQuery(documentTemplatesQueryOptions());
  const files = useQuery(fileTemplatesQueryOptions());
  const profile = useQuery(profileQueryOptions());
  return (
    <ProfileSectionFrame section="vorlagen">
      <SectionState query={templates}>
        {(templateList) => (
          <SectionState query={files}>
            {(fileList) => (
              <SectionState query={profile}>
                {(stored) => TEMPLATE_KINDS.map((kind) => (
                  <TemplateGallery key={kind} kind={kind} profile={stored} templates={templateList} files={fileList} />
                ))}
              </SectionState>
            )}
          </SectionState>
        )}
      </SectionState>
    </ProfileSectionFrame>
  );
}
```

(The three requests start together (page prefetch); the nesting only orders what is shown. If the nesting reads poorly, a small `useAllData()` that returns the three results and one `SectionState` over a combined query object is fine; keep `givenUp` as the error rule.)

`profile.css`, inside the layer (prototype gallery; the default outline is ink, D9; the thumb state text is 13 px):

```css
  .tpl-section {
    margin-top: 24px;
  }
  .gallery {
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 26px;
  }
  .tpl {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tpl-thumb {
    aspect-ratio: 210 / 297;
    background: var(--paper);
    position: relative;
    overflow: hidden;
    container-type: inline-size;
    box-shadow: 0 0 0 1px var(--line), 0 14px 24px -16px var(--shadow-ink, rgb(0 0 0 / 35%));
  }
  .tpl.is-default .tpl-thumb {
    outline: 3px solid var(--text);
    outline-offset: 4px;
  }
  .thumb-in {
    position: absolute;
    inset: 10cqw 11cqw;
    display: flex;
    flex-direction: column;
    gap: 3.2cqw;
  }
  .thumb-in i {
    display: block;
    height: 2.6cqw;
    background: var(--paper-rule);
  }
  .thumb-in i:first-child {
    height: 6cqw;
    width: 58%;
    background: var(--paper-ink);
    opacity: 0.8;
  }
  .tpl-thumb.is-letter .thumb-in i:nth-child(-n + 3) {
    width: 40%;
  }
  .tpl-name {
    font-weight: 600;
    font-size: var(--fs-14);
    line-height: 1.35;
  }
  .tpl-meta {
    color: var(--text-2);
    font-size: var(--fs-13);
  }
  .tpl-actions {
    flex-wrap: wrap;
    gap: 6px;
  }
  .tpl-preview-frame {
    width: 100%;
    height: 100%;
    border: 0;
    background: var(--paper);
  }
```

and inside `@container profile (max-width: 719px)`:

```css
    .gallery {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .tpl-actions .btn-sm {
      min-height: 44px;
    }
```

plus `@container profile (max-width: 339px) { .gallery { grid-template-columns: minmax(0, 1fr); } }`. (Take the paper tokens (`--paper`, `--paper-rule`, `--paper-ink`) and the shadow from `tokens.css`; if the prototype's oklch shadow has no token, use the A4 sheet's shadow from `content.css` instead of a new literal. Check the default outline for 3:1 against `--bg` in both themes.)

i18n keys:

```ts
  "profile.templates.kind.cv": "Lebenslauf", // "CV"
  "profile.templates.kind.letter": "Anschreiben", // "Cover letter"
  "profile.templates.classic": "Klassisch", // "Classic"
  "profile.templates.builtin": "Mitgeliefert", // "Built in"
  "profile.templates.global": "Für alle", // "For everyone"
  "profile.templates.uploadedOn": "Hochgeladen am {date}", // "Uploaded on {date}"
  "profile.templates.isDefault": "Standard für neue Bewerbungen", // "Default for new applications"
  "profile.templates.makeDefault": "Als Standard", // "Make default"
  "profile.templates.selected": "„{name}“ ist jetzt Standard für neue Bewerbungen.", // "“{name}” is now the default for new applications."
  "profile.templates.stillFilling": "Die Vorlage wird noch befüllt. Versuche es gleich noch einmal.", // "The template is still being filled. Please try again shortly."
  "profile.templates.previewOf": "Vorschau von {name}", // "Preview of {name}"
  "profile.templates.previewSlug": "Mit deinen Profildaten", // "With your profile data"
  "profile.templates.previewRejected": "Diese Vorlage lässt sich nicht darstellen.", // "This template cannot be displayed."
  "profile.templates.deleteOf": "{name} löschen", // "Delete {name}"
  "profile.templates.deleteTitle": "Vorlage löschen?", // "Delete template?"
  "profile.templates.deleteText": "„{name}“ wird endgültig gelöscht.", // "“{name}” will be deleted for good."
  "profile.templates.deleteDefault": "Danach wird „Klassisch“ verwendet.", // "“Classic” is used afterwards."
  "profile.templates.deleted": "„{name}“ gelöscht.", // "“{name}” deleted."
```

`web/tests/e2e/support/profileServer.ts` additions (routes: `PATCH ${TEMPLATE_SELECTION_PATH}` -> `live((sent) => server.selectTemplate(sent))`; `GET ${TEMPLATE_PREVIEW_PATH}` -> `live((_sent, request) => server.preview(request))`; per template `DELETE ${documentTemplatePath(id)}` -> `live(() => server.deleteTemplate(id))`, registered for the fixtures in `profileRoutes` and for new ones by Task 12):

```ts
const HTTP_CONFLICT = 409;
const SELECTION_FIELDS = ["cv_template", "cover_letter_template"] as const;
const HOSTILE_PREVIEW =
  "<html><head><script>window.top.document.title='pwned';window.top.__pwned=1</script></head>" +
  "<body><h1>Jonas Weber</h1><img src=x onerror=\"window.top.__pwned=1\"></body></html>";
```

```ts
  hostilePreview = false;

  /** PATCH /settings/template (Task 3): own or global ids of the right type, never a processing one. */
  selectTemplate(sent: unknown): unknown {
    const body = sent as Partial<Record<(typeof SELECTION_FIELDS)[number], string>>;
    for (const field of SELECTION_FIELDS) {
      const ref = body[field];
      if (!ref || !/^\d+$/.test(ref)) continue;
      const template = this.templates.find((entry) => String(entry.id) === ref);
      if (!template) return reply(HTTP_UNPROCESSABLE, { detail: `${field}: template not found` });
      if (template.status === "processing") return reply(HTTP_CONFLICT, { detail: "template_processing" });
    }
    Object.assign(this.profile, body);
    return { status: "saved" };
  }

  /** DELETE /document-templates/{id} (Task 3): own only; a selection naming it becomes null. */
  deleteTemplate(id: number): unknown {
    const index = this.templates.findIndex((entry) => entry.id === id && !entry.is_admin);
    if (index < 0) return reply(HTTP_NOT_FOUND, { detail: "Template not found or cannot be deleted" });
    this.templates.splice(index, 1);
    for (const field of SELECTION_FIELDS) if (this.profile[field] === String(id)) this.profile[field] = null;
    return { ok: true };
  }

  /** GET /document-templates/preview (Task 4): rendered HTML; hostilePreview stands in for a hostile render. */
  preview(request: Request): unknown {
    const ref = new URL(request.url()).searchParams.get("template") ?? "";
    const known = ref === "classic" || this.templates.some((entry) => String(entry.id) === ref);
    if (!known) return reply(HTTP_NOT_FOUND, { detail: "Template not found" });
    const html = this.hostilePreview ? HOSTILE_PREVIEW : `<html><body><h1>Jonas Weber</h1><p>${this.profile.role}</p></body></html>`;
    return { html };
  }
```

(The real server never returns active content for a valid template (scripts are stripped at save time and values are escaped), so `HOSTILE_PREVIEW` tests the web's own layer of the defence, the sandbox and CSP, which must hold on its own.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileTemplates.spec.ts tests/e2e/profile.spec.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 12: Vorlagen: upload with AI fill and live state (`template_ready`, `annotation_rejected`, failed, stalled)

**Files:**
- Create: `web/src/features/profile/templates/TemplateUpload.tsx`, `useTemplateUpload.ts`, `useTemplateOutcomes.ts`, `TemplateStateLine.tsx`; `web/tests/unit/features/profile/templateUpload.test.tsx`, `web/tests/e2e/profileTemplateLive.spec.ts`
- Modify: `web/src/features/profile/templates/TemplateGallery.tsx` (upload card last; `useTemplateOutcomes(cards)`), `web/src/features/profile/templates/TemplateCardView.tsx` (state line, `aria-busy` while filling), `web/src/features/profile/profile.css`, `web/tests/e2e/support/profileServer.ts` (`createTemplate`, `finishTemplate`, template routes), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `uploadTemplate`, `DocumentTemplate` (Task 5); `MAX_TEMPLATE_HTML_LENGTH`, `MAX_TEMPLATE_NAME_LENGTH` (Task 5); `templateOutcome`, `TemplateCard`, `TemplateState`, `TemplateKind`, `DOC_TYPE_OF` (Task 5); `useProfileAnnounce` (Task 6); `cardName` (Task 11); the existing `template_ready` handler (`applyEvent.ts`: invalidates `["templates"]`); `Notice`, `Icon`, `useToast`, `describeError`.
- Produces: `TemplateUpload({ kind })`; `useTemplateUpload(kind)`; `readTemplateFile(file): Promise<{ name: string; html: string } | { problem: "unsupportedType" | "tooLarge" }>`; `templateName(fileName, fallback)`; `useTemplateOutcomes(cards)`; `TemplateStateLine({ state })`; `TEMPLATE_STATE_TEXT`; e2e `ProfileServer.createTemplate(sent)`, `.finishTemplate(id, status)`.

- [ ] **Step 1: Write the failing tests**

`web/tests/unit/features/profile/templateUpload.test.tsx`:

```tsx
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { templateName } from "@/features/profile/templates/useTemplateUpload";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=vorlagen"));
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date().toISOString();
const created = { id: 21, doc_type: "CV", name: "lebenslauf_2026", is_admin: false, user_id: 1, status: "processing", created_at: NOW, updated_at: NOW };
const html = (text = "<p>{{ name }}</p>") => new File([text], "lebenslauf_2026.html", { type: "text/html" });
const cvUpload = () => screen.getByLabelText("Lebenslauf-Vorlage hochladen");
const liveRegion = (container: HTMLElement) => container.querySelector("[role=status].sr-only")!;

describe("template upload and live state", () => {
  it("names the template after the file without its extension", () => {
    expect(templateName("  Mein CV.final.HTML ", "Vorlage")).toBe("Mein CV.final");
    expect(templateName(".html", "Vorlage")).toBe("Vorlage");
    expect(templateName(`${"x".repeat(120)}.htm`, "Vorlage")).toHaveLength(100);
  });

  it("uploads, shows the fill state without Als Standard, then the outcome", async () => {
    let list: object[] = [];
    const calls = stubRoutes(profileStubs({
      "GET /document-templates": () => jsonResponse(200, list),
      // Like the server: once created, the template is part of the list.
      "POST /document-templates": () => {
        list = [created];
        return jsonResponse(200, created);
      },
    }));
    const { queryClient, container } = renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Lebenslauf-Vorlage hochladen"), html());
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    expect(card).toHaveTextContent("KI setzt Platzhalter ein …");
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(within(card).queryByRole("button", { name: "Als Standard" })).toBeNull();
    expect(JSON.parse(calls.find((call) => call.method === "POST")!.body!)).toEqual({ doc_type: "CV", name: "lebenslauf_2026", html: "<p>{{ name }}</p>" });
    list = [{ ...created, status: "annotation_rejected" }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    await waitFor(() => expect(card).toHaveTextContent("Die KI-Platzhalter wurden verworfen."));
    await waitFor(() => expect(liveRegion(container)).toHaveTextContent("„lebenslauf_2026“: KI-Platzhalter verworfen."));
  });

  it("announces each template that leaves the fill once, and nothing on the first load", async () => {
    let list: object[] = [{ ...created, status: null }];
    stubRoutes(profileStubs({ "GET /document-templates": () => jsonResponse(200, list) }));
    const { queryClient, container } = renderWithProviders(<ProfilePage />);
    await screen.findByText("lebenslauf_2026");
    expect(liveRegion(container)).toHaveTextContent("");
    list = [{ ...created, status: "processing" }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    list = [{ ...created, status: null }];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.templates }));
    await waitFor(() => expect(liveRegion(container)).toHaveTextContent("„lebenslauf_2026“ ist bereit."));
  });

  it("shows a fill that ran too long as stalled, with delete as the way out", async () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    stubRoutes(profileStubs({ "GET /document-templates": [{ ...created, created_at: old, updated_at: old }] }));
    renderWithProviders(<ProfilePage />);
    const card = (await screen.findByText("lebenslauf_2026")).closest("li")!;
    expect(card).toHaveTextContent("Das dauert ungewöhnlich lange. Lösche die Vorlage und lade sie erneut hoch.");
    expect(within(card).getByRole("button", { name: "lebenslauf_2026 löschen" })).toBeVisible();
  });

  it("refuses a non-HTML file and an oversized one before sending", async () => {
    const calls = stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Lebenslauf-Vorlage hochladen");
    await userEvent.upload(cvUpload(), new File(["x"], "cv.docx", { type: "application/msword" }), { applyAccept: false });
    expect(await screen.findByText("Nur HTML-Vorlagen (.html) werden unterstützt.")).toBeVisible();
    await userEvent.upload(cvUpload(), html("x".repeat(1_000_001)));
    expect(await screen.findByText("Die Vorlage ist größer als 1 MB.")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("maps a server refusal of the template to a fixed sentence", async () => {
    const refused = { detail: [{ type: "value_error", loc: ["body", "html"], msg: "Template must not access attributes starting with '_'" }] };
    stubRoutes(profileStubs({ "POST /document-templates": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Lebenslauf-Vorlage hochladen"), html("{{ x.__class__ }}"));
    expect(await screen.findByText("Die Vorlage enthält ungültige Platzhalter und wurde abgelehnt.")).toBeVisible();
    expect(screen.queryByText(/attributes starting/)).toBeNull();
  });

  it("a letter template is ready at once and needs no AI", async () => {
    stubRoutes(profileStubs({ "POST /document-templates": { ...created, id: 22, doc_type: "COVER_LETTER", name: "brief", status: null } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.upload(await screen.findByLabelText("Briefvorlage hochladen"), new File(["<p data-slot='body'></p>"], "brief.html", { type: "text/html" }));
    expect(await screen.findByText("„brief“ hochgeladen.")).toBeVisible();
  });
});
```

`web/tests/e2e/profileTemplateLive.spec.ts`:

```ts
import { fixNow, NOW_ISO, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

test.beforeEach(async ({ page }) => fixNow(page));

const TEMPLATE = { name: "lebenslauf_2026.html", mimeType: "text/html", buffer: Buffer.from("<html><body><h1>Jonas</h1></body></html>") };

async function socket(log: ApiLog) {
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
}

test("a rejected fill shows the warning after the event and the template can still be the default", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await socket(log);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  const card = page.getByRole("region", { name: "Lebenslauf" }).getByRole("listitem").filter({ hasText: "lebenslauf_2026" });
  await expect(card).toContainText("KI setzt Platzhalter ein …");
  const id = server.finishTemplate("lebenslauf_2026", "annotation_rejected");
  pushEvent(log, { type: "template_ready", template_id: id });
  await expect(card).toContainText("Die KI-Platzhalter wurden verworfen.");
  await card.getByRole("button", { name: "Als Standard" }).click();
  await expect(card).toContainText("Standard für neue Bewerbungen");
});

test("a fill that ends while the socket is down shows up after the reconnect", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await socket(log);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  await expect(page.getByText("KI setzt Platzhalter ein …")).toBeVisible();
  await log.sockets[0]!.close();
  server.finishTemplate("lebenslauf_2026", null);
  await expect.poll(() => log.sockets.length, { timeout: 40_000 }).toBeGreaterThan(1);
  await expect(page.getByRole("listitem").filter({ hasText: "lebenslauf_2026" }).getByRole("button", { name: "Als Standard" })).toBeVisible();
});

test("a stalled fill offers delete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const old = new Date(Date.parse(NOW_ISO) - 20 * 60_000).toISOString();
  server.templates.push({ id: 30, doc_type: "CV", name: "haengt", is_admin: false, user_id: 1, status: "processing", created_at: old, updated_at: old });
  await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  const card = page.getByRole("listitem").filter({ hasText: "haengt" });
  await expect(card).toContainText("Das dauert ungewöhnlich lange.");
  await card.getByRole("button", { name: "haengt löschen" }).click();
  await page.getByRole("dialog", { name: "Vorlage löschen?" }).getByRole("button", { name: "Löschen" }).click();
  await expect(card).toHaveCount(0);
});
```

(The reconnect test relies on the realtime backoff (max 30 s) and on the refetch of active queries after a reconnect (spec 6); use `page.clock.runFor` past the first backoff step instead of the 40 s poll if the fixed clock blocks the timer, as `reconnect` tests in phase 3 do. The template fixture id that `profileRoutes` registers for the new upload comes from `createTemplate`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile/templateUpload.test.tsx`
Expected: FAIL: no upload control; `templateName` does not exist.

- [ ] **Step 3: Upload hook and state line**

`web/src/features/profile/templates/useTemplateUpload.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { MAX_TEMPLATE_HTML_LENGTH, MAX_TEMPLATE_NAME_LENGTH } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { uploadTemplate, type DocumentTemplate } from "@/api/templates";
import { DOC_TYPE_OF, type TemplateKind } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

const HTML_TYPE = "text/html";
const HTML_FILE = /\.html?$/i;

export function templateName(fileName: string, fallback: string): string {
  const name = fileName.trim().replace(HTML_FILE, "").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH);
  return name || fallback;
}

export type TemplateFileProblem = "unsupportedType" | "tooLarge";

/** D10: HTML only; the length is the server's character limit, so it is checked on the text. */
export async function readTemplateFile(file: File, fallbackName: string) {
  if (file.type !== HTML_TYPE && !HTML_FILE.test(file.name)) return { problem: "unsupportedType" as const };
  const html = await file.text();
  if (html.length > MAX_TEMPLATE_HTML_LENGTH) return { problem: "tooLarge" as const };
  return { name: templateName(file.name, fallbackName), html };
}

export function useTemplateUpload(kind: TemplateKind) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (input: { name: string; html: string }) => uploadTemplate({ docType: DOC_TYPE_OF[kind], ...input }),
    onSuccess: (created) => {
      // Shown at once with its server status; template_ready refreshes it later (D10).
      queryClient.setQueryData<DocumentTemplate[]>(queryKeys.templateList, (list) => (list ? [...list, created] : list));
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      const key = kind === "cv" ? "profile.templates.uploadedCv" : "profile.templates.uploaded";
      toast.show({ message: t(key, { name: created.name }), tone: "success" });
    },
    onError: (error) =>
      toast.show({ message: describeError(error, t, { VALIDATION_ERROR: "profile.templates.rejectedOnUpload" }), tone: "error" }),
  });
}
```

`web/src/features/profile/templates/TemplateStateLine.tsx`:

```tsx
"use client";

import { TriangleAlert } from "lucide-react";
import type { TemplateState } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";

export const TEMPLATE_STATE_TEXT: Readonly<Record<Exclude<TemplateState, "ready">, MessageKey>> = {
  processing: "profile.templates.state.processing",
  stalled: "profile.templates.state.stalled",
  rejected: "profile.templates.state.rejected",
  failed: "profile.templates.state.failed",
};

/** Static text (no spinner, spec 5); the degraded states are amber warnings with an icon (D10). */
export function TemplateStateLine({ state }: { state: TemplateState }) {
  const { t } = useI18n();
  if (state === "ready") return null;
  if (state === "processing") return <p className="meta tpl-state">{t(TEMPLATE_STATE_TEXT.processing)}</p>;
  return (
    <p className="tpl-state is-warn">
      <Icon icon={TriangleAlert} />
      <span>{t(TEMPLATE_STATE_TEXT[state])}</span>
    </p>
  );
}
```

`web/src/features/profile/templates/useTemplateOutcomes.ts`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { templateOutcome, type TemplateCard, type TemplateOutcome, type TemplateState } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useProfileAnnounce } from "../announcer";
import { cardName } from "./labels";

const OUTCOME_TEXT: Readonly<Record<TemplateOutcome, MessageKey>> = {
  ready: "profile.templates.outcome.ready",
  rejected: "profile.templates.outcome.rejected",
  failed: "profile.templates.outcome.failed",
};

/**
 * D13: announces each card that left the AI fill since this gallery last saw it. The previous
 * states live in a ref read only in the effect; the announcer is an external store, so no React
 * state is set in the effect body.
 */
export function useTemplateOutcomes(cards: readonly TemplateCard[]): void {
  const { t } = useI18n();
  const announce = useProfileAnnounce();
  const seen = useRef(new Map<string, TemplateState>());
  useEffect(() => {
    for (const card of cards) {
      const outcome = templateOutcome(seen.current.get(card.ref), card.state);
      if (outcome) announce(t(OUTCOME_TEXT[outcome], { name: cardName(card, t) }));
      seen.current.set(card.ref, card.state);
    }
  }, [cards, announce, t]);
}
```

(`cards` is a new array on every render; the effect then runs each render, which is cheap and correct (the map makes it idempotent). If the compiler lint asks for a stable dependency, key the effect on `cards.map((card) => `${card.ref}:${card.state}`).join()`.)

- [ ] **Step 4: Upload card and wiring**

`web/src/features/profile/templates/TemplateUpload.tsx`:

```tsx
"use client";

import { Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import type { TemplateKind } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { readTemplateFile, useTemplateUpload, type TemplateFileProblem } from "./useTemplateUpload";

const UPLOAD_LABEL: Readonly<Record<TemplateKind, MessageKey>> = { cv: "profile.templates.uploadCv", letter: "profile.templates.uploadLetter" };
const UPLOAD_HINT: Readonly<Record<TemplateKind, MessageKey>> = { cv: "profile.templates.uploadCvHint", letter: "profile.templates.uploadLetterHint" };
const PROBLEM_TEXT: Readonly<Record<TemplateFileProblem, MessageKey>> = {
  unsupportedType: "profile.templates.onlyHtml",
  tooLarge: "profile.templates.tooLarge",
};

export function TemplateUpload({ kind }: { kind: TemplateKind }) {
  const { t } = useI18n();
  const upload = useTemplateUpload(kind);
  const [problem, setProblem] = useState<TemplateFileProblem | null>(null);
  const inputId = `pf-template-upload-${kind}`;
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const read = await readTemplateFile(file, t("profile.templates.unnamed"));
    setProblem("problem" in read ? read.problem : null);
    if (!("problem" in read)) upload.mutate(read);
  };
  return (
    <li className="tpl tpl-upload" aria-busy={upload.isPending || undefined}>
      <label className="tpl-upload-label" htmlFor={inputId}>
        <Icon icon={Upload} />
        <span>{t(UPLOAD_LABEL[kind])}</span>
      </label>
      <input id={inputId} className="sr-only" type="file" accept=".html,.htm,text/html" aria-describedby={`${inputId}-hint`} onChange={pick} />
      <p className="meta" id={`${inputId}-hint`}>{t(UPLOAD_HINT[kind])}</p>
      <div role="alert">{problem ? <Notice tone="error" announce={false}>{t(PROBLEM_TEXT[problem])}</Notice> : null}</div>
    </li>
  );
}
```

`TemplateGallery.tsx`: call `useTemplateOutcomes(cards)` after `galleryOf`, and append `<TemplateUpload kind={kind} />` as the last child of `<ul className="gallery">`.

`TemplateCardView.tsx`: on the `<li>` add `aria-busy={card.state === "processing" || undefined}`; below the name block render `<TemplateStateLine state={card.state} />`.

`profile.css`, inside the layer:

```css
  .tpl-state {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    font-size: var(--fs-13);
    margin: 0;
  }
  .tpl-state.is-warn {
    color: var(--warn-text);
  }
  .tpl-upload-label {
    aspect-ratio: 210 / 297;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    padding: 12px;
    text-align: center;
    border: 1px dashed var(--line-control);
    border-radius: var(--r-panel);
    font-weight: 600;
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .tpl-upload:focus-within .tpl-upload-label {
    outline: 2px solid var(--focus, var(--accent));
    outline-offset: 2px;
  }
```

(Use the app's focus-ring token from `controls.css` rather than the fallback.)

i18n keys:

```ts
  "profile.templates.uploadCv": "Lebenslauf-Vorlage hochladen", // "Upload CV template"
  "profile.templates.uploadLetter": "Briefvorlage hochladen", // "Upload letter template"
  "profile.templates.uploadCvHint": "HTML. Die KI setzt Platzhalter für deine Profildaten ein; das dauert etwa eine Minute.", // "HTML. The AI inserts placeholders for your profile data; this takes about a minute."
  "profile.templates.uploadLetterHint": "HTML. Elemente mit data-slot=\"body\" erhalten den Brieftext.", // "HTML. Elements with data-slot=\"body\" receive the letter text."
  "profile.templates.unnamed": "Vorlage", // "Template"
  "profile.templates.onlyHtml": "Nur HTML-Vorlagen (.html) werden unterstützt.", // "Only HTML templates (.html) are supported."
  "profile.templates.tooLarge": "Die Vorlage ist größer als 1 MB.", // "The template is larger than 1 MB."
  "profile.templates.rejectedOnUpload": "Die Vorlage enthält ungültige Platzhalter und wurde abgelehnt.", // "The template contains invalid placeholders and was rejected."
  "profile.templates.uploaded": "„{name}“ hochgeladen.", // "“{name}” uploaded."
  "profile.templates.uploadedCv": "„{name}“ hochgeladen. Die KI setzt jetzt deine Profildaten ein.", // "“{name}” uploaded. The AI is now inserting your profile data."
  "profile.templates.state.processing": "KI setzt Platzhalter ein …", // "AI is inserting placeholders …"
  "profile.templates.state.stalled": "Das dauert ungewöhnlich lange. Lösche die Vorlage und lade sie erneut hoch.", // "This is taking unusually long. Delete the template and upload it again."
  "profile.templates.state.rejected": "Die KI-Platzhalter wurden verworfen. Die Vorlage wird ohne deine Profildaten verwendet.", // "The AI placeholders were discarded. The template is used without your profile data."
  "profile.templates.state.failed": "Die KI konnte die Vorlage nicht befüllen. Sie wird ohne deine Profildaten verwendet.", // "The AI could not fill the template. It is used without your profile data."
  "profile.templates.outcome.ready": "„{name}“ ist bereit.", // "“{name}” is ready."
  "profile.templates.outcome.rejected": "„{name}“: KI-Platzhalter verworfen.", // "“{name}”: AI placeholders discarded."
  "profile.templates.outcome.failed": "„{name}“: KI-Befüllung fehlgeschlagen.", // "“{name}”: AI fill failed."
```

`web/tests/e2e/support/profileServer.ts` additions (route `POST ${DOCUMENT_TEMPLATES_PATH}` -> `live((sent) => server.createTemplate(sent))`):

```ts
  private templateSeq = 20;

  /**
   * POST /document-templates (Task 3): name trimmed, 1-100 characters (422 name); html within the
   * limit (422 html); a user CV template starts the AI fill (status "processing").
   */
  createTemplate(sent: unknown): unknown {
    const body = sent as { doc_type?: string; name?: string; html?: string };
    const name = (body.name ?? "").trim();
    if (!name || name.length > MAX_TEMPLATE_NAME_LENGTH) return reply(HTTP_UNPROCESSABLE, { detail: [{ type: "value_error", loc: ["body", "name"], msg: "refused" }] });
    if ((body.html ?? "").length > MAX_TEMPLATE_HTML_LENGTH) return reply(HTTP_UNPROCESSABLE, { detail: [{ type: "value_error", loc: ["body", "html"], msg: "refused" }] });
    this.templateSeq += 1;
    const template: DocumentTemplateBody = { id: this.templateSeq, doc_type: body.doc_type ?? "CV", name, is_admin: false, user_id: 1,
      status: body.doc_type === "CV" ? "processing" : null, created_at: NOW_ISO, updated_at: NOW_ISO };
    this.templates.push(template);
    if (this.routes) setRoutes(this.routes, templateRoutes(this, template.id));
    return structuredClone(template);
  }

  /** What the Celery fill does at its end (Task 3); the test then pushes template_ready. */
  finishTemplate(name: string, status: string | null): number {
    const template = this.templates.find((entry) => entry.name === name);
    if (!template) throw new Error(`profile server: no template ${name}`);
    template.status = status;
    template.updated_at = NOW_ISO;
    return template.id;
  }
```

```ts
export function templateRoutes(server: ProfileServer, id: number): MockRoutes {
  return { [`DELETE ${documentTemplatePath(id)}`]: live(() => server.deleteTemplate(id)) };
}
```

(`profileRoutes` now builds the routes object, sets `server.routes = routes`, and registers `documentRoutes`/`templateRoutes` for every fixture document and template. Spread order: `AUTHENTICATED_ROUTES` first, then the server's routes, then `extra`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/profile tests/unit/realtime` and `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileTemplateLive.spec.ts tests/e2e/profileTemplates.spec.ts`
Expected: PASS.

- [ ] **Step 6: Mutation check (the live state tests must be able to fail)**

Temporarily (in the repo, reverted right after): (a) make `templateState` return `"ready"` for `"annotation_rejected"` and run `tests/unit/domain/templates.test.ts` and `pnpm test:e2e -- tests/e2e/profileTemplateLive.spec.ts`: "maps the server statuses" and "a rejected fill shows the warning" must FAIL; (b) remove `template_ready` from `applyEvent`'s handler table (or make it a no-op) and run the e2e spec: the first test must FAIL on the warning. Revert both, rerun green, and put the RED outputs in the report.

- [ ] **Step 7: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 13: E2E journeys (the phase-6 exit criterion "e2e profile green", journey "profile save (notification credentials survive)")

**Files:**
- Create: `web/tests/e2e/profileJourneys.spec.ts`
- Test: the file itself

**Interfaces:**
- Consumes: `ProfileServer`, `profileRoutes`, `E2E_SECRETS`, `E2E_NOTIFICATION_FIELDS`, `STORED_PROFILE`, `SECRET_MASK` (Tasks 5-12); `fixNow`, `pushEvent` (`support/jobFixtures.ts`); `inboxRoutes` (`support/inboxFixtures.ts`) for the onboarding check.
- Produces: three journeys over one stateful fake server (the pattern of `sourcesJourneys.spec.ts`): every refetch after a click or an event sees what the real server would answer, and each journey asserts the sent requests as well as the visible state.

- [ ] **Step 1: Write the journeys**

```ts
import type { Page } from "@playwright/test";
import { SECRET_MASK } from "../../src/api/profilePaths";
import { fixNow, pushEvent } from "./support/jobFixtures";
import type { ApiLog } from "./support/mockApi";
import { E2E_NOTIFICATION_FIELDS, E2E_SECRETS } from "./support/profileFixtures";
import { ProfileServer, profileRoutes } from "./support/profileServer";
import { expect, test } from "./support/test";

// Spec section 7: "profile save (notification credentials survive)", plus the CV and template
// paths of phase 6; per-feature assertions live in profile*.spec.ts.
const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
const PDF = { name: "Lebenslauf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nJonas Weber\n") };
const TEMPLATE = { name: "zweispaltig.html", mimeType: "text/html", buffer: Buffer.from("<html><body><h1>{{ name }}</h1></body></html>") };

test.beforeEach(async ({ page }) => fixNow(page));

const subNav = (page: Page) => page.getByRole("navigation", { name: "Profilbereiche" });

async function expectNoSecretOnScreen(page: Page) {
  const text = await page.locator("body").innerText();
  for (const value of [...Object.values(E2E_SECRETS), SECRET_MASK]) expect(text).not.toContain(value);
}

function sentKeys(log: ApiLog, key: string): string[][] {
  return log.calls.filter((call) => call.key === key).map((call) => Object.keys(call.body as object).sort());
}

test("profile save (notification credentials survive): Ziel, Lebenslauf and the default template", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile");
  await page.getByLabel("Wunschrolle").fill("Staff Engineer (Kotlin)");
  await page.getByLabel("Kenntnisse", { exact: true }).fill("Kafka");
  await page.getByLabel("Kenntnisse", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await subNav(page).getByRole("link", { name: "Lebenslauf" }).click();
  await page.getByLabel("Ausbildung").fill("M.Sc. Informatik, TU Hamburg, 2017");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await subNav(page).getByRole("link", { name: "Vorlagen" }).click();
  await page.getByRole("region", { name: "Lebenslauf" }).getByRole("listitem").filter({ hasText: "Zweispaltig" })
    .getByRole("button", { name: "Als Standard" }).click();
  await expect(page.getByText("„Zweispaltig“ ist jetzt Standard für neue Bewerbungen.")).toBeVisible();
  await page.reload();
  await expectNoSecretOnScreen(page);
  expect(sentKeys(log, "POST /settings")).toEqual([GOAL_KEYS, ["cv_data"]]);
  expect(sentKeys(log, "PATCH /settings/template")).toEqual([["cv_template"]]);
  expect(log.calls.some((call) => call.key.startsWith("POST /notification-settings"))).toBe(false);
  for (const [key, value] of Object.entries({ ...E2E_SECRETS, ...E2E_NOTIFICATION_FIELDS })) {
    expect(server.profile[key]).toBe(value);
  }
  expect([server.profile.role, server.profile.skills, server.profile.cv_template]).toEqual([
    "Staff Engineer (Kotlin)", "Java 21, Kotlin, Spring Boot, PostgreSQL, Kafka", "7",
  ]);
});

test("a first CV import fills Ziel and Lebenslauf and the inbox no longer asks for the profile", async ({ page, mockApi }) => {
  const server = new ProfileServer({ role: "", skills: "", min_salary: "", location: "", preferences: "", spoken_languages: [],
    cv_data: { experience: [], projects: [], education: "" }, cv_template: null, cover_letter_template: null });
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=lebenslauf");
  await expect(page.getByText(/Noch unvollständig: Wunschrolle, Kenntnisse/)).toBeVisible();
  await page.locator("#pf-cv-import-file").setInputFiles(PDF);
  await expect(page.getByText("Lebenslauf übernommen. Prüfe Ziel und Lebenslauf.")).toBeVisible();
  await expect(page.getByText(/Noch unvollständig: Wunschrolle/)).toHaveCount(0);
  await subNav(page).getByRole("link", { name: "Ziel" }).click();
  await expect(page.getByLabel("Wunschrolle")).toHaveValue("Backend-Entwickler");
  expect(server.setupStatus().profile_complete).toBe(true);
  expect(log.requests.filter((key) => key === "GET /setup-status").length).toBeGreaterThan(1);
});

test("template upload with live state: fill, rejected annotation, default, delete", async ({ page, mockApi }) => {
  const server = new ProfileServer();
  const log = await mockApi(profileRoutes(server));
  await page.goto("/profile?section=vorlagen");
  await expect.poll(() => log.sockets.length).toBeGreaterThan(0);
  await page.getByLabel("Lebenslauf-Vorlage hochladen").setInputFiles(TEMPLATE);
  const gallery = page.getByRole("region", { name: "Lebenslauf" });
  const card = gallery.getByRole("listitem").filter({ hasText: "zweispaltig" });
  await expect(card).toContainText("KI setzt Platzhalter ein …");
  await expect(card.getByRole("button", { name: "Als Standard" })).toHaveCount(0);
  pushEvent(log, { type: "template_ready", template_id: server.finishTemplate("zweispaltig", "annotation_rejected") });
  await expect(card).toContainText("Die KI-Platzhalter wurden verworfen.");
  await expect(page.locator(".profile [role=status].sr-only")).toHaveText("„zweispaltig“: KI-Platzhalter verworfen.");
  await card.getByRole("button", { name: "Als Standard" }).click();
  await expect(card).toContainText("Standard für neue Bewerbungen");
  await card.getByRole("button", { name: "zweispaltig löschen" }).click();
  await page.getByRole("dialog", { name: "Vorlage löschen?" }).getByRole("button", { name: "Löschen" }).click();
  await expect(gallery.getByRole("listitem").filter({ hasText: "Klassisch" })).toContainText("Standard für neue Bewerbungen");
  expect(server.profile.cv_template).toBeNull();
});
```

Notes for the implementer:
- Journey 1: the fixture template 7 ("Zweispaltig") is global, so "Als Standard" sends `cv_template: "7"`; the fixture skills string is the joined form, so adding "Kafka" yields the expected string. If `ProfileServer.settings()` keys differ from what the shell's language query needs, fix the server, not the journey.
- Journey 2: `inboxRoutes` is not needed if the assertion stays on the server's setup status; the refetch of `GET /setup-status` after the import (`useCvImport` invalidates it) is what the onboarding reads.
- Journey 3: the live region assertion uses the page's one region (`ProfileLiveStatus`).

- [ ] **Step 2: Run the journeys**

Run: `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/profileJourneys.spec.ts`
Expected: PASS (three tests, no console error, no unmocked call).

- [ ] **Step 3: Mutation check (the credentials journey must be able to fail)**

Temporarily (in the repo, reverted right after): (a) in `src/api/profile.ts` replace `z.object({...})` of `profileSchema` with `.passthrough()` and make `goalPatch` spread the whole profile (`{ ...draft, ...profile }` in `GoalSection`): the journey "profile save" must FAIL on the sent keys; (b) make `ProfileServer.save` assign every key of a fixed full profile (as the pre-B2 server did): it must FAIL on the stored secrets. Revert both, rerun green, and put the RED outputs in the report.

- [ ] **Step 4: Checkpoint**

Format, then the checkpoint. Expected: all green.

---

### Task 14: Context documentation

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`, `context/code-standards.md`

**Interfaces:**
- Consumes: the reports of Tasks 1-13 (test counts, deviations, RED outputs).
- Produces: documentation only; no code.

- [ ] **Step 1: Progress tracker**

In `context/progress-tracker.md`:
- Phase line: `**Phase:** Frontend redesign - phase 6 (Profil \`/profile\` with Ziel, Lebenslauf incl. CV import, Nachweise and Vorlagen with live AI fill) done; next is phase 7 (settings, admin, companies, global search).`
- Status-board row `**Frontend Redesign - Phase 6 backend**` ✅ (`server/core/uploads.py`, `routers/profile_documents.py`, `routers/settings.py`, `routers/templates.py`, `services/template_preview.py`, `services/template_access.py`, `workers/tasks/fill_cv_template.py`, `workers/tasks/time_limits.py`, `database/core.py`): bounded, signature-checked uploads with fixed codes and RFC 5987 download names, `downloadable` per document; profile field limits; sync, routed (`job_analysis`), validated, bounded CV import with fixed codes; `annotation_failed`, fill time limits, a processing template cannot be the default (409), delete resets the default, template names 1-100; `GET /document-templates/preview` through the generation's renderers and the sandbox (20/min); test counts from Tasks 1-4.
- Row `**Frontend Redesign - Phase 6 (profile)**` ✅ with the files (`web/src/features/profile/**`, `web/src/domain/{profile,templates}.ts`, `web/src/api/{profilePaths,profile,templates,profileDocuments,queryKeys}.ts`, `web/app/(app)/profile/page.tsx`, `web/tests/e2e/profile*.spec.ts`, `web/tests/e2e/support/{profileFixtures,profileServer}.ts`, `mockApi.ts` `respond(sent, request)`) and one sentence per defining decision (D1 URL, D2 links sub-nav, D3 per-section partial save, D6 import gating and confirmation, D7 hint from the stored profile, D8 documents, D9/D10 gallery and live state, D11 sandboxed preview, D13 one live region), plus unit and e2e counts.
- ADR (non-obvious, would be revisited): "Template live state = invalidation on `template_ready` + reconnect refetch + a 15-minute stall rule; no polling and no status in the event. Why: the server writes the state before it publishes, so a refetch is always right, and the stall rule covers a hard-killed worker, the one end without an event."
- Open questions: remove "`template_ready` consumers (phase 6)" and "Phase 6 carry: `annotation_rejected`" (both resolved by D10); add: G8 (re-score button), G9, G10, G11 as reversible drops for the user to confirm; G15 (`routers/jobs.py` download headers have the G1 flaw); the CV import still overwrites role, skills, location and salary when the CV names them (product question, see the plan's report).

- [ ] **Step 2: Architecture**

`context/architecture.md`, section 2: extend `routers/settings.py` (field limits, CV import contract and codes, 409 `template_processing`), `routers/profile_documents.py` (`core/uploads.py`, `downloadable`), `routers/templates.py` (preview endpoint, delete resets the default, name limits), `workers/tasks/fill_cv_template.py` (statuses, limits, event on every end); add the `src/features/profile/` bullet (URL `?section=`, links sub-nav with the unsaved guard, sections mounted one at a time with `useReportDirty`, `useProfileSave` in one scope with the import, `["settings","profile"]` profile-only schema, the templates prefix shared by list and preview, `ProfileLiveStatus` and the announcer store); extend the `src/domain/` bullet with `profile.ts` and `templates.ts`; extend the tests bullet with `profileServer.ts` and `respond(sent, request)`.
- section 4 invariants: the web never parses, keeps or sends a notification field or secret from `GET /settings`; template and preview HTML are shown only in `sandbox=""` frames behind the editor CSP; uploads are refused by content, not by name or declared type alone.

- [ ] **Step 3: UI context**

`context/ui-context.md`, section 0: a **Profil (`/profile`)** bullet: masthead with deck; 200 px vertical sub-nav (links, vermilion left rule on the open one), a 4-up (2x2 below 420 px) ink seg below 720 px of column width; forms max 620 px; section forms with their own inactive-until-dirty "Speichern"; chip editors with 44 px remove buttons on mobile; entry lists (read view, inline edit, "Eintrag hinzufügen"); info hint for CV gaps; Nachweise rows with icon buttons (inactive with a reason for Drive files); Vorlagen gallery (CSS thumbnails, ink outline for the default, amber state lines for rejected, failed and stalled fills, an upload card per kind), preview on the A4 sheet in a script-less frame.

- [ ] **Step 4: Code standards**

`context/code-standards.md`, Security: one bullet "**Uploads:** read with `core/uploads.py` (`read_upload` / `read_upload_sync`, at most limit + 1 bytes), check the bytes with `require_type`, refuse with the fixed codes `file_too_large` / `unsupported_type`, and serve with `content_disposition` (ASCII fallback plus `filename*`). Never echo the client's file name or declared type in an error."

- [ ] **Step 5: Checkpoint**

Run the web checkpoint and the backend suite. Expected: all green (documentation changes nothing; the checkpoint proves the final state the docs describe).

---

## Self-Review

### 1. Spec coverage

| Spec item | Task |
|---|---|
| 4.2 `/profile` in-page sub-nav | 6 (`ProfileNav`, D1, D2) |
| 4.2 Ziel: role, skills, preferences, spoken languages, location | 2 (limits), 7 (`GoalFields`, chips) |
| 4.2 Lebenslauf: upload/parse | 2 (import contract), 9 (`CvImport`) |
| 4.2 Lebenslauf: CV data | 2 (limits, entry defaults), 8 (`EntryList`, `CvForm`) |
| 4.2 Lebenslauf: completeness hint (usability #26) | 5 (`cvGaps`), 8 (`CvGapsNotice`) |
| 4.2 Nachweise: profile documents with view/download | 1 (bounded typed upload, `downloadable`, safe header), 10 |
| 4.2 Vorlagen: CV and letter templates, select default, preview | 3 (selection rules), 4 (preview), 11 |
| 4.2 Vorlagen: upload with AI fill and live state | 3 (`annotation_failed`, limits), 12 (`TemplateUpload`, state line, outcomes) |
| B2 profile and settings forms save independently | 2 (credentials test), 7/8 (one partial POST per section), 13 journey 1 |
| B3 `template_ready` | 3 (always published), 5 (keys under the prefix), 12 (live state, reconnect e2e) |
| Phase 2 carry `annotation_rejected` | 5 (`templateState`), 12 (state line, announcement), 13 journey 3 |
| 7 journey "profile save (notification credentials survive)" | 13 journey 1 |
| 4.3 #5 a11y (links with `aria-current`, 44 px, 13 px, focus, no nested interactive) | 6 (nav, CSS test), 7 (chip focus), 8 (entry focus), 10/11 (delete focus), every UI spec at 390 |
| 4.3 #7 mobile | 6 (seg, 375 px per section), 7/10/11 (44 px), screenshots at 390 |
| 5 colours (crimson errors, amber warnings, ink default outline, no new spinner) | 11 (outline), 12 (amber lines), Global Constraints |
| 6 query keys, error normaliser, states, field errors, never raw server text | 5 (keys), 6 (`SectionState`), 7-12 (`describeError` overrides, `fieldErrorsFrom`) |
| 8 phase 6 "e2e profile green" | 13 and the specs of 6-12 |
| Inventory A.9 / B.3 features (CV PDF import, Target/Resume/Application documents tabs, gallery select/preview/delete/upload, reference and certificate uploads) | 7-12; drops listed in G8-G12 |
| Inventory C.1 profile document view/download | 1, 10 |
| Inventory C.2 template polling | 12 (realtime instead) |
| Inventory C.3 #2 profile save wipes credentials | 2, 13 |

No spec requirement is without a task.

### 2. Placeholder scan

Searched for "TBD", "TODO", "implement later", "fill in", "similar to Task", "add appropriate", "handle edge cases": none. Steps with prose instead of code (Task 1 Step 4's handler split, Task 6's four frame-only section files, the FakeServer route wiring in Tasks 10-12, Task 14) name the exact functions, keys and rules and follow a fully coded sibling in the same task. Conditional instructions name the fallback (Starlette's 413 constant, pypdf slicing, `limiter.reset()`, `liveNavigation.reset`, `ModalLayer` focus order, `t()` placeholder rules, the stored-theme screenshot helper).

### 3. Type and name consistency (across tasks)

- Backend: `read_upload`, `read_upload_sync`, `require_type`, `field_error`, `PDF_TYPE`, `MAX_UPLOAD_BYTES` (Task 1) used by Tasks 1 and 2; `MAX_FILE_SIZE` (existing) and `MAX_CV_BYTES` (Task 2) are the monkeypatch targets; `ParsedCv`, `parse_cv_with_ai(cv_text, client, model)`, `extract_text_from_pdf`, `CV_MAX_TEXT_CHARS` (Task 2); `TEMPLATE_STATUS_PROCESSING` (Task 3, `services/template_access.py`) used by Tasks 3 (settings, templates); `TEMPLATE_STATUS_ANNOTATION_FAILED`, `_store_annotation` (Task 3) are the test's import and patch target; `PreviewSource`, `render_preview`, `file_template_exists` (Task 4).
- Web API (Task 5) used unchanged by Tasks 6-13: `profileQueryOptions`, `saveProfile`, `importCv`, `ProfilePatch`, `GoalFields`, `EMPTY_CV`; `documentTemplatesQueryOptions` (`queryKeys.templateList`), `fileTemplatesQueryOptions`, `templatePreviewQueryOptions`, `selectDefaultTemplate({ docType, ref })`, `uploadTemplate({ docType, name, html })`, `deleteTemplate(id)`; `uploadProfileDocument({ file, docType })`, `deleteProfileDocument`, `viewProfileDocument`, `downloadProfileDocument`; `queryKeys.profile`, `.templateList`, `.templatePreview`, `.fileTemplates`, `.profileDocumentFile`.
- Domain (Task 5): `sectionFromParam`, `profileHref`, `PROFILE_SECTIONS` (Task 6); `splitSkills`, `joinSkills`, `chipProblem`, `ChipLimits` (Task 7); `cleanCv`, `cvGaps`, `hasCvContent`, `toProfileField` (Tasks 7-9); `galleryOf`, `defaultRef`, `canBeDefault`, `templateState`, `templateOutcome`, `DOC_TYPE_OF`, `SELECTION_FIELD`, `TEMPLATE_KINDS` (Tasks 11-12).
- Frame (Task 6): `SectionProps`, `ProfileSectionFrame`, `SectionState`, `useReportDirty`, `useProfileAnnounce`, `profileHeadingId`, `SECTION_LABEL` used by Tasks 7-12; `useProfileSave`, `PROFILE_SAVE_SCOPE`, `profileFieldErrors` (Task 7) used by Tasks 8 and 9; `cardName` (Task 11) used by Task 12.
- e2e `ProfileServer` grows per task: `settings`, `setupStatus` (6) -> `save`, `saved` (7) -> `importCv`, `SCANNED_MARKER`, `IMPORTED_CV` (9) -> `uploadDocument`, `deleteDocument`, `documentRoutes`, `routes`, `maxBytes` (10) -> `selectTemplate`, `deleteTemplate`, `preview`, `hostilePreview` (11) -> `createTemplate`, `finishTemplate`, `templateRoutes` (12). Unit `profileStubs`, `PROFILE`, `STORED_SETTINGS` (6) are used by Tasks 7-12.

### 4. Real-code name check (read on 2026-10-09 in `web/src`, `web/tests` and `server/`)

Verified to exist with these exact names and shapes: `DrawerSection({ id, title, onSubmit, busy, dirty, children })` with `inactive={!dirty}` (`features/sources/drawer/DrawerSection.tsx`); `useSectionForm(server, effect?)` returning `{ draft, set, dirty, changed, commit, rebase }`; `useDirtySections(): { report, requestLeave }` and `ReportDirty`; `useSectionSave` (platform-specific; profile gets `useProfileSave` in its shape); `givenUp(query)` (`api/queryState.ts`); `useClearThenSet(key)` and `ANNOUNCE_GAP_MS` (`ui/useAnnouncement.ts`); `--z-drawer-scrim` 50, `--z-drawer` 51, `--z-dialog-scrim` 52, `--z-dialog` 53 (`theme/tokens.css`); `describeError(error, t, overrides)` with codes `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR`, `CONFLICT`, `SERVER_ERROR` (every 5xx); `fieldErrorsFrom(error, toField)`; `safeHref`; `prepareForEditing` (`features/job/documents/editDocument.ts`); `A4Preview` (children replace the PDF and hide the expand button); `useObjectUrl`, `saveFile`, `DRIVE_UNSUPPORTED`, `formatFileSize`, `viewKind`, `uploadProblem`, `UPLOAD_ACCEPT`, `MAX_UPLOAD_BYTES` (job documents); `FileContent` (not yet exported: Task 10); `AiSetupAction({ className })`; `ListLoading({ stalled })`, `ListError({ error, onRetry, announce? })`; `Button` (`busy` shows the existing spinner, `inactive`, `iconOnly`); `Seg({ options, value, onChange, label })`; `Notice({ tone, announce })`; `Masthead({ title, number, deck, actions })`; `navNumber`, `PROFILE_HREF`; `setupStatusQueryOptions` (`retry: false`); `profileDocumentsQueryOptions` (`["profile-documents"]`, used by the job page's attach list); `queryKeys.templates` (`["templates"]`, invalidated by `applyEvent` on `template_ready`); `realtimeEventSchema` `template_ready {template_id, user_id}`; e2e `mockApi`, `live`, `reply`, `setRoutes`, `AUTHENTICATED_ROUTES` (`GET /settings` with language and time zone), `pushEvent` (adds `user_id: ADMIN_USER_ID`), `fixNow`, `NOW_ISO`, `saveScreenshot`, `horizontalOverflow`, `VIEWPORTS.narrow`, `SANDBOX_PROBE`, `PLACEHOLDER_ROUTES` in `shell.spec.ts`; unit `stubRoutes`, `renderWithProviders`, `liveNavigation`, `navigationModule`. Server: `_apply_partial_update` over `model_fields_set` (B2), `_check_template_selection`, `find_usable_template`, `looks_like_template_id`, `validate_template`, `render_jinja2_template` (isolated child), `fill_template`, `list_templates`, `render_cv_html`, `render_cover_letter_html`, `get_client_and_model`, `SETUP_AI_TASK = "job_analysis"`, `OLLAMA_REQUEST_TIMEOUT_SECONDS = 600`, `limiter`, `_without_input_echo`, `make_template`, `make_profile`, `events_of_type`, `api_client` patching `routers.templates.SessionLocal`.

Found and handled while checking: `upload-cv` is `async def` around a blocking AI call and uses OpenRouter only (G4); the fill task resets a failed AI call to `None` (G5); `PATCH /settings/template` accepts a processing template (G6); profile document refusals echo the declared type and `doc_type` (G1); the download header breaks on quotes and raises outside Latin-1 (G1, and G15 for `routers/jobs.py`); `FileViewer` is bound to job documents (Task 10 reuses its exported `FileContent` instead); `mockApi` cannot read multipart bodies or queries in `respond` (G14); `Button busy` already shows a spinner (the constraint forbids only new indicators).

### 5. Review Focus

Each of the five lines names tests that exist in the owning tasks (checked against the test titles above). Input classes considered and covered by ordinary tests rather than listed: legacy `cv_data` of `{}` or entries without keys (Task 5 schema tests), an unknown template status (Task 5), a second tab changing the default (409 mapping, Task 11), a skills chip with a comma (Task 5, Task 7), 30 entries (Task 8), a Word document (no viewer, Task 10), dark mode and 390 px (every UI task's screenshots), 375 px per section (Task 6).
