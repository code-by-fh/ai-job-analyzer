# 🧠 AI Job Agent — Intelligent Application Assistant

[![Python Version](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![Next.js Version](https://img.shields.io/badge/next.js-16.1-black.svg)](https://nextjs.org/)
[![React Version](https://img.shields.io/badge/react-19.0-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind_css-v4.0-38bdf8.svg)](https://tailwindcss.com/)
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
*   **⚙️ Adaptable Integrations & Storage**
    *   **AI Models:** Dynamic settings panel to switch between OpenRouter (cloud models like DeepSeek-R1 or Claude) and local Ollama instances.
    *   **Persistence:** Dual-storage system saving generated documents into the PostgreSQL database (`LargeBinary`) or uploading to Google Drive via OAuth2.
    *   **Notifications:** Supports SMTP, Gmail API, Pushover, Resend, and Mailjet channels.

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
        Botosaurus["🤖 Botosaurus Service<br/>(PDF rendering helper)"]
    end

    subgraph ExternalServices ["🌐 External APIs"]
        OpenRouter["✨ OpenRouter API (Cloud LLM)"]
        Ollama["🦙 Ollama (Local LLM)"]
        GoogleDrive["📁 Google Drive API (OAuth2 Storage)"]
        Gmail["📧 Mail/Push Channels (Pushover, Resend, SMTP)"]
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
    CeleryAI -->|OAuth Store| GoogleDrive
    CeleryAI -->|Send Alerts| Gmail
    CeleryAI -->|Render API| Botosaurus
```

---

## 🛠️ Docker Quickstart

To run the complete production bundle including database, cache, message broker, PDF renderer, FastAPI backend, and Next.js frontend:

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

---

## 🤝 Development Setup

For local development, it is highly recommended to run the infrastructure components (PostgreSQL, Redis, RabbitMQ, Botosaurus) in Docker, while running the FastAPI backend and Next.js frontend locally to support live reloading, debugging, and step-through code execution.

### Prerequisites
*   **Python 3.11** installed on your host system.
*   **Node.js v20+** and **npm** installed.
*   **Docker & Docker Compose** installed.

---

### Step 1: Start Infrastructure Containers
Run only the supporting services from the root folder:
```bash
docker-compose up -d database redis rabbitmq botosaurus
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
    npm install
    ```

3.  **Set Up Local Env Variables**:
    Create `.env` inside the `frontend/` directory:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8002
    NEXT_PUBLIC_LOG_LEVEL=info
    ```
    *(Note: Port `8002` is the mapped port forwarding to port `8080` on the backend).*

4.  **Start the Next.js Dev Server**:
    ```bash
    npm run dev
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
*Expected output: `64 passed, 1 skipped`.*

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
Run code quality checks and static exports in the `frontend/` directory:
```bash
# Run ESLint validation
npm run lint

# Compile Next.js production build
npm run build
```

---

## 📜 Development Guidelines & Code Standards

If you're making code contributions to this repository, please adhere to the following rules:

1.  **Strict Type Safety**: The use of `any` is forbidden in TypeScript files. Backend code must maintain strict type hinting on all functions.
2.  **Tenant Security**: Every query and mutation must explicitly filter by user identity (`user_id == current_user.id`) to avoid cross-tenant leaks.
3.  **Route Selection**: Use `def` for synchronous tasks (SQLAlchemy queries, template fills, standard filesystem checks) to let FastAPI delegate them to a thread pool. Use `async def` only for fully non-blocking asynchronous calls.
4.  **Heavy Task Handlers**: Never block an HTTP route handler on long-running processes (scraping, AI generation, PDF compiles). Immediately push to the Celery broker, return a task ID, and broadcast progress updates using WebSockets.
5.  **Schema Updates**: Never manually modify the database tables. Always generate Alembic migrations:
    ```bash
    alembic -c database/alembic.ini revision --autogenerate -m "describe_changes"
    ```
6.  **Internationalization (i18n)**: Do not write hardcoded text strings in JSX components. Use `t("key")` from `useLanguage()` and add translations in both English and German to `frontend/app/lib/languages.ts`.

---

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
