# Design: Master-CV-Template

**Date:** 2026-06-07  
**Status:** Approved

---

## Overview

When a user uploads a custom HTML template in their profile, the system sends it together with the user's profile data to the AI. The AI fills the template with all profile data, producing a "Master CV" that serves as the baseline for all future job applications. For each individual job, the user can trigger AI-based tailoring that adapts the Master CV specifically for that position. Existing job CVs are never affected by a new Master CV upload.

---

## Data Model Changes

### `document_templates` table
- New valid value for `doc_type`: `"MASTER_CV"` (alongside existing `"CV"` and `"COVER_LETTER"`)
- No schema change required — the column already exists and accepts string values
- Master CV entries are always user-specific (`user_id` is set, `is_admin = false`)

### `user_settings` table (two new columns via Alembic migration)
- `master_cv_template_id` — `Integer`, nullable, FK → `document_templates.id`  
  Points to the active Master CV template for this user.
- `master_cv_status` — `String`, nullable  
  Values: `null` (no Master CV yet), `"processing"`, `"ready"`, `"error"`

---

## Upload Flow

1. `POST /profile/cv-template` accepts an HTML file upload
2. Endpoint creates a new `DocumentTemplate` row: `doc_type="MASTER_CV"`, `user_id=current_user.id`, `html=<uploaded content>`
3. `user_settings.master_cv_status` is set to `"processing"`
4. A Celery task (`generate_master_cv`) is enqueued with the new template ID
5. Endpoint returns immediately: `{"status": "processing", "template_id": <id>}`

### Celery task `generate_master_cv`
1. Reads the raw uploaded HTML from `document_templates`
2. Reads full profile data from `user_settings`
3. Calls AI: prompt instructs the model to fill the HTML with all profile fields (experience, skills, education, role, location, languages, etc.) while preserving the HTML structure
4. On success:
   - Updates `DocumentTemplate.html` with AI-filled result
   - Sets `user_settings.master_cv_template_id = template_id`
   - Sets `user_settings.master_cv_status = "ready"`
   - Deletes the previous Master CV template row (if a different one existed)
5. On error:
   - Sets `user_settings.master_cv_status = "error"`
   - Deletes the newly created (unfilled) template row
   - Previous Master CV (if any) remains intact

---

## Status Indicator (Frontend)

- `GET /settings` response includes `master_cv_status` and `master_cv_template_id`
- Profile page polls `GET /settings` every 3 seconds while `master_cv_status === "processing"`
- UI states in the CV section of the profile:
  - `"processing"`: spinner + "Lebenslauf wird von KI bearbeitet…"
  - `"ready"`: success indicator + option to upload new template
  - `"error"`: red notice + option to retry upload
  - `null`: upload prompt only

---

## Job-Level CV Tailoring

**Trigger:** Existing "CV generieren" button in `JobApplicationTab` — no new UI entry needed.

**New logic in `generate_tailored_cv()` / `intelligence/service.py`:**
- If `user_settings.master_cv_template_id` is set: fetch Master CV HTML and include it in the AI prompt as the base document
- AI instruction: adapt the Master CV for this specific job — tailor the "about me" / motivation section to the target position and employer, highlight relevant experience and skills matching the job description, preserve the rest of the structure
- If no Master CV exists: fall back to existing full-generation from profile data (no behavior change)

**Result:** Stored in `jobs.cv_html` as today — no schema change.

---

## AI Prompts (summary)

### Master CV generation prompt
- Input: raw HTML template + full user profile (role, skills, experience, education, languages, location, preferences)
- Instruction: fill every section of the HTML with the user's actual profile data; do not invent data; preserve HTML structure and classes
- Output: filled HTML

### Job-specific tailoring prompt (extended)
- Input: Master CV HTML + job title + job description + company name + existing cv_notes
- Instruction: adapt the existing CV for this specific job; focus on "about me" / motivation text matching the target position; highlight matching skills and experience; preserve structure and other sections
- Output: tailored HTML

---

## Out of Scope

- Re-generating existing job CVs when a new Master CV is uploaded (they remain as-is)
- Cover letter Master Template (separate feature if needed)
- Preview of Master CV before saving
