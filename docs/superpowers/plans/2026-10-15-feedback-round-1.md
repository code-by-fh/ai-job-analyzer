# Feedback Round 1 (2026-10-15) - Implementation Plan

Source: the user's feedback list of 2026-10-15 (38 points, German). Each task quotes the points it
covers verbatim, then states the ruling the controller made where the point leaves room. No spec file
beyond this plan; rulings are provisional and listed in the SDD ledger.

## Global Constraints

- Work in `/mnt/c/Users/fhamann/Development/claude/private/ai-job-analyzer`. NO git commands (the user commits).
- Follow `CLAUDE.md`, `context/code-standards.md`, `context/ui-context.md`, the `coding-standards` skill.
- Frontend lives in `frontend/` (Next 16, React 19, TanStack Query, zod, typed DE/EN i18n in
  `frontend/src/i18n/{de,en}.ts` - every new string in both languages). Backend in `server/` (FastAPI,
  SQLAlchemy, Alembic, Celery). Never edit existing migrations; add new revisions.
- Existing rules stay binding: focus moves only through `ui/focus.ts`; 44 px hit targets; live regions
  as documented; `describeError` never shows server text; no inline styles; WebSocket events go
  through `realtime/applyEvent.ts`; no polling where a realtime event exists.
- Every behaviour change gets tests (pytest / vitest / Playwright as fits). Affected e2e screenshots
  are regenerated and copied back.
- Update `context/progress-tracker.md` (one status-board row per task, named "Feedback 1 - T<N> ...")
  and any context file the change touches.
- Checkpoint per task (run what the task touched):
  backend `. ~/.cache/ai-job-analyzer-qa/env.sh && cd $REPO/server && python -m pytest -p no:cacheprovider -q -o addopts=""`;
  web `~/.cache/ai-job-analyzer-qa/webrun.sh lint`, `typecheck`, `test`, `test:e2e`.
- Docker is not available in the dev container: compose/Dockerfile changes are validated as YAML/syntax only.

## Tasks

### Task 1: Interview prep generation is broken; its progress survives a reload
Points: "die generierung der vorbereitung funktioniert nicht" (log: `worker.generate_interview_prep_task`
received, OpenRouter answers 200 OK, then nothing - no result, no error) and "wenn der user auf
'Vorbereitung erstellen' muss nach einem browser refresh der process noch angezeigt werden."
- Reproduce with a test first (systematic debugging), find the root cause, fix it. Likely suspects: the
  task's result parsing/storage, the published event, or a task-name mismatch - verify, don't guess.
- A running prep must be visible after a reload: the server keeps a durable "prep running" state
  (e.g. a job column or Redis key with the generation sweep's pattern) that `GET /jobs/{id}` exposes,
  and the Interview tab shows the running state from it. A failed run ends that state with a fixed error.

### Task 2: Company research - URL handling, no default, survives reload, optional address
Points: "die angegebene url unter firma recherchieren wird nicht korrekt im backend verarbeitet
(angegeben war 'wwww.bahn.de'): ERROR - OpenRouter API error in generate_company_profile for google.com",
"der default 'google.com' muss entfernt werden", "wenn unter 'firma' auf 'firma recherchieren' geklickt
wurde muss der vorgang der suche auch nach einem browser refresh angezeigt werden",
"die angabe einer firmen adresse soll optional sein. wenn der user keine adresse angibt soll mit hilfe
der quellen url die firma durch einen ki llm call ausfindig gemacht werden."
- Find where `google.com` comes from (default in form or server fallback) and remove it. The domain the
  user typed must be the domain researched (normalised by the existing `services/company_domain.py`
  validator; `wwww.bahn.de` is accepted as typed or refused with a field error - never replaced).
- "Adresse" = the company website domain field. Empty is allowed: the server then asks the AI (routed
  like company research) to identify the company's own website domain from company name, job title and
  the posting/source URL, validates it with the shared validator, and researches that. If the AI finds
  none, a fixed error tells the user to enter the domain.
- Running research survives a reload (durable running state exposed by the API, same pattern as Task 1).

### Task 3: Admin "Daten leeren" deletes everything including profile data
Point: "Die Admin Option 'Daten leeren' soll alles löschen inkl. Profildaten".
- The admin wipe (Einstellungen > Administration > Systemfehler, `WipeDialog`, backend in
  `routers/admin.py` + `services/user_data.py`) also deletes profile data (the `user_settings` rows,
  profile documents, own templates, CV data) in its scope, like "Alles zurücksetzen" does per account.
  User accounts themselves stay. Dialog text says what is deleted.

### Task 4: Sources - schedule more than once a day (backend)
Point: "eine quelle soll auch öfters als nur einmal am tag automatisch durchsucht werden können."
- Ruling: a source has a list of daily times (1-6 `HH:MM` values, profile time zone) instead of one
  time; days stay as they are. New migration adds the list (backfilled from the old single time); the
  scheduler crawls once per due time slot (a slot is due when its time has passed today and no crawl
  started since that slot). API accepts/returns the list (validated, unique, sorted); the old single
  field stays readable for compatibility only if needed by existing clients - the web is the only client.

### Task 5: Sources - add/edit share one form; wizard fixes
Points: "nach dem eine neue quelle gescannt wurde und die links unter 'Stellenlinks wählen' angezeigt
werden sollen keine links vorausgewählt sein und es soll besser beschrieben werden warum man hier die
stellen auswählen soll.", "die darstellung auf 'name und zeitplan' soll verbessert werden (bessere
abgrenzung).", "bei klick auf quelle hinzufügen auf 'name und zeitplan' soll sich das fenster schließen
und die globale anzeige das gecrawlt wird soll sichtbar sein", "eine quelle soll einen edit button
haben der das bearbeiten fenster öffnet", "das url muster was gespeichert werden soll beim hinzufügen
einer neuen quelle soll dem user angezeigt werden und abgefragt werden ob das so okay ist. der user hat
dabei die möglichkeit es anzupassen.", "die checkbox 'Aktiv (wird durchsucht)' ist denke ich unnötig, da
es noch die checkbox 'automatisch durchsuchen' gibt.", "verwende elemente die auf quelle hinzufügen und
auf bearbeiten sind wieder (keine element duplikate).", "quellen sollen wie in der alten ui ein favicon
der zielseite darstellen".
- Step 2: no link preselected; an explanatory text says the chosen example links teach the app which
  links on the page are job postings (the URL pattern is derived from them). "Weiter" needs >= 1 link.
- The derived URL pattern is shown prominently (not under "Erweitert") with an explicit "Muster passt"
  confirmation and an editable field.
- "Name und Zeitplan": clear visual grouping (fieldset/section frames with headings for name, schedule,
  first run). Schedule UI edits the time list from Task 4.
- Submit closes the wizard; the crawl shows in the global crawl indicator (Task 7) - until Task 7 lands,
  the existing activity entry.
- Remove the "Aktiv" checkbox from the UI: "automatisch durchsuchen" is the one switch (ruling: it maps
  to the existing active/schedule fields so a source without auto crawl is still crawlable by hand).
- Name, schedule, pattern and notification fields are one set of components used by wizard and drawer.
- Each source row gets an edit button (pencil, labelled) opening the drawer, and the target site's
  favicon (the server already computes `favicon_url`; expose it on `GET /platforms` if missing; fallback
  monogram when it fails to load; an image from google.com needs the CSP `img-src` entry).

### Task 6: Real crawl progress data (backend)
Point: "die progressbar anzeige einer quelle soll den tatsächlichen stand wiedergeben und nicht 100%
darstellen nur weil alle links gefunden wurden."
- The crawl hash/events carry the real pipeline stages and counts: links found, links filtered as new,
  pages fetched, jobs analysed, skipped/failed, and the current stage name. Progress = work done / total
  work across stages (fetch + analyse), 100 % only at completion. Events stay scoped by user and keep
  the existing names; new fields are additive.

### Task 7: Global crawl indicator, activity popup and the "Aktivität" page
Points: "es soll eine global auf allen seiten sichtbare anzeige geben das und was gerade gecrawlt wird
(lass dir etwas schickes einfallen). die darstellung des crawling prozesses soll detailiert dargestellt
werden.", "bei klick auf aktivität öffnet sich ein popup über den elementen und es darf keine
horizontale scrollbar angezeigt werden", "der menüpunkt 'Aktivität' soll genutzt werden.", plus the
progress bar point (consumes Task 6).
- A compact, always-visible crawl indicator in the shell (all pages, desktop and mobile) while any crawl
  runs: source favicon/name, current stage, animated progress from Task 6 data; reduced-motion respected.
- Clicking it or the "Aktivität" item opens a popover layered above the content (layer stack, no
  horizontal scrollbar at any width) with a detailed stage timeline per running crawl (found -> new ->
  fetched -> analysed, counts, skipped/failed) and the last finished runs; source rows' progress bars
  use the same numbers.

### Task 8: Toasts bottom right
Point: "die notification ballons sollen rechts unten im stack angezeigt werden".
- Toast region bottom-right, newest at the bottom of a vertical stack; on mobile above the bottom bar.

### Task 9: Inbox and onboarding
Points: "die option 'Alle Stellen archivieren' auf der seite 'eingang' gezeigt werden und nicht in den
einstellungen versteckt sein", "bei der ersteinrichtung 'Drei Schritte ...' soll 'per url importieren'
nicht angezeigt werden.", "bei der ersteinrichtung für punkt 2 soll der button 'quelle hinzufügen'
vertikal zentriert im parent element angezeigt werden.", "'Ersteinrichtung ansehen' entfernen. die
ersteinrichtung soll aus den einstellungen heraus neu gestartet werden können".
- "Alle Stellen archivieren" (same confirm and endpoint) moves to the inbox header menu/actions; removed
  from Einstellungen > Konto.
- Onboarding hides the URL import; step 2's button is vertically centred in its row.
- The "Ersteinrichtung ansehen" link leaves the inbox; Einstellungen > Allgemein gets "Ersteinrichtung
  erneut starten" which opens the inbox onboarding view (`/inbox?view=setup`).

### Task 10: Contact, recruiter and salary extracted from the posting (backend)
Point: "kontakt, recruiter und gehaltsrahmen sollen wenn möglich aus der stellenanzeige automatisch
extrahiert und dargestellt werden."
- The job analysis prompt extracts contact persons (name, role, email, phone), recruiter/agency and
  salary range when the posting states them; stored into the existing job fields only when they are
  empty (never overwriting user input); validated with the existing bounded models. The job page's
  "Termine & Daten" shows them (already reads those fields) with a small "aus der Anzeige" hint.

### Task 11: Documents tab layout and file viewer
Points: "die button zum erstellen von lebenslauf und anschreiben sollen nebeneinander dargestellt
werden. das vorschaufenster soll sich nur auf klick öffnen und nicht dauerhaft dargestellt werden.",
"der punkt 'dateien' unter unterlagen soll besser und passender benannt und beschrieben werden wozu
dieser punkt gut ist.", "das view modal für hochgeladene dateien soll 90% der breite und höhe des
bildschirms einnehmen und keine rahmen haben."
- CV and letter create buttons side by side (stack below 480 px). Preview opens on click (per document)
  in a modal, not inline permanently.
- "Dateien" becomes "Eigene Dateien zur Bewerbung" (EN "Your files for this application") with a
  one-line description: upload certificates, references or your own CV/letter versions to keep them
  with this application.
- File viewer modal: 90vw x 90vh, no frame/border/padding around the document.

### Task 12: CV and letter stay editable documents; PDF only on download
Point: "lebenslauf und anschreiben sollen bearbeitbare dokumente sein und erst in ein pdf gewandelt
werden wenn diese heruntergeladen werden."
- Generation stores only the HTML (no PDF rendering in the package task). The job page shows/edits the
  HTML (existing sandboxed editor); download renders the PDF on demand from the current HTML with the
  existing safe renderer (`services/document_renderer.py`, fetch policy unchanged). Existing jobs with a
  stored PDF keep working (download prefers rendering from HTML when HTML exists).

### Task 13: Job page - phase flow and layout
Points: "der button 'phase ändern' soll passender und sichtbarer platziert werden.", "wenn die phase
auf 'beworben' geändert wird soll der tab 'firma' angezeigt werden.", "aufgaben (anlegen und anzeigen)
sollen unterhalb von 'termine & daten' angezeigt werden.", "bei klick auf 'Einladung eintragen' soll
sich 'termine & daten' öffnen.", "beim wechsel auf phase 'interview' soll nach einem interview termin
gefragt werden. der user muss zum wechsel keinen termin angeben.", "beim wechsel der phase auf 'angebot'
soll der reiter 'verlauf' angezeigt werden."
- "Phase ändern" becomes a visible secondary button directly beside/under the phase track (not hidden
  in a menu).
- After a successful change to Beworben the Firma tab is selected; to Angebot the Verlauf tab.
- To-dos (create + list) move from the Verlauf tab to below "Termine & Daten" in the side column.
- "Einladung eintragen" opens the "Termine & Daten" drawer focused on the interview date.
- Changing to Interview: the phase dialog has an optional interview date/time field; empty is fine.

### Task 14: Offer outcome tabs
Points: "bei klick auf 'angebot angenommen' soll eine success animation dargestellt werden ... danach
wird ein neuer reiter '1. Arbeitstag' angezeigt mit nützlichen tips und notizen die der user hinterlegen
kann.", "bei klick auf 'angebot abgesagt' wird ein neuer reiter angezeigt mit einem motivierenden spruch
(kostenlose web api??) und die möglichkeit für notizen."
- Accepted: a tasteful celebration (CSS/canvas confetti burst plus a check-mark draw, about 2 s, no new
  dependency over a few KB, skipped under reduced motion with a static success message), then a new tab
  "1. Arbeitstag" (shown for ACCEPTED): curated tips, a first-day checklist (stored like the job
  checklist), start date field and notes.
- Declined/rejected: a tab "Wie geht's weiter" with a motivating quote and notes plus a link to the
  inbox. Ruling: quotes come from a local curated DE/EN list (no external API: CSP, privacy, offline).
- Notes: one new job column for outcome notes (migration), autosave like the Verlauf notes.

### Task 15: Notification service - the service
Point: "die benachrichtigungs optionen sollen ein eigener service werden (inkl. docker). die
einstellungsseite soll die benachrichtigungs möglichkeiten die der service exposed anzeigen. das heisst
der notification service hält die gesamte versand logik. jede app und nutzer kann über die job agent
ui neue benachrichtigungs kanäle anlegen. der notification service muss vor unerlaubtem zugriff
geschützt sein".
- New top-level `notification-service/` (Python 3.11 FastAPI, own Dockerfile, own tests, own
  requirements). Holds all sending logic (move Pushover, Resend, Mailjet, SMTP adapters and template
  rendering from `server/workers/notifications/`).
- API: `GET /v1/channel-types` (type id, label, field schema: name, kind, required, secret),
  CRUD `/v1/channels` scoped by `app_id` (from the API key) and `owner` (opaque user ref passed by the
  app), `POST /v1/channels/{id}/test`, `POST /v1/notifications` (channel ids or owner default, subject,
  body/template vars). Secrets write-only, encrypted at rest (Fernet key from env, fail fast if unset).
- Auth: per-app API keys (env `NOTIFY_API_KEYS` as `app_id:key` pairs, constant-time compare),
  no unauthenticated route except `/health`; rate limits on test sends; SSRF guard for SMTP host
  (no private/loopback addresses); service not published on a host port in compose.
- Own SQLite database file on a volume (ruling: smallest durable store; swap to Postgres later).
- Compose: `ai-job-agent-notify` service in both compose files, env in `.env.example`.

### Task 16: Notification service - server integration
- `server/` talks to the service through one client module (`services/notifications_client.py`, key and
  URL from env, fail fast). Existing notification sending (crawl digests, tests) goes through it;
  `server/workers/notifications/` sending code is removed.
- Server API for the web: proxy endpoints (`GET /notifications/channel-types`, CRUD
  `/notifications/channels`, test) scoped to the current user; per-source channel selection references
  channel ids. One-off migration of existing per-user credentials into the service (script or startup
  task, idempotent), then the old credential columns are dropped in a later migration (ruling: keep
  them read-only in this task; dropping them is listed as follow-up).

### Task 17: Notification service - settings UI
- Einstellungen > Benachrichtigungen renders the channel types the service exposes (dynamic forms from
  the field schema), lists the user's channels, create/edit/delete/test. The source drawer picks
  channels from that list.
- Point "die beschreibung von 'Standard-Empfänger' soll verbessert werden (was und wofür ist das?)":
  the default recipient becomes a per-channel field with a description: "An diese Adresse gehen
  Benachrichtigungen dieses Kanals, wenn eine Quelle keinen eigenen Empfänger festlegt."

### Task 18: Docs sync
- Update `context/architecture.md` (notification service, rendering on download, schedule list, crawl
  progress), `context/project-overview.md`, `README.MD`, `.env.example`; final progress-tracker pass.
