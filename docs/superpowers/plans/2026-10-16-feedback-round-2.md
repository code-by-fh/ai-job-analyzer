# Feedback Round 2 (2026-10-16) - Implementation Plan

Source: the user's second feedback list of 2026-10-16 (German). Points already delivered in round 1
(posting extraction, optional company domain, no google.com default, "wwww.bahn.de" handling, research
survives reload) reappear in the list; the user's log shows the round-1 code running and failing on an
AI connection error, so they are covered by Task 1 and Task 8 here, not rebuilt.

## Global Constraints

Identical to `docs/superpowers/plans/2026-10-15-feedback-round-1.md` "Global Constraints", plus:
- Copy back only screenshots whose change is intended (PNG bytes differ on every run); list them.
- Reuse existing components; no duplicated UI pieces (the user flagged duplicates explicitly).
- Migrations chain after `b0c1d2e3f4a5` (or the newest head at the time); update the head test.

## Tasks

### Task 1: Company research fails with "Connection error" (debug)
Point: "Die Firmenrecherche ist fehlgeschlagen. Bitte versuche es erneut." with the log:
`research.py:219 _research_job_company -> company_identification.identify_job_company_domain ->
intelligence/service.identify_company_domain -> _call_openrouter -> openai.APIConnectionError: Connection error.`
- Systematic debugging. Candidates to check with evidence: the server container's egress after the
  compose change that attached it to the `internal: true` network `notify` (default route / DNS), the
  client/base URL the identification call uses vs the other AI calls (routing via
  `get_client_and_model`, timeouts), and whether the task retries transient connection errors.
- Fix the root cause found. If it is the compose network, fix the compose layout so the server keeps
  internet egress while the service stays unreachable from outside, and document how to verify it.
- A transient AI connection error gets one bounded retry; a final failure stores a distinct fixed code
  (`AI_UNREACHABLE`) that the web shows as "Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es
  gleich noch einmal." instead of the generic research error.

### Task 2: CV import and deep-dive research survive a reload
Points: "der import eines lebenslauf prozess muss auch nach einem browser refresh angezeigt werden.",
"wenn 'jetzt recherchieren' unter Tiefenrecherche geklickt wurde soll der process auch nach einem browser
refresh angezeigt werden."
- Reuse the round-1 durable run-state pattern (`core/interview_prep_state.py`,
  `core/company_research_state.py`, sweep in `workers/tasks/generation_sweep.py`). The CV import is a
  sync endpoint today: decide (Ruling) whether to move it to a Celery task with a durable state or keep
  it sync with a durable "running since" stamp the reloaded page shows until it ends.
- Deep dives (Firma tab and Firmen page) get the same durable state.

### Task 3: Elapsed time on every running generation
Point: "jeder generierungsprozess soll auch eine zeitangabe haben. überlege dir etwas schönes für die
darstellung".
- Every running AI process shown in the UI (CV/letter generation, interview prep, company research,
  deep dive, CV import, template fill, crawl) shows how long it has been running ("läuft seit 1:24"),
  computed from the server start stamp (so it survives reloads), ticking once per second, one shared
  component, no announcements per tick (screen readers get the start, not the ticks). Finished runs may
  show their duration where the UI already shows a result line. API exposes the start stamps where
  missing.

### Task 4: Interview prep presentation
Point: "die darstellung der interview vorbereitung muss schöner und übersichtlicher gestaltet werden".
- Redesign the Interview tab's prep view (`features/job/interview/InterviewPrepView.tsx`): clear
  sections, scannable question cards with collapsible model answers, gap/risk overview first, print-
  friendly. Same data, no new AI fields.

### Task 5: Document modal larger, borderless, modern
Point: "das modal zum anpassen und anzeigen von lebenslauf, vorschau, etc soll größer und ohne rand sein.
auch die darstellung soll modern und schön sein."
- The CV/letter preview+editor modal (round-1 T11/T12 `DocumentPreview`) uses the same 90vw x 90vh
  frameless layout as the file viewer, a modern toolbar (title, edit, download, close), the A4 page
  centred on a soft backdrop. One modal shell shared by both viewers.

### Task 6: Sources - pattern text, shared weekday chips, profile gate
Points: "'muster prüfen' soll so beschrieben werden das der user versteht das er die job urls auswählen
soll, und das url muster den anfang einer job url darstellen muss damit zukünftig nur jobs gefunden
werden", "die wochentags chips unter zeitplan sehen beim bearbeiten anders aus als beim anlegen einer
quelle. bitte gleiche elemente nutzen und auf duplikate code verzichten.", "quellen dürfen nicht
angelegt werden und sind deaktiviert wenn kein profil gepflegt ist".
- Rewrite the step-2 / "Muster prüfen" copy: pick links that are job postings; the pattern is the
  common start of job-posting URLs, and only links starting with it are crawled in future.
- One weekday chip component for wizard and drawer (remove the duplicate).
- Without a maintained profile (the onboarding's "profile complete" rule from `GET /setup-status`):
  "Quelle hinzufügen" and "Durchsuchen" are disabled with a visible reason and a link to Profil; the
  server refuses setup and crawl start with 409 `profile_required`; scheduled crawls skip such users.

### Task 7: Notification channels from the source wizard
Point: "in dem wizard bei quelle anlegen soll es auch möglich sein Benachrichtigungskanäle anlegen zu
können sofern sie konfiguriert sind."
- The wizard's last step lets the user pick existing channels (same component as the drawer) and
  create a new one inline (same channel form as Einstellungen) when the service offers channel types.

### Task 8: Inbox buttons, settings cleanup, extraction for existing jobs
Points: "die buttons 'alle stellen archivieren' und 'einzelne stelle importieren' im Eingang sollen
etwas präsenter dargestellt werden", "Ersteinrichtung neustarten kann aus den einstellungen entfernt
werden", "kontakt, recruiter und gehaltsrahmen sollen wenn möglich aus der stellenanzeige automatisch
extrahiert und dargestellt werden." (round 1 extracts only on new analyses).
- Inbox: both actions as labelled secondary buttons at every width (no icon-only).
- Remove "Ersteinrichtung erneut starten" from Einstellungen > Allgemein (`/inbox?view=setup` stays).
- Jobs analysed before round 1 get the posting details: "Termine & Daten" offers "Aus der Anzeige
  übernehmen" when the job has stored posting text and no extracted marks; it runs the extraction only
  (not a full re-analysis), fills empty fields only, with durable state.

### Task 9: Storage location (Speicherort)
Point: "speicherort was machen wir damit???" - decided with the user; see the ledger.

### Task 10: Docs sync
- Context files, README, progress tracker.
