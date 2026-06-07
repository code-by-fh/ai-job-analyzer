# CV & Cover Letter Full Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CV and cover letter both use the profile's selected template to produce a PDF; the AI receives all profile fields (skills, spoken_languages, location, preferences, candidate_name); users can provide improvement notes for both documents.

**Architecture:** Both Celery tasks (`application.py`, `package.py`) resolve the cover-letter template from the profile, fill it with enriched data, and render a PDF via WeasyPrint. AI prompt functions receive the missing profile fields. The Anschreiben tab in the frontend switches from Markdown display to a PDF iframe (matching the Lebenslauf tab); the Lebenslauf tab gains an improvement-notes input identical to the existing Anschreiben one.

**Tech Stack:** Python 3.11, FastAPI, Celery, BeautifulSoup template-filler, WeasyPrint (via `html_to_pdf`), React/Next.js/TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `server/intelligence/prompts.py` | Add profile fields to cover-letter and tailored-CV prompts |
| `server/intelligence/service.py` | Extend `generate_application()` and `generate_tailored_cv()` signatures |
| `server/workers/tasks/application.py` | Pass profile fields; resolve template; render + store PDF; save `cover_letter_html` |
| `server/workers/tasks/package.py` | Pass profile fields; accept `cv_notes`; extend `letter_data` |
| `server/routers/jobs.py` | Add `cv_notes` to `GeneratePackageRequest` |
| `frontend/app/components/JobCard/JobApplicationTab.tsx` | Anschreiben → PDF iframe + letter doc state; Lebenslauf → improvement-notes UI |

---

## Task 1: Extend cover-letter prompt with full profile data

**Files:**
- Modify: `server/intelligence/prompts.py` — function `get_generate_application_messages`

The fresh-generation `user_prompt` currently only sends `profile_role` and `cv_text`. We add `candidate_name`, `candidate_location`, `candidate_skills`, `candidate_languages`, `candidate_preferences`.

- [ ] **Step 1: Update `get_generate_application_messages` signature and user_prompt**

Replace the entire function signature and both `user_prompt` definitions in `server/intelligence/prompts.py`:

```python
def get_generate_application_messages(
    job_title: str,
    job_company: str,
    job_description: str,
    profile_role: str,
    cv_text: str,
    user_language: str = "de",
    improvement_notes: Optional[str] = None,
    existing_draft: Optional[str] = None,
    candidate_name: str = "",
    candidate_location: str = "",
    candidate_skills: str = "",
    candidate_languages: Optional[list] = None,
    candidate_preferences: str = "",
) -> List[Dict[str, str]]:
```

In the **IMPROVE MODE** branch, replace the `user_prompt` f-string (currently ends with `Position: {job_title} at {job_company}"""`):

```python
        user_prompt = f"""### EXISTING COVER LETTER
{existing_draft}

### REQUESTED IMPROVEMENTS
{improvement_notes}

### CONTEXT (for reference only — do not rewrite unless relevant to the improvements)
Position: {job_title} at {job_company}
Applicant: {candidate_name}
Location: {candidate_location}
Skills: {candidate_skills}
Languages: {", ".join(candidate_languages) if candidate_languages else ""}"""
```

In the **FRESH GENERATION MODE** branch, replace the `user_prompt` f-string (currently ends after `{cv_text}`):

```python
        user_prompt = f"""### JOB POSTING
Position: {job_title}
Company: {job_company}
Description:
{job_description}

### APPLICANT PROFILE
Name: {candidate_name}
Current Role: {profile_role}
Location: {candidate_location}
Skills: {candidate_skills}
Languages: {", ".join(candidate_languages) if candidate_languages else ""}
Preferences: {candidate_preferences}
CV Data:
{cv_text}"""
```

- [ ] **Step 2: Extend tailored-CV prompt with skills, languages, location, cv_notes**

In `get_tailored_cv_messages`, add `cv_notes: str = ""` parameter and include it in the prompt:

```python
def get_tailored_cv_messages(cv_data, job_title, job_description, language="de", cv_notes: str = ""):
    import json as _json

    lang_note = "Antworte auf Deutsch." if language == "de" else "Respond in English."
    notes_section = f"\n\nIMPROVEMENT NOTES (apply when reordering/rewriting descriptions):\n{cv_notes}" if cv_notes else ""
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
        f"Return the tailored CV as JSON only.{notes_section}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
```

- [ ] **Step 3: Commit**

```bash
git add server/intelligence/prompts.py
git commit -m "feat(ai): add full profile fields to cover-letter and tailored-CV prompts"
```

---

## Task 2: Extend service.py function signatures

**Files:**
- Modify: `server/intelligence/service.py` — functions `generate_application`, `generate_tailored_cv`

- [ ] **Step 1: Extend `generate_application` signature**

Replace the function definition (starting at `def generate_application(`):

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
    candidate_languages: list = None,
    candidate_preferences: str = "",
) -> str:
    client = get_ai_client(api_key)

    messages = get_generate_application_messages(
        job_title=job_title,
        job_company=job_company,
        job_description=job_description,
        profile_role=profile_role,
        cv_text=cv_text,
        user_language=user_language,
        improvement_notes=improvement_notes,
        existing_draft=existing_draft,
        candidate_name=candidate_name,
        candidate_location=candidate_location,
        candidate_skills=candidate_skills,
        candidate_languages=candidate_languages or [],
        candidate_preferences=candidate_preferences,
    )

    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.7,
        func_name="generate_application",
    )
    return response.choices[0].message.content
```

- [ ] **Step 2: Extend `generate_tailored_cv` signature**

Replace the function definition (starting at `def generate_tailored_cv(`):

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
    spoken_languages=None,
    location: str = "",
    cv_notes: str = "",
) -> dict:
    base = dict(cv_data or {})
    base.setdefault("experience", [])
    base.setdefault("projects", [])
    base.setdefault("education", "")
    base["name"] = candidate_name or base.get("name", "")
    base["role"] = candidate_role or base.get("role", "")
    if skills and not base.get("skills"):
        base["skills"] = skills
    if spoken_languages:
        base["spoken_languages"] = (
            spoken_languages if isinstance(spoken_languages, list) else [spoken_languages]
        )
    if location:
        base["location"] = location

    client = get_ollama_client(db)
    messages = get_tailored_cv_messages(base, job_title, job_description, language, cv_notes=cv_notes)
    try:
        response = _call_openrouter(
            client=client,
            model=model or get_ollama_model(db),
            messages=messages,
            temperature=0.3,
            func_name="generate_tailored_cv",
        )
        tailored = extract_json(response.choices[0].message.content.strip())
    except Exception as e:
        logger.error(f"Ollama tailored CV failed, using untailored CV: {e}")
        return base

    tailored.setdefault("experience", base["experience"])
    tailored.setdefault("projects", base["projects"])
    tailored.setdefault("education", base["education"])
    tailored["name"] = base["name"]
    tailored["role"] = base["role"]
    return tailored
```

- [ ] **Step 3: Commit**

```bash
git add server/intelligence/service.py
git commit -m "feat(ai): extend generate_application and generate_tailored_cv with full profile params"
```

---

## Task 3: Cover letter PDF in application.py

**Files:**
- Modify: `server/workers/tasks/application.py`

The `ai.generate_application` task currently only saves `application_draft` as Markdown text. After this task it also: resolves the cover-letter template from the profile, fills and renders a PDF, stores a `GENERATED_LETTER` document, and saves `job.cover_letter_html`.

- [ ] **Step 1: Add imports at top of `application.py`**

Add to the existing imports block:

```python
import datetime
from database.core import SessionLocal, JobEntry, UserProfile, User, DocumentTemplate
from services.template_filler import fill_template
from services.document_renderer import render_cover_letter_pdf, html_to_pdf
from services.job_documents import store_generated_document
```

(Replace the existing `from database.core import SessionLocal, JobEntry, UserProfile` line.)

- [ ] **Step 2: Add helper functions after the imports**

Add these two helpers immediately after the imports (before `logger = ...`):

```python
def _resolve_letter_template_html(db, template_ref):
    """Return HTML for a numeric template ID, or None for legacy path."""
    if not template_ref or not str(template_ref).isdigit():
        return None
    t = db.query(DocumentTemplate).filter(
        DocumentTemplate.id == int(template_ref),
        DocumentTemplate.doc_type == "COVER_LETTER",
    ).first()
    return t.html if t else None


def _safe_name(value):
    cleaned = "".join(c for c in (value or "Job") if c.isalnum() or c in " -_")
    return cleaned.replace(" ", "_") or "Job"
```

- [ ] **Step 3: Pass all profile fields to `generate_application` and render PDF**

In the task function, find the block that calls `generate_application(...)`. Replace it with the following expanded block (keep `improvement_notes` and `existing_draft` logic):

```python
        user = db.query(User).filter(User.id == target_user_id).first()
        candidate_name = user.username if user else ""
        user_language = getattr(profile, "language", "de") if profile else "de"
        cv_text = format_cv_for_prompt(profile.cv_data)

        logger.info("Sending request to AI for cover letter...")
        model = get_model(db)
        api_key = get_api_key(db)
        existing_draft = job.application_draft if improvement_notes else None

        application_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=job.description[:10000],
            profile_role=profile.role,
            cv_text=cv_text,
            user_language=user_language,
            model=model,
            api_key=api_key,
            improvement_notes=improvement_notes,
            existing_draft=existing_draft,
            candidate_name=candidate_name,
            candidate_location=profile.location or "",
            candidate_skills=profile.skills or "",
            candidate_languages=profile.spoken_languages or [],
            candidate_preferences=profile.preferences or "",
        )
        logger.info("Received AI response for cover letter.")

        db.refresh(job)
        if job.status != "GENERATING":
            logger.info(f"Job {job_id} cancelled, discarding result.")
            return

        job.application_draft = application_text

        # --- Render cover letter PDF from template ---
        letter_template_html = _resolve_letter_template_html(db, profile.cover_letter_template)
        letter_data = {
            "sender_name": candidate_name,
            "company": job.company or "",
            "body": application_text,
            "location": profile.location or "",
            "date": datetime.date.today().strftime("%d.%m.%Y"),
            "role": profile.role or "",
            "skills": profile.skills or "",
        }
        if letter_template_html:
            job.cover_letter_html = fill_template(letter_template_html, letter_data)
            letter_pdf = html_to_pdf(job.cover_letter_html)
        else:
            letter_pdf = render_cover_letter_pdf(
                letter_markdown=application_text,
                template_key=profile.cover_letter_template or "classic",
                sender_name=candidate_name,
                company=job.company or "",
            )

        storage = get_storage_service(profile) if profile.active_storage_service != "NONE" else None
        store_generated_document(
            db, job.id, target_user_id, letter_pdf,
            original_filename=f"Anschreiben_{_safe_name(job.company)}.pdf",
            mime_type="application/pdf",
            kind="GENERATED_LETTER",
            storage=storage,
        )

        job.status = "DRAFTED"
        db.commit()
```

Also remove the old `user_language = ...` and `cv_text = ...` lines that appeared before the AI call (they are now included in the block above).

- [ ] **Step 4: Update the Redis publish payload to include `cover_letter_html` flag**

Find the `r.publish(...)` call after `db.commit()` and add `"cover_letter_generated": True` to the payload:

```python
        r.publish(
            "job_updates",
            json.dumps(
                {
                    "type": "job_update",
                    "job_id": job.id,
                    "status": "DRAFTED",
                    "application_draft": job.application_draft,
                    "cover_letter_generated": True,
                    "user_id": job.user_id,
                }
            ),
        )
```

- [ ] **Step 5: Commit**

```bash
git add server/workers/tasks/application.py
git commit -m "feat(tasks): generate cover letter PDF from template in application task"
```

---

## Task 4: Enrich package.py with all profile fields and cv_notes

**Files:**
- Modify: `server/workers/tasks/package.py`

- [ ] **Step 1: Add `import datetime` at top**

The file already imports `os`, `json`, `redis`. Add `import datetime` after the existing imports.

- [ ] **Step 2: Add `cv_notes` parameter to task**

Change the task signature:

```python
@celery_app.task(name="ai.generate_application_package")
def generate_application_package_task(job_id, user_id=None, include_profile_documents=True, cv_notes=None):
```

- [ ] **Step 3: Pass all profile fields to `generate_tailored_cv`**

Replace the existing `tailored = generate_tailored_cv(...)` call:

```python
        tailored = generate_tailored_cv(
            cv_data=profile.cv_data,
            job_title=job.title,
            job_description=(job.description or "")[:10000],
            candidate_name=candidate_name,
            candidate_role=profile.role,
            language=language,
            model=get_ollama_model(db),
            db=db,
            skills=profile.skills or "",
            spoken_languages=profile.spoken_languages or [],
            location=profile.location or "",
            cv_notes=cv_notes or "",
        )
```

- [ ] **Step 4: Pass all profile fields to `generate_application` and extend letter_data**

Replace the existing `letter_text = generate_application(...)` call and the subsequent `letter_data` dict:

```python
        letter_text = generate_application(
            job_title=job.title,
            job_company=job.company,
            job_description=(job.description or "")[:10000],
            profile_role=profile.role,
            cv_text=format_cv_for_prompt(profile.cv_data),
            user_language=language,
            model=get_model(db),
            api_key=get_api_key(db),
            candidate_name=candidate_name,
            candidate_location=profile.location or "",
            candidate_skills=profile.skills or "",
            candidate_languages=profile.spoken_languages or [],
            candidate_preferences=profile.preferences or "",
        )
        job.application_draft = letter_text
        letter_template_html = _resolve_template_html(db, profile.cover_letter_template, "COVER_LETTER")
        letter_data = {
            "sender_name": candidate_name,
            "company": job.company or "",
            "body": letter_text,
            "location": profile.location or "",
            "date": datetime.date.today().strftime("%d.%m.%Y"),
            "role": profile.role or "",
            "skills": profile.skills or "",
        }
```

- [ ] **Step 5: Commit**

```bash
git add server/workers/tasks/package.py
git commit -m "feat(tasks): pass full profile to AI + cv_notes + enriched letter_data in package task"
```

---

## Task 5: Add cv_notes to GeneratePackageRequest

**Files:**
- Modify: `server/routers/jobs.py`

- [ ] **Step 1: Find `GeneratePackageRequest` and add `cv_notes`**

Find the class (search for `GeneratePackageRequest`):

```python
class GeneratePackageRequest(BaseModel):
    include_profile_documents: bool = True
    cv_notes: Optional[str] = None
```

- [ ] **Step 2: Pass `cv_notes` to celery task**

In `trigger_package_generation`, replace the `celery_app.send_task(...)` call:

```python
        cv_notes = body.cv_notes if body else None
        celery_app.send_task(
            "ai.generate_application_package",
            args=[job_id, current_user.id, include_docs, cv_notes],
            queue="ai_queue",
        )
```

- [ ] **Step 3: Commit**

```bash
git add server/routers/jobs.py
git commit -m "feat(api): add cv_notes to generate-package endpoint"
```

---

## Task 6: Frontend — Anschreiben tab: load letter document + PDF display

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

The Anschreiben tab currently displays `job.application_draft` as Markdown text. After this task it loads the `GENERATED_LETTER` document and shows it as a PDF iframe — matching the Lebenslauf tab. The Markdown textarea edit mode is kept as fallback when no template HTML exists.

- [ ] **Step 1: Add letter document state variables**

After the existing `cvGenerating` state block (around line 108), add:

```typescript
  // ── Letter document state ─────────────────────────────────────────────────
  const [letterDoc, setLetterDoc] = useState<JobDocument | null>(null);
  const [letterDocLoading, setLetterDocLoading] = useState(true);
  const [letterBlobUrl, setLetterBlobUrl] = useState<string | null>(null);
  const [letterBlobLoading, setLetterBlobLoading] = useState(false);
```

- [ ] **Step 2: Add `loadLetterDocument` function**

After the existing `loadCvDocument` function (around line 215), add:

```typescript
  const loadLetterDocument = useCallback(async () => {
    setLetterDocLoading(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`);
      if (res.ok) {
        const docs: JobDocument[] = await res.json();
        setLetterDoc(docs.find((d) => d.kind === "GENERATED_LETTER") ?? null);
      }
    } finally {
      setLetterDocLoading(false);
    }
  }, [apiBase, job.id]);
```

- [ ] **Step 3: Load letter document on mount and after generation**

After the existing `useEffect` that calls `loadCvDocument()` (around line 218), add:

```typescript
  useEffect(() => {
    loadLetterDocument();
  }, [loadLetterDocument]);
```

After the existing effect that clears `cvGenerating` when job leaves GENERATING state (around line 186), add a parallel effect for the letter:

```typescript
  // Reload letter doc when generation completes
  useEffect(() => {
    if (!isLetterGenerating && job.application_draft) {
      loadLetterDocument();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLetterGenerating]);
```

- [ ] **Step 4: Add letter PDF blob effect**

After the existing CV blob effect (around line 222), add:

```typescript
  // ── Letter blob for inline iframe ─────────────────────────────────────────
  useEffect(() => {
    if (!letterDoc) { setLetterBlobUrl(null); return; }
    let objectUrl: string | null = null;
    setLetterBlobLoading(true);
    setLetterBlobUrl(null);
    fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/${letterDoc.id}/view`)
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setLetterBlobUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => setLetterBlobLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [letterDoc, apiBase, job.id]);
```

- [ ] **Step 5: Add letter download handler**

After `handleDownloadCv` (around line 338), add:

```typescript
  const handleDownloadLetter = async () => {
    if (!letterDoc) return;
    const a = document.createElement("a");
    a.href = `${apiBase}/jobs/${job.id}/documents/${letterDoc.id}/download`;
    a.download = letterDoc.original_filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
```

Note: The existing `handleDownloadLetter` (around line 247) downloads the letter as a generated PDF via a different endpoint. Rename the old one to `handleDownloadLetterLegacy` and keep it as a fallback, OR replace its download URL to use the new document-based download. Since we now always produce a `GENERATED_LETTER` document, replace the old function body:

```typescript
  const handleDownloadLetterLegacy = async () => {
    if (letterDoc) {
      handleDownloadLetter();
      return;
    }
    // original fallback code stays here unchanged
  };
```

And update all references from `handleDownloadLetter` → `handleDownloadLetterLegacy` in the JSX.

- [ ] **Step 6: Replace Markdown display with PDF display in the content area**

Find the content area of the ANSCHREIBEN VIEW (the block that starts with `{isLetterGenerating && !job.application_draft ? (`). Replace the entire non-generating display block (after the `GeneratingSpinner`/`RegenBanner` section) with:

```tsx
              {/* PDF display (when template produced a letter doc) */}
              {!isEditing && job.application_draft && (
                letterDocLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    <span className="text-xs font-semibold">Lade Anschreiben…</span>
                  </div>
                ) : letterDoc ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
                    {letterBlobLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      </div>
                    ) : letterBlobUrl ? (
                      <iframe
                        src={letterBlobUrl}
                        className="w-full border-0"
                        style={{ height: "680px" }}
                        title="Anschreiben PDF"
                      />
                    ) : null}
                  </div>
                ) : (
                  /* Markdown fallback when no PDF document exists yet */
                  <div
                    className={`bg-white dark:bg-slate-800 p-8 md:p-10 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg font-serif transition-opacity duration-300 ${isLetterGenerating ? "opacity-40 pointer-events-none select-none" : ""}`}
                  >
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-200 prose-headings:text-slate-900 dark:prose-headings:text-white leading-relaxed">
                      <ReactMarkdown>{job.application_draft}</ReactMarkdown>
                    </div>
                  </div>
                )
              )}
              {/* Empty state */}
              {!job.application_draft && !isLetterGenerating && (
                <div className="group flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all">
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div className="text-center px-6 max-w-xs space-y-1">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Noch kein Anschreiben
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      KI-generiert und auf dein Profil abgestimmt.
                    </p>
                  </div>
                  <button
                    onClick={() => onGenerate(job)}
                    disabled={isLetterGenerating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
                  >
                    {t("generateApplication") || "Bewerbung generieren"}
                    <Zap className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
```

- [ ] **Step 7: Update action bar PDF download button**

In the action bar for the Anschreiben view, replace the PDF download button so it uses the letter document:

```tsx
              {!isEditing && job.application_draft && !isLetterGenerating && (
                <>
                  <button
                    onClick={handleCopy}
                    className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {copied ? "Kopiert" : "Kopieren"}
                    </span>
                  </button>
                  {letterDoc && (
                    <button
                      onClick={handleDownloadLetter}
                      className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-500/20 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  )}
                  {job.cover_letter_html && (
                    <button
                      onClick={() => openEditor("cover_letter")}
                      className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm whitespace-nowrap"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editor</span>
                    </button>
                  )}
                </>
              )}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/components/JobCard/JobApplicationTab.tsx
git commit -m "feat(ui): show letter PDF iframe in Anschreiben tab; load GENERATED_LETTER document"
```

---

## Task 7: Frontend — Lebenslauf tab: add improvement notes UI

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Add CV improvement-notes state**

After the existing `[showRegenInput, setShowRegenInput]` state (around line 93), add:

```typescript
  const [showCvRegenInput, setShowCvRegenInput] = useState(false);
  const [cvRegenNote, setCvRegenNote] = useState("");
```

- [ ] **Step 2: Update `handleRegenCv` to pass `cv_notes`**

Replace the existing `handleRegenCv` function:

```typescript
  const handleRegenCv = async (notes?: string) => {
    cvGenerationPending.current = true;
    localStorage.setItem(`gen_cv_${job.id}`, Date.now().toString());
    setCvGenerating(true);
    setShowCvRegenInput(false);
    try {
      const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const res = await fetchWithAuth(
        `${baseUrl}/jobs/${encodeURIComponent(job.id)}/generate-package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            include_profile_documents: false,
            cv_notes: notes || null,
          }),
        },
      );
      if (!res.ok) {
        cvGenerationPending.current = false;
        localStorage.removeItem(`gen_cv_${job.id}`);
        setCvGenerating(false);
        alert(`Lebenslauf konnte nicht erstellt werden (HTTP ${res.status})`);
      }
    } catch (e) {
      cvGenerationPending.current = false;
      localStorage.removeItem(`gen_cv_${job.id}`);
      setCvGenerating(false);
      console.error("Generate CV error:", e);
    }
  };
```

- [ ] **Step 3: Add improvement-notes UI to the Lebenslauf action bar**

In the LEBENSLAUF VIEW action bar, replace the "Neu generieren" button with a toggle button + handler:

```tsx
              {!isCvEditing && (
                <button
                  onClick={() => {
                    if (job.cv_draft) {
                      setShowCvRegenInput((v) => !v);
                    } else {
                      handleRegenCv();
                    }
                  }}
                  disabled={cvGenerating || isLetterGenerating}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                    showCvRegenInput
                      ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20"
                      : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  }`}
                >
                  {cvGenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {job.cv_draft ? "Neu generieren" : "Generieren"}
                  </span>
                </button>
              )}
```

- [ ] **Step 4: Add improvement-notes input panel below the action bar (inside LEBENSLAUF VIEW)**

Directly after the action bar closing `</div>` and before the content section, add:

```tsx
          {/* CV regen input */}
          {showCvRegenInput && !isCvEditing && (
            <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">
                Verbesserungshinweis (Lebenslauf)
              </p>
              <textarea
                value={cvRegenNote}
                onChange={(e) => setCvRegenNote(e.target.value)}
                placeholder="Z.B. 'Python-Erfahrung stärker hervorheben' oder 'Projekte an den Anfang'"
                rows={3}
                className="w-full text-sm bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-500/30 rounded-lg p-3 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowCvRegenInput(false); setCvRegenNote(""); }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => handleRegenCv(cvRegenNote)}
                  disabled={cvGenerating}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {cvGenerating ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Wird gestartet…</>
                  ) : (
                    <><RefreshCw className="w-3 h-3" /> Neu generieren</>
                  )}
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Update "Generieren" button in CV empty state**

In the empty-state card at the bottom of the Lebenslauf view, update the button's `onClick`:

```tsx
              <button
                onClick={() => handleRegenCv()}
                disabled={cvGenerating}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                Lebenslauf generieren
                <Zap className="w-3.5 h-3.5" />
              </button>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/components/JobCard/JobApplicationTab.tsx
git commit -m "feat(ui): add CV improvement notes input in Lebenslauf tab"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| AI gets all profile fields (skills, spoken_languages, location, preferences, candidate_name) | Tasks 1, 2, 3, 4 |
| Cover letter uses template → PDF | Tasks 3, 4 |
| CV uses profile template → PDF | Already working; Task 4 enriches it |
| Template data enriched (location, date, role, skills) | Tasks 3, 4 |
| Improvement notes for Anschreiben | Already existed; Tasks 3, 6 ensure PDF reloads |
| Improvement notes for Lebenslauf | Tasks 5, 7 |
| Direct document editing (Editor) | Already existed; Task 6 ensures the button appears |

**Type consistency:**
- `handleRegenCv(notes?: string)` used in Task 7 steps 2, 4, 5 — consistent.
- `letterDoc`, `loadLetterDocument`, `letterBlobUrl`, `letterBlobLoading` defined in Task 6 step 1–4, used in steps 5–7 — consistent.
- `showCvRegenInput`, `cvRegenNote` defined in Task 7 step 1, used in steps 3–4 — consistent.

**No placeholders found.**
