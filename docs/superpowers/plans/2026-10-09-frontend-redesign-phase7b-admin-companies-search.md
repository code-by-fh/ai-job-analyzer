# Frontend Redesign Phase 7b (Admin, Firmen, global search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Split:** second half of phase 7 (14 tasks: 3 backend, 11 web). It needs **7a** (`2026-10-09-frontend-redesign-phase7a-settings.md`) closed: the Einstellungen frame, `domain/settings.ts`, `ConfirmDialog`, `services/user_data.py` and the password bounds come from there.

**Goal:** Add the admin-only sections of Einstellungen (**KI**: OpenRouter and the local LLM with connection tests, model choice and per-task routing cloud or local; **Benutzer**: list, create, delete; **Systemfehler**: the stored AI error with reset, crawl clean-up and the database wipe), build **`/companies`** (list of the user's companies with search and research state, a detail with the shared company view, the user's jobs there, research start and refresh, and the admin rename and delete of a shared company profile, carried from phase 2 C1) and wire the **global search** (`/` dialog over jobs and companies, spec 4.1).

**Architecture:** Three backend tasks first (pytest TDD): the admin AI contract (validated routing, one answer shape for read and write, connection tests that answer a fixed reason as data, rate limits on every external call, an AI error code instead of German text, a wrong wipe password that is not a 401); admin users (bounds, guards against deleting oneself or an admin, deletion through 7a's `delete_user`); companies and search (a per-user company directory instead of the installation-wide dump, a `company_domain` job filter, `GET /search`, admin rename/delete of a profile, rate limits on research and deep dives, and a test that every admin route refuses a member). On the web, contracts go to `web/src/api/admin.ts`, `web/src/api/search.ts` and `web/src/api/companies.ts` (paths in the client-free `adminPaths.ts`), pure rules to `web/src/domain/companies.ts` and the extended `domain/settings.ts`, screens to `web/src/features/settings/admin/` and `web/src/features/companies/`, and the search to `web/src/features/shell/search/`. The company view reuses phase 2's `CompanyProfileView`, `DeepDiveList`, research task state and refresh confirmation.

**Tech Stack:** unchanged (see 7a). No new dependency, no migration (the AI error code is a new Redis key).

**Spec:** `docs/superpowers/specs/2026-10-08-frontend-redesign-design.md` (section 8 phase 7 row, done when "e2e settings/admin green"; 4.1 "Global search: the key `/` opens a dialog that searches jobs and companies"; 4.2 `/settings` admin sections "KI (OpenRouter/Ollama settings, task routing), Benutzer (user admin), Systemfehler (AI error banner and clear)"; 4.2 `/companies` row; section 7 journeys "company research", "admin"; 4.3 #5, #7; 5; 6). Prototype: `docs/prototype/clickdummy-editorial.html` (`SETTINGS_NAV` admin group "Administration", `setProviders`, `setAiTasks`, `setUsers`; the company tab `tabCompany` for the detail). Inventory: `docs/superpowers/specs/2026-10-08-frontend-redesign-inventory.md` (A.0 AI provider routing, A.1 `/users`, A.6 companies, A.7 admin, A.11 `ai_error`, B.3 `/companies`, `CompanyProfileView`, `/admin/users`, `/admin/settings`, C.1 "Clear persisted AI error", "Admin user mgmt"). Tracker open questions: "Phase 7 carry: admin rename/delete of a single company profile", "Existing `company_profiles` rows may contain personalised content" (the admin delete is the per-row tool for it).

## Global Constraints

All Global Constraints of 7a apply unchanged (placement, base, one web implementer at a time, shared files re-read, coding standards, React lint, CSS in `@layer components`, layers, 13 px, colours, i18n with DE/EN parity and key reuse, no raw server text, secrets write-only, untrusted HTML, URLs through `safeHref`, unsaved changes through one `useDirtySections`, focus never on `<body>`, gave-up queries, queries in parallel, states, accessibility, rate limits, e2e rules, a FakeServer that never echoes, reuse lists, no git). The "How to run anything" block of 7a applies verbatim (`$QA`, `$REPO`, `webrun.sh`, checkpoint of five commands, backend suite). Additions for 7b:

- **Placement:** backend Tasks 1-3 change only `server/`; web Tasks 4-13 change only `web/`; Task 14 changes only `context/`. Backend Tasks 1-3 run strictly in order (all three touch `routers/admin.py` or its tests); web Task 4 may run beside them; web Tasks 5-13 strictly in order after Task 3.
- **Role checks:** every admin endpoint depends on `get_current_admin_user` (403 for a member), proven by one parametrized test over all of them (Task 3). The web hides admin sections from members and never relies on that alone: a member who opens `?section=ai` sees Allgemein (D1), and a 403 maps to "Dafür fehlen dir die Rechte." through `describeError`.
- **Confirmations:** every destructive admin action (Schlüssel entfernen, Benutzer löschen, Firmenprofil löschen, Datenbank leeren, Firmenprofil umbenennen) goes through 7a's `ConfirmDialog` (rename through a `Dialog` with its field). The database wipe and deleting a user are `danger`; the wipe also asks for the admin's password.
- **Rate limits:** the AI connection tests and the model list (`10/minute`), company research start and deep dives (`10/minute`) are limited server-side (Tasks 1 and 3); the web maps 429 through `describeError`.
- **Shared files (additional):** `routers/admin.py`, `routers/auth.py`, `routers/companies.py`, `routers/jobs.py`, `intelligence/service.py`, `core/connection_errors.py`, `main.py`, `features/settings/SettingsPage.tsx`, `SettingsNav.tsx`, `labels.ts`, `domain/settings.ts`, `features/job/company/CompanyTab.tsx`, `features/shell/GlobalSearch.tsx`, `Sidebar.tsx`, `realtime/applyEvent.ts`.
- **Reuse, do not add a second (additional):** `ConfirmDialog` (7a Task 9), `SettingsSectionFrame`, `CompanyProfileView`, `DeepDiveList`, `TaskProgress`, `useStartTask`, `useTaskPhase`, `pendingTaskId`, `Monogram`, `statusLabel`, `jobRoute`, `normalizeDomain`, `useDebouncedValue`, `requestSearch`, `isTypingTarget`, `fetchJobPage`, `useCurrentUser`, `AI_SETTINGS_HREF`.

## Review Focus

1. **A member reaching admin features.** A non-admin opens `/settings?section=ai`, `?section=users`, `?section=system`, `/companies?alle=1`, or sends the admin requests by hand. Expected: the server answers 403 on every admin route and on `GET /companies?scope=all`; the web never renders an admin section for a member (it shows Allgemein, no flash of admin content while `/me` loads) and the sub-nav has no "Administration" group; the onboarding link `AI_SETTINGS_HREF` is only offered to admins (phase 3). Test: Task 3 `test_every_admin_route_refuses_a_member` (parametrized over all admin routes); Task 5 unit "a member never sees an admin section", e2e "member sees no Administration".
2. **Routing and provider settings that break AI for everyone.** The admin routes `job_analysis` to local while no local address is set, sends an unknown task (`"jobs"`) or provider (`"gpu"`), clears the OpenRouter key by accident, or the test reaches a server that answers 401/404/timeout. Expected: unknown keys and values are 422 on `ai_task_routing` and nothing is stored; the routing form warns "Für lokale Aufgaben fehlt die Adresse des lokalen Servers." before saving; removing the key asks first; a test always answers 200 with a fixed reason the web turns into a sentence ("Anmeldung abgelehnt (API-Schlüssel prüfen)", "Modell nicht gefunden", "Server nicht erreichbar", "Zeitüberschreitung"), the eleventh test within a minute is 429, and no raw provider text or key reaches the page. Test: Task 1 `test_routing_refuses_unknown_tasks_and_providers`, `test_openrouter_test_answers_a_reason_without_raw_text`, `test_ai_tests_are_rate_limited`, `test_get_and_post_answer_the_same_merged_routing`; Task 5 unit "maps every test reason", Task 6 unit "warns when local tasks have no address".
3. **Deleting users and company profiles.** The admin deletes a user who owns jobs with history, documents, source runs, proofs and templates; tries to delete themselves or another admin; deletes a shared company profile that other users' jobs point at; renames a profile to spaces or 300 characters. Expected: the user and every owned row go without a foreign-key error; self and admin targets are refused with 409 and a fixed sentence; deleting a profile asks first ("für alle Benutzer"), removes only the profile (jobs keep their `company_domain`) and the detail falls back to "Noch keine Recherche"; a bad name is a field error. Test: Task 2 `test_delete_user_removes_owned_rows`, `test_cannot_delete_self_or_an_admin`; Task 3 `test_admin_delete_company_profile_keeps_jobs`, `test_admin_rename_is_bounded`; Task 7 and Task 11 unit and e2e.
4. **The company directory leaking other users' work.** User A has jobs at `acme.de`; user B researched `globex.de`. Expected: A's `/companies` and A's search list only domains of A's own jobs (with or without a profile), never `globex.de`; the job count is A's own; an admin can switch to "Alle Firmen dieser Installation"; the detail of any domain still shows its shared profile (profiles are shared by design, phase 2), but "Deine Stellen" lists only A's jobs. Test: Task 3 `test_company_directory_lists_only_own_domains`, `test_search_finds_only_own_jobs_and_companies`, `test_scope_all_is_admin_only`; Task 9 e2e "no foreign company".
5. **Search input that breaks or floods.** The user types `%`, `_`, `\`, a 300-character paste, a single letter, or types fast; presses `/` inside the search field or another input; opens a result with Enter; the dialog is open on mobile. Expected: `%`/`_` match literally; one character asks for more and sends nothing; typing is debounced (one request per pause, the last answer wins); input over 200 characters is cut client-side and refused server-side with 422; `/` types a slash in inputs; arrow keys move through results and Enter follows the focused link, closing the dialog; no horizontal scroll at 375 px. Test: Task 3 `test_search_treats_like_wildcards_literally`, `test_search_bounds_the_query`; Task 12 unit "one request after typing stops", "arrow keys and Enter", e2e "search from the keyboard".

## Decisions taken by this plan (controller may veto before execution)

| # | Topic | Decision |
|---|---|---|
| D1 | Admin sections and gating | `ADMIN_SECTIONS = ["ai", "users", "system"]` join `USER_SECTIONS` (7a). The sub-nav shows them under the label "Administration" (prototype `.snav-group`) only when `/me` says `is_admin`. `settingsSectionFromParam(value, isAdmin)` maps an admin value to Allgemein for members. While `/me` loads, an admin value shows the section skeleton (no Allgemein flash, no admin content). Labels: KI, Benutzer, Systemfehler (spec wording). |
| D2 | KI › Anbieter | One section "KI" with three forms (prototype `setProviders` + `setAiTasks`, spec "KI (OpenRouter/Ollama settings, task routing)"): **OpenRouter** (API-Schlüssel write-only: empty input, hint "Gespeichert. Leer lassen, um ihn zu behalten." or "Kein Schlüssel gespeichert."; "Schlüssel entfernen" (danger confirm, sends `""` which the server stores as none); **Modell** (Task 6 picker); "Speichern"; "Verbindung prüfen"). **Lokales Modell (LM Studio, Ollama)** (Adresse `http(s)://…`, Modell; "Speichern"; "Verbindung prüfen" lists "Modell gefunden" or "Modell nicht gefunden. Verfügbar: a, b, c" (at most 10 names, then "und {n} weitere")). A test checks the stored state, so it is inactive while its form is dirty ("Erst speichern"). Results show inline below the button (`role="status"`), not as a toast, because the admin compares them with the fields. Intro: "Gilt für alle Benutzer dieser Installation." |
| D3 | Model choice | "Modelle laden" fetches `GET /admin/openrouter/models` once (cached under `["admin","models"]`, needs a stored key: otherwise the button is inactive with "Erst einen Schlüssel speichern"). Then a search field ("Modell suchen"), a check "Nur kostenlose Modelle" (prompt and completion price `"0"`), and a `SelectField` "Modell" with at most 200 matches ("{name} · {context} Token", free models "· kostenlos"); the stored model is always an option. Without loading, "Modell" is a text field (the id can be typed). |
| D4 | KI › Aufgaben | One form "Aufgaben": per task a row with its German name and a `Seg` "Cloud (OpenRouter)" / "Lokal" (`aria-label` "Anbieter für {task}"), in `TASK_DEFAULTS` order; one "Speichern" sends the full map. A warn `Notice` above "Speichern" when a task is local and no local address is stored, or cloud and no key is stored. The per-task model column of the prototype is dropped: the backend has one model per provider. |
| D5 | Benutzer | Prototype `setUsers` within the backend's abilities: a list (name, tag "Admin" or "Mitglied", "(du)" for oneself), "Löschen" only for other members (danger confirm: "{name} und alle Stellen, Bewerbungen, Quellen, Nachweise und Vorlagen dieses Kontos werden gelöscht."), and "Benutzer anlegen" (Benutzername 3-50 of `A-Z a-z 0-9 . _ @ -`, Passwort 8-128, hint "Teile das Passwort auf einem sicheren Weg."). Members only (the server cannot create admins). The prototype's e-mail invitation, role change and "zuletzt aktiv" are dropped (no backend). Footer line from the prototype: "Jede Person sieht nur ihr eigenes Profil und ihre eigenen Bewerbungen." |
| D6 | Systemfehler | Three blocks. **KI-Fehler:** `GET /admin/system-status` (Task 1) -> none: "Zurzeit kein KI-Fehler." (check icon); a code -> an error `Notice` with a fixed sentence per code and "Fehler zurücksetzen" (`DELETE /admin/clear-ai-error`) plus a link "Zu den KI-Einstellungen" (`AI_SETTINGS_HREF`); live through the existing `ai_error`/`ai_error_cleared` invalidation of `["system-status"]`. **Wartung:** "Hängende Läufe aufräumen" -> toast "{n} hängende Läufe entfernt." **Datenbank leeren** (danger zone): a radio "Nur meine Daten" / "Alle Benutzer (Stellen, Quellen, Firmenprofile)", the admin's password, `ConfirmDialog`; success does a full navigation to `/inbox`. |
| D7 | `/companies` list | Not in the main nav (spec). Masthead "Firmen" (no number), deck "Firmen aus deinen Stellen und ihre Recherche." A search field filters on the client (name or domain, `?q=`, `router.replace`). Rows: `Monogram`, the name as a link to the detail (`/companies?domain=…`, the phase 2 contract of the Firma tab), the domain, the research state ("Recherchiert am {date}", "Recherche läuft …" from the shared pending tasks, "Noch nicht recherchiert"), "{n} Stellen". Admins get a check "Alle Firmen dieser Installation" (`?alle=1`, scope `all`). Empty: "Noch keine Firmen. Eine Firma erscheint hier, sobald eine deiner Stellen eine Web-Adresse hat." / search: "Keine Firma passt zu „{q}“." |
| D8 | Company detail | `/companies?domain=acme.de` (validated with `normalizeDomain`; an invalid value shows the list). A back link "Alle Firmen", header (Monogram, name, domain), the shared note "Firmenprofile sind für alle Benutzer dieser Installation sichtbar.", then: a profile -> `CompanyProfileView`, `DeepDiveList` (company name from the profile, empty job title), the research stamp with "Neu recherchieren" (phase 2's confirmation); no profile -> "Noch keine Recherche zu {name}" and "Firma recherchieren" (no domain-confirm step: the domain comes from the user's job or the URL). Below: "Deine Stellen bei {name}" (`GET /jobs?company_domain=`, active jobs, links to the job page with their phase label) or "Keine eigenen Stellen bei dieser Firma." |
| D9 | Admin rename/delete | On the detail, for admins and only when a profile exists: "Umbenennen" (`Dialog` with "Name" 1-200, "Speichern") and "Profil löschen" (danger confirm: "Das Firmenprofil wird für alle Benutzer gelöscht. Stellen bleiben erhalten und können neu recherchiert werden."). Both invalidate the company and the directory. The research's stored name is kept on refresh (`_shared_company_name`), so a rename sticks. |
| D10 | Global search | The phase 1 dialog gets results: one request `GET /search?q=` (Task 3) per pause (250 ms, `useDebouncedValue`), from 2 characters; groups "Stellen" (up to 8: title, company, phase label or "Aussortiert") and "Firmen" (up to 5: name, domain), each a list of links; a `role="status"` line "{n} Treffer" / "Nichts gefunden für „{q}“."; ArrowDown from the field focuses the first result, ArrowUp/ArrowDown move, Home/End jump, Escape closes (existing `Dialog`); following a link closes the dialog. The sidebar gets a "Suchen" button with the key hint "/" above Einstellungen (usability #2 "Search moves to sidebar top" for discoverability; the `/` key alone is invisible), using `requestSearch()`. The input `maxLength` is 200. |
| D11 | Company research events | `company_profile_ready` already finishes the pending research task and refreshes the job queries; it now also invalidates the `["companies"]` prefix (list and details), so the list's state and the detail update live. |

## Gaps (spec or backend vs. reality) with proposed rulings

| # | Gap | Ruling |
|---|---|---|
| G1 | `ai_task_routing` accepts any `dict[str, str]`; `POST /admin/settings` answers the stored routing while `GET` answers the merged one; no bounds on models, key or base URL | **Backend Task 1:** keys must be `TASK_DEFAULTS` keys, values `cloud`/`local` (422 on `ai_task_routing`); model names 1-200, key <= 500, base URL empty or `http(s)://host…` <= 500; one `_settings_answer` for both. The base URL is not SSRF-guarded: a local LLM on the LAN is its purpose and only admins set it (recorded). |
| G2 | The AI tests answer 502 with German text that the web client drops (5xx carry no message), and they and the model list have no rate limit | **Backend Task 1:** tests answer 200 `{ok, reason?, model?, model_found?, available_models?}` with `reason` one of `auth`, `not_found`, `unreachable`, `timeout`, `failed`, `no_key`, `no_model`, `no_url`; raw errors are only logged; `10/minute` on both tests and the model list. |
| G3 | The stored AI error is German text (`system:ai_404_error`); "never echo server text" | **Backend Task 1:** `store_ai_404_error(message, code)` also stores `system:ai_error_code` (`auth`, `rate_limit`, `model_not_found`, `connection`, `server`); `GET /admin/system-status` -> `{ai_error: code | null}` (`unknown` when only the old text exists). `GET /status` stays for the old UI until the cutover. |
| G4 | `POST /admin/database/wipe` answers 401 for a wrong password, which the web client treats as an expired session (refresh, then redirect to login) | **Backend Task 1:** 400 `wrong_password`. |
| G5 | `POST /users` has no bounds; duplicate is 400 with English text; `DELETE /users/{id}` deletes only jobs, profile and platforms (FK errors on PostgreSQL), and lets an admin delete themselves or another admin | **Backend Task 2:** username 3-50 `[A-Za-z0-9._@-]`, password 8-128 (7a's constants); duplicate 409 `username_taken`; delete through 7a's `delete_user`; 409 `cannot_delete_self` / `cannot_delete_admin`. |
| G6 | `GET /companies` returns every profile of the installation with its full JSON to every user | **Backend Task 3:** `GET /companies?scope=own|all` -> `{items: [{domain, name, has_profile, analyzed_at, job_count}]}`; `own` = domains of the user's own non-`SEEN` jobs (with or without a profile); `all` = admins only, adds every profile. The full profile stays at `GET /companies/{domain}` (unchanged, phase 2). The old UI's `/companies` page breaks (spec 1: "API may change freely"); recorded. |
| G7 | No way to list a user's jobs at one company (`company` filters by name, not domain) | **Backend Task 3:** `GET /jobs?company_domain=` (exact). |
| G8 | No search endpoint; the web would need three list requests per keystroke | **Backend Task 3:** `GET /search?q=` (2-200 characters) -> `{jobs: [...8], companies: [...5]}`, own data only, ILIKE with escaped wildcards (the helper moves from `routers/jobs.py` to `core/like_pattern.py`). |
| G9 | No admin rename/delete of a shared company profile (tracker "Phase 7 carry") | **Backend Task 3:** `PATCH /admin/companies/{domain} {name}` (1-200, trimmed) and `DELETE /admin/companies/{domain}`; 404 when no profile. |
| G10 | `POST /companies/{domain}/analyze` and `/deep-dive` call the AI without a rate limit; `DeepDiveRequest` is unbounded | **Backend Task 3:** `10/minute` each; focus and how-to-proceed <= 2000, company name <= 200, title <= 300, language `de`/`en`. |
| G11 | Admin user management cannot create admins, change roles or reset passwords (inventory C.1) | **Kept** (feature parity); recorded as a product question for later. |
| G12 | Global notification templates were an admin settings block in the old UI | **Done in 7a Task 8** (admins create "Für alle Benutzer" templates in Benachrichtigungen). |

---

## File Map

Backend (`server/`):

| Path | Change |
|---|---|
| `routers/admin.py` | validated settings, one answer shape, tests as data with rate limits, system status, wipe 400 (Task 1); company rename/delete (Task 3) |
| `core/connection_errors.py` | `reason_for_status`, `reason_for_error`, reason constants (Task 1) |
| `intelligence/service.py` | AI error codes, `read_ai_error_code` (Task 1) |
| `routers/auth.py` | user bounds, 409 codes, guarded delete through `delete_user` (Task 2) |
| `services/company_directory.py` (new) | `company_summaries`, `search_companies` (Task 3) |
| `core/like_pattern.py` (new) | `contains_pattern`, `LIKE_ESCAPE` (moved from `routers/jobs.py`, Task 3) |
| `routers/companies.py` | directory, rate limits (Task 3) |
| `routers/jobs.py` | `company_domain` filter, import of the moved helper (Task 3) |
| `routers/search.py` (new), `main.py` | `GET /search` (Task 3) |
| `database/core.py` | `DeepDiveRequest` bounds (Task 3) |
| `tests/test_admin_contract.py`, `tests/test_admin_users.py`, `tests/test_company_directory.py` (new); `tests/test_connection_errors.py`, `tests/test_company_domain.py`, `tests/test_companies_router.py` (adapted) | tests |

Web, created:

| Path | Responsibility |
|---|---|
| `src/api/adminPaths.ts` | client-free paths, tasks, providers, reasons, codes, limits (Task 4) |
| `src/api/admin.ts` | AI settings, tests, models, system status, maintenance, users, company admin (Task 4) |
| `src/api/search.ts` | search query (Task 4) |
| `src/domain/companies.ts` | URL, filtering, research state (Task 4) |
| `src/features/settings/admin/AiSection.tsx`, `CloudProviderForm.tsx`, `LocalProviderForm.tsx`, `ConnectionTest.tsx`, `testReasons.ts`, `useAiSettingsSave.ts` | KI Anbieter (Task 5) |
| `src/features/settings/admin/ModelPicker.tsx`, `modelFilter.ts`, `RoutingForm.tsx`, `taskLabels.ts` | model choice and routing (Task 6) |
| `src/features/settings/admin/UsersSection.tsx`, `UserList.tsx`, `CreateUserForm.tsx` | Benutzer (Task 7) |
| `src/features/settings/admin/SystemSection.tsx`, `AiErrorBlock.tsx`, `MaintenanceBlock.tsx`, `WipeDatabase.tsx` | Systemfehler (Task 8) |
| `src/features/companies/CompaniesPage.tsx`, `CompanyList.tsx`, `CompanyRow.tsx`, `useCompaniesUrl.ts`, `companies.css` | list (Task 9) |
| `src/features/companies/CompanyDetail.tsx`, `CompanyResearchPanel.tsx`, `CompanyJobs.tsx` | detail (Task 10) |
| `src/features/companies/CompanyAdminActions.tsx`, `RenameCompanyDialog.tsx` | admin rename/delete (Task 11) |
| `src/features/shell/search/SearchResults.tsx`, `useSearchResults.ts`, `useResultKeys.ts` | search results (Task 12) |
| unit tests under `tests/unit/{api,domain,features/settings,features/companies,features/shell}/`, `tests/unit/support/adminRoutes.ts`, `tests/unit/support/companiesRoutes.ts` | unit tests |
| `tests/e2e/support/adminServer.ts`, `tests/e2e/support/companiesServer.ts`, `tests/e2e/admin*.spec.ts`, `tests/e2e/companies*.spec.ts`, `tests/e2e/search.spec.ts`, `tests/e2e/adminJourneys.spec.ts` | fixtures, fake servers, specs |

Web, modified: `app/(app)/companies/page.tsx`, `app/globals.css` (`companies.css`), `src/api/companies.ts`, `src/api/queryKeys.ts`, `src/domain/settings.ts`, `src/features/settings/SettingsPage.tsx`, `SettingsNav.tsx`, `labels.ts`, `useSettingsSection.ts`, `settings.css`, `src/features/job/company/CompanyTab.tsx` (export `useResearch`, `RefreshControl`), `src/features/shell/GlobalSearch.tsx`, `Sidebar.tsx`, `src/realtime/applyEvent.ts`, `src/i18n/de.ts`, `src/i18n/en.ts`, `tests/e2e/shell.spec.ts` (drop `/companies` from the placeholder routes; `PLACEHOLDER_ROUTES` becomes empty, so remove the loop and the constant), `context/*` (Task 14).

---

### Task 1: Backend: admin AI contract (validated routing, tests as data, rate limits, AI error code, wipe refusal)

**Files:**
- Modify: `server/routers/admin.py`, `server/core/connection_errors.py`, `server/intelligence/service.py` (`store_ai_404_error` and its five callers in `_call_openrouter`, `clear_ai_404_error`)
- Modify: `server/tests/test_connection_errors.py` (the two admin tests move to the new answer)
- Create: `server/tests/test_admin_contract.py`

**Interfaces:**
- Consumes: `TASK_DEFAULTS`, `get_ollama_base_url`, `get_ollama_model`, `_get_redis` (`intelligence/service.py`), `limiter`, `get_current_admin_user`, fixtures `api_client`, `seed`, `session_factory`, `fake_redis`, `fresh_rate_limits`.
- Produces:
  - `GET/POST /admin/settings` -> `{openrouter_model, openrouter_api_key_set, ollama_model, ollama_base_url, ai_task_routing}` (merged routing in both; POST adds `status: "updated"`); POST body validated (422 on the field).
  - `POST /admin/test/openrouter` -> `{ok: true, model}` or `{ok: false, reason}`; `POST /admin/test/ollama` -> `{ok: true, model, model_found, available_models}` or `{ok: false, reason}`; both 200, `10/minute`; `GET /admin/openrouter/models` `10/minute` (answers unchanged).
  - `REASON_AUTH = "auth"`, `REASON_NOT_FOUND = "not_found"`, `REASON_UNREACHABLE = "unreachable"`, `REASON_TIMEOUT = "timeout"`, `REASON_FAILED = "failed"`, `reason_for_status(status_code) -> str`, `reason_for_error(error) -> str` in `core/connection_errors.py`; `REASON_NO_KEY = "no_key"`, `REASON_NO_MODEL = "no_model"`, `REASON_NO_URL = "no_url"` in `routers/admin.py`.
  - `AI_ERROR_CODE_KEY = "system:ai_error_code"`, `AI_ERROR_AUTH = "auth"`, `AI_ERROR_RATE_LIMIT = "rate_limit"`, `AI_ERROR_MODEL_NOT_FOUND = "model_not_found"`, `AI_ERROR_CONNECTION = "connection"`, `AI_ERROR_SERVER = "server"`, `AI_ERROR_UNKNOWN = "unknown"`, `store_ai_404_error(message: str, code: str)`, `read_ai_error_code() -> Optional[str]` in `intelligence/service.py`.
  - `GET /admin/system-status` -> `{ai_error: str | null}`.
  - `POST /admin/database/wipe` wrong password -> 400 `{detail: "wrong_password"}`.

- [ ] **Step 1: Write the failing tests**

```python
# server/tests/test_admin_contract.py
"""Admin AI contract: validated settings, one answer shape, tests as data, rate limits, error codes."""

from unittest.mock import MagicMock

import pytest
import requests

from core.auth import get_current_admin_user, get_password_hash
from core.connection_errors import MSG_AUTH_FAILED, MSG_FAILED, MSG_NOT_FOUND, MSG_TIMEOUT, MSG_UNREACHABLE
from database.core import SystemSettings, User
from main import app
from tests.factories import TEST_USER_ID
from tests.test_connection_errors import CASES

REASON_OF_MESSAGE = {
    MSG_AUTH_FAILED: "auth", MSG_NOT_FOUND: "not_found", MSG_UNREACHABLE: "unreachable",
    MSG_TIMEOUT: "timeout", MSG_FAILED: "failed",
}

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
RAW = "postgres://user:hunter2@internal-host/db"
ADMIN_TEST_RATE_LIMIT = 10


@pytest.fixture()
def admin(api_client, seed, monkeypatch, session_factory):
    monkeypatch.setattr("routers.admin.SessionLocal", session_factory)
    seed(SystemSettings(openrouter_api_key="KEY_SECRET", openrouter_model="m", ollama_base_url="http://llm.lan:1234/v1"))
    app.dependency_overrides[get_current_admin_user] = lambda: User(id=TEST_USER_ID, username="root", is_admin=True)
    yield api_client
    app.dependency_overrides.pop(get_current_admin_user, None)


@pytest.mark.parametrize("routing", [{"jobs": "cloud"}, {"job_analysis": "gpu"}])
def test_routing_refuses_unknown_tasks_and_providers(admin, routing):
    response = admin.post("/admin/settings", json={"ai_task_routing": routing})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:2] == ["body", "ai_task_routing"]


def test_get_and_post_answer_the_same_merged_routing(admin):
    saved = admin.post("/admin/settings", json={"ai_task_routing": {"job_analysis": "local"}}).json()
    read = admin.get("/admin/settings").json()
    assert saved["ai_task_routing"] == read["ai_task_routing"]
    assert read["ai_task_routing"]["job_analysis"] == "local"
    assert read["ai_task_routing"]["cover_letter"] == "cloud"
    assert "KEY_SECRET" not in str(read) and read["openrouter_api_key_set"] is True


@pytest.mark.parametrize("body,field", [
    ({"openrouter_model": "m" * 201}, "openrouter_model"),
    ({"openrouter_api_key": "k" * 501}, "openrouter_api_key"),
    ({"ollama_base_url": "ftp://llm.lan"}, "ollama_base_url"),
    ({"ollama_base_url": "llm.lan:1234"}, "ollama_base_url"),
])
def test_provider_fields_are_bounded(admin, body, field):
    response = admin.post("/admin/settings", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


# The SDK error objects are built with real httpx responses in test_connection_errors.CASES.
@pytest.mark.parametrize("error,message", CASES)
def test_openrouter_test_answers_a_reason_without_raw_text(admin, monkeypatch, error, message):
    reason = REASON_OF_MESSAGE[message]
    fake = MagicMock()
    fake.return_value.chat.completions.create.side_effect = error
    monkeypatch.setattr("openai.OpenAI", fake)
    response = admin.post("/admin/test/openrouter")
    assert (response.status_code, response.json()) == (200, {"ok": False, "reason": reason})
    assert "hunter2" not in response.text and "secret" not in response.text


def test_openrouter_test_without_a_key(admin, session_factory):
    with session_factory() as db:
        db.query(SystemSettings).update({"openrouter_api_key": None})
        db.commit()
    assert admin.post("/admin/test/openrouter").json() == {"ok": False, "reason": "no_key"}


def test_ollama_test_maps_status_and_connection_errors(admin, monkeypatch):
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(return_value=MagicMock(ok=False, status_code=401)))
    assert admin.post("/admin/test/ollama").json() == {"ok": False, "reason": "auth"}
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW)))
    response = admin.post("/admin/test/ollama")
    assert response.json() == {"ok": False, "reason": "unreachable"} and "hunter2" not in response.text


def test_ai_tests_are_rate_limited(admin, monkeypatch):
    monkeypatch.setattr("routers.admin.requests.get", MagicMock(side_effect=requests.ConnectionError(RAW)))
    codes = [admin.post("/admin/test/ollama").status_code for _ in range(ADMIN_TEST_RATE_LIMIT + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}


def test_system_status_answers_the_code_not_the_text(admin, monkeypatch, fake_redis):
    stored = {"system:ai_404_error": "OpenRouter API-Schlüssel ungültig (401).", "system:ai_error_code": "auth"}
    fake_redis.get.side_effect = stored.get
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    assert admin.get("/admin/system-status").json() == {"ai_error": "auth"}


def test_system_status_of_an_old_text_without_code_is_unknown(admin, monkeypatch, fake_redis):
    fake_redis.get.side_effect = {"system:ai_404_error": "alt"}.get
    monkeypatch.setattr("intelligence.service._get_redis", lambda: fake_redis)
    assert admin.get("/admin/system-status").json() == {"ai_error": "unknown"}


def test_store_and_clear_keep_text_and_code_together(monkeypatch, fake_redis):
    from intelligence import service
    monkeypatch.setattr(service, "_get_redis", lambda: fake_redis)
    service.store_ai_404_error("Text", service.AI_ERROR_RATE_LIMIT)
    fake_redis.set.assert_any_call(service.AI_ERROR_CODE_KEY, "rate_limit")
    service.clear_ai_404_error()
    fake_redis.delete.assert_called_with(service.AI_404_REDIS_KEY, service.AI_ERROR_CODE_KEY)


def test_wipe_with_a_wrong_password_is_400_not_401(admin, session_factory):
    with session_factory() as db:
        db.get(User, TEST_USER_ID).hashed_password = get_password_hash("richtig-langes-passwort")
        db.commit()
    response = admin.post("/admin/database/wipe", json={"password": "falsch"})
    assert (response.status_code, response.json()) == (400, {"detail": "wrong_password"})
```

(The admin override returns a `User` with id `TEST_USER_ID`: the wipe loads that user from the session. `get_password_hash` lives in `core/auth.py`; if it is named differently there, import the real name.)

- [ ] **Step 2: Run to verify they fail** — `python -m pytest ... tests/test_admin_contract.py` -> FAIL (422s missing, 502 answers, no system-status route, wipe 401).

- [ ] **Step 3: Reasons in `core/connection_errors.py`** (next to the messages; same type rules):

```python
REASON_AUTH = "auth"
REASON_NOT_FOUND = "not_found"
REASON_UNREACHABLE = "unreachable"
REASON_TIMEOUT = "timeout"
REASON_FAILED = "failed"


def reason_for_status(status_code: int) -> str:
    """Fixed reason code for an HTTP status of the tested service (the web words it)."""
    if status_code in _AUTH_STATUSES:
        return REASON_AUTH
    return REASON_NOT_FOUND if status_code == _NOT_FOUND_STATUS else REASON_FAILED


def reason_for_error(error: Exception) -> str:
    """Fixed reason code for an exception of a connection test; checked in message_for_error's order."""
    if isinstance(error, _TIMEOUT_TYPES):
        return REASON_TIMEOUT
    if isinstance(error, _AUTH_TYPES):
        return REASON_AUTH
    if isinstance(error, _UNREACHABLE_TYPES):
        return REASON_UNREACHABLE
    status = _status_of(error)
    return reason_for_status(status) if status is not None else REASON_FAILED
```

- [ ] **Step 4: AI error codes in `intelligence/service.py`**

```python
AI_ERROR_CODE_KEY = "system:ai_error_code"
AI_ERROR_AUTH = "auth"
AI_ERROR_RATE_LIMIT = "rate_limit"
AI_ERROR_MODEL_NOT_FOUND = "model_not_found"
AI_ERROR_CONNECTION = "connection"
AI_ERROR_SERVER = "server"
AI_ERROR_UNKNOWN = "unknown"


def store_ai_404_error(message: str, code: str) -> None:
    # The text stays for the old UI's /status until the cutover; the new UI reads only the code.
    try:
        r = _get_redis()
        r.set(AI_404_REDIS_KEY, message)
        r.set(AI_ERROR_CODE_KEY, code)
        r.publish("job_updates", json.dumps({"type": "ai_error", "message": message}))
    except Exception as e:
        logger.error(f"Failed to store AI 404 error: {e}")


def read_ai_error_code() -> Optional[str]:
    """The stored error's code; `unknown` for a text stored before codes existed; None without error."""
    r = _get_redis()
    if not r.get(AI_404_REDIS_KEY):
        return None
    return r.get(AI_ERROR_CODE_KEY) or AI_ERROR_UNKNOWN
```

`clear_ai_404_error` deletes both keys in one call: `r.delete(AI_404_REDIS_KEY, AI_ERROR_CODE_KEY)`. In `_call_openrouter` pass the code as second argument: `AuthenticationError` -> `AI_ERROR_AUTH`, `RateLimitError` -> `AI_ERROR_RATE_LIMIT`, `NotFoundError` -> `AI_ERROR_MODEL_NOT_FOUND`, `APIConnectionError` -> `AI_ERROR_CONNECTION`, `APIStatusError` -> `AI_ERROR_SERVER`. Grep for other callers of `store_ai_404_error` (`grep -rn "store_ai_404_error(" server --include=*.py`) and give each its code.

- [ ] **Step 5: The admin router** (`routers/admin.py`):

```python
from typing import Annotated, Dict, Literal, Optional
from urllib.parse import urlparse

from fastapi import Request, status
from pydantic import Field, StringConstraints, field_validator

from core.connection_errors import reason_for_error, reason_for_status
from routers.deps import limiter

ADMIN_TEST_RATE = "10/minute"
MAX_MODEL_LENGTH = 200
MAX_API_KEY_LENGTH = 500
MAX_BASE_URL_LENGTH = 500
HTTP_SCHEMES = ("http", "https")
REASON_NO_KEY = "no_key"
REASON_NO_MODEL = "no_model"
REASON_NO_URL = "no_url"
WRONG_PASSWORD = "wrong_password"
DEFAULT_OPENROUTER_MODEL = "tngtech/deepseek-r1t2-chimera:free"
DEFAULT_OLLAMA_MODEL = "llama3.1:8b"
ModelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_MODEL_LENGTH)]
AiProvider = Literal["cloud", "local"]


class SystemSettingsUpdate(BaseModel):
    openrouter_model: Optional[ModelName] = None
    # "" removes the stored key (the web asks first).
    openrouter_api_key: Optional[Annotated[str, StringConstraints(max_length=MAX_API_KEY_LENGTH)]] = None
    ollama_model: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_MODEL_LENGTH)]] = None
    ollama_base_url: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_BASE_URL_LENGTH)]] = None
    ai_task_routing: Optional[Dict[str, AiProvider]] = None

    @field_validator("ollama_base_url")
    @classmethod
    def _http_url_or_empty(cls, value: Optional[str]) -> Optional[str]:
        # Not SSRF-guarded on purpose: an admin points this at a LAN model server (G1).
        if value:
            parsed = urlparse(value)
            if parsed.scheme not in HTTP_SCHEMES or not parsed.netloc:
                raise ValueError("must be an http(s) URL")
        return value

    @field_validator("ai_task_routing")
    @classmethod
    def _known_tasks(cls, value: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
        from intelligence.service import TASK_DEFAULTS
        if value and not set(value) <= set(TASK_DEFAULTS):
            raise ValueError("unknown task")
        return value


def _settings_answer(settings: Optional[SystemSettings]) -> dict:
    """One shape for GET and POST: the effective routing merged over the defaults, no key."""
    from intelligence.service import TASK_DEFAULTS
    stored = settings.ai_task_routing if settings else None
    return {
        "openrouter_model": (settings.openrouter_model if settings else None) or DEFAULT_OPENROUTER_MODEL,
        "openrouter_api_key_set": bool(settings and settings.openrouter_api_key),
        "ollama_model": (settings.ollama_model if settings else None) or DEFAULT_OLLAMA_MODEL,
        "ollama_base_url": (settings.ollama_base_url if settings else None) or "",
        "ai_task_routing": {**TASK_DEFAULTS, **(stored or {})},
    }
```

`get_admin_settings` returns `_settings_answer(db.query(SystemSettings).first())`; `update_admin_settings` keeps its write logic and returns `{"status": "updated", **_settings_answer(db_settings)}`. The two tests:

```python
@router.post("/admin/test/openrouter")
@limiter.limit(ADMIN_TEST_RATE)
def test_openrouter_connection(request: Request, current_user: User = Depends(get_current_admin_user)):
    api_key, model = _openrouter_credentials()
    if not api_key:
        return {"ok": False, "reason": REASON_NO_KEY}
    if not model:
        return {"ok": False, "reason": REASON_NO_MODEL}
    try:
        _openrouter_client(api_key).chat.completions.create(
            model=model, messages=[{"role": "user", "content": "Hi"}], max_tokens=1,
        )
        return {"ok": True, "model": model}
    except Exception as error:  # any provider failure is one fixed reason; the raw error is only logged
        logger.warning("OpenRouter connection test failed: %s", type(error).__name__)
        return {"ok": False, "reason": reason_for_error(error)}
```

(`_openrouter_credentials()` reads key and model in a short session; `_openrouter_client(api_key)` builds the `OpenAI` client as today, with a function-local `from openai import OpenAI`, so the tests can patch `openai.OpenAI`.) `test_ollama_connection` gets `request: Request`, the limit, `REASON_NO_URL` when the base URL is empty, `{"ok": False, "reason": reason_for_status(response.status_code)}` for a non-ok answer and `reason_for_error(error)` for `requests.RequestException`; success unchanged plus `"ok": True`. `get_openrouter_models` gets `request: Request` and the limit. New route:

```python
@router.get("/admin/system-status")
def system_status(current_user: User = Depends(get_current_admin_user)):
    """The stored AI error as a fixed code; the German text never leaves the server."""
    from intelligence.service import read_ai_error_code
    return {"ai_error": read_ai_error_code()}
```

`wipe_database`: `raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=WRONG_PASSWORD)`.

- [ ] **Step 6: Adapt `tests/test_connection_errors.py`.** `test_admin_openrouter_test_returns_fixed_reason` asserts `(200, {"ok": False, "reason": <reason>})` with the reason of each case (map the parametrized messages to reasons: `MSG_AUTH_FAILED` -> `"auth"`, `MSG_NOT_FOUND` -> `"not_found"`, `MSG_UNREACHABLE` -> `"unreachable"`, `MSG_TIMEOUT` -> `"timeout"`, `MSG_FAILED` -> `"failed"`); `test_admin_ollama_test_maps_http_status_and_connection_errors` alike; add `pytestmark = pytest.mark.usefixtures("fresh_rate_limits")`. Add a parametrized `test_reason_for_error_maps_like_message_for_error` over the existing `CASES`.

- [ ] **Step 7: Run to verify they pass** — full backend suite green.
- [ ] **Step 8: Checkpoint.**

---

### Task 2: Backend: admin users (bounds, guarded delete through `delete_user`, 409 codes)

**Files:**
- Modify: `server/routers/auth.py` (`UserCreate`, `read_users`, `create_user`, `delete_user`)
- Create: `server/tests/test_admin_users.py`

**Interfaces:**
- Consumes: `delete_user` (`services/user_data.py`, 7a Task 2), `NewPassword`, `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` (`routers/auth.py`, 7a Task 2).
- Produces: `POST /users` body `{username: 3-50 [A-Za-z0-9._@-], password: 8-128}` -> `{id, username, is_admin: false}`; 409 `username_taken`; `GET /users` ordered by username; `DELETE /users/{id}` -> `{status: "deleted"}`, 404, 409 `cannot_delete_self`, 409 `cannot_delete_admin`. Constants `USERNAME_TAKEN`, `CANNOT_DELETE_SELF`, `CANNOT_DELETE_ADMIN`, `MIN_USERNAME_LENGTH = 3`, `MAX_USERNAME_LENGTH = 50`, `USERNAME_PATTERN`.

- [ ] **Step 1: Write the failing tests**

```python
# server/tests/test_admin_users.py
import pytest

from core.auth import get_current_admin_user
from database.core import JobEntry, JobStatusHistory, User
from main import app
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_job

ADMIN = User(id=TEST_USER_ID, username="root", is_admin=True, token_version=0)


@pytest.fixture()
def admin(api_client, monkeypatch, session_factory):
    monkeypatch.setattr("routers.auth.SessionLocal", session_factory)
    app.dependency_overrides[get_current_admin_user] = lambda: ADMIN
    yield api_client
    app.dependency_overrides.pop(get_current_admin_user, None)


@pytest.mark.parametrize("body,field", [
    ({"username": "ab", "password": "lang-genug"}, "username"),
    ({"username": "jo nas", "password": "lang-genug"}, "username"),
    ({"username": "u" * 51, "password": "lang-genug"}, "username"),
    ({"username": "jonas", "password": "kurz"}, "password"),
])
def test_create_user_is_bounded(admin, body, field):
    response = admin.post("/users", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


def test_duplicate_username_is_409_with_a_code(admin):
    admin.post("/users", json={"username": "jonas", "password": "lang-genug"})
    response = admin.post("/users", json={"username": "jonas", "password": "lang-genug"})
    assert (response.status_code, response.json()) == (409, {"detail": "username_taken"})


def test_cannot_delete_self_or_an_admin(admin, seed):
    seed(User(id=OTHER_USER_ID, username="chef", is_admin=True, token_version=0))
    assert admin.delete(f"/users/{TEST_USER_ID}").json() == {"detail": "cannot_delete_self"}
    response = admin.delete(f"/users/{OTHER_USER_ID}")
    assert (response.status_code, response.json()) == (409, {"detail": "cannot_delete_admin"})


def test_delete_user_removes_owned_rows(admin, seed, session_factory):
    seed(User(id=OTHER_USER_ID, username="member", is_admin=False, token_version=0))
    seed(make_job(id="theirs", user_id=OTHER_USER_ID),
         JobStatusHistory(job_id="theirs", from_status="OPEN", to_status="DRAFTED", changed_by=OTHER_USER_ID))
    assert admin.delete(f"/users/{OTHER_USER_ID}").json() == {"status": "deleted"}
    with session_factory() as db:
        assert db.get(User, OTHER_USER_ID) is None
        assert db.query(JobEntry).count() == 0 and db.query(JobStatusHistory).count() == 0


def test_users_are_listed_by_name(admin, seed):
    seed(User(id=OTHER_USER_ID, username="anna", is_admin=False, token_version=0))
    names = [user["username"] for user in admin.get("/users").json()]
    assert names == sorted(names)
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** (`routers/auth.py`):

```python
MIN_USERNAME_LENGTH = 3
MAX_USERNAME_LENGTH = 50
USERNAME_PATTERN = r"^[A-Za-z0-9._@-]+$"
USERNAME_TAKEN = "username_taken"
CANNOT_DELETE_SELF = "cannot_delete_self"
CANNOT_DELETE_ADMIN = "cannot_delete_admin"
Username = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=MIN_USERNAME_LENGTH, max_length=MAX_USERNAME_LENGTH, pattern=USERNAME_PATTERN),
]


class UserCreate(BaseModel):
    username: Username
    password: NewPassword
```

`read_users`: `.order_by(User.username)`. `create_user`: `HTTPException(status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN)`. `delete_user`:

```python
def _deletable(target: Optional[User], current_user: User) -> User:
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CANNOT_DELETE_SELF)
    if target.is_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CANNOT_DELETE_ADMIN)
    return target


@router.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: int, current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        _deletable(db.query(User).filter(User.id == user_id).first(), current_user)
        delete_user(db, user_id)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()
```

(Rename the route function to `delete_user_endpoint` so it does not shadow the imported service `delete_user`; the path stays.)

- [ ] **Step 4: Run to verify they pass** (full suite). **Step 5: Checkpoint.**

---

### Task 3: Backend: company directory, job filter, search, admin rename/delete, research limits, admin role test

**Files:**
- Create: `server/services/company_directory.py`, `server/core/like_pattern.py`, `server/routers/search.py`, `server/tests/test_company_directory.py`
- Modify: `server/routers/companies.py`, `server/routers/jobs.py` (`JobListQuery.company_domain`, filter, helper import), `server/routers/admin.py` (rename/delete), `server/database/core.py` (`DeepDiveRequest`), `server/main.py` (include `search.router`), `server/tests/test_company_domain.py` and `server/tests/test_companies_router.py` (`pytestmark` fresh rate limits; adapt any `GET /companies` assertion to the new shape)

**Interfaces:**
- Consumes: `CompanyDomain`, `MAX_COMPANY_NAME_LENGTH` (`workers/tasks/research.py`), `STATUS_SEEN`, `limiter`, `get_current_admin_user`, `iso_utc`.
- Produces:
  - `company_summaries(db, user_id, include_all: bool) -> list[dict]` (`{domain, name, has_profile, analyzed_at, job_count}`, sorted by name case-insensitively); `search_companies(db, user_id, text, limit) -> list[dict]` (`{domain, name}`).
  - `GET /companies?scope=own|all` -> `{items: [...]}`; `all` 403 for members.
  - `GET /jobs?company_domain=` exact filter.
  - `GET /search?q=` (2-200) -> `{jobs: [{id, title, company, company_domain, status, is_archived}] (<= 8, active first, newest first), companies: [{domain, name}] (<= 5)}`.
  - `PATCH /admin/companies/{domain}` `{name}` -> `{domain, name}`; `DELETE /admin/companies/{domain}` -> `{status: "deleted"}`; 404 `Company profile not found`.
  - `contains_pattern(text) -> str`, `LIKE_ESCAPE` in `core/like_pattern.py`.
  - `COMPANY_RESEARCH_RATE = "10/minute"` on `analyze` and `deep-dive`.

- [ ] **Step 1: Write the failing tests**

```python
# server/tests/test_company_directory.py
import pytest

from core.auth import get_current_admin_user, get_current_user
from database.core import CompanyProfile, JobEntry, User
from main import app
from tests.factories import OTHER_USER_ID, TEST_USER_ID, make_job, make_user

pytestmark = pytest.mark.usefixtures("fresh_rate_limits")
ADMIN = User(id=TEST_USER_ID, username="root", is_admin=True, token_version=0)


@pytest.fixture()
def world(api_client, seed, monkeypatch, session_factory):
    for module in ("routers.companies", "routers.admin"):
        monkeypatch.setattr(f"{module}.SessionLocal", session_factory)
    seed(User(id=OTHER_USER_ID, username="other", is_admin=False, token_version=0))
    seed(
        make_job(id="a1", company="ACME GmbH", company_domain="acme.de", title="Kotlin Dev"),
        make_job(id="a2", company="ACME GmbH", company_domain="acme.de", title="Java Dev", is_archived=True),
        make_job(id="s1", company="Seen AG", company_domain="seen.de", status="SEEN"),
        make_job(id="b1", user_id=OTHER_USER_ID, company="Globex", company_domain="globex.de", title="Kotlin Lead"),
        CompanyProfile(domain="globex.de", name="Globex", raw_data={"meta": {}}),
        CompanyProfile(domain="acme.de", name="ACME", raw_data={"meta": {}}),
    )
    return api_client


def test_company_directory_lists_only_own_domains(world):
    assert world.get("/companies").json() == {"items": [
        {"domain": "acme.de", "name": "ACME", "has_profile": True, "analyzed_at": None, "job_count": 2},
    ]}


def test_scope_all_is_admin_only(world):
    assert world.get("/companies", params={"scope": "all"}).status_code == 403
    app.dependency_overrides[get_current_user] = lambda: ADMIN
    try:
        domains = [item["domain"] for item in world.get("/companies", params={"scope": "all"}).json()["items"]]
    finally:
        app.dependency_overrides[get_current_user] = lambda: make_user()
    assert domains == ["acme.de", "globex.de"]


def test_jobs_filter_by_company_domain(world):
    items = world.get("/jobs", params={"company_domain": "acme.de"}).json()["items"]
    assert [item["id"] for item in items] == ["a1"]


def test_search_finds_only_own_jobs_and_companies(world):
    body = world.get("/search", params={"q": "kotlin"}).json()
    assert [job["id"] for job in body["jobs"]] == ["a1"]
    assert world.get("/search", params={"q": "globex"}).json() == {"jobs": [], "companies": []}
    assert world.get("/search", params={"q": "acme"}).json()["companies"] == [{"domain": "acme.de", "name": "ACME"}]


def test_search_lists_archived_jobs_after_active_ones(world):
    ids = [job["id"] for job in world.get("/search", params={"q": "dev"}).json()["jobs"]]
    assert ids == ["a1", "a2"]


@pytest.mark.parametrize("q", ["%", "_", "\\"])
def test_search_treats_like_wildcards_literally(world, q):
    assert world.get("/search", params={"q": q + q}).json()["jobs"] == []


@pytest.mark.parametrize("q", ["k", "k" * 201])
def test_search_bounds_the_query(world, q):
    assert world.get("/search", params={"q": q}).status_code == 422


@pytest.fixture()
def as_admin(world):
    app.dependency_overrides[get_current_admin_user] = lambda: ADMIN
    yield world
    app.dependency_overrides.pop(get_current_admin_user, None)


def test_admin_rename_is_bounded(as_admin):
    assert as_admin.patch("/admin/companies/acme.de", json={"name": "   "}).status_code == 422
    assert as_admin.patch("/admin/companies/acme.de", json={"name": "n" * 201}).status_code == 422
    assert as_admin.patch("/admin/companies/acme.de", json={"name": " ACME SE "}).json() == {"domain": "acme.de", "name": "ACME SE"}


def test_admin_delete_company_profile_keeps_jobs(as_admin, session_factory):
    assert as_admin.delete("/admin/companies/acme.de").json() == {"status": "deleted"}
    assert as_admin.delete("/admin/companies/acme.de").status_code == 404
    with session_factory() as db:
        assert db.query(JobEntry).filter(JobEntry.company_domain == "acme.de").count() == 2
    assert as_admin.get("/companies").json()["items"][0]["has_profile"] is False


def test_research_and_deep_dive_are_rate_limited(world, monkeypatch):
    monkeypatch.setattr("routers.companies.celery_app.send_task", lambda *args, **kwargs: None)
    codes = [world.post("/companies/acme.de/analyze", json={"force_refresh": True}).status_code for _ in range(11)]
    assert codes[-1] == 429


def test_deep_dive_request_is_bounded(world):
    body = {"focus": "f" * 2001, "how_to_proceed": "x", "company_name": "ACME", "title": "Dev"}
    assert world.post("/companies/acme.de/deep-dive", json=body).status_code == 422


ADMIN_ROUTES = [
    ("GET", "/users"), ("POST", "/users"), ("DELETE", "/users/1"),
    ("GET", "/admin/settings"), ("POST", "/admin/settings"), ("GET", "/admin/system-status"),
    ("DELETE", "/admin/clear-ai-error"), ("POST", "/admin/redis/cleanup"), ("GET", "/admin/openrouter/models"),
    ("POST", "/admin/test/openrouter"), ("POST", "/admin/test/ollama"), ("POST", "/admin/database/wipe"),
    ("POST", "/admin/notification-templates"), ("PUT", "/admin/notification-templates/1"),
    ("DELETE", "/admin/notification-templates/1"), ("PATCH", "/admin/companies/acme.de"),
    ("DELETE", "/admin/companies/acme.de"),
]


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_every_admin_route_refuses_a_member(world, method, path):
    # A body valid for the route, so the 403 cannot be a 422 in disguise.
    body = {"username": "jonas", "password": "lang-genug", "name": "x", "type": "PUSHOVER", "content": "x"}
    response = world.request(method, path, json=body if method in ("POST", "PUT", "PATCH") else None)
    assert response.status_code == 403
```

(`api_client` authenticates as `make_user()`, a member. FastAPI resolves the `Depends` chain before it validates the body, so the 403 comes first; the valid body only guards against a route whose dependencies change later.)

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Move the LIKE helper** to `core/like_pattern.py`:

```python
"""ILIKE patterns that match user text literally (%, _ and the escape character lose their meaning)."""

LIKE_ESCAPE = "\\"


def contains_pattern(text: str) -> str:
    escaped = text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"
```

In `routers/jobs.py` delete `_LIKE_ESCAPE` and `_contains_pattern`, import `LIKE_ESCAPE, contains_pattern` and use them in `_apply_text_search`; add `company_domain: Optional[str] = Field(None, max_length=MAX_DOMAIN_LENGTH)` (from `services.company_domain`) to `JobListQuery` and `if filters.company_domain: query = query.filter(JobEntry.company_domain == filters.company_domain)` in `_apply_search_filters`.

- [ ] **Step 4: The directory service**

```python
# server/services/company_directory.py
"""The companies a user knows from their own jobs, joined with the shared profiles (G6)."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.job_status import STATUS_SEEN
from database.core import CompanyProfile, JobEntry, iso_utc


def _own_domains(db: Session, user_id: int) -> dict:
    """domain -> (job count, a company name from the user's jobs)."""
    rows = (
        db.query(JobEntry.company_domain, func.count(JobEntry.id), func.max(JobEntry.company))
        .filter(JobEntry.user_id == user_id, JobEntry.company_domain.isnot(None), JobEntry.status != STATUS_SEEN)
        .group_by(JobEntry.company_domain)
        .all()
    )
    return {domain: (count, name) for domain, count, name in rows}


def _summary(domain: str, own: tuple, profile) -> dict:
    count, job_name = own
    return {
        "domain": domain,
        "name": (profile.name if profile else None) or job_name or domain,
        "has_profile": profile is not None,
        "analyzed_at": iso_utc(profile.analyzed_at) if profile else None,
        "job_count": count,
    }


def company_summaries(db: Session, user_id: int, include_all: bool) -> list:
    own = _own_domains(db, user_id)
    query = db.query(CompanyProfile)
    if not include_all:
        query = query.filter(CompanyProfile.domain.in_(list(own)))
    profiles = {profile.domain: profile for profile in query.all()}
    domains = set(own) | (set(profiles) if include_all else set())
    items = [_summary(domain, own.get(domain, (0, None)), profiles.get(domain)) for domain in domains]
    return sorted(items, key=lambda item: item["name"].casefold())


def search_companies(db: Session, user_id: int, text: str, limit: int) -> list:
    """Filtered in Python: the user's own directory is small, and plain substring tests need no escaping."""
    matches = [item for item in company_summaries(db, user_id, include_all=False) if _matches(item, text)]
    return [{"domain": item["domain"], "name": item["name"]} for item in matches[:limit]]


def _matches(item: dict, text: str) -> bool:
    needle = text.casefold()
    return needle in item["name"].casefold() or needle in item["domain"].casefold()
```

- [ ] **Step 5: Routers.** `routers/companies.py`:

```python
COMPANY_RESEARCH_RATE = "10/minute"
SCOPE_ALL = "all"


@router.get("/companies")
def list_companies(
    scope: Literal["own", "all"] = "own",
    current_user: User = Depends(get_current_user),
):
    """The user's companies (G6); every profile of the installation for admins with scope=all."""
    if scope == SCOPE_ALL and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    db = SessionLocal()
    try:
        return {"items": company_summaries(db, current_user.id, include_all=scope == SCOPE_ALL)}
    finally:
        db.close()
```

`analyze_company` and `deep_dive` get `request: Request` first and `@limiter.limit(COMPANY_RESEARCH_RATE)`.

`database/core.py`:

```python
MAX_DEEP_DIVE_TEXT_LENGTH = 2000
MAX_DEEP_DIVE_TITLE_LENGTH = 300
MAX_DEEP_DIVE_COMPANY_LENGTH = 200


class DeepDiveRequest(BaseModel):
    focus: str = Field(max_length=MAX_DEEP_DIVE_TEXT_LENGTH)
    how_to_proceed: str = Field(max_length=MAX_DEEP_DIVE_TEXT_LENGTH)
    company_name: str = Field(max_length=MAX_DEEP_DIVE_COMPANY_LENGTH)
    title: str = Field(max_length=MAX_DEEP_DIVE_TITLE_LENGTH)
    language: Literal["de", "en"] = "de"
```

`routers/search.py`:

```python
"""GET /search: the user's own jobs and companies for the global search dialog (spec 4.1)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_db
from core.job_status import STATUS_SEEN
from core.like_pattern import LIKE_ESCAPE, contains_pattern
from database.core import JobEntry, User
from services.company_directory import search_companies

router = APIRouter()
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 200
JOB_RESULTS = 8
COMPANY_RESULTS = 5


def _job_hit(job: JobEntry) -> dict:
    return {
        "id": job.id, "title": job.title, "company": job.company, "company_domain": job.company_domain,
        "status": job.status, "is_archived": bool(job.is_archived),
    }


@router.get("/search")
def search(
    q: str = Query(min_length=MIN_QUERY_LENGTH, max_length=MAX_QUERY_LENGTH),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = q.strip()
    pattern = contains_pattern(text)
    jobs = (
        db.query(JobEntry)
        .filter(JobEntry.user_id == current_user.id, JobEntry.status != STATUS_SEEN)
        .filter(or_(JobEntry.title.ilike(pattern, escape=LIKE_ESCAPE), JobEntry.company.ilike(pattern, escape=LIKE_ESCAPE)))
        .order_by(JobEntry.is_archived, JobEntry.created_at.desc(), JobEntry.id)
        .limit(JOB_RESULTS)
        .all()
    )
    return {"jobs": [_job_hit(job) for job in jobs], "companies": search_companies(db, current_user.id, text, COMPANY_RESULTS)}
```

(split the query into `_job_hits(db, user_id, text)` to stay under 20 lines). `main.py`: `from routers import search` and `app.include_router(search.router)`.

`routers/admin.py`:

```python
COMPANY_NOT_FOUND = "Company profile not found"
CompanyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_COMPANY_NAME_LENGTH)]


class CompanyRename(BaseModel):
    name: CompanyName


def _profile_or_404(db, domain: str) -> CompanyProfile:
    profile = db.query(CompanyProfile).filter(CompanyProfile.domain == domain).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=COMPANY_NOT_FOUND)
    return profile


@router.patch("/admin/companies/{domain}")
def rename_company(domain: CompanyDomain, body: CompanyRename, current_user: User = Depends(get_current_admin_user)):
    """The stored name wins over later research (_shared_company_name), so a rename sticks."""
    db = SessionLocal()
    try:
        profile = _profile_or_404(db, domain)
        profile.name = body.name
        db.commit()
        return {"domain": profile.domain, "name": profile.name}
    finally:
        db.close()


@router.delete("/admin/companies/{domain}")
def delete_company_profile(domain: CompanyDomain, current_user: User = Depends(get_current_admin_user)):
    """Only the shared profile goes; jobs keep their company_domain and can be researched again."""
    db = SessionLocal()
    try:
        db.delete(_profile_or_404(db, domain))
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()
```

- [ ] **Step 6: Adapt the old company tests.** `tests/test_company_domain.py` and `tests/test_companies_router.py`: add `pytestmark = pytest.mark.usefixtures("fresh_rate_limits")`; any test that read `GET /companies` as a list reads `["items"]` (search with `grep -n '"/companies"' server/tests`).
- [ ] **Step 7: Run to verify they pass** (full suite). **Step 8: Checkpoint.**

---

### Task 4: Web contract layer: admin API, company directory, search, companies domain, settings sections

**Files:**
- Create: `web/src/api/adminPaths.ts`, `web/src/api/admin.ts`, `web/src/api/search.ts`, `web/src/domain/companies.ts`
- Modify: `web/src/api/companies.ts`, `web/src/api/queryKeys.ts`, `web/src/domain/settings.ts`, `web/src/realtime/applyEvent.ts` (D11)
- Test: `web/tests/unit/api/adminApi.test.ts`, `web/tests/unit/domain/companies.test.ts`, `web/tests/unit/domain/settings.test.ts` (extended), `web/tests/unit/realtime/handleMessage.test.ts` (extended)

**Interfaces:**
- Produces:
  - `adminPaths.ts`: `ADMIN_SETTINGS_PATH`, `OPENROUTER_TEST_PATH`, `LOCAL_TEST_PATH`, `OPENROUTER_MODELS_PATH`, `SYSTEM_STATUS_PATH`, `CLEAR_AI_ERROR_PATH`, `CRAWL_CLEANUP_PATH`, `DATABASE_WIPE_PATH`, `USERS_PATH`, `userPath(id)`, `adminCompanyPath(domain)`, `COMPANIES_PATH`, `companiesPath(scope)`, `SEARCH_PATH`, `searchPath(q)`, `companyJobsPath(domain)`, `AI_TASKS`, `AiTask`, `AI_PROVIDERS`, `AiProvider`, `TEST_REASONS`, `TestReason`, `AI_ERROR_CODES`, `AiErrorCode`, `COMPANY_SCOPES`, `CompanyScope`, `ADMIN_LIMITS`, `USERNAME_PATTERN`, `ADMIN_REFUSAL`, `SEARCH_LIMITS`.
  - `admin.ts`: `AiSettings`, `AiSettingsBody`, `AiSettingsPatch`, `aiSettingsQueryOptions()`, `saveAiSettings(patch)`, `ConnectionResult`, `testOpenRouter()`, `testLocalModel()`, `OpenRouterModel`, `openRouterModelsQueryOptions(enabled)`, `systemStatusQueryOptions()`, `clearAiError()`, `cleanupCrawls()` -> `number`, `wipeDatabase({password, allUsers})`, `AdminUser`, `usersQueryOptions()`, `createUser({username, password})`, `deleteUser(id)`, `renameCompany({domain, name})`, `deleteCompanyProfile(domain)`.
  - `companies.ts` additions: `CompanySummary`, `CompanySummaryBody`, `companySummariesQueryOptions(scope)`, `companyJobsQueryOptions(domain)`.
  - `search.ts`: `SearchResult`, `SearchResultBody`, `searchQueryOptions(q)`.
  - `domain/companies.ts`: `COMPANIES_HREF`, `CompaniesLocation { domain: string | null; q: string; all: boolean }`, `companiesLocationOf(params)`, `companiesHref(location)`, `filterCompanies(items, q)`, `ResearchState = "done" | "running" | "none"`, `researchStateOf(summary, phase)`.
  - `domain/settings.ts` changes: `ADMIN_SECTIONS`, `AdminSection`, `SettingsSection = UserSection | AdminSection` (rename 7a's union to `UserSection`), `isAdminSection(section)`, `visibleSections(isAdmin)`, `settingsSectionFromParam(value, isAdmin)` (second parameter added; 7a's caller `useSettingsSection` is updated in Task 5).
  - `queryKeys`: `aiSettings: ["admin","ai"]`, `openRouterModels: ["admin","models"]`, `users: ["admin","users"]`, `companiesRoot: ["companies"]`, `companies: (scope) => ["companies", scope]`, `companyJobs: (domain) => ["jobs","company",domain]` (under the jobs root, so job events refresh it), `search: (q) => ["search", q]`. `systemStatus` exists.

- [ ] **Step 1: Write the failing tests** (selection):

```ts
// web/tests/unit/domain/companies.test.ts
import { describe, expect, it } from "vitest";
import { companiesHref, companiesLocationOf, filterCompanies, researchStateOf } from "@/domain/companies";

const ACME = { domain: "acme.de", name: "ACME", has_profile: true, analyzed_at: "2026-10-01T10:00:00Z", job_count: 2 };
const GLOBEX = { domain: "globex.com", name: "Globex", has_profile: false, analyzed_at: null, job_count: 1 };

describe("companies URL", () => {
  it("keeps the phase 2 detail contract and drops an invalid domain", () => {
    expect(companiesHref({ domain: "acme.de", q: "", all: false })).toBe("/companies?domain=acme.de");
    expect(companiesLocationOf(new URLSearchParams("domain=http://evil"))).toEqual({ domain: null, q: "", all: false });
    expect(companiesLocationOf(new URLSearchParams("q=ac&alle=1"))).toEqual({ domain: null, q: "ac", all: true });
  });
});

describe("filterCompanies", () => {
  it("matches name or domain, case-insensitively, literally", () => {
    expect(filterCompanies([ACME, GLOBEX], "GLOB")).toEqual([GLOBEX]);
    expect(filterCompanies([ACME, GLOBEX], ".de")).toEqual([ACME]);
    expect(filterCompanies([ACME, GLOBEX], "%")).toEqual([]);
  });
});

describe("researchStateOf", () => {
  it("prefers a running research over the stored state", () => {
    expect(researchStateOf(ACME, "running")).toBe("running");
    expect(researchStateOf(ACME, "idle")).toBe("done");
    expect(researchStateOf(GLOBEX, "idle")).toBe("none");
  });
});
```

```ts
// web/tests/unit/domain/settings.test.ts (added cases)
it("shows admin sections to admins only", () => {
  expect(settingsSectionFromParam("ai", true)).toBe("ai");
  expect(settingsSectionFromParam("ai", false)).toBe("general");
  expect(visibleSections(false)).toEqual(["general", "notifications", "account"]);
  expect(settingsHref("ai")).toBe(AI_SETTINGS_HREF);
});
```

`adminApi.test.ts`: "the AI settings schema reads booleans and the merged routing, never a key" (parse a body that also has `openrouter_api_key: "x"`: the key is dropped); "a test answer is a result, not an error" (`{ok: false, reason: "auth"}` parses to `{ok: false, reason: "auth"}`; an unknown reason parses to `"failed"`); "`createUser` maps nothing itself (refusals stay ApiError)"; "`companySummariesQueryOptions("all")` requests `?scope=all`"; "`searchQueryOptions` encodes the query".

`handleMessage.test.ts`: "company_profile_ready also refreshes the company directory" (seed `["companies","own"]`, push the event, expect the query invalidated).

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**

```ts
// web/src/api/adminPaths.ts
/** Paths and wire constants of the admin, company and search endpoints; client-free for e2e. */
export const ADMIN_SETTINGS_PATH = "/admin/settings";
export const OPENROUTER_TEST_PATH = "/admin/test/openrouter";
export const LOCAL_TEST_PATH = "/admin/test/ollama";
export const OPENROUTER_MODELS_PATH = "/admin/openrouter/models";
export const SYSTEM_STATUS_PATH = "/admin/system-status";
export const CLEAR_AI_ERROR_PATH = "/admin/clear-ai-error";
export const CRAWL_CLEANUP_PATH = "/admin/redis/cleanup";
export const DATABASE_WIPE_PATH = "/admin/database/wipe";
export const USERS_PATH = "/users";
export const COMPANIES_PATH = "/companies";
export const SEARCH_PATH = "/search";
const JOBS_PATH = "/jobs";
const COMPANY_JOBS_LIMIT = 100;

export const userPath = (id: number) => `${USERS_PATH}/${id}`;
export const adminCompanyPath = (domain: string) => `/admin/companies/${encodeURIComponent(domain)}`;

export const COMPANY_SCOPES = ["own", "all"] as const;
export type CompanyScope = (typeof COMPANY_SCOPES)[number];
export const companiesPath = (scope: CompanyScope) =>
  scope === "own" ? COMPANIES_PATH : `${COMPANIES_PATH}?scope=${scope}`;
export const searchPath = (q: string) => `${SEARCH_PATH}?${new URLSearchParams({ q }).toString()}`;
export const companyJobsPath = (domain: string) =>
  `${JOBS_PATH}?${new URLSearchParams({ company_domain: domain, limit: String(COMPANY_JOBS_LIMIT), sort_by: "date" }).toString()}`;

// Mirrors intelligence/service.py TASK_DEFAULTS (order = display order).
export const AI_TASKS = [
  "job_analysis",
  "cover_letter",
  "cv_tailoring",
  "interview_prep",
  "company_profile",
  "deep_dive",
  "extract_job_details",
  "platform_name",
] as const;
export type AiTask = (typeof AI_TASKS)[number];
export const AI_PROVIDERS = ["cloud", "local"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
// routers/admin.py and core/connection_errors.py (Task 1).
export const TEST_REASONS = ["auth", "not_found", "unreachable", "timeout", "failed", "no_key", "no_model", "no_url"] as const;
export type TestReason = (typeof TEST_REASONS)[number];
// intelligence/service.py AI_ERROR_* (Task 1).
export const AI_ERROR_CODES = ["auth", "rate_limit", "model_not_found", "connection", "server", "unknown"] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const ADMIN_LIMITS = {
  model: 200,
  apiKey: 500,
  baseUrl: 500,
  usernameMin: 3,
  usernameMax: 50,
  companyName: 200,
  modelOptions: 200,
  availableModelsShown: 10,
} as const;
export const USERNAME_PATTERN = /^[A-Za-z0-9._@-]+$/;
export const ADMIN_REFUSAL = {
  usernameTaken: "username_taken",
  cannotDeleteSelf: "cannot_delete_self",
  cannotDeleteAdmin: "cannot_delete_admin",
  wrongPassword: "wrong_password",
} as const;
export const SEARCH_LIMITS = { min: 2, max: 200, debounceMs: 250 } as const;
```

`admin.ts` (core; everything parsed with zod, the key itself never parsed):

```ts
const routingSchema = z.record(z.string(), z.enum(AI_PROVIDERS).catch("cloud"));
const aiSettingsSchema = z.object({
  openrouter_model: z.string(),
  openrouter_api_key_set: z.boolean(),
  ollama_model: z.string(),
  ollama_base_url: z.string(),
  ai_task_routing: routingSchema,
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type AiSettingsBody = z.input<typeof aiSettingsSchema>;
export interface AiSettingsPatch {
  openrouter_model?: string;
  openrouter_api_key?: string;
  ollama_model?: string;
  ollama_base_url?: string;
  ai_task_routing?: Record<AiTask, AiProvider>;
}

export function aiSettingsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.aiSettings, queryFn: () => api.request(ADMIN_SETTINGS_PATH, aiSettingsSchema) });
}

/** The answer is the stored state (one shape for GET and POST, Task 1). */
export async function saveAiSettings(patch: AiSettingsPatch): Promise<AiSettings> {
  return api.request(ADMIN_SETTINGS_PATH, aiSettingsSchema, { method: "POST", json: patch });
}

const connectionSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(TEST_REASONS).catch("failed").optional(),
  model: z.string().optional(),
  model_found: z.boolean().optional(),
  available_models: z.array(z.string()).optional(),
});
export type ConnectionResult = z.infer<typeof connectionSchema>;
export const testOpenRouter = () => api.request(OPENROUTER_TEST_PATH, connectionSchema, { method: "POST" });
export const testLocalModel = () => api.request(LOCAL_TEST_PATH, connectionSchema, { method: "POST" });

const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().nullish(),
  pricing: z.object({ prompt: z.string().optional(), completion: z.string().optional() }).catch({}),
});
export type OpenRouterModel = z.infer<typeof modelSchema>;
export function openRouterModelsQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.openRouterModels,
    queryFn: () => api.request(OPENROUTER_MODELS_PATH, z.array(modelSchema)),
    enabled,
    staleTime: Infinity,
  });
}

const systemStatusSchema = z.object({ ai_error: z.enum(AI_ERROR_CODES).catch("unknown").nullable() });
export function systemStatusQueryOptions() {
  return queryOptions({ queryKey: queryKeys.systemStatus, queryFn: () => api.request(SYSTEM_STATUS_PATH, systemStatusSchema) });
}
```

plus `clearAiError()` (`DELETE`), `cleanupCrawls()` (`POST`, answers `removed`), `wipeDatabase({ password, allUsers })` (`POST {password, wipe_all_users}`), `adminUserSchema = z.object({ id, username, is_admin })`, `usersQueryOptions()`, `createUser`, `deleteUser`, `renameCompany` (`PATCH {name}`), `deleteCompanyProfile` (`DELETE`).

`companies.ts` additions:

```ts
const companySummarySchema = z.object({
  domain: z.string(),
  name: z.string(),
  has_profile: z.boolean(),
  analyzed_at: z.string().nullish(),
  job_count: z.number().int(),
});
export type CompanySummary = z.infer<typeof companySummarySchema>;
export type CompanySummaryBody = z.input<typeof companySummarySchema>;
const directorySchema = z.object({ items: z.array(companySummarySchema) });

export function companySummariesQueryOptions(scope: CompanyScope) {
  return queryOptions({
    queryKey: queryKeys.companies(scope),
    queryFn: async () => (await api.request(companiesPath(scope), directorySchema)).items,
  });
}

/** The user's active jobs at one company (G7), newest first. */
export function companyJobsQueryOptions(domain: string) {
  return queryOptions({ queryKey: queryKeys.companyJobs(domain), queryFn: () => fetchJobPage(companyJobsPath(domain)) });
}
```

`search.ts`:

```ts
const jobHitSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  company_domain: z.string().nullish(),
  status: z.string(),
  is_archived: z.boolean(),
});
const searchResultSchema = z.object({
  jobs: z.array(jobHitSchema),
  companies: z.array(z.object({ domain: z.string(), name: z.string() })),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResultBody = z.input<typeof searchResultSchema>;

export function searchQueryOptions(q: string) {
  return queryOptions({
    queryKey: queryKeys.search(q),
    queryFn: ({ signal }) => api.request(searchPath(q), searchResultSchema, { signal }),
    enabled: q.length >= SEARCH_LIMITS.min,
    staleTime: SEARCH_STALE_MS,
  });
}
```

(`SEARCH_STALE_MS = 30_000`: the same words typed again within half a minute need no request.)

`domain/companies.ts`:

```ts
import type { CompanySummary } from "@/api/companies";
import type { TaskPhase } from "./pendingTasks";
import { normalizeDomain } from "@/features/job/company/companyDomain";

export const COMPANIES_HREF = "/companies";
const DOMAIN_PARAM = "domain";
const QUERY_PARAM = "q";
const ALL_PARAM = "alle";
const ALL_VALUE = "1";

export interface CompaniesLocation {
  domain: string | null;
  q: string;
  all: boolean;
}

/** An invalid domain is ignored (the list shows), so a crafted link never reaches the API. */
export function companiesLocationOf(params: URLSearchParams): CompaniesLocation {
  const raw = params.get(DOMAIN_PARAM);
  const domain = raw ? normalizeDomain(raw) : null;
  return { domain: domain === raw ? domain : null, q: params.get(QUERY_PARAM) ?? "", all: params.get(ALL_PARAM) === ALL_VALUE };
}

export function companiesHref(location: CompaniesLocation): string {
  const params = new URLSearchParams();
  if (location.domain) params.set(DOMAIN_PARAM, location.domain);
  else {
    if (location.q) params.set(QUERY_PARAM, location.q);
    if (location.all) params.set(ALL_PARAM, ALL_VALUE);
  }
  const query = params.toString();
  return query ? `${COMPANIES_HREF}?${query}` : COMPANIES_HREF;
}

export function filterCompanies(items: readonly CompanySummary[], q: string): CompanySummary[] {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => `${item.name} ${item.domain}`.toLocaleLowerCase().includes(needle));
}

export type ResearchState = "done" | "running" | "none";

export function researchStateOf(summary: CompanySummary, phase: TaskPhase): ResearchState {
  if (phase === "running" || phase === "stalled") return "running";
  return summary.has_profile ? "done" : "none";
}
```

(A domain module importing from `features/` breaks the layering: move `normalizeDomain` and its constants from `features/job/company/companyDomain.ts` to `src/domain/companyDomain.ts` and re-export from the old path, so phase 2 imports keep working. Check `normalizeDomain`'s real behaviour: it must return the same string for a valid lowercase domain.)

`domain/settings.ts` additions:

```ts
export const ADMIN_SECTIONS = ["ai", "users", "system"] as const;
export type UserSection = (typeof USER_SECTIONS)[number];
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type SettingsSection = UserSection | AdminSection;
const ALL_SECTIONS: readonly SettingsSection[] = [...USER_SECTIONS, ...ADMIN_SECTIONS];

export const isAdminSection = (section: SettingsSection): section is AdminSection =>
  (ADMIN_SECTIONS as readonly string[]).includes(section);

export function visibleSections(isAdmin: boolean): readonly SettingsSection[] {
  return isAdmin ? ALL_SECTIONS : USER_SECTIONS;
}

/** D1: an admin section reads as Allgemein for members; unknown values too. */
export function settingsSectionFromParam(value: string | null, isAdmin: boolean): SettingsSection {
  return visibleSections(isAdmin).find((section) => section === value) ?? DEFAULT_SETTINGS_SECTION;
}
```

`applyEvent.ts` `companyReady`: add `invalidate(deps, queryKeys.companiesRoot)` (and the detail key `queryKeys.company(event.domain)` if it is not already invalidated there; read the function first).

- [ ] **Step 4: Run to verify they pass.** **Step 5: Checkpoint.**

---

### Task 5: Admin frame and KI › Anbieter (OpenRouter and local model with connection tests)

**Files:**
- Modify: `web/src/features/settings/SettingsPage.tsx` (bodies for `ai`, `users`, `system`; admin prefetch), `SettingsNav.tsx` (admin group), `labels.ts`, `useSettingsSection.ts` (reads `/me`), `settings.css` (`.settings-nav-group`), `de.ts`, `en.ts`
- Create: `web/src/features/settings/admin/AiSection.tsx`, `CloudProviderForm.tsx`, `LocalProviderForm.tsx`, `ConnectionTest.tsx`, `testReasons.ts`, `useAiSettingsSave.ts`, and frames `UsersSection.tsx`, `SystemSection.tsx` (filled by Tasks 7-8)
- Create: `web/tests/unit/support/adminRoutes.ts`, `web/tests/unit/features/settings/adminFrame.test.tsx`, `web/tests/unit/features/settings/aiProviders.test.tsx`, `web/tests/e2e/support/adminServer.ts`, `web/tests/e2e/adminAi.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`aiSettingsQueryOptions`, `saveAiSettings`, `testOpenRouter`, `testLocalModel`, `ConnectionResult`, `TestReason`, `ADMIN_LIMITS`, `visibleSections`, `isAdminSection`, `ADMIN_SECTIONS`), 7a (`SettingsSectionFrame`, `ConfirmDialog`, `SectionState`, `DrawerSection`, `useSectionForm`, `useReportDirty`), `useCurrentUser`.
- Produces: `useSettingsSection(): { section: SettingsSection | null }` (`null` while `/me` loads and the URL names an admin section); `REASON_TEXT: Record<TestReason, MessageKey>`; `useAiSettingsSave(successKey)` (mutation over `AiSettingsPatch`, writes the answer into `queryKeys.aiSettings`, toasts); `ConnectionTest({ run, dirty, label, describe })`; `AdminServer` (e2e) with `settings`, `routing`, `key` (boolean only), `tests`, `users`, `aiError`, `wipes`; `adminRoutes(server, extra)`.

- [ ] **Step 1: i18n keys** (selection; full list in the step's diff: every visible string of D1-D2):

```ts
  "settings.nav.admin": "Administration", // "Administration"
  "settings.section.ai": "KI", // "AI"
  "settings.section.users": "Benutzer", // "Users"
  "settings.section.system": "Systemfehler", // "System errors"
  "settings.intro.ai": "Gilt für alle Benutzer dieser Installation.", // "Applies to every user of this installation."
  "settings.intro.users": "Jede Person sieht nur ihr eigenes Profil und ihre eigenen Bewerbungen.", // "Everyone sees only their own profile and applications."
  "settings.intro.system": "KI-Fehler, Aufräumen und die Datenbank.", // "AI errors, clean-up and the database."
  "settings.ai.cloud": "OpenRouter", // "OpenRouter"
  "settings.ai.key": "API-Schlüssel", // "API key"
  "settings.ai.keyStored": "Gespeichert. Leer lassen, um ihn zu behalten.", // "Stored. Leave empty to keep it."
  "settings.ai.keyMissing": "Kein Schlüssel gespeichert.", // "No key stored."
  "settings.ai.keyRemove": "Schlüssel entfernen", // "Remove key"
  "settings.ai.keyRemoveText": "Ohne Schlüssel können Aufgaben, die über OpenRouter laufen, nichts mehr erledigen.", // "Without a key, tasks routed to OpenRouter can no longer run."
  "settings.ai.model": "Modell", // "Model"
  "settings.ai.local": "Lokales Modell (LM Studio, Ollama)", // "Local model (LM Studio, Ollama)"
  "settings.ai.baseUrl": "Adresse", // "Address"
  "settings.ai.baseUrlHint": "Zum Beispiel http://192.168.1.20:1234/v1", // "For example http://192.168.1.20:1234/v1"
  "settings.ai.test": "Verbindung prüfen", // "Check connection"
  "settings.ai.testOk": "Verbindung steht · {model}", // "Connected · {model}"
  "settings.ai.modelFound": "Modell gefunden.", // "Model found."
  "settings.ai.modelMissing": "Modell nicht gefunden. Verfügbar: {models}", // "Model not found. Available: {models}"
  "settings.ai.modelMissingMore": "{models} und {count} weitere", // "{models} and {count} more"
  "settings.ai.saved": "KI-Einstellungen gespeichert.", // "AI settings saved."
  "settings.ai.reason.auth": "Anmeldung abgelehnt (API-Schlüssel prüfen).", // "Sign-in refused (check the API key)."
  "settings.ai.reason.not_found": "Modell nicht gefunden.", // "Model not found."
  "settings.ai.reason.unreachable": "Server nicht erreichbar.", // "Server unreachable."
  "settings.ai.reason.timeout": "Zeitüberschreitung.", // "Timed out."
  "settings.ai.reason.failed": "Verbindungstest fehlgeschlagen.", // "Connection test failed."
  "settings.ai.reason.no_key": "Erst einen Schlüssel speichern.", // "Save a key first."
  "settings.ai.reason.no_model": "Erst ein Modell speichern.", // "Save a model first."
  "settings.ai.reason.no_url": "Erst eine Adresse speichern.", // "Save an address first."
  "settings.ai.invalidUrl": "Bitte eine Adresse mit http:// oder https:// eingeben.", // "Please enter an address starting with http:// or https://."
```

- [ ] **Step 2: Write the failing tests.** `adminFrame.test.tsx`: "a member never sees an admin section" (`GET /me` member, `?section=ai` -> heading Allgemein, no "Administration" in the nav, no `GET /admin/settings` request); "an admin sees the Administration group after Konto"; "no Allgemein flash while /me loads for an admin URL" (a `/me` stub that resolves later: until then `ListLoading`, never the Allgemein heading). `aiProviders.test.tsx`: "the key input starts empty and Speichern sends only a typed key" (`{openrouter_api_key: "neu"}`); "Schlüssel entfernen asks, then sends an empty key"; "maps every test reason" (parametrized over `TEST_REASONS`: stub `{ok: false, reason}` -> `REASON_TEXT[reason]` in a `role="status"` line); "Verbindung prüfen waits while the form is dirty"; "the local test lists at most 10 available models and the rest as a count"; "an address without http is refused before sending".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.**

`useSettingsSection.ts`:

```ts
/** D1: members never get an admin section; an admin URL waits for /me instead of flashing Allgemein. */
export function useSettingsSection(): { section: SettingsSection | null } {
  const value = useSearchParams().get("section");
  const user = useCurrentUser();
  const asksAdmin = (ADMIN_SECTIONS as readonly string[]).includes(value ?? "");
  if (asksAdmin && !user.data) return { section: user.isError ? DEFAULT_SETTINGS_SECTION : null };
  return { section: settingsSectionFromParam(value, user.data?.is_admin ?? false) };
}
```

`SettingsPage`: `SECTION_BODY` gets `ai: AiSection, users: UsersSection, system: SystemSection`; `section === null` renders `<ListLoading stalled={false} />` in the pane; the admin queries (`aiSettingsQueryOptions`, `systemStatusQueryOptions`, `usersQueryOptions`) are prefetched only in their sections (members must not request them). `SettingsNav` gets `isAdmin` and renders a second list for `ADMIN_SECTIONS` preceded by `<p className="settings-nav-group" id="settings-nav-admin">Administration</p>` with `<ul aria-labelledby="settings-nav-admin">`; on mobile the group label spans the grid and the admin links form a second seg row.

`testReasons.ts`:

```ts
import type { TestReason } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

export const REASON_TEXT: Readonly<Record<TestReason, MessageKey>> = {
  auth: "settings.ai.reason.auth",
  not_found: "settings.ai.reason.not_found",
  unreachable: "settings.ai.reason.unreachable",
  timeout: "settings.ai.reason.timeout",
  failed: "settings.ai.reason.failed",
  no_key: "settings.ai.reason.no_key",
  no_model: "settings.ai.reason.no_model",
  no_url: "settings.ai.reason.no_url",
};
```

`ConnectionTest({ run, dirty, label, describe })`: a `useMutation(run)`; a `Button size="sm"` (`busy`, `inactive={dirty}` with the visible "Erst speichern", 7a's key `settings.notify.saveFirst`); below it a persistent `<p role="status">` showing `describe(result)` for `{ok: true}` or `t(REASON_TEXT[result.reason ?? "failed"])` (`--danger` text with an icon for failures, `--ok` with a check for success); an `ApiError` (429, 403, network) shows `describeError`. The region is mounted from the first render (empty until a result).

`CloudProviderForm`: `useSectionForm({ key: "", model: settings.openrouter_model })`; submit sends `{ openrouter_api_key: key }` only when typed and `openrouter_model` only when changed (bounded 1-200 client-side); `TextField` key (`type="password"`, `autoComplete="new-password"`, hint from `openrouter_api_key_set`); `TextField` model (Task 6 swaps in the picker); "Schlüssel entfernen" (shown when a key is stored) -> `ConfirmDialog` danger -> `saveAiSettings({ openrouter_api_key: "" })`; `ConnectionTest` with `testOpenRouter` and `describe = (r) => t("settings.ai.testOk", { model: r.model ?? "" })`. `LocalProviderForm`: address (checked `^https?://` + `new URL()` parse, <= 500) and model; `ConnectionTest` with `testLocalModel` and a `describe` that names `modelFound` or `modelMissing` with at most `ADMIN_LIMITS.availableModelsShown` names (rest as `modelMissingMore`). `useAiSettingsSave` writes the answer with `setQueryData(queryKeys.aiSettings, answer)` and invalidates `queryKeys.setupStatus` (onboarding's `ai_configured`).

`AdminServer` (e2e): `settings` (the `_settings_answer` shape with `openrouter_api_key_set` only; the key value is stored privately as `keyValue` and never answered), `save(sent)` (422 on the field for unknown routing keys/values, model > 200, base URL without http(s); `""` key clears), `test(kind)` (answers a programmable `nextTestResult`, counts calls, `reply(429, {error})` from the eleventh), `models` (three fixtures, one free), `aiError` (code or null), `clearAiError()`, `cleanup()` (`{removed: 2}`), `wipe(sent)` (400 `wrong_password` unless `ADMIN_PASSWORD`), users list with `create`/`delete` rules of Task 2. Routes merged with `settingsRoutes()` of 7a so the frame's queries are served.

- [ ] **Step 5: E2E** `adminAi.spec.ts`: "member sees no Administration" (override `GET /me`); "save a new key, the input is empty again, the page never shows it"; "a failing test shows the reason sentence"; "the eleventh test says wait"; screenshots of KI (both themes, 1440/390) and the nav with the admin group at 375.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 6: KI › model choice and task routing

**Files:**
- Create: `web/src/features/settings/admin/ModelPicker.tsx`, `modelFilter.ts`, `RoutingForm.tsx`, `taskLabels.ts`
- Modify: `CloudProviderForm.tsx` (the picker replaces the text field once models are loaded), `AiSection.tsx` (adds `RoutingForm`), `de.ts`, `en.ts`, `tests/e2e/support/adminServer.ts`
- Test: `web/tests/unit/features/settings/modelFilter.test.ts`, `web/tests/unit/features/settings/routingForm.test.tsx`, `web/tests/e2e/adminRouting.spec.ts`

**Interfaces:**
- Consumes: `openRouterModelsQueryOptions`, `OpenRouterModel`, `AI_TASKS`, `AiTask`, `AiProvider`, `ADMIN_LIMITS`, `useAiSettingsSave`, `Seg`, `SelectField`, `TextField`, `CheckField`, `Notice`.
- Produces: `filterModels({ models, query, freeOnly, current })` -> `OpenRouterModel[]` (at most `ADMIN_LIMITS.modelOptions`, the current model always first when present), `isFreeModel(model)`; `TASK_LABEL: Record<AiTask, MessageKey>`; `routingWarnings({ routing, settings })` -> `("localWithoutUrl" | "cloudWithoutKey")[]`.

- [ ] **Step 1: i18n keys** — task labels (`settings.task.job_analysis` "Stellen bewerten" // "Rate jobs", `cover_letter` "Anschreiben schreiben" // "Write cover letters", `cv_tailoring` "Lebenslauf anpassen" // "Tailor CVs", `interview_prep` "Interview vorbereiten" // "Prepare interviews", `company_profile` "Firmen recherchieren" // "Research companies", `deep_dive` "Tiefenrecherche" // "Deep dives", `extract_job_details` "Stellendaten auslesen" // "Read job details", `platform_name` "Quellennamen vorschlagen" // "Suggest source names"), `settings.ai.tasks` "Aufgaben" // "Tasks", `settings.ai.tasksIntro` "Welcher Anbieter welche Aufgabe übernimmt. Lokale Modelle sparen Kosten bei einfachen, häufigen Aufgaben." // "Which provider handles which task. Local models save cost on simple, frequent tasks.", `settings.ai.providerFor` "Anbieter für {task}" // "Provider for {task}", `settings.ai.cloudShort` "Cloud (OpenRouter)" // "Cloud (OpenRouter)", `settings.ai.localShort` "Lokal" // "Local", `settings.ai.warnLocal` "Für lokale Aufgaben fehlt die Adresse des lokalen Servers." // "Local tasks need the address of the local server.", `settings.ai.warnCloud` "Für Cloud-Aufgaben fehlt der OpenRouter-Schlüssel." // "Cloud tasks need the OpenRouter key.", `settings.ai.loadModels` "Modelle laden" // "Load models", `settings.ai.searchModels` "Modell suchen" // "Search models", `settings.ai.freeOnly` "Nur kostenlose Modelle" // "Free models only", `settings.ai.modelOption` "{name} · {context} Token" // "{name} · {context} tokens", `settings.ai.free` "kostenlos" // "free", `settings.ai.noModels` "Kein Modell passt." // "No model matches."
- [ ] **Step 2: Write the failing tests**

```ts
// web/tests/unit/features/settings/modelFilter.test.ts
import { describe, expect, it } from "vitest";
import { filterModels, isFreeModel } from "@/features/settings/admin/modelFilter";

const FREE = { id: "a/free:free", name: "A Free", context_length: 8000, pricing: { prompt: "0", completion: "0" } };
const PAID = { id: "b/paid", name: "B Paid", context_length: 128000, pricing: { prompt: "0.000001", completion: "0.000002" } };

describe("filterModels", () => {
  it("filters by name or id and by price", () => {
    expect(filterModels({ models: [FREE, PAID], query: "paid", freeOnly: false, current: "" })).toEqual([PAID]);
    expect(filterModels({ models: [FREE, PAID], query: "", freeOnly: true, current: "" })).toEqual([FREE]);
  });
  it("keeps the stored model first even when the filter hides it", () => {
    expect(filterModels({ models: [FREE, PAID], query: "free", freeOnly: true, current: "b/paid" })[0]).toEqual(PAID);
  });
  it("treats a model without prices as not free", () => {
    expect(isFreeModel({ ...PAID, pricing: {} })).toBe(false);
  });
});
```

`routingForm.test.tsx`: "Speichern sends the full map once" (toggle `cv_tailoring` to Cloud -> body `{ai_task_routing: {…8 keys…}}`); "warns when local tasks have no address" (settings with `ollama_base_url: ""` and a local task -> the warn sentence, the save still allowed); "each seg is named after its task" (`getByRole("group", { name: "Anbieter für Lebenslauf anpassen" })`).
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** `modelFilter.ts` (pure; `isFreeModel` = prompt and completion parse to 0), `ModelPicker` (button "Modelle laden" enabling the query; when loaded: `TextField type="search"` "Modell suchen", `CheckField` "Nur kostenlose Modelle", `SelectField` "Modell" over `filterModels(...)`, option text `settings.ai.modelOption` plus " · kostenlos"; `onChange` sets the form's `model`; while loading `Button busy`; an error shows `describeError`), `RoutingForm` (`useSectionForm(settings.ai_task_routing)`, one `Seg` per task with `label={t("settings.ai.providerFor", { task })}`, `routingWarnings` as a warn `Notice` above the save button, submit `useAiSettingsSave("settings.ai.saved").mutate({ ai_task_routing: draft })`), `taskLabels.ts`.
- [ ] **Step 5: E2E** `adminRouting.spec.ts`: "pick a free model from the loaded list and save" (asserts the sent `openrouter_model`); "route two tasks locally and save" (asserts the map; the FakeServer's answer is the merged map; reload shows it); screenshot of the routing form at 390 (segs wrap, no horizontal scroll).
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 7: Benutzer: list, create, delete

**Files:**
- Modify: `web/src/features/settings/admin/UsersSection.tsx`, `de.ts`, `en.ts`, `tests/e2e/support/adminServer.ts`
- Create: `web/src/features/settings/admin/UserList.tsx`, `CreateUserForm.tsx`
- Test: `web/tests/unit/features/settings/users.test.tsx`, `web/tests/e2e/adminUsers.spec.ts`

**Interfaces:**
- Consumes: `usersQueryOptions`, `createUser`, `deleteUser`, `AdminUser`, `ADMIN_LIMITS`, `USERNAME_PATTERN`, `ADMIN_REFUSAL`, `PASSWORD_LIMITS` (7a), `useCurrentUser`, `ConfirmDialog`, `refusalText`, `DrawerSection`, `useSectionForm`, `Tag`.
- Produces: `USER_REFUSALS: RefusalTable` (`field: "username"`, 409 `username_taken` -> "Diesen Benutzernamen gibt es schon.", 409 `cannot_delete_self` -> "Du kannst dich nicht selbst löschen.", 409 `cannot_delete_admin` -> "Admins lassen sich hier nicht löschen."); `usernameProblem(name)` -> `"tooShort" | "tooLong" | "chars" | null`.

- [ ] **Step 1: i18n keys** (`settings.users.*`: title "Benutzer", `you` "(du)", `roleAdmin` reuse `user.roleAdmin`, `roleMember` reuse `user.roleMember`, `delete` "{name} löschen", `deleteTitle` "{name} löschen?", `deleteText` "{name} und alle Stellen, Bewerbungen, Quellen, Nachweise und Vorlagen dieses Kontos werden gelöscht. Das lässt sich nicht rückgängig machen.", `deleted` "{name} gelöscht.", `create` "Benutzer anlegen", `username` "Benutzername", `usernameHint` "3 bis 50 Zeichen: Buchstaben, Ziffern und . _ @ -", `password` "Passwort", `passwordHint` "Mindestens 8 Zeichen. Teile das Passwort auf einem sicheren Weg.", `created` "{name} angelegt.", `taken`, `cannotSelf`, `cannotAdmin`, `usernameChars` "Nur Buchstaben, Ziffern und . _ @ -", `empty` "Noch keine weiteren Benutzer."; each with its EN twin).
- [ ] **Step 2: Write the failing tests** (`users.test.tsx`): "lists users with role tags and marks oneself"; "no Löschen for oneself or an admin"; "Löschen asks, deletes and toasts"; "a taken name is a field error with the fixed sentence, never the server text"; "a name with a space is refused before sending"; "after creating, the form is empty and the list refetches".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** `UserList` (`SectionState` over `usersQueryOptions()`; `<ul className="user-list">` rows: name, `Tag` role, "(du)", and for other members a ghost danger icon button `Trash2` with `aria-label` `settings.users.delete` -> `ConfirmDialog` danger; success invalidates `queryKeys.users`, toasts, and moves focus to the section heading). `CreateUserForm` (`DrawerSection` "Benutzer anlegen" with username and password `TextField`s (`autoComplete="off"` / `"new-password"`), client checks, `refusalText` for 409, `VALIDATION_ERROR` on a field -> the field's fixed sentence; success resets the draft, invalidates the list, toasts). CSS `.user-list li { display: flex; gap: 8px; align-items: center; min-height: 44px; border-top: 1px solid var(--line); }`.
- [ ] **Step 5: E2E** `adminUsers.spec.ts`: create, refuse a duplicate, delete with confirmation; screenshots.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 8: Systemfehler: AI error with reset, crawl clean-up, database wipe

**Files:**
- Modify: `web/src/features/settings/admin/SystemSection.tsx`, `de.ts`, `en.ts`, `tests/e2e/support/adminServer.ts`
- Create: `web/src/features/settings/admin/AiErrorBlock.tsx`, `MaintenanceBlock.tsx`, `WipeDatabase.tsx`
- Test: `web/tests/unit/features/settings/system.test.tsx`, `web/tests/e2e/adminSystem.spec.ts`

**Interfaces:**
- Consumes: `systemStatusQueryOptions`, `clearAiError`, `cleanupCrawls`, `wipeDatabase`, `AiErrorCode`, `ADMIN_REFUSAL`, `AI_SETTINGS_HREF`, `ConfirmDialog`, `Notice`, `pushEvent` (e2e).
- Produces: `AI_ERROR_TEXT: Record<AiErrorCode, MessageKey>`.

- [ ] **Step 1: i18n keys** (`settings.system.*`: `aiTitle` "KI-Fehler", `aiNone` "Zurzeit kein KI-Fehler.", per code: `auth` "Der OpenRouter-Schlüssel wurde abgelehnt.", `rate_limit` "OpenRouter begrenzt gerade die Anfragen.", `model_not_found` "Das eingestellte Modell gibt es bei OpenRouter nicht.", `connection` "OpenRouter war nicht erreichbar.", `server` "OpenRouter hatte einen Serverfehler.", `unknown` "Ein KI-Fehler wurde gemeldet.", `aiClear` "Fehler zurücksetzen", `aiCleared` "KI-Fehler zurückgesetzt.", `toAi` "Zu den KI-Einstellungen", `maintenance` "Wartung", `cleanup` "Hängende Läufe aufräumen", `cleanupHint` "Entfernt Läufe, die seit 15 Minuten keinen Fortschritt melden.", `cleaned` "{count} hängende Läufe entfernt.", `wipe` "Datenbank leeren", `wipeOwn` "Nur meine Daten", `wipeAll` "Alle Benutzer (Stellen, Quellen, Firmenprofile)", `wipeText` "Benutzerkonten und Profile bleiben. Das lässt sich nicht rückgängig machen.", `wipePassword` "Dein Passwort", `wrongPassword` "Das Passwort stimmt nicht."; EN twins).
- [ ] **Step 2: Write the failing tests** (`system.test.tsx`): "no error shows the calm line"; "each code shows its sentence, never the stored text" (parametrized over `AI_ERROR_CODES`); "Fehler zurücksetzen calls the clear endpoint and the block turns calm after the refetch"; "an ai_error event refreshes the block" (render with a socket factory from `tests/unit/support/fakeSocket.ts` if the section test can mount `RealtimeProvider`; otherwise assert `queryKeys.systemStatus` invalidation in `handleMessage.test.ts`, which already covers it, and skip here); "Aufräumen toasts the count"; "the wipe asks for a password; 400 wrong_password is a field error and the dialog stays"; "a successful wipe navigates fully to /inbox".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** `AiErrorBlock` (`SectionState`; `ai_error === null` -> `<p className="meta t-ok">` with a check; else `<Notice tone="error">` with the sentence, a `Button size="sm"` "Fehler zurücksetzen" (`useMutation(clearAiError)`, invalidates `queryKeys.systemStatus`) and a `Link` to `AI_SETTINGS_HREF`). `MaintenanceBlock` (button -> `cleanupCrawls()` -> toast with the count; invalidates `queryKeys.activity`). `WipeDatabase` (in a `.danger-zone`: a `<fieldset>` with two radios (`Nur meine Daten` default), a danger button -> `ConfirmDialog` danger containing a password `TextField`; `BAD_REQUEST` with `message === ADMIN_REFUSAL.wrongPassword` -> field error; success -> `window.location.assign("/inbox")`).
- [ ] **Step 5: E2E** `adminSystem.spec.ts`: "an AI error arrives live and is reset" (open the section with `aiError: null`, set the server's `aiError = "auth"`, push `{type: "ai_error"}` through `ApiLog.sockets[0]`, expect the sentence, click reset, push `ai_error_cleared`, expect the calm line); "wipe with a wrong password stays"; screenshots.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 9: Firmen: list with search, research state and admin scope

**Files:**
- Modify: `web/app/(app)/companies/page.tsx`, `web/app/globals.css` (import `companies.css`), `web/tests/e2e/shell.spec.ts` (remove the placeholder routes block), `de.ts`, `en.ts`
- Create: `web/src/features/companies/CompaniesPage.tsx`, `CompanyList.tsx`, `CompanyRow.tsx`, `useCompaniesUrl.ts`, `companies.css`
- Create: `web/tests/unit/support/companiesRoutes.ts`, `web/tests/unit/features/companies/companyList.test.tsx`, `web/tests/e2e/support/companiesServer.ts`, `web/tests/e2e/companies.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`companySummariesQueryOptions`, `CompanySummary`, `companiesLocationOf`, `companiesHref`, `filterCompanies`, `researchStateOf`), `useTaskPhase`, `pendingTaskId.research`, `Monogram`, `Masthead`, `EmptyState`, `TextField`, `CheckField`, `useDebouncedValue`, `useJobFormat` or `formatDate` (date), `useCurrentUser`, `ListLoading`, `ListError`, `givenUp`.
- Produces: `useCompaniesUrl()` -> `{ location: CompaniesLocation; setQuery(q); setAll(on) }` (`router.replace(..., { scroll: false })`); `CompaniesPage()` switching between the list and `CompanyDetail` (Task 10) by `location.domain`; `CompaniesServer` (e2e: directory per user, profiles, jobs per domain, research start -> pending, admin rename/delete); `companiesRoutes(server, extra)`.

- [ ] **Step 1: i18n keys** (`companies.*`: `title` reuse `nav.companies`, `deck` "Firmen aus deinen Stellen und ihre Recherche.", `search` "Firmen durchsuchen", `all` "Alle Firmen dieser Installation", `jobs` "{count} Stellen", `jobsOne` "1 Stelle", `researched` "Recherchiert am {date}", `running` "Recherche läuft …", `none` "Noch nicht recherchiert", `emptyTitle` "Noch keine Firmen", `empty` "Eine Firma erscheint hier, sobald eine deiner Stellen eine Web-Adresse hat.", `noMatch` "Keine Firma passt zu „{q}“.", `found` "{count} Firmen"; EN twins).
- [ ] **Step 2: Write the failing tests** (`companyList.test.tsx`): "lists the user's companies with state and job count"; "search filters on the client and writes ?q= with replace"; "a running research shows 'Recherche läuft …'" (seed `queryKeys.pendingTasks` with `startTask(EMPTY_PENDING, "research:acme.de", now)`); "a member has no 'Alle Firmen' check; an admin's check requests scope=all"; "rows are links to ?domain= with no nested controls".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** Route file:

```tsx
import { Suspense } from "react";
import { CompaniesPage } from "@/features/companies/CompaniesPage";

export default function CompaniesRoute() {
  // The open company and the search live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <CompaniesPage />
    </Suspense>
  );
}
```

`CompaniesPage`: `const { location } = useCompaniesUrl(); return location.domain ? <CompanyDetail domain={location.domain} /> : <CompanyListPage />;`. `CompanyListPage`: `Masthead` (title `nav.companies`, deck), a toolbar (`TextField type="search"` with `maxLength={SEARCH_LIMITS.max}` bound to a local draft, written to the URL through `useDebouncedValue(draft, SEARCH_LIMITS.debounceMs)` + `setQuery`; admins: `CheckField` "Alle Firmen dieser Installation"), a `role="status"` count line, then `CompanyList` (`SectionState`-like: loading, error, `EmptyState` for none, the no-match sentence, else `<ul className="company-list">` of `CompanyRow`). `CompanyRow`: `<li>` with `Monogram`, a `Link` (the name; the only interactive element in the row) to `companiesHref({ domain, q: "", all: false })`, meta line (domain · state · job count). CSS `companies.css`: `.company-list li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); min-height: 44px; }`, `.company-list a { font-weight: 600; }`, `.company-meta { font-size: var(--fs-13); color: var(--text-2); }`, toolbar wrapping under 560 px.
- [ ] **Step 5: E2E** `companies.spec.ts`: "no foreign company" (the server's other user owns `globex.de`; the list shows only `acme.de`); "search narrows and the URL keeps it after reload"; "an admin sees all"; screenshots (both themes, 1440/390), no horizontal scroll at 375; and the shell spec no longer has placeholder routes.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 10: Firmen detail: shared company view, research, deep dives, the user's jobs

**Files:**
- Modify: `web/src/features/job/company/CompanyTab.tsx` (export `useResearch` and `RefreshControl`; no behaviour change), `web/src/features/companies/CompaniesPage.tsx`, `companies.css`, `de.ts`, `en.ts`, `tests/e2e/support/companiesServer.ts`
- Create: `web/src/features/companies/CompanyDetail.tsx`, `CompanyResearchPanel.tsx`, `CompanyJobs.tsx`
- Test: `web/tests/unit/features/companies/companyDetail.test.tsx`, `web/tests/e2e/companyDetail.spec.ts`

**Interfaces:**
- Consumes: `companyQueryOptions(domain)` (phase 2, `null` for no profile), `companySummariesQueryOptions`, `companyJobsQueryOptions`, `CompanyProfileView`, `DeepDiveList`, `useResearch(domain, force)`, `RefreshControl({ domain })`, `TaskProgress`, `statusLabel`, `jobRoute`, `Monogram`, `useJobFormat`.
- Produces: `CompanyDetail({ domain })`, `CompanyResearchPanel({ domain, name })`, `CompanyJobs({ domain, name })`.

- [ ] **Step 1: i18n keys** (`companies.back` "Alle Firmen" (reuse `company.all` if its value matches; it does: "Alle Firmen"), `companies.ownJobs` "Deine Stellen bei {name}", `companies.noOwnJobs` "Keine eigenen Stellen bei dieser Firma.", `companies.archived` "Aussortiert"; reuse `company.shared`, `company.emptyTitle`, `company.emptyText`, `company.research`, `company.running`, `company.deepDives`).
- [ ] **Step 2: Write the failing tests** (`companyDetail.test.tsx`): "shows the shared profile with deep dives and the refresh confirmation" (reuses phase 2 fixtures of `tests/unit/api/companies.test.ts`); "without a profile offers 'Firma recherchieren', which starts the research once and shows its progress"; "lists the user's jobs at the company with their phase and links"; "a company_profile_ready event replaces the progress with the profile" (seed pending, invalidate as `applyEvent` does); "an invalid domain parameter shows the list".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** `CompanyDetail`: a `Link` back (`ArrowLeft` icon + "Alle Firmen") to `COMPANIES_HREF`; header (`Monogram`, `<h1 className="mast-title">` name from the summary or the profile or the domain, the domain as meta); `CompanyResearchPanel`; `CompanyJobs`. `CompanyResearchPanel`: `useQuery(companyQueryOptions(domain))`; pending -> `ListLoading`; profile -> `<p className="meta">{t("company.shared")}</p>`, `CompanyProfileView`, a `prep-sec` with `DeepDiveList({ domain, companyName: name, jobTitle: "", items: profile.deep_dive_buttons })`, and a stamp row with the date and `RefreshControl`; no profile -> the `dim-panel` of phase 2 with `company.emptyTitle`/`emptyText`, `TaskProgress` while running, else a `Button` "Firma recherchieren" calling `useResearch(domain, false).run`. `CompanyJobs`: `useQuery(companyJobsQueryOptions(domain))`; a `<section>` with `<h2 className="sec-title-sm">` and a list of `Link`s to `jobRoute(job.id)` (title, then `t(statusLabel(job.status))` as meta), or the empty sentence.
- [ ] **Step 5: E2E** `companyDetail.spec.ts`: "research journey" (the journey "company research" of spec 7: open a company without a profile, start, the activity shows the task, push `company_profile_ready` with the user's `user_id`, the profile appears, the list row says "Recherchiert am …"); "the job page's 'Alle Firmen' link lands on this detail"; screenshots.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 11: Firmen: admin rename and delete of a shared company profile (carried phase 2 C1)

**Files:**
- Create: `web/src/features/companies/CompanyAdminActions.tsx`, `RenameCompanyDialog.tsx`
- Modify: `web/src/features/companies/CompanyDetail.tsx` (render the actions), `de.ts`, `en.ts`, `tests/e2e/support/companiesServer.ts`
- Test: `web/tests/unit/features/companies/companyAdmin.test.tsx`, `web/tests/e2e/companyAdmin.spec.ts`

**Interfaces:**
- Consumes: `renameCompany`, `deleteCompanyProfile`, `ADMIN_LIMITS.companyName`, `ConfirmDialog`, `Dialog`, `PanelHeader`, `TextField`, `useCurrentUser`, `queryKeys.company(domain)`, `queryKeys.companiesRoot`.
- Produces: `CompanyAdminActions({ domain, name })` (renders nothing for members or without a profile).

- [ ] **Step 1: i18n keys** (`companies.admin.rename` "Umbenennen", `renameTitle` "Firmenprofil umbenennen", `renameLabel` "Name", `renameHint` "Gilt für alle Benutzer.", `renamed` "Umbenannt in {name}.", `delete` "Profil löschen", `deleteTitle` "Firmenprofil löschen?", `deleteText` "Das Firmenprofil wird für alle Benutzer gelöscht. Stellen bleiben erhalten und können neu recherchiert werden.", `deleted` "Firmenprofil gelöscht.", `nameRequired` reuse `settings.problem.required`, `nameTooLong` reuse `settings.problem.tooLong`; EN twins).
- [ ] **Step 2: Write the failing tests** (`companyAdmin.test.tsx`): "members see no admin actions"; "admins see none without a profile"; "rename refuses spaces and 201 characters before sending, then sends the trimmed name and shows it"; "delete asks with the 'für alle Benutzer' text, then the detail shows 'Noch keine Recherche' and the directory refetches"; "a 404 after another admin deleted it shows the generic not-found sentence and refreshes".
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.** Two ghost buttons in the stamp row (`Pencil` "Umbenennen", `Trash2` "Profil löschen" danger). Rename: `Dialog` with a `<form>` (`TextField` name prefilled, hint, client check, `useMutation(renameCompany)`; success `setQueryData` on the company (name) and invalidates `companiesRoot`, toast, close; `VALIDATION_ERROR` -> field error). Delete: `ConfirmDialog` danger; success `setQueryData(queryKeys.company(domain), null)`, invalidates `companiesRoot`, toast, focus to the detail heading.
- [ ] **Step 5: E2E** `companyAdmin.spec.ts`: rename then reload keeps the name; delete then the job page's Firma tab offers research again; screenshots of both dialogs.
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 12: Global search: results for jobs and companies, keyboard, sidebar entry

**Files:**
- Modify: `web/src/features/shell/GlobalSearch.tsx` (results, controlled field), `web/src/features/shell/Sidebar.tsx` (search button), `web/src/features/shell/shell.css`, `de.ts`, `en.ts` (replace the value of `search.hint`)
- Create: `web/src/features/shell/search/SearchResults.tsx`, `useSearchResults.ts`, `useResultKeys.ts`
- Test: `web/tests/unit/features/shell/globalSearch.test.tsx`, `web/tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `searchQueryOptions`, `SearchResult`, `SEARCH_LIMITS`, `useDebouncedValue`, `jobRoute`, `companiesHref`, `statusLabel`, `requestSearch`, `isTypingTarget`, `Dialog`, `TextField`.
- Produces: `useSearchResults(text)` -> `{ query: string; result: SearchResult | undefined; state: "short" | "loading" | "ready" | "error" }`; `useResultKeys(listRef)` -> `onKeyDown` for the field and the lists (ArrowDown/Up/Home/End over `a[data-result]`).

- [ ] **Step 1: i18n keys**

```ts
  "search.hint": "Mindestens 2 Zeichen.", // "At least 2 characters."
  "search.jobs": "Stellen", // "Jobs"
  "search.companies": "Firmen", // "Companies"
  "search.found": "{count} Treffer", // "{count} results"
  "search.none": "Nichts gefunden für „{q}“.", // "Nothing found for "{q}"."
  "search.archived": "Aussortiert", // "Discarded"
  "search.open": "Suchen", // "Search"
  "search.shortcut": "Taste /", // "Key /"
```

- [ ] **Step 2: Write the failing tests**

```tsx
// web/tests/unit/features/shell/globalSearch.test.tsx (excerpt)
describe("global search", () => {
  it("one request after typing stops, none below two characters", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubRoutes({ "GET /search": { jobs: [JOB_HIT], companies: [COMPANY_HIT] } });
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    await userEvent.type(screen.getByLabelText("Stellen und Firmen durchsuchen"), "k");
    expect(screen.getByText("Mindestens 2 Zeichen.")).toBeVisible();
    await userEvent.type(screen.getByLabelText("Stellen und Firmen durchsuchen"), "otl");
    await vi.advanceTimersByTimeAsync(SEARCH_LIMITS.debounceMs);
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(calls.filter((call) => call.url.includes("/search"))).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("q")).toBe("kotl");
  });

  it("arrow keys move through results and Enter follows the link and closes", async () => {
    stubRoutes({ "GET /search": { jobs: [JOB_HIT], companies: [COMPANY_HIT] } });
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    await userEvent.type(screen.getByLabelText("Stellen und Firmen durchsuchen"), "acme");
    await screen.findByRole("link", { name: /ACME/ });
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: /Kotlin Dev/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: /ACME/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(liveNavigation.current()).toBe("/companies?domain=acme.de");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when nothing matches and announces the count", async () => {
    stubRoutes({ "GET /search": { jobs: [], companies: [] } });
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    await userEvent.type(screen.getByLabelText("Stellen und Firmen durchsuchen"), "zz");
    expect(await screen.findByText("Nichts gefunden für „zz“.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Nichts gefunden");
  });

  it("an archived job says so", async () => {
    stubRoutes({ "GET /search": { jobs: [{ ...JOB_HIT, is_archived: true }], companies: [] } });
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    await userEvent.type(screen.getByLabelText("Stellen und Firmen durchsuchen"), "kotlin");
    expect(await screen.findByText("Aussortiert")).toBeVisible();
  });
});
```

(`JOB_HIT = { id: "j1", title: "Kotlin Dev", company: "ACME", company_domain: "acme.de", status: "OPEN", is_archived: false }`, `COMPANY_HIT = { domain: "acme.de", name: "ACME" }`; the existing tests "`/` is ignored in inputs" stay.)

- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Implement.**

```ts
// web/src/features/shell/search/useSearchResults.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { SEARCH_LIMITS } from "@/api/adminPaths";
import { searchQueryOptions } from "@/api/search";
import { givenUp } from "@/api/queryState";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

export type SearchState = "short" | "loading" | "ready" | "error";

/** D10: one request per pause; the query key carries the text, so a late answer never shows for newer text. */
export function useSearchResults(text: string) {
  const query = useDebouncedValue(text.trim(), SEARCH_LIMITS.debounceMs);
  const results = useQuery(searchQueryOptions(query));
  const state: SearchState =
    query.length < SEARCH_LIMITS.min ? "short" : results.data ? "ready" : givenUp(results) ? "error" : "loading";
  return { query, result: results.data, state, retry: () => void results.refetch() };
}
```

```ts
// web/src/features/shell/search/useResultKeys.ts
"use client";

import type { KeyboardEvent, RefObject } from "react";

const RESULT_SELECTOR = "a[data-result]";
const KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

function targetIndex(key: string, current: number, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return Math.min(current + 1, count - 1);
  return Math.max(current - 1, 0);
}

/** D10: from the field ArrowDown enters the results; inside them the arrows, Home and End move. */
export function useResultKeys(container: RefObject<HTMLElement | null>) {
  return (event: KeyboardEvent) => {
    if (!KEYS.has(event.key) || !container.current) return;
    const links = Array.from(container.current.querySelectorAll<HTMLAnchorElement>(RESULT_SELECTOR));
    if (links.length === 0) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[targetIndex(event.key, current, links.length)]?.focus();
  };
}
```

`SearchResults({ result, query, onNavigate })`: two groups with `<h3 className="sec-title-sm">` "Stellen" / "Firmen" and `<ul>`s of `<li><Link data-result href=… onClick={onNavigate}>` (job: title as main text, company and `t(statusLabel(status))` or "Aussortiert" as meta; company: name, domain as meta); groups without hits are omitted. `GlobalSearch`: the field becomes controlled (`text`, `maxLength={SEARCH_LIMITS.max}`), `onKeyDown` on the panel wrapper uses `useResultKeys(listRef)`; below the field: `state === "short"` -> hint; `"loading"` -> `ListLoading`; `"error"` -> `ListError` with retry; `"ready"` -> `SearchResults`; a persistent `<p role="status" className="sr-only">` with `search.found` / `search.none`; closing clears the text (state reset on close). `onNavigate` closes the dialog (the link navigates). Sidebar: before the settings link a `<button type="button" className="side-btn" onClick={requestSearch}>` with `Search` icon, "Suchen" and `<kbd className="end meta faint" aria-hidden>/</kbd>` (the shortcut stays discoverable; `aria-keyshortcuts="/"` on the button).
- [ ] **Step 5: E2E** `search.spec.ts`: "search from the keyboard" (press `/` on `/inbox`, type, ArrowDown, Enter -> job page); "a company result opens the company detail"; "`/` inside an input types a slash" (existing behaviour kept); "mobile: Mehr › Suchen opens the dialog, no horizontal scroll at 375"; "typing fast sends one request per pause" (count `log.calls` for `GET /search`); screenshots of the dialog with results (both themes, 1440/390).
- [ ] **Step 6: Run to verify pass.** **Step 7: Checkpoint.**

---

### Task 13: E2E journeys (phase 7 exit: "e2e settings/admin green"; spec journeys "admin" and "company research")

**Files:**
- Create: `web/tests/e2e/adminJourneys.spec.ts`
- Modify: fake servers only to add a missing real-server rule

- [ ] **Step 1: Write the journeys**
  1. **Admin journey:** an admin saves an OpenRouter key and a model, checks the connection (ok), routes `cv_tailoring` to local with an address, checks the local connection (model missing -> the list sentence), creates a user, deletes that user, sees an AI error arrive live and resets it. No request body contains a key except the one save that typed it; the page never shows it.
  2. **Member journey:** a member opens every admin URL by hand and lands on Allgemein each time; no admin request is sent (`log.requests` holds no `/admin/` or `/users` entry).
  3. **Company research journey:** from a job's Firma tab "Alle Firmen" -> list -> detail without profile -> research -> event -> profile -> deep dive -> back to the list (state "Recherchiert am …").
  4. **Admin profile maintenance:** rename, then delete a profile; another user's job page still shows the company domain and offers research.
  5. **Search everywhere:** `/` from the inbox, the applications page and the job page; Escape returns focus to where it was.
- [ ] **Step 2: Run** `"$QA"/webrun.sh pnpm test:e2e -- tests/e2e/adminJourneys.spec.ts` -> PASS; then the whole suite.
- [ ] **Step 3: Checkpoint.**

---

### Task 14: Context documentation (7b, closes phase 7)

**Files:**
- Modify: `context/progress-tracker.md`, `context/architecture.md`, `context/ui-context.md`, `context/code-standards.md`

- [ ] **Step 1: Progress tracker.** Phase line: `**Phase:** Frontend redesign - phase 7 (Einstellungen incl. admin sections, Firmen with admin profile maintenance, global search) done; next is phase 8 (full QA pass).` Status Board: a row "Frontend redesign - phase 7b (admin, Firmen, search)" ✅ with the File Map files and the test counts. ADRs (only these): "Company directory per user" (G6: `/companies` lists the user's own domains; profiles stay shared; admins see all); "Connection tests answer data" (G2: 200 with a fixed reason; raw errors only logged); "AI error as a code" (G3); "Admin role test" (one parametrized test over every admin route). Open Questions: remove "Phase 7 carry: admin rename/delete" (done) and narrow "Existing `company_profiles` rows may contain personalised content" to "use Einstellungen-free admin delete on `/companies` per row, or the one-off SQL"; add the hand-off's product questions Q3-Q5 with their provisional rulings; add "the old UI's `/companies` page no longer works (G6)" until the cutover.
- [ ] **Step 2: architecture.md.** `GET /search`, `GET /companies` shape and scope, `GET /jobs?company_domain=`, admin company routes, `GET /admin/system-status`, the Redis key `system:ai_error_code`, rate limits of tests, research and deep dives, `core/like_pattern.py`, `services/company_directory.py`.
- [ ] **Step 3: ui-context.md.** Einstellungen admin group, KI forms, Systemfehler, `/companies` list and detail, the search dialog and the sidebar search button.
- [ ] **Step 4: code-standards.md.** Security: "Every admin route depends on `get_current_admin_user` and is listed in `test_every_admin_route_refuses_a_member`." Backend: "External-call endpoints carry a slowapi limit; tests that call them use `fresh_rate_limits`."
- [ ] **Step 5: Checkpoint.** Only `context/` changed.

---

## Self-Review

**Spec coverage (7b part):** `/settings` admin sections KI (OpenRouter/Ollama settings, task routing) -> Tasks 1, 5, 6; Benutzer -> Tasks 2, 7; Systemfehler (AI error banner and clear) -> Tasks 1, 8; `/companies` list with search and research state -> Tasks 3, 9; detail with company view and the user's jobs -> Tasks 3, 10; reached from the Firma tab and the search -> Tasks 10, 12; carried admin rename/delete of a company profile -> Tasks 3, 11; global search over jobs and companies -> Tasks 3, 12; admin role checks -> Task 3 test; confirmations for destructive admin actions -> Tasks 5, 7, 8, 11; rate limits on AI and external calls (AI tests, model list, research, deep dive) -> Tasks 1, 3; never echo server text -> Tasks 1 (codes), 5, 7, 8 (fixed sentences); journeys "admin", "company research" -> Task 13.

**Placeholder scan:** larger components are specified by structure, props, ids, keys, behaviour and tests; every contract, domain function, backend change and test has code. No "TBD".

**Type consistency:** `SettingsSection` becomes `UserSection | AdminSection` in Task 4 and `settingsSectionFromParam` gains `isAdmin`; Task 5 updates its only caller (`useSettingsSection`), and 7a's unit tests are extended in Task 4 (the one-argument calls get `false`). `CompanySummary` (Task 4) feeds Tasks 9-11; `CompanyScope` and `companiesPath` come only from `adminPaths.ts`; `TestReason`/`REASON_TEXT` (Tasks 4-5) match the backend's reason strings (Task 1); `AiErrorCode`/`AI_ERROR_TEXT` (Tasks 4, 8) match `AI_ERROR_*` (Task 1); `ADMIN_REFUSAL` matches Task 1-2 codes; `delete_user` and `NewPassword` come from 7a Task 2.

**Review Focus:** 1 -> Tasks 3, 5; 2 -> Tasks 1, 5, 6; 3 -> Tasks 2, 3, 7, 11; 4 -> Tasks 3, 9; 5 -> Tasks 3, 12.
