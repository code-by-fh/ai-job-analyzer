# Konzept: Automatisierte Bewerbungspaket-Erstellung

**Datum:** 2026-05-31
**Status:** Design freigegeben (Implementierung ausstehend)
**Scope:** Backend (Celery/Intelligence/DB) + Profil-UI + Job-UI

---

## 1. Ziel & Motivation

Für jeden Job in der Listings-Ansicht soll der Bewerber das **komplette
Bewerbungspaket mit einem einzigen Klick** erzeugen können — statt heute
mehrere manuelle Einzelschritte durchzuführen. Eine erneute Threshold-Prüfung
findet dabei **nicht** statt: alle unter `/listings` angezeigten Jobs liegen
ohnehin bereits über dem Matching-Threshold (untere werden beim Scoring
archiviert).

Ein Bewerbungspaket besteht aus:

- **Lebenslauf (CV)** — pro Job **getailort**, lokal via **Ollama** erzeugt
  (sensible Daten verlassen den Rechner nicht), gerendert aus einem im Profil
  gewählten **HTML-Template**.
- **Anschreiben** — pro Job erzeugt via **OpenRouter** (bestehende Logik),
  gerendert in ein Anschreiben-HTML-Template.
- **Arbeitszeugnisse + Zertifikate** — ein **fester Dokumentensatz aus dem
  Profil**, der bei der Generierung optional mitgeschickt werden **kann**
  (als Ganzes, ohne Einzelauswahl).

Nach erfolgreicher Generierung wird der Bewerber aufgefordert, per Klick die
**Online-Bewerbung** durchzuführen. Die Online-Durchführung selbst ist **nicht
Teil dieses Konzepts** (und laut Projektregeln strikt out-of-scope), wird aber
architektonisch als Hook vorbereitet.

### Abgrenzung (Scope)

| In Scope | Out of Scope |
| --- | --- |
| Ein-Klick-Erzeugung des Pakets pro Job | Automatischer Online-Submit / Auto-Apply |
| Lokale CV-Generierung via Ollama | LLM-basierte Dokument-**Auswahl** (Profil-Docs werden als Ganzes optional angehängt) |
| Profil-weiter Dokumentenspeicher (Zeugnisse, Zertifikate) | Gemergte Komplett-PDF (nur Einzeldateien) |
| Handoff-CTA + `SubmissionAdapter`-Platzhalter | Custom-Template-Upload durch den Nutzer (später) |

---

## 2. Getroffene Entscheidungen (verbindlich)

1. **CV-Strategie:** Pro Job getailort, **KI-in-the-loop via lokalem Ollama**,
   auf Basis eines im Profil gewählten **HTML-Templates** (nicht PDF-Template —
   HTML ist befüllbar und nach PDF renderbar via `xhtml2pdf`).
2. **LLM-Split:** **Nur der CV läuft lokal (Ollama).** Anschreiben, Scoring,
   Interview-Prep und Research bleiben unverändert bei OpenRouter.
3. **Auslöser:** **Ein Klick pro Job.** Die CTA steht für **alle Jobs in der
   Listings-Ansicht** zur Verfügung — diese liegen ohnehin über dem Threshold.
   **Keine** erneute Threshold-Prüfung beim Generieren. Es wird nichts
   automatisch für jeden Job gestartet (Kosten-/Last-Kontrolle).
4. **Profil-Dokumente:** **Ein fester Satz** für alle Jobs. MVP kennt nur
   **Arbeitszeugnisse** und **Zertifikate**. **Keine** LLM-Auswahl — der Satz
   wird als Ganzes **optional** mitgeschickt (pro Bewerbung an-/abwählbar,
   Default: an, falls Dokumente hinterlegt sind).
5. **Paket-Format:** **Nur einzelne Dateien** (CV.pdf, Anschreiben.pdf +
   Profil-Dokumente separat). Keine gemergte Komplett-PDF im MVP.
6. **Orchestrierung:** **Eine sequentielle Celery-Task** (Ansatz A) — einfaches
   Fehler-/Status-Handling, passt zum bestehenden Single-Task-Muster.

---

## 3. End-to-End-Flow

```
Crawl + Scoring (OpenRouter, unverändert)
        │  Jobs >= Threshold landen in /listings, darunter werden archiviert
        ▼
 Job-Card in /listings zeigt CTA "Bewerbungspaket erstellen"  (keine erneute Threshold-Prüfung)
        │  [1 Klick]  (optional: Profil-Dokumente beilegen ja/nein)
        ▼
 POST /jobs/{id}/generate-package
        │  → Status GENERATING, WS-Event
        ▼
 generate_application_package_task (sequentiell):
   a) CV:        Ollama tailored cv_data → HTML-Template füllen → xhtml2pdf → Lebenslauf.pdf
   b) Anschreiben: OpenRouter Text → Anschreiben-HTML-Template → xhtml2pdf → Anschreiben.pdf
   c) Bündeln:   Lebenslauf.pdf + Anschreiben.pdf (+ optional alle ProfileDocuments)
                 → als JobDocument speichern (kind-getaggt) + Dual-Storage-Upload
        │
        ▼
 Status DRAFTED + Notification "Paket bereit" (WS-Event)
        │
        ▼
 Job-Card zeigt CTA "Online bewerben"  ← Hook, vorerst 501/Stub
```

---

## 4. Datenmodell (Alembic-Migrationen)

### 4.1 Neue Tabelle `ProfileDocument`

Profil-weiter Dokumentenspeicher (gehört zum User, nicht zum Job).

```
profile_documents
  id              Integer PK
  user_id         Integer FK users.id  (NOT NULL, indexed) — Isolation
  doc_type        String  — "REFERENCE" (Arbeitszeugnis) | "CERTIFICATE"
  label           String  — vom Nutzer vergebener Titel (z.B. "Arbeitszeugnis Firma X")
  original_filename String
  file_size       Integer nullable
  mime_type       String  nullable
  content         LargeBinary nullable   — DB-Blob-Storage
  drive_file_id   String nullable        — falls Google Drive aktiv
  created_at      DateTime server_default now()
```

Speicherung folgt dem bestehenden Dual-Storage-Muster
(`active_storage_service`): DB-Blob **oder** Google Drive.

### 4.2 Erweiterung `JobDocument`

```
+ kind   String, default "UPLOADED"
         — "GENERATED_CV" | "GENERATED_LETTER" | "ATTACHED_CERT" | "ATTACHED_REFERENCE" | "UPLOADED"
```

Unterscheidet generierte/angehängte Paket-Dateien von manuellen Uploads und
erlaubt das gezielte Neu-Generieren einzelner Teile (alte `GENERATED_*`/
`ATTACHED_*` eines Jobs werden bei Re-Generierung ersetzt).

### 4.3 Erweiterung `UserProfile`

```
+ cv_template            String nullable  — Key des gewählten CV-HTML-Templates
+ cover_letter_template  String nullable  — Key des gewählten Anschreiben-Templates
```

Templates werden als HTML-Dateien im Repo ausgeliefert (z.B.
`server/templates/cv/<key>.html`). Custom-Upload ist Post-MVP.

### 4.4 Erweiterung `SystemSettings`

```
+ ollama_model     String nullable  — z.B. "llama3.1:8b" (dynamisch im Admin-UI wählbar)
```

`OLLAMA_BASE_URL` wird als Env-Variable konfiguriert (Service-Adresse), das
Modell analog zu OpenRouter dynamisch in der DB.

---

## 5. Ollama-Integration

- **Docker-Compose:** neuer interner Service `ollama` (Image `ollama/ollama`).
  Vertrauenswürdiger interner Service → **nicht** Gegenstand von
  `scraper_worker._is_safe_url` (dieser Schutz gilt für *ausgehendes Scraping*,
  nicht für interne Service-Calls).
- **Provider:** Ollama bietet eine **OpenAI-kompatible API** → derselbe
  `OpenAI`-Client wie für OpenRouter, nur mit
  `base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434/v1")` und Dummy-Key.
- **Neue Funktion** in `intelligence/service.py`:
  `generate_tailored_cv(cv_data, job_title, job_description, language, model) -> dict`
  - Gibt **getailorte `cv_data` (JSON)** zurück (umsortierte/gewichtete
    Erfahrungen, hervorgehobene relevante Skills) — **nicht** fertiges HTML.
  - Begründung: Das Template wird **deterministisch** befüllt → das LLM kann das
    HTML-Layout nicht zerstören; robuster und testbar.
- **Prompts** in `intelligence/prompts.py`: neue `get_tailored_cv_messages(...)`.

---

## 6. Generierung & Rendering

### 6.1 CV
1. `generate_tailored_cv(...)` (Ollama) → getailorte `cv_data`.
2. Template-Engine füllt gewähltes CV-HTML-Template mit den Daten
   (Platzhalter-Substitution, kein Code-Eval).
3. `xhtml2pdf` rendert HTML → `Lebenslauf.pdf`.

### 6.2 Anschreiben
1. Bestehende `generate_application(...)` (OpenRouter) → Anschreiben-Text.
2. Text wird ins gewählte Anschreiben-HTML-Template eingesetzt.
3. `xhtml2pdf` → `Anschreiben.pdf`.

> Hinweis: Heute wird das Anschreiben als `.txt` in den Storage geladen
> (`workers/tasks/application.py`). Dieser Pfad wird durch die PDF-Erzeugung im
> Paket-Task ersetzt/ergänzt; die bestehende On-Demand-Anschreiben-Funktion
> bleibt für die manuelle Iteration erhalten.

### 6.3 Bündeln
- `Lebenslauf.pdf` → `JobDocument(kind="GENERATED_CV")`
- `Anschreiben.pdf` → `JobDocument(kind="GENERATED_LETTER")`
- **Optional** (falls beim Generieren ausgewählt): jedes `ProfileDocument` →
  kopiert als `JobDocument(kind="ATTACHED_CERT"` bzw. `"ATTACHED_REFERENCE")`
- Alle erscheinen im **bestehenden Dokumente-Tab** und werden per
  bestehendem Muster in den Dual-Storage hochgeladen.

---

## 7. API-Endpunkte

```
# Profil-Dokumente (analog zu /jobs/{id}/documents)
GET    /profile/documents
POST   /profile/documents            (multipart: file, doc_type, label)
DELETE /profile/documents/{doc_id}
GET    /profile/documents/{doc_id}/download
GET    /profile/documents/{doc_id}/view

# Templates
GET    /profile/templates            (Liste verfügbarer CV-/Anschreiben-Templates)
PATCH  /profile                      (cv_template, cover_letter_template setzen)

# Paket
POST   /jobs/{id}/generate-package   → 202, triggert Celery-Task, liefert Status
                                       (Body optional: include_profile_documents: bool, default true)
POST   /jobs/{id}/submit-application  → 501 Stub (Out-of-Scope-Hook)
```

Alle Endpunkte erzwingen Auth + `user_id`-Ownership (Projekt-Invariante).
Heavy-Work (Generierung) läuft ausschließlich im Celery-Task; der Endpoint
liefert nur die Job-ID/Status zurück (Invariante „No Inline Heavy-Work").

---

## 8. Orchestrierung (Ansatz A — sequentiell)

`generate_application_package_task(job_id, user_id)` im `ai_queue`:

1. Status `GENERATING`, WS-Event.
2. Profil + Template + Ollama-Modell laden; Vorbedingungen prüfen
   (Profil vorhanden, CV-Template gesetzt).
3. CV erzeugen (Ollama) → PDF.
4. Anschreiben erzeugen (OpenRouter) → PDF.
5. Profil-Dokumente kopieren (nur wenn `include_profile_documents` und Dokumente vorhanden).
6. Alle Artefakte als `JobDocument` speichern + Dual-Storage-Upload.
7. Status `DRAFTED`, Notification „Paket bereit", WS-Event.

> Hinweis Last: Der Ollama-CV-Call kann länger laufen. Da der Auslöser
> „ein Klick pro Job" ist, ist die Parallelität gering — ein paralleler
> Chord (Ansatz B) ist eine spätere Optimierung, keine MVP-Notwendigkeit.

---

## 9. Fehlerbehandlung

- **Ollama nicht erreichbar / Modell fehlt** → Task `FAILED`,
  `generation_error` gesetzt, WS-Error-Event (bestehendes Muster).
- **CV-Template nicht gesetzt** → Task bricht früh ab mit klarer Meldung
  („Bitte CV-Template im Profil wählen").
- **Anschreiben-Fehler (OpenRouter 401/404/429)** → bestehende
  OpenRouter-Fehlerbehandlung greift; Status `FAILED` + Meldung.
- **Keine Profil-Dokumente / abgewählt** → wird sauber übersprungen
  (CV + Anschreiben reichen als Minimal-Paket).
- **Teil-Regenerierung:** einzelne `kind`-Typen können neu erzeugt werden;
  vorhandene gleichartige `JobDocument`-Einträge des Jobs werden ersetzt.

---

## 10. Out-of-Scope-Hook (Online-Bewerbung)

- `POST /jobs/{id}/submit-application` → vorerst `501 Not Implemented`
  (bzw. setzt nur manuell `status=APPLIED`, falls gewünscht).
- `SubmissionAdapter`-Interface als Platzhalter, damit künftige
  Auto-Apply-Logik andockbar ist, ohne den Paket-Flow zu ändern.
- Klar dokumentiert: Automatischer Online-Submit ist laut
  `project-overview.md` strikt verboten.

---

## 11. Frontend

- **Profil-Seite:** zwei neue Upload-Bereiche *Arbeitszeugnisse* und
  *Zertifikate* (wiederverwendbar aus dem bestehenden Upload-/Viewer-Muster
  in `JobDocumentsTab.tsx`); Template-Auswahl (Dropdown) für CV + Anschreiben.
- **Job-Card:** CTA „Bewerbungspaket erstellen" (sichtbar für **alle** Jobs in
  der Listings-Ansicht mit Status OPEN — keine Threshold-Bedingung); optionaler
  Schalter „Profil-Dokumente beilegen" (Default: an); Live-Progress über
  `useCrawl`/WS; nach Erfolg CTA „Online bewerben" (Hook).

---

## 12. Tests

- `ProfileDocument`-CRUD + strikte `user_id`-Isolation.
- Template-Rendering (Platzhalter-Substitution, HTML→PDF Smoke).
- Ollama-Wrapper (`generate_tailored_cv`) gemockt — JSON-Parsing/Fehlerfälle.
- Orchestrierung: Status-Übergänge `OPEN → GENERATING → DRAFTED/FAILED`.
- Endpoint-Auth/Ownership.

---

## 13. Betroffene Dateien (Orientierung)

- `server/database/core.py` + neue Alembic-Migration(en)
- `server/intelligence/service.py`, `server/intelligence/prompts.py`
- `server/workers/tasks/application.py` (Paket-Task)
- `server/routers/jobs.py`, neuer `server/routers/profile_documents.py` (oder in `settings.py`)
- `server/templates/cv/*.html`, `server/templates/cover_letter/*.html` (neu)
- `server/services/storage.py` (ProfileDocument-Upload)
- `docker-compose.yml` (ollama-Service), `.env`-Beispiel (`OLLAMA_BASE_URL`)
- Frontend: Profil-Seite, Job-Card-CTAs
- `context/progress-tracker.md` + ggf. `architecture.md`/`project-overview.md`
