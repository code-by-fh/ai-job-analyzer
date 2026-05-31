## 🚀 Architecture Context (Token-Optimized)

### 1. Stack & Process Model

* **Architektur:** *Keine* Microservices. Ein einzelner Docker-Container (`server`), gesteuert über `supervisord` mit **4 logischen Prozessen**:
1. `main.py` (Port 8080): Haupt-REST-API, Auth, WebSockets.
2. `scraper_api.py` (Port 8081, intern): Crawl-Orchestrierung.
3. Celery Worker 1 (`ai_queue`): AI-Tasks + Celery Beat (`-B` Scheduler).
4. Celery Worker 2 (`scraper_queue`): Playwright/BS4 Scraping.


* **Frontend:** Next.js 16 (App Router), React 19, Tailwind v4.
* **Infrastruktur:** PostgreSQL 15 (SQLAlchemy 2.0, Alembic), Redis (Crawl-Status, Pub/Sub, Celery Backend), RabbitMQ (Celery Broker).

### 2. Boundary Map

* `server/main.py` & `routers/` — REST-Endpunkte (Auth-geschützt, `user_id`-isoliert).
* `server/scraper_api.py` — Validierung & Dispatching von Crawl-Jobs.
* `server/intelligence/` — Einziger LLM-Integrationspunkt (OpenRouter).
* `server/workers/` — Asynchrone Tasks. `worker.py` ist nur noch dünner Celery-Entrypoint/Aggregator (`-A workers.worker.celery_app`), der `workers/tasks/*` (analyze, application, research, scheduling, urls; gemeinsame Crawl-Completion in `crawl_status.py`) und `workers/notifications/*` (email, push, templates) re-exportiert. `scraper_worker.py` für Crawls.
* `server/core/` — Cross-cutting Infra (JWT-Auth, WebSocket-Manager, Logger).
* `server/database/` — SQLAlchemy-Modelle + Alembic-Migrationen.

### 3. Data & Storage Layer

* **PostgreSQL (Source of Truth):** User, Jobs, Settings, Platforms, Company Profiles.
* **Documents (Dual):** DB Blob (`LargeBinary`) **oder** Google Drive (OAuth2), gesteuert via `active_storage_service`.
* **Redis (Ephemeral):** Crawl-Hashes (1h TTL), Active-Sets, WebSocket Pub/Sub (`job_updates`).

### 4. Security & Auth Model

* **Cookie JWT:** Access (15m) & Refresh (7d) via HttpOnly, SameSite=Lax Cookies.
* **Revocation:** Token enthält Version (`tv`). `get_current_user` gleicht `tv` mit DB ab. Logout erhöht `tv` (gilt für REST + WS).
* **RBAC:** `is_admin` Boolean steuert Admin-Routen (`get_current_admin_user`).
* **Data Isolation:** Jede Query erzwingt `user_id == current_user.id`.
* **Secrets:** LLM-Keys & API-Credentials werden in DB/Env gehalten, niemals im Image. Maskierung via `_SECRET_FIELDS` bei Read.

---

## 🛑 Hard Invariants (Strict Checklist)

1. **No Inline Heavy-Work:** API-Handler triggern für Scraping, AI und PDFs *ausschließlich* Celery-Jobs und liefern eine Job-ID zurück. Live-Updates laufen via Redis Pub/Sub über WebSockets (`/ws`).
2. **Auth First:** Jede Query/Mutation validiert zwingend Auth + Ownership (`user_id`).
3. **Migrations Only:** Schema-Änderungen erfordern zwingend eine neue Alembic-Migration. `create_all` ist nur ein Fallback.
4. **SSRF Protection:** Jeder ausgehende Scraping- oder Web-Request muss zwingend über `scraper_worker._is_safe_url` validiert werden (Verbot von Loopback, Private & Link-Local IPs).
5. **Token Versioning:** REST- und WebSocket-Verbindungen müssen beide die Token-Version (`tv`) validieren.