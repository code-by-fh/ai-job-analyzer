# Master-CV-Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user uploads an HTML template in their profile, the AI fills it with profile data to produce a "Master CV" that serves as the base for all job-specific CV tailoring.

**Architecture:** A new Celery task fills uploaded HTML with profile data via AI and stores the result as a `DocumentTemplate` row (`doc_type="MASTER_CV"`). `user_settings` gets two new columns: `master_cv_template_id` (FK) and `master_cv_status`. The `generate_application_package_task` prefers the master CV HTML over the blank CV template when available.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Celery, OpenAI-compat client (OpenRouter/Ollama), Next.js 16 / React 19, Tailwind CSS v4.

---

## File Map

| Action | File |
|--------|------|
| Create | `server/database/migrations/versions/n6f7a8b9c0d1_add_master_cv_fields.py` |
| Modify | `server/database/core.py` — add 2 columns to `UserProfile`, 2 fields to `SettingsData` |
| Modify | `server/intelligence/prompts.py` — add `get_tailor_master_cv_for_job_messages()` |
| Modify | `server/intelligence/service.py` — add `tailor_master_cv_for_job()`, update import |
| Create | `server/workers/tasks/master_cv.py` — new Celery task |
| Modify | `server/workers/worker.py` — register new task |
| Modify | `server/routers/profile_documents.py` — add `POST /profile/cv-template` |
| Modify | `server/workers/tasks/package.py` — prefer master CV in package generation |
| Modify | `frontend/app/lib/languages.ts` — add i18n keys |
| Modify | `frontend/app/profile/page.tsx` — master CV upload UI + status indicator |

---

## Task 1: Alembic Migration

**Files:**
- Create: `server/database/migrations/versions/n6f7a8b9c0d1_add_master_cv_fields.py`

- [ ] **Step 1: Create migration file**

```python
"""add master_cv_fields to user_settings

Revision ID: n6f7a8b9c0d1
Revises: storage000001
Create Date: 2026-06-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'n6f7a8b9c0d1'
down_revision = 'storage000001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('master_cv_template_id', sa.Integer(), nullable=True))
    op.add_column('user_settings', sa.Column('master_cv_status', sa.String(), nullable=True))


def downgrade():
    op.drop_column('user_settings', 'master_cv_status')
    op.drop_column('user_settings', 'master_cv_template_id')
```

- [ ] **Step 2: Commit**

```bash
git add server/database/migrations/versions/n6f7a8b9c0d1_add_master_cv_fields.py
git commit -m "feat(db): add master_cv_template_id and master_cv_status to user_settings"
```

---

## Task 2: Database Model + Pydantic Schema

**Files:**
- Modify: `server/database/core.py`

- [ ] **Step 1: Add columns to `UserProfile` (after the `spoken_languages` column, line ~112)**

Add these two lines after `spoken_languages`:

```python
    master_cv_template_id = Column(Integer, ForeignKey("document_templates.id"), nullable=True)
    master_cv_status = Column(String, nullable=True)  # None | "processing" | "ready" | "error"
```

- [ ] **Step 2: Add fields to `SettingsData` (after `google_drive_email`, line ~298)**

```python
    master_cv_template_id: Optional[int] = None
    master_cv_status: Optional[str] = None
```

- [ ] **Step 3: Verify no import missing** — `Integer`, `ForeignKey`, `String` are already imported at the top of `core.py`.

- [ ] **Step 4: Commit**

```bash
git add server/database/core.py
git commit -m "feat(db): add master_cv columns to UserProfile model and SettingsData schema"
```

---

## Task 3: AI Prompt + Service Function

**Files:**
- Modify: `server/intelligence/prompts.py`
- Modify: `server/intelligence/service.py`

- [ ] **Step 1: Add `get_tailor_master_cv_for_job_messages` to `prompts.py` (append at end of file)**

```python
def get_tailor_master_cv_for_job_messages(
    master_cv_html: str,
    job_title: str,
    job_description: str,
    language: str = "de",
    cv_notes: str = "",
) -> List[Dict[str, str]]:
    lang_note = "Schreibe auf Deutsch." if language == "de" else "Write in English."
    notes_section = f"\n\nIMPROVEMENT NOTES:\n{cv_notes}" if cv_notes else ""
    system = (
        "You are a professional CV editor. You receive an already-filled HTML CV and a job posting. "
        "Your task: adapt the CV specifically for this job.\n\n"
        "WHAT TO CHANGE:\n"
        "- Professional summary / 'about me' section: rewrite to target the specific position and employer\n"
        "- Descriptions of experience entries: emphasize aspects relevant to the job requirements\n"
        "- Skills section: reorder to put the most relevant skills first\n\n"
        "WHAT NOT TO CHANGE:\n"
        "- Employer names, dates, job titles, education facts\n"
        "- HTML structure, tags, attributes, CSS classes, inline styles\n"
        "- Contact details, name, location\n\n"
        "STRICT RULES:\n"
        "- Keep ALL HTML tags, attributes, CSS classes, and inline styles EXACTLY unchanged\n"
        "- Only replace visible TEXT content inside elements\n"
        "- Do NOT invent employers, dates, or skills not present in the CV\n"
        "- Return ONLY the complete HTML document, no markdown fences, no explanations\n"
        f"{lang_note}"
    )
    user = (
        f"JOB POSTING:\nTitle: {job_title}\nDescription:\n{job_description[:4000]}"
        f"{notes_section}\n\n"
        f"HTML CV TO ADAPT:\n{master_cv_html}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
```

- [ ] **Step 2: Add `tailor_master_cv_for_job` to `service.py`**

First add `get_tailor_master_cv_for_job_messages` to the import at the top of `service.py`:

```python
from intelligence.prompts import (
    get_generate_platform_name_messages,
    get_analyze_job_messages,
    get_generate_application_messages,
    get_interview_prep_messages,
    get_company_profile_summary_messages,
    get_extract_job_details_messages,
    get_deep_dive_messages,
    get_tailored_cv_messages,
    get_fill_html_cv_messages,
    get_tailor_master_cv_for_job_messages,
)
```

Then append this function at the end of `service.py`:

```python
def tailor_master_cv_for_job(
    master_cv_html: str,
    job_title: str,
    job_description: str,
    language: str = "de",
    cv_notes: str = "",
    model: str = None,
    db=None,
    client=None,
) -> str:
    """Adapt an already-filled master CV HTML for a specific job posting."""
    if client is None:
        client, model = get_client_and_model("cv_tailoring", db)

    messages = get_tailor_master_cv_for_job_messages(
        master_cv_html, job_title, job_description, language, cv_notes
    )
    try:
        response = _call_openrouter(
            client=client,
            model=model or get_ollama_model(db),
            messages=messages,
            temperature=0.1,
            func_name="tailor_master_cv_for_job",
        )
        content = response.choices[0].message.content.strip()
        content = re.sub(r"^```(?:html)?\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
        return content
    except Exception as e:
        logger.error(f"tailor_master_cv_for_job failed, returning master CV unchanged: {e}")
        return master_cv_html
```

- [ ] **Step 3: Commit**

```bash
git add server/intelligence/prompts.py server/intelligence/service.py
git commit -m "feat(ai): add tailor_master_cv_for_job prompt and service function"
```

---

## Task 4: Celery Task for Master CV Generation

**Files:**
- Create: `server/workers/tasks/master_cv.py`

- [ ] **Step 1: Create the task file**

```python
"""Celery task: fill an uploaded HTML template with profile data to produce the master CV."""

from core.celery_config import celery_app
from core.logger import get_logger
from database.core import SessionLocal, DocumentTemplate, UserProfile, User
from intelligence.service import get_client_and_model, fill_html_cv_with_ai

logger = get_logger(__name__)


@celery_app.task(name="ai.generate_master_cv")
def generate_master_cv_task(template_id: int, user_id: int):
    logger.info(f"[TASK] generate_master_cv template={template_id} user={user_id}")
    db = SessionLocal()
    try:
        template = db.query(DocumentTemplate).filter(
            DocumentTemplate.id == template_id,
            DocumentTemplate.doc_type == "MASTER_CV",
            DocumentTemplate.user_id == user_id,
        ).first()
        if not template:
            logger.error(f"Master CV template {template_id} not found for user {user_id}")
            return

        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            logger.error(f"Profile not found for user {user_id}")
            return

        user = db.query(User).filter(User.id == user_id).first()
        cv_data = dict(profile.cv_data or {})
        cv_data.setdefault("experience", [])
        cv_data.setdefault("projects", [])
        cv_data.setdefault("education", "")
        cv_data["name"] = user.username if user else ""
        cv_data["role"] = profile.role or ""
        cv_data["skills"] = profile.skills or ""
        cv_data["location"] = profile.location or ""
        if profile.spoken_languages:
            cv_data["spoken_languages"] = profile.spoken_languages

        language = getattr(profile, "language", "de") or "de"
        client, model = get_client_and_model("cv_tailoring", db)
        filled_html = fill_html_cv_with_ai(
            template.html, cv_data, language,
            model=model, client=client,
        )

        old_master_id = profile.master_cv_template_id

        template.html = filled_html
        profile.master_cv_template_id = template_id
        profile.master_cv_status = "ready"
        db.commit()

        if old_master_id and old_master_id != template_id:
            old = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == old_master_id,
                DocumentTemplate.doc_type == "MASTER_CV",
                DocumentTemplate.user_id == user_id,
            ).first()
            if old:
                db.delete(old)
                db.commit()

        logger.info(f"generate_master_cv complete template={template_id} user={user_id}")

    except Exception as e:
        logger.error(f"generate_master_cv_task failed: {e}", exc_info=True)
        db.rollback()
        try:
            tmpl = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == template_id,
                DocumentTemplate.user_id == user_id,
            ).first()
            if tmpl:
                db.delete(tmpl)
            prof = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            if prof:
                prof.master_cv_status = "error"
            db.commit()
        except Exception as cleanup_e:
            logger.error(f"generate_master_cv cleanup failed: {cleanup_e}")
    finally:
        db.close()
```

- [ ] **Step 2: Register task in `worker.py`** — add after the `package` import line:

```python
from workers.tasks.master_cv import generate_master_cv_task  # noqa: F401
```

- [ ] **Step 3: Commit**

```bash
git add server/workers/tasks/master_cv.py server/workers/worker.py
git commit -m "feat(worker): add generate_master_cv_task Celery task"
```

---

## Task 5: Upload Endpoint

**Files:**
- Modify: `server/routers/profile_documents.py`

- [ ] **Step 1: Add import for `DocumentTemplate`**

At the top of `profile_documents.py`, `DocumentTemplate` is not yet imported. Add it to the existing import from `database.core`:

```python
from database.core import ProfileDocument, UserProfile, User, DocumentTemplate
```

- [ ] **Step 2: Add the endpoint** (append to end of file)

```python
@router.post("/profile/cv-template")
async def upload_master_cv_template(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    try:
        html = content.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="File must be a valid UTF-8 HTML document")

    try:
        template = DocumentTemplate(
            user_id=current_user.id,
            doc_type="MASTER_CV",
            name=file.filename or "Master CV",
            html=html,
            is_admin=False,
        )
        db.add(template)
        db.flush()

        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if profile:
            profile.master_cv_status = "processing"
        db.commit()

        from workers.tasks.master_cv import generate_master_cv_task
        generate_master_cv_task.delay(template.id, current_user.id)

        return {"status": "processing", "template_id": template.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Master CV template upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 3: Commit**

```bash
git add server/routers/profile_documents.py
git commit -m "feat(api): add POST /profile/cv-template endpoint for master CV upload"
```

---

## Task 6: Prefer Master CV in Package Generation

**Files:**
- Modify: `server/workers/tasks/package.py`

- [ ] **Step 1: Update `generate_application_package_task` to prefer master CV**

In `generate_application_package_task` (around line 213), replace:

```python
        cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
```

with:

```python
        if profile.master_cv_template_id:
            master_t = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == profile.master_cv_template_id,
                DocumentTemplate.doc_type == "MASTER_CV",
            ).first()
            cv_template_html = master_t.html if master_t else _resolve_template_html(db, profile.cv_template, "CV")
        else:
            cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
```

- [ ] **Step 2: Use `tailor_master_cv_for_job` when master CV is active**

Import `tailor_master_cv_for_job` at the top of `package.py`:

```python
from intelligence.service import (
    get_client_and_model,
    format_cv_for_prompt,
    generate_tailored_cv,
    generate_application,
    fill_html_cv_with_ai,
    tailor_master_cv_for_job,
)
```

Update `_build_cv` to distinguish between master CV (already filled → tailor only) and blank template (fill from scratch). Add a new `is_master_cv` boolean parameter:

```python
def _build_cv(
    cv_data_raw: dict,
    cv_template_html: str | None,
    cv_template_key: str | None,
    candidate_name: str,
    role: str,
    skills: str,
    location: str,
    spoken_languages: list,
    job_title: str,
    job_description: str,
    language: str,
    cv_client,
    cv_model: str,
    cv_notes: str = "",
    is_master_cv: bool = False,
) -> tuple[str, bytes, dict]:
    """Return (cv_html, cv_pdf_bytes, cv_data). Pure computation — no DB writes."""
    if cv_template_html:
        cv_data = dict(cv_data_raw or {})
        cv_data.setdefault("experience", [])
        cv_data.setdefault("projects", [])
        cv_data.setdefault("education", "")
        cv_data["name"] = candidate_name
        cv_data["role"] = role
        cv_data["skills"] = skills
        cv_data["location"] = location
        if spoken_languages:
            cv_data["spoken_languages"] = spoken_languages

        if is_master_cv:
            cv_html = tailor_master_cv_for_job(
                master_cv_html=cv_template_html,
                job_title=job_title,
                job_description=job_description[:6000],
                language=language,
                cv_notes=cv_notes,
                model=cv_model,
                client=cv_client,
            )
        else:
            cv_html = fill_html_cv_with_ai(
                cv_template_html, cv_data, language,
                job_title=job_title,
                job_description=job_description[:6000],
                cv_notes=cv_notes,
                model=cv_model, client=cv_client,
            )
    else:
        cv_data = generate_tailored_cv(
            cv_data=cv_data_raw,
            job_title=job_title,
            job_description=job_description[:10000],
            candidate_name=candidate_name,
            candidate_role=role,
            language=language,
            model=cv_model,
            skills=skills,
            spoken_languages=spoken_languages,
            location=location,
            client=cv_client,
        )
        cv_html = render_cv_html(cv_data, template_key=cv_template_key or "classic")

    try:
        cv_pdf = html_to_pdf(cv_html)
    except OSError as e:
        logger.warning(f"html_to_pdf failed for CV, falling back to classic renderer: {e}")
        cv_pdf = render_cv_pdf(cv_data, template_key="classic")
    return cv_html, cv_pdf, cv_data
```

- [ ] **Step 3: Pass `cv_notes` and `is_master_cv` when submitting `_build_cv` to the thread pool**

In `generate_application_package_task`, the call to `pool.submit(_build_cv, ...)` needs two new args. First extract `cv_notes`:

```python
        cv_notes = getattr(job, "cv_draft", "") or ""
        is_master = bool(profile.master_cv_template_id and master_t if 'master_t' in dir() else False)
```

Actually, track `is_master` as a local boolean alongside `cv_template_html`:

Replace the block:

```python
        if profile.master_cv_template_id:
            master_t = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == profile.master_cv_template_id,
                DocumentTemplate.doc_type == "MASTER_CV",
            ).first()
            cv_template_html = master_t.html if master_t else _resolve_template_html(db, profile.cv_template, "CV")
        else:
            cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
```

with:

```python
        is_master_cv = False
        if profile.master_cv_template_id:
            master_t = db.query(DocumentTemplate).filter(
                DocumentTemplate.id == profile.master_cv_template_id,
                DocumentTemplate.doc_type == "MASTER_CV",
            ).first()
            if master_t:
                cv_template_html = master_t.html
                is_master_cv = True
            else:
                cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
        else:
            cv_template_html = _resolve_template_html(db, profile.cv_template, "CV")
        cv_notes = getattr(job, "cv_draft", "") or ""
```

Then update the `pool.submit` call to pass the two new kwargs:

```python
            cv_future = pool.submit(
                _build_cv,
                profile.cv_data, cv_template_html, profile.cv_template,
                candidate_name, profile.role or "", profile.skills or "",
                profile.location or "", profile.spoken_languages or [],
                job.title or "", job.description or "", language,
                cv_client, cv_model,
                cv_notes,
                is_master_cv,
            )
```

- [ ] **Step 4: Commit**

```bash
git add server/workers/tasks/package.py
git commit -m "feat(worker): use master CV as base for job-specific CV tailoring"
```

---

## Task 7: i18n Keys

**Files:**
- Modify: `frontend/app/lib/languages.ts`

- [ ] **Step 1: Add English keys after `selectPdf: "Select PDF",` (line 149)**

```typescript
    masterCvTemplate: "Master CV Template",
    uploadHtmlTemplate: "Upload HTML Template",
    dropHtml: "Drop your HTML template to create a master CV.",
    selectHtml: "Select HTML",
    masterCvProcessing: "Master CV is being created by AI…",
    masterCvReady: "Master CV ready",
    masterCvError: "Master CV creation failed. Please try again.",
```

- [ ] **Step 2: Add German keys after `selectPdf: "PDF auswählen",` (line 784)**

```typescript
    masterCvTemplate: "Master-Lebenslauf-Template",
    uploadHtmlTemplate: "HTML-Template hochladen",
    dropHtml: "HTML-Template ablegen, um Master-Lebenslauf zu erstellen.",
    selectHtml: "HTML auswählen",
    masterCvProcessing: "Lebenslauf wird von KI bearbeitet…",
    masterCvReady: "Master-Lebenslauf bereit",
    masterCvError: "Fehler beim Erstellen des Master-Lebenslaufs. Bitte erneut versuchen.",
```

- [ ] **Step 3: Verify TypeScript compiles** — the `TranslationKey` type is inferred from the `translations` object, so adding keys to both language objects is sufficient.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/lib/languages.ts
git commit -m "feat(i18n): add master CV template translation keys"
```

---

## Task 8: Frontend — Master CV Upload + Status Indicator

**Files:**
- Modify: `frontend/app/profile/page.tsx`

- [ ] **Step 1: Add state variables** after the existing `docTemplates` state (around line 95):

```typescript
  const [masterCvStatus, setMasterCvStatus] = useState<"processing" | "ready" | "error" | null>(null);
  const [masterCvTemplateId, setMasterCvTemplateId] = useState<number | null>(null);
  const [uploadingMasterCv, setUploadingMasterCv] = useState(false);
  const [masterCvPollInterval, setMasterCvPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 2: Load `master_cv_status` and `master_cv_template_id` from `settings-view`**

In the `.then(async (data) => {` block (around line 101), after `if (profileData.cover_letter_template) setCoverLetterTemplate(...)`, add:

```typescript
          setMasterCvStatus(profileData.master_cv_status ?? null);
          setMasterCvTemplateId(profileData.master_cv_template_id ?? null);
```

- [ ] **Step 3: Add polling effect** — append after the existing `useEffect` that calls `loadProfileDocs` and `loadTemplates`:

```typescript
  useEffect(() => {
    if (masterCvStatus !== "processing") {
      if (masterCvPollInterval) {
        clearInterval(masterCvPollInterval);
        setMasterCvPollInterval(null);
      }
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`);
        if (!res.ok) return;
        const data = await res.json();
        const status = data?.profile?.master_cv_status ?? null;
        setMasterCvStatus(status);
        setMasterCvTemplateId(data?.profile?.master_cv_template_id ?? null);
      } catch {}
    }, 3000);
    setMasterCvPollInterval(interval);
    return () => clearInterval(interval);
  }, [masterCvStatus]);
```

- [ ] **Step 4: Add `uploadMasterCvTemplate` handler** — add after `deleteProfileDoc`:

```typescript
  const uploadMasterCvTemplate = async (file: File) => {
    setUploadingMasterCv(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/profile/cv-template`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Upload failed");
      setMasterCvStatus("processing");
    } catch (e: any) {
      logger.error({ err: e }, "Master CV template upload failed");
      showError(t("masterCvError"));
    } finally {
      setUploadingMasterCv(false);
    }
  };
```

- [ ] **Step 5: Add Master CV section to the Documents tab**

In the Documents tab (`activeTab === "documents"`), add this block before the `<DocumentTemplateGallery ...>` div (i.e., as the first child of the outermost `<div className="space-y-6">`):

```tsx
          {/* Master CV Template */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="font-bold text-lg tracking-tight flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-indigo-500" />
              {t("masterCvTemplate")}
            </h2>

            {masterCvStatus === "processing" ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30">
                <div className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin flex-shrink-0" />
                <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                  {t("masterCvProcessing")}
                </span>
              </div>
            ) : masterCvStatus === "ready" ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  {t("masterCvReady")}
                </span>
              </div>
            ) : masterCvStatus === "error" ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 mb-4">
                <span className="text-sm text-rose-700 dark:text-rose-300 font-medium">
                  {t("masterCvError")}
                </span>
              </div>
            ) : null}

            {masterCvStatus !== "processing" && (
              <label className={`relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${uploadingMasterCv ? "border-purple-300 bg-purple-50/30 dark:bg-purple-500/5" : "border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-800/20"}`}>
                <input
                  type="file"
                  accept=".html,.htm"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploadingMasterCv}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMasterCvTemplate(f);
                    e.target.value = "";
                  }}
                />
                {uploadingMasterCv ? (
                  <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-500 rounded-full animate-spin" />
                ) : (
                  <UploadCloud className="w-6 h-6 text-indigo-400" />
                )}
                <span className="text-sm text-slate-500 dark:text-slate-400 text-center">
                  {t("dropHtml")}
                </span>
                <span className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg">
                  {t("selectHtml")}
                </span>
              </label>
            )}
          </div>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/profile/page.tsx
git commit -m "feat(profile): add master CV template upload section with AI processing status indicator"
```

---

## Self-Review Checklist

- [x] Spec coverage: Migration ✓, DB model ✓, Upload endpoint ✓, Celery task ✓, Job tailoring ✓, Status indicator ✓, i18n ✓
- [x] No placeholders: all steps contain complete code
- [x] Type consistency: `master_cv_status` is `str | None` throughout; `master_cv_template_id` is `int | None`; `is_master_cv: bool` matches usage in `_build_cv`
- [x] `cv_notes` in `_build_cv`: The current `_build_cv` doesn't receive `cv_notes` — Task 6 adds it as a parameter and passes it through. The caller reads it from `job.cv_draft`.
- [x] `_mask_profile` uses `sa_inspect` to dump all column attrs automatically — no manual update needed
- [x] `settings-view` returns `_mask_profile(profile)` which includes new columns automatically
