# 🧠 AI Job Agent — Intelligent Application Assistant

[![Python Version](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![Next.js Version](https://img.shields.io/badge/next.js-16.4-black.svg)](https://nextjs.org/)
[![React Version](https://img.shields.io/badge/react-19.3-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind_css-v4.3-38bdf8.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An production-ready, self-hosted web application for technical professionals to fully automate their job search pipeline. By combining automated background scraping, deep AI-powered analysis, an interactive Application Tracking System (ATS), and a browser-based template editor, the **AI Job Agent** handles everything from discovering postings to drafting tailored PDF packages.

---

## 📸 Dashboard Preview

![AI Job Agent Dashboard](docs/images/dashboard.png)

---

## 🚀 Key Features

*   **🕵️‍♂️ Automated Crawl & Scraping Engine**
    *   Periodic background crawls of job boards scheduled via Celery Beat or triggered on-demand.
    *   Dynamic link discovery with safety guards (SSRF filtering via `_is_safe_url` to block private/loopback requests).
    *   Cookie-authenticated WebSocket channel (`/ws`) for streaming scrape logs and job parsing progress in real-time.
*   **🧠 AI-Powered Assessment & Matching**
    *   Compares extracted job descriptions against your candidate profile (skills, experience, and targeted spoken languages).
    *   Calculates a matching threshold score; postings failing to meet the minimum score are automatically archived.
    *   Performs deep-dive company research (extracting tech stack details, cultural fit reviews, and salary benchmarks).
    *   Long AI runs (interview prep, company research, deep dive, CV import, posting details, document generation) show their elapsed time and survive a page reload; stuck runs are ended automatically. Contacts, recruiter and salary can also be read from the posting of an existing job.
*   **📋 Interactive ATS Pipeline**
    *   Track applications through statuses: `OPEN` ➔ `DRAFTED` ➔ `APPLIED` ➔ `INTERVIEW` ➔ `OFFER` ➔ `ACCEPTED`/`REJECTED`.
    *   Desktop-optimized collapsible sidebar and a responsive slide-in detail panel (`JobSidePanel`) synchronized with the URL via `?job=<id>` query parameters.
    *   Mobile-friendly layout with persistent bottom navigation.
*   **✍️ In-Browser Template & Document Editor**
    *   Two-column editor with drag-and-drop support (`dnd-kit`) to customize templates.
    *   Slot-filler engine (`data-slot` / `data-repeat`) automatically injects AI-generated text and CV profiles.
    *   Generates print-ready PDFs using **WeasyPrint** (with legacy xhtml2pdf fallback), eliminating bulky chromium browser runtimes.
*   **🔒 Tenant Isolation & Token Versioning**
    *   All queries enforce strict ownership separation (`user_id == current_user.id`).
    *   Sessions validate a token version (`tv`) for instant API and WebSocket access revocation upon logout.
*   **⚙️ Adaptable Integrations**
    *   **AI Models:** Dynamic settings panel to switch between OpenRouter (cloud models like DeepSeek-R1 or Claude) and local Ollama instances.
    *   **Persistence:** Uploaded files and attached proofs are stored in the PostgreSQL database (`LargeBinary`); generated CVs and letters are stored as HTML.
    *   **Notifications:** Pushover, Resend, Mailjet and SMTP channels, managed per user in the app and sent by the standalone notification service.

---

## 🏗️ System Architecture

The application is structured as a monorepo containing a FastAPI backend, a Celery task framework, and a Next.js frontend, orchestrated inside a single container via supervisord (or run individually for development).

```mermaid
graph TB
    %% Nodes
    User("👤 User (Browser)")
    Frontend("💻 Frontend (Next.js / Tailwind v4)")
    
    subgraph ServerContainer ["🐳 Backend Container (Managed by Supervisord)"]
        FastAPI["🚀 Main API (Port 8080)<br/>FastAPI / WebSockets"]
        ScraperAPI["⚙️ Scraper API (Port 8081)<br/>FastAPI / Validation"]
        CeleryAI["🧠 Celery AI Worker<br/>ai_queue + Celery Beat"]
        CeleryScrape["🕷️ Celery Scraper Worker<br/>scraper_queue"]
    end

    subgraph Infrastructure ["🗄️ Infrastructure Services"]
        PG[(🐘 PostgreSQL 15)]
        Redis[(🔴 Redis Cache & Pub/Sub)]
        RabbitMQ[(🐇 RabbitMQ Message Broker)]
        PageRender["🤖 Page Render Service<br/>(renders job-board pages for the scraper)"]
        Notify["🔔 Notification Service<br/>(channels and sending, ai-job-agent-notify)"]
    end

    subgraph ExternalServices ["🌐 External APIs"]
        OpenRouter["✨ OpenRouter API (Cloud LLM)"]
        Ollama["🦙 Ollama (Local LLM)"]
        Channels["📧 Mail/Push Channels (Pushover, Resend, Mailjet, SMTP)"]
    end

    %% Connections
    User -->|HTTP / WS| Frontend
    Frontend -->|REST / WebSockets| FastAPI
    FastAPI -->|Proxy /scraper/*| ScraperAPI
    
    %% DB & Broker connections
    FastAPI & ScraperAPI & CeleryAI & CeleryScrape -->|Query / Save| PG
    FastAPI & ScraperAPI & CeleryAI & CeleryScrape -->|PubSub / Cache / Results| Redis
    
    %% Celery workflow
    FastAPI & ScraperAPI -->|Enqueue Tasks| RabbitMQ
    CeleryAI & CeleryScrape -->|Consume Tasks| RabbitMQ
    
    %% External integrations
    CeleryAI -->|Inference| OpenRouter
    CeleryAI -->|Inference| Ollama
    CeleryAI & FastAPI -->|Channels and alerts| Notify
    Notify -->|Send| Channels
    CeleryScrape & FastAPI -->|Render API| PageRender
```

### Page Render Service

Crawls and the source preview fetch job-board pages through an external render service (`doublelayer/page-render-service`, compose service `ai-job-agent-page-render`; published only on `127.0.0.1:18431` for local development, inside the compose network it listens on 8000). The server talks to it only through `server/services/page_rendering/`: callers use `fetch_html(url)`, which delegates to the renderer selected by `RENDER_SERVICE` (default `page-render-service`). To swap the render service, add an adapter in that package that implements the `PageRenderer` protocol (`fetch_html(url) -> str | None`, never raises), register it under a new name in the package's registry, and set `RENDER_SERVICE` to that name. Endpoint and key come from `RENDER_API_URL` and `RENDER_API_KEY`.

### Notification Service

Notification channels (Pushover, Resend, Mailjet, SMTP) and all sending logic live in the standalone service `notification-service/` (compose service `ai-job-agent-notify`, port 8000, not published on the host; only the server shares its `notify` network). Every route except `GET /health` needs a per-app API key; channel settings are stored Fernet-encrypted in a SQLite file on the `notify_data` volume. Set `NOTIFY_API_KEY` and `NOTIFY_ENCRYPTION_KEY` in `.env` (see `.env.example`). The server reaches it only through `server/services/notifications_client.py` (`NOTIFY_API_URL`, `NOTIFY_API_KEY`); the API and the AI worker refuse to start without both. Users manage their channels through the server's `/notifications/*` routes, and each source names the channels it notifies. On its first start after the upgrade the server copies the old per-user credentials into the service once (in the background, retried on the next start while the service is unreachable); the old credential columns are kept, read-only, until a later migration drops them. API contract, environment variables and local development: [`notification-service/README.md`](notification-service/README.md).

---

## 🛠️ Docker Quickstart

To run the complete production bundle including database, cache, message broker, page render service, FastAPI backend, and Next.js frontend:

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/ai-job-agent.git
    cd ai-job-agent
    ```

2.  **Configure Environment Variables**:
    Copy the example template and fill in the values:
    ```bash
    cp .env.example .env
    ```
    Ensure you generate a secure random signing key for the JWT:
    ```bash
    openssl rand -hex 32
    # Paste the generated string into SECRET_KEY in your .env file
    ```
    `RENDER_API_KEY`, `NOTIFY_API_KEY` (both at least 32 characters) and `NOTIFY_ENCRYPTION_KEY` are required; compose refuses to start without them. Generate a separate value for each:
    ```bash
    python -c "import secrets; print(secrets.token_urlsafe(48))"   # RENDER_API_KEY, NOTIFY_API_KEY (one run each)
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # NOTIFY_ENCRYPTION_KEY
    ```
    `NOTIFY_ENCRYPTION_KEY` must be a real Fernet key (44 characters ending in `=`); an arbitrary 32-character string is refused at startup. Keep it safe: without it the stored notification channels cannot be read. Details, the variant without a local `cryptography` package, and key rotation: [`notification-service/README.md`](notification-service/README.md#generating-the-keys).

3.  **Launch the Services**:
    ```bash
    docker-compose up -d --build
    ```
    This launches all components. Database tables are automatically generated and migrated using Alembic during the startup process.

4.  **Download Ollama Models** (Optional, for local AI processing):
    If utilizing a local Ollama instance, pull your preferred model:
    ```bash
    docker exec -it ollama ollama pull llama3.1:8b
    ```

5.  **Configure Admin Settings**:
    *   Navigate to **Frontend**: [http://localhost:3000](http://localhost:3000)
    *   Sign in with user `admin` and the password configured in `ADMIN_PASSWORD` (if left blank, check the server container logs for a generated random password).
    *   Go to **System Settings** and input your **OpenRouter API Key** and preferred model IDs (e.g., `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-chat`).

### Troubleshooting: AI calls fail with "Connection error"

The server container joins two networks: `default` (route to the internet) and the internal `notify` (only the notification service, no route out; an internal network supplies no gateway, so the default route comes from `default`).

When the company research says the AI service is unreachable, or the log shows `openai.APIConnectionError: Connection error.`, check from the host:

```bash
# Internet egress of the server container: prints 200
docker compose exec ai-job-agent-server python -c "import urllib.request; print(urllib.request.urlopen('https://openrouter.ai/api/v1/models', timeout=10).status)"
# DNS: prints an address of openrouter.ai
docker compose exec ai-job-agent-server python -c "import socket; print(socket.getaddrinfo('openrouter.ai', 443)[0][4])"
# Default route inside the container (the image has no `ip`): interface and gateway
docker compose exec ai-job-agent-server python -c "import socket, struct; [print(f.split()[0], socket.inet_ntoa(struct.pack('<L', int(f.split()[2], 16)))) for f in open('/proc/net/route') if f.split()[1] == '00000000']"
# The gateway above must be the one of the *_default network here, never the *_notify one
docker inspect ai-job-agent-server --format '{{json .NetworkSettings.Networks}}'
# The notification service stays unreachable from other containers: prints "unreachable"
docker compose exec ai-job-agent-frontend node -e "fetch('http://ai-job-agent-notify:8000/health').then(r => console.log(r.status), () => console.log('unreachable'))"
```

If the default-route check shows the gateway of the `*_notify` network, upgrade Docker (Engine 28.0+) or Compose (2.33.1+) and give the server's `default` network the gateway priority in `docker-compose.yml` (`networks: {default: {gw_priority: 1}, notify: {}}`).

If all of these pass, the log line `AI connection error in <task> to <base URL>` names the target: a `host.docker.internal` URL means the task is routed to the local model server (System Settings, AI routing), which must then be running on the host.

---

## 🤝 Development Setup

For local development, it is highly recommended to run the infrastructure components (PostgreSQL, Redis, RabbitMQ, page render service) in Docker, while running the FastAPI backend and Next.js frontend locally to support live reloading, debugging, and step-through code execution.

### Prerequisites
*   **Python 3.11** installed on your host system.
*   **Node.js 22.12+** and **pnpm 10** installed (`corepack enable` installs the pinned pnpm version).
*   **Docker & Docker Compose** installed.

---

### Step 1: Start Infrastructure Containers
Run only the supporting services from the root folder:
```bash
docker-compose up -d ai-job-agent-database ai-job-agent-redis ai-job-agent-rabbitmq ai-job-agent-page-render
```

---

### Step 2: Backend Setup (`/server`)

1.  **Navigate to the Server Directory**:
    ```bash
    cd server
    ```

2.  **Create and Activate a Virtual Environment**:
    *   **Windows (PowerShell)**:
        ```powershell
        python -m venv .venv
        .venv\Scripts\Activate.ps1
        ```
    *   **macOS / Linux**:
        ```bash
        python3 -m venv .venv
        source .venv/bin/activate
        ```

3.  **Install Python Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set Up Local Env Variables**:
    Create a local `.env` inside `server/` or rely on the environment variables defined in the root directory:
    ```env
    DATABASE_URL=postgresql://user:password@localhost:5432/jobdb
    CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
    CELERY_RESULT_BACKEND=redis://localhost:6379/0
    SECRET_KEY=dev-secret-key-make-sure-to-generate-a-secure-one
    ADMIN_PASSWORD=adminpassword
    RENDER_API_KEY=same-key-as-in-the-root-env-at-least-32-characters
    # The notification service has no host port: run it locally as its README describes
    # (uvicorn on 127.0.0.1:8000) with NOTIFY_API_KEYS=ai-job-agent:<the same key>.
    NOTIFY_API_URL=http://127.0.0.1:8000
    NOTIFY_API_KEY=same-key-as-in-the-root-env-at-least-32-characters
    ```

5.  **Apply Database Migrations**:
    Apply the database schema changes using Alembic:
    ```bash
    alembic -c database/alembic.ini upgrade head
    ```

6.  **Start Background Services (Supervisor)**:
    We use Supervisor to manage the FastAPI app, the scraper API, and both Celery queues:
    ```bash
    supervisord -c supervisord.dev.conf
    ```
    Alternatively, you can run these processes in separate terminal windows:
    *   **Main API**: `uvicorn main:app --port 8080 --reload`
    *   **Scraper API**: `uvicorn scraper_api:app --port 8081 --reload`
    *   **AI Worker**: `celery -A workers.worker.celery_app worker -B -Q ai_queue`
    *   **Scraper Worker**: `celery -A workers.scraper_worker.celery_app worker -Q scraper_queue`

---

### Step 3: Frontend Setup (`/frontend`)

1.  **Navigate to the Frontend Directory**:
    ```bash
    cd ../frontend
    ```

2.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

3.  **API URL**:
    `frontend/.env.development` already sets `NEXT_PUBLIC_API_URL=http://localhost:8002`.
    *(Note: Port `8002` is the mapped port forwarding to port `8080` on the backend).*

4.  **Start the Next.js Dev Server**:
    ```bash
    pnpm dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the development frontend.

---

## 🧪 Testing & Verification

Ensure everything is configured correctly before pushing changes.

### A. Run Backend Tests
Backend unit and integration tests run against an in-memory SQLite database automatically, eliminating the need to tear down local PostgreSQL tables.

Run tests from the `server/` directory:
```bash
# Ensure virtual environment is active
pytest
```
*Expected output: all tests pass (about 1450 at the time of the frontend redesign).*

### B. Verify Configurations & Security
The backend includes helper scripts in `server/scripts/` to verify configurations:
```bash
# Verify Admin login and user management hashing
python scripts/verify_password.py
python scripts/verify_usermanagement.py

# Verify system settings
python scripts/verify_admin_settings.py

# Run backend API smoke tests
python scripts/smoke_test.py
```

### C. Frontend Lints & Builds
Run code quality checks, tests and builds in the `frontend/` directory:
```bash
# ESLint (zero warnings) and Prettier check
pnpm lint

# TypeScript check (also checks DE/EN dictionary parity)
pnpm typecheck

# Vitest unit tests
pnpm test

# Playwright end-to-end tests against a mocked API
pnpm test:e2e

# Next.js production build
pnpm build
```
See `frontend/README.md` for environment variables and the project structure.

---

## 📜 Development Guidelines & Code Standards

If you're making code contributions to this repository, please adhere to the following rules:

1.  **Strict Type Safety**: The use of `any` is forbidden in TypeScript files. Backend code must maintain strict type hinting on all functions.
2.  **Tenant Security**: Every query and mutation must explicitly filter by user identity (`user_id == current_user.id`) to avoid cross-tenant leaks.
3.  **Route Selection**: Use `def` for synchronous tasks (SQLAlchemy queries, template fills, standard filesystem checks) to let FastAPI delegate them to a thread pool. Use `async def` only for fully non-blocking asynchronous calls.
4.  **Heavy Task Handlers**: Never block an HTTP route handler on long-running processes (scraping, AI generation, PDF compiles). Immediately push to the Celery broker, return a task ID, and broadcast progress updates using WebSockets. The only exceptions are the CV import and the deep dive, which run the AI in the request thread behind a cap of 4 parallel runs and a durable start stamp.
5.  **Schema Updates**: Never manually modify the database tables. Always generate Alembic migrations:
    ```bash
    alembic -c database/alembic.ini revision --autogenerate -m "describe_changes"
    ```
6.  **Internationalization (i18n)**: Do not write hardcoded text strings in JSX components. Use `t("key")` from `useI18n()` and add every key to both `frontend/src/i18n/de.ts` (source of truth) and `frontend/src/i18n/en.ts`.

---

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
