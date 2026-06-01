# Auto Application Package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click generation of a complete job application package per job: a job-tailored CV (local LM Studio/Ollama → HTML template → PDF), a cover letter (OpenRouter → HTML template → PDF), and an optional fixed set of profile documents (references/certificates), all stored as job documents.

**Architecture:** A single sequential Celery task (`ai.generate_application_package`) orchestrates: tailored CV via a local LM Studio/Ollama server (OpenAI-compatible API at `http://localhost:11434/v1` by default, overridable via `OLLAMA_BASE_URL`), cover letter via the existing OpenRouter path, deterministic HTML→PDF rendering via Jinja2 + `xhtml2pdf`, and copying of profile documents. Generated/attached files are persisted as `JobDocument` rows (tagged via a new `kind` column) using the existing dual-storage pattern (DB blob or Google Drive). Online submission stays out of scope — only a stub endpoint + adapter placeholder are added.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 + Alembic, Celery (RabbitMQ broker, Redis backend), OpenAI SDK (for both OpenRouter and Ollama's OpenAI-compatible API), Jinja2 (new), xhtml2pdf (existing), Next.js/React frontend, pytest (new test infra).

**Spec:** `docs/superpowers/specs/2026-05-31-automated-application-package-design.md`

---

## File Structure

**New backend files:**
- `server/tests/conftest.py` — pytest fixtures (in-memory SQLite session).
- `server/tests/test_document_renderer.py`, `test_tailored_cv.py`, `test_profile_documents.py`, `test_package_storage.py`
- `server/services/document_renderer.py` — Jinja2 + xhtml2pdf rendering (CV + cover letter).
- `server/services/job_documents.py` — dual-storage helper to persist/replace generated `JobDocument`s.
- `server/templates/cv/classic.html`, `server/templates/cover_letter/classic.html` — shipped HTML templates.
- `server/services/submission.py` — `SubmissionAdapter` placeholder (out-of-scope hook).
- `server/routers/profile_documents.py` — profile document CRUD + template listing.
- `server/workers/tasks/package.py` — the orchestration Celery task.

**Modified backend files:**
- `server/database/core.py` — `ProfileDocument` model, `JobDocument.kind`, `UserProfile.cv_template`/`cover_letter_template`, `SystemSettings.ollama_model`.
- new Alembic migration under `server/database/migrations/versions/`.
- `server/intelligence/service.py` — Ollama client + `generate_tailored_cv`, `get_ollama_model`.
- `server/intelligence/prompts.py` — `get_tailored_cv_messages`.
- `server/workers/worker.py` — re-export the new package task so Celery registers it.
- `server/routers/jobs.py` — `generate-package` + `submit-application` endpoints.
- `server/routers/settings.py` — accept `cv_template`/`cover_letter_template` in profile save + return them in GET.
- `server/main.py` — register `profile_documents` router.
- `server/requirements.txt` — add `jinja2`, `pytest`, `httpx` (test client).

**Modified frontend files:**
- `frontend/app/profile/page.tsx` — reference/certificate upload areas + template selection.
- `frontend/app/components/JobCard/JobApplicationTab.tsx` — "Bewerbungspaket erstellen" CTA + include-docs toggle + "Online bewerben" hook.

---

## Conventions to follow (from existing code)

- **Dual storage filename prefix:** local DB content uses `db://<name>`, Google Drive uses `gdrive://<name>` in `JobDocument.filename`; `original_filename` holds the clean name. (See `routers/jobs.py:741-746`.)
- **Celery dispatch:** `celery_app.send_task("ai.<name>", args=[...], queue="ai_queue")`. Tasks decorated `@celery_app.task(name="ai.<name>")` and re-exported in `workers/worker.py` for registration.
- **HTML→PDF:** `from xhtml2pdf import pisa; pisa.CreatePDF(html, dest=BytesIO(), encoding="utf-8")` (see `routers/jobs.py:302-321`).
- **WS updates:** `redis.from_url(...).publish("job_updates", json.dumps({...}))` with `type`, `job_id`, `status`, `user_id`.
- **Auth/ownership:** every query filters `user_id == current_user.id`; `current_user: User = Depends(get_current_user)`.
- **Migrations only:** schema changes require an Alembic migration (project invariant).

---

## Task 1: Test infrastructure (pytest + SQLite session fixture)

The project currently has zero tests. Add a minimal pytest setup so later tasks can be TDD'd. Models use generic SQLAlchemy types (`JSON`, `LargeBinary`, `Text`) that work on SQLite for unit tests.

**Files:**
- Modify: `server/requirements.txt`
- Create: `server/pytest.ini`
- Create: `server/tests/__init__.py`
- Create: `server/tests/conftest.py`

- [ ] **Step 1: Add test + templating deps**

Append to `server/requirements.txt`:

```
jinja2==3.1.4
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: Install deps locally**

Run: `cd server && pip install jinja2==3.1.4 pytest==8.3.4 httpx==0.28.1`
Expected: successful install.

- [ ] **Step 3: Create `server/pytest.ini`**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -q
```

- [ ] **Step 4: Create `server/tests/__init__.py`** (empty file)

```python
```

- [ ] **Step 5: Create `server/tests/conftest.py`**

```python
import os

# Point the app at a throwaway SQLite DB *before* importing database.core,
# so importing it never tries to reach the real Postgres at import time.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.core import Base


@pytest.fixture()
def db_session():
    """In-memory SQLite session with all tables created from the ORM metadata."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
```

- [ ] **Step 6: Verify pytest discovers an empty suite**

Run: `cd server && python -m pytest`
Expected: "no tests ran" (exit code 5) — confirms config loads without import errors.

- [ ] **Step 7: Commit**

```bash
git add server/requirements.txt server/pytest.ini server/tests/__init__.py server/tests/conftest.py
git commit -m "test: add pytest infra with sqlite session fixture"
```

---

## Task 2: Data model + Alembic migration

Add the new table and columns. Keep types generic so the SQLite test fixture keeps working.

**Files:**
- Modify: `server/database/core.py` (JobEntry already at line 39; UserProfile at 74; SystemSettings at 114; JobDocument at 189)
- Create: `server/database/migrations/versions/b2c3d4e5f6a7_add_application_package_models.py`
- Test: `server/tests/test_profile_documents.py`

- [ ] **Step 1: Add `kind` to `JobDocument`**

In `server/database/core.py`, inside `class JobDocument` (after the `mime_type` column, ~line 197):

```python
    kind = Column(String, default="UPLOADED", nullable=False, server_default="UPLOADED")
    # UPLOADED | GENERATED_CV | GENERATED_LETTER | ATTACHED_CERT | ATTACHED_REFERENCE
```

- [ ] **Step 2: Add template fields to `UserProfile`**

In `class UserProfile`, after `job_urls = Column(JSON, default=[])` (~line 86):

```python
    cv_template = Column(String, nullable=True, default="classic")
    cover_letter_template = Column(String, nullable=True, default="classic")
```

- [ ] **Step 3: Add `ollama_model` to `SystemSettings`**

In `class SystemSettings`, after `openrouter_api_key` (~line 118):

```python
    ollama_model = Column(String, nullable=True, default="llama3.1:8b")
```

- [ ] **Step 4: Add `ProfileDocument` model**

In `server/database/core.py`, after the `JobDocument` class (after ~line 201):

```python
class ProfileDocument(Base):
    __tablename__ = "profile_documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doc_type = Column(String, nullable=False)  # REFERENCE | CERTIFICATE
    label = Column(String, nullable=True)
    filename = Column(String, nullable=False)  # db://<name> or gdrive://<name>
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    content = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

Confirm `LargeBinary` is imported at the top of `core.py` (it is — used by `JobDocument`).

- [ ] **Step 5: Write the failing model test**

Create `server/tests/test_profile_documents.py`:

```python
from database.core import ProfileDocument, JobDocument, UserProfile, SystemSettings


def test_profile_document_persists(db_session):
    doc = ProfileDocument(
        user_id=1,
        doc_type="CERTIFICATE",
        label="AWS Solutions Architect",
        filename="db://cert.pdf",
        original_filename="cert.pdf",
        file_size=1234,
        mime_type="application/pdf",
        content=b"%PDF-1.4 fake",
    )
    db_session.add(doc)
    db_session.commit()
    loaded = db_session.query(ProfileDocument).first()
    assert loaded.doc_type == "CERTIFICATE"
    assert loaded.label == "AWS Solutions Architect"
    assert loaded.content == b"%PDF-1.4 fake"


def test_jobdocument_kind_defaults_to_uploaded(db_session):
    doc = JobDocument(
        job_id="job-1", user_id=1, filename="db://x", original_filename="x"
    )
    db_session.add(doc)
    db_session.commit()
    assert db_session.query(JobDocument).first().kind == "UPLOADED"


def test_profile_template_defaults(db_session):
    p = UserProfile(user_id=1)
    db_session.add(p)
    db_session.commit()
    loaded = db_session.query(UserProfile).first()
    assert loaded.cv_template == "classic"
    assert loaded.cover_letter_template == "classic"
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `cd server && python -m pytest tests/test_profile_documents.py -v`
Expected: 3 passed. (If `kind`/`cv_template` defaults fail, the column `default=` is the SQLAlchemy Python-side default applied on flush — ensure they are set as shown.)

- [ ] **Step 7: Write the Alembic migration**

Find the current head: `cd server && alembic heads` (note the revision id). Create `server/database/migrations/versions/b2c3d4e5f6a7_add_application_package_models.py`:

```python
"""add application package models

Revision ID: b2c3d4e5f6a7
Revises: <CURRENT_HEAD_REVISION>
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "<CURRENT_HEAD_REVISION>"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "job_documents",
        sa.Column("kind", sa.String(), nullable=False, server_default="UPLOADED"),
    )
    op.add_column("user_settings", sa.Column("cv_template", sa.String(), nullable=True))
    op.add_column(
        "user_settings", sa.Column("cover_letter_template", sa.String(), nullable=True)
    )
    op.add_column(
        "system_settings", sa.Column("ollama_model", sa.String(), nullable=True)
    )
    op.create_table(
        "profile_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_profile_documents_user_id", "profile_documents", ["user_id"]
    )


def downgrade():
    op.drop_index("ix_profile_documents_user_id", table_name="profile_documents")
    op.drop_table("profile_documents")
    op.drop_column("system_settings", "ollama_model")
    op.drop_column("user_settings", "cover_letter_template")
    op.drop_column("user_settings", "cv_template")
    op.drop_column("job_documents", "kind")
```

Replace `<CURRENT_HEAD_REVISION>` with the id from `alembic heads`.

- [ ] **Step 8: Apply migration against the running DB**

Run (with the stack up, or against a dev DB): `cd server && alembic upgrade head`
Expected: migration applies cleanly. If the DB is not reachable locally, defer this to deployment and note it; the model tests above already validate the ORM shape.

- [ ] **Step 9: Commit**

```bash
git add server/database/core.py server/database/migrations/versions/b2c3d4e5f6a7_add_application_package_models.py server/tests/test_profile_documents.py
git commit -m "feat: add ProfileDocument model, JobDocument.kind, template + ollama_model columns"
```

---

## Task 3: HTML templates (CV + cover letter)

Ship two Jinja2 HTML templates. Keep CSS inline and xhtml2pdf-compatible (table-based layout, simple CSS — xhtml2pdf does not support flexbox/grid).

**Files:**
- Create: `server/templates/cv/classic.html`
- Create: `server/templates/cover_letter/classic.html`

- [ ] **Step 1: Create `server/templates/cv/classic.html`**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "DejaVu Sans", Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #222; }
  h1 { font-size: 20pt; margin: 0 0 2pt 0; color: #111; }
  .role { font-size: 12pt; color: #555; margin-bottom: 12pt; }
  h2 { font-size: 12pt; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 2pt; margin-top: 16pt; }
  .item { margin-bottom: 8pt; }
  .item .meta { color: #666; font-size: 9.5pt; }
  .summary { margin-bottom: 12pt; }
</style>
</head>
<body>
  <h1>{{ name }}</h1>
  <div class="role">{{ role }}</div>

  {% if summary %}<div class="summary">{{ summary }}</div>{% endif %}

  {% if skills %}<h2>Skills</h2><div>{{ skills }}</div>{% endif %}

  {% if experience %}
  <h2>Berufserfahrung</h2>
  {% for exp in experience %}
  <div class="item">
    <strong>{{ exp.role }}</strong> — {{ exp.company }}
    <div class="meta">{{ exp.duration }}</div>
    <div>{{ exp.description }}</div>
  </div>
  {% endfor %}
  {% endif %}

  {% if projects %}
  <h2>Projekte</h2>
  {% for proj in projects %}
  <div class="item">
    <strong>{{ proj.name }}</strong>
    <div class="meta">{{ proj.tech_stack }}</div>
    <div>{{ proj.description }}</div>
  </div>
  {% endfor %}
  {% endif %}

  {% if education %}<h2>Ausbildung</h2><div>{{ education }}</div>{% endif %}
</body>
</html>
```

- [ ] **Step 2: Create `server/templates/cover_letter/classic.html`**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 2.5cm; }
  body { font-family: "DejaVu Sans", Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333; }
  .sender { color: #555; font-size: 10pt; margin-bottom: 24pt; }
  .recipient { margin-bottom: 24pt; }
  p { margin: 0 0 10pt 0; }
</style>
</head>
<body>
  <div class="sender">{{ sender_name }}</div>
  <div class="recipient">{{ company }}</div>
  {{ body_html | safe }}
</body>
</html>
```

> Note: `body_html` is server-built from the AI's markdown letter (already trusted, single-user self-hosted). The `| safe` is intentional and limited to this field.

- [ ] **Step 3: Commit**

```bash
git add server/templates/cv/classic.html server/templates/cover_letter/classic.html
git commit -m "feat: add classic CV and cover letter HTML templates"
```

---

## Task 4: Document renderer service

Render templates to PDF bytes deterministically.

**Files:**
- Create: `server/services/document_renderer.py`
- Test: `server/tests/test_document_renderer.py`

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_document_renderer.py`:

```python
from services.document_renderer import (
    list_templates,
    render_cv_pdf,
    render_cover_letter_pdf,
)


def test_list_templates_returns_classic():
    templates = list_templates()
    assert "classic" in templates["cv"]
    assert "classic" in templates["cover_letter"]


def test_render_cv_pdf_returns_pdf_bytes():
    cv = {
        "name": "Max Mustermann",
        "role": "Backend Engineer",
        "skills": "Python, FastAPI",
        "experience": [
            {"role": "Dev", "company": "ACME", "duration": "2020-2024", "description": "Built APIs"}
        ],
        "projects": [],
        "education": "B.Sc. Informatik",
    }
    pdf = render_cv_pdf(cv, template_key="classic")
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"


def test_render_cover_letter_pdf_returns_pdf_bytes():
    pdf = render_cover_letter_pdf(
        letter_markdown="Sehr geehrte Damen und Herren,\n\nich bewerbe mich.",
        template_key="classic",
        sender_name="Max Mustermann",
        company="ACME GmbH",
    )
    assert pdf[:4] == b"%PDF"


def test_render_cv_pdf_unknown_template_falls_back_to_classic():
    pdf = render_cv_pdf({"name": "X", "role": "Y"}, template_key="does-not-exist")
    assert pdf[:4] == b"%PDF"
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd server && python -m pytest tests/test_document_renderer.py -v`
Expected: FAIL (ModuleNotFoundError: services.document_renderer).

- [ ] **Step 3: Implement the renderer**

Create `server/services/document_renderer.py`:

```python
"""Render application documents (CV, cover letter) from HTML templates to PDF."""

import os
from io import BytesIO

import markdown as _markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape
from xhtml2pdf import pisa

from core.logger import get_logger

logger = get_logger(__name__)

_TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)


def list_templates() -> dict:
    """Return available template keys per category, e.g. {'cv': ['classic'], ...}."""
    result = {"cv": [], "cover_letter": []}
    for category in result:
        cat_dir = os.path.join(_TEMPLATE_DIR, category)
        if os.path.isdir(cat_dir):
            result[category] = sorted(
                f[:-5] for f in os.listdir(cat_dir) if f.endswith(".html")
            )
    return result


def _resolve(category: str, template_key: str) -> str:
    available = list_templates().get(category, [])
    key = template_key if template_key in available else "classic"
    return f"{category}/{key}.html"


def _html_to_pdf(html: str) -> bytes:
    buf = BytesIO()
    status = pisa.CreatePDF(html, dest=buf, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"PDF generation failed (xhtml2pdf err={status.err})")
    return buf.getvalue()


def render_cv_pdf(cv_data: dict, template_key: str = "classic") -> bytes:
    template = _env.get_template(_resolve("cv", template_key))
    html = template.render(**cv_data)
    return _html_to_pdf(html)


def render_cover_letter_pdf(
    letter_markdown: str,
    template_key: str = "classic",
    sender_name: str = "",
    company: str = "",
) -> bytes:
    body_html = _markdown.markdown(letter_markdown or "")
    template = _env.get_template(_resolve("cover_letter", template_key))
    html = template.render(body_html=body_html, sender_name=sender_name, company=company)
    return _html_to_pdf(html)
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd server && python -m pytest tests/test_document_renderer.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/services/document_renderer.py server/tests/test_document_renderer.py
git commit -m "feat: add document renderer (Jinja2 + xhtml2pdf) for CV and cover letter"
```

---

## Task 5: Ollama provider + tailored CV generation

Add a local Ollama provider and the `generate_tailored_cv` function. Ollama exposes an OpenAI-compatible API, so reuse the `OpenAI` client with a different `base_url`.

**Files:**
- Modify: `server/intelligence/prompts.py` (add after `get_generate_application_messages`, ~line 168)
- Modify: `server/intelligence/service.py`
- Test: `server/tests/test_tailored_cv.py`

- [ ] **Step 1: Add the prompt builder**

In `server/intelligence/prompts.py`, add:

```python
def get_tailored_cv_messages(cv_data, job_title, job_description, language="de"):
    import json as _json
    lang_note = "Antworte auf Deutsch." if language == "de" else "Respond in English."
    system = (
        "You are a CV editor. You receive a candidate's structured CV as JSON and a "
        "job posting. Reorder and re-emphasize the existing content to best match the "
        "job. You MUST NOT invent facts, employers, dates, or skills that are not in "
        "the input. You may rewrite descriptions for clarity and add a short 'summary'. "
        "Return ONLY a JSON object with the same keys as the input plus an optional "
        "'summary' (string) and 'skills' (string). " + lang_note
    )
    user = (
        f"JOB TITLE:\n{job_title}\n\nJOB DESCRIPTION:\n{job_description[:6000]}\n\n"
        f"CANDIDATE CV JSON:\n{_json.dumps(cv_data, ensure_ascii=False)}\n\n"
        "Return the tailored CV as JSON only."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
```

- [ ] **Step 2: Write the failing test**

Create `server/tests/test_tailored_cv.py`:

```python
import json
from unittest.mock import MagicMock, patch

from intelligence.service import generate_tailored_cv


def _fake_response(content: str):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    return resp


@patch("intelligence.service.get_ollama_client")
def test_generate_tailored_cv_parses_json(mock_client):
    payload = {
        "name": "Max",
        "role": "Backend Engineer",
        "summary": "Erfahrener Entwickler",
        "skills": "Python, FastAPI",
        "experience": [{"role": "Dev", "company": "ACME", "duration": "2020", "description": "APIs"}],
        "projects": [],
        "education": "B.Sc.",
    }
    mock_client.return_value.chat.completions.create.return_value = _fake_response(
        "```json\n" + json.dumps(payload) + "\n```"
    )
    result = generate_tailored_cv(
        cv_data={"experience": [], "projects": [], "education": ""},
        job_title="Backend Engineer",
        job_description="Build APIs",
        candidate_name="Max",
        candidate_role="Backend Engineer",
        model="llama3.1:8b",
    )
    assert result["name"] == "Max"
    assert result["summary"] == "Erfahrener Entwickler"
    assert result["experience"][0]["company"] == "ACME"
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd server && python -m pytest tests/test_tailored_cv.py -v`
Expected: FAIL (cannot import `generate_tailored_cv` / `get_ollama_client`).

- [ ] **Step 4: Implement Ollama client + tailored CV in `service.py`**

In `server/intelligence/service.py`, add near `get_ai_client` (and import the new prompt at the top with the others):

```python
def get_ollama_client():
    """OpenAI-compatible client pointed at the local Ollama service."""
    base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434/v1")
    return OpenAI(base_url=base_url, api_key="ollama")


def get_ollama_model(db=None) -> str:
    try:
        if db:
            from database.core import SystemSettings
            settings = db.query(SystemSettings).first()
            if settings and settings.ollama_model:
                return settings.ollama_model
    except Exception:
        pass
    return os.getenv("OLLAMA_MODEL", "llama3.1:8b")


def generate_tailored_cv(
    cv_data: dict,
    job_title: str,
    job_description: str,
    candidate_name: str = "",
    candidate_role: str = "",
    language: str = "de",
    model: str = None,
) -> dict:
    """Use local Ollama to reorder/emphasize the candidate's CV for a job.

    Returns a dict with the same shape as the CV template expects. Never invents
    facts; on any failure the original cv_data is returned with name/role filled.
    """
    base = dict(cv_data or {})
    base.setdefault("experience", [])
    base.setdefault("projects", [])
    base.setdefault("education", "")
    base["name"] = candidate_name or base.get("name", "")
    base["role"] = candidate_role or base.get("role", "")

    client = get_ollama_client()
    messages = get_tailored_cv_messages(base, job_title, job_description, language)
    try:
        response = _call_openrouter(
            client=client,
            model=model or get_ollama_model(),
            messages=messages,
            temperature=0.3,
            func_name="generate_tailored_cv",
        )
        tailored = extract_json(response.choices[0].message.content.strip())
    except Exception as e:
        logger.error(f"Ollama tailored CV failed, using untailored CV: {e}")
        return base

    # Merge: tailored content wins, but guarantee required keys + name/role.
    tailored.setdefault("experience", base["experience"])
    tailored.setdefault("projects", base["projects"])
    tailored.setdefault("education", base["education"])
    tailored["name"] = base["name"]
    tailored["role"] = base["role"]
    return tailored
```

> Note: `_call_openrouter` is a generic wrapper around `client.chat.completions.create`; reusing it for Ollama is fine since Ollama's API is OpenAI-compatible. The function name is historical.

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd server && python -m pytest tests/test_tailored_cv.py -v`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add server/intelligence/service.py server/intelligence/prompts.py server/tests/test_tailored_cv.py
git commit -m "feat: add local Ollama provider and job-tailored CV generation"
```

---

## Task 6: Job-document storage helper

A reusable helper to persist generated/attached files as `JobDocument`s via the dual-storage pattern, replacing any existing document of the same `kind` for a job.

**Files:**
- Create: `server/services/job_documents.py`
- Test: `server/tests/test_package_storage.py`

- [ ] **Step 1: Write the failing test (DB-blob path, no external storage)**

Create `server/tests/test_package_storage.py`:

```python
from database.core import JobDocument
from services.job_documents import store_generated_document


def test_store_generated_document_db_blob(db_session):
    doc = store_generated_document(
        db=db_session,
        job_id="job-1",
        user_id=7,
        content=b"%PDF-1.4 cv",
        original_filename="Lebenslauf.pdf",
        mime_type="application/pdf",
        kind="GENERATED_CV",
        storage=None,
    )
    assert doc.filename.startswith("db://")
    assert doc.kind == "GENERATED_CV"
    assert db_session.query(JobDocument).count() == 1


def test_store_generated_document_replaces_same_kind(db_session):
    for marker in (b"v1", b"v2"):
        store_generated_document(
            db=db_session, job_id="job-1", user_id=7, content=marker,
            original_filename="Lebenslauf.pdf", mime_type="application/pdf",
            kind="GENERATED_CV", storage=None,
        )
    docs = db_session.query(JobDocument).filter(JobDocument.kind == "GENERATED_CV").all()
    assert len(docs) == 1
    assert docs[0].content == b"v2"
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd server && python -m pytest tests/test_package_storage.py -v`
Expected: FAIL (cannot import `store_generated_document`).

- [ ] **Step 3: Implement the helper**

Create `server/services/job_documents.py`:

```python
"""Persist generated/attached application documents as JobDocument rows."""

import asyncio

from database.core import JobDocument
from core.logger import get_logger

logger = get_logger(__name__)


def store_generated_document(
    db,
    job_id: str,
    user_id: int,
    content: bytes,
    original_filename: str,
    mime_type: str,
    kind: str,
    storage=None,
):
    """Create a JobDocument for `content`, replacing any existing doc of the same
    `kind` for this job. Uploads to external storage when `storage` is provided,
    otherwise stores the blob in the DB."""
    # Replace existing docs of this kind for the job.
    db.query(JobDocument).filter(
        JobDocument.job_id == job_id, JobDocument.kind == kind
    ).delete(synchronize_session=False)

    db_content = None
    if storage is not None:
        try:
            ok = asyncio.run(
                storage.upload_file(content, original_filename, mime_type=mime_type)
            )
            if not ok:
                logger.warning(f"External upload failed for {original_filename}; storing in DB")
                db_content = content
                stored_filename = f"db://{original_filename}"
            else:
                stored_filename = f"gdrive://{original_filename}"
        except Exception as e:
            logger.error(f"External upload error for {original_filename}: {e}")
            db_content = content
            stored_filename = f"db://{original_filename}"
    else:
        db_content = content
        stored_filename = f"db://{original_filename}"

    doc = JobDocument(
        job_id=job_id,
        user_id=user_id,
        filename=stored_filename,
        original_filename=original_filename,
        file_size=len(content),
        mime_type=mime_type,
        content=db_content,
        kind=kind,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd server && python -m pytest tests/test_package_storage.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/services/job_documents.py server/tests/test_package_storage.py
git commit -m "feat: add job-document storage helper with same-kind replacement"
```

---

## Task 7: Package orchestration Celery task

**Files:**
- Create: `server/workers/tasks/package.py`
- Modify: `server/workers/worker.py` (re-export so Celery registers the task)

- [ ] **Step 1: Implement the task**

Create `server/workers/tasks/package.py`:

```python
"""Celery task: generate the full application package for a job (sequential)."""

import os
import json

import redis

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, JobEntry, UserProfile, ProfileDocument, User
from intelligence.service import (
    get_model,
    get_api_key,
    get_ollama_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
)
from services.document_renderer import render_cv_pdf, render_cover_letter_pdf
from services.job_documents import store_generated_document
from services.storage import get_storage_service

logger = get_logger(__name__)

_ATTACH_KIND = {"REFERENCE": "ATTACHED_REFERENCE", "CERTIFICATE": "ATTACHED_CERT"}


def _publish(r, job, status, **extra):
    payload = {"type": "job_update", "job_id": job.id, "status": status, "user_id": job.user_id}
    payload.update(extra)
    r.publish("job_updates", json.dumps(payload))


@celery_app.task(name="ai.generate_application_package")
def generate_application_package_task(job_id, user_id=None, include_profile_documents=True):
    logger.info(f"[TASK] Generating application package for Job {job_id}, User {user_id}")
    db = SessionLocal()
    r = redis.from_url(os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"))
    try:
        job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        target_user_id = user_id or job.user_id
        profile = (
            db.query(UserProfile).filter(UserProfile.user_id == target_user_id).first()
            if target_user_id else None
        )
        if not profile:
            profile = db.query(UserProfile).filter(UserProfile.id == 1).first()

        if not profile or not profile.cv_data:
            msg = "Profil unvollständig. Bitte Lebenslauf im Profil hinterlegen."
            job.status = "FAILED"
            job.generation_error = msg
            db.commit()
            _publish(r, job, "FAILED", error=msg)
            return

        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        language = getattr(profile, "language", "de") or "de"
        storage = get_storage_service(profile) if profile.active_storage_service != "NONE" else None

        # --- 1. Tailored CV (Ollama, local) ---
        tailored = generate_tailored_cv(
            cv_data=profile.cv_data,
            job_title=job.title,
            job_description=(job.description or "")[:10000],
            candidate_name=candidate_name,
            candidate_role=profile.role,
            language=language,
            model=get_ollama_model(db),
        )
        cv_pdf = render_cv_pdf(tailored, template_key=profile.cv_template or "classic")
        store_generated_document(
            db, job.id, target_user_id, cv_pdf,
            original_filename=f"Lebenslauf_{_safe(job.company)}.pdf",
            mime_type="application/pdf", kind="GENERATED_CV", storage=storage,
        )

        # --- 2. Cover letter (OpenRouter) ---
        letter_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=(job.description or "")[:10000],
            profile_role=profile.role,
            cv_text=format_cv_for_prompt(profile.cv_data),
            user_language=language,
            model=get_model(db),
            api_key=get_api_key(db),
        )
        job.application_draft = letter_text  # keep for the existing iteration UI
        letter_pdf = render_cover_letter_pdf(
            letter_markdown=letter_text,
            template_key=profile.cover_letter_template or "classic",
            sender_name=candidate_name,
            company=job.company or "",
        )
        store_generated_document(
            db, job.id, target_user_id, letter_pdf,
            original_filename=f"Anschreiben_{_safe(job.company)}.pdf",
            mime_type="application/pdf", kind="GENERATED_LETTER", storage=storage,
        )

        # --- 3. Profile documents (optional, whole set) ---
        if include_profile_documents:
            pdocs = db.query(ProfileDocument).filter(
                ProfileDocument.user_id == target_user_id
            ).all()
            for pd in pdocs:
                if pd.content is None:
                    continue  # only DB-stored blobs can be copied for MVP
                store_generated_document(
                    db, job.id, target_user_id, pd.content,
                    original_filename=pd.original_filename,
                    mime_type=pd.mime_type or "application/octet-stream",
                    kind=_ATTACH_KIND.get(pd.doc_type, "ATTACHED_CERT"),
                    storage=storage,
                )

        job.status = "DRAFTED"
        db.commit()
        _publish(r, job, "DRAFTED", application_draft=job.application_draft)
        logger.info(f"Application package for job {job_id} complete.")

    except Exception as e:
        logger.error(f"Package generation failed for job {job_id}: {e}", exc_info=True)
        db.rollback()
        try:
            job = db.query(JobEntry).filter(JobEntry.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.generation_error = str(e)
                db.commit()
                _publish(r, job, "FAILED", error=str(e))
        except Exception as db_e:
            logger.error(f"Failed to persist FAILED status: {db_e}")
    finally:
        db.close()


def _safe(value):
    cleaned = "".join(c for c in (value or "Job") if c.isalnum() or c in " -_")
    return cleaned.replace(" ", "_") or "Job"
```

- [ ] **Step 2: Register the task in the worker aggregator**

In `server/workers/worker.py`, alongside the other task re-exports, add:

```python
from workers.tasks.package import generate_application_package_task  # noqa: F401
```

(Match the existing import/re-export style in that file. Confirm by reading the surrounding lines first.)

- [ ] **Step 3: Verify the task imports cleanly**

Run: `cd server && python -c "import workers.worker as w; print(w.generate_application_package_task.name)"`
Expected: prints `ai.generate_application_package` (no import errors).

- [ ] **Step 4: Commit**

```bash
git add server/workers/tasks/package.py server/workers/worker.py
git commit -m "feat: add sequential application-package generation task"
```

---

## Task 8: Profile documents router (CRUD + view/download + templates list)

Mirror the job-documents endpoints in `routers/jobs.py:706-908` but scoped to the user's profile.

**Files:**
- Create: `server/routers/profile_documents.py`
- Modify: `server/main.py` (register router)

- [ ] **Step 1: Implement the router**

Create `server/routers/profile_documents.py`:

```python
"""Profile-wide document store (references / certificates) + template listing."""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response

from database.core import SessionLocal, ProfileDocument, UserProfile, User
from routers.deps import get_current_user
from services.storage import get_storage_service
from services.document_renderer import list_templates
from core.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
VALID_TYPES = {"REFERENCE", "CERTIFICATE"}


def _serialize(d: ProfileDocument) -> dict:
    return {
        "id": d.id,
        "doc_type": d.doc_type,
        "label": d.label,
        "original_filename": d.original_filename,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/profile/templates")
def get_templates(current_user: User = Depends(get_current_user)):
    return list_templates()


@router.get("/profile/documents")
def list_profile_documents(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        docs = (
            db.query(ProfileDocument)
            .filter(ProfileDocument.user_id == current_user.id)
            .order_by(ProfileDocument.created_at.desc())
            .all()
        )
        return [_serialize(d) for d in docs]
    finally:
        db.close()


@router.post("/profile/documents")
async def upload_profile_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    label: str = Form(""),
    current_user: User = Depends(get_current_user),
):
    if doc_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")
    db = SessionLocal()
    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
        mime = file.content_type or "application/octet-stream"
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=415, detail=f"File type not allowed: {mime}")

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        storage = get_storage_service(profile) if profile else None
        if storage:
            ok = await storage.upload_file(content, file.filename or "document", mime_type=mime)
            if not ok:
                raise HTTPException(status_code=500, detail="Upload to Google Drive failed")
            stored_filename, db_content = f"gdrive://{file.filename}", None
        else:
            stored_filename, db_content = f"db://{file.filename}", content

        doc = ProfileDocument(
            user_id=current_user.id,
            doc_type=doc_type,
            label=label or (file.filename or ""),
            filename=stored_filename,
            original_filename=file.filename or "document",
            file_size=len(content),
            mime_type=mime,
            content=db_content,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return _serialize(doc)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Profile document upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/profile/documents/{doc_id}")
def delete_profile_document(doc_id: int, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        doc = (
            db.query(ProfileDocument)
            .filter(ProfileDocument.id == doc_id, ProfileDocument.user_id == current_user.id)
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        db.delete(doc)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()


@router.get("/profile/documents/{doc_id}/download")
def download_profile_document(doc_id: int, current_user: User = Depends(get_current_user)):
    return _serve(doc_id, current_user, disposition="attachment")


@router.get("/profile/documents/{doc_id}/view")
def view_profile_document(doc_id: int, current_user: User = Depends(get_current_user)):
    return _serve(doc_id, current_user, disposition="inline")


def _serve(doc_id: int, current_user: User, disposition: str):
    db = SessionLocal()
    try:
        doc = (
            db.query(ProfileDocument)
            .filter(ProfileDocument.id == doc_id, ProfileDocument.user_id == current_user.id)
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        if not doc.filename.startswith("db://") or doc.content is None:
            raise HTTPException(status_code=400, detail="File not available for direct download")
        return Response(
            content=doc.content,
            media_type=doc.mime_type or "application/octet-stream",
            headers={"Content-Disposition": f'{disposition}; filename="{doc.original_filename}"'},
        )
    finally:
        db.close()
```

> Confirm `get_current_user` is importable from `routers.deps` (it is used across routers). If it lives elsewhere, match the import used in `routers/jobs.py`.

- [ ] **Step 2: Register the router in `main.py`**

In `server/main.py`, add to the import line (line 21):

```python
from routers import jobs, platforms, settings, companies, admin, dashboard, websocket, storage, profile_documents
```

And after `app.include_router(storage.router)` (line 128):

```python
app.include_router(profile_documents.router)
```

- [ ] **Step 3: Verify app imports**

Run: `cd server && python -c "import main; print('ok')"`
Expected: prints `ok` (no import errors). If DB connection is attempted at import, run with the stack up or set `DATABASE_URL` to a reachable dev DB.

- [ ] **Step 4: Commit**

```bash
git add server/routers/profile_documents.py server/main.py
git commit -m "feat: add profile documents router (CRUD, view/download, templates)"
```

---

## Task 9: Persist template selection in settings

> **Note:** Ollama server URL and model name are already configurable via Admin → Settings (`/admin/settings`). Task 9 only covers the user-level CV/cover-letter template selection.

**Files:**
- Modify: `server/routers/settings.py` (`SettingsData` ~line 236; `save_settings` ~line 149; `get_settings` ~line 123)

- [ ] **Step 1: Add fields to `SettingsData`**

In `class SettingsData` (after `timezone`, ~line 259) add:

```python
    cv_template: Optional[str] = None
    cover_letter_template: Optional[str] = None
```

- [ ] **Step 2: Persist them in `save_settings`**

In `save_settings`, where other fields are assigned to `profile` (near `profile.cv_data = settings.cv_data.dict()`), add:

```python
        if settings.cv_template is not None:
            profile.cv_template = settings.cv_template
        if settings.cover_letter_template is not None:
            profile.cover_letter_template = settings.cover_letter_template
```

- [ ] **Step 3: Return them in `get_settings`**

In `get_settings`, include them in the returned profile dict (match the existing return shape — add keys):

```python
            "cv_template": profile.cv_template or "classic",
            "cover_letter_template": profile.cover_letter_template or "classic",
```

(Read the `get_settings` return block first and insert keys consistently.)

- [ ] **Step 4: Verify import**

Run: `cd server && python -c "import routers.settings; print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/routers/settings.py
git commit -m "feat: persist CV/cover-letter template selection in profile settings"
```

---

## Task 10: Package endpoints + submission hook

**Files:**
- Create: `server/services/submission.py`
- Modify: `server/routers/jobs.py` (add endpoints near `trigger_generation` ~line 230; reuse `celery_app`, `GenerateRequest` patterns)

- [ ] **Step 1: Add the SubmissionAdapter placeholder**

Create `server/services/submission.py`:

```python
"""Placeholder for future online-submission adapters.

Automated online submission to job boards is explicitly OUT OF SCOPE
(see context/project-overview.md). This interface exists only so a future
implementation can plug in without touching the package-generation flow.
"""


class SubmissionAdapter:
    def submit(self, job, profile, documents) -> dict:
        raise NotImplementedError("Online submission is out of scope.")
```

- [ ] **Step 2: Add the request model + endpoints in `jobs.py`**

In `server/routers/jobs.py`, add a request model near the other Pydantic models (top of file where `GenerateRequest` is defined):

```python
class GeneratePackageRequest(BaseModel):
    include_profile_documents: bool = True
```

Then add endpoints after `trigger_generation` (~line 252):

```python
@router.post("/jobs/{job_id}/generate-package")
@limiter.limit("5/minute")
def trigger_package_generation(
    request: Request,
    job_id: str,
    body: Optional[GeneratePackageRequest] = None,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        job = (
            db.query(JobEntry)
            .filter(JobEntry.id == job_id, JobEntry.user_id == current_user.id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job.status = "GENERATING"
        db.commit()
        include_docs = body.include_profile_documents if body else True
        celery_app.send_task(
            "ai.generate_application_package",
            args=[job_id, current_user.id, include_docs],
            queue="ai_queue",
        )
        return {"status": "started"}
    finally:
        db.close()


@router.post("/jobs/{job_id}/submit-application")
def submit_application(job_id: str, current_user: User = Depends(get_current_user)):
    # Out of scope: automated online submission. Hook only.
    raise HTTPException(
        status_code=501,
        detail="Online submission is not implemented (out of scope).",
    )
```

> Confirm `BaseModel`, `celery_app`, `limiter`, `JobEntry`, `User`, `SessionLocal`, `get_current_user` are already imported in `jobs.py` (they are, per existing endpoints).

- [ ] **Step 3: Verify import**

Run: `cd server && python -c "import routers.jobs; print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add server/services/submission.py server/routers/jobs.py
git commit -m "feat: add generate-package endpoint and out-of-scope submission hook"
```

---

## Task 11: Frontend — profile documents + template selection

No frontend test framework exists; verify via build + manual check.

**Files:**
- Modify: `frontend/app/profile/page.tsx`

- [ ] **Step 1: Read the current profile page**

Read `frontend/app/profile/page.tsx` to learn its layout, the `fetchWithAuth` import, how settings are saved (the `POST /settings` body), and the section/card styling used. Reuse the upload/list/delete UI pattern from `frontend/app/components/JobCard/JobDocumentsTab.tsx` (drag-drop, `formatBytes`, viewer).

- [ ] **Step 2: Add a "Bewerbungsunterlagen" section**

Add a section with two upload areas — **Arbeitszeugnisse** (`doc_type=REFERENCE`) and **Zertifikate** (`doc_type=CERTIFICATE`). Upload uses `multipart/form-data` with fields `file`, `doc_type`, `label`:

```tsx
const uploadProfileDoc = async (file: File, docType: "REFERENCE" | "CERTIFICATE") => {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  form.append("label", file.name);
  const res = await fetchWithAuth(`/profile/documents`, { method: "POST", body: form });
  if (res.ok) await loadProfileDocs();
};

const loadProfileDocs = async () => {
  const res = await fetchWithAuth(`/profile/documents`);
  if (res.ok) setProfileDocs(await res.json());
};

const deleteProfileDoc = async (id: number) => {
  const res = await fetchWithAuth(`/profile/documents/${id}`, { method: "DELETE" });
  if (res.ok) setProfileDocs((prev) => prev.filter((d) => d.id !== id));
};
```

Render two lists filtered by `doc_type`, each with its own drop zone and a delete button per item (model the markup on `JobDocumentsTab.tsx`). Call `loadProfileDocs()` in a `useEffect`.

- [ ] **Step 3: Add template selection dropdowns**

Fetch `GET /profile/templates` → `{cv: string[], cover_letter: string[]}`. Render two `<select>`s bound to `cv_template` and `cover_letter_template`, and include both keys in the existing `POST /settings` save body.

```tsx
const [templates, setTemplates] = useState<{cv: string[]; cover_letter: string[]}>({cv: [], cover_letter: []});
useEffect(() => {
  fetchWithAuth(`/profile/templates`).then((r) => r.ok && r.json().then(setTemplates));
}, []);
```

- [ ] **Step 4: Build the frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds (no type errors). Fix any TS issues in the new code.

- [ ] **Step 5: Manual verification**

Start the stack, open `/profile`: upload a PDF as Arbeitszeugnis and one as Zertifikat, confirm they list and delete; change templates and save; reload and confirm persistence.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/profile/page.tsx
git commit -m "feat: profile document uploads (references/certificates) and template selection"
```

---

## Task 12: Frontend — package CTA on the job card

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Read the current application tab**

Read `frontend/app/components/JobCard/JobApplicationTab.tsx` to see how the existing "generate cover letter" action and status (`GENERATING`/`DRAFTED`/`FAILED`) are wired, and how WS job updates flow into the card.

- [ ] **Step 2: Add the package CTA + include-docs toggle**

Add a primary action "Bewerbungspaket erstellen" visible when `job.status === "OPEN"`, a checkbox "Profil-Dokumente beilegen" (default checked), and after success a secondary "Online bewerben" button:

```tsx
const [includeDocs, setIncludeDocs] = useState(true);

const generatePackage = async () => {
  const res = await fetchWithAuth(`/jobs/${job.id}/generate-package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ include_profile_documents: includeDocs }),
  });
  if (!res.ok) showError(`POST /jobs/${job.id}/generate-package → HTTP ${res.status}`);
  // Status flips to GENERATING then DRAFTED via the existing WS job_update handler.
};

const submitOnline = async () => {
  const res = await fetchWithAuth(`/jobs/${job.id}/submit-application`, { method: "POST" });
  if (res.status === 501) showError("Online-Bewerbung ist noch nicht verfügbar (out of scope).");
};
```

Wire `generatePackage` to the new button (disabled while `GENERATING`), the toggle to `includeDocs`, and show the "Online bewerben" button when `job.status === "DRAFTED"`. The generated PDFs appear automatically in the existing Documents tab (`JobDocumentsTab`).

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification (end-to-end)**

With the full stack up and an Ollama model pulled: open a job, click "Bewerbungspaket erstellen", watch status go `GENERATING → DRAFTED`, then open the Documents tab and confirm `Lebenslauf_*.pdf`, `Anschreiben_*.pdf`, and (if toggle on) the profile documents are present and openable. Click "Online bewerben" → expect the 501 info message.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/JobCard/JobApplicationTab.tsx
git commit -m "feat: add application-package CTA and online-apply hook to job card"
```

---

## Task 13: Update context documentation

**Files:**
- Modify: `context/progress-tracker.md`
- Modify: `context/architecture.md` (Boundary Map + Data layer)

- [ ] **Step 1: Update the progress tracker**

In `context/progress-tracker.md`, set the current status/goal to reflect the application-package feature, and add a Status Board row:

```markdown
| **Application Package** | ✅ Completed (`workers/tasks/package.py`, `routers/profile_documents.py`) | Ein-Klick CV (Ollama lokal) + Anschreiben (OpenRouter) → PDF, optional Profil-Dokumente. Online-Submit out-of-scope (Hook). |
```

- [ ] **Step 2: Update architecture notes**

In `context/architecture.md`: add `ProfileDocument` to the Data layer, note that the Ollama/LM Studio service runs locally on the host (default `http://localhost:11434/v1`, overridable via `OLLAMA_BASE_URL` env var), and add `services/document_renderer.py`, `services/job_documents.py`, `workers/tasks/package.py`, `routers/profile_documents.py` to the Boundary Map.

- [ ] **Step 3: Run the full test suite**

Run: `cd server && python -m pytest -v`
Expected: all tests pass (Tasks 1,2,4,5,6 suites green).

- [ ] **Step 4: Commit**

```bash
git add context/progress-tracker.md context/architecture.md
git commit -m "docs: update context for application-package feature"
```

---

## Notes & Risks

- **Ollama performance/availability:** the CV step depends on a pulled model; `generate_tailored_cv` degrades gracefully to the untailored CV on any Ollama error, so the package still completes.
- **Google Drive attachments:** profile documents stored on Drive (`gdrive://`, `content is None`) are skipped when copying into a package for MVP (Drive download is not implemented — matches the existing limitation in `routers/jobs.py:830-832`). Documented in Task 8.
- **xhtml2pdf CSS limits:** templates use simple, table-friendly CSS only (no flexbox/grid).
- **Cover letter `.txt` auto-upload:** the legacy `.txt` upload in `workers/tasks/application.py` is unchanged; the package task produces a proper PDF instead. The on-demand cover-letter endpoint remains for iterative refinement.
