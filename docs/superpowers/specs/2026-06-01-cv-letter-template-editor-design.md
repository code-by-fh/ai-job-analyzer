# Design: HTML-Template-Editor für Lebenslauf & Anschreiben

**Datum:** 2026-06-01
**Status:** Spec — zur Review
**Betrifft:** Application-Package-Generierung, Profil-Einstellungen, Dokument-Rendering

---

## 1. Ziel & Kontext

Heute generiert die App Lebenslauf (Ollama, lokal) und Anschreiben (OpenRouter)
aus strukturierten `cv_data` über file-basierte Jinja2-Templates (`templates/cv/classic.html`)
und rendert sie mit `xhtml2pdf` zu PDF. Der User kann das Ergebnis nicht nachbearbeiten.

**Neues Ziel:** Der User wählt in den Profil-Einstellungen je ein Template für
Lebenslauf und Anschreiben, generiert beide Dokumente per Klick für ein konkretes
Jobangebot und kann sie anschließend im Browser feinschleifen:

- **Texte** inline bearbeiten,
- **Blöcke** (Sektionen) per Drag umsortieren und ein-/ausblenden,
- **Farben & Schriften** über ein Stil-Panel anpassen,

und das Ergebnis als pixelgenaues PDF exportieren.

**Gewählter Ansatz (siehe Brainstorm):** Annotiertes HTML + browser-nativer
In-Place-Editor + Playwright-PDF. Templates sind HTML-Dateien mit einer
`data`-Attribut-Konvention. Layout-Verschiebung erfolgt durch **Block-Umsortierung
im Dokumentfluss** (kein freier X/Y-Canvas), damit komplexe bestehende HTML-Layouts
erhalten bleiben.

### Entscheidungen aus dem Brainstorming

| Frage | Entscheidung |
|---|---|
| Editier-Tiefe | Freies Layout-Gefühl, umgesetzt als In-Place (Text + Block-Reorder + Farben) |
| Template-Format | HTML |
| Verschiebe-Modell | Blöcke umsortieren im Fluss (In-Place), kein absoluter Canvas |
| Template-Besitz | Beides: globale (Admin) + user-eigene |
| Editor-Layout | Variante C: Zwei-Spalten (Dokument + einklappbarer Tab-Inspector „Blöcke / Stil") |
| PDF-Engine | Playwright headless Chromium (bereits im Stack) |

---

## 2. Architektur & Komponenten

Fügt sich in die bestehende Boundary-Map ein, ohne ein neues Modul zu erfinden.

| Komponente | Ort | Aufgabe |
|---|---|---|
| **Template-Store** | neue Tabelle `document_templates`, `routers/templates.py` (neu) | CRUD für HTML-Templates (global + user-eigen). Spiegelt das bestehende `NotificationTemplate`-Muster (`is_admin`-Flag + `user_id`, `_template_to_dict`). |
| **Slot-Filler** | `services/template_filler.py` (neu) | Reine Funktion: Template-HTML + AI-Inhalte → „gefülltes HTML". Ersetzt `data-slot`/`data-repeat`-Elemente. Nutzt BeautifulSoup (schon im Stack). |
| **PDF-Renderer** | `services/document_renderer.py` (erweitert) | Neue Funktion `html_to_pdf_playwright(html)` neben dem bestehenden xhtml2pdf-Pfad. |
| **Generierung** | `workers/tasks/package.py` (erweitert) | AI-Inhalt → Slot-Filler → gefülltes HTML pro Job speichern → Playwright-PDF als JobDocument. |
| **Export-Task** | `workers/tasks/package.py` (neue Task `ai.render_document_pdf`) | Re-Render des editierten HTML → PDF. Celery-Job (Invariante #1). |
| **Editor (Frontend)** | `frontend/app/components/editor/` (neu) | Sandbox-iframe + Tab-Inspector. Text-Edit, Block-Drag, Stil-Panel. |
| **Settings-UI** | Profil-Einstellungen (erweitert) | Template-Galerie (CV + Anschreiben) + Upload eigener Templates. |

**Isolations-Prinzip:** Der Slot-Filler kennt den Editor nicht, der Renderer kennt
die AI nicht. Das „Dokument" einer Bewerbung ist **gefülltes/editiertes HTML**,
gespeichert pro Job — eine einzige Wahrheit, die der Editor lädt und der Renderer
zu PDF macht.

---

## 3. Datenmodell

### 3.1 Neue Tabelle `document_templates`

Analog zu `NotificationTemplate`:

| Spalte | Typ | Notiz |
|---|---|---|
| `id` | Integer PK | |
| `user_id` | Integer FK→users, nullable | `NULL` + `is_admin=True` ⇒ globales Template |
| `is_admin` | Boolean, default False | globales (vom Admin gepflegtes) Template |
| `doc_type` | String | `CV` \| `COVER_LETTER` |
| `name` | String | Anzeigename in der Galerie |
| `html` | Text | das Template-HTML inkl. `data`-Attribute & CSS-Variablen |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

**Sichtbarkeit (Daten-Isolation, Invariante #2):** Ein User sieht
`is_admin == True` **ODER** `user_id == current_user.id`. Schreib-/Lösch-Zugriff
nur auf eigene (user-skopierte) Templates; globale nur durch Admin
(`get_current_admin_user`). Spiegelt exakt die `notification-templates`-Endpunkte.

### 3.2 Template-Referenz im Profil

`UserProfile.cv_template` / `cover_letter_template` sind heute String-Keys
(`"classic"`). Neu: Sie referenzieren `document_templates.id` als String, mit
Rückwärtskompatibilität:

- Wert ist numerisch ⇒ DB-Template (`document_templates`).
- Wert ist nicht-numerisch (z.B. `"classic"`) oder `NULL` ⇒ Fallback auf das
  file-basierte Built-in (bestehender `document_renderer._resolve`-Pfad).

Die bestehenden file-Templates (`templates/cv/classic.html`) werden per
Daten-Migration zusätzlich als **globale** `document_templates`-Zeilen geseedet,
sodass sie in der neuen Galerie erscheinen. Der file-Pfad bleibt als Fallback.

### 3.3 Editiertes Dokument pro Job

Das gefüllte/editierte HTML wird pro Job persistiert, damit der Editor erneut
geöffnet werden kann. Zwei neue Spalten auf `JobEntry` (analog zu den bestehenden
`cv_draft` / `application_draft`):

| Spalte | Typ | Notiz |
|---|---|---|
| `cv_html` | Text, nullable | aktuelles (editierbares) CV-HTML dieses Jobs |
| `cover_letter_html` | Text, nullable | aktuelles Anschreiben-HTML dieses Jobs |

Die bestehenden `cv_draft` (Markdown) / `application_draft` (Text) bleiben unverändert
als „Roh-Inhalt"-Ansicht erhalten; das gerenderte PDF bleibt ein `JobDocument`
(`GENERATED_CV` / `GENERATED_LETTER`, same-kind replacement wie heute).

> **Migration:** Eine neue Alembic-Migration (Invariante #3) legt
> `document_templates` an, ergänzt die zwei `JobEntry`-Spalten und seedet die
> Built-in-Templates als globale Zeilen.

---

## 4. Template-Konventionen (`data`-Attribute & CSS-Variablen)

Ein Template ist gültiges HTML mit folgenden Annotationen:

### 4.1 AI-Slots — `data-slot`

Elemente, deren Textinhalt von der AI gefüllt wird:

```html
<h1 data-slot="name">Vorname Nachname</h1>
<p data-slot="role">Rolle</p>
<div data-slot="summary">Kurzprofil…</div>
```

Der Slot-Filler ersetzt den **Inhalt** (nicht das Element selbst). Bekannte
Slot-Keys für CV: `name`, `role`, `summary`, `skills`, `education`. Für
Anschreiben: `sender_name`, `company`, `body`.

### 4.2 Wiederholbare Einträge — `data-repeat`

Für Listen (Erfahrung, Projekte): ein Prototyp-Element wird pro Datensatz geklont,
die inneren `data-slot` gefüllt:

```html
<section data-block="experience" data-block-label="Berufserfahrung">
  <h2>Berufserfahrung</h2>
  <div data-repeat="experience">
    <strong data-slot="role"></strong> — <span data-slot="company"></span>
    <div class="meta" data-slot="duration"></div>
    <div data-slot="description"></div>
  </div>
</section>
```

Der Filler nimmt das erste `data-repeat="experience"`-Element als Vorlage, klont es
n-mal und entfernt die Vorlage. Repeat-Keys für CV: `experience`, `projects`.

### 4.3 Blöcke — `data-block`

Umsortier- und ausblendbare Sektionen. `data-block-label` liefert den Anzeigenamen
im Inspector. Reihenfolge & Sichtbarkeit werden beim Editieren direkt im DOM
abgebildet (Block verschoben ⇒ DOM-Reihenfolge; ausgeblendet ⇒ Element entfernt
bzw. `hidden`-Markierung).

### 4.4 Stil — CSS-Variablen

Templates deklarieren ihre anpassbaren Werte als CSS-Custom-Properties auf
`:root`/`body`:

```css
:root { --accent: #6366f1; --font-base: "DejaVu Sans", sans-serif; --font-size: 10.5pt; }
h1, h2 { color: var(--accent); }
body { font-family: var(--font-base); font-size: var(--font-size); }
```

Das Stil-Panel ändert ausschließlich diese Variablen (als Inline-Style-Override am
Wurzelelement). So bleibt das Layout robust — keine Eingriffe in einzelne Regeln.

### 4.5 Validierung beim Upload

Beim Upload wird das HTML geparst (BeautifulSoup) und geprüft:
- valides, parsebares HTML,
- enthält mindestens die Pflicht-Slots des Typs (`CV`: `name`, `role`; `COVER_LETTER`: `body`),
- Sanitisierung: `<script>`, Event-Handler-Attribute (`on*`) und externe
  Ressourcen-Referenzen werden entfernt/markiert (siehe §6). Bilder/Fonts sollen
  als `data:`-URI eingebettet sein — darauf wird im Upload-Dialog hingewiesen.

---

## 5. Datenfluss

```
[Job-Detail] --"Generieren"--> Celery: ai.generate_application_package
   1. AI: generate_tailored_cv (Ollama)  -> cv_data-Inhalt
          generate_application (OpenRouter) -> Anschreiben-Text
   2. Slot-Filler: Template(html) + Inhalt -> gefülltes HTML
   3. Persistenz: job.cv_html / job.cover_letter_html
   4. Playwright: HTML -> PDF -> JobDocument (GENERATED_CV / GENERATED_LETTER)
   5. WS-Publish "DRAFTED"
                |
                v
[Editor] lädt job.cv_html / cover_letter_html in Sandbox-iframe
   - Text inline editieren (contentEditable)
   - Blöcke umsortieren / aus-einblenden (Tab „Blöcke")
   - Akzentfarbe / Schrift / Größe (Tab „Stil", setzt CSS-Variablen)
   - "Speichern": serialisiertes iframe-DOM -> PUT -> job.cv_html
                |
                v
[Export "PDF"] --> Celery: ai.render_document_pdf(job_id, kind)
   - Playwright rendert gespeichertes HTML -> PDF -> JobDocument (replace)
   - WS-Publish
```

Alle schweren Schritte (AI, PDF) laufen als Celery-Jobs mit WebSocket-Live-Status
(Invariante #1). Generierung erweitert die bestehende sequentielle Paket-Task;
Export ist eine eigene, leichtere Task.

---

## 6. PDF-Rendering & Sicherheit

### 6.1 Playwright-Renderer

Neue Funktion in `document_renderer.py`:

```python
def html_to_pdf_playwright(html: str) -> bytes:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        page.route("**/*", _block_external)   # siehe 6.2
        page.set_content(html, wait_until="networkidle")
        pdf = page.pdf(print_background=True, prefer_css_page_size=True)
        browser.close()
        return pdf
```

Seitengröße & Margins kommen über `prefer_css_page_size` aus dem `@page`-CSS des
Templates (z.B. `@page { size: A4; margin: 2cm; }` wie im bestehenden `classic.html`). Chromium ist bereits im Image
(Scraper nutzt `playwright.sync_api`).

### 6.2 SSRF / externe Ressourcen (Invariante #4)

Beim Rendern darf **kein** ausgehender Request an interne/private Adressen erfolgen.
Das HTML stammt zwar vom User/Admin selbst, kann aber externe `src`/`url()`
enthalten. Maßnahmen:

- **Request-Interception:** `page.route` blockt standardmäßig **alle** externen
  Requests; erlaubt sind nur `data:`-URIs (eingebettete Bilder/Fonts). Damit ist
  SSRF strukturell ausgeschlossen und das Rendering deterministisch/offline.
- Optional später: gezielt erlaubte http(s)-Hosts über die bestehende
  `_is_safe_url`-Logik freigeben. Für MVP: nur `data:`.
- Upload-Sanitisierung entfernt `<script>` und `on*`-Handler bereits beim Speichern.

Da das Rendering offline läuft, müssen Bilder/Schriften im Template eingebettet
(`data:`-URI) sein — dies wird im Template-Upload-Dialog kommuniziert.

---

## 7. Editor-UX (Layout C)

Zwei-Spalten-Editor (gewählt im Brainstorm), umgesetzt mit dem bestehenden
Design-System (Tailwind v4, Glass-Cards, `dark:`-Pendants, `<Portal>` für Modals).

- **Top-Bar:** Template-Anzeige · „⚡ Generieren" · „💾 Speichern" · „⬇ PDF".
- **Mitte (Canvas):** Sandbox-`<iframe>` mit dem gefüllten HTML. Texte sind
  `contentEditable`; Klick auf einen Block hebt ihn hervor.
- **Rechts (einklappbarer Inspector) mit zwei Tabs:**
  - **Blöcke:** Liste aller `data-block`-Sektionen mit Drag-Griff (Reihenfolge)
    und Auge (Sichtbarkeit).
  - **Stil:** Akzentfarbe (Swatches + Free-Picker), Schriftart, Schriftgröße —
    schreibt CSS-Variablen.

**Drag-Reorder:** auf Block-Ebene (nicht pixelgenau). Implementierung mit leicht­ge­wich­tigem
DnD (HTML5-DnD oder `dnd-kit`); Reihenfolge wird auf das iframe-DOM angewandt.

**Sandbox-iframe:** `sandbox="allow-same-origin"` (für Editier-Zugriff aufs DOM),
kein `allow-scripts` — Template-Skripte laufen nie. Beim Speichern wird das
bereinigte DOM-`outerHTML` serialisiert und persistiert.

---

## 8. API-Endpunkte (neu / erweitert)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/document-templates?doc_type=CV` | Sichtbare Templates (global + eigene) |
| `POST` | `/document-templates` | Eigenes Template anlegen (Upload HTML); Admin kann global anlegen |
| `PUT` | `/document-templates/{id}` | Eigenes Template ändern (Owner/Admin) |
| `DELETE` | `/document-templates/{id}` | Eigenes Template löschen (Owner/Admin) |
| `PUT` | `/profile` (bestehend) | `cv_template` / `cover_letter_template` = Template-ID |
| `GET` | `/jobs/{id}/documents/html?kind=cv` | Editierbares HTML laden |
| `PUT` | `/jobs/{id}/documents/html?kind=cv` | Editiertes HTML speichern |
| `POST` | `/jobs/{id}/documents/render?kind=cv` | PDF-Export anstoßen (Celery) |

Alle Endpunkte erzwingen Auth + Ownership (`user_id`). Mirror des
`notification-templates`-Musters in `routers/settings.py`.

---

## 9. Testing

- **Slot-Filler (Kern, reine Funktion):** HTML-in → gefülltes-HTML-out;
  `data-slot`-Ersetzung, `data-repeat`-Klonen (0/1/n Einträge), fehlende Slots,
  HTML-Escaping der Inhalte.
- **Template-Validierung:** valides vs. invalides HTML, Pflicht-Slots fehlen,
  `<script>`/`on*` werden entfernt.
- **Ownership/Isolation:** User sieht globale + eigene, nicht fremde; Schreiben auf
  fremdes Template → 403/404; nur Admin legt globale an.
- **PDF-Renderer (Smoke, ggf. hinter Marker):** HTML → nicht-leeres PDF; externer
  Request wird geblockt (SSRF).
- **Migration:** Up/Down; Built-in-Seeding erzeugt globale Zeilen; Rückwärts­kompat
  (`cv_template="classic"` fällt auf file-Template zurück).

Priorität liegt auf Slot-Filler und Isolation (Backend bisher 0 % Coverage; siehe
Progress-Tracker Backlog).

---

## 10. Out of Scope

- **Freier X/Y-Canvas / absolute Positionierung** — bewusst verworfen (zerbricht
  komplexe HTML-Layouts).
- **Import/Parsing von PDF- oder Word-Dateien** — User konvertiert vorab zu HTML.
- **WYSIWYG-Template-Authoring** (Templates per GUI bauen) — Templates werden als
  HTML hochgeladen/bearbeitet, nicht visuell erstellt.
- **Versionierung/History des editierten HTML** — nur aktueller Stand pro Job.
- **Auto-Submit an Jobbörsen** — bleibt strikt außerhalb des Scopes.
- **Mehrseitiges Live-Pagination-Preview im Editor** — Seitenumbruch zeigt erst das
  PDF; Editor zeigt Fließdokument.

---

## 11. Betroffene/neue Dateien (Überblick)

**Backend**
- `database/core.py` — `DocumentTemplate`-Modell, `JobEntry.cv_html`/`cover_letter_html`.
- `database/migrations/versions/*` — neue Alembic-Migration + Seed.
- `services/template_filler.py` *(neu)* — Slot-Filler.
- `services/document_renderer.py` — `html_to_pdf_playwright` + externer-Request-Block.
- `workers/tasks/package.py` — Generierung über Filler+Playwright; neue `render_document_pdf`-Task.
- `routers/templates.py` *(neu)* — Document-Template-CRUD.
- `routers/jobs.py` — HTML laden/speichern/rendern pro Job.
- `routers/settings.py` — Profil speichert Template-IDs (bestehender Pfad).

**Frontend**
- `frontend/app/components/editor/` *(neu)* — Editor (Canvas-iframe + Tab-Inspector).
- Profil-Einstellungen — Template-Galerie + Upload.
- Job-Detail — Editor-Einstieg nach Generierung.

**Kontext-Doku**
- `context/progress-tracker.md`, `context/architecture.md` — nach Implementierung
  aktualisieren (neue Tabelle, Renderer-Pfad, Editor-Komponente).
