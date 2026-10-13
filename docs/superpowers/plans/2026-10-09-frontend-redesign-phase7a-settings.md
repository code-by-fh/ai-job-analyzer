# Frontend Redesign Phase 7a (Einstellungen for every user) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Split:** phase 7 has 25 tasks, so it is split in two plans that each produce working software. **7a** (this file, 11 tasks: 2 backend, 9 web) builds `/settings` with the three sections every user has: **Allgemein** (language, theme, time zone, storage), **Benachrichtigungen** (channel credentials, test send, the notification template editor with preview, the per-source overview) and **Konto** (password, archive all jobs, reset). **7b** (`2026-10-09-frontend-redesign-phase7b-admin-companies-search.md`, 14 tasks) adds the admin sections (KI, Benutzer, Systemfehler), `/companies` with the admin rename and delete of a company profile, and the global search. 7b starts after 7a's Task 11.

**Goal:** Replace the `/settings` placeholder with Einstellungen: a masthead and an in-page sub-nav (vertical list on desktop, a seg row on mobile) over three sections that save on their own, honour the phase 5 contract `NOTIFICATION_SETTINGS_HREF` (`/settings?section=notifications`) and `ACCOUNT_HREF` (`/settings?section=account`), never read or render a secret, and carry the notification template editor that phase 5 moved here (G10).

**Architecture:** Two backend tasks (server only, pytest TDD) first: the notification contract (field limits, rate-limited test sends, bounded templates and a server-rendered template preview) and the account contract (a shared user-data delete that removes dependent rows, "archive all" that really archives inbox matches, a password floor, and a booleans-only storage status). On the web, wire contracts go to `web/src/api/` (`settingsPaths.ts` stays client-free for e2e fixtures), pure rules to `web/src/domain/settings.ts` and `web/src/domain/notificationChannels.ts`, and the screen to `web/src/features/settings/`. Sections reuse the phase 5/6 section-save model (`DrawerSection`, `useSectionForm`, `useDirtySections`, one partial `POST /notification-settings` per channel, B2). Secrets arrive as the mask and are parsed straight into booleans, so no secret value ever reaches React state.

**Tech Stack:** unchanged from phases 1-6 (Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3 strict, Tailwind 4.3.3, TanStack Query 5.104.1, zod 4.6.5, lucide-react 1.53.0, Vitest 5.0.3, Playwright 1.64.0; backend FastAPI, SQLAlchemy 2, pydantic 2, slowapi, pytest on in-memory SQLite). No new dependency, no migration.

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 7 row "Settings, admin, companies, global search", done when "e2e settings/admin green"; section 4.2 `/settings` row; 4.1 user menu; section 3 B2 "Profile and settings forms save independently"; section 7 journeys "profile save (notification credentials survive)", "settings channels"; 4.3 #4, #5, #7; 5; 6). Visual source of truth: `docs/prototype/clickdummy-editorial.html` (`SETTINGS_NAV`, `renderSettings`, `setGeneral`, `setNotify`, `chanFields`, `setStorage`, `setAccount`; CSS `.settings`, `.snav`, `.snav-group`, `.scontent`, `.chan`, `.chan-state`, `.chan-form`, `.radio-row`, `.danger-zone`). Domain fixes: `docs/superpowers/specs/2026-10-08-frontend-redesign-usability-review.md` (#20 "Profil/Einstellungen sub-nav: in-page vertical list on desktop, seg on mobile; Abmelden into the user menu; theme switch also under Einstellungen › Allgemein", #22 44 px targets, layout "pane max ~900px, 200px in-page sub-nav left, form max 620px"). Features that must survive: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.1 `/auth/change-password`, `/user/reset`; A.2 `DELETE /jobs`; A.5 all notification endpoints and templates; A.7 admin notification templates; A.8 storage; B.3 `/settings`, `TemplateManager`, `/account`; C.1 "Mailjet credentials", "Global email recipient", "Google Drive re-activation"; C.2 template preview; C.3 #2, #10). Carried items: phase 5 G10 (per-source template text editing moves here), phase 5 contract `NOTIFICATION_SETTINGS_HREF`, phase 3 G8 ("Alle Stellen archivieren" in Einstellungen › Konto), tracker open question "Phase 7 contract".

## Global Constraints

- **Placement:** web code in `web/`, backend code in `server/`; `frontend/` stays untouched. Backend Tasks 1-2 change only `server/`; web Tasks 3-10 change only `web/`; Task 11 changes only `context/`.
- **Base:** phase 6 is closed (its final wave green) before web Task 3 starts. Names in this plan are the real exported names of `web/src` and `server/` as of 2026-10-09. Plan code never compiled: before writing, read the real exports of every module you import; if a name drifted, adapt the call, never the behaviour (phase 3 R5, phase 4 R5).
- **One implementer at a time for web.** All web tasks share the build mirror `$QA/web`; never run two web tasks in parallel. Backend Tasks 1-2 run strictly in order (both edit `routers/settings.py`'s neighbours and `tests/conftest.py` users) and may run in parallel with web Task 3 only (Task 3 does not depend on them at runtime: every new field is optional in the schemas). Web Tasks 4-10 need Tasks 1-2 merged (their fixtures model the new contract).
- **Shared files:** re-read every shared file right before editing it (`de.ts`, `en.ts`, `queryKeys.ts`, `navigation.ts`, `notifications.ts`, `settings.ts`, `mockApi.ts`, `fixtures.ts`, `shell.spec.ts`, `globals.css`, `routers/settings.py`, `routers/auth.py`, `routers/jobs.py`, `routers/storage.py`, `database/core.py`, `workers/notifications/push.py`, `tests/factories.py`); add or change only the lines named, never replace a whole file (phase 3 preflight 26).
- **Coding standards:** functions of 20 lines or less (`max-lines-per-function`, blank lines and comments excluded), at most 3 parameters (`max-params`; pass an object instead), named exports except Next.js route files, named constants instead of magic literals, comments explain *why* and are in English, no emoji, TypeScript strict, no `any`. **Never disable a lint rule**; split into named helpers or sub-components instead. If Prettier pushes a function above 20 lines, split it. Python: type hints on new signatures, `status.*` constants instead of raw integers in new code, functions small and named, constants for codes, no bare `except:`; broad `except Exception` only where the code documents why.
- **React lint (eslint-plugin-react-hooks 7 incl. compiler rules, `--max-warnings=0`):** no `Date.now()`/`new Date()` during render (use `useNow()` from `src/lib/clock.ts`; event handlers may read the clock), no synchronous `setState` in an effect body (adopt server values with the previous-value pattern during render, phase 4 R27), no ref reads during render. An effect that must call the latest props uses `useEffectEvent`.
- **CSS:** component CSS lives in plain `.css` files inside `@layer components { ... }` (new file `src/features/settings/settings.css`, imported from `app/globals.css` after `profile.css`). No new inline `style` props. The guard test `tests/unit/theme/cssFiles.test.ts` fails on a markdown fence line in any CSS file. **Layout is CSS-driven:** a container query on `.settings` (`container: settings / inline-size`), never a viewport `@media` for the pane layout and never `useMediaQuery`.
- **Layers:** overlays use only the app `Dialog` (confirmations, the test-recipient question, the template preview). Stacking comes from the tokens `--z-dialog-scrim`, `--z-dialog` (`theme/tokens.css`); never hard-code a z-index.
- **Type size:** meaningful text (hints, channel state lines, meta) is at least 13 px (`var(--fs-13)`).
- **Colours (spec 5):** crimson (`Notice tone="error"`, `Button variant="danger"`) only for errors and destructive actions (Kanal entfernen, Trennen, Alles zurücksetzen), always with an icon and words. Amber only for warnings. Vermilion only for primary buttons, the active nav item and focus. "Eingerichtet" uses `--ok` text with a check icon, never colour alone.
- **No hard-coded UI strings:** every text through `t()`; new keys go into `src/i18n/de.ts` (before `} as const;`) and `src/i18n/en.ts` (before the closing `};`) in the same step, with identical `{placeholders}`. Key blocks in this plan show the DE value with the EN value as a trailing `//` comment; the dictionaries themselves carry no comments. Reuse existing keys instead of adding twins: `nav.settings`, `dates.save` ("Speichern"), `sources.saved` ("Gespeichert."), `guard.cancel` ("Abbrechen"), `dialog.close`, `error.retry`, `loading`, `preview.title`, `theme.*`, `language.*`, `user.logout`, `sources.channel.*` (through `CHANNEL_LABEL`), `sources.notify.testSent`, `sources.notify.testMissing`, `sources.notify.testFailed`, `unsaved.*`.
- **No raw server text:** server `detail`/`msg` text is never shown. Errors go through `describeError(error, t, overrides?)`; field errors from a 422 through `fieldErrorsFrom(error, toField)` and a fixed text per field; refusals with a fixed code through `refusalText` (`features/profile/refusals.ts`). User data (template names, email addresses, the Drive account) is shown as React text (escaped), never as HTML.
- **Secrets are write-only:** `GET /settings` answers secrets as `"__masked__"`; the web parses every secret field straight into a boolean (`secretSet`) inside the zod schema, so neither the mask nor a value is ever kept, rendered, logged or sent back. A secret input starts empty (`type="password"`, `autoComplete="new-password"`), its hint says whether a value is stored, and a save sends it only when the user typed one. Removing a channel sends `null` for its fields after a confirmation. No request body of this phase ever contains `__masked__`.
- **Untrusted HTML:** the notification template preview is shown only inside `<iframe sandbox="" srcDoc={previewDocument(html)}>` (`features/profile/templates/previewHtml.ts`: link targets removed, editor CSP prepended). Never `dangerouslySetInnerHTML`.
- **URLs:** every external `href` passes `safeHref()` (`src/domain/links.ts`); this part has none. App links use `settingsHref(section)` (Task 3), `sourcesHref({ sourceId })` and the existing constants in `features/shell/navigation.ts`. The Drive login is a full navigation built from `API_BASE_URL` (`src/config.ts`) and a fixed path, never from a server answer.
- **Unsaved changes:** every editing form reports dirtiness through one page-level `useDirtySections()` (it drives `useUnsavedChanges().setDirty`, the leave dialog for in-app links including the sub-nav, and the unload warning). Only the open section is mounted; leaving it (after "Änderungen verwerfen") drops its drafts and flags (`useReportDirty`, profile's hook, generalised in Task 4).
- **Focus:** focus never falls to `<body>`. A closed channel form returns focus to its "Ändern"/"Einrichten" button; a deleted template moves focus to the section heading (`tabIndex={-1}`); a closed dialog returns focus to its opener (existing `Dialog`).
- **Gave-up queries:** a section with no data shows its error (not the skeleton) as soon as `givenUp(query)` is true (`SectionState`, reused from `features/profile/SectionState.tsx`).
- **Queries start in parallel:** the page prefetches the notification settings, channel status, notification templates, storage status, time zone and platforms at mount (`usePrefetchQuery`); previews load only when opened.
- **States:** every section has loading (`ListLoading`), error (`ListError` with retry) and empty states (copy in the tasks).
- **Accessibility (spec 4.3 #5):** the sub-nav is a `<nav>` of links with `aria-current="page"`; visible focus rings; control borders >= 3:1 (`--line-control`); hit targets >= 44 px below 768 px; icon-only buttons have an `aria-label` that names the item; no nested interactive elements; radio choices are real `<input type="radio">` in a `<fieldset>` with `<legend>`.
- **Rate limits:** every endpoint of this part that calls an external service (the four channel tests and `test-email`) is limited server-side (Task 1); the web maps 429 through `describeError` ("Zu viele Anfragen, bitte kurz warten.").
- **E2E:** every UI task ships its own Playwright spec. The auto fixtures fail a test on any unmocked API call and any console error. Fixtures are typed with the `z.input` types of the real schemas and import runtime values only from client-free modules (`src/api/settingsPaths.ts`, `src/api/platformPaths.ts`, `src/api/profilePaths.ts`, `src/domain/settings.ts`, `src/domain/notificationChannels.ts`, `tests/e2e/support/*`); never from a module that imports `src/api/instance.ts` (type-only imports are fine). Each UI spec saves screenshots at 1440 and 390 in both `COLOR_SCHEMES` through `saveScreenshot`, with the pointer moved away first (`await page.mouse.move(0, 0)`), and checks `horizontalOverflow(page) === 0`; the frame (Task 4) is also checked at `VIEWPORTS.narrow` (375) for every section.
- **FakeServer models the real server and does not echo:** `support/settingsServer.ts` (Task 4, extended per task) answers from its own state with the real server's rules (partial `POST /notification-settings`, masked secrets on `GET /settings`, limits as 422, the channel predicates of `_channel_status`, 400 for an unconfigured test, 429 after five tests, 400 for a wrong password), and a request body is never returned as the answer.
- **Reuse, do not add a second:** `DrawerSection`, `useSectionForm`, `useDirtySections` (`features/sources/drawer/`), `SectionState`, `refusalText`, `previewDocument`, `givenUp`, `describeError`, `fieldErrorsFrom`, `useUnsavedChanges`, `Dialog`, `PanelHeader`, `PreferenceSegs`, `useLanguageSwitch`, `useTheme`, `profileTimezoneQueryOptions`, `channelStatusQueryOptions`, `notificationTemplatesQueryOptions`, `platformsQueryOptions`, `CHANNEL_LABEL`, `templatesFor`, `ListLoading`, `ListError`, `Masthead`, `EmptyState`, `Notice`, `Button`, `Seg`, `TextField`, `TextAreaField`, `SelectField`, `CheckField`, `Tag`, `useToast`, `navNumber`, `SETTINGS_NUMBER`, `live`, `reply`, `setRoutes`, `saveScreenshot`, `horizontalOverflow`. No polling.
- **No git commands, no commits.** Each task ends with a checkpoint instead.

### How to run anything (read once, applies to every command)

`$REPO/web` (on the `/mnt/c` drvfs mount) is the source of truth; edit files only there. `node_modules` cannot live on `/mnt/c`, so every install/build/test runs in the mirror `$QA/web`, which `$QA/websync.sh` refreshes from `$REPO/web` (never edit files in `$QA/web`).

```bash
QA=/tmp/claude-1000/-mnt-c-Users-fhamann-Development-claude-private-ai-job-analyzer/0de7d969-4ba0-4dee-805c-b68c0ee0c23b/scratchpad/qa
REPO=/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer
```

Every Bash tool call starts a fresh shell, so prefix commands with those two assignments. `$QA/webrun.sh` sources `$QA/env.sh`, puts Node 22 and pnpm 10.34.6 first on `PATH`, syncs, `cd`s into `$QA/web` and runs its arguments. So:

- **Run a unit test:** `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/settings.test.ts`
- **Run one e2e spec:** only through `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/settings.spec.ts` (it builds with the mock API URL first). A plain `pnpm build` bakes in the real API URL and makes every following `playwright test` fail; if you build separately, use `NEXT_PUBLIC_API_URL=http://localhost:3101/mock-api pnpm build`.
- **Format (before every checkpoint):** `"$QA"/webrun.sh pnpm exec prettier --write --ignore-path "$REPO/web/.prettierignore" "$REPO/web"`.
- **Checkpoint (every web task):** `"$QA"/webrun.sh sh -c 'pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e'` -> all five exit 0. If the combined form is blocked, run the five as separate commands; all must pass.
- **Screenshots:** copy them back with `mkdir -p "$REPO"/web/tests/e2e/__screenshots__ && cp "$QA"/web/tests/e2e/__screenshots__/*.png "$REPO"/web/tests/e2e/__screenshots__/` (the folder is gitignored).
- **Backend tests (Tasks 1-2):** `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""` (append a path or node id for a subset). The backend checkpoint is the full suite.
- **Lockfile:** this part adds no dependency.

## Review Focus

1. **Editing one channel next to stored credentials of the others.** The user has Pushover, Resend, Mailjet and SMTP set up and Google Drive connected, opens SMTP, changes only the host, saves; then opens Pushover and saves without typing a token; then saves the Ziel section of Profil. Expected: each `POST /notification-settings` carries only the changed fields of its own channel (`{smtp_host}`, then nothing is sent because nothing changed); no body contains `__masked__`, a secret or a field of another channel; every token, the Drive token and `active_storage_service` are unchanged afterwards; no secret value or the mask appears anywhere in the DOM. Test: Task 1 `test_saving_one_channel_keeps_every_other_credential`; Task 3 unit "the schema turns every secret into a boolean"; Task 7 unit "Speichern sends only the changed SMTP field", "an untouched secret is never sent"; Task 10 journey "settings channels: credentials survive" (asserts the sent bodies, the FakeServer's stored secrets and `page.content()` without the mask or a secret).
2. **Hostile or odd input in channel fields and templates.** A from-address `a@b` without a dot, a 300-character address, port `0`, `70000` or `587a`, a 10,000-character API key, a template named only spaces, a 200,000-character template, a template with `<script>` and `onerror=`. Expected: the web refuses before sending with a fixed text on the field; the server refuses the same with 422 on the field without echoing the input; a hostile template previews only inside the script-less sandbox and nothing in the page changes. Test: Task 1 `test_notification_fields_are_bounded_without_echo`, `test_template_name_and_content_are_bounded`; Task 3 unit `channelErrors`; Task 8 unit "the preview frame has an empty sandbox", e2e "a script in a template preview never runs".
3. **Test sends that cost money or hammer a provider.** The user clicks "Testen" six times within a minute, or tests a channel whose credentials are incomplete, or tests an email channel without any recipient. Expected: the server answers 429 from the sixth call on and the web says "Zu viele Anfragen, bitte kurz warten."; an incomplete channel answers 400 and the web says "Für {channel} fehlen Zugangsdaten oder Empfänger."; the button is busy while a test runs, and a dirty form tests nothing ("Erst speichern"). Test: Task 1 `test_channel_tests_are_rate_limited`; Task 7 unit "maps 400 and 429 to their sentences", "Testen waits while the form is dirty".
4. **Destructive account actions.** The user clicks "Alle Stellen archivieren" with favourites, kept matches and applications; clicks "Alles zurücksetzen" with a wrong password; the account owns jobs with history, documents, source runs, proofs and own templates. Expected: archive-all asks first, archives the inbox matches (`OPEN`, not favourites, not applications) with reason `USER`, never touches `SEEN` placeholders and says how many; a wrong password is a field error and deletes nothing; a correct reset removes every owned row without a foreign-key error (also on PostgreSQL) and lands on `/inbox` in onboarding. Test: Task 2 `test_archive_all_archives_open_matches_and_keeps_applications`, `test_archive_all_never_touches_seen_placeholders`, `test_reset_removes_dependent_rows_first`, `test_reset_with_a_wrong_password_deletes_nothing`; Task 9 unit and e2e.
5. **Google Drive connect round trip.** The access cookie expired while the page was open; Drive is not configured on the server; the OAuth callback returns `?tab=storage&success=google_connected` or `?error=google_auth_failed`. Expected: "Mit Google Drive verbinden" first refreshes the session through the API client and only then navigates, so the API never answers the browser tab with a raw 401 or 500 JSON; without server configuration the Drive option is disabled with a reason; the callback shows one notice in Allgemein and the parameters leave the URL (`router.replace`). Test: Task 2 `test_storage_status_reports_availability_without_secrets`; Task 6 unit "connect refreshes before navigating", "the callback parameters show one notice and are removed", e2e "Drive not configured".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | URL state | `/settings?section=notifications|account`; the default Allgemein (`general`) has no parameter. The values are English because the phase 3/5 contracts already fixed them (`AI_SETTINGS_HREF = ?section=ai`, `NOTIFICATION_SETTINGS_HREF = ?section=notifications`, `ACCOUNT_HREF = ?section=account`). An unknown value shows Allgemein and is not rewritten. One builder `settingsHref(section)` and one parser `settingsSectionFromParam(value)` in `domain/settings.ts`; a unit test pins `settingsHref("notifications") === NOTIFICATION_SETTINGS_HREF` and `settingsHref("account") === ACCOUNT_HREF`. Sub-nav links push (Back walks sections). |
| D2 | Sub-nav | Usability #20, prototype `.snav`: `<nav aria-label="Einstellungsbereiche">` with links Allgemein, Benachrichtigungen, Konto, `aria-current="page"` on the open one; desktop a 200 px vertical list left of the pane (pane max 900 px, forms max 620 px); below a 720 px wide `.settings` container one seg row (3 columns), links >= 44 px. 7b adds the "Administration" group. Only the open section is rendered. The layout rules copy `profile.css`'s values into `settings.css` (own container name `settings`) instead of renaming profile classes (surgical). |
| D3 | Allgemein | Usability #20: **Sprache** and **Darstellung** reuse the shell's `PreferenceSegs` (same segs as the mobile "Mehr" sheet; they apply at once, like the user menu), with the hint "Gilt für die Oberfläche und für Texte, die die KI schreibt." (`POST /language-preference` sets the AI output language). **Zeitzone**: a `SelectField` of `Intl.supportedValuesOf("timeZone")` (the stored zone added if missing), saved at once on change (`POST /timezone-preference`) with the toast "Zeitzone gespeichert."; hint "Gilt für die Zeitpläne der Quellen." **Speicherort** (Task 6). Allgemein has no "Speichern": every control here applies at once, like in the user menu (no draft to lose). |
| D4 | Speicherort | Prototype `setStorage`: a `<fieldset>` "Speicherort" with two radios, "Datenbank" ("Alles bleibt auf deinem Server.") and "Google Drive" ("Dateien liegen in deinem Google Drive."). The state comes from `GET /storage/status` (Task 2: `available`, `connected`, `active`, `email`). Drive not `available`: its radio is disabled with "Google Drive ist auf diesem Server nicht eingerichtet." Not `connected`: under the Drive radio a button "Mit Google Drive verbinden" (it first refetches `/storage/status` through the API client so an expired access cookie is refreshed, then `window.location.assign(API_BASE_URL + "/storage/google/login")`). `connected`: "Verbunden als {email}" plus "Trennen" (danger, confirmation `Dialog`: "Neue Dateien werden danach in der Datenbank gespeichert. Bereits in Drive gespeicherte Dateien bleiben dort."). Choosing a radio calls `POST /storage/toggle` at once (Drive only when connected). The OAuth callback lands on `/settings?tab=storage&success=google_connected` or `/settings?error=google_auth_failed` (backend unchanged): Allgemein shows "Google Drive ist verbunden." (info) or "Google Drive konnte nicht verbunden werden." (error) once and `router.replace`s to `/settings`. The old setup guide with the hard-coded port 8002 is dropped (server configuration, not user settings). |
| D5 | Benachrichtigungen: channels | Prototype `setNotify`/`.chan`: one row per channel (Pushover, Resend, Mailjet, SMTP; Gmail does not exist in the backend, so 4 not 5). The row shows the name, a state line "Eingerichtet · {detail}" (detail: Resend/Mailjet the sender address, SMTP the host, Pushover none) or "Nicht eingerichtet", from `GET /notification-settings/channels` (the same booleans the source drawer uses, so both agree), and buttons "Testen" (configured only), "Ändern" / "Einrichten". "Ändern" opens an inline `DrawerSection` form below the row (one open at a time; opening another while dirty asks through the unsaved guard): Pushover: User Key, API-Token (secret); Resend: API-Schlüssel (secret), Absender; Mailjet: API-Schlüssel (secret), Secret Key (secret), Absender; SMTP: Server, Port (default 587), Benutzer, Passwort (secret), Absender (optional). Secret inputs start empty; hint "Gespeichert. Leer lassen, um ihn zu behalten." when stored, else "Noch nicht gespeichert." "Speichern" sends only changed plain fields and typed secrets (one partial `POST /notification-settings`, B2); a channel that is not configured yet needs every field its server predicate checks (required on save). A configured channel's form has "Kanal entfernen" (danger, confirmation: "Die Zugangsdaten für {channel} werden gelöscht. Quellen, die über {channel} benachrichtigen, senden dann nichts mehr.") which sends `null` for every field of the channel. Saves and removals invalidate the notification settings and `["settings","channels"]` (the drawer reads it). |
| D6 | Test send | "Testen" sends the stored state. While the channel's form is dirty it is inactive with "Erst speichern" (phase 5 D7 rule). Pushover sends at once. Email channels open a `Dialog` "Test-E-Mail senden" with "Empfänger" prefilled with the stored "Standard-Empfänger" (empty allowed when one is stored: the server falls back to it). Outcomes reuse the drawer's sentences: success "Test über {channel} gesendet.", 400 "Für {channel} fehlen Zugangsdaten oder Empfänger.", 429 `describeError`, else "Senden über {channel} hat nicht geklappt.". |
| D7 | Standard-Empfänger | `email_global_recipient` (inventory C.1: not editable today) gets its own small form under the channels: "Standard-Empfänger" (email), hint "Für Test-E-Mails ohne eigenen Empfänger." Empty saves `null`. |
| D8 | Vorlagen (G10) | Below the channels, "Vorlagen": two lists, "Pushover" and "E-Mail" (types `RESEND`/`MAILJET`/`SMTP` shown together, like the drawer's `CHANNEL_TEMPLATE_TYPES`), each row the name, a tag "Für alle" for admin templates, buttons "Bearbeiten" (own templates; admins also global ones) and "Löschen" (confirmation). "Neue Vorlage" opens the editor: Name (1-100), Art (seg Pushover / E-Mail; E-Mail is created as `RESEND`, as the old UI did, because the server refuses `SMTP` templates), Text (textarea, 100,000), a variables reference (Pushover: `$title $company $match_score $reasoning $url`; E-Mail: `{{#jobs}} … {{/jobs}}` with those per job, outside `$userName $jobCount $platform_name $jobs_html`), "Vorschau" (server render with a sample job, Task 1, in the sandboxed frame; Pushover as plain text) and "Speichern". Admins get a check "Für alle Benutzer" when creating (admin endpoints). The source drawer stores a **copy** of the text (phase 5 D7); the editor says so: "Quellen behalten ihre Kopie. Wähle die Vorlage in der Quelle erneut, damit sie den geänderten Text verwendet." (product question Q1 in the hand-off). |
| D9 | Pro Quelle | Prototype "Abweichungen pro Quelle": a short list of the sources with notifications on ("{name}: Pushover, SMTP") linking to each source drawer (`sourcesHref({ sourceId })`), or "Keine Quelle benachrichtigt." From the cached `GET /platforms`. |
| D10 | Konto | Prototype `setAccount` within the inventory's real features: **Passwort ändern** (Aktuelles, Neues, Wiederholen; >= 8 and <= 128 characters, both mirrored server-side by Task 2; 400 maps to "Das aktuelle Passwort stimmt nicht." on the first field; success toast "Passwort geändert." and the form clears). **Alle Stellen archivieren** (phase 3 G8): checks "Favoriten behalten" and "Bewerbungen behalten" (both on), confirmation, `DELETE /jobs?keep_favorites=&keep_applications=`, toast "{count} Stellen archiviert." and the jobs root and counts invalidated. **Profil zurücksetzen** (`DELETE /settings`, confirmation: "Ziel und Lebenslauf werden geleert. Benachrichtigungen, Vorlagen und Nachweise bleiben."). **Alles zurücksetzen** in a "Gefahrenzone" (danger, `Dialog` with the password; "Löscht deine Stellen, Bewerbungen, Quellen, dein Profil, Nachweise und eigene Vorlagen. Das Konto selbst bleibt."): success does a full navigation to `/inbox` (the cache holds the old account's data, like the logout ADR). The prototype's "Daten exportieren" and "Konto löschen" are dropped (no backend; an account is deleted by an admin in 7b). |
| D11 | Abmelden | Already in the user menu since phase 1 (usability #20 satisfied); the mobile "Mehr" sheet keeps its button because mobile has no user menu. Nothing changes. |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | `NotificationSettingsData` has no limits (any length, any port, any text as an address) | **Backend Task 1:** addresses <= 254 and shaped `x@y.z`, credentials <= 500, host <= 253, port 1-65535; 422 on the field without input echo (existing `_without_input_echo` handler). |
| G2 | The four channel tests and `test-email` call external services without a rate limit | **Backend Task 1:** `5/minute` per IP each (`NOTIFICATION_TEST_RATE`). |
| G3 | Notification template name and content are unbounded; there is no server preview (the old UI injected email HTML with `dangerouslySetInnerHTML` and substituted variables itself) | **Backend Task 1:** name trimmed 1-100, content 1-100,000; `POST /notification-templates/preview {type, content}` renders with a fixed sample job through the same functions the senders use (`render_email_html`, new `render_push_message`), sends nothing, `30/minute`. |
| G4 | `DELETE /jobs` with `keep_applications=true` protects `OPEN` (it is in `APPLICATION_STATUSES`), so "archive all" with the default options archives nothing in the inbox; it also archives `SEEN` placeholders | **Backend Task 2:** `keep_applications` protects every status after `OPEN` (`DRAFTED, GENERATING, FAILED, APPLIED, INTERVIEW, OFFER, ACCEPTED, REJECTED`); `SEEN` is never touched. `APPLICATION_STATUSES` itself is unchanged (other callers). |
| G5 | `DELETE /user/reset` deletes jobs and platforms without their history, document and run rows (foreign-key error on PostgreSQL, tracker R-17) and leaves proofs and own templates | **Backend Task 2:** new `services/user_data.py` `delete_user_content` removes history and documents of the user's jobs, the jobs, runs and platforms, proofs, own document and notification templates and the profile, in that order; `reset_user_data` uses it (7b's admin user delete reuses it). |
| G6 | `POST /auth/change-password` accepts any new password (also empty) | **Backend Task 2:** 8-128 characters (422 on `new_password`). Token-version bump on password change stays deferred (spec section 3). |
| G7 | The web cannot know whether Google Drive is configured on the server; `GET /storage/google/login` answers a raw 500 JSON into the browser tab when it is not | **Backend Task 2:** `GET /storage/status` -> `{available, connected, active, email}` (booleans and the user's own Drive address only). |
| G8 | The OAuth callback redirects to `/settings?tab=storage&success=...` | **No backend change:** the web reads `success`/`error` on `/settings` whatever the section and removes them (D4). |
| G9 | Notification templates of type `SMTP` are refused (spec section 3 "out of scope") | **Kept:** E-Mail templates are created as `RESEND`; every email channel offers every email type (phase 5 `CHANNEL_TEMPLATE_TYPES`). |
| G10 | Old settings had a "Matching threshold" field | **Not here:** it lives in Eingang › Unter Schwellwert since phase 3 (spec 4.3 #2). |
| G11 | `GET /settings` returns the whole profile with masked secrets; four web queries already read it with narrow schemas | `notificationSettingsQueryOptions()` reads it with a notification-only schema under `["settings","notifications"]` that turns secrets into booleans; accepted as a fifth cached reader (G13 of phase 6). |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `database/core.py` | limits on `NotificationSettingsData`, bounded `NotificationTemplateCreate`/`Update`, `NotificationPreviewRequest` (Task 1) |
| `workers/notifications/push.py` | `render_push_message` extracted (Task 1) |
| `routers/settings.py` | rate-limited tests, template preview endpoint (Task 1) |
| `services/user_data.py` (new) | `delete_user_content`, `delete_user` (Task 2) |
| `routers/auth.py` | reset through `delete_user_content`; password bounds (Task 2) |
| `routers/jobs.py` | archive-all scope (Task 2) |
| `routers/storage.py` | `GET /storage/status` (Task 2) |
| `tests/test_notification_settings_contract.py`, `tests/test_account_contract.py` (new) | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/api/settingsPaths.ts` | client-free paths, limits, channel fields, callback params (Task 3) |
| `src/api/notificationSettings.ts` | settings schema with secret booleans, partial save, test send (Task 3) |
| `src/api/account.ts` | password, archive all, profile reset, factory reset (Task 3) |
| `src/domain/settings.ts` | sections and URL, time zones, password rules, Drive callback (Task 3) |
| `src/domain/notificationChannels.ts` | channel drafts, patches, checks, summary (Task 3) |
| `src/features/settings/SettingsPage.tsx`, `SettingsNav.tsx`, `SettingsSectionFrame.tsx`, `useSettingsSection.ts`, `labels.ts`, `settings.css` | frame (Task 4) |
| `src/features/settings/general/GeneralSection.tsx`, `TimeZoneField.tsx` | Allgemein (Task 5) |
| `src/features/settings/general/StorageSettings.tsx`, `DisconnectDriveDialog.tsx`, `useDriveCallback.ts`, `useStorageActions.ts` | Speicherort (Task 6) |
| `src/features/settings/notifications/NotificationsSection.tsx`, `ChannelList.tsx`, `ChannelRow.tsx`, `ChannelForm.tsx`, `ChannelFields.tsx`, `ChannelTest.tsx`, `RemoveChannelDialog.tsx`, `RecipientForm.tsx`, `SourceOverview.tsx`, `useChannelSave.ts` | channels (Task 7) |
| `src/features/settings/notifications/templates/TemplateLibrary.tsx`, `TemplateEditor.tsx`, `TemplatePreviewDialog.tsx`, `DeleteNotificationTemplateDialog.tsx`, `useTemplateEditor.ts`, `templateDraft.ts` | Vorlagen (Task 8) |
| `src/features/settings/account/AccountSection.tsx`, `PasswordForm.tsx`, `ArchiveAll.tsx`, `ResetProfile.tsx`, `FactoryReset.tsx` | Konto (Task 9) |
| `tests/unit/api/settingsApi.test.ts`, `tests/unit/domain/settings.test.ts`, `tests/unit/domain/notificationChannels.test.ts`, `tests/unit/features/settings/*.test.tsx`, `tests/unit/support/settingsRoutes.ts` | unit tests |
| `tests/e2e/support/settingsFixtures.ts`, `tests/e2e/support/settingsServer.ts`, `tests/e2e/settings*.spec.ts` | fixtures, fake server, specs |

Web, modified: `app/(app)/settings/page.tsx`, `app/globals.css`, `src/api/notifications.ts`, `src/api/settings.ts`, `src/api/queryKeys.ts`, `src/features/shell/navigation.ts` (re-export `SETTINGS_HREF` from the domain), `src/features/profile/useReportDirty.ts` (section type widened to `string`), `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/e2e/shell.spec.ts` (drop `/settings` from the placeholder routes), `context/*` (Task 11).

Task order: backend 1 -> 2 (strict); web Task 3 may run beside backend Tasks 1-2; web Tasks 4 -> 10 strictly in order after Task 2; Task 11 last.

---

### Task 1: Backend: notification contract (field limits, rate-limited tests, bounded templates, server preview)

**Files:**
- Modify: `server/database/core.py` (`NotificationSettingsData` ~line 356, `NotificationTemplateCreate`/`Update` ~line 472)
- Modify: `server/workers/notifications/push.py` (extract `render_push_message`)
- Modify: `server/routers/settings.py` (test endpoints ~lines 639-753, new preview endpoint after `list_notification_templates`)
- Modify: `server/tests/test_settings_router.py` (module-level `pytestmark` for fresh rate limits)
- Create: `server/tests/test_notification_settings_contract.py`

**Interfaces:**
- Consumes: `_apply_partial_update`, `_FakeJob`, `_make_fake_platform`, `render_email_html` (`workers/notifications/templates.py`), `limiter` (`routers/deps.py`), fixtures `api_client`, `seed`, `session_factory`, `fresh_rate_limits` (`tests/conftest.py`), `make_profile` (`tests/factories.py`).
- Produces (web Task 3 mirrors them in `settingsPaths.ts`):
  - `MAX_EMAIL_LENGTH = 254`, `MAX_CREDENTIAL_LENGTH = 500`, `MAX_HOST_LENGTH = 253`, `MIN_PORT = 1`, `MAX_PORT = 65535`, `MAX_NOTIFICATION_TEMPLATE_NAME_LENGTH = 100`, `MAX_NOTIFICATION_TEMPLATE_LENGTH = 100_000` in `database/core.py`.
  - `POST /notification-templates/preview` body `{type: "PUSHOVER"|"RESEND"|"MAILJET"|"SMTP", content: str}` -> `{html: bool, body: str}`; 422 on a field; 429 after 30/min.
  - `POST /notification-settings/test-{pushover,resend,mailjet,smtp}` and `/test-email`: unchanged answers, plus 429 after 5/min.
  - `render_push_message(job, template: Optional[str]) -> str` in `workers/notifications/push.py`.

- [ ] **Step 1: Write the failing tests**

```python
# server/tests/test_notification_settings_contract.py
"""Notification contract: bounded fields, rate-limited tests, bounded templates, a preview that sends nothing."""

import pytest

from database.core import UserProfile
from tests.factories import TEST_USER_ID, make_profile

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")

STORED = {
    "pushover_user_key": "push-user", "pushover_api_token": "PUSH_SECRET",
    "resend_api_key": "RESEND_SECRET", "resend_from_email": "jobs@example.com",
    "mailjet_api_key": "MJ_KEY", "mailjet_secret_key": "MJ_SECRET", "mailjet_from_email": "mj@example.com",
    "smtp_host": "smtp.example.com", "smtp_user": "smtp-user", "smtp_password": "SMTP_SECRET",
    "google_drive_refresh_token": "DRIVE_SECRET", "active_storage_service": "GOOGLE_DRIVE",
}
TEST_RATE_LIMIT = 5
LONG_ADDRESS = "a" * 250 + "@example.com"
HOSTILE = "<script>alert(1)</script>"


@pytest.fixture()
def stored(seed):
    seed(make_profile(**STORED))


def _stored_profile(session_factory) -> UserProfile:
    # The profile's primary key is its own id, not the user id, so it is looked up by owner.
    with session_factory() as db:
        return db.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).one()


def test_saving_one_channel_keeps_every_other_credential(api_client, stored, session_factory):
    response = api_client.post("/notification-settings", json={"smtp_host": "mail.example.org"})
    assert response.status_code == 200
    profile = _stored_profile(session_factory)
    assert profile.smtp_host == "mail.example.org"
    for field, value in STORED.items():
        if field != "smtp_host":
            assert getattr(profile, field) == value


@pytest.mark.parametrize("body,field", [
    ({"resend_from_email": "a@b"}, "resend_from_email"),
    ({"smtp_from_email": LONG_ADDRESS}, "smtp_from_email"),
    ({"email_global_recipient": HOSTILE}, "email_global_recipient"),
    ({"smtp_port": 0}, "smtp_port"),
    ({"smtp_port": 70000}, "smtp_port"),
    ({"resend_api_key": "k" * 501}, "resend_api_key"),
    ({"smtp_host": "h" * 254}, "smtp_host"),
])
def test_notification_fields_are_bounded_without_echo(api_client, stored, body, field):
    response = api_client.post("/notification-settings", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert HOSTILE not in response.text and "k" * 501 not in response.text


def test_a_cleared_channel_field_is_stored_as_null(api_client, stored, session_factory):
    api_client.post("/notification-settings", json={"pushover_user_key": None, "pushover_api_token": None})
    profile = _stored_profile(session_factory)
    assert profile.pushover_user_key is None and profile.pushover_api_token is None
    assert profile.resend_api_key == "RESEND_SECRET"


def test_channel_tests_are_rate_limited(api_client, stored, monkeypatch):
    monkeypatch.setattr("routers.settings._send_via_pushover", lambda *args, **kwargs: True)
    answers = [api_client.post("/notification-settings/test-pushover").status_code for _ in range(TEST_RATE_LIMIT + 1)]
    assert answers[:TEST_RATE_LIMIT] == [200] * TEST_RATE_LIMIT
    assert answers[TEST_RATE_LIMIT] == 429


@pytest.mark.parametrize("body,field", [
    ({"name": "   ", "type": "PUSHOVER", "content": "x"}, "name"),
    ({"name": "n" * 101, "type": "PUSHOVER", "content": "x"}, "name"),
    ({"name": "Kurz", "type": "PUSHOVER", "content": ""}, "content"),
    ({"name": "Kurz", "type": "PUSHOVER", "content": "c" * 100_001}, "content"),
])
def test_template_name_and_content_are_bounded(api_client, body, field):
    response = api_client.post("/notification-templates", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


def test_template_name_is_trimmed(api_client):
    response = api_client.post("/notification-templates", json={"name": "  Kurz  ", "type": "PUSHOVER", "content": "x"})
    assert response.json()["name"] == "Kurz"


def _no_send(*_args, **_kwargs):
    raise AssertionError("a preview must not send")


def test_email_preview_renders_the_job_loop_and_sends_nothing(api_client, monkeypatch):
    monkeypatch.setattr("routers.settings._send_via_resend_batch", _no_send)
    content = "<p>Hi $userName</p>{{#jobs}}<b>$title</b>{{/jobs}}"
    response = api_client.post("/notification-templates/preview", json={"type": "RESEND", "content": content})
    assert response.status_code == 200
    body = response.json()
    assert body["html"] is True
    assert "<b>Senior Software Engineer</b>" in body["body"] and "{{#jobs}}" not in body["body"]


def test_push_preview_is_text_with_the_variables_filled(api_client):
    response = api_client.post("/notification-templates/preview", json={"type": "PUSHOVER", "content": "$company: $match_score"})
    assert response.json() == {"html": False, "body": "Acme Corp: 87"}


def test_preview_refuses_an_unknown_type(api_client):
    response = api_client.post("/notification-templates/preview", json={"type": "FAX", "content": "x"})
    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_notification_settings_contract.py`
Expected: FAIL (`test_notification_fields_are_bounded_without_echo` answers 200, the rate-limit test never gets 429, the preview answers 404/405).

- [ ] **Step 3: Bound the models** (`database/core.py`; `StringConstraints` and `Annotated` are already imported for `TemplateName`)

```python
MAX_EMAIL_LENGTH = 254
MAX_CREDENTIAL_LENGTH = 500
MAX_HOST_LENGTH = 253
MIN_PORT = 1
MAX_PORT = 65535
# Shape only (something@host.tld): delivery is what proves an address, the check keeps junk out.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
EmailAddress = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_EMAIL_LENGTH, pattern=EMAIL_PATTERN)]
Credential = Annotated[str, StringConstraints(max_length=MAX_CREDENTIAL_LENGTH)]
HostName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_HOST_LENGTH)]
Port = Annotated[int, Field(ge=MIN_PORT, le=MAX_PORT)]


class NotificationSettingsData(BaseModel):
    """Partial update of the channel credentials (B2): only the keys sent are written; null clears."""

    pushover_user_key: Optional[Credential] = None
    pushover_api_token: Optional[Credential] = None
    resend_api_key: Optional[Credential] = None
    resend_from_email: Optional[EmailAddress] = None
    mailjet_api_key: Optional[Credential] = None
    mailjet_secret_key: Optional[Credential] = None
    mailjet_from_email: Optional[EmailAddress] = None
    smtp_host: Optional[HostName] = None
    smtp_port: Optional[Port] = None
    smtp_user: Optional[Credential] = None
    smtp_password: Optional[Credential] = None
    smtp_from_email: Optional[EmailAddress] = None
    email_global_recipient: Optional[EmailAddress] = None
```

and, replacing the two template request models:

```python
MAX_NOTIFICATION_TEMPLATE_NAME_LENGTH = 100
# A digest template is HTML; 100,000 characters is far above any real one and keeps a row small.
MAX_NOTIFICATION_TEMPLATE_LENGTH = 100_000
NotificationTemplateName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NOTIFICATION_TEMPLATE_NAME_LENGTH)
]
NotificationTemplateText = Annotated[str, StringConstraints(min_length=1, max_length=MAX_NOTIFICATION_TEMPLATE_LENGTH)]
NOTIFICATION_CHANNEL_TYPES = ("PUSHOVER", "RESEND", "MAILJET", "SMTP")


class NotificationTemplateCreate(BaseModel):
    name: NotificationTemplateName
    type: str  # checked by the routers (SMTP stays refused, spec section 3)
    content: NotificationTemplateText


class NotificationTemplateUpdate(BaseModel):
    name: Optional[NotificationTemplateName] = None
    content: Optional[NotificationTemplateText] = None


class NotificationPreviewRequest(BaseModel):
    type: Literal["PUSHOVER", "RESEND", "MAILJET", "SMTP"]
    # Empty previews the built-in default text, as a source without a template would send.
    content: str = Field("", max_length=MAX_NOTIFICATION_TEMPLATE_LENGTH)
```

(Add `Literal` to the `typing` import if it is missing.)

- [ ] **Step 4: Extract the push rendering** (`workers/notifications/push.py`), so the preview and the sender share one rule:

```python
def render_push_message(job, template: Optional[str]) -> str:
    """The Pushover text for *job*: the template with its variables filled, or the built-in line."""
    if not template:
        return f"{job.company} - Score: {int(job.match_score)}%\n\n{(job.reasoning or '')[:100]}..."
    score = str(int(job.match_score)) if job.match_score else "0"
    return (
        template.replace("$title", job.title or "")
        .replace("$company", job.company or "")
        .replace("$match_score", score)
        .replace("$reasoning", job.reasoning or "")
        .replace("$url", job.url or "")
    )
```

and in `_send_via_pushover` replace the `if template: ... else: ...` block by `message = render_push_message(job, template)` (add `from typing import Optional`). Behaviour is unchanged: the existing worker tests stay green.

- [ ] **Step 5: Limit the tests and add the preview** (`routers/settings.py`). Each test endpoint gets `request: Request` as its first parameter (slowapi needs it) and the decorator below `@router.post(...)`:

```python
# Each call sends a real message through a paid or rate-limited provider.
NOTIFICATION_TEST_RATE = "5/minute"
NOTIFICATION_PREVIEW_RATE = "30/minute"
PREVIEW_USER_NAME_FALLBACK = "Test"
PREVIEW_PLATFORM_NAME = "Test"
EMAIL_TEMPLATE_TYPES = ("RESEND", "MAILJET", "SMTP")
```

```python
@router.post("/notification-settings/test-pushover")
@limiter.limit(NOTIFICATION_TEST_RATE)
def test_pushover_settings(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ...  # body unchanged
```

(same for `test-resend`, `test-mailjet`, `test-smtp`, `test-email`: add `request: Request` first and the decorator; the existing `body: TestNotificationBody` parameter keeps its name.)

```python
@router.post("/notification-templates/preview")
@limiter.limit(NOTIFICATION_PREVIEW_RATE)
def preview_notification_template(
    request: Request,
    body: NotificationPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """The template rendered with a fixed sample job by the senders' own functions; nothing is sent."""
    if body.type in EMAIL_TEMPLATE_TYPES:
        html = render_email_html(
            [_FakeJob()], body.content,
            userName=current_user.username or PREVIEW_USER_NAME_FALLBACK, platform_name=PREVIEW_PLATFORM_NAME,
        )
        return {"html": True, "body": html}
    return {"html": False, "body": render_push_message(_FakeJob(), body.content)}
```

Imports: `NotificationPreviewRequest` from `database.core`, `render_email_html` from `workers.notifications.templates`, `render_push_message` from `workers.notifications.push`. Declare the preview route **before** `@router.put("/notification-templates/{template_id}")` for readability (methods differ, so order does not matter for matching).

- [ ] **Step 6: Keep the old settings tests independent of the limiter.** At the top of `server/tests/test_settings_router.py`, after the imports: `pytestmark = pytest.mark.usefixtures("fresh_rate_limits")`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: PASS, the full suite (including `tests/test_settings_router.py` and the worker notification tests).

- [ ] **Step 8: Checkpoint.** Full backend suite green. Report the new constants for Task 3.

---

### Task 2: Backend: account contract (user-data delete, archive-all scope, password floor, storage status)

**Files:**
- Create: `server/services/user_data.py`
- Modify: `server/routers/auth.py` (`ChangePasswordRequest` ~line 39, `reset_user_data` ~line 230)
- Modify: `server/routers/jobs.py` (`delete_all_jobs` ~line 778)
- Modify: `server/routers/storage.py` (new `GET /status`)
- Create: `server/tests/test_account_contract.py`

**Interfaces:**
- Consumes: models of `database/core.py`, `ARCHIVE_BY_USER_VALUES`, `STATUS_OPEN`, `STATUS_SEEN` (`core/job_status.py`), `get_password_hash` (`core/auth.py`), fixtures `api_client`, `seed`, `session_factory`, `fresh_rate_limits`; factories `make_job`, `make_platform`, `make_profile`, `make_profile_document`, `make_template`.
- Produces:
  - `delete_user_content(db: Session, user_id: int) -> dict` with keys `jobs_deleted`, `platforms_deleted`, `profile_deleted` (no commit); `delete_user(db: Session, user_id: int) -> None` (content plus the user row, no commit). 7b Task 2 uses `delete_user`.
  - `MIN_PASSWORD_LENGTH = 8`, `MAX_PASSWORD_LENGTH = 128` in `routers/auth.py` (7b Task 2 reuses them for new users).
  - `GET /storage/status` -> `{available: bool, connected: bool, active: "NONE"|"GOOGLE_DRIVE", email: str|null}`.
  - `DELETE /jobs?keep_favorites=&keep_applications=` -> `{status: "archived", count}`; protects statuses after `OPEN`; never `SEEN`.

- [ ] **Step 1: Write the failing tests**

```python
# server/tests/test_account_contract.py
"""Account: archive-all scope, a reset without foreign-key errors, the password floor, storage status."""

from datetime import datetime, timezone

import pytest

from core.auth import get_password_hash
from database.core import (
    DocumentTemplate, JobDocument, JobEntry, JobPlatform, JobStatusHistory, NotificationTemplate,
    PlatformRun, ProfileDocument, User, UserProfile,
)
from tests.factories import (
    OTHER_USER_ID, TEST_USER_ID, make_job, make_platform, make_profile, make_profile_document, make_template,
)

PASSWORD = "richtig-langes-passwort"


@pytest.fixture()
def own_sessions(monkeypatch, session_factory):
    for module in ("routers.auth", "routers.storage"):
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)


def _jobs(session_factory):
    with session_factory() as db:
        return {job.id: (job.is_archived, job.archive_reason) for job in db.query(JobEntry).all()}


def test_archive_all_archives_open_matches_and_keeps_applications(api_client, seed, session_factory):
    seed(
        make_job(id="open"), make_job(id="fav", is_favorite=True), make_job(id="drafted", status="DRAFTED"),
        make_job(id="applied", status="APPLIED"),
    )
    response = api_client.delete("/jobs", params={"keep_favorites": True, "keep_applications": True})
    assert response.json() == {"status": "archived", "count": 1}
    jobs = _jobs(session_factory)
    assert jobs["open"] == (True, "USER")
    assert jobs["fav"][0] is False and jobs["drafted"][0] is False and jobs["applied"][0] is False


def test_archive_all_never_touches_seen_placeholders(api_client, seed, session_factory):
    seed(make_job(id="seen", status="SEEN"))
    api_client.delete("/jobs", params={"keep_favorites": False, "keep_applications": False})
    assert _jobs(session_factory)["seen"][0] is False


def _owned_rows(user_id: int, job_id: str, platform_id: int) -> list:
    return [
        make_platform(id=platform_id, user_id=user_id),
        PlatformRun(platform_id=platform_id, finished_at=datetime.now(timezone.utc)),
        make_job(id=job_id, user_id=user_id, platform_id=platform_id),
        JobStatusHistory(job_id=job_id, from_status="OPEN", to_status="DRAFTED", changed_by=user_id),
        JobDocument(job_id=job_id, user_id=user_id, filename="db://cv.pdf", original_filename="cv.pdf"),
        make_profile(user_id=user_id),
        make_profile_document(user_id=user_id, id=900 + user_id),
        make_template(user_id=user_id, id=800 + user_id),
        NotificationTemplate(name="Meine", type="PUSHOVER", content="x", user_id=user_id, is_admin=False),
    ]


def _count(session_factory, model, **filters) -> int:
    with session_factory() as db:
        return db.query(model).filter_by(**filters).count()


def test_reset_removes_dependent_rows_first(api_client, seed, session_factory, own_sessions):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(PASSWORD)
        db.commit()
    seed(User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0))
    seed(*_owned_rows(TEST_USER_ID, "mine", 1))
    seed(*_owned_rows(OTHER_USER_ID, "theirs", 2))
    response = api_client.request("DELETE", "/user/reset", json={"password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["jobs_deleted"] == 1
    for model in (JobEntry, JobPlatform, UserProfile, ProfileDocument, DocumentTemplate, NotificationTemplate):
        assert _count(session_factory, model, user_id=TEST_USER_ID) == 0
        assert _count(session_factory, model, user_id=OTHER_USER_ID) == 1
    assert _count(session_factory, JobStatusHistory, job_id="mine") == 0
    assert _count(session_factory, PlatformRun, platform_id=1) == 0
    assert _count(session_factory, PlatformRun, platform_id=2) == 1
    assert _count(session_factory, User, id=TEST_USER_ID) == 1


def test_reset_with_a_wrong_password_deletes_nothing(api_client, seed, session_factory, own_sessions):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash(PASSWORD)
        db.commit()
    seed(make_job(id="mine"))
    response = api_client.request("DELETE", "/user/reset", json={"password": "falsch"})
    assert response.status_code == 400
    assert _count(session_factory, JobEntry, user_id=TEST_USER_ID) == 1


@pytest.mark.parametrize("new_password", ["", "kurz", "x" * 129])
def test_password_change_refuses_out_of_bounds(api_client, own_sessions, fresh_rate_limits, new_password):
    response = api_client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": new_password})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "new_password"]


def test_storage_status_reports_availability_without_secrets(api_client, seed, own_sessions, monkeypatch):
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_SECRET", "client-secret")
    seed(make_profile(google_drive_refresh_token="DRIVE_SECRET", google_drive_email="me@example.com",
                      active_storage_service="GOOGLE_DRIVE"))
    response = api_client.get("/storage/status")
    assert response.json() == {"available": True, "connected": True, "active": "GOOGLE_DRIVE", "email": "me@example.com"}
    assert "DRIVE_SECRET" not in response.text and "client-secret" not in response.text


def test_storage_status_without_server_configuration(api_client, own_sessions, monkeypatch):
    monkeypatch.setattr("routers.storage.GOOGLE_CLIENT_ID", None)
    response = api_client.get("/storage/status")
    assert response.json() == {"available": False, "connected": False, "active": "NONE", "email": None}
```

(`make_platform`, `make_profile_document` and `make_template` take `**overrides`. `PlatformRun` requires `platform_id` and `finished_at`; `JobDocument` requires `filename` and `original_filename` (`database/core.py` ~lines 174 and 240). `JobStatusHistory` may need more non-null columns: check ~line 271 and add them.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts="" tests/test_account_contract.py`
Expected: FAIL (archive-all count 0, reset leaves history/runs/proofs, `/storage/status` 404, password 200).

- [ ] **Step 3: Write the user-data service**

```python
# server/services/user_data.py
"""Deleting what a user owns, children before parents, so no foreign key is violated (tracker R-17)."""

from sqlalchemy.orm import Session

from database.core import (
    DocumentTemplate, JobDocument, JobEntry, JobPlatform, JobStatusHistory, NotificationTemplate,
    PlatformRun, ProfileDocument, User, UserProfile,
)


def _delete_jobs(db: Session, user_id: int) -> int:
    job_ids = db.query(JobEntry.id).filter(JobEntry.user_id == user_id).scalar_subquery()
    db.query(JobStatusHistory).filter(JobStatusHistory.job_id.in_(job_ids)).delete(synchronize_session=False)
    db.query(JobDocument).filter(JobDocument.job_id.in_(job_ids)).delete(synchronize_session=False)
    return db.query(JobEntry).filter(JobEntry.user_id == user_id).delete(synchronize_session=False)


def _delete_platforms(db: Session, user_id: int) -> int:
    # SQLite in tests does not enforce ON DELETE CASCADE, so the runs go explicitly.
    platform_ids = db.query(JobPlatform.id).filter(JobPlatform.user_id == user_id).scalar_subquery()
    db.query(PlatformRun).filter(PlatformRun.platform_id.in_(platform_ids)).delete(synchronize_session=False)
    return db.query(JobPlatform).filter(JobPlatform.user_id == user_id).delete(synchronize_session=False)


def _delete_owned_files(db: Session, user_id: int) -> None:
    for model in (ProfileDocument, DocumentTemplate, NotificationTemplate):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)


def delete_user_content(db: Session, user_id: int) -> dict:
    """Everything the user owns except the account; the caller commits."""
    jobs_deleted = _delete_jobs(db, user_id)
    platforms_deleted = _delete_platforms(db, user_id)
    _delete_owned_files(db, user_id)
    profile_deleted = db.query(UserProfile).filter(UserProfile.user_id == user_id).delete(synchronize_session=False) > 0
    return {"jobs_deleted": jobs_deleted, "platforms_deleted": platforms_deleted, "profile_deleted": profile_deleted}


def delete_user(db: Session, user_id: int) -> None:
    """The account and everything it owns; the caller commits."""
    delete_user_content(db, user_id)
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
```

- [ ] **Step 4: Use it in the reset and bound the password** (`routers/auth.py`):

```python
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
NewPassword = Annotated[str, StringConstraints(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)]


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword
```

and in `reset_user_data` replace the three delete statements and the `profile` block between the password check and `db.commit()` by:

```python
        counts = delete_user_content(db, current_user.id)
        db.commit()
        return {"status": "reset complete", **counts}
```

Imports: `from typing import Annotated`, `from pydantic import StringConstraints`, `from services.user_data import delete_user_content`.

- [ ] **Step 5: Fix the archive-all scope** (`routers/jobs.py`, `delete_all_jobs`):

```python
# "Keep applications" means everything the user moved past the inbox; OPEN is a match, not an application.
_ARCHIVE_ALL_KEPT_STATUSES = [status for status in APPLICATION_STATUSES if status != STATUS_OPEN] + [
    STATUS_GENERATING, STATUS_FAILED,
]
```

In the function: start the query with `JobEntry.status != STATUS_SEEN` in the filter, and use `JobEntry.status.in_(_ARCHIVE_ALL_KEPT_STATUSES)` for `keep_applications`. (Import `STATUS_GENERATING`, `STATUS_FAILED`, `STATUS_SEEN`, `STATUS_OPEN` from `core.job_status` if not yet imported; if a name differs there, use the real constant.)

- [ ] **Step 6: Add the storage status** (`routers/storage.py`, after `google_disconnect`):

```python
STORAGE_NONE = "NONE"


@router.get("/status")
def storage_status(current_user: User = Depends(get_current_user)):
    """What the settings page needs to offer Drive: booleans and the user's own Drive address only."""
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        return {
            "available": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
            "connected": bool(profile and profile.google_drive_refresh_token),
            "active": (profile.active_storage_service if profile else None) or STORAGE_NONE,
            "email": profile.google_drive_email if profile else None,
        }
    finally:
        db.close()
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `. "$QA"/env.sh && cd "$REPO"/server && python -m pytest -p no:cacheprovider -q -o addopts=""`
Expected: PASS, the full suite (`tests/test_jobs_router.py` included; if one of its archive-all tests asserted the old OPEN protection, update that assertion to the new rule and say so in the report).

- [ ] **Step 8: Checkpoint.** Full backend suite green.

---

### Task 3: Web contract layer: settings paths, notification settings, account API, settings domain

**Files:**
- Create: `web/src/api/settingsPaths.ts`, `web/src/api/notificationSettings.ts`, `web/src/api/account.ts`, `web/src/domain/settings.ts`, `web/src/domain/notificationChannels.ts`
- Modify: `web/src/api/notifications.ts` (template writes and preview), `web/src/api/settings.ts` (time zone save, storage), `web/src/api/queryKeys.ts`, `web/src/features/shell/navigation.ts`
- Test: `web/tests/unit/api/settingsApi.test.ts`, `web/tests/unit/domain/settings.test.ts`, `web/tests/unit/domain/notificationChannels.test.ts`

**Interfaces:**
- Consumes: `api` (`src/api/instance.ts`), `NotifyChannel`, `NOTIFY_CHANNELS` (`platformPaths.ts`), `queryKeys`, `NOTIFICATION_SETTINGS_HREF`, `ACCOUNT_HREF` (`navigation.ts`), `API_BASE_URL` (`src/config.ts`), `NotificationTemplate` (`notifications.ts`).
- Produces (later tasks use exactly these names):
  - `settingsPaths.ts`: `NOTIFICATION_SETTINGS_PATH`, `NOTIFICATION_PREVIEW_PATH`, `notificationTestPath(channel)`, `notificationTemplatePath(id, scope)`, `notificationTemplatesWritePath(scope)`, `TEMPLATE_SCOPES` / `TemplateScope = "own"|"global"`, `TIMEZONE_PATH`, `STORAGE_STATUS_PATH`, `STORAGE_LOGIN_PATH`, `STORAGE_TOGGLE_PATH`, `STORAGE_DISCONNECT_PATH`, `STORAGE_SERVICES`, `StorageService`, `CHANGE_PASSWORD_PATH`, `JOBS_PATH`, `PROFILE_RESET_PATH`, `FACTORY_RESET_PATH`, `NOTIFICATION_LIMITS`, `PASSWORD_LIMITS`, `PLAIN_FIELDS`, `SECRET_FIELDS`, `PlainField`, `SecretField`, `ChannelField`, `CHANNEL_FIELDS`, `REQUIRED_FIELDS`, `EMAIL_FIELDS`, `EDITABLE_TEMPLATE_TYPES`, `DRIVE_CALLBACK`.
  - `notificationSettings.ts`: `notificationSettingsSchema`, `NotificationSettings`, `NotificationSettingsBody`, `NotificationPatch`, `notificationSettingsQueryOptions()`, `saveNotificationSettings(patch)`, `sendSettingsTest({channel, recipient?})`.
  - `notifications.ts` additions: `NotificationTemplateWrite`, `createNotificationTemplate({scope, template})`, `updateNotificationTemplate({id, scope, template})`, `deleteNotificationTemplate({id, scope})`, `previewNotificationTemplate({type, content})` -> `TemplatePreview {html: boolean; body: string}`.
  - `settings.ts` additions: `saveTimezone(zone)`, `storageStatusSchema`, `StorageStatus`, `StorageStatusBody`, `storageStatusQueryOptions()`, `toggleStorage(service)`, `disconnectDrive()`, `driveLoginUrl()`.
  - `account.ts`: `changePassword({current, next})`, `archiveAllJobs({keepFavorites, keepApplications})` -> `number`, `resetProfile()`, `factoryReset(password)`.
  - `domain/settings.ts`: `SETTINGS_HREF`, `USER_SECTIONS`, `SettingsSection`, `DEFAULT_SETTINGS_SECTION`, `settingsSectionFromParam(value)`, `settingsHref(section)`, `timeZoneOptions(current, supported)`, `PasswordProblem`, `passwordProblem({next, repeat})`, `DriveCallback`, `driveCallbackOf(params)`.
  - `domain/notificationChannels.ts`: `ChannelDraft`, `ChannelProblem`, `channelDraftOf(channel, settings)`, `channelPatch(channel, draft, settings)`, `channelErrors({channel, draft, settings, configured})`, `removalPatch(channel)`, `channelDetail(channel, settings)`.
  - `queryKeys`: `notificationSettings: ["settings","notifications"]`, `storageStatus: ["storage-status"]`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/tests/unit/domain/settings.test.ts
import { describe, expect, it } from "vitest";
import {
  driveCallbackOf,
  passwordProblem,
  settingsHref,
  settingsSectionFromParam,
  timeZoneOptions,
} from "@/domain/settings";
import { ACCOUNT_HREF, NOTIFICATION_SETTINGS_HREF } from "@/features/shell/navigation";

describe("settings sections", () => {
  it("serves the phase 3/5 contracts", () => {
    expect(settingsHref("notifications")).toBe(NOTIFICATION_SETTINGS_HREF);
    expect(settingsHref("account")).toBe(ACCOUNT_HREF);
    expect(settingsHref("general")).toBe("/settings");
  });
  it("reads an unknown or missing value as Allgemein", () => {
    expect(settingsSectionFromParam(null)).toBe("general");
    expect(settingsSectionFromParam("passwoerter")).toBe("general");
    expect(settingsSectionFromParam("account")).toBe("account");
  });
});

describe("timeZoneOptions", () => {
  it("adds a stored zone the browser does not list and sorts", () => {
    expect(timeZoneOptions("Etc/Legacy", ["UTC", "Europe/Berlin"])).toEqual([
      "Etc/Legacy",
      "Europe/Berlin",
      "UTC",
    ]);
  });
});

describe("passwordProblem", () => {
  it("names the first problem", () => {
    expect(passwordProblem({ next: "kurz", repeat: "kurz" })).toBe("tooShort");
    expect(passwordProblem({ next: "x".repeat(129), repeat: "x".repeat(129) })).toBe("tooLong");
    expect(passwordProblem({ next: "lang-genug", repeat: "anders-123" })).toBe("mismatch");
    expect(passwordProblem({ next: "lang-genug", repeat: "lang-genug" })).toBeNull();
  });
});

describe("driveCallbackOf", () => {
  it("reads the OAuth callback parameters of routers/storage.py", () => {
    expect(driveCallbackOf(new URLSearchParams("tab=storage&success=google_connected"))).toBe(
      "connected",
    );
    expect(driveCallbackOf(new URLSearchParams("error=google_auth_failed"))).toBe("failed");
    expect(driveCallbackOf(new URLSearchParams("section=account"))).toBeNull();
  });
});
```

```ts
// web/tests/unit/domain/notificationChannels.test.ts
import { describe, expect, it } from "vitest";
import type { NotificationSettings } from "@/api/notificationSettings";
import {
  channelDetail,
  channelDraftOf,
  channelErrors,
  channelPatch,
  removalPatch,
} from "@/domain/notificationChannels";

const STORED: NotificationSettings = {
  pushover_user_key: "push-user",
  pushover_api_token: true,
  resend_api_key: true,
  resend_from_email: "jobs@example.com",
  mailjet_api_key: false,
  mailjet_secret_key: false,
  mailjet_from_email: "",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "smtp-user",
  smtp_password: true,
  smtp_from_email: "",
  email_global_recipient: "me@example.com",
};

describe("channel drafts", () => {
  it("start with the plain values and empty secrets", () => {
    expect(channelDraftOf("SMTP", STORED)).toEqual({
      smtp_host: "smtp.example.com",
      smtp_port: "587",
      smtp_user: "smtp-user",
      smtp_from_email: "",
      smtp_password: "",
    });
  });

  it("send only changed plain fields and typed secrets", () => {
    const draft = { ...channelDraftOf("SMTP", STORED), smtp_host: " mail.example.org " };
    expect(channelPatch("SMTP", draft, STORED)).toEqual({ smtp_host: "mail.example.org" });
    const typed = { ...channelDraftOf("PUSHOVER", STORED), pushover_api_token: "neu" };
    expect(channelPatch("PUSHOVER", typed, STORED)).toEqual({ pushover_api_token: "neu" });
  });

  it("send a cleared plain field as null and the port as a number", () => {
    const draft = { ...channelDraftOf("SMTP", STORED), smtp_user: "", smtp_port: "2525" };
    expect(channelPatch("SMTP", draft, STORED)).toEqual({ smtp_user: null, smtp_port: 2525 });
  });

  it("removal clears every field of the channel and nothing else", () => {
    expect(removalPatch("MAILJET")).toEqual({
      mailjet_api_key: null,
      mailjet_secret_key: null,
      mailjet_from_email: null,
    });
  });
});

describe("channelErrors", () => {
  const check = (channel: "SMTP" | "MAILJET", patch: Record<string, string>, configured = true) =>
    channelErrors({
      channel,
      draft: { ...channelDraftOf(channel, STORED), ...patch },
      settings: STORED,
      configured,
    });

  it("refuses odd ports and addresses before sending", () => {
    expect(check("SMTP", { smtp_port: "0" })).toEqual({ smtp_port: "port" });
    expect(check("SMTP", { smtp_port: "587a" })).toEqual({ smtp_port: "port" });
    expect(check("SMTP", { smtp_from_email: "a@b" })).toEqual({ smtp_from_email: "email" });
    expect(check("SMTP", { smtp_host: "h".repeat(254) })).toEqual({ smtp_host: "tooLong" });
  });

  it("asks a new channel for every field its server predicate needs", () => {
    expect(check("MAILJET", {}, false)).toEqual({
      mailjet_api_key: "required",
      mailjet_secret_key: "required",
      mailjet_from_email: "required",
    });
  });

  it("counts a stored secret as present", () => {
    expect(check("SMTP", { smtp_host: "mail.example.org" })).toEqual({});
  });
});

describe("channelDetail", () => {
  it("names the sender or host, never a secret", () => {
    expect(channelDetail("RESEND", STORED)).toBe("jobs@example.com");
    expect(channelDetail("SMTP", STORED)).toBe("smtp.example.com");
    expect(channelDetail("PUSHOVER", STORED)).toBeNull();
  });
});
```

```ts
// web/tests/unit/api/settingsApi.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationSettingsSchema, saveNotificationSettings } from "@/api/notificationSettings";
import { archiveAllJobs } from "@/api/account";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

describe("notification settings schema", () => {
  it("turns every secret into a boolean and keeps no mask", () => {
    const parsed = notificationSettingsSchema.parse({
      pushover_api_token: "__masked__",
      smtp_password: null,
      resend_api_key: "",
      role: "Lead",
    });
    expect(parsed.pushover_api_token).toBe(true);
    expect(parsed.smtp_password).toBe(false);
    expect(parsed.resend_api_key).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("__masked__");
    expect(parsed).not.toHaveProperty("role");
  });

  it("saves only the patch it is given", async () => {
    const calls = stubRoutes({ "POST /notification-settings": { status: "saved" } });
    await saveNotificationSettings({ smtp_host: "mail.example.org" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ smtp_host: "mail.example.org" });
  });
});

describe("archiveAllJobs", () => {
  it("sends both options and answers the count", async () => {
    const calls = stubRoutes({ "DELETE /jobs": { status: "archived", count: 4 } });
    expect(await archiveAllJobs({ keepFavorites: true, keepApplications: false })).toBe(4);
    expect(new URL(calls[0]!.url).search).toBe("?keep_favorites=true&keep_applications=false");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/settings.test.ts tests/unit/domain/notificationChannels.test.ts tests/unit/api/settingsApi.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `settingsPaths.ts`**

```ts
// web/src/api/settingsPaths.ts
/**
 * Paths, limits and field names of the settings endpoints. Client-free (no API client import), so
 * e2e fixtures and the FakeServer can import them at runtime.
 */
import type { NotifyChannel } from "./platformPaths";

export const NOTIFICATION_SETTINGS_PATH = "/notification-settings";
export const NOTIFICATION_PREVIEW_PATH = "/notification-templates/preview";
const OWN_TEMPLATES_PATH = "/notification-templates";
const GLOBAL_TEMPLATES_PATH = "/admin/notification-templates";
export const TIMEZONE_PATH = "/timezone-preference";
export const STORAGE_STATUS_PATH = "/storage/status";
export const STORAGE_LOGIN_PATH = "/storage/google/login";
export const STORAGE_TOGGLE_PATH = "/storage/toggle";
export const STORAGE_DISCONNECT_PATH = "/storage/google/disconnect";
export const CHANGE_PASSWORD_PATH = "/auth/change-password";
export const JOBS_PATH = "/jobs";
export const PROFILE_RESET_PATH = "/settings";
export const FACTORY_RESET_PATH = "/user/reset";

export const TEMPLATE_SCOPES = ["own", "global"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

export function notificationTestPath(channel: NotifyChannel): string {
  return `${NOTIFICATION_SETTINGS_PATH}/test-${channel.toLowerCase()}`;
}

/** Global templates are written through the admin router (403 for others). */
export function notificationTemplatesWritePath(scope: TemplateScope): string {
  return scope === "global" ? GLOBAL_TEMPLATES_PATH : OWN_TEMPLATES_PATH;
}

export function notificationTemplatePath(id: number, scope: TemplateScope): string {
  return `${notificationTemplatesWritePath(scope)}/${id}`;
}

export const STORAGE_SERVICES = ["NONE", "GOOGLE_DRIVE"] as const;
export type StorageService = (typeof STORAGE_SERVICES)[number];

// Mirrors server/database/core.py (Task 1) and routers/auth.py (Task 2); 422 on the field otherwise.
export const NOTIFICATION_LIMITS = {
  email: 254,
  credential: 500,
  host: 253,
  portMin: 1,
  portMax: 65535,
  templateName: 100,
  templateContent: 100_000,
} as const;
export const PASSWORD_LIMITS = { min: 8, max: 128 } as const;
export const DEFAULT_SMTP_PORT = 587;

export const PLAIN_FIELDS = [
  "pushover_user_key",
  "resend_from_email",
  "mailjet_from_email",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_from_email",
  "email_global_recipient",
] as const;
export type PlainField = (typeof PLAIN_FIELDS)[number];
/** routers/deps.py _SECRET_FIELDS without the Drive token (it is not a channel field). */
export const SECRET_FIELDS = [
  "pushover_api_token",
  "resend_api_key",
  "mailjet_api_key",
  "mailjet_secret_key",
  "smtp_password",
] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];
export type ChannelField = Exclude<PlainField, "email_global_recipient"> | SecretField;

/** The fields of each channel's form, in display order. */
export const CHANNEL_FIELDS: Readonly<Record<NotifyChannel, readonly ChannelField[]>> = {
  PUSHOVER: ["pushover_user_key", "pushover_api_token"],
  RESEND: ["resend_api_key", "resend_from_email"],
  MAILJET: ["mailjet_api_key", "mailjet_secret_key", "mailjet_from_email"],
  SMTP: ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from_email"],
};
/** routers/settings.py _channel_status: what makes a channel sendable. */
export const REQUIRED_FIELDS: Readonly<Record<NotifyChannel, readonly ChannelField[]>> = {
  PUSHOVER: ["pushover_user_key", "pushover_api_token"],
  RESEND: ["resend_api_key", "resend_from_email"],
  MAILJET: ["mailjet_api_key", "mailjet_secret_key", "mailjet_from_email"],
  SMTP: ["smtp_host", "smtp_user", "smtp_password"],
};
export const EMAIL_FIELDS: readonly PlainField[] = [
  "resend_from_email",
  "mailjet_from_email",
  "smtp_from_email",
  "email_global_recipient",
];

/** E-Mail templates are created as RESEND: the server refuses SMTP templates (spec section 3). */
export const EDITABLE_TEMPLATE_TYPES = ["PUSHOVER", "RESEND"] as const;
export type EditableTemplateType = (typeof EDITABLE_TEMPLATE_TYPES)[number];

/** Query parameters of the OAuth callback redirect (routers/storage.py google_callback). */
export const DRIVE_CALLBACK = {
  successParam: "success",
  connected: "google_connected",
  errorParam: "error",
  failed: "google_auth_failed",
  legacyTabParam: "tab",
} as const;
```

- [ ] **Step 4: Write `notificationSettings.ts`**

```ts
// web/src/api/notificationSettings.ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import type { NotifyChannel } from "./platformPaths";
import { SETTINGS_PATH } from "./profilePaths";
import { queryKeys } from "./queryKeys";
import {
  NOTIFICATION_SETTINGS_PATH,
  notificationTestPath,
  type ChannelField,
  type PlainField,
} from "./settingsPaths";

const plain = z
  .string()
  .nullish()
  .transform((value) => value ?? "");
// The server answers a stored secret as "__masked__": only "is there one" survives parsing, so
// neither the mask nor a value can reach state, the DOM or a request (Global Constraints).
const secretSet = z
  .string()
  .nullish()
  .transform((value) => Boolean(value));
const port = z.number().int().nullish().catch(null);

export const notificationSettingsSchema = z.object({
  pushover_user_key: plain,
  pushover_api_token: secretSet,
  resend_api_key: secretSet,
  resend_from_email: plain,
  mailjet_api_key: secretSet,
  mailjet_secret_key: secretSet,
  mailjet_from_email: plain,
  smtp_host: plain,
  smtp_port: port,
  smtp_user: plain,
  smtp_password: secretSet,
  smtp_from_email: plain,
  email_global_recipient: plain,
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type NotificationSettingsBody = z.input<typeof notificationSettingsSchema>;
export type NotificationPatch = Partial<Record<ChannelField | PlainField, string | number | null>>;

const anyBodySchema = z.unknown();

export function notificationSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => api.request(SETTINGS_PATH, notificationSettingsSchema),
  });
}

/** One channel's (or the recipient's) changed fields; the server writes only the keys sent (B2). */
export async function saveNotificationSettings(patch: NotificationPatch): Promise<void> {
  await api.request(NOTIFICATION_SETTINGS_PATH, anyBodySchema, { method: "POST", json: patch });
}

export interface SettingsTest {
  channel: NotifyChannel;
  /** Email channels only; empty means the stored default recipient. */
  recipient?: string;
}

/** Sends a real message with the stored credentials; 400 = incomplete, 429 = too many tests. */
export async function sendSettingsTest({ channel, recipient }: SettingsTest): Promise<void> {
  const json = channel === "PUSHOVER" ? undefined : { recipient: recipient ?? "" };
  await api.request(notificationTestPath(channel), anyBodySchema, { method: "POST", json });
}
```

- [ ] **Step 5: Extend `notifications.ts`** (append; keep the existing exports):

```ts
import { NOTIFICATION_PREVIEW_PATH, notificationTemplatePath, notificationTemplatesWritePath, type TemplateScope } from "./settingsPaths";

export interface NotificationTemplateWrite {
  name: string;
  type: string;
  content: string;
}

const savedTemplateSchema = templateSchema;
const previewSchema = z.object({ html: z.boolean(), body: z.string() });
export type TemplatePreview = z.infer<typeof previewSchema>;
const okSchema = z.unknown();

export async function createNotificationTemplate(input: {
  scope: TemplateScope;
  template: NotificationTemplateWrite;
}): Promise<NotificationTemplate> {
  const path = notificationTemplatesWritePath(input.scope);
  return api.request(path, savedTemplateSchema, { method: "POST", json: input.template });
}

/** The type cannot change after creation (the server ignores it); name and text can. */
export async function updateNotificationTemplate(input: {
  id: number;
  scope: TemplateScope;
  template: Omit<NotificationTemplateWrite, "type">;
}): Promise<NotificationTemplate> {
  const path = notificationTemplatePath(input.id, input.scope);
  return api.request(path, savedTemplateSchema, { method: "PUT", json: input.template });
}

export async function deleteNotificationTemplate(input: { id: number; scope: TemplateScope }) {
  await api.request(notificationTemplatePath(input.id, input.scope), okSchema, { method: "DELETE" });
}

/** Server render with a sample job (Task 1); `body` is untrusted HTML when `html` is true. */
export async function previewNotificationTemplate(input: {
  type: string;
  content: string;
}): Promise<TemplatePreview> {
  return api.request(NOTIFICATION_PREVIEW_PATH, previewSchema, { method: "POST", json: input });
}
```

- [ ] **Step 6: Extend `settings.ts`** (append):

```ts
import { API_BASE_URL } from "@/config";
import {
  STORAGE_DISCONNECT_PATH,
  STORAGE_LOGIN_PATH,
  STORAGE_SERVICES,
  STORAGE_STATUS_PATH,
  STORAGE_TOGGLE_PATH,
  TIMEZONE_PATH,
  type StorageService,
} from "./settingsPaths";

const savedTimezoneSchema = z.object({ timezone: z.string() });

/** The server stores a valid zone or falls back to Europe/Berlin; the answer is what it stored. */
export async function saveTimezone(zone: string): Promise<string> {
  const json = { timezone: zone };
  const saved = await api.request(TIMEZONE_PATH, savedTimezoneSchema, { method: "POST", json });
  return saved.timezone;
}

const storageStatusSchema = z.object({
  available: z.boolean(),
  connected: z.boolean(),
  active: z.enum(STORAGE_SERVICES).catch("NONE"),
  email: z.string().nullish(),
});
export type StorageStatus = z.infer<typeof storageStatusSchema>;
export type StorageStatusBody = z.input<typeof storageStatusSchema>;

export function storageStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.storageStatus,
    queryFn: () => api.request(STORAGE_STATUS_PATH, storageStatusSchema),
  });
}

export async function toggleStorage(service: StorageService): Promise<void> {
  await api.request(STORAGE_TOGGLE_PATH, z.unknown(), { method: "POST", json: { service } });
}

export async function disconnectDrive(): Promise<void> {
  await api.request(STORAGE_DISCONNECT_PATH, z.unknown(), { method: "POST" });
}

/** A full navigation target (Google's consent page follows); built from config, never from data. */
export function driveLoginUrl(): string {
  return `${API_BASE_URL}${STORAGE_LOGIN_PATH}`;
}
```

- [ ] **Step 7: Write `account.ts`**

```ts
// web/src/api/account.ts
import { z } from "zod";
import { api } from "./instance";
import { CHANGE_PASSWORD_PATH, FACTORY_RESET_PATH, JOBS_PATH, PROFILE_RESET_PATH } from "./settingsPaths";

const anyBodySchema = z.unknown();
const archivedSchema = z.object({ count: z.number().int() });

/** 400 = wrong current password (the server's text is not shown); 422 on new_password. */
export async function changePassword(input: { current: string; next: string }): Promise<void> {
  const json = { current_password: input.current, new_password: input.next };
  await api.request(CHANGE_PASSWORD_PATH, anyBodySchema, { method: "POST", json });
}

/** Archives the inbox matches (reason USER); answers how many (Task 2 scope). */
export async function archiveAllJobs(input: {
  keepFavorites: boolean;
  keepApplications: boolean;
}): Promise<number> {
  const query = new URLSearchParams({
    keep_favorites: String(input.keepFavorites),
    keep_applications: String(input.keepApplications),
  });
  const path = `${JOBS_PATH}?${query.toString()}`;
  return (await api.request(path, archivedSchema, { method: "DELETE" })).count;
}

/** Ziel and Lebenslauf back to the server defaults; channels, templates and proofs stay. */
export async function resetProfile(): Promise<void> {
  await api.request(PROFILE_RESET_PATH, anyBodySchema, { method: "DELETE" });
}

/** Everything the account owns except the account (Task 2); 400 = wrong password. */
export async function factoryReset(password: string): Promise<void> {
  await api.request(FACTORY_RESET_PATH, anyBodySchema, { method: "DELETE", json: { password } });
}
```

(If `ApiRequest.method` does not allow a body on `DELETE` in `client.ts`, it does: `json` is method-independent; check `client.ts` and adapt only the call.)

- [ ] **Step 8: Write the domain modules**

```ts
// web/src/domain/settings.ts
import { PASSWORD_LIMITS, DRIVE_CALLBACK } from "@/api/settingsPaths";

/** The Einstellungen page; the shell links here too (features/shell/navigation.ts re-exports it). */
export const SETTINGS_HREF = "/settings";
export const USER_SECTIONS = ["general", "notifications", "account"] as const;
export type SettingsSection = (typeof USER_SECTIONS)[number];
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";
const SECTION_PARAM = "section";

export function settingsSectionFromParam(value: string | null): SettingsSection {
  return USER_SECTIONS.find((section) => section === value) ?? DEFAULT_SETTINGS_SECTION;
}

/** D1: the default section has no parameter. */
export function settingsHref(section: SettingsSection): string {
  if (section === DEFAULT_SETTINGS_SECTION) return SETTINGS_HREF;
  return `${SETTINGS_HREF}?${new URLSearchParams({ [SECTION_PARAM]: section }).toString()}`;
}

/** The browser's zones plus a stored one it does not know (a legacy value must stay selectable). */
export function timeZoneOptions(current: string | null, supported: readonly string[]): string[] {
  const zones = new Set(supported);
  if (current) zones.add(current);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

export type PasswordProblem = "tooShort" | "tooLong" | "mismatch";

export function passwordProblem(input: { next: string; repeat: string }): PasswordProblem | null {
  if (input.next.length < PASSWORD_LIMITS.min) return "tooShort";
  if (input.next.length > PASSWORD_LIMITS.max) return "tooLong";
  return input.next === input.repeat ? null : "mismatch";
}

export type DriveCallback = "connected" | "failed";

export function driveCallbackOf(params: URLSearchParams): DriveCallback | null {
  if (params.get(DRIVE_CALLBACK.successParam) === DRIVE_CALLBACK.connected) return "connected";
  if (params.get(DRIVE_CALLBACK.errorParam) === DRIVE_CALLBACK.failed) return "failed";
  return null;
}
```

```ts
// web/src/domain/notificationChannels.ts
import type { NotificationPatch, NotificationSettings } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import {
  CHANNEL_FIELDS,
  EMAIL_FIELDS,
  NOTIFICATION_LIMITS,
  REQUIRED_FIELDS,
  SECRET_FIELDS,
  type ChannelField,
  type PlainField,
  type SecretField,
} from "@/api/settingsPaths";

/** What a channel form edits: every value as text; secrets start empty (write-only). */
export type ChannelDraft = Partial<Record<ChannelField, string>>;
export type ChannelProblem = "required" | "email" | "port" | "tooLong";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DIGITS = /^\d+$/;
const PORT_FIELD: ChannelField = "smtp_port";
const HOST_FIELD: ChannelField = "smtp_host";

const isSecret = (field: ChannelField): field is SecretField =>
  (SECRET_FIELDS as readonly string[]).includes(field);

function storedText(settings: NotificationSettings, field: PlainField): string {
  const value = settings[field];
  return value === null || value === undefined ? "" : String(value);
}

export function channelDraftOf(
  channel: NotifyChannel,
  settings: NotificationSettings,
): ChannelDraft {
  return Object.fromEntries(
    CHANNEL_FIELDS[channel].map((field) => [
      field,
      isSecret(field) ? "" : storedText(settings, field as PlainField),
    ]),
  );
}

function sentValue(field: ChannelField, text: string): string | number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return field === PORT_FIELD ? Number(trimmed) : trimmed;
}

/** Changed plain fields (cleared -> null) and typed secrets only (B2, write-only secrets). */
export function channelPatch(
  channel: NotifyChannel,
  draft: ChannelDraft,
  settings: NotificationSettings,
): NotificationPatch {
  const patch: NotificationPatch = {};
  for (const field of CHANNEL_FIELDS[channel]) {
    const text = draft[field] ?? "";
    if (isSecret(field)) {
      if (text) patch[field] = text;
    } else if (text.trim() !== storedText(settings, field as PlainField)) {
      patch[field] = sentValue(field, text);
    }
  }
  return patch;
}

export function removalPatch(channel: NotifyChannel): NotificationPatch {
  return Object.fromEntries(CHANNEL_FIELDS[channel].map((field) => [field, null]));
}

function limitOf(field: ChannelField): number {
  if ((EMAIL_FIELDS as readonly string[]).includes(field)) return NOTIFICATION_LIMITS.email;
  return field === HOST_FIELD ? NOTIFICATION_LIMITS.host : NOTIFICATION_LIMITS.credential;
}

function portProblem(text: string): ChannelProblem | null {
  if (!DIGITS.test(text)) return "port";
  const port = Number(text);
  const inRange = port >= NOTIFICATION_LIMITS.portMin && port <= NOTIFICATION_LIMITS.portMax;
  return inRange ? null : "port";
}

function valueProblem(field: ChannelField, text: string): ChannelProblem | null {
  if (field === PORT_FIELD) return portProblem(text);
  if (text.length > limitOf(field)) return "tooLong";
  const isEmail = (EMAIL_FIELDS as readonly string[]).includes(field);
  return isEmail && !EMAIL_SHAPE.test(text) ? "email" : null;
}

function present(field: ChannelField, text: string, settings: NotificationSettings): boolean {
  return text.length > 0 || (isSecret(field) && settings[field]);
}

export interface ChannelCheck {
  channel: NotifyChannel;
  draft: ChannelDraft;
  settings: NotificationSettings;
  /** GET /notification-settings/channels: a configured channel may be edited field by field. */
  configured: boolean;
}

/** Client check before a save; the server applies the same limits (Task 1). */
export function channelErrors(check: ChannelCheck): Partial<Record<ChannelField, ChannelProblem>> {
  const errors: Partial<Record<ChannelField, ChannelProblem>> = {};
  for (const field of CHANNEL_FIELDS[check.channel]) {
    const text = (check.draft[field] ?? "").trim();
    const needed = !check.configured && REQUIRED_FIELDS[check.channel].includes(field);
    if (needed && !present(field, text, check.settings)) errors[field] = "required";
    else if (text) {
      const problem = valueProblem(field, text);
      if (problem) errors[field] = problem;
    }
  }
  return errors;
}

const DETAIL_FIELD: Readonly<Record<NotifyChannel, PlainField | null>> = {
  PUSHOVER: null,
  RESEND: "resend_from_email",
  MAILJET: "mailjet_from_email",
  SMTP: "smtp_host",
};

/** The non-secret detail of the "Eingerichtet · …" line, or null. */
export function channelDetail(channel: NotifyChannel, settings: NotificationSettings): string | null {
  const field = DETAIL_FIELD[channel];
  return field ? storedText(settings, field) || null : null;
}
```

(`channelErrors` is above 20 lines once formatted: split the loop body into a `fieldProblem(field, check)` helper returning `ChannelProblem | null`.)

- [ ] **Step 9: Wire keys and navigation.** `queryKeys.ts`: add `notificationSettings: ["settings", "notifications"],` and `storageStatus: ["storage-status"],` next to `channelStatus`. `navigation.ts`: replace `export const SETTINGS_HREF = "/settings";` by `import { SETTINGS_HREF } from "@/domain/settings";` plus `export { SETTINGS_HREF };` (profile pattern), keep `ACCOUNT_HREF`, `AI_SETTINGS_HREF`, `NOTIFICATION_SETTINGS_HREF` unchanged (the unit test pins them).

- [ ] **Step 10: Run the tests to verify they pass**

Run: `"$QA"/webrun.sh pnpm exec vitest run tests/unit/domain/settings.test.ts tests/unit/domain/notificationChannels.test.ts tests/unit/api/settingsApi.test.ts`
Expected: PASS.

- [ ] **Step 11: Checkpoint** (format, then the five commands). All green.

---

### Task 4: Einstellungen frame: route, masthead, sub-nav, URL, section states, FakeServer

**Files:**
- Modify: `web/app/(app)/settings/page.tsx`, `web/app/globals.css` (import `settings.css` after `profile.css`), `web/src/features/profile/useReportDirty.ts` (section parameter `string`), `web/tests/e2e/shell.spec.ts` (remove `["/settings", "Einstellungen"]` from `PLACEHOLDER_ROUTES`), `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Create: `web/src/features/settings/SettingsPage.tsx`, `SettingsNav.tsx`, `SettingsSectionFrame.tsx`, `useSettingsSection.ts`, `labels.ts`, `settings.css`, `general/GeneralSection.tsx`, `notifications/NotificationsSection.tsx`, `account/AccountSection.tsx` (frames only; Tasks 5-9 fill them)
- Create: `web/tests/unit/support/settingsRoutes.ts`, `web/tests/unit/features/settings/settingsPage.test.tsx`, `web/tests/e2e/support/settingsFixtures.ts`, `web/tests/e2e/support/settingsServer.ts`, `web/tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`settingsSectionFromParam`, `settingsHref`, `USER_SECTIONS`, `SettingsSection`, query options), `useDirtySections`, `ReportDirty`, `Masthead`, `SETTINGS_NUMBER`, `ProfileBody` (type), `AUTHENTICATED_ROUTES`, `live`, `reply`.
- Produces:
  - `SettingsPage()`; `SettingsSectionProps { report: ReportDirty }` (every section body's props); `SECTION_LABEL`, `SECTION_INTRO`, `settingsHeadingId(section)` in `labels.ts`; `SettingsSectionFrame({ section, children })`; `useSettingsSection(): SettingsSection`.
  - `useReportDirty(report, section: string, dirty)` (widened; profile callers unchanged).
  - e2e: `SettingsServer` (state: `profile` with secrets, `templates`, `storage`, `password`, `tests: string[]`, `saved: Record<string, unknown>[]`), `settingsRoutes(server = new SettingsServer(), extra = {})`, fixtures `SETTINGS_SECRETS`, `SETTINGS_NOTIFICATION_FIELDS`, `NOTIFICATION_TEMPLATES`, `STORAGE_CONNECTED`.
  - unit: `settingsStubs(overrides)`, `STORED_NOTIFICATION_SETTINGS`.

- [ ] **Step 1: Add the i18n keys** (DE, EN as comment):

```ts
  "settings.deck": "Sprache, Benachrichtigungen und dein Konto.", // "Language, notifications and your account."
  "settings.nav": "Einstellungsbereiche", // "Settings sections"
  "settings.section.general": "Allgemein", // "General"
  "settings.section.notifications": "Benachrichtigungen", // "Notifications"
  "settings.section.account": "Konto", // "Account"
  "settings.intro.general": "Sprache, Darstellung, Zeitzone und wo deine Dateien liegen.", // "Language, appearance, time zone and where your files are stored."
  "settings.intro.notifications": "Alle Kanäle an einem Ort. Welche Quelle über welchen Kanal benachrichtigt, stellst du in der Quelle ein.", // "All channels in one place. Which source notifies through which channel is set in the source."
  "settings.intro.account": "Passwort und Aufräumen.", // "Password and clean-up."
```

- [ ] **Step 2: Write the failing unit test**

```tsx
// web/tests/unit/features/settings/settingsPage.test.tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const nav = () => screen.getByRole("navigation", { name: "Einstellungsbereiche" });

describe("Einstellungen frame", () => {
  it("opens Allgemein by default and marks it current", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Allgemein" })).toHaveAttribute("aria-current", "page");
  });

  it("serves the notifications contract of the source drawer", async () => {
    liveNavigation.reset("/settings?section=notifications");
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Benachrichtigungen" })).toBeVisible();
  });

  it("links every user section in order", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole("heading", { level: 2 });
    const names = Array.from(nav().querySelectorAll("a")).map((link) => link.textContent);
    expect(names).toEqual(["Allgemein", "Benachrichtigungen", "Konto"]);
  });

  it("a sub-nav link opens its section (push, so Back walks sections)", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("link", { name: "Konto" }));
    expect(liveNavigation.current()).toBe("/settings?section=account");
  });
});
```

(`liveNavigation.reset(url)` and `.current()`: use the real API of `tests/unit/support/liveNavigation.ts`; read it first and adapt the two calls.)

- [ ] **Step 3: Run it to verify it fails** — `"$QA"/webrun.sh pnpm exec vitest run tests/unit/features/settings/settingsPage.test.tsx` -> FAIL (module not found).

- [ ] **Step 4: Write the frame**

```tsx
// web/src/features/settings/useSettingsSection.ts
"use client";

import { useSearchParams } from "next/navigation";
import { settingsSectionFromParam, type SettingsSection } from "@/domain/settings";

/** D1: the open section from `?section=`; an unknown value reads as Allgemein and is not rewritten. */
export function useSettingsSection(): SettingsSection {
  return settingsSectionFromParam(useSearchParams().get("section"));
}
```

```ts
// web/src/features/settings/labels.ts
import type { SettingsSection } from "@/domain/settings";
import type { MessageKey } from "@/i18n/de";

export const SECTION_LABEL: Readonly<Record<SettingsSection, MessageKey>> = {
  general: "settings.section.general",
  notifications: "settings.section.notifications",
  account: "settings.section.account",
};

export const SECTION_INTRO: Readonly<Record<SettingsSection, MessageKey>> = {
  general: "settings.intro.general",
  notifications: "settings.intro.notifications",
  account: "settings.intro.account",
};

/** The focus target after an item of the section disappears. */
export const settingsHeadingId = (section: SettingsSection) => `settings-${section}-h`;
```

```tsx
// web/src/features/settings/SettingsSectionFrame.tsx
"use client";

import type { ReactNode } from "react";
import type { SettingsSection } from "@/domain/settings";
import { useI18n } from "@/i18n/useI18n";
import { SECTION_INTRO, SECTION_LABEL, settingsHeadingId } from "./labels";

export function SettingsSectionFrame(props: { section: SettingsSection; children?: ReactNode }) {
  const { t } = useI18n();
  const headingId = settingsHeadingId(props.section);
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="sec-title" tabIndex={-1}>
        {t(SECTION_LABEL[props.section])}
      </h2>
      <p className="prose settings-intro">{t(SECTION_INTRO[props.section])}</p>
      {props.children}
    </section>
  );
}
```

```tsx
// web/src/features/settings/SettingsNav.tsx
"use client";

import Link from "next/link";
import { settingsHref, USER_SECTIONS, type SettingsSection } from "@/domain/settings";
import { useI18n } from "@/i18n/useI18n";
import { SECTION_LABEL } from "./labels";

/** D2: links, not tabs; each section is a URL and the unsaved guard intercepts in-app links. */
export function SettingsNav({ current }: { current: SettingsSection }) {
  const { t } = useI18n();
  return (
    <nav className="settings-nav" aria-label={t("settings.nav")}>
      <ul>
        {USER_SECTIONS.map((section) => (
          <li key={section}>
            <Link
              href={settingsHref(section)}
              aria-current={section === current ? "page" : undefined}
            >
              {t(SECTION_LABEL[section])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

```tsx
// web/src/features/settings/SettingsPage.tsx
"use client";

import { usePrefetchQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { channelStatusQueryOptions, notificationTemplatesQueryOptions } from "@/api/notifications";
import { notificationSettingsQueryOptions } from "@/api/notificationSettings";
import { platformsQueryOptions } from "@/api/platforms";
import { profileTimezoneQueryOptions, storageStatusQueryOptions } from "@/api/settings";
import type { SettingsSection } from "@/domain/settings";
import { SETTINGS_NUMBER } from "@/features/shell/navigation";
import { useDirtySections, type ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { AccountSection } from "./account/AccountSection";
import { GeneralSection } from "./general/GeneralSection";
import { NotificationsSection } from "./notifications/NotificationsSection";
import { SettingsNav } from "./SettingsNav";
import { useSettingsSection } from "./useSettingsSection";

export interface SettingsSectionProps {
  report: ReportDirty;
}

const SECTION_BODY: Readonly<Record<SettingsSection, (props: SettingsSectionProps) => ReactNode>> = {
  general: GeneralSection,
  notifications: NotificationsSection,
  account: AccountSection,
};

function usePrefetchSettings(): void {
  usePrefetchQuery(notificationSettingsQueryOptions());
  usePrefetchQuery(channelStatusQueryOptions());
  usePrefetchQuery(notificationTemplatesQueryOptions());
  usePrefetchQuery(storageStatusQueryOptions());
  usePrefetchQuery(profileTimezoneQueryOptions());
  usePrefetchQuery(platformsQueryOptions());
}

/** Einstellungen (spec 4.2): masthead, the in-page sub-nav and the open section only. */
export function SettingsPage() {
  const { t } = useI18n();
  const section = useSettingsSection();
  const { report } = useDirtySections();
  usePrefetchSettings();
  const Body = SECTION_BODY[section];
  return (
    <div className="page settings">
      <Masthead number={SETTINGS_NUMBER} title={t("nav.settings")} deck={t("settings.deck")} />
      <div className="settings-layout">
        <SettingsNav current={section} />
        <div className="settings-pane">
          <Body report={report} />
        </div>
      </div>
    </div>
  );
}
```

The three bodies start as frames, e.g.:

```tsx
// web/src/features/settings/general/GeneralSection.tsx
"use client";

import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";

/** D3: Allgemein (Task 5 adds language, theme and time zone; Task 6 the storage). */
export function GeneralSection(_props: SettingsSectionProps) {
  return <SettingsSectionFrame section="general" />;
}
```

(`NotificationsSection` and `AccountSection` alike with `section="notifications"` / `"account"`. If the lint rule against unused parameters fires on `_props`, omit the parameter: the component type still matches `SECTION_BODY`.)

`app/(app)/settings/page.tsx`:

```tsx
import { Suspense } from "react";
import { SettingsPage } from "@/features/settings/SettingsPage";

export default function SettingsRoute() {
  // The open section lives in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
```

`useReportDirty.ts`: change the parameter type `section: ProfileSection` to `section: string` and drop the now unused import (profile callers pass their section unchanged).

- [ ] **Step 5: Write `settings.css`** (port of the prototype `.settings`/`.snav`; values copied from `profile.css` so both pages look alike):

```css
/* Einstellungen, ported from docs/prototype/clickdummy-editorial.html (.settings, .snav, .chan). */
@layer components {
  .settings {
    container: settings / inline-size;
  }
  .settings .hint,
  .settings .btn-sm,
  .settings .seg button,
  .settings .tag {
    font-size: var(--fs-13);
  }
  .settings-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 40px;
    max-width: 1140px;
  }
  .settings-pane {
    min-width: 0;
    max-width: 900px;
  }
  .settings-nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    position: sticky;
    top: 24px;
  }
  .settings-nav a {
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-left: 3px solid transparent;
    color: var(--text-2);
    font-size: var(--fs-14);
    text-decoration: none;
  }
  .settings-nav a:hover {
    color: var(--text);
    background: var(--hover);
  }
  .settings-nav a[aria-current="page"] {
    border-left-color: var(--accent);
    color: var(--text);
    font-weight: 600;
  }
  .settings-intro {
    margin-top: 4px;
    max-width: 62ch;
  }
  .settings-section .form-max {
    max-width: 620px;
  }
  @container settings (max-width: 719px) {
    .settings-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .settings-nav ul {
      position: static;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      border: 1.5px solid var(--text);
      border-radius: var(--r-ctl);
      overflow: hidden;
    }
    .settings-nav li + li a {
      border-left: 1px solid var(--line-control);
    }
    .settings-nav a {
      justify-content: center;
      padding: 0 4px;
      border-left: 0;
      text-align: center;
      font-weight: 600;
    }
    .settings-nav a:focus-visible {
      outline-offset: -3px;
    }
    .settings-nav a[aria-current="page"] {
      background: var(--text);
      color: var(--bg);
    }
  }
}
```

- [ ] **Step 6: Write the unit stubs and the e2e fake server**

```ts
// web/tests/unit/support/settingsRoutes.ts
import type { CurrentUserBody } from "@/api/auth";
import type { NotificationSettingsBody } from "@/api/notificationSettings";
import type { StorageStatusBody } from "@/api/settings";
import type { RouteTable } from "./stubRoutes";

/** What GET /settings answers for the notification schema: masked secrets, plain values. */
export const STORED_NOTIFICATION_SETTINGS: NotificationSettingsBody & Record<string, unknown> = {
  pushover_user_key: "push-user",
  pushover_api_token: "__masked__",
  resend_api_key: "__masked__",
  resend_from_email: "jobs@example.com",
  mailjet_api_key: null,
  mailjet_secret_key: null,
  mailjet_from_email: null,
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "smtp-user",
  smtp_password: "__masked__",
  smtp_from_email: null,
  email_global_recipient: "me@example.com",
  timezone: "Europe/Berlin",
  language: "de",
  role: "Lead",
};
const STORAGE: StorageStatusBody = { available: true, connected: false, active: "NONE", email: null };
const USER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

export function settingsStubs(overrides: RouteTable = {}): RouteTable {
  return {
    "GET /settings": STORED_NOTIFICATION_SETTINGS,
    "GET /notification-settings/channels": {
      PUSHOVER: true,
      RESEND: true,
      MAILJET: false,
      SMTP: true,
    },
    "GET /notification-templates": [],
    "GET /storage/status": STORAGE,
    "GET /platforms": [],
    "GET /me": USER,
    ...overrides,
  };
}
```

`tests/e2e/support/settingsFixtures.ts` holds `SETTINGS_SECRETS` (the five channel secrets plus `google_drive_refresh_token`, values like `"PUSH_TOKEN_E2E_4711"`), `SETTINGS_NOTIFICATION_FIELDS` (the plain fields, `email_global_recipient: "me@example.com"`, `active_storage_service: "GOOGLE_DRIVE"`, `google_drive_email: "drive@example.com"`), `NOTIFICATION_TEMPLATES: NotificationTemplateBody[]` (one own Pushover "Kurz", one global E-Mail "Digest" with `is_admin: true`), `STORAGE_CONNECTED: StorageStatusBody` and `PASSWORD = "altes-passwort-1"`, typed with the `z.input` types (type-only imports from `src/api/*`), runtime constants only from `settingsPaths.ts`/`profilePaths.ts`.

```ts
// web/tests/e2e/support/settingsServer.ts (Task 4 part; Tasks 5-9 add their methods and routes)
import {
  NOTIFICATION_LIMITS,
  NOTIFICATION_SETTINGS_PATH,
  REQUIRED_FIELDS,
  STORAGE_STATUS_PATH,
} from "../../../src/api/settingsPaths";
import { NOTIFY_CHANNELS, CHANNEL_STATUS_PATH, NOTIFICATION_TEMPLATES_PATH } from "../../../src/api/platformPaths";
import { SECRET_MASK, SETTINGS_PATH } from "../../../src/api/profilePaths";
import type { NotificationTemplateBody } from "../../../src/api/notifications";
import type { StorageStatusBody } from "../../../src/api/settings";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { live, reply, type MockRoutes, type MutableRoutes, type Reply } from "./mockApi";
import { NOTIFICATION_TEMPLATES, SETTINGS_NOTIFICATION_FIELDS, SETTINGS_SECRETS, STORAGE_CONNECTED } from "./settingsFixtures";

type Row = Record<string, unknown>;
const SECRET_KEYS = Object.keys(SETTINGS_SECRETS);
const HTTP_UNPROCESSABLE = 422;
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_KEYS = ["resend_from_email", "mailjet_from_email", "smtp_from_email", "email_global_recipient"];

/** pydantic's 422 on one body field; the msg is free text the web never shows. */
const fieldRefusal = (field: string): Reply =>
  reply(HTTP_UNPROCESSABLE, { detail: [{ type: "value_error", loc: ["body", field], msg: "refused" }] });

/** core.py NotificationSettingsData (Task 1): the location of the first refused key, or null. */
function refusedKey(body: Row): string | null {
  for (const [key, value] of Object.entries(body)) {
    if (value === null) continue;
    if (key === "smtp_port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < NOTIFICATION_LIMITS.portMin || port > NOTIFICATION_LIMITS.portMax) return key;
    } else if (EMAIL_KEYS.includes(key) && !EMAIL_SHAPE.test(String(value))) return key;
    else if (String(value).length > NOTIFICATION_LIMITS.credential) return key;
  }
  return null;
}

/**
 * The settings endpoints by the rules of routers/settings.py, storage.py and auth.py: answers come
 * from this state, never from the request body.
 */
export class SettingsServer {
  profile: Row = { ...structuredClone(SETTINGS_NOTIFICATION_FIELDS), ...structuredClone(SETTINGS_SECRETS) };
  templates: NotificationTemplateBody[] = structuredClone(NOTIFICATION_TEMPLATES);
  storage: StorageStatusBody = structuredClone(STORAGE_CONNECTED);
  /** Every POST /notification-settings body, for "sends only its own fields" assertions. */
  readonly saved: Row[] = [];

  /** GET /settings: the whole row with secrets masked (deps._mask_profile). */
  settings(): Row {
    const masked: Row = { ...structuredClone(this.profile), language: "de", timezone: "Europe/Berlin" };
    for (const key of SECRET_KEYS) if (masked[key]) masked[key] = SECRET_MASK;
    return masked;
  }

  /** POST /notification-settings: writes only the keys sent (B2); a refused key writes nothing. */
  saveNotifications(sent: unknown): Reply | { status: string } {
    const body = sent as Row;
    this.saved.push(structuredClone(body));
    const refused = refusedKey(body);
    if (refused) return fieldRefusal(refused);
    Object.assign(this.profile, body);
    return { status: "saved" };
  }

  /** GET /notification-settings/channels: _channel_status's predicates. */
  channels(): Record<string, boolean> {
    return Object.fromEntries(
      NOTIFY_CHANNELS.map((channel) => [channel, REQUIRED_FIELDS[channel].every((field) => Boolean(this.profile[field]))]),
    );
  }
}

export function settingsRoutes(server = new SettingsServer(), extra: MockRoutes = {}): MutableRoutes {
  const routes: MutableRoutes = {
    ...AUTHENTICATED_ROUTES,
    [`GET ${SETTINGS_PATH}`]: live(() => server.settings()),
    [`POST ${NOTIFICATION_SETTINGS_PATH}`]: live((sent) => server.saveNotifications(sent)),
    [`GET ${CHANNEL_STATUS_PATH}`]: live(() => server.channels()),
    [`GET ${NOTIFICATION_TEMPLATES_PATH}`]: live(() => structuredClone(server.templates)),
    [`GET ${STORAGE_STATUS_PATH}`]: live(() => structuredClone(server.storage)),
  };
  return Object.assign(routes, extra);
}
```

(`SECRET_MASK` and `SETTINGS_PATH` are exported by `profilePaths.ts`; `refusedKey` must be split below 20 lines: one `portRefused(value)` helper.)

- [ ] **Step 7: Write the e2e spec**

```ts
// web/tests/e2e/settings.spec.ts
import type { Page } from "@playwright/test";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { SettingsServer, settingsRoutes } from "./support/settingsServer";
import { expect, test } from "./support/test";

const SECTIONS = [
  ["", "Allgemein"],
  ["?section=notifications", "Benachrichtigungen"],
  ["?section=account", "Konto"],
] as const;
const MIN_HIT_TARGET_PX = 44;
const subNav = (page: Page) => page.getByRole("navigation", { name: "Einstellungsbereiche" });

test("the sub-nav switches sections and Back walks them", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.goto("/settings");
  await subNav(page).getByRole("link", { name: "Konto" }).click();
  await expect(page).toHaveURL(/\/settings\?section=account$/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
});

test("the user menu's Konto link opens Konto", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/inbox");
  await page.getByRole("button", { name: /admin/ }).click();
  await page.getByRole("link", { name: "Konto" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
});

test("an unknown section shows Allgemein and keeps the URL", async ({ page, mockApi }) => {
  await mockApi(settingsRoutes());
  await page.goto("/settings?section=passwoerter");
  await expect(page.getByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
  await expect(page).toHaveURL(/section=passwoerter$/);
});

for (const [query, title] of SECTIONS) {
  test(`${title}: no horizontal scroll at 375 px, screenshots`, async ({ page, mockApi }) => {
    await mockApi(settingsRoutes(new SettingsServer()));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(`/settings${query}`);
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    const link = await subNav(page).getByRole("link", { name: title }).boundingBox();
    expect(link!.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    for (const [size, viewport] of SCREENSHOT_SIZES) {
      for (const scheme of COLOR_SCHEMES) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.mouse.move(0, 0);
        await saveScreenshot(page, `settings-${title.toLowerCase()}-${size}-${scheme}`);
      }
    }
  });
}
```

(The user button's accessible name is the username shown by `UserButton`; adapt the locator to the real name in `AUTHENTICATED_ROUTES` ("admin").)

- [ ] **Step 8: Run unit and e2e to verify they pass**, then **Step 9: Checkpoint** (format, five commands). Copy screenshots back.

---

### Task 5: Allgemein: language, theme and time zone

**Files:**
- Modify: `web/src/features/settings/general/GeneralSection.tsx`, `web/src/i18n/de.ts`, `web/src/i18n/en.ts`
- Create: `web/src/features/settings/general/TimeZoneField.tsx`
- Test: `web/tests/unit/features/settings/generalSection.test.tsx`, `web/tests/e2e/settingsGeneral.spec.ts`
- Modify: `web/tests/e2e/support/settingsServer.ts` (`saveTimezone`, `POST /timezone-preference`, `POST /language-preference`)

**Interfaces:**
- Consumes: `PreferenceSegs` (`features/shell/PreferenceOptions.tsx`), `profileTimezoneQueryOptions`, `saveTimezone`, `timeZoneOptions`, `SettingsSectionFrame`, `SectionState`, `SelectField`, `useToast`, `describeError`, `queryKeys.profileTimezone`.
- Produces: `TimeZoneField()`; `GeneralSection` renders `PreferencesBlock`, `TimeZoneField` and (Task 6) `StorageSettings`.

- [ ] **Step 1: Add the i18n keys**

```ts
  "settings.general.appearance": "Darstellung und Sprache", // "Appearance and language"
  "settings.general.languageHint": "Gilt für die Oberfläche und für Texte, die die KI schreibt.", // "Applies to the interface and to texts the AI writes."
  "settings.general.timezone": "Zeitzone", // "Time zone"
  "settings.general.timezoneHint": "Gilt für die Zeitpläne der Quellen.", // "Applies to the schedules of your sources."
  "settings.general.timezoneSaved": "Zeitzone gespeichert.", // "Time zone saved."
```

- [ ] **Step 2: Write the failing tests**

```tsx
// web/tests/unit/features/settings/generalSection.test.tsx (excerpt; same imports and mocks as settingsPage.test.tsx)
describe("Allgemein", () => {
  it("offers theme and language as segs that apply at once", async () => {
    stubRoutes(settingsStubs({ "POST /language-preference": { status: "saved", language: "en" } }));
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dunkel" }));
    expect(document.documentElement.dataset.mode).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { level: 2, name: "General" })).toBeVisible();
  });

  it("saves the time zone on change and toasts", async () => {
    const calls = stubRoutes(
      settingsStubs({ "POST /timezone-preference": { status: "saved", timezone: "Europe/Vienna" } }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.selectOptions(await screen.findByLabelText("Zeitzone"), "Europe/Vienna");
    await screen.findByText("Zeitzone gespeichert.");
    const post = calls.find((call) => call.method === "POST")!;
    expect(JSON.parse(post.body!)).toEqual({ timezone: "Europe/Vienna" });
  });

  it("keeps the stored zone selected when the save fails", async () => {
    stubRoutes(settingsStubs({ "POST /timezone-preference": () => jsonResponse(500, {}) }));
    renderWithProviders(<SettingsPage />);
    const select = await screen.findByLabelText("Zeitzone");
    await userEvent.selectOptions(select, "Europe/Vienna");
    await screen.findByRole("alert");
    expect(select).toHaveValue("Europe/Berlin");
  });
});
```

(The theme attribute: read `applyMode` in `src/theme/theme.ts` for the real attribute name — the spec uses `data-mode`.)

- [ ] **Step 3: Run to verify it fails.**

- [ ] **Step 4: Implement**

```tsx
// web/src/features/settings/general/TimeZoneField.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import { profileTimezoneQueryOptions, saveTimezone } from "@/api/settings";
import { timeZoneOptions } from "@/domain/settings";
import { useI18n } from "@/i18n/useI18n";
import { SelectField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";

const FALLBACK_ZONE = "Europe/Berlin";
const SUPPORTED_ZONES: readonly string[] = Intl.supportedValuesOf("timeZone");

function useTimezoneSave() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: saveTimezone,
    // The server may store a fallback; the cache takes what it answered.
    onSuccess: (stored) => {
      queryClient.setQueryData(queryKeys.profileTimezone, stored);
      toast.show({ tone: "success", message: t("settings.general.timezoneSaved") });
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** D3: saved at once; the select shows the stored zone until the server answered. */
export function TimeZoneField() {
  const { t } = useI18n();
  const zone = useQuery(profileTimezoneQueryOptions()).data ?? FALLBACK_ZONE;
  const save = useTimezoneSave();
  return (
    <SelectField
      id="settings-timezone"
      label={t("settings.general.timezone")}
      hint={t("settings.general.timezoneHint")}
      value={zone}
      disabled={save.isPending}
      onChange={(event) => save.mutate(event.target.value)}
    >
      {timeZoneOptions(zone, SUPPORTED_ZONES).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectField>
  );
}
```

(If `disabled` while pending makes the select lose focus in the browser, use `aria-busy` instead; the test asserts the value, not the attribute.)

```tsx
// web/src/features/settings/general/GeneralSection.tsx
"use client";

import { PreferenceSegs } from "@/features/shell/PreferenceOptions";
import { useI18n } from "@/i18n/useI18n";
import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { TimeZoneField } from "./TimeZoneField";

/** Usability #20: the same segs as the mobile "Mehr" sheet, so theme and language live here too. */
function PreferencesBlock() {
  const { t } = useI18n();
  return (
    <div className="settings-block">
      <h3 className="sec-title-sm">{t("settings.general.appearance")}</h3>
      <PreferenceSegs />
      <p className="hint">{t("settings.general.languageHint")}</p>
    </div>
  );
}

/** D3: every control here applies at once; there is no draft and no "Speichern". */
export function GeneralSection(_props: SettingsSectionProps) {
  return (
    <SettingsSectionFrame section="general">
      <div className="form-max">
        <PreferencesBlock />
        <TimeZoneField />
      </div>
    </SettingsSectionFrame>
  );
}
```

`settings.css`: add `.settings-block + .settings-block, .settings-block + .field { margin-top: 28px; }`. FakeServer: `timezone` state (default `"Europe/Berlin"`, returned by `settings()`), `POST /timezone-preference` stores a zone from a small known list or falls back to `"Europe/Berlin"` (routers/settings.py), `POST /language-preference` answers `{status: "saved", language}` with `de|en` else `de`.

- [ ] **Step 5: E2E** `settingsGeneral.spec.ts`: theme seg sets dark mode and survives a reload (stored preference); time zone change sends exactly `{timezone}`; screenshots of Allgemein (light/dark, 1440/390).
- [ ] **Step 6: Run to verify pass**, then **Step 7: Checkpoint.**

---

### Task 6: Allgemein: Speicherort (database or Google Drive)

**Files:**
- Create: `web/src/features/settings/general/StorageSettings.tsx`, `DisconnectDriveDialog.tsx`, `useDriveCallback.ts`, `useStorageActions.ts`
- Modify: `web/src/features/settings/general/GeneralSection.tsx` (render `StorageSettings` and the callback notice), `settings.css` (`.radio-row`), `de.ts`, `en.ts`, `tests/e2e/support/settingsServer.ts` (toggle, disconnect)
- Test: `web/tests/unit/features/settings/storageSettings.test.tsx`, `web/tests/e2e/settingsStorage.spec.ts`

**Interfaces:**
- Consumes: `storageStatusQueryOptions`, `toggleStorage`, `disconnectDrive`, `driveLoginUrl`, `driveCallbackOf`, `SETTINGS_HREF`, `Dialog`, `PanelHeader`, `Notice`, `Button`, `useToast`, `describeError`.
- Produces: `StorageSettings()`, `useDriveCallback(): DriveCallback | null` (reads once, then `router.replace(SETTINGS_HREF)`), `useStorageActions()` -> `{ choose(service), connect(), disconnect, busy }`, `DriveCallbackNotice()`.

- [ ] **Step 1: i18n keys**

```ts
  "settings.storage.title": "Speicherort", // "Storage"
  "settings.storage.intro": "Wo erstellte PDFs, Vorlagen und Nachweise abgelegt werden.", // "Where generated PDFs, templates and proofs are stored."
  "settings.storage.database": "Datenbank", // "Database"
  "settings.storage.databaseHint": "Alles bleibt auf deinem Server.", // "Everything stays on your server."
  "settings.storage.drive": "Google Drive", // "Google Drive"
  "settings.storage.driveHint": "Dateien liegen in deinem Google Drive.", // "Files are stored in your Google Drive."
  "settings.storage.driveUnavailable": "Google Drive ist auf diesem Server nicht eingerichtet.", // "Google Drive is not set up on this server."
  "settings.storage.connect": "Mit Google Drive verbinden", // "Connect Google Drive"
  "settings.storage.connectedAs": "Verbunden als {email}", // "Connected as {email}"
  "settings.storage.disconnect": "Trennen", // "Disconnect"
  "settings.storage.disconnectTitle": "Google Drive trennen?", // "Disconnect Google Drive?"
  "settings.storage.disconnectText": "Neue Dateien werden danach in der Datenbank gespeichert. Bereits in Drive gespeicherte Dateien bleiben dort.", // "New files are then stored in the database. Files already in Drive stay there."
  "settings.storage.disconnected": "Google Drive getrennt.", // "Google Drive disconnected."
  "settings.storage.saved": "Speicherort gespeichert.", // "Storage saved."
  "settings.storage.callbackConnected": "Google Drive ist verbunden.", // "Google Drive is connected."
  "settings.storage.callbackFailed": "Google Drive konnte nicht verbunden werden. Versuche es erneut.", // "Google Drive could not be connected. Please try again."
```

- [ ] **Step 2: Write the failing tests** (`storageSettings.test.tsx`):
  - "Drive not available: its radio is disabled with the reason" (stub `GET /storage/status` `{available: false, ...}`; `getByRole("radio", {name: "Google Drive"})` disabled; text `settings.storage.driveUnavailable` visible and linked by `aria-describedby`).
  - "connect refreshes before navigating": stub status, spy `window.location.assign` (`vi.spyOn(window.location, "assign")` through `Object.defineProperty` as in `useLogout` tests); click "Mit Google Drive verbinden"; expect the second `GET /storage/status` call to precede `assign` with `"<API_BASE_URL>/storage/google/login"`.
  - "choosing Datenbank posts the toggle and toasts" (`POST /storage/toggle` body `{service: "NONE"}`).
  - "Trennen asks first and then posts disconnect".
  - "the callback parameters show one notice and are removed": `liveNavigation.reset("/settings?tab=storage&success=google_connected")`; expect `Notice` text and `liveNavigation.current()` to be `/settings`.
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement**

```ts
// web/src/features/settings/general/useDriveCallback.ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { driveCallbackOf, SETTINGS_HREF, type DriveCallback } from "@/domain/settings";

/** D4: the OAuth callback's outcome, read once; the parameters leave the URL (replace, not push). */
export function useDriveCallback(): DriveCallback | null {
  const params = useSearchParams();
  const router = useRouter();
  const [outcome] = useState(() => driveCallbackOf(new URLSearchParams(params.toString())));
  useEffect(() => {
    if (outcome) router.replace(SETTINGS_HREF, { scroll: false });
  }, [outcome, router]);
  return outcome;
}
```

```ts
// web/src/features/settings/general/useStorageActions.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import type { StorageService } from "@/api/settingsPaths";
import { disconnectDrive, driveLoginUrl, storageStatusQueryOptions, toggleStorage } from "@/api/settings";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

function useStorageMutation<T>(run: (input: T) => Promise<void>, doneKey: "settings.storage.saved" | "settings.storage.disconnected") {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: run,
    onSuccess: () => toast.show({ tone: "success", message: t(doneKey) }),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.storageStatus }),
  });
}

export function useStorageActions() {
  const queryClient = useQueryClient();
  const choose = useStorageMutation((service: StorageService) => toggleStorage(service), "settings.storage.saved");
  const disconnect = useStorageMutation(() => disconnectDrive(), "settings.storage.disconnected");
  // The login is a top-level GET that only carries cookies: an authenticated call through the
  // API client first lets its single-flight refresh renew an expired access cookie (Review Focus 5).
  const connect = async () => {
    await queryClient.fetchQuery({ ...storageStatusQueryOptions(), staleTime: 0 });
    window.location.assign(driveLoginUrl());
  };
  return { choose, disconnect, connect };
}
```

`StorageSettings.tsx`: a `SectionState` over `storageStatusQueryOptions()`; inside, a `<fieldset className="settings-block">` with `<legend className="sec-title-sm">` "Speicherort", the intro, two `.radio-row` labels (`<input type="radio" name="storage">`, title, hint); the Drive radio is `disabled={!status.available}` with `aria-describedby` on the unavailable hint; `checked` follows `status.active`; `onChange` calls `choose.mutate(service)` — for Drive only when `connected` (otherwise the change selects nothing and focuses the connect button). Under the Drive row: not connected -> `<Button size="sm" onClick={connect}>` "Mit Google Drive verbinden" (hidden while unavailable); connected -> "Verbunden als {email}" (`--ok` with a check icon) and `<Button size="sm" variant="ghost">` "Trennen" opening `DisconnectDriveDialog` (title, text, a danger "Trennen" and "Abbrechen"; confirm calls `disconnect.mutate()`). `DriveCallbackNotice` renders `<Notice tone="info">` or `<Notice tone="error">` for the outcome of `useDriveCallback()` above the preferences in `GeneralSection`. Split components to stay under 20 lines each.

CSS (`settings.css`): `.radio-row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; min-height: 44px; }`, `.radio-row + .radio-row { border-top: 1px solid var(--line); }`, `.radio-row input { margin-top: 3px; }`, `.radio-row .meta { font-size: var(--fs-13); }`.

FakeServer: `toggleStorage(sent)` (400 `"Google Drive not connected"` when Drive is chosen without a connection; else stores `active`), `disconnect()` (clears `connected`, `email`, sets `active: "NONE"` and drops `google_drive_refresh_token` from `profile`); routes `POST /storage/toggle`, `POST /storage/google/disconnect`.

- [ ] **Step 5: E2E** `settingsStorage.spec.ts`: "Drive not configured" (radio disabled, reason visible); "callback connected notice and clean URL" (`page.goto("/settings?tab=storage&success=google_connected")`, notice visible, `toHaveURL(/\/settings$/)`); "Trennen asks and the database becomes active"; "connect navigates to the API login" (route `GET /storage/google/login` answered by a `page.route` on the mock prefix with a 302 to `/settings?success=google_connected`, assert the notice). Screenshots of the connected state.
- [ ] **Step 6: Run to verify pass**, **Step 7: Checkpoint.**

---

### Task 7: Benachrichtigungen: channels with write-only credentials, test send, default recipient, per-source overview

**Files:**
- Modify: `web/src/features/settings/notifications/NotificationsSection.tsx`, `settings.css` (`.chan*`), `de.ts`, `en.ts`, `tests/e2e/support/settingsServer.ts` (tests, rate limit)
- Create: `web/src/features/settings/notifications/ChannelList.tsx`, `ChannelRow.tsx`, `ChannelForm.tsx`, `ChannelFields.tsx`, `ChannelTest.tsx`, `RemoveChannelDialog.tsx`, `RecipientForm.tsx`, `SourceOverview.tsx`, `useChannelSave.ts`
- Test: `web/tests/unit/features/settings/channels.test.tsx`, `web/tests/e2e/settingsChannels.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`notificationSettingsQueryOptions`, `saveNotificationSettings`, `sendSettingsTest`, `channelDraftOf`, `channelPatch`, `channelErrors`, `removalPatch`, `channelDetail`, `CHANNEL_FIELDS`), `channelStatusQueryOptions`, `platformsQueryOptions`, `NOTIFY_CHANNELS`, `CHANNEL_LABEL`, `DrawerSection`, `useSectionForm`, `useReportDirty`, `SectionState`, `TextField`, `Dialog`, `PanelHeader`, `Button`, `sourcesHref`, `fieldErrorsFrom`.
- Produces: `useChannelSave()` -> mutation over `NotificationPatch` (scope `{ id: "notification-settings" }`, invalidates `queryKeys.notificationSettings` and `queryKeys.channelStatus`, toasts `sources.saved`); `ChannelList({ report })`; `FIELD_LABEL: Record<ChannelField, MessageKey>`; `PROBLEM_TEXT: Record<ChannelProblem, MessageKey>`.

- [ ] **Step 1: i18n keys** (add each; EN in comment):

```ts
  "settings.notify.channels": "Kanäle", // "Channels"
  "settings.notify.configured": "Eingerichtet", // "Set up"
  "settings.notify.configuredDetail": "Eingerichtet · {detail}", // "Set up · {detail}"
  "settings.notify.notConfigured": "Nicht eingerichtet", // "Not set up"
  "settings.notify.setUp": "Einrichten", // "Set up"
  "settings.notify.change": "Ändern", // "Change"
  "settings.notify.close": "Schließen", // "Close"
  "settings.notify.test": "Testen", // "Test"
  "settings.notify.testLabel": "{channel} testen", // "Test {channel}"
  "settings.notify.saveFirst": "Erst speichern", // "Save first"
  "settings.notify.secretStored": "Gespeichert. Leer lassen, um ihn zu behalten.", // "Stored. Leave empty to keep it."
  "settings.notify.secretMissing": "Noch nicht gespeichert.", // "Not stored yet."
  "settings.notify.remove": "Kanal entfernen", // "Remove channel"
  "settings.notify.removeTitle": "Zugangsdaten für {channel} löschen?", // "Delete the credentials for {channel}?"
  "settings.notify.removeText": "Quellen, die über {channel} benachrichtigen, senden danach nichts mehr.", // "Sources that notify through {channel} will no longer send anything."
  "settings.notify.removed": "Zugangsdaten für {channel} gelöscht.", // "Credentials for {channel} deleted."
  "settings.notify.testTitle": "Test-E-Mail senden", // "Send a test email"
  "settings.notify.testRecipient": "Empfänger", // "Recipient"
  "settings.notify.testRecipientHint": "Leer lassen für den Standard-Empfänger.", // "Leave empty for the default recipient."
  "settings.notify.testSend": "Senden", // "Send"
  "settings.notify.recipient": "Standard-Empfänger", // "Default recipient"
  "settings.notify.recipientHint": "Für Test-E-Mails ohne eigenen Empfänger.", // "For test emails without their own recipient."
  "settings.notify.perSource": "Pro Quelle", // "Per source"
  "settings.notify.perSourceNone": "Keine Quelle benachrichtigt.", // "No source sends notifications."
  "settings.notify.perSourceLine": "{name}: {channels}", // "{name}: {channels}"
  "settings.field.pushover_user_key": "User Key", // "User key"
  "settings.field.pushover_api_token": "API-Token", // "API token"
  "settings.field.resend_api_key": "API-Schlüssel", // "API key"
  "settings.field.resend_from_email": "Absender", // "Sender"
  "settings.field.mailjet_api_key": "API-Schlüssel", // "API key"
  "settings.field.mailjet_secret_key": "Secret Key", // "Secret key"
  "settings.field.mailjet_from_email": "Absender", // "Sender"
  "settings.field.smtp_host": "Server", // "Server"
  "settings.field.smtp_port": "Port", // "Port"
  "settings.field.smtp_user": "Benutzer", // "User"
  "settings.field.smtp_password": "Passwort", // "Password"
  "settings.field.smtp_from_email": "Absender (optional)", // "Sender (optional)"
  "settings.problem.required": "Bitte ausfüllen.", // "Please fill in."
  "settings.problem.email": "Bitte eine E-Mail-Adresse wie name@beispiel.de eingeben.", // "Please enter an email address like name@example.com."
  "settings.problem.port": "Bitte eine Zahl von 1 bis 65535 eingeben.", // "Please enter a number from 1 to 65535."
  "settings.problem.tooLong": "Zu lang.", // "Too long."
```

- [ ] **Step 2: Write the failing tests** (`channels.test.tsx`, using `settingsStubs`, `liveNavigation.reset("/settings?section=notifications")`):

```tsx
describe("channels", () => {
  it("shows the state from the channel booleans and never a secret", async () => {
    stubRoutes(settingsStubs());
    const { container } = renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Eingerichtet · smtp.example.com")).toBeVisible();
    expect(screen.getByText("Nicht eingerichtet")).toBeVisible(); // Mailjet
    expect(container.innerHTML).not.toContain("__masked__");
  });

  it("Speichern sends only the changed SMTP field", async () => {
    const calls = stubRoutes(settingsStubs({ "POST /notification-settings": { status: "saved" } }));
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "SMTP ändern" }));
    const host = screen.getByLabelText("Server");
    await userEvent.clear(host);
    await userEvent.type(host, "mail.example.org");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText("Gespeichert.");
    const post = calls.find((call) => call.method === "POST")!;
    expect(JSON.parse(post.body!)).toEqual({ smtp_host: "mail.example.org" });
  });

  it("an untouched secret is never sent and its input starts empty", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Pushover ändern" }));
    const token = screen.getByLabelText("API-Token");
    expect(token).toHaveValue("");
    expect(token).toHaveAttribute("type", "password");
    expect(screen.getByText("Gespeichert. Leer lassen, um ihn zu behalten.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAttribute("aria-disabled", "true");
  });

  it("a new channel needs every field before it is sent", async () => {
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mailjet einrichten" }));
    await userEvent.type(screen.getByLabelText("Absender"), "mj@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("Testen waits while the form is dirty", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "SMTP ändern" }));
    await userEvent.type(screen.getByLabelText("Benutzer"), "x");
    expect(screen.getByRole("button", { name: "SMTP testen" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Erst speichern")).toBeVisible();
  });

  it("maps 400 and 429 of a test to their sentences", async () => {
    stubRoutes(
      settingsStubs({
        "POST /notification-settings/test-pushover": () => jsonResponse(400, { detail: "Pushover credentials not configured" }),
      }),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Pushover testen" }));
    expect(await screen.findByText("Für Pushover fehlen Zugangsdaten oder Empfänger.")).toBeVisible();
    expect(screen.queryByText(/credentials not configured/)).toBeNull();
  });

  it("Kanal entfernen asks, then sends null for every field of the channel", async () => {
    const calls = stubRoutes(settingsStubs({ "POST /notification-settings": { status: "saved" } }));
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Resend ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Kanal entfernen" }));
    const dialog = await screen.findByRole("dialog", { name: "Zugangsdaten für Resend löschen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Kanal entfernen" }));
    const post = await waitFor(() => calls.find((call) => call.method === "POST")!);
    expect(JSON.parse(post.body!)).toEqual({ resend_api_key: null, resend_from_email: null });
  });
});
```

- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** Key pieces (each component below 20 lines; split where Prettier grows them):

```ts
// web/src/features/settings/notifications/useChannelSave.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { saveNotificationSettings, type NotificationPatch } from "@/api/notificationSettings";
import { queryKeys } from "@/api/queryKeys";
import { CHANNEL_FIELDS, type ChannelField } from "@/api/settingsPaths";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

const ALL_FIELDS = new Set<string>(Object.values(CHANNEL_FIELDS).flat());
export const toChannelField = (field: string): ChannelField | null =>
  ALL_FIELDS.has(field) ? (field as ChannelField) : null;

/** Writes to the settings row run one after the other (one scope), like the profile saves. */
export const NOTIFICATION_SAVE_SCOPE = { id: "notification-settings" };

/** D5: one partial POST; the drawer's channel booleans are refreshed with it. */
export function useChannelSave(successText: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: NOTIFICATION_SAVE_SCOPE,
    mutationFn: (patch: NotificationPatch) => saveNotificationSettings(patch),
    onSuccess: () => toast.show({ tone: "success", message: successText }),
    onError: (error) => {
      // Field refusals show on their fields (the form maps them); anything else is one toast.
      if (fieldErrorsFrom(error, toChannelField).length === 0)
        toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelStatus });
    },
  });
}
```

`ChannelList`: `SectionState` over `notificationSettingsQueryOptions()`; reads `channelStatusQueryOptions()` (unknown -> `false`); holds `open: NotifyChannel | null` in state; renders `<ul className="chan-list">` with a `ChannelRow` per `NOTIFY_CHANNELS` entry; opening another channel while the open form is dirty goes through `useUnsavedChanges().requestLeave()` first (the same dialog as in-app links).

`ChannelRow({ channel, settings, configured, open, onToggle, report })`: `<li className="chan">` with name (`t(CHANNEL_LABEL[channel])`), state line (`Icon Check` + `settings.notify.configuredDetail` with `channelDetail`, or `settings.notify.notConfigured`), buttons: `ChannelTest` when configured, and the toggle button whose accessible name is "{channel} ändern" / "{channel} einrichten" (visible text "Ändern"/"Einrichten", `aria-label` with the channel; `aria-expanded={open}`, `aria-controls` the form id); when `open`, `ChannelForm` below.

`ChannelForm({ channel, settings, configured, report, onClose })`: `useSectionForm(channelDraftOf(channel, settings), (draft) => channelPatch(channel, draft, settings))` (the effect function makes untouched secrets not dirty); `useReportDirty(report, \`chan-${channel}\`, form.dirty)`; submit: `channelErrors(...)` first -> field errors; then `save.mutate(channelPatch(...), { onSuccess: () => { onClose(); }, onError: (error) => setErrors(serverErrors(error)) })` where `serverErrors` maps `fieldErrorsFrom(error, toChannelField)` to `"tooLong"` (the server's limits; the shape refusals were caught client-side). Inside a `DrawerSection` (id `settings-chan-${channel}`, title "{channel}"), `ChannelFields` renders one `TextField` per `CHANNEL_FIELDS[channel]`: secrets `type="password" autoComplete="new-password"` with the stored/missing hint; emails `type="email" inputMode="email" autoComplete="off"`; the port `inputMode="numeric"`, placeholder `DEFAULT_SMTP_PORT`; error text from `PROBLEM_TEXT`. Under the fields of a configured channel: `<Button variant="ghost" size="sm">` "Kanal entfernen" -> `RemoveChannelDialog` (danger confirm; `save.mutate(removalPatch(channel))` with the success text `settings.notify.removed`). Closing returns focus to the row's toggle button (pass a ref; focus in the close handler, not in an effect).

`ChannelTest({ channel, dirty, recipient })`: `useMutation(sendSettingsTest)`; Pushover sends on click; email channels open a `Dialog` "Test-E-Mail senden" with a `TextField` "Empfänger" (`type="email"`, prefilled with the stored recipient, hint `settings.notify.testRecipientHint`) and "Senden"/"Abbrechen". Outcomes: success `sources.notify.testSent`, `BAD_REQUEST` -> `sources.notify.testMissing`, `RATE_LIMITED` -> `describeError`, else `sources.notify.testFailed` (all with `{channel}`). Inactive with "Erst speichern" (visible, `aria-describedby`) while `dirty`.

`RecipientForm`: a `DrawerSection` "Standard-Empfänger" with one email `TextField`, `useSectionForm({ email_global_recipient })`, client check `email`/`tooLong`, sends `{ email_global_recipient: value.trim() || null }`.

`SourceOverview`: `useQuery(platformsQueryOptions())`; sources with `notification_adapters.length > 0` as `<li><Link href={sourcesHref({ sourceId: platform.id })}>{name}</Link>: {channels joined}</li>`; empty -> `settings.notify.perSourceNone`.

`NotificationsSection`: frame with `<h3>` "Kanäle" + `ChannelList`, `RecipientForm`, (Task 8) `TemplateLibrary`, `SourceOverview`.

CSS (`settings.css`, port of the prototype `.chan`): `.chan-list { list-style: none; margin: 8px 0 0; padding: 0; }`, `.chan { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; padding: 14px 0; border-top: 1px solid var(--line); }`, `.chan-name { font-weight: 600; }`, `.chan-state { font-size: var(--fs-13); color: var(--text-2); display: flex; gap: 6px; align-items: center; }`, `.chan-state.on { color: var(--ok); }`, `.chan-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }`, `.chan-form { grid-column: 1 / -1; }`; under the 720 px container width `.chan { grid-template-columns: minmax(0, 1fr); } .chan-actions { justify-content: flex-start; }` and buttons `min-height: 44px`.

FakeServer additions: `tests: string[]` (channel per call), `testCount`, `test(channel, sent)`: after five calls answer `reply(429, { error: "Rate limit exceeded: 5 per 1 minute" })`; a channel failing its `REQUIRED_FIELDS` predicate answers `reply(400, { detail: "<Channel> credentials not configured" })`; an email channel without `recipient` and without `email_global_recipient` answers 400 `"No recipient provided"`; else `{ ok: true }`. Routes `POST /notification-settings/test-{pushover,resend,mailjet,smtp}` built from `notificationTestPath`.

- [ ] **Step 5: E2E** `settingsChannels.spec.ts`: "an unconfigured channel's link in the source drawer lands here" (`page.goto("/sources?quelle=<id>")` with `sourcesRoutes` plus `settingsRoutes` merged, click "In den Einstellungen einrichten", expect heading Benachrichtigungen); "set up Mailjet" (fills three fields, sends exactly those three, row turns "Eingerichtet · mj@example.com", the FakeServer's channel boolean is true); "the sixth test says wait"; "no secret or mask in the page" (`expect(await page.content()).not.toContain("__masked__")` and none of `SETTINGS_SECRETS` values); screenshots with an open SMTP form.
- [ ] **Step 6: Run to verify pass**, **Step 7: Checkpoint.**

---

### Task 8: Benachrichtigungen: notification template editor with server preview (carried G10)

**Files:**
- Create: `web/src/features/settings/notifications/templates/TemplateLibrary.tsx`, `TemplateEditor.tsx`, `TemplatePreviewDialog.tsx`, `DeleteNotificationTemplateDialog.tsx`, `useTemplateEditor.ts`, `templateDraft.ts`
- Modify: `NotificationsSection.tsx` (render `TemplateLibrary`), `settings.css`, `de.ts`, `en.ts`, `tests/e2e/support/settingsServer.ts` (template CRUD and preview)
- Test: `web/tests/unit/features/settings/templateDraft.test.ts`, `web/tests/unit/features/settings/templateLibrary.test.tsx`, `web/tests/e2e/settingsTemplates.spec.ts`

**Interfaces:**
- Consumes: `notificationTemplatesQueryOptions`, `createNotificationTemplate`, `updateNotificationTemplate`, `deleteNotificationTemplate`, `previewNotificationTemplate`, `templatesFor` (`features/sources/drawer/notifyDraft.ts`), `CHANNEL_TEMPLATE_TYPES`, `EDITABLE_TEMPLATE_TYPES`, `NOTIFICATION_LIMITS`, `previewDocument`, `useCurrentUser`, `Seg`, `TextField`, `TextAreaField`, `CheckField`, `Dialog`, `Tag`, `EmptyState`.
- Produces: `TemplateDraft { name: string; kind: "push" | "email"; content: string; global: boolean }`, `templateDraftOf(template | null)`, `templateProblems(draft)` -> `Partial<Record<"name" | "content", "required" | "tooLong">>`, `typeOfKind(kind)` (`"PUSHOVER"` / `"RESEND"`), `kindOfType(type)`, `canEdit(template, isAdmin)`, `scopeOf(template)`.

- [ ] **Step 1: i18n keys**

```ts
  "settings.templates.title": "Vorlagen", // "Templates"
  "settings.templates.intro": "Texte für Benachrichtigungen. In der Quelle wählst du, welche Vorlage sie verwendet.", // "Texts for notifications. Each source picks the template it uses."
  "settings.templates.copyHint": "Quellen behalten ihre Kopie. Wähle die Vorlage in der Quelle erneut, damit sie den geänderten Text verwendet.", // "Sources keep their copy. Pick the template again in the source to use the changed text."
  "settings.templates.push": "Pushover", // "Pushover"
  "settings.templates.email": "E-Mail", // "Email"
  "settings.templates.global": "Für alle", // "For everyone"
  "settings.templates.new": "Neue Vorlage", // "New template"
  "settings.templates.edit": "{name} bearbeiten", // "Edit {name}"
  "settings.templates.delete": "{name} löschen", // "Delete {name}"
  "settings.templates.deleteTitle": "Vorlage löschen?", // "Delete template?"
  "settings.templates.deleteText": "Quellen, die diesen Text kopiert haben, behalten ihn.", // "Sources that copied this text keep it."
  "settings.templates.deleted": "Vorlage gelöscht.", // "Template deleted."
  "settings.templates.empty": "Noch keine Vorlage. Ohne Vorlage senden Quellen einen Standardtext.", // "No template yet. Without one, sources send a default text."
  "settings.templates.name": "Name", // "Name"
  "settings.templates.kind": "Art", // "Type"
  "settings.templates.content": "Text", // "Text"
  "settings.templates.forAll": "Für alle Benutzer", // "For all users"
  "settings.templates.variables": "Platzhalter", // "Placeholders"
  "settings.templates.variablesPush": "$title, $company, $match_score, $reasoning, $url", // same
  "settings.templates.variablesEmail": "{{#jobs}} … {{/jobs}} wiederholt den Block je Stelle mit $title, $company, $match_score, $reasoning, $url. Außerhalb: $userName, $jobCount, $platform_name, $jobs_html.", // "{{#jobs}} … {{/jobs}} repeats the block for each job with $title, $company, $match_score, $reasoning, $url. Outside: $userName, $jobCount, $platform_name, $jobs_html."
  "settings.templates.preview": "Vorschau", // "Preview"
  "settings.templates.previewHint": "Mit einer Beispielstelle. Es wird nichts gesendet.", // "With a sample job. Nothing is sent."
  "settings.templates.saved": "Vorlage gespeichert.", // "Template saved."
  "settings.templates.required": "Bitte ausfüllen.", // "Please fill in."
  "settings.templates.tooLong": "Zu lang.", // "Too long."
```

- [ ] **Step 2: Write the failing tests**

```ts
// web/tests/unit/features/settings/templateDraft.test.ts
import { describe, expect, it } from "vitest";
import {
  canEdit,
  kindOfType,
  templateDraftOf,
  templateProblems,
  typeOfKind,
} from "@/features/settings/notifications/templates/templateDraft";

const OWN = { id: 1, name: "Kurz", type: "PUSHOVER", content: "$title", is_admin: false };
const GLOBAL = { id: 2, name: "Digest", type: "MAILJET", content: "<p/>", is_admin: true };

describe("template drafts", () => {
  it("map every email type to the email kind and create email as RESEND", () => {
    expect(kindOfType("MAILJET")).toBe("email");
    expect(kindOfType("SMTP")).toBe("email");
    expect(typeOfKind("email")).toBe("RESEND");
    expect(typeOfKind("push")).toBe("PUSHOVER");
  });
  it("let members edit their own templates, admins also global ones", () => {
    expect(canEdit(OWN, false)).toBe(true);
    expect(canEdit(GLOBAL, false)).toBe(false);
    expect(canEdit(GLOBAL, true)).toBe(true);
  });
  it("check name and content like the server", () => {
    expect(templateProblems({ ...templateDraftOf(null), name: "   ", content: "x" })).toEqual({ name: "required" });
    expect(templateProblems({ ...templateDraftOf(null), name: "n".repeat(101), content: "x" })).toEqual({ name: "tooLong" });
    expect(templateProblems({ ...templateDraftOf(null), name: "Ok", content: "" })).toEqual({ content: "required" });
  });
});
```

`templateLibrary.test.tsx`: "lists own and global templates per kind with the 'Für alle' tag"; "a member has no Bearbeiten for a global template"; "Neue Vorlage saves name, type RESEND and text through POST /notification-templates"; "an admin's 'Für alle Benutzer' posts to /admin/notification-templates"; "the preview frame has an empty sandbox and no script" (stub `POST /notification-templates/preview` `{html: true, body: "<script>window.__x=1</script><p>Hi</p>"}`; open Vorschau; the `iframe` has `sandbox=""`, its `srcdoc` contains no `<script`, and `window.__x` is undefined); "a push preview is text, not a frame"; "Löschen asks first and moves focus to the section heading".

- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement**

```ts
// web/src/features/settings/notifications/templates/templateDraft.ts
import type { NotificationTemplate } from "@/api/notifications";
import { NOTIFICATION_LIMITS, type EditableTemplateType, type TemplateScope } from "@/api/settingsPaths";

export type TemplateKind = "push" | "email";
export interface TemplateDraft {
  name: string;
  kind: TemplateKind;
  content: string;
  /** Admins only, on creation: a global template (admin endpoints). */
  global: boolean;
}
export type TemplateProblem = "required" | "tooLong";
const PUSH_TYPE = "PUSHOVER";

export const kindOfType = (type: string): TemplateKind => (type === PUSH_TYPE ? "push" : "email");
export const typeOfKind = (kind: TemplateKind): EditableTemplateType =>
  kind === "push" ? "PUSHOVER" : "RESEND";

export function templateDraftOf(template: NotificationTemplate | null): TemplateDraft {
  if (!template) return { name: "", kind: "email", content: "", global: false };
  return { name: template.name, kind: kindOfType(template.type), content: template.content, global: template.is_admin };
}

export const scopeOf = (template: { is_admin: boolean }): TemplateScope =>
  template.is_admin ? "global" : "own";

export const canEdit = (template: { is_admin: boolean }, isAdmin: boolean): boolean =>
  !template.is_admin || isAdmin;

/** routers/settings.py via core.py (Task 1): name trimmed 1-100, text 1-100,000. */
export function templateProblems(draft: TemplateDraft): Partial<Record<"name" | "content", TemplateProblem>> {
  const problems: Partial<Record<"name" | "content", TemplateProblem>> = {};
  const name = draft.name.trim();
  if (!name) problems.name = "required";
  else if (name.length > NOTIFICATION_LIMITS.templateName) problems.name = "tooLong";
  if (!draft.content) problems.content = "required";
  else if (draft.content.length > NOTIFICATION_LIMITS.templateContent) problems.content = "tooLong";
  return problems;
}
```

`useTemplateEditor()`: create/update/delete mutations (scope `{ id: "notification-templates" }`), each invalidating `queryKeys.notificationTemplates` (the drawer reads the same key) and toasting; create sends `{ name: name.trim(), type: typeOfKind(kind), content }` to `scope = draft.global ? "global" : "own"`; update sends `{ name, content }` to `scopeOf(template)`; field refusals (`fieldErrorsFrom` on `name`/`content`) map to `tooLong`.

`TemplateLibrary`: `SectionState` over `notificationTemplatesQueryOptions()`; `useCurrentUser()` for `isAdmin`; two groups (Pushover: `templatesFor("PUSHOVER", list)`; E-Mail: `templatesFor("RESEND", list)`), each a `<ul>` of rows: name, `Tag` "Für alle" for `is_admin`, buttons "Bearbeiten" (`aria-label` "{name} bearbeiten", only when `canEdit`) and "Löschen" (same rule, danger ghost, `DeleteNotificationTemplateDialog`); `EmptyState` when both are empty; "Neue Vorlage" button; the copy hint (`settings.templates.copyHint`) as a `Notice tone="info"` above the list. Only one editor open at a time (`editing: number | "new" | null`), reported to `useReportDirty(report, "templates", dirty)`.

`TemplateEditor({ template, isAdmin, onDone })`: a `DrawerSection` (id `settings-template-editor`) with `TextField` Name, `Seg` Art (Pushover / E-Mail; read-only text when editing an existing template, since the type cannot change), `TextAreaField` Text (rows 10, `spellCheck={false}`, class `code`), the variables hint for the kind, `CheckField` "Für alle Benutzer" for admins on creation only, a ghost "Vorschau" button (opens `TemplatePreviewDialog` with the current draft; disabled while the text is over the limit) and "Speichern".

```tsx
// web/src/features/settings/notifications/templates/TemplatePreviewDialog.tsx (core)
function PreviewBody({ preview }: { preview: TemplatePreview }) {
  const { t } = useI18n();
  if (!preview.html) return <pre className="template-preview-text">{preview.body}</pre>;
  // Untrusted HTML (Global Constraints): empty sandbox, link targets removed, editor CSP prepended.
  return (
    <iframe
      className="template-preview-frame"
      title={t("settings.templates.preview")}
      sandbox=""
      srcDoc={previewDocument(preview.body)}
    />
  );
}
```

The dialog runs `useQuery({ queryKey: ["notification-preview", type, content], queryFn: () => previewNotificationTemplate({ type, content }), staleTime: Infinity, gcTime: 0 })` (no new `queryKeys` entry: the key is local and never invalidated; if the reviewer prefers, add `notificationPreview(type, content)` to `queryKeys`), shows `ListLoading` / `ListError` / `PreviewBody`, plus the hint `settings.templates.previewHint`.

CSS: `.template-preview-frame { width: 100%; min-height: 420px; border: 1px solid var(--line-control); background: #fff; }` (the email renders as on white paper in both themes, like the A4 sheet), `.template-preview-text { white-space: pre-wrap; font-size: var(--fs-14); }`, `.template-list li { display: flex; gap: 8px; align-items: center; min-height: 44px; border-top: 1px solid var(--line); }`.

FakeServer: `createTemplate(sent, scope)` (name trimmed 1-100 and content 1-100,000 else 422 on the field; type `SMTP` -> 400; global only when scope is global), `updateTemplate(id, sent, scope)` (own non-admin only for `own`, `is_admin` only for `global`, else 404), `deleteTemplate(id, scope)`, `preview(sent)` (email: replaces `$title` etc. inside the `{{#jobs}}` block with the sample job of `routers/settings.py _FakeJob` — "Senior Software Engineer", "Acme Corp", 87; push: the same substitution as text; a flag `hostilePreview` answers `{html: true, body: "<script>window.top.__pwned=1</script><p>x</p>"}`); routes for `POST/PUT/DELETE` under both scopes and `POST /notification-templates/preview`.

- [ ] **Step 5: E2E** `settingsTemplates.spec.ts`: "create an email template, preview it, pick it in a source drawer" (journey across `/settings?section=notifications` and `/sources?quelle=<id>`; the drawer's select lists the new name); "a script in a template preview never runs" (`hostilePreview`, then `expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined()` and the page title unchanged; mark the test with `allowedConsoleErrors: [SANDBOX_PROBE]` if the sandbox logs a blocked-script error, as phase 6 did); "a member sees global templates read-only" (override `GET /me` with a non-admin); screenshots with the editor open.
- [ ] **Step 6: Run to verify pass**, **Step 7: Checkpoint.**

---

### Task 9: Konto: password, archive all jobs, profile reset, factory reset

**Files:**
- Modify: `web/src/features/settings/account/AccountSection.tsx`, `settings.css` (`.danger-zone`), `de.ts`, `en.ts`, `tests/e2e/support/settingsServer.ts`
- Create: `web/src/features/settings/account/PasswordForm.tsx`, `ArchiveAll.tsx`, `ResetProfile.tsx`, `FactoryReset.tsx`, `ConfirmDialog.tsx`
- Test: `web/tests/unit/features/settings/accountSection.test.tsx`, `web/tests/e2e/settingsAccount.spec.ts`

**Interfaces:**
- Consumes: `changePassword`, `archiveAllJobs`, `resetProfile`, `factoryReset`, `passwordProblem`, `PASSWORD_LIMITS`, `queryKeys.jobsRoot`, `queryKeys.jobCounts`, `queryKeys.profile`, `queryKeys.setupStatus`, `DrawerSection`, `useSectionForm`, `Dialog`, `CheckField`, `TextField`, `Button`.
- Produces: `ConfirmDialog({ title, text, confirmLabel, danger?, busy, onConfirm, onClose, children? })` (local to Konto; 7b's admin dialogs import it from here), `AccountSection`.

- [ ] **Step 1: i18n keys**

```ts
  "settings.account.password": "Passwort ändern", // "Change password"
  "settings.account.current": "Aktuelles Passwort", // "Current password"
  "settings.account.next": "Neues Passwort", // "New password"
  "settings.account.nextHint": "Mindestens 8 Zeichen.", // "At least 8 characters."
  "settings.account.repeat": "Neues Passwort wiederholen", // "Repeat new password"
  "settings.account.wrongCurrent": "Das aktuelle Passwort stimmt nicht.", // "The current password is not correct."
  "settings.account.tooShort": "Mindestens 8 Zeichen.", // "At least 8 characters."
  "settings.account.tooLong": "Höchstens 128 Zeichen.", // "At most 128 characters."
  "settings.account.mismatch": "Die beiden Eingaben unterscheiden sich.", // "The two entries differ."
  "settings.account.changed": "Passwort geändert.", // "Password changed."
  "settings.account.archive": "Alle Stellen archivieren", // "Archive all jobs"
  "settings.account.archiveText": "Verschiebt alle Treffer im Eingang nach „Von dir aussortiert“.", // "Moves every match in the inbox to "Discarded by you"."
  "settings.account.keepFavorites": "Favoriten behalten", // "Keep favourites"
  "settings.account.keepApplications": "Bewerbungen behalten", // "Keep applications"
  "settings.account.archiveConfirm": "Archivieren", // "Archive"
  "settings.account.archived": "{count} Stellen archiviert.", // "{count} jobs archived."
  "settings.account.archivedOne": "1 Stelle archiviert.", // "1 job archived."
  "settings.account.resetProfile": "Profil zurücksetzen", // "Reset profile"
  "settings.account.resetProfileText": "Ziel und Lebenslauf werden geleert. Benachrichtigungen, Vorlagen und Nachweise bleiben.", // "Goal and CV are cleared. Notifications, templates and proofs stay."
  "settings.account.profileReset": "Profil zurückgesetzt.", // "Profile reset."
  "settings.account.danger": "Gefahrenzone", // "Danger zone"
  "settings.account.factoryReset": "Alles zurücksetzen", // "Reset everything"
  "settings.account.factoryResetText": "Löscht deine Stellen, Bewerbungen, Quellen, dein Profil, Nachweise und eigene Vorlagen. Das Konto selbst bleibt. Das lässt sich nicht rückgängig machen.", // "Deletes your jobs, applications, sources, your profile, proofs and own templates. The account itself stays. This cannot be undone."
  "settings.account.factoryResetPassword": "Zur Bestätigung dein Passwort", // "Your password to confirm"
```

- [ ] **Step 2: Write the failing tests** (`accountSection.test.tsx`): "Passwort ändern checks length and repeat before sending"; "a 400 marks the current password, the server text is never shown" (stub 400 `{detail: "Incorrect current password"}`); "success clears the three fields and toasts"; "Alle Stellen archivieren asks, sends both options and toasts the count" (`DELETE /jobs` `{status: "archived", count: 3}` -> "3 Stellen archiviert."; the jobs root is invalidated: spy `queryClient.invalidateQueries`); "Alles zurücksetzen with a wrong password keeps the dialog with a field error"; "Alles zurücksetzen navigates fully to /inbox" (spy `window.location.assign`).
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.**

```tsx
// web/src/features/settings/account/ConfirmDialog.tsx
"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";

export interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Extra fields (options, a password) between the text and the buttons. */
  children?: ReactNode;
}

/** One confirmation shape for every destructive settings action (Konto here, admin in 7b). */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open onClose={props.onClose} label={props.title}>
      <div className="panel-in">
        <PanelHeader title={props.title} onClose={props.onClose} />
        <p className="prose">{props.text}</p>
        {props.children}
        <div className="row panel-actions">
          <Button variant={props.danger ? "danger" : "primary"} busy={props.busy} onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
          <Button variant="ghost" onClick={props.onClose}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

`PasswordForm`: a `DrawerSection` "Passwort ändern" with three `TextField`s (`type="password"`, `autoComplete` `current-password` / `new-password` / `new-password`), client check `passwordProblem` -> error on "Neues Passwort" (`tooShort`, `tooLong`) or "wiederholen" (`mismatch`); `useMutation(changePassword)`; `BAD_REQUEST` -> `settings.account.wrongCurrent` on the first field (an explicit allow-list, never the detail); `VALIDATION_ERROR` on `new_password` -> `tooShort`; others toast through `describeError`; success commits an empty draft and toasts. Reported dirty (`useReportDirty(report, "password", dirty)`), so leaving with a typed password asks first.

`ArchiveAll`: a block with the text, two `CheckField`s (both `true`) and a button "Alle Stellen archivieren" -> `ConfirmDialog` (not danger: the jobs stay restorable under "Von dir aussortiert"); success toasts `archived`/`archivedOne` by count and invalidates `queryKeys.jobsRoot` and `queryKeys.jobCounts`.

`ResetProfile`: button -> `ConfirmDialog` (danger) -> `resetProfile()`; success invalidates `queryKeys.profile`, `queryKeys.setupStatus`, `queryKeys.templatePreviewRoot` and toasts.

`FactoryReset`: inside `<section className="danger-zone">` with the heading "Gefahrenzone" (crimson with a `TriangleAlert` icon), the text and a danger button -> `ConfirmDialog` (danger) with a password `TextField`; `BAD_REQUEST` -> field error `settings.account.wrongCurrent`; success -> `window.location.assign("/inbox")` (full navigation drops the cache; ADR "logout").

CSS: `.danger-zone { border: 1px solid var(--danger); border-radius: var(--r-card); padding: 16px 18px; }`, `.danger-zone h3 { color: var(--danger); display: flex; gap: 6px; align-items: center; }`, `.account-block + .account-block { margin-top: 32px; }`.

FakeServer: `password` state, `changePassword(sent)` (400 `"Incorrect current password"` on mismatch; 422 on `new_password` when shorter than 8 or longer than 128; else stores), `archiveAll(request)` (reads the query; counts its own fixture list of jobs by the Task 2 rule; answers `{status: "archived", count}`), `resetProfile()`, `factoryReset(sent)` (400 on a wrong password, else `{status: "reset complete", jobs_deleted: n, platforms_deleted: m, profile_deleted: true}` and records it). After the reset the e2e lands on `/inbox`: the spec adds the inbox routes it needs from `inboxRoutes` (onboarding: `has_source: false`).

- [ ] **Step 5: E2E** `settingsAccount.spec.ts`: password journey (wrong current, then success); archive-all journey with the toast count; factory reset lands on the onboarding; screenshots including the danger zone (both themes; the crimson border meets 3:1).
- [ ] **Step 6: Run to verify pass**, **Step 7: Checkpoint.**

---

### Task 10: E2E journeys (phase 7a exit: "e2e settings green", journeys "settings channels" and "profile save (notification credentials survive)" across both pages)

**Files:**
- Create: `web/tests/e2e/settingsJourneys.spec.ts`
- Modify: `web/tests/e2e/support/settingsServer.ts` only if a journey needs a missing rule (add it with the real server's semantics)

**Interfaces:**
- Consumes: `SettingsServer`, `settingsRoutes`, `ProfileServer`/`profileRoutes` (phase 6), `SETTINGS_SECRETS`, `pushEvent` if needed.

- [ ] **Step 1: Write the journeys**
  1. **Credentials survive across pages:** one shared state: build `profileRoutes(profileServer)` and override its `GET /settings`/`POST /settings` with a combined fake whose row holds both the profile and the channel fields (or extend `SettingsServer` with `saveProfile(sent)` writing only the sent keys, mirroring `ProfileServer.save`); set up SMTP host change in Einstellungen, save Ziel in Profil, pick a default template, open Einstellungen again: every secret of `SETTINGS_SECRETS` is still in the server state, no request body contains `__masked__` or a secret, the page HTML contains neither.
  2. **Set up a channel and use it in a source:** Mailjet from "Nicht eingerichtet" to "Eingerichtet", "Testen" with a recipient succeeds, then the source drawer's Mailjet check is enabled (it reads the refreshed `channels` booleans).
  3. **Template round trip:** create, edit, preview, delete; the drawer's template select follows each change.
  4. **Keyboard only:** Tab from the sub-nav into Benachrichtigungen, open SMTP with Enter, type, save with Enter, focus returns to "SMTP ändern"; no focus on `<body>` at any step (assert `document.activeElement !== document.body` after each key).
- [ ] **Step 2: Run** `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/settingsJourneys.spec.ts` -> PASS.
- [ ] **Step 3: Checkpoint** (five commands; the whole e2e suite stays green).

---

### Task 11: Context documentation (7a)

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`, `context/code-standards.md`

- [ ] **Step 1: Progress tracker.** Phase line: `**Phase:** Frontend redesign - phase 7a (Einstellungen: Allgemein, Benachrichtigungen with template editor, Konto) done; next is phase 7b (admin sections, companies, global search).` Status Board: a row "Frontend redesign - phase 7a (Einstellungen)" ✅ with the files of the File Map and the unit/e2e test counts (from the checkpoint output) and the backend test count of Tasks 1-2. ADRs (only these): "Secrets are parsed into booleans" (the notification schema turns masked secrets into booleans inside zod; write-only inputs; removal sends null); "Notification templates stay copies in sources" (D8, Q1 pending); "User data delete order" (`services/user_data.py` children first; reset removes proofs and own templates too). Open Questions: remove "Phase 7 contract (phase 5)" (served) and the G10 half of "Phase 5 drops to confirm" (keep G17); add Q1 (template copies) and Q2 (reset scope) from the hand-off with the provisional rulings; keep the others.
- [ ] **Step 2: architecture.md.** Boundaries: `GET /storage/status`, `POST /notification-templates/preview`, rate limits of the channel tests, `services/user_data.py`, the archive-all scope.
- [ ] **Step 3: ui-context.md.** Section 0: Einstellungen (sub-nav, sections, the `.chan` rows, write-only secret inputs, the preview frame, the danger zone).
- [ ] **Step 4: code-standards.md.** Security: "A secret field is parsed into a boolean at the API boundary; no component receives a secret or the mask." Frontend: "Settings sections that apply at once (Allgemein) have no draft; editing forms use `DrawerSection` + `useSectionForm`."
- [ ] **Step 5: Checkpoint.** Only `context/` changed; re-read each edited section once.

---

## Self-Review

**Spec coverage (7a part of phase 7):** `/settings` Allgemein (language, theme, timezone, storage) -> Tasks 5, 6; Benachrichtigungen (channels, credentials, test send, templates with preview) -> Tasks 7, 8; Konto (password, archive all jobs) -> Task 9; usability #20 (sub-nav, theme under Allgemein, Abmelden in the user menu) -> Tasks 4, 5, D11; B2 partial update with credentials surviving -> Tasks 1, 3, 7, 10; `NOTIFICATION_SETTINGS_HREF`/`ACCOUNT_HREF` contracts -> Tasks 3, 4, 7; carried G10 (template text editing) -> Task 8; phase 3 G8 (archive all) -> Tasks 2, 9; secrets write-only -> Global Constraints, Tasks 3, 7; rate limits on external calls -> Task 1; never echo server text -> Global Constraints, Tasks 7-9 tests; journeys "settings channels" and "profile save (credentials survive)" -> Task 10. Admin sections, `/companies`, global search -> 7b.

**Placeholder scan:** components whose full JSX is long are specified by structure, props, ids, keys, behaviour and tests (as phase 6 did for its larger components); every contract, hook, domain function, backend change and test has code. No "TBD".

**Type consistency:** `NotificationSettings` (Task 3) is the type of `settings` in Tasks 7-8; `ChannelField`/`PlainField`/`SecretField` come only from `settingsPaths.ts`; `TemplateScope` is used by `notifications.ts` (Task 3) and `templateDraft.ts` (Task 8); `SettingsSectionProps` (Task 4) is the prop type of all three bodies; `ConfirmDialog` (Task 9) is reused by 7b; `delete_user` (Task 2) is reused by 7b Task 2; `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` (Task 2) by 7b Task 2.

**Review Focus:** each of the five lines names its tests in the owning tasks (1: Tasks 1, 3, 7, 10; 2: Tasks 1, 3, 8; 3: Tasks 1, 7; 4: Tasks 2, 9; 5: Tasks 2, 6).
