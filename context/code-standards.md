## 💻 Code Standards (Token-Optimized)

### 1. General & Architecture

* **Kapselung:** Ein Router/Modul pro Backend-Domain, eine Komponente pro Frontend-Datei. Business-/AI-Logik strikt in `intelligence/` und `services/`.
* **Zero Secrets:** Keine Hardcoded-Secrets. System-Konfig via `.env` (`.env.example`). User-Secrets in DB, Maskierung im API-Read via `_SECRET_FIELDS` (`routers/deps.py`).
* **Validierung:** Input-Validierung an *jeder* Systemgrenze (Bodys, Queries, Uploads, API-Responses).
* **Asynchronität:** Request-Handler blockieren verboten. Alles zeitintensive (AI, Scraping, PDFs, Mail) via `celery_app.send_task()`.

### 2. Frontend (Next.js 16, React 19, TS)

* **TypeScript:** `"strict": true`, Verbot von `any`. Globale Typen strikt in `app/lib/types.ts`.
* **Architektur:** App Router (`app/`). Server Components als Standard. `"use client"` nur für Interaktivität. Fetching & Pagination kapseln in `app/hooks/`.
* **State & Auth:** Globaler State nur über bestehende Provider (`Language` → `Auth` → `Notification`). Authentifizierte Requests *nur* via `fetchWithAuth` (Auto-Refresh).
* **Tooling:** Logging über `pino` (`app/lib/logger.ts`). Path-Aliases (`@/*`) erzwingt. Husky + lint-staged führen pre-commit `eslint --fix` & `prettier` aus.

### 3. Backend (FastAPI, Python)

* **Typisierung:** PEP 8 + Type Hints. Request/Response-Bodys zwingend als Pydantic v2 Modelle.
* **DI & Auth:** Dependency Injection via `Depends` (`get_db`, `get_current_user`). Vor *jeder* Mutation/Read zwingend Auth + Ownership prüfen (`...where(Model.user_id == current_user.id)`), bei Misserfolg `HTTP 404`.
* **Hardening:** Admin-Routen via `get_current_admin_user`. Sensitive Endpunkte per `slowapi` ratelimiten (erfordert `request: Request`). Uploads limitieren (`ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE`).
* **Lifecycle:** Manuelle DB-Sessions im `finally`-Block schließen (oder `get_db` nutzen). Startup-Fail bei fehlender `SECRET_KEY`. Logging via `core/logger`.

### 4. Styling & UI

* **Engine:** Tailwind CSS 4 Utilities. Dark Mode via `.dark` Klasse und `dark:` Modifier.
* **Design System:** Design-Vorgaben aus `ui-context.md` (Geist-Font, Radien). Design-Tokens nutzen: `.glass-panel`, `.glass-card`, `.text-gradient`. Keine Inline-Hex-Codes.
* **Icons:** Ausschließlich `lucide-react`.

### 5. Data & Storage

* **SQLAlchemy 2.0:** Single Source of Truth für Metadaten in `database/core.py`.
* **Alembic:** Schema-Änderungen *nur* über neue Migrations-Dateien. Bestehende Migrationen oder Live-DB niemals manuell editieren.
* **Artifacts:** Große Texte in `Text`-Spalten. Binärdateien/PDFs via `active_storage_service` entweder in DB-Blob (`JobDocument.content`, `LargeBinary`) oder Google Drive – niemals im lokalen Filesystem.

---

## 🚨 Pre-Commit Checklist (Strict)

* [ ] Keine Secrets im Code? Neue sensitive DB-Felder in `_SECRET_FIELDS` maskiert?
* [ ] Inputs an den Grenzen validiert (Pydantic / Upload-Limits / TS-Interfaces)?
* [ ] Backend: Jedes Query-Ergebnis per `user_id == current_user.id` abgesichert (sonst 404)?
* [ ] Keine Blocking-Calls (LLM, Scraper, PDF) im API-Handler? (An Celery übergeben?)
* [ ] Frontend: `any` eliminiert? `pino` genutzt? `fetchWithAuth` für geschützte Routen aktiv?
* [ ] Styling: Tailwind 4 + Glass-Utilities sauber umgesetzt (keine Hex-Overwrites)?
* [ ] DB: Neue Alembic-Migration generiert? Blob/Drive-Storage korrekt zugewiesen?