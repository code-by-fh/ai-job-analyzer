# AI Task Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to configure per-task which AI provider (local LLM or OpenRouter cloud) is used for each of the 8 AI operations.

**Architecture:** A JSON column `ai_task_routing` in `system_settings` stores a `{task_key: "local"|"cloud"}` map. A new helper `get_client_and_model(task_name, db)` in `service.py` returns the right `(client, model)` tuple. Each worker task and service function is updated to use this helper instead of hardcoding the provider.

**Tech Stack:** SQLAlchemy (JSON column), Alembic migration, FastAPI, React/TypeScript (admin settings page)

---

## File Map

| File | Change |
|---|---|
| `server/database/core.py` | Add `ai_task_routing` JSON column to `SystemSettings` |
| `server/database/migrations/versions/m5e6f7a8b9c0_add_ai_task_routing.py` | New Alembic migration |
| `server/intelligence/service.py` | Add `TASK_DEFAULTS`, `get_task_provider()`, `get_client_and_model()`; add optional `client` param to all 8 service functions |
| `server/routers/admin.py` | Expose `ai_task_routing` in GET + POST `/admin/settings` |
| `server/workers/tasks/analyze.py` | Use `get_client_and_model("job_analysis", db)` |
| `server/workers/tasks/application.py` | Use `get_client_and_model("cover_letter", db)` |
| `server/workers/tasks/package.py` | Use `get_client_and_model` for both `"cv_tailoring"` and `"cover_letter"` |
| `server/workers/tasks/research.py` | Use `get_client_and_model` for `"interview_prep"` and `"company_profile"` |
| `server/routers/jobs.py` | Use `get_client_and_model` for `"extract_job_details"` and `"platform_name"` |
| `frontend/app/admin/settings/page.tsx` | Add "AI Routing" section with per-task dropdowns |

---

## Task 1: DB Model + Migration

**Files:**
- Modify: `server/database/core.py`
- Create: `server/database/migrations/versions/m5e6f7a8b9c0_add_ai_task_routing.py`

- [ ] **Step 1: Add column to model**

In `server/database/core.py`, add the import and column to `SystemSettings`:

```python
# top of file — add JSON to imports if not present
from sqlalchemy import Column, Integer, String, JSON
```

```python
class SystemSettings(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True)
    openrouter_model = Column(String, default="tngtech/deepseek-r1t2-chimera:free")
    openrouter_api_key = Column(String, nullable=True)
    ollama_model = Column(String, nullable=True, default="llama3.1:8b")
    ollama_base_url = Column(String, nullable=True)
    ai_task_routing = Column(JSON, nullable=True, default=dict)
```

- [ ] **Step 2: Write migration**

Create `server/database/migrations/versions/m5e6f7a8b9c0_add_ai_task_routing.py`:

```python
"""add ai_task_routing to system_settings

Revision ID: m5e6f7a8b9c0
Revises: l4d5e6f7a8b9
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa

revision = "m5e6f7a8b9c0"
down_revision = "l4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "system_settings",
        sa.Column("ai_task_routing", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("system_settings", "ai_task_routing")
```

- [ ] **Step 3: Run migration**

```bash
cd server
alembic upgrade head
```

Expected output ends with: `Running upgrade l4d5e6f7a8b9 -> m5e6f7a8b9c0, add ai_task_routing to system_settings`

- [ ] **Step 4: Commit**

```bash
git add server/database/core.py server/database/migrations/versions/m5e6f7a8b9c0_add_ai_task_routing.py
git commit -m "feat(db): add ai_task_routing JSON column to system_settings"
```

---

## Task 2: Routing Helpers in service.py

**Files:**
- Modify: `server/intelligence/service.py`

- [ ] **Step 1: Add TASK_DEFAULTS and get_task_provider**

In `server/intelligence/service.py`, add after the `AI_404_REDIS_KEY` constant:

```python
TASK_DEFAULTS: dict[str, str] = {
    "job_analysis": "cloud",
    "cover_letter": "cloud",
    "cv_tailoring": "local",
    "interview_prep": "cloud",
    "company_profile": "cloud",
    "deep_dive": "cloud",
    "extract_job_details": "cloud",
    "platform_name": "cloud",
}


def get_task_provider(task_name: str, db=None) -> str:
    """Return 'local' or 'cloud' for the given task, consulting DB routing config."""
    try:
        if db:
            from database.core import SystemSettings
            settings = db.query(SystemSettings).first()
            if settings and settings.ai_task_routing:
                routing = settings.ai_task_routing
                if task_name in routing:
                    return routing[task_name]
    except Exception:
        pass
    return TASK_DEFAULTS.get(task_name, "cloud")


def get_client_and_model(task_name: str, db=None):
    """Return (client, model) for the given task based on routing config."""
    provider = get_task_provider(task_name, db)
    if provider == "local":
        return get_ollama_client(db), get_ollama_model(db)
    return get_ai_client(db=db), get_model(db)
```

- [ ] **Step 2: Add optional `client` param to analyze_job**

Replace the function signature and client creation:

```python
def analyze_job(
    job_title: str,
    job_description: str,
    profile_str: str,
    user_language: str = "de",
    model: str = None,
    api_key: str = None,
    client=None,
) -> dict:
    if client is None:
        client = get_ai_client(api_key)
    # rest of function unchanged — replace `client = get_ai_client(api_key)` line
```

- [ ] **Step 3: Add optional `client` param to generate_application**

```python
def generate_application(
    job_title: str,
    job_company: str,
    job_description: str,
    profile_role: str,
    cv_text: str,
    user_language: str = "de",
    model: str = None,
    api_key: str = None,
    improvement_notes: str = None,
    existing_draft: str = None,
    candidate_name: str = "",
    candidate_location: str = "",
    candidate_skills: str = "",
    candidate_languages: Optional[list] = None,
    candidate_preferences: str = "",
    client=None,
) -> str:
    if client is None:
        client = get_ai_client(api_key)
    # rest of function unchanged
```

- [ ] **Step 4: Add optional `client` param to generate_interview_prep**

```python
def generate_interview_prep(
    job_title: str,
    company_name: str,
    job_description: str,
    cv_summary: str,
    company_culture: Optional[str] = None,
    model: str = None,
    api_key: str = None,
    language: str = "de",
    client=None,
) -> Dict[str, Any]:
    if client is None:
        client = get_ai_client(api_key=api_key)
    # rest of function unchanged
```

- [ ] **Step 5: Add optional `client` param to generate_company_profile_summary**

```python
def generate_company_profile_summary(
    company_name: str,
    job_title: str = "",
    industry: str = "",
    key_requirements: str = "",
    user_profile: str = "",
    model: str = None,
    api_key: str = None,
    client=None,
) -> Dict[str, Any]:
    if not model:
        model = get_model()
    if client is None:
        client = get_ai_client(api_key=api_key)
    # rest of function unchanged
```

- [ ] **Step 6: Add optional `client` param to generate_deep_dive**

```python
def generate_deep_dive(
    domain: str,
    company_name: str,
    focus: str,
    how_to_proceed: str,
    model: str = None,
    api_key: str = None,
    language: str = "de",
    client=None,
) -> str:
    if not model:
        model = get_model()
    if client is None:
        client = get_ai_client(api_key=api_key)
    # rest of function unchanged
```

- [ ] **Step 7: Add optional `client` param to extract_job_details**

```python
def extract_job_details(
    text: str, model: str = None, api_key: str = None, language: str = "de", client=None
) -> str:
    if not text:
        return ""
    if client is None:
        client = get_ai_client(api_key)
    # rest of function unchanged
```

- [ ] **Step 8: Add optional `client` param to generate_platform_name**

```python
def generate_platform_name(
    url: str, db: Any = None, model: str = None, api_key: str = None, client=None
) -> str:
    domain = urlparse(url).netloc.replace("www.", "")
    if client is None:
        client = get_ai_client(api_key, db=db)
    model_to_use = model or get_model(db=db)
    # rest of function unchanged (remove the `client = get_ai_client(...)` line inside)
```

- [ ] **Step 9: Update generate_tailored_cv to accept optional client**

```python
def generate_tailored_cv(
    cv_data: dict,
    job_title: str,
    job_description: str,
    candidate_name: str = "",
    candidate_role: str = "",
    language: str = "de",
    model: str = None,
    db=None,
    skills: str = "",
    spoken_languages: Optional[list] = None,
    location: str = "",
    cv_notes: str = "",
    client=None,
) -> dict:
    # ... existing base setup code unchanged ...
    if client is None:
        client = get_ollama_client(db)
    # rest of function unchanged (remove `client = get_ollama_client(db)` line inside)
```

- [ ] **Step 10: Verify no import errors**

```bash
cd server
python -c "from intelligence.service import get_client_and_model, get_task_provider, TASK_DEFAULTS; print('OK')"
```

Expected: `OK`

- [ ] **Step 11: Commit**

```bash
git add server/intelligence/service.py
git commit -m "feat(ai): add per-task routing helpers and optional client params"
```

---

## Task 3: Update Worker Tasks

**Files:**
- Modify: `server/workers/tasks/analyze.py`
- Modify: `server/workers/tasks/application.py`
- Modify: `server/workers/tasks/package.py`
- Modify: `server/workers/tasks/research.py`

- [ ] **Step 1: Update analyze.py**

In `server/workers/tasks/analyze.py`, update the import:

```python
from intelligence.service import get_client_and_model, format_cv_for_prompt, analyze_job
```

Replace the lines around `model = get_model(db)` / `api_key = get_api_key(db)` with:

```python
client, model = get_client_and_model("job_analysis", db)
data = analyze_job(
    job_title=job_data["title"],
    job_description=job_data["description"][:10000],
    profile_str=profile_str,
    user_language=user_language,
    model=model,
    client=client,
)
```

(Remove the `api_key = get_api_key(db)` line and the `api_key=api_key` kwarg from the `analyze_job` call.)

- [ ] **Step 2: Update application.py**

In `server/workers/tasks/application.py`, update the import:

```python
from intelligence.service import get_client_and_model, format_cv_for_prompt, generate_application
```

Replace `model = get_model(db)` / `api_key = get_api_key(db)` with:

```python
client, model = get_client_and_model("cover_letter", db)
```

Add `client=client` to the `generate_application(...)` call, remove `api_key=api_key`.

- [ ] **Step 3: Update package.py**

In `server/workers/tasks/package.py`, update the import:

```python
from intelligence.service import (
    get_client_and_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
)
```

Replace the CV tailoring block (was using `get_ollama_model(db)`):

```python
cv_client, cv_model = get_client_and_model("cv_tailoring", db)
cv_data = generate_tailored_cv(
    cv_data=profile.cv_data,
    job_title=job.title,
    job_description=job.description or "",
    candidate_name=candidate_name,
    candidate_role=profile.role,
    language=language,
    model=cv_model,
    db=db,
    skills=profile.skills or "",
    spoken_languages=profile.spoken_languages or [],
    location=profile.location or "",
    cv_notes=cv_notes or "",
    client=cv_client,
)
```

Replace the cover letter block (was using `get_model(db)` / `get_api_key(db)`):

```python
letter_client, letter_model = get_client_and_model("cover_letter", db)
letter_text = generate_application(
    job_title=job.title,
    job_company=job.company,
    job_description=job.description or "",
    profile_role=profile.role,
    cv_text=format_cv_for_prompt(profile.cv_data),
    user_language=language,
    model=letter_model,
    client=letter_client,
    candidate_name=candidate_name,
    # ... keep all other existing kwargs unchanged
)
```

- [ ] **Step 4: Update research.py**

In `server/workers/tasks/research.py`, update the import:

```python
from intelligence.service import get_client_and_model, format_cv_for_prompt
```

In `generate_interview_prep_task`, replace `model = get_model(db)` / `api_key = get_api_key(db)` with:

```python
client, model = get_client_and_model("interview_prep", db)
prep_data = generate_interview_prep(
    ...,  # existing kwargs unchanged
    model=model,
    client=client,
)
```

In `generate_company_profile`, replace `model = get_model(db)` / `api_key = get_api_key(db)` with:

```python
client, model = get_client_and_model("company_profile", db)
profile_data = generate_company_profile_summary(
    ...,  # existing kwargs unchanged
    model=model,
    client=client,
)
```

- [ ] **Step 5: Commit**

```bash
git add server/workers/tasks/analyze.py server/workers/tasks/application.py server/workers/tasks/package.py server/workers/tasks/research.py
git commit -m "feat(workers): use get_client_and_model for per-task AI routing"
```

---

## Task 4: Update jobs.py Router

**Files:**
- Modify: `server/routers/jobs.py`

- [ ] **Step 1: Find and update extract_job_details usage**

Search for `extract_job_details` calls in `server/routers/jobs.py`:

```bash
grep -n "extract_job_details\|generate_platform_name\|get_model\|get_api_key" server/routers/jobs.py
```

Update the import to include `get_client_and_model`, then for any `extract_job_details` call replace:

```python
# before
model = get_model(db)
api_key = get_api_key(db)
result = extract_job_details(text=..., model=model, api_key=api_key, language=...)

# after
client, model = get_client_and_model("extract_job_details", db)
result = extract_job_details(text=..., model=model, client=client, language=...)
```

For any `generate_platform_name` call replace:

```python
# before
name = generate_platform_name(url=..., db=db, model=..., api_key=...)

# after
client, model = get_client_and_model("platform_name", db)
name = generate_platform_name(url=..., db=db, model=model, client=client)
```

- [ ] **Step 2: Commit**

```bash
git add server/routers/jobs.py
git commit -m "feat(jobs): use get_client_and_model for extract_job_details and platform_name"
```

---

## Task 5: Admin API

**Files:**
- Modify: `server/routers/admin.py`

- [ ] **Step 1: Update SystemSettingsUpdate model**

In `server/routers/admin.py`, add the field to the Pydantic model:

```python
from typing import Optional, Dict

class SystemSettingsUpdate(BaseModel):
    openrouter_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ai_task_routing: Optional[Dict[str, str]] = None
```

- [ ] **Step 2: Update GET /admin/settings**

Add `ai_task_routing` to both return branches (the "no settings" default and the normal return):

```python
# no-settings default:
return {
    "openrouter_model": "tngtech/deepseek-r1t2-chimera:free",
    "openrouter_api_key_set": False,
    "ollama_model": "llama3.1:8b",
    "ollama_base_url": "",
    "ai_task_routing": {},
}

# normal return:
return {
    "openrouter_model": settings.openrouter_model,
    "openrouter_api_key_set": bool(settings.openrouter_api_key),
    "ollama_model": settings.ollama_model or "llama3.1:8b",
    "ollama_base_url": settings.ollama_base_url or "",
    "ai_task_routing": settings.ai_task_routing or {},
}
```

- [ ] **Step 3: Update POST /admin/settings**

Add handling for `ai_task_routing` in the save handler, after the `ollama_base_url` block:

```python
if settings.ai_task_routing is not None:
    db_settings.ai_task_routing = settings.ai_task_routing
```

Also add it to the return dict of the POST handler:

```python
return {
    "status": "updated",
    "openrouter_model": db_settings.openrouter_model,
    "openrouter_api_key_set": bool(db_settings.openrouter_api_key),
    "ollama_model": db_settings.ollama_model or "llama3.1:8b",
    "ollama_base_url": db_settings.ollama_base_url or "",
    "ai_task_routing": db_settings.ai_task_routing or {},
}
```

- [ ] **Step 4: Commit**

```bash
git add server/routers/admin.py
git commit -m "feat(admin): expose ai_task_routing in settings GET/POST"
```

---

## Task 6: Frontend — AI Routing Section

**Files:**
- Modify: `frontend/app/admin/settings/page.tsx`

- [ ] **Step 1: Add state and constants**

In the component, add these constants above the component function (after the imports):

```typescript
const TASK_LABELS: Record<string, string> = {
  job_analysis: "Job-Analyse",
  cover_letter: "Anschreiben generieren",
  cv_tailoring: "CV-Tailoring",
  interview_prep: "Interview-Vorbereitung",
  company_profile: "Firmenprofil",
  deep_dive: "Deep-Dive-Analyse",
  extract_job_details: "Job-Details extrahieren",
  platform_name: "Platform-Name generieren",
};

const TASK_DEFAULTS: Record<string, string> = {
  job_analysis: "cloud",
  cover_letter: "cloud",
  cv_tailoring: "local",
  interview_prep: "cloud",
  company_profile: "cloud",
  deep_dive: "cloud",
  extract_job_details: "cloud",
  platform_name: "cloud",
};
```

Add state inside the component (alongside existing state declarations):

```typescript
const [taskRouting, setTaskRouting] = useState<Record<string, string>>({});
const [statusRouting, setStatusRouting] = useState("");
```

- [ ] **Step 2: Load ai_task_routing in fetchSettings**

In `fetchSettings`, after `setOllamaBaseUrl(...)`:

```typescript
setTaskRouting(data.ai_task_routing || {});
```

- [ ] **Step 3: Add save handler**

Add after `handleSaveOllama`:

```typescript
const handleSaveRouting = async (e: React.FormEvent) => {
  e.preventDefault();
  setStatusRouting("Saving...");
  try {
    const res = await fetchWithAuth(
      `${process.env.NEXT_PUBLIC_API_URL}/admin/settings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_task_routing: taskRouting }),
      },
    );
    if (res.ok) {
      setStatusRouting("Saved successfully!");
    } else {
      setStatusRouting("Error saving routing");
    }
  } catch {
    setStatusRouting("Error saving routing");
  }
  setTimeout(() => setStatusRouting(""), 3000);
};
```

- [ ] **Step 4: Add routing section to JSX**

Add a new card after the Local AI Model card (before `{/* Notification Templates */}`):

```tsx
{/* AI Task Routing */}
<div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
  <form onSubmit={handleSaveRouting} className="space-y-6">
    <div className="flex items-center gap-2 mb-3">
      <Bot className="w-4 h-4 text-amber-500" />
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        AI Task Routing
      </h3>
    </div>
    <p className="text-xs text-slate-500 dark:text-slate-500 -mt-3">
      Configure which provider handles each AI task.
    </p>

    <div className="space-y-3">
      {Object.entries(TASK_LABELS).map(([key, label]) => {
        const value = taskRouting[key] ?? TASK_DEFAULTS[key];
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700 dark:text-slate-300 min-w-0 truncate">
              {label}
            </span>
            <select
              value={value}
              onChange={(e) =>
                setTaskRouting((prev) => ({ ...prev, [key]: e.target.value }))
              }
              className="shrink-0 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
            >
              <option value="cloud">OpenRouter (Cloud)</option>
              <option value="local">Local LLM</option>
            </select>
          </div>
        );
      })}
    </div>

    <div className="flex items-center justify-between pt-2">
      <button
        type="submit"
        className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer"
      >
        Save Routing
      </button>
      {statusRouting && (
        <span
          className={`text-sm font-bold ${statusRouting.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
        >
          {statusRouting}
        </span>
      )}
    </div>
  </form>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/settings/page.tsx
git commit -m "feat(admin-ui): add AI task routing section to settings page"
```

---

## Task 7: Smoke Test

- [ ] **Step 1: Start the app and open admin settings**

Navigate to `/admin/settings`. The new "AI Task Routing" section should appear below the Local LLM card with 8 rows, each with a dropdown defaulting to their respective provider (CV-Tailoring = Local LLM, rest = OpenRouter).

- [ ] **Step 2: Change a task and save**

Switch "Job-Analyse" to "Local LLM", click "Save Routing". Confirm "Saved successfully!" appears.

- [ ] **Step 3: Reload and verify persistence**

Reload the page. "Job-Analyse" should still show "Local LLM".

- [ ] **Step 4: Verify routing in backend**

```bash
cd server
python -c "
from database.core import SessionLocal, SystemSettings
db = SessionLocal()
s = db.query(SystemSettings).first()
print(s.ai_task_routing)
db.close()
"
```

Expected: `{'job_analysis': 'local'}` (or whatever was saved).

- [ ] **Step 5: Run existing tests**

```bash
cd server
pytest --tb=short -q
```

Expected: all previously passing tests still pass (no regressions).
