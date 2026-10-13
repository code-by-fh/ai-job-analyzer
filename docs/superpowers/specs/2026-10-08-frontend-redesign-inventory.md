# AI Job Analyzer - Frontend Rewrite Inventory

Generated 2026-10-08 (read-only analysis of branch chore/rename-compose-services). Parts: A backend API, B current frontend, C gaps.

# Part A - Backend API inventory

Source: `server/main.py`, `server/routers/*.py`, `server/scraper_api.py`, `server/workers/**`, `server/database/core.py`.
All routers are mounted **without prefix** (only `storage.py` has `prefix="/storage"`). The API container listens on 8080, published as **host port 8002** (`docker-compose.yml`). The frontend calls `${NEXT_PUBLIC_API_URL}/<path>`.

Legend: **Auth** U = `get_current_user` (cookie `access_token`), A = `get_current_admin_user` (403 if not admin), - = none. **FE** = frontend caller(s) under `frontend/app/` (grep of template-literal fetch URLs). `UNUSED` = no frontend caller.

## A.0 Cross-cutting

### Auth flow (server side)
- JWT HS256, `SECRET_KEY` env (startup fails if missing). Access token 15 min, refresh token 7 days. Payload `{sub: username, tv: token_version, exp}`; refresh has extra `type: "refresh"`.
- Tokens are **only** transported as httpOnly cookies `access_token` / `refresh_token` (`samesite=lax`, `secure=COOKIE_SECURE` env, default true; compose sets false). No Authorization header support.
- `get_current_user`: reads cookie, decodes, loads user by username, rejects if `user.token_version != tv` -> 401 `{"detail":"Could not validate credentials"}`.
- Token version (`users.token_version`) is incremented on `/auth/logout` -> invalidates all access + refresh tokens of that user on all devices (also WebSocket). **Not** incremented on password change (old sessions stay valid).
- Default admin `admin` is created on startup (`ADMIN_PASSWORD` env or random, logged).
- CORS: `ALLOWED_ORIGINS` env (default `http://localhost:3000`), `allow_credentials=True`.
- Rate limits (slowapi, per IP): login 5/min, refresh 20/min, change-password 5/min, analyze 10/min, generate 5/min, generate-package 5/min, upload-cv 10/min.
- Security headers on every response (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS if COOKIE_SECURE). NB: `X-Frame-Options: DENY` applies to the PDF `/view` endpoints too (relevant if new UI embeds PDFs in an iframe from another origin; same-origin iframes are also blocked by DENY).
- Internal service-to-service calls (API -> scraper, beat -> scraper) mint a fresh access token for the user and send it as `Cookie: access_token=...`.

### Error response formats actually used
| Source | Status | Body |
|---|---|---|
| `HTTPException` (almost all routers) | 400/401/403/404/413/415/422/500/501/502 | `{"detail": "<string>"}` (mixed EN/DE strings, e.g. "Datenbankfehler", "Nur PDF Dateien erlaubt.") |
| Pydantic validation | 422 | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |
| slowapi rate limit | 429 | `{"error": "Rate limit exceeded: 5 per 1 minute"}` (note: `error`, not `detail`) |
| Unhandled exception | 500 | `{"detail": "Internal server error"}` |
| Scraper endpoints (`/scraper/*`) | **200** | `{"status": "Error"/"error", "message": "..."}` on logical errors (never HTTP error codes) |
| Scraper proxy upstream down | 502 | plain text `Scraper service unavailable` |
| `validate_template` ValueError | 500 | generic (not mapped) |

### Job status values (server)
`OPEN` (default on create) | `SEEN` (dedup placeholder from initial platform run, hidden everywhere) | `GENERATING` | `DRAFTED` | `FAILED` | `APPLIED` | `INTERVIEW` | `OFFER` | `ACCEPTED` | `REJECTED`.
- `routers/deps.APPLICATION_STATUSES = [OPEN, DRAFTED, APPLIED, INTERVIEW, OFFER, ACCEPTED, REJECTED]` - used as the "keep applications" protection set in bulk deletes (NB: includes OPEN, so `keep_applications=true` protects every OPEN job, i.e. almost everything).
- **No transition guards server-side.** `PATCH /jobs/{id}/update-status` accepts any string (no enum validation, no history). `PATCH /jobs/{id}` accepts any `status` string and writes a `JobStatusHistory` row (from, to, note, changed_by).
- Server-driven transitions: `/generate` and `/generate-package` set `GENERATING` immediately; Celery tasks set `DRAFTED` on success or `FAILED` (+ `generation_error`) on error; `/cancel-generation` sets `DRAFTED` if `application_draft` exists else `OPEN` (only when current status is GENERATING). `ai.generate_application` discards its result if status is no longer GENERATING (cancel honoured); `ai.generate_application_package` does **not** check for cancel (will overwrite to DRAFTED later). `ai.render_document_pdf` publishes `status: DRAFTED` via WS but does not change DB status.
- `SEEN` rows are excluded from `/jobs`, `/jobs/counts`, `/statistics.total_jobs`, platform `job_count`; but **`/dashboard-data` does not exclude SEEN** (inconsistency).

### Match threshold & auto-archive (`workers/tasks/analyze.py`)
- `user_profiles.match_threshold` int 0-100 (default 0 = off), set via `POST /matching-preference`.
- On `ai.analyze_job` for a **new** job: `auto_archive = threshold > 0 and score < threshold` -> job inserted with `is_archived=True`; no notification is sent for it. Manual re-analysis (`force_reanalyze`) never archives/unarchives.
- Jobs already present (by uuid5(user_id:url) id or by URL) are skipped (`job_skipped` event) unless `force_reanalyze`.
- Initial platform run (`is_initial_run`, i.e. `last_crawl_at is NULL`): links are only stored as `SEEN` placeholders (no detail scrape, no AI), so the first crawl yields 0 visible jobs; subsequent runs only process new URLs.
- `ai.save_job_basic` (save without AI, score 0) exists and is registered but is not dispatched anywhere in the current flow.

### Archive / delete semantics
- `is_archived` flag. `DELETE /jobs/{id}`: archives if not archived, hard-deletes if already archived. `POST /jobs/bulk-delete` same per id. `POST /jobs/bulk-restore` un-archives. `PATCH /jobs/{id}` can set `is_archived` either way.
- `DELETE /jobs` (bulk by filter): archive (default) or permanent delete (only already archived) with `keep_favorites`, `keep_applications`, `company` filters.
- Hard deletes of jobs via `/jobs/...` do **not** delete `JobStatusHistory`/`JobDocument` rows first (possible FK errors); platform deletes and admin wipe do.

### Documents: generation, storage, serving
- **Storage backend**: per-user `active_storage_service` `NONE` | `GOOGLE_DRIVE`. `db://<name>` = blob in DB (`content` LargeBinary); `gdrive://<name>` = uploaded to Drive (no blob kept). Legacy: plain filename on disk under `server/uploads/<user>/<job>/`.
- **Download/view of `gdrive://` files is not implemented** (400) for both job docs and profile docs.
- **JobDocument.kind**: `UPLOADED` (user upload), `GENERATED_CV`, `GENERATED_LETTER`, `ATTACHED_REFERENCE`, `ATTACHED_CERT` (copied profile docs). Generated kinds are *replaced* (old row of same kind deleted) on regeneration (`services/job_documents.store_generated_document`).
- **PDF URLs**: `GET /jobs/{job_id}/documents/{doc_id}/download` (attachment) and `/view` (inline), both cookie-authenticated (usable directly as `href`/`iframe src` from the same site, subject to X-Frame-Options DENY). Legacy markdown->PDF of the letter: `GET /jobs/{job_id}/download` (xhtml2pdf, filename `Bewerbung_<company>.pdf`). Profile docs: `GET /profile/documents/{id}/download|view`.
- **Cover letter**: `ai.generate_application` (via `/generate`, optional `improvement_notes` -> refines existing draft) or `ai.generate_application_package` (via `/generate-package`). Text stored in `jobs.application_draft` (markdown); HTML in `jobs.cover_letter_html`; PDF stored as JobDocument `GENERATED_LETTER` (`Anschreiben_<company>.pdf`).
- **CV**: only via `/generate-package` (`generate_cv=true`). AI tailors `cv_data` (`generate_tailored_cv`, uses `job.cv_draft` as "cv_notes"), rendered with user's DocumentTemplate (Jinja2) or file template `server/templates/cv/classic.html`; HTML in `jobs.cv_html`; PDF -> JobDocument `GENERATED_CV` (`Lebenslauf_<company>.pdf`). PDF engine WeasyPrint (`html_to_pdf`), fallback xhtml2pdf classic on OSError.
- **Template selection**: `user_profiles.cv_template` / `cover_letter_template` hold either a file key (`"classic"`) or a numeric DocumentTemplate id as string.
- **HTML editing loop**: `GET /jobs/{id}/documents/html?kind=cv|cover_letter` -> edit -> `PUT .../documents/html?kind=` -> `POST .../documents/render?kind=` (Celery `ai.render_document_pdf`, replaces the PDF JobDocument, WS `job_update` with `rendered_kind`).
- **DocumentTemplate** (`doc_type` CV | COVER_LETTER, `html`, `status` null|"processing", `is_admin`/global): user-uploaded CV templates (non-admin) are auto-annotated with Jinja2 placeholders by Celery `ai.fill_cv_template` (status "processing" -> null; on AI failure status reset to null and HTML left unannotated). No WS event on completion -> UI polls.
- **ProfileDocument** (`doc_type` REFERENCE | CERTIFICATE, label): optional attachments copied into the job as `ATTACHED_*` when `include_profile_documents=true` (only DB-stored blobs).

### AI provider routing
`system_settings.ai_task_routing` maps task -> `cloud` (OpenRouter, `openrouter_model`, `openrouter_api_key`) | `local` (OpenAI-compatible Ollama/LM Studio at `ollama_base_url`, `ollama_model`). Tasks + defaults: job_analysis=cloud, cover_letter=cloud, cv_tailoring=local, interview_prep=cloud, company_profile=cloud, deep_dive=cloud, extract_job_details=cloud, platform_name=cloud. NB: `POST /settings/upload-cv` bypasses routing (always OpenRouter, `get_current_model`). AI 404/auth errors set Redis `system:ai_404_error` and broadcast `ai_error`.

### Scheduling (Celery beat, every 60 s)
- `ai.check_platforms_for_crawl`: for active platforms with `setup_status='active'`, crawl when **today's weekday in `schedule_days` (0=Mon..6=Sun) and local time >= `schedule_time` "HH:MM"** (user `timezone`) and not yet crawled since that time. Platforms with no schedule are never auto-crawled. **`crawl_interval_minutes` is stored but not used by the scheduler.**
- `ai.cleanup_stale_redis_jobs`: removes crawl jobs older than 5 min from Redis.

---

## A.1 Auth & users (`routers/auth.py`)
| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| POST `/auth/login` | - | form-urlencoded `username`, `password` (OAuth2PasswordRequestForm) | `{status:"ok"}` + sets both cookies; 401 "Incorrect username or password" | 5/min | `login/page.tsx` |
| POST `/auth/refresh` | refresh cookie | - | `{status:"ok"}` + new access cookie; 401 if invalid/tv mismatch | 20/min; refresh token itself is not rotated | `components/AuthProvider.tsx` |
| POST `/auth/logout` | U | - | `{status:"logged out"}`, deletes cookies | `token_version += 1` (global logout) | `AuthProvider.tsx` |
| POST `/auth/change-password` | U | `{current_password:str, new_password:str}` (no strength rules) | `{status:"password updated"}`; 400 "Incorrect current password" | 5/min; does not bump tv | `account/components/PasswordChangeForm.tsx` |
| GET `/me` | U | - | `{id, username, is_admin}` | - | `AuthProvider.tsx` |
| GET `/users` | A | query `skip=0`, `limit=100` | `[{id, username, is_admin}]` | - | `admin/users/page.tsx` |
| POST `/users` | A | `{username, password}` | `{id, username, is_admin:false}`; 400 if exists | creates non-admin only | `admin/users/page.tsx` |
| DELETE `/users/{user_id}` | A | - | `{status:"deleted"}` | deletes jobs, profile, platforms, user (not history/docs/templates -> possible FK error) | `admin/users/page.tsx` |
| DELETE `/user/reset` | U | JSON body `{password}` | `{status:"reset complete", jobs_deleted, platforms_deleted, profile_deleted}`; 400 wrong pw | factory reset of own jobs/platforms/profile | `account/page.tsx` |

## A.2 Jobs (`routers/jobs.py`)
JobEntry columns: `id` (str uuid5), `title, company, description, match_score (float 0-100), reasoning, application_draft, cv_draft, cv_html, cover_letter_html, created_at, url, status, generation_error, notification_sent, user_id, is_favorite, is_archived, platform_id, company_domain, contact_persons (JSON), interview_prep_material (JSON string), recruiter_info (JSON), salary_benchmark (JSON), next_follow_up_at, notes`.

| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/jobs/counts` | U | query `is_archived=false` | `{status_counts:{<STATUS>:n,..., ARCHIVE:<total archived>}, domain_counts:[{domain:<company>, count}] desc}` (excl. SEEN) | - | `(dashboard)/components/Dashboard.tsx`, `listings/components/Listings.tsx` |
| GET `/jobs/domains` | U | - | sorted distinct `company` strings | - | **UNUSED** |
| GET `/jobs` | U | query `limit?` (none -> max 1000), `offset=0`, `filter_type` (`favorite`/`no_favorite`/`applications`), `sort_by` (`date` else score desc), `has_application?:bool`, `status_filter?`, `platform_id?`, `is_archived=false` | array of raw JobEntry rows (all columns incl. description/cv_html/cover_letter_html) | excludes SEEN | `hooks/useJobs.ts` |
| GET `/jobs/{id}` | U | - | `{id,title,company,company_domain,description,match_score,reasoning,application_draft,cv_draft,interview_prep_material,status,url,is_favorite,created_at,next_follow_up_at,contact_persons,recruiter_info,salary_benchmark,notes}` (NB: no `is_archived`, `platform_id`, `generation_error`) | - | `hooks/useJobPanel.ts`, `jobs/[id]/page.tsx`, `JobCard/JobInterviewTab.tsx` (refetch prep), `Dashboard.tsx`, `Listings.tsx` |
| POST `/jobs/{id}/analyze` | U | - | `{status:"started"}` | 10/min; Celery `ai.analyze_job` (force_reanalyze) -> updates score/reasoning, WS `job_updated` | `JobCard/JobOverviewTab.tsx` |
| POST `/jobs/{id}/generate` | U | optional `{improvement_notes?: str}` | `{status:"started"}` | 5/min; status=GENERATING; Celery `ai.generate_application` (letter only; refine if notes) | `Dashboard.tsx`, `Listings.tsx`, `JobCard/JobApplicationTab.tsx`, `jobs/[id]/page.tsx` |
| POST `/jobs/{id}/generate-package` | U | optional `{include_profile_documents=true, generate_cv=true, generate_letter=true}` | `{status:"started"}` | 5/min; status=GENERATING; Celery `ai.generate_application_package` (CV+letter in parallel, attach profile docs) | `JobCard/JobApplicationTab.tsx` (CV only: `{include_profile_documents:false, generate_cv:true, generate_letter:false}`) |
| POST `/jobs/{id}/submit-application` | U | - | always 501 | - | **UNUSED** (placeholder) |
| GET `/jobs/{id}/download` | U | - | PDF of `application_draft` (markdown->xhtml2pdf) attachment `Bewerbung_<company>.pdf` | - | `components/ApplicationModal.tsx` |
| POST `/jobs/{id}/cancel-generation` | U | - | `{status:"cancelled"}` | if GENERATING -> DRAFTED/OPEN (Celery task not revoked) | `Dashboard.tsx`, `Listings.tsx`, `JobApplicationTab.tsx`, `jobs/[id]/page.tsx` |
| DELETE `/jobs/{id}` | U | - | `{status:"archived"}` or `{status:"deleted"}` | archive or hard delete | `hooks/useJobs.ts` |
| POST `/jobs/bulk-delete` | U | `{job_ids:[str]}` | `{status:"success", archived, permanently_deleted}` | archive / hard delete | `useJobs.ts` |
| POST `/jobs/bulk-restore` | U | `{job_ids:[str]}` | `{status:"success", restored}` | un-archive | `useJobs.ts` |
| PATCH `/jobs/{id}/update-status` | U | `{status:str}` | `{status:"updated", new_status}` | no history, no validation | `useJobs.ts`, `jobs/[id]/page.tsx` |
| PATCH `/jobs/{id}` | U | `JobPatchRequest` all optional: `status, is_favorite, company_domain, contact_persons:list, recruiter_info:dict, salary_benchmark:dict, next_follow_up_at: ISO str, note (history note), notes, application_draft, cv_draft, is_archived` | `{status:"updated"}` | history row on status change | `useJobs.ts`, `jobs/[id]/page.tsx`, `JobCard/JobDocumentsTab.tsx` |
| GET `/jobs/{id}/history` | U | - | `[{id, from_status, to_status, changed_at, note}]` desc | - | `JobCard/JobStatusTab.tsx` |
| PATCH `/jobs/{id}/favorite` | U | - | `{status:"updated", is_favorite}` (toggle) | - | `useJobs.ts` |
| DELETE `/jobs` | U | query `keep_favorites=true`, `keep_applications=true`, `company?`, `permanent=false` | `{status:"archived"|"deleted", count}` | bulk archive / purge archived | `account/page.tsx` (archive all), `Listings.tsx` (per company, `permanent=isArchived`) |
| POST `/jobs/{id}/interview-prep` | U | - | `{status:"exists"|"queued", message, job_id}` | Celery `worker.generate_interview_prep_task` -> `interview_prep_material` JSON string; WS `interview_prep_ready` | `JobCard/JobInterviewTab.tsx`, `JobSidePanel/StepCard.tsx` |
| POST `/jobs/{id}/interview-prep/regenerate` | U | - | `{status:"queued",...}` | same task, forced | `JobInterviewTab.tsx` |
| POST `/jobs/{id}/documents` | U | multipart `file` (<=10 MB; pdf, doc, docx, jpeg, png, webp, txt) | `{id, original_filename, file_size, mime_type, uploaded_at, storage:"google_drive"|"database"}`; 413/415 | kind=UPLOADED | `JobCard/JobDocumentsTab.tsx` |
| GET `/jobs/{id}/documents` | U | - | `[{id, original_filename, file_size, mime_type, kind, uploaded_at}]` desc | - | `JobDocumentsTab.tsx`, `JobApplicationTab.tsx` (find GENERATED_CV/LETTER) |
| GET `/jobs/{id}/documents/{doc_id}/download` | U | - | file, `attachment` | gdrive -> 400 | `JobDocumentsTab.tsx`, `JobApplicationTab.tsx` |
| GET `/jobs/{id}/documents/{doc_id}/view` | U | - | file, `inline` | gdrive -> 400 | `JobDocumentsTab.tsx` |
| DELETE `/jobs/{id}/documents/{doc_id}` | U | - | `{status:"deleted"}` | - | `JobDocumentsTab.tsx` |
| GET `/jobs/{id}/documents/html` | U | query `kind=cv|cover_letter` | `{html}` (letter HTML lazily rendered from draft if missing) | may persist rendered letter HTML | `JobApplicationTab.tsx`, `components/editor/DocumentEditor.tsx` |
| PUT `/jobs/{id}/documents/html` | U | query `kind`; body `{html:str}` | `{ok:true}` | overwrites cv_html/cover_letter_html | `JobApplicationTab.tsx`, `DocumentEditor.tsx` |
| POST `/jobs/{id}/documents/render` | U | query `kind` | `{queued:true}`; 422 if no HTML | Celery `ai.render_document_pdf` -> replaces PDF doc, WS `job_update{status:DRAFTED, rendered_kind}` | `JobApplicationTab.tsx`, `DocumentEditor.tsx` |

## A.3 Dashboard / aggregate (`routers/dashboard.py`)
| Method & path | Auth | Request | Response | Notes | FE |
|---|---|---|---|---|---|
| GET `/status` | **none** | - | `{crawling:bool, ai_error:str|null}` (global Redis flags) | unauthenticated | `components/DashboardShell.tsx` |
| GET `/statistics` | U | - | `{total_jobs, applied_jobs, interviews, offers, rejected}` (total excl. archived/SEEN; others count incl. archived) | - | `(dashboard)/components/OverviewDashboard.tsx` |
| GET `/dashboard-data` | U | query `limit=10, offset=0, filter_type="all", sort_by="score", has_application?, status_filter?` | `{jobs:[raw JobEntry], system_crawling, active_crawls:[crawl-status job objects], ai_error}` | includes SEEN rows; calls scraper `/crawl-status` | `Dashboard.tsx`, `Listings.tsx` |
| GET `/settings-view` | U | - | `{profile: masked profile dict (all UserProfile columns, secrets = "__masked__"), platforms:[platform dicts w/ job_count, no seen_count/setup_status/url_pattern], active_crawls}` | creates empty profile if missing | `OverviewDashboard.tsx`, `profile/page.tsx`, `settings/page.tsx` |

## A.4 Platforms (`routers/platforms.py`)
PlatformResponse: `{id, url, name, favicon_url (google s2), crawl_interval_minutes, schedule_time "HH:MM"|null, schedule_days [0-6]|null, last_crawl_at, is_active, is_notification_enabled, notification_adapters:[str], pushover_template, resend_template, resend_recipients[], mailjet_template, mailjet_recipients[], smtp_template, smtp_recipients[], job_count, seen_count, setup_status ("pending_setup"|"active"), url_pattern}`.

| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/platforms` | U | - | `[PlatformResponse]` with job_count (non-SEEN) & seen_count | - | `JobPlatformsManager.tsx`, `Listings.tsx` |
| POST `/platforms` | U | `{url, crawl_interval_minutes=1440}` | PlatformResponse (setup_status pending_setup) | AI name generation (sync) | **UNUSED** (legacy, wizard uses `/platforms/setup`) |
| PATCH `/platforms/{id}` | U | `PlatformUpdate` all optional: `url` (same domain only, unique), `name`, `crawl_interval_minutes`, `schedule_time`, `schedule_days:[int]`, `is_active`, `is_notification_enabled`, `notification_adapters:[str]` (sets is_notification_enabled = len>0), `pushover_template`, `resend_template`, `resend_recipients`, `mailjet_template`, `mailjet_recipients`, `smtp_template`, `smtp_recipients`, (`setup_status`, `url_pattern` accepted but ignored) | PlatformResponse (job_count excludes archived here, seen_count=0) | URL change resets name to domain & favicon | `JobPlatformsManager.tsx` (many) |
| POST `/platforms/{id}/generate-name` | U | - | `{id, name}` | sync AI call (`platform_name`) | `JobPlatformsManager.tsx` |
| POST `/platforms/{id}/test-pushover` | U | - | `{ok:true}`; 400 creds missing; 500 fail | sends fake job "Senior Software Engineer @ Acme" with platform template | `JobPlatformsManager.tsx` |
| POST `/platforms/{id}/test-resend` | U | - | same; 400 if no recipients | | `JobPlatformsManager.tsx` |
| POST `/platforms/{id}/test-mailjet` | U | - | same | | `JobPlatformsManager.tsx` |
| POST `/platforms/{id}/test-smtp` | U | - | same | | `JobPlatformsManager.tsx` |
| DELETE `/platforms/{id}` | U | query `delete_listings`, `keep_favorites`, `keep_applications` (**all ignored**) | `{status:"deleted"}` | deletes **all** platform jobs + history + docs unconditionally, orphan CompanyProfiles, platform | `JobPlatformsManager.tsx` |
| DELETE `/platforms/{id}/jobs` | U | query `keep_favorites=true`, `keep_applications=true` | `{status:"deleted", deleted_count}` | hard delete platform jobs | **UNUSED** |
| POST `/platforms/{id}/crawl` | U | - | scraper response `{status:"Started", job_id}` | 400 if inactive or pending_setup; sets last_crawl_at; initial run if never crawled | `JobPlatformsManager.tsx` |
| GET `/platforms/{id}/preview-links` | U | - | `{links:[{url,text}]}` | scraper browser fetch (90 s) | **UNUSED** (legacy) |
| POST `/platforms/{id}/setup` | U | `{selected_urls:[str], run_initial_crawl=true}` | `{status:"ok", url_pattern}` | legacy pending_setup completion | **UNUSED** (legacy) |
| POST `/platforms/preview-links` | U | `{url}` (http/https validated) | `{links:[{url, text}]}` sorted by url, same-domain only | slow (render API, up to 90 s) | `JobPlatforms/PlatformSetupModal.tsx` |
| POST `/platforms/setup` | U | `{url, selected_urls:[str], run_initial_crawl=true, crawl_interval_minutes=60}` | PlatformResponse | creates platform (AI name), infers `url_pattern` (char-level common prefix trimmed to delimiter `/-_=?&.`), optional initial crawl (SEEN placeholders only) | `PlatformSetupModal.tsx` |

## A.5 Settings / profile / notifications (`routers/settings.py`)
UserProfile columns: `role, skills (comma str), min_salary (str), location, preferences (text), match_threshold (int), cv_data {experience:[{company,role,duration,description}], projects:[{name,tech_stack,description}], education:str}, job_urls[], cv_template, cover_letter_template, pushover_user_key, pushover_api_token*, resend_api_key*, resend_from_email, mailjet_api_key*, mailjet_secret_key*, mailjet_from_email, smtp_host, smtp_port, smtp_user, smtp_password*, smtp_from_email, email_global_recipient, active_notification_service (NONE/PUSHOVER/RESEND/MAILJET - legacy), language (de|en), timezone (IANA), spoken_languages[], active_storage_service (NONE|GOOGLE_DRIVE), google_drive_refresh_token*, google_drive_email` (* = masked as `"__masked__"` on read; sending `"__masked__"` back means "unchanged").

| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/settings` | U | - | masked profile dict (creates empty profile) | - | `AuthProvider.tsx`, `LanguageProvider.tsx` (plain fetch, not fetchWithAuth) |
| POST `/settings` | U | `SettingsData`: required `role, skills, min_salary, location, preferences, cv_data`; optional `job_urls, pushover_*, resend_*, mailjet_*, smtp_* (ignored!), active_notification_service="NONE", language, timezone (ignored), spoken_languages, cv_template, cover_letter_template, active_storage_service, google_drive_email, master_cv_template_id, master_cv_status (ignored)` | `{status:"saved"}` | **BUG: overwrites pushover_user_key, resend_from_email, mailjet_from_email, active_notification_service and the secret fields with null when omitted** (only the literal mask preserves them). `profile/page.tsx` omits them -> saving the profile wipes Pushover/Resend/Mailjet credentials. SMTP fields untouched. | `profile/page.tsx` |
| PATCH `/settings/template` | U | `{cv_template?, cover_letter_template?}` | `{status:"saved"}` | - | `profile/components/DocumentTemplateGallery.tsx` |
| DELETE `/settings` | U | - | `{status:"deleted"}` | resets role/skills/salary/location/preferences/cv_data/job_urls to defaults (keeps notifications) | `account/page.tsx` |
| POST `/settings/upload-cv` | U | multipart `file` (.pdf name check) | `{status:"success", data:{role, skills, min_salary, location, cv_data}}`; 400 no text; 500 AI fail | 10/min; sync AI parse (OpenRouter only); **overwrites** role/skills/(salary/location if present)/cv_data | `profile/page.tsx` |
| POST `/language-preference` | U | `{language:"de"|"en"}` (other -> de) | `{status, language}` | AI output language for all tasks | `LanguageProvider.tsx` |
| POST `/matching-preference` | U | `{match_threshold:int 0..100}` | `{status, match_threshold}` | drives auto-archive | `settings/page.tsx` |
| POST `/timezone-preference` | U | raw dict `{timezone}` (invalid -> Europe/Berlin) | `{status, timezone}` | used by scheduler | `settings/page.tsx` |
| POST `/notification-settings` | U | `NotificationSettingsData` all optional: pushover_user_key, pushover_api_token, resend_api_key, resend_from_email, mailjet_api_key, mailjet_secret_key, mailjet_from_email, smtp_host, smtp_port:int, smtp_user, smtp_password, smtp_from_email, email_global_recipient | `{status:"saved"}` | nulls overwrite non-secret fields; secrets kept if mask; email_global_recipient cannot be cleared | `settings/page.tsx` |
| POST `/notification-settings/test-pushover` | U | - | `{ok:true}` / 400 / 500 | sends test | `settings/page.tsx` |
| POST `/notification-settings/test-resend` | U | `{recipient?:str}` (fallback global recipient) | same | | `settings/page.tsx` |
| POST `/notification-settings/test-mailjet` | U | `{recipient?}` | same | | `settings/page.tsx` |
| POST `/notification-settings/test-smtp` | U | `{recipient?}` | same | | `settings/page.tsx` |
| POST `/notification-settings/test-email` | U | - | `{success, message}` | first configured email adapter -> global recipient | **UNUSED** |
| GET `/notification-templates` | U | query `type?` (upper-cased) | `[{id,name,type,content,is_admin,user_id,created_at}]` (admin first) | - | `JobPlatformsManager.tsx`, `components/TemplateManager.tsx` |
| POST `/notification-templates` | U | `{name, type: PUSHOVER|RESEND|MAILJET, content}` (**SMTP type rejected 400**) | template | - | `TemplateManager.tsx` |
| PUT `/notification-templates/{id}` | U | `{name?, content?}` (own, non-admin only) | template | - | `TemplateManager.tsx` |
| DELETE `/notification-templates/{id}` | U | - | `{ok:true}` | - | `TemplateManager.tsx` |

Notification delivery (`workers/notifications/*`): per platform `notification_adapters` (PUSHOVER = immediate per job; RESEND/MAILJET/SMTP = queued per crawl in Redis and sent as one digest at crawl completion, or immediately for single imports). Platform-level template & recipient lists override; global recipient used by settings tests.

## A.6 Companies (`routers/companies.py`)
CompanyProfile is **global (not user-scoped)**, keyed by `domain`; all users see all profiles.
| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/companies` | U | - | `[{id, domain, name, description, meta, executive_summary, analysis[], key_insights, risks[], market_comparison, deep_dive_buttons[], online_resources, analyzed_at}]` ordered by name | - | `companies/page.tsx` |
| GET `/companies/{domain}` | U | - | same single object; 404 if none | - | `JobCard/JobCompanyTab.tsx` |
| POST `/companies/{domain}/analyze` | U | body `{force_refresh=false}` | `{status:"exists"|"queued", domain, message}` | Celery `worker.generate_company_profile` (uses up to 3 jobs with that domain from any user + requesting user's profile) -> WS `company_profile_ready{domain}` | `companies/page.tsx`, `JobCompanyTab.tsx` |
| POST `/companies/{domain}/deep-dive` | U | `{focus, how_to_proceed, company_name, title, language="de"}` | `{result: markdown}` | **synchronous** AI call (deep_dive routing), result not persisted | `components/CompanyProfileView.tsx`, `JobCard/JobInterviewTab.tsx` |

Company profile JSON shape (from prompt): `meta{company,role,region,language}`, `executive_summary{assessment, confidence, suitable_for, not_suitable_for}`, `analysis[{area, assessment, evidence_basis, confidence, key_uncertainty}]` (5 fixed areas), `key_insights{facts[], interpretations[], uncertainties[]}`, `risks[{title, probability, impact, description}]`, `market_comparison{summary, comparison_points[{dimension, relative_position, comment}]}`, `deep_dive_buttons[{title, focus, why_it_matters, how_to_proceed, linked_findings}]` (8-10), `online_resources`.
Interview prep JSON (`interview_prep_material`, string-encoded): `meta`, `report_output{executive_summary, deep_dive_analysis}`, `structured_prep{gap_analysis[{requirement, cv_status, gap_severity, interview_strategy}], elevator_pitch}`, `deep_dive_buttons[...]`, `confidence_assessment{overall_confidence, uncertainties[]}`, `social_intelligence_research{potential_contacts[], insights_from_contacts[], research_sources[]}`, `online_resources`; on parse failure `{error, raw_response}`.

## A.7 Admin (`routers/admin.py`) - all A
| Method & path | Request | Response | Side effects | FE |
|---|---|---|---|---|
| GET `/admin/settings` | - | `{openrouter_model, openrouter_api_key_set:bool, ollama_model, ollama_base_url, ai_task_routing:{task: "cloud"|"local"} (merged with defaults)}` | - | `admin/settings/page.tsx` |
| POST `/admin/settings` | `{openrouter_model?, openrouter_api_key? ("" clears), ollama_model?, ollama_base_url?, ai_task_routing?: dict[str,str]}` | same + `status:"updated"` | - | `admin/settings/page.tsx` |
| DELETE `/admin/clear-ai-error` | - | `{status:"cleared"}` | clears Redis flag, WS `ai_error_cleared` | **UNUSED** |
| POST `/admin/redis/cleanup` | - | `{removed:n}` | removes non-completed crawl jobs > 5 min | `admin/settings/page.tsx` |
| GET `/admin/openrouter/models` | - | `[{id, name, context_length, pricing}]` sorted; 400 no key; 502 | - | `admin/settings/page.tsx` |
| POST `/admin/test/openrouter` | - | `{ok, model}`; 400/502 | 1-token completion | `admin/settings/page.tsx` |
| POST `/admin/test/ollama` | - | `{ok, model, model_found, available_models[]}`; 502 | GET `<base>/models` | `admin/settings/page.tsx` |
| POST `/admin/database/wipe` | `{password, wipe_all_users=false}` | `{status:"success"}`; 401 wrong pw | own jobs/platforms (+orphan companies) or EVERYTHING (jobs, history, docs, platforms, companies; users/profiles kept) | `admin/settings/page.tsx` |
| POST `/admin/notification-templates` | `{name, type PUSHOVER|RESEND|MAILJET, content}` | template (is_admin, global) | - | `TemplateManager.tsx` (admin mode) |
| PUT `/admin/notification-templates/{id}` | `{name?, content?}` | template | - | `TemplateManager.tsx` |
| DELETE `/admin/notification-templates/{id}` | - | `{ok:true}` | - | `TemplateManager.tsx` |

## A.8 Storage (`routers/storage.py`, prefix `/storage`)
| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/storage/google/login` | U | - | 302 to Google OAuth (scopes drive.file + userinfo.email, `state=<user_id>` unsigned) | needs `GOOGLE_CLIENT_ID` (500 otherwise) | `settings/page.tsx` (`window.location.href`) |
| GET `/storage/google/callback` | **none** | query `code`, `state` | 302 to `${FRONTEND_URL}/settings?tab=storage&success=google_connected` or `/settings?error=google_auth_failed` | stores refresh token+email, sets GOOGLE_DRIVE active. Security: trusts `state` as user id | Google redirect; settings page only *displays* the callback URL (hard-coded host:8002) |
| POST `/storage/google/disconnect` | U | - | `{status:"disconnected"}` | clears tokens, NONE | `settings/page.tsx` |
| POST `/storage/toggle` | U | raw JSON `{service: "NONE"|"GOOGLE_DRIVE"}` | `{status, service}`; 400 if Drive not connected | - | `settings/page.tsx` |

## A.9 Profile documents & templates (`routers/profile_documents.py`, `routers/templates.py`)
| Method & path | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| GET `/profile/templates` | U | - | `{cv:["classic"], cover_letter:["classic"]}` (file templates in `server/templates/`) | - | `profile/page.tsx` |
| GET `/profile/documents` | U | - | `[{id, doc_type, label, original_filename, file_size, mime_type, created_at}]` | - | `profile/page.tsx` |
| POST `/profile/documents` | U | multipart `file`, `doc_type` REFERENCE|CERTIFICATE, `label=""` (<=10 MB; pdf, jpeg, png, webp, doc, docx) | doc dict | Drive or DB | `profile/page.tsx` |
| DELETE `/profile/documents/{id}` | U | - | `{status:"deleted"}` | - | `profile/page.tsx` |
| GET `/profile/documents/{id}/download` | U | - | file attachment (DB only, else 400) | - | **UNUSED** |
| GET `/profile/documents/{id}/view` | U | - | file inline | - | **UNUSED** |
| GET `/document-templates` | U | query `doc_type?` CV|COVER_LETTER | `[{id, doc_type, name, is_admin, user_id, status, created_at, updated_at}]` (global + own) | - | `DocumentTemplateGallery.tsx`, `profile/page.tsx` |
| GET `/document-templates/{id}/html` | U | - | `{html}` | - | `DocumentTemplateGallery.tsx` (preview + polling) |
| POST `/document-templates` | U | `{doc_type, name, html, is_admin=false}` (is_admin honoured only for admins); scripts & `on*` attrs stripped | template (status "processing" for user CV templates) | Celery `ai.fill_cv_template` for non-admin CV | `DocumentTemplateGallery.tsx` |
| PUT `/document-templates/{id}` | U | `{name?, html?}` own only | template | - | **UNUSED** |
| DELETE `/document-templates/{id}` | U | own only | `{ok:true}` | - | `DocumentTemplateGallery.tsx` |

## A.10 Scraper service (`server/scraper_api.py`, internal :8081, exposed via API proxy `/{GET,POST,PUT,PATCH,DELETE} /scraper/{path}` which forwards cookies)
| Method & path (public) | Auth | Request | Response | Side effects | FE |
|---|---|---|---|---|---|
| POST `/scraper/search` | U | `{query: url, location: str (required, unused), platform_id?, is_initial_run=false}` | `{status:"Started", job_id}` or `{status:"Error", message}` | Celery chain `scraper.fetch_links` -> `ai.filter_urls` -> `scraper.schedule_crawls` -> per URL `scraper.scrape_detail` -> `ai.analyze_job`; Redis `crawl_job:<id>` | `Dashboard.tsx` (ad-hoc URL search) |
| POST `/scraper/import-job` | U | `{url}` | `{status:"Started", job_id}` | single-URL import (total=1), WS `crawl_job_started` | `listings/components/Listings.tsx` |
| GET `/scraper/crawl-status` | U | (FE adds `?user_id=` - ignored) | `{jobs:[{job_id, platform, total, total_found, scraping_completed, analysis_completed, jobs_saved, status (starting/fetching_links/crawling/completed/...), error_message, started_at (ms str), all_job_titles[]}]}` | - | `hooks/useCrawl.ts` |
| POST `/scraper/cancel-crawl` | U | `{job_id}` | `{status:"success"|"error", message}` | revoke tasks, WS `crawl_job_cancelled` | `useCrawl.ts` |
| POST `/scraper/cancel-all-crawls` | U | - | `{status:"success", cancelled:[ids]}` | same for all | `useCrawl.ts` |
| POST `/scraper/preview-links` | U | `{url}` | `{links}` | - | **UNUSED** directly (API uses it internally) |
| POST `/scraper/fail-crawl` | U | `{job_id, error_message}` | `{status, message}` | WS `crawl_job_failed`. NB: workers call it **without** a cookie -> 401, so AI failures during a crawl do not actually fail the crawl (stale-cleanup after 5 min catches it) | internal only |

## A.11 WebSocket `/ws`
- URL: `ws(s)://<API>/ws` (FE: `NEXT_PUBLIC_API_URL` with http->ws). Auth: `access_token` cookie validated incl. token_version; otherwise close code **1008**. No auth refresh over WS; server ignores incoming client messages (keep-alive only).
- Server side: Redis pub/sub channel `job_updates` -> `ConnectionManager.broadcast`: if payload has top-level `user_id` -> only that user's sockets; **otherwise broadcast to ALL connected users**.
- Message types (all JSON):

| type | Payload | Emitted by | Scope |
|---|---|---|---|
| `crawl_job_started` | `job_id, user_id, platform (url), started_at (ms str)` | scraper_worker fetch_links, `/import-job` | user |
| `crawl_job_progress` | `job_id, user_id, platform, total, total_found, completed:0` or `scraping_completed` | scraper_worker | user |
| `crawl_job_extracting` | `job_id, user_id, platform, extracting_count, total` | scraper_worker scrape_detail | user |
| `job_analysis_started` | `job_id (=crawl id), user_id, job_title, analysis_completed` | analyze | user |
| `job_skipped` | `job_id (crawl), user_id, job_title, jobs_skipped` | analyze | user |
| `job_analysis_finished` | `job_id (crawl), user_id, job_title, jobs_saved` | analyze | user |
| `new_job` | `crawl_job_id, job:{id,title,company,description,match_score,reasoning,url,status,is_archived,created_at,user_id}` | analyze / save_job_basic | **ALL users** (user_id only nested) - privacy leak |
| `job_updated` | same as new_job (after manual re-analyze) | analyze | **ALL users** |
| `crawl_job_completed` | `job_id, user_id, total, total_found` | crawl_status / scraper_worker | user |
| `crawl_completed` | `{}` | crawl_status / scraper_worker | ALL |
| `crawl_job_failed` | `job_id, user_id, reason:"error", error_message?` | scraper_api / scraper_worker | user |
| `crawl_job_cancelled` | `job_id, user_id, reason:"cancelled"` | scraper_api cleanup | user |
| `job_update` | `job_id, user_id, status (DRAFTED/FAILED), application_draft?, cover_letter_generated?, rendered_kind?, error?` | application / package / render tasks | user |
| `global_error` | `message` | application (no profile) | ALL |
| `interview_prep_ready` | `job_id` | research | ALL |
| `company_profile_ready` | `domain` | research | ALL |
| `ai_error` | `message` | intelligence.store_ai_404_error | ALL |
| `ai_error_cleared` | `{}` | clear_ai_404_error | ALL |

## A.12 Endpoints with no frontend caller (summary)
`GET /jobs/domains`, `POST /jobs/{id}/submit-application` (501 stub), `POST /platforms` (legacy create), `DELETE /platforms/{id}/jobs`, `GET /platforms/{id}/preview-links`, `POST /platforms/{id}/setup` (legacy wizard), `POST /notification-settings/test-email`, `DELETE /admin/clear-ai-error`, `GET /profile/documents/{id}/download`, `GET /profile/documents/{id}/view`, `PUT /document-templates/{id}`, `POST /scraper/preview-links`, `POST /scraper/fail-crawl` (internal). `GET /storage/google/callback` is only hit by Google.
Also unused request fields: `DELETE /platforms/{id}` query params (ignored server-side), `SettingsData.master_cv_template_id/master_cv_status/timezone/smtp_*`, `PlatformUpdate.setup_status/url_pattern`, `PlatformCreate`, `JobSearch.location`.

## A.13 Notable backend issues relevant to the rewrite
1. `POST /settings` wipes Pushover/Resend/Mailjet credentials + `active_notification_service` when the body omits them (current profile page does exactly that).
2. WS events `new_job`, `job_updated`, `interview_prep_ready`, `company_profile_ready`, `global_error`, `ai_error*`, `crawl_completed` are broadcast to every connected user. New UI must filter by its own data (e.g. `job.user_id`) and not trust them blindly.
3. `/dashboard-data` includes `SEEN` placeholders; `/jobs` excludes them.
4. `crawl_interval_minutes` is not used by the scheduler (only `schedule_time` + `schedule_days`).
5. CompanyProfiles are shared across users.
6. Cancel of `/generate-package` is not honoured by the task.
7. No status validation; `update-status` writes no history while `PATCH /jobs/{id}` does.
8. Notification templates cannot have type SMTP (400) although platforms have `smtp_template`.
9. `/status` and `/storage/google/callback` are unauthenticated; OAuth `state` = raw user id.
10. `CV notes`: server reads `job.cv_draft` as CV tailoring notes; `GeneratePackageRequest` has no `cv_notes` field.

---

# Part B - Current frontend feature inventory (`frontend/app/**`)

Paths relative to `frontend/app/`. `API` = `${NEXT_PUBLIC_API_URL}`. Unless stated otherwise every call goes through `fetchWithAuth` (cookie auth, one 401 -> refresh -> retry). "LS" = localStorage.

## B.0 Stack, build, runtime config

- Next.js 16.1.3 App Router, React 19.2.3, TypeScript 5, Tailwind v4 (`@tailwindcss/postcss`, `@tailwindcss/typography` plugin), `lucide-react` icons, `react-markdown` (renders AI output: reasoning, description, interview/company deep-dive results, application draft), `pino` logger (`lib/logger.ts`, level from `NEXT_PUBLIC_LOG_LEVEL`, pino-pretty in dev). `@dnd-kit/*` is a dependency but **unused** (board drag&drop uses native HTML5 DnD). Fonts: Geist / Geist Mono via `next/font/google`.
- Every page/component is a client component (`"use client"`), except `listings/page.tsx`, `archive/page.tsx`, `(dashboard)/page.tsx` (thin server wrappers). No server-side data fetching, no route handlers, no middleware, no `rewrites` (`next.config.ts` only `output: "standalone"`). Browser calls the FastAPI origin directly (cross-origin, `credentials: "include"`) -> backend CORS with credentials required.
- Root layout (`layout.tsx`): `<html lang="en" translate="no" suppressHydrationWarning>`; provider nesting `LanguageProvider > AuthProvider > NotificationProvider > Suspense > DashboardShell > children`. Metadata title/description "Ai Job Agent".
- **Env vars used in code**: `NEXT_PUBLIC_API_URL` (~100 usages, all API calls + WebSocket URL by replacing `^http` with `ws`), `NEXT_PUBLIC_LOG_LEVEL` (logger), `NODE_ENV`. One dead fallback `window.__ENV__?.APP_API_URL` in `CompanyProfileView` (nothing sets `__ENV__`).
- **Runtime injection (prod)**: `Dockerfile` (node:20.18-alpine, 3-stage deps/builder/runner, standalone output, user `nextjs`) builds with `NEXT_PUBLIC_API_URL=APP_API_URL` (literal placeholder; also in `.env.production`). Entrypoint `env.sh`: requires `APP_PREFIX` + `ASSET_DIR`; for every env var starting with `APP_PREFIX` it `sed -i "s|KEY|VALUE|g"` over all files in `ASSET_DIR`, then `exec "$@"` (`node server.js`). `docker-compose.yml` sets `APP_PREFIX=APP_`, `ASSET_DIR=./.next/static`, `APP_API_URL=${APP_API_URL:-http://localhost:8002}`. Caveats: only `.next/static` is patched (server chunks keep the literal, harmless because no SSR fetch); prefix match `APP_` would replace any `APP_*` token in bundles; `continue` outside loop in env.sh. `.env.production` also carries unused `DATABASE_URL`, `CELERY_*` keys.
- **Dev**: `Dockerfile.dev` (`npm install`, `npm run dev`), `docker-compose.dev.yml` passes `NEXT_PUBLIC_API_URL=${APP_API_URL:-http://localhost:8002}` directly.
- **Dark mode**: Tailwind `darkMode: "class"` (tailwind.config.ts) + Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`. `ThemeToggler` toggles `.dark` on `<html>`, persists LS `theme` = `light|dark`; initial = LS value or `prefers-color-scheme: dark`. No SSR script -> flash of light theme possible (toggler returns null until mounted). `globals.css` also defines utility classes `.glass-panel`, `.glass-card`, `.text-gradient`, keyframes `shimmer`, `dropdownFade`, `popupEntry`, `backdropFade`, custom scrollbar + selection colours for both themes. Theme toggle rendered fixed bottom-right (desktop and login page) and in the mobile "More" sheet.
- **Lint/format/tests**: `eslint.config.mjs` = `eslint-config-next` core-web-vitals + typescript, with `no-explicit-any`, `no-unused-vars`, `exhaustive-deps`, `set-state-in-effect`, `no-require-imports` downgraded to **warn**. Prettier (default config, no rc file), `npm run format`. Husky `pre-commit` -> `npx lint-staged` (`eslint --fix` + `prettier --write` on js/ts/jsx/tsx). `parse_eslint.py` = helper to print an `eslint_report.json` (UTF-16LE). **No tests** (no jest/vitest/playwright, no test files). README is the create-next-app boilerplate.

## B.1 Cross-cutting infrastructure

### AuthProvider / fetchWithAuth (`components/AuthProvider.tsx`)
- `fetchWithAuth(input, init)`: forces `credentials: "include"`; on 401 calls `POST API/auth/refresh` (plain fetch) once; if refresh ok, retries original request once; returns response (no redirect itself). Concurrent 401s each trigger their own refresh (no de-dup/lock).
- Context: `user {id, username, is_admin, is_profile_complete}`, `token` (sentinel string `"__session__"` or null - no JS-visible token; auth is httpOnly cookie), `isAuthenticated`, `isLoading`, `login()`, `logout()`, `refreshUser()`.
- On mount: `GET /me` (via fetchWithAuth) -> if ok, `GET /settings` to derive `is_profile_complete = settings.role.trim().length > 0` (client-only rule). Failure -> user null.
- `login()` = re-run fetchUserData then `router.push("/")` (login page itself POSTs credentials). `logout()` = `POST /auth/logout` (plain fetch) -> clear state -> `/login`.
- Redirects: `DashboardShell` pushes to `/login` when `!isLoading && !user` on any non-login route; full-screen spinner while loading. Many hooks call `logout()` on a 401 that survived refresh (`useJobs`, `useJobPanel`, Dashboard/Listings initial load, OverviewDashboard, jobs/[id]). Admin pages client-side redirect non-admins to `/`.
- Plain `fetch` (no refresh retry) used in: `LanguageProvider` (`GET /settings`, `POST /language-preference`), login (`POST /auth/login`), `Listings` import (`POST /scraper/import-job`), `StepCard` (`POST /jobs/{id}/interview-prep`), dead `Dashboard` (`POST /scraper/search`, no credentials).

### LanguageProvider + i18n (`components/LanguageProvider.tsx`, `lib/languages.ts`)
- Languages: `en`, `de` (`type Language = "en" | "de"`). Default state `de`; on mount: LS `language` -> else browser language (`en`/`de`) -> then authoritative `GET /settings` `.language` (overrides and writes LS). `setLanguage(lang)` writes LS and fire-and-forget `POST /language-preference {language}`.
- `t(key, vars?)`: `translations[lang][key] || translations.en[key] || key`; `{name}` placeholders replaced via `String.replace` (first occurrence only). Some call sites do their own `.replace("{company}", ...)`.
- `lib/languages.ts`: single object `translations = { en: {...}, de: {...} }`, flat camelCase keys grouped by comments; `TranslationKey = keyof typeof translations.en` (typed). **508 keys in en, 508 in de, identical key sets, no duplicates.**
- Usage: ~416 keys referenced literally (`t("x")`, `labelKey`, `textKey`, `nextActionKey`, `nudgeKey`, `shortLabelKey`, `headlineMsgkey`) plus dynamic: `t(tab as any)` (settings tabs general/notifications/storage), `DAY_KEYS` (dayMon..daySun), admin task routing labels built as `task${PascalCase(key)}` (taskJobAnalysis, taskCoverLetter, taskCvTailoring, taskInterviewPrep, taskCompanyProfile, taskDeepDive, taskExtractJobDetails, taskPlatformName).
- Keys used but **missing** (cast `as any`, fall back to literal): `archive`, `archived`, `dragDropHere`, `dragToArchive`, `dropToArchive`, `rotate`, `zoomIn`, `zoomOut`.
- Apparently unused keys (~80 after removing dynamic ones), notably the whole Mailjet settings block (`mailjetApiKey`, `mailjetSecretKey`, `mailjetFromEmail`, `mailjetRecipients`, `mailjetSave`, `mailjetSetupGuide`, `mailjetStep1-5`) -> Mailjet settings card was removed from UI; also `globalEmail*`, `every*Hours/everyWeek` (old interval UI), `historyTab`, `followUpDue`, `needsAttention`, `exporting/exported/manualExport`, `listingsPageTitle/Subtitle`, `archiveEmpty`, etc.
- **Large amount of hard-coded German UI text not in i18n**: JobApplicationTab (all labels, generation phases, "Anschreiben/Lebenslauf"), JobInterviewTab, JobCompanyTab, CompanyProfileView section titles, DocumentTemplateGallery, PlatformSetupModal, NotificationAdaptersModal, Email/Pushover template modals, TemplateManager, jobs/[id] tab labels ("Übersicht", "Bewerbung", ...), hook error strings ("Fehler beim Laden der Jobs."), Listings import errors. Hard-coded English: companies page ("Search company...", "No Profile", "Start Analysis", "Update Data"), admin settings page (most text), AIErrorBanner, CrawlStatus error. Date formatting hard-coded `de-DE` / `en-US` in places. `LanguageToggler` component exists but is unused (language is switched in Settings > General).

### NotificationProvider (`components/NotificationProvider.tsx`)
- Global `showError(detail)` (sticky until dismissed) and `showSuccess(detail)` (auto-clear 5 s). Rendered by `DashboardShell` above page content as `AIErrorBanner` (title "Error"; shows `detail` only to admins, others see generic "An error occurred. Please try again.") and `SuccessBanner`.
- `DashboardShell` on user load calls `GET /status` and shows `data.ai_error` (persisted AI error from Redis) as error banner. `useCrawl` also pushes WS `ai_error` messages into it.

### DashboardShell (`components/DashboardShell.tsx`) - app chrome
- Login route: renders children only + floating ThemeToggler.
- Desktop: fixed left sidebar (collapsible 224px <-> 68px, state not persisted), logo "AI JobAgent", nav from `lib/navigation.ts`: Dashboard `/`, Listings `/listings`, Profile `/profile`, Settings `/settings`, Account `/account`, Companies `/companies`, Archive `/archive`; admin section (only `is_admin`): User Management `/admin/users`, System Settings `/admin/settings` (literal label). Active state by exact/startsWith match (`filterParam` support unused). Footer: avatar initial, username, role label (Admin/Member) with pulse dot, Logout (`UserMenu`); collapsed: avatar + logout icon. Collapse toggle button.
- Mobile: top bar (logo + avatar + username); bottom nav (Dashboard, Listings, Profile, Settings + "More"); "More" slide-up sheet with Account/Companies/Archive, admin items, dark-mode toggle row, Logout. Closes on navigation.
- Main area: max-w-7xl container, error/success banners, children. Icons resolved dynamically by name from `lucide-react` (`import *` -> whole icon set bundled).

### Shared small components
- `ConfirmModal`: portal modal, title/message/children slot, confirm/cancel text, destructive styling, `confirmDisabled`, `keepOpenOnConfirm`, locks body scroll, 300 ms exit animation.
- `Portal`, `PageWrapper` (fade/slide-in wrapper), `PageHeader` (title+subtitle), `PasswordInput` (show/hide eye toggle, `autoComplete=new-password`), `AutoResizeTextarea`, `SuccessBanner`, `AIErrorBanner`, `UserMenu` (logout button).
- `JobStatusBadge.tsx`: exports `type JobStatus = OPEN|DRAFTED|APPLIED|INTERVIEW|REJECTED|OFFER|ACCEPTED|GENERATING|FAILED` (used everywhere); its default badge/dropdown component is **unused**.
- `JobCard/constants.ts`: `STATUS_PIPELINE = [OPEN, DRAFTED, APPLIED, INTERVIEW, OFFER, ACCEPTED]`; `STATUS_META` (icon, labelKey, colour classes for OPEN..ACCEPTED, REJECTED, FAILED, GENERATING, pseudo `ARCHIVE`); `STATUS_GUIDANCE` per status (nextActionKey, 4 checklist items with optional `id` has_draft/has_followup/has_prep, `tabHint`, `linkHint: "url"`, `descHint`, nudgeKey) - all client-side workflow content.

## B.2 Hooks

### `hooks/useJobs.ts`
- Paged list: `GET /jobs?limit=10&offset=N&sort_by=score|date[&filter_type=favorite|no_favorite|applications][&has_application=true][&status_filter=S][&platform_id=N][&is_archived=true]`; reset on any filter change; append with de-dup; `hasMore = page.length >= 10`; optional `initialJobs` skips first fetch (offset starts at 10).
- Actions: `confirmDeleteJob` -> `DELETE /jobs/{id}` (semantics archive vs permanent decided by backend; UI labels it "archive" in listings and "delete permanently" in archive); `handleToggleFavorite` -> `PATCH /jobs/{id}/favorite` (response `{is_favorite}`); `handleUpdateStatus` -> `PATCH /jobs/{id}/update-status {status}` (optimistic only after success); `updateJob` -> `PATCH /jobs/{id} {partial}` (removes row from view if `is_archived` changes); `bulkDeleteJobs` -> `POST /jobs/bulk-delete {job_ids}`; `bulkRestoreJobs` -> `POST /jobs/bulk-restore {job_ids}`. Errors -> `globalError` (German strings incl. `detail`).

### `hooks/useCrawl.ts`
- Initial: `GET /scraper/crawl-status?user_id={id}` -> `{jobs: CrawlJob[]}` (non-completed kept) unless initial data passed.
- `cancelCrawl(jobId)` -> `POST /scraper/cancel-crawl {job_id}`; `cancelAllCrawls()` -> `POST /scraper/cancel-all-crawls`; `crawlToCancel` + `confirmCancelCrawl` for ConfirmModal flow.
- WebSocket `new WebSocket(API.replace(/^http/,"ws") + "/ws")` (cookie-authenticated, 100 ms delayed connect to dodge StrictMode). **No reconnect logic** (`reconnectTimeoutRef` never set; `onclose` just nulls ref). Each component using the hook opens its own socket (Listings + JobPlatformsManager each have one).
- Handled message types (filtered by `data.user_id === user.id` where noted): `crawl_job_started` {job_id, platform, started_at} (user); `crawl_job_progress` {job_id, platform, total, total_found, scraping_completed} (user); `crawl_job_extracting` {job_id, extracting_count, total} (user); `job_analysis_started` {job_id, job_title, analysis_completed} (user); `job_analysis_finished` {job_id, job_title} (user); `crawl_job_completed` {job_id, total, total_found} (user) -> `show_success`, removed after 5 s; `crawl_completed` (global, clears non-success entries); `crawl_job_failed` {job_id, error_message|reason} (user) -> removed after 5 s; `crawl_job_cancelled` (user); `job_skipped` {job_id, job_title} (user) -> `jobs_skipped++`; `new_job` {job, crawl_job_id} -> `onNewJob`, `jobs_saved++`; `job_update` {job_id, ...fields} -> `onJobUpdate`; `job_updated` {job} (after manual re-analysis) -> `onJobUpdate({...job, job_id})`; `interview_prep_ready` {job_id}, `company_profile_ready` {domain} -> `onJobEvent`; `global_error` {message} (8 s); `ai_error` {message} -> global banner; `ai_error_cleared`.
- `CrawlJob` shape (`(dashboard)/components/CrawlStatus.tsx`): job_id, platform (URL), total, total_found, scraping_completed, analysis_completed, jobs_saved, jobs_skipped, status (starting|crawling|failed|completed), error_message, started_at, current_job_title, show_success, analyzing_jobs[], all_job_titles[], extracting_count.

### `hooks/useJobPanel.ts`
- Side-panel selection synced to URL `?job=<id>` on `/listings` (`router.replace`, no scroll). On mount with token: restores panel from `?job=` via `GET /jobs/{id}`. `openPanel`, `closePanel`, `updateSelectedJob` (propagates to list), `syncFromJobs` (list -> panel).

## B.3 Routes / pages

### `/login` (`login/page.tsx`)
- Fields: username (text), password (PasswordInput with reveal). Submit `POST /auth/login` as `application/x-www-form-urlencoded` (`username`, `password`), credentials include; ok -> `login()` (fetch /me + /settings, redirect `/`). Errors: `authFailed` (non-ok), `systemUnreachable` (network). Floating theme toggle. No "remember me", no registration, no password reset.

### `/` Dashboard overview (`(dashboard)/page.tsx` -> `OverviewDashboard.tsx`)
- Loads in parallel `GET /statistics` (`{total_jobs, applied_jobs, interviews, offers, rejected}`) and `GET /settings-view` (`platforms`, `profile`).
- Loading: skeleton (5 stat tiles + block).
- "Setup required" warnings (client-computed): profile incomplete if `role` or `skills` empty -> link `/profile`; no notification adapter configured (client rule: Pushover needs user_key+api_token; Resend api_key+from_email; Mailjet api_key+secret+from_email; SMTP host+user+password; Gmail not considered) -> link `/settings`.
- 5 clickable stat tiles: Total -> `/listings`, Applied/Interview/Offer/Rejected -> `/listings?status=X`.
- Embeds `JobPlatformsManager` (initial platforms from settings-view, `configuredAdapters`).

### JobPlatformsManager (`(dashboard)/components/JobPlatformsManager.tsx`) - platform management on dashboard
- Header "Job platforms" + subtitle; transient status line (startingCrawler, crawlJobsDispatched, error messages, 3 s).
- **Add platform** (`AddPlatformInput`): URL input + add button, Enter submits; disabled with hint when profile incomplete; client validation (valid URL, http/https), duplicate check against existing platform URLs (`platformAlreadyExists`); success opens setup wizard (`setupUrl`) - platform is not created yet (deferred creation). (Full-screen "adding" overlay exists but `isAddingPlatform` is never set true -> dead.)
- Setup wizard state persisted in URL `?setup_url=` (survives reload); legacy platforms with `setup_status === "pending_setup"` auto-reopen wizard; crawl trigger on pending platform or 400 "Platform setup not completed" reopens wizard.
- **PlatformSetupModal** (portal): favicon via Google s2 service, hostname. Phases: `loading` -> `POST /platforms/preview-links {url}` -> `{links:[{url,text}]}`; client-side pattern detection (group links by first 1-2 path segments, or full path when query string; largest group >= 2 links) -> `auto` phase (pattern badge, up to 8 preview cards, "+N more") or `manual` phase (pre-select links with >= 3 path segments; filter input over url/text, select all/none for filtered, checkbox list with origin dimmed). Switch auto<->manual. Confirm -> `confirm_run` phase with 2 options: "Bekannte Jobs vormerken" (mark currently listed jobs as known; sends `run_initial_crawl: true` = initial seeding run) vs "Sofort starten" (sends `run_initial_crawl: false`; first real run analyses all). Back to selection. `saving` -> `POST /platforms/setup {url, selected_urls, run_initial_crawl}` (backend infers url_pattern) -> onComplete refetch. Errors shown in manual phase ("Links konnten nicht geladen werden.", detail, "Netzwerkfehler.").
- Platform list (sorted by id desc) of **PlatformCard**:
  - Favicon (`favicon_url`, hidden on error), name, inline edit name (Enter/Escape, check/cancel) -> `PATCH /platforms/{id} {name}`; "AI Generate Name" button -> `POST /platforms/{id}/generate-name`.
  - URL link (new tab) + inline edit URL -> `PATCH /platforms/{id} {url}`; client blocks domain change (silently reverts).
  - Badges: "deactivated", "crawl in progress" spinner.
  - Actions column: cancel running crawl (-> ConfirmModal -> `POST /scraper/cancel-crawl`), Scan now -> `POST /platforms/{id}/crawl` (disabled when busy/inactive; 404 -> refetch list), Delete -> ConfirmModal with hard-coded German warning that all linked jobs, applications, ... are irreversibly removed -> `DELETE /platforms/{id}?delete_listings=true&keep_favorites=false&keep_applications=false` (keep options not exposed), Active toggle -> `PATCH /platforms/{id} {is_active}`. All disabled while busy.
  - **PlatformStats** chips: job count (click -> `/listings?platform_id=&platform_name=`), "URLs cached" indicator when `seen_count > 0 && job_count === 0`, last scan (`last_crawl_at`, dd.mm.yyyy hh:mm) or "never scanned", **schedule** chip -> portal popover: time input (default 08:00), weekday toggles Mon..Sun (indices 0-6, default Mon-Fri), Confirm (disabled with 0 days) -> `PATCH /platforms/{id} {schedule_time, schedule_days}`, Remove -> both null; notification chip showing active adapters (Push/Resend/MJ/SMTP) -> opens NotificationAdaptersModal; last-run result chip (from LS `crawl_last_run`, keyed by platform URL: found/new counts or error) toggles an expandable compact `CrawlSteps` log + timestamp; live `CrawlSteps` while busy. `crawl_interval_minutes` is not editable anywhere in UI.
  - Last-run summaries are **client-only**: written to LS `crawl_last_run` when a crawl completes/fails via WS; pruned to existing platform URLs on refetch; cleared by admin DB wipe.
- **NotificationAdaptersModal** (per platform): list Pushover/Resend/Mailjet/SMTP with system-configured state ("Nicht konfiguriert"; admin gets "Einrichten ->" link to `/settings`), "Empfänger fehlen" warning when active email adapter has no recipients, "Konfigurieren" button, toggle switch -> optimistic `PATCH /platforms/{id} {notification_adapters: [...]}` with rollback; enabling an email adapter without recipients opens its config modal instead. Returning from a template modal re-opens this modal.
- **PushoverTemplateModal**: variable chips `$title $company $match_score $reasoning $url` (insert at cursor), "Template laden" select from `GET /notification-templates` (type PUSHOVER; 🔒 for global), textarea (placeholder default), reset to default, shows default format, Send test -> `POST /platforms/{id}/test-pushover` (error detail only shown to admins), Save -> `PATCH /platforms/{id} {pushover_template}`.
- **EmailTemplateModal** (Resend/Mailjet/SMTP wrappers): recipients (comma-separated, required warning), template select (`__default__` = standard, user/global templates of type RESEND|MAILJET|SMTP), Editor/Preview tabs (client-side preview with sample job, supports `{{#jobs}}...{{/jobs}}` loop, `$title $company $match_score $reasoning $url $userName $jobCount $platform_name`), reset to default, Send test (first PATCHes template+recipients, then `POST /platforms/{id}/test-resend|test-mailjet|test-smtp`; SMTP requires >= 1 recipient client-side), Save -> `PATCH /platforms/{id} {<adapter>_template, <adapter>_recipients}`; save/test status indicators.
- Dead code inside: per-card `sendTestPushover`/`pushoverTestStatus`, `cancelCrawl`/`cancelAllCrawls` destructured but unused, `isAddingPlatform` never true.

### `/listings` (`listings/page.tsx` server wrapper -> `listings/components/Listings.tsx`)
- Server wrapper reads `filter` (all|favorite|no_favorite|applications), `platform_id`, `platform_name` from query.
- Initial load `GET /dashboard-data?limit=10&offset=0&filter_type=X` (`{jobs, active_crawls, system_crawling, ai_error}`; only `jobs` used here) unless platform-filtered; then `useJobs`. Also `GET /platforms` (for platform filter), `GET /jobs/counts[?is_archived=true]` (`{domain_counts:[{domain,count}], status_counts:{STATUS:n}}`, refetched on every jobs change).
- **SearchHeader / single-job import**: headline `jobIntelligence`, "{n} opportunities detected" (= loaded count, not total), URL input + Scan button (Enter submits); disabled + warning when profile incomplete; client URL validation -> `POST /scraper/import-job {url, user_id}` (plain fetch) -> `{job_id}`; progress tracked through WS crawl events -> success banner `jobImportSuccess` / `jobImportAlreadyExists` (skipped) / error `jobImportFailed`. Inline error banner 5 s.
- **FilterBar** (hidden entirely when filter = applications): segmented All / Favorites / Non-favorites; free-text search (title/company, **client-side** over loaded page only); List/Board view toggle (LS `jobAgent_viewMode`, not in archive); sort Relevance (score) / Newest (date); platform select; "domain" select (labelled domain, filters `job.company === value` **client-side**; options+counts from `/jobs/counts`); status dropdown (OPEN, DRAFTED, APPLIED, INTERVIEW, OFFER, ACCEPTED, REJECTED, FAILED with counts) -> server `status_filter`; "with application" toggle -> server `has_application`; Clear all.
- State <-> URL sync (debounced 400 ms): `filter, sort, search, domain, status, application, platform_id, platform_name` (+ `job` from panel). Back/forward re-applies (except platform). Note default sort mismatch: state default `date`, URL default `score`.
- **List view**: "Select all visible (n)" checkbox; `JobCard` per job (see B.4); infinite scroll via IntersectionObserver on `#infinite-scroll-trigger` with spinner.
- **Board view** (`JobBoard` + `BoardJobCard`): columns OPEN (also GENERATING/unknown), DRAFTED, APPLIED, INTERVIEW, OFFER, ACCEPTED, REJECTED + ARCHIVE drop zone; counts from `status_counts` when present; native drag&drop: drop on column -> `PATCH update-status`, drop on ARCHIVE -> archive confirm; card shows title, favourite star, company (+domain), score % (colour >=80/>=50), status pill; click opens **JobSidePanel**. No in-column ordering.
- **Bulk floating bar** (when selection > 0): count, "archive all from {company}" (only if all selected share one company) -> ConfirmModal with keep favourites / keep applications checkboxes -> `DELETE /jobs?company=X&keep_favorites=&keep_applications=&permanent=false`; "Archive selected" -> confirm -> `POST /jobs/bulk-delete`; clear selection.
- Live updates: `onNewJob` (WS `new_job`, skips `is_archived` auto-archived jobs and respects favorite filter, then full refetch), `onJobUpdate` (merge fields, clears pending generation + LS `gen_app_*`), `interview_prep_ready` -> refetch job, `company_profile_ready` -> refetch all jobs of that domain.
- Generation handlers: `onGenerate(job)` -> if `application_draft` exists opens **ApplicationModal**, else `POST /jobs/{id}/generate` (pending id tracking); `onRegenerate(job, notes)` -> `POST /jobs/{id}/generate {improvement_notes}`; `onCancelGenerate` -> `POST /jobs/{id}/cancel-generation`.
- Archive single job: ConfirmModal `archiveJob/archiveConfirm` -> `DELETE /jobs/{id}`.
- **ApplicationModal** (only reachable when `application_draft` exists and generate is invoked): markdown preview of draft, Copy to clipboard, "Save as PDF" -> `GET /jobs/{id}/download` (blob, filename `Bewerbung.pdf`) and auto-sets status APPLIED if status was OPEN/DRAFTED. (Legacy path.)

### `/archive` (`archive/page.tsx` -> `Listings isArchived`)
- Same component with `is_archived=true`: PageHeader instead of import bar, no CrawlStatus, list view only, no select-all checkbox (but per-card checkboxes still work), per-card Restore (`PATCH /jobs/{id} {is_archived:false}`) and Delete permanently (`DELETE /jobs/{id}`); bulk bar: Restore (`POST /jobs/bulk-restore`), Delete permanently (`POST /jobs/bulk-delete`), "delete all from {company}" (`DELETE /jobs?company=...&permanent=true`). URL sync disabled. Counts with `?is_archived=true`.

### `/jobs/[id]` full job page (`jobs/[id]/page.tsx`)
- `GET /jobs/{id}`; loading spinner; "Job nicht gefunden." + back. Header title/company/score; Back button (`router.back()`).
- `PipelineTabs` stepper (status change), `StepCard`, content tabs (hard-coded German labels) Übersicht / Bewerbung / Interview / Firma / Status / Dokumente (same tab components as JobCard), footer "← Zurück" (previous pipeline status) and "Schritt erledigt ✓" (next status; hidden at OFFER/last).
- Status: `PATCH /jobs/{id}/update-status`; update/archive: `PATCH /jobs/{id}` (archive = `{is_archived:true}`, no confirm); generate/regenerate/cancel as above. No WebSocket on this page -> `isGenerating` never resets by itself (only polling inside tabs).

### `/companies` (`companies/page.tsx`)
- `GET /companies` -> list of all company profiles of the user (fields used: `domain`, `name`, `executive_summary`, `structured_prep`, `deep_dive_analysis`, plus full profile JSON for CompanyProfileView).
- Search input (client-side filter on name/domain), count "N Companies", loading spinner, empty states ("No matches." / "No company profiles available yet.").
- Per company collapsible card: name/domain, "No Profile" badge when none of executive_summary/structured_prep/deep_dive_analysis present; expanded: if no profile -> "Start Analysis" (`POST /companies/{domain}/analyze {force_refresh:true}`); else "Update Data" (same call) + `CompanyProfileView`. After triggering, card shows "Company research in progress…" **forever** (no WS/polling, needs reload).
- **What /companies offers beyond the per-job Company tab**: a cross-job directory of every researched company (also companies whose research was never run - "No Profile"), global search, and access to research/deep-dives without opening a job. It does **not** show which jobs belong to a company, no delete, no manual company creation, no progress polling. Profile rendering and deep-dive actions are identical (shared `CompanyProfileView`).

### CompanyProfileView (`components/CompanyProfileView.tsx`) - shared renderer
- Sections (rendered only if present): Executive summary ("Gesamtbewertung": confidence badge High/Moderate/Low/Insufficient, assessment, suitable_for / not_suitable_for); Analysis areas ("Detailanalyse", collapsible per area: confidence, assessment, evidence_basis, key_uncertainty); Key insights (facts / interpretations / uncertainties lists); Risks (title, probability & impact badges, description); Market comparison (summary, comparison_points: dimension, relative_position, comment); Deep-dive buttons ("Tiefenrecherche": numbered collapsible items with focus, why_it_matters, how_to_proceed, linked_findings, "Jetzt recherchieren" -> `POST /companies/{domain}/deep-dive {focus, how_to_proceed, company_name, title, language}` -> `{result}` markdown, "Neu starten" clears; result not persisted client-side); Online resources (URL list normalised from string/array/object). Language from `d.meta.language` (default de).

### `/profile` (`profile/page.tsx`)
- Load: `GET /settings-view` (profile fields), then `GET /document-templates`; also `GET /profile/documents`, `GET /profile/templates` (result stored but **unused**). Loading text.
- Profile completion bar (client-computed, 8 fields: role, skills, min_salary, location, preferences, experience[], projects[], education) with missing-field chips; colour by % (>=80/>=50).
- **CV PDF import** drop zone / file picker (`.pdf`) -> `POST /settings/upload-cv` (multipart `file`) -> `{data:{role, skills, min_salary, location, cv_data}}` merged into form (not saved until Save); messages analyzing / importSuccess / importFailed.
- Tabs:
  - **Target job**: role, skills (comma text), min_salary (free text), location, preferences (natural language, auto-resize), spoken languages (comma-separated -> array).
  - **Resume**: `DynamicList` Experience (company, role, duration, description), Projects (name, tech_stack, description) with add/remove (remove confirm modal); Education (single textarea).
  - **Application documents**: `DocumentTemplateGallery` (below) + Work references and Certificates uploaders (`.pdf,.jpg,.jpeg,.png`, multiple) -> `POST /profile/documents` (multipart `file`, `doc_type` REFERENCE|CERTIFICATE, `label`=filename); list with filename and delete -> `DELETE /profile/documents/{id}`; empty states. No view/download of profile documents.
- Sticky save bar (not on documents tab): `POST /settings {role, skills, min_salary, location, preferences, spoken_languages[], cv_data, cv_template, cover_letter_template}` -> saving/saved/error, then `refreshUser()` (recomputes is_profile_complete). Response status not checked.

### DocumentTemplateGallery (`profile/components/DocumentTemplateGallery.tsx`)
- Tabs CV ("Lebenslauf") / COVER_LETTER ("Anschreiben"). Left list of `DocumentTemplate {id, doc_type, name, is_admin, user_id, status, created_at, updated_at}` filtered by tab; badges active (check), admin/global, "KI befüllt…" while `status === "processing"`.
- Click = select as active + preview: `PATCH /settings/template {cv_template|cover_letter_template: "<id>"}`; preview `GET /document-templates/{id}/html` -> `{html}` in sandboxed iframe scaled from A4 794x1123 px; Fullscreen modal (A4 210x297 mm).
- Delete own (non-admin) template -> `DELETE /document-templates/{id}`.
- Upload `.html/.htm` -> read as text -> `POST /document-templates {doc_type, name (filename w/o ext), html}`; for CV the backend AI-fills it with profile data (status processing) -> gallery polls `GET /document-templates` every 3 s until no processing templates.
- Empty state "Noch keine Templates"; no rename/edit of templates.

### `/settings` (`settings/page.tsx`) - tabs general / notifications / storage (URL `?tab=`)
- Load `GET /settings-view` (profile: adapter credentials, timezone, match_threshold, active_storage_service, google_drive_email). Handles `?success=google_connected` / `?error=google_auth_failed` banners.
- **General**: UI language DE/EN (LanguageProvider -> `POST /language-preference`); timezone select (fixed list of ~30 IANA zones: Europe, Americas, Asia/Pacific, UTC) -> `POST /timezone-preference {timezone}` on change; **match threshold** number 0-100, saved on blur (clamped) -> `POST /matching-preference {match_threshold}`; hint text explains auto-archive below threshold.
- **Notifications**: info text; cards with Active/Inactive badge (based on saved values) and footer (Save + Test):
  - Pushover: user key, API token (+ link pushover.net). Test -> `POST /notification-settings/test-pushover`.
  - Resend: setup guide steps 1-5 + link, API key, from email. Test asks for recipient (modal) -> `POST /notification-settings/test-resend {recipient}`.
  - SMTP: provider presets (Gmail, GMX, web.de, Outlook/Hotmail, Yahoo, T-Online) that fill host (+ notes, app-password links, guides), host, port (default 587), user, password, from email. Test with recipient -> `POST /notification-settings/test-smtp {recipient}`.
  - **Mailjet**: credentials are loaded/sent and test endpoint mapped, but **no Mailjet card is rendered** -> Mailjet credentials cannot be entered in the UI (yet platform modal offers Mailjet).
  - Gmail adapter (backend) not present at all.
  - Every Save posts the **whole** form: `POST /notification-settings {pushover_*, resend_*, mailjet_*, smtp_* (port int)}`. Response status not checked.
  - Notification templates card: `TemplateManager` (user mode).
- **Storage**: choose Internal database (`POST /storage/toggle {service:"NONE"}`) or Google Drive (selecting only changes local state until connected/toggled); Connect Google Drive -> full-page redirect to `API/storage/google/login`; Disconnect (browser `confirm`) -> `POST /storage/google/disconnect`; badges Active/Connected, "connected as {email}"; collapsible setup guide (Google Cloud project steps 1-5 incl. computed redirect URI `http(s)://<host>:8002/storage/google/callback` - hard-coded port 8002, app connection steps 1-3). Note: clicking the Google Drive card only sets local state; `handleToggleStorage("GOOGLE_DRIVE")` is never called (verified: only `handleToggleStorage("NONE")` is wired), so switching back to Drive after selecting internal storage relies on the backend activating Drive in the OAuth callback.

### TemplateManager (`components/TemplateManager.tsx`) - notification templates
- Used in `/settings` (user mode) and `/admin/settings` (admin mode, global templates).
- Tabs Pushover / E-Mail (email = types RESEND|MAILJET|SMTP) with counts. List: name, "Global" badge for admin templates, content preview (80 chars), edit/delete (global ones only editable/deletable in admin mode). Delete confirm.
- Create/edit inline form: name, content textarea, variable chips (email: `{{#jobs}}…{{/jobs}}`, `$title $company $match_score $reasoning $url` in loop, `$userName $jobCount $jobs_html` outside; pushover: `$title $company $match_score $reasoning $url`), preview toggle (email preview via `dangerouslySetInnerHTML`).
- API: list `GET /notification-templates` (both modes; admin mode filters `is_admin`); create `POST {mutateBase} {name, type, content}` (email templates always created with type `RESEND`); update `PUT {mutateBase}/{id} {name, content}`; delete `DELETE {mutateBase}/{id}`; `mutateBase` = `/admin/notification-templates` or `/notification-templates`.

### `/account` (`account/page.tsx`)
- Security: `PasswordChangeForm` current + new password (no confirm field, no strength rules) -> `POST /auth/change-password {current_password, new_password}`; status text.
- Danger zone (each via ConfirmModal):
  - Delete all jobs (keep favourites / keep applications checkboxes, default on) -> `DELETE /jobs?keep_favorites=&keep_applications=` -> `{count}` -> message then hard redirect `/`.
  - Delete profile only -> `DELETE /settings` -> refreshUser.
  - Factory reset (requires password in modal; 400 -> "incorrect password") -> `DELETE /user/reset {password}` -> redirect `/`.

### `/admin/users` (`admin/users/page.tsx`)
- Non-admin -> redirect `/`. `GET /users` -> table (ID, username, ADMIN/USER role, delete button only for non-admins -> confirm -> `DELETE /users/{id}`).
- Create user form: username, password -> `POST /users {username, password}`. Cannot create admins, edit users, reset passwords, or change roles.

### `/admin/settings` (`admin/settings/page.tsx`)
- `GET /admin/settings` -> `{openrouter_model, openrouter_api_key_set, ollama_model, ollama_base_url, ai_task_routing}`.
- **Cloud AI (OpenRouter)**: API key (password field, "Key configured" badge, clear key), Test connection (`POST /admin/test/openrouter` -> `{model}`; disabled if no key); model picker: load models `GET /admin/openrouter/models` -> `[{id, name, context_length, pricing{prompt, completion}}]`, searchable dropdown, "Only free models" filter (prompt price 0), shows context size and $/M price; default shown `tngtech/deepseek-r1t2-chimera:free`. Save -> `POST /admin/settings {openrouter_model, openrouter_api_key?}`.
- **Local LLM (LM Studio/Ollama)**: server URL, model name; Test (`POST /admin/test/ollama` -> `{model, model_found, available_models}`); Save -> `POST /admin/settings {ollama_model, ollama_base_url}`.
- **AI task routing**: select cloud/local for 8 tasks (job_analysis, cover_letter, cv_tailoring (default local), interview_prep, company_profile, deep_dive, extract_job_details, platform_name) -> `POST /admin/settings {ai_task_routing}`.
- **Global notification templates**: TemplateManager admin mode.
- **Maintenance**: "Clean up stale Redis jobs" -> `POST /admin/redis/cleanup` -> `{removed}`.
- **Danger zone**: Wipe database modal (checkbox "wipe ALL users" vs own account only, admin password) -> `POST /admin/database/wipe {password, wipe_all_users}`; clears LS `crawl_last_run`.

## B.4 Job detail components (list card, side panel, full page)

### JobCard (`components/JobCard/JobCard.tsx`) - list view card
- Generating progress bar; header: title (links to `job.url` new tab, shown as "{domain} | {title}"); selection checkbox (if `onSelect`); in archived state: Restore (`onUpdateJob {is_archived:false}`) and Delete-permanently buttons; favourite star toggle.
- Tabs (full + short labels): Overview, Application (spinner when generating), Interview prep, Company profile, Status, Documents.
- Collapsible job description (markdown) + "Reference" link to source; listens to window event `showJobDescription` (from Status-tab guidance) to auto-open + scroll.
- `timeAgo` helper defined but unused.

### JobOverviewTab
- No reasoning yet: empty state "AI analysis" + "Trigger analysis" -> `POST /jobs/{id}/analyze`; loading state with elapsed timer (start time in LS `analyzing_{id}`, survives reload), client-only cancel; error text. Cleared when `job.reasoning` arrives (WS `job_updated`/refresh).
- Collapsed summary (default in list): score %, status pill, created date, "view details". Expanded (default in panel/page; also via window event `showJobDetails`): AI analysis markdown (`reasoning`), match score bar, status dropdown (pipeline + REJECTED + FAILED) -> status update, checklist items Application (done if `application_draft`) / Interview prep (done if `interview_prep_material`) linking to tabs, meta: follow-up date (`next_follow_up_at`), created date, source hostname link, notes indicator, Archive button, collapse.

### JobApplicationTab - cover letter + CV
- Segmented "Anschreiben" / "Lebenslauf" with generating spinners.
- Data: `GET /jobs/{id}/documents` (list `{id, original_filename, file_size, mime_type, kind, uploaded_at}`; kinds `GENERATED_LETTER`, `GENERATED_CV`) + `GET /jobs/{id}/documents/html?kind=cover_letter|cv` (`{html}`); PDF loaded as blob from `GET /jobs/{id}/documents/{docId}/download` and shown in `<embed type=application/pdf>` (680 px).
- Letter view toolbar: refresh, generate/regenerate (if HTML exists opens "Verbesserungshinweis" textarea -> `POST /jobs/{id}/generate {improvement_notes}`; else `onGenerate`), edit (contentEditable iframe with the stored HTML), save (serialize iframe -> `PUT /jobs/{id}/documents/html?kind=cover_letter {html}` -> `POST /jobs/{id}/documents/render?kind=cover_letter` -> poll document list every 2 s up to 30x until `uploaded_at` changes -> reload), cancel edit, download (blob, original filename).
- Letter generating: fake rotating phase labels (6 phases, 3.5 s) + elapsed timer (LS `gen_app_{id}`), cancel -> `POST /jobs/{id}/cancel-generation`. Empty state "Noch kein Anschreiben" + generate button.
- CV view: refresh, regenerate -> `POST /jobs/{id}/generate-package {include_profile_documents:false, generate_cv:true, generate_letter:false}` (no CV notes field anymore; `alert()` on HTTP error); edit/save/render/poll as for letter with `kind=cv`; download via plain anchor to `/jobs/{id}/documents/{id}/download` (cookie auth). CV generating state: LS `gen_cv_{id}` + job status GENERATING, 5 fake phases, finishes when job status leaves GENERATING. Empty state "Noch kein Lebenslauf".
- Unused props: `onStatusUpdate`, `onUpdateJob`.

### JobInterviewTab
- Parses `job.interview_prep_material` JSON (fallback `{raw}`).
- Empty: "Interview Strategy Guide" + "Analyse starten" -> `POST /jobs/{id}/interview-prep`; Regenerate -> `POST /jobs/{id}/interview-prep/regenerate`. Queued state (LS `gen_interview_{id}`, elapsed timer) with **polling `GET /jobs/{id}` every 5 s** until material present; client-only cancel; inline `RegenBanner` during regeneration.
- Renders: report_output.executive_summary ("Deine Ausgangslage"), structured_prep.elevator_pitch, structured_prep.gap_analysis[] (requirement, gap_severity Low/Medium/High badge, cv_status, interview_strategy), report_output.deep_dive_analysis, social_intelligence_research (potential_contacts, insights_from_contacts, research_sources links), online_resources.speaking_url, confidence_assessment (overall_confidence, uncertainties), deep_dive_buttons[] (same deep-dive UI as company view, calls `POST /companies/{domain}/deep-dive` without `language`).

### JobCompanyTab
- `GET /companies/{company_domain}` on mount (404 -> empty). Empty: "Deep Company Intelligence" + "Analyse starten" -> `POST /companies/{domain}/analyze {force_refresh:false}`; "Daten aktualisieren" -> same with `force_refresh:true`. Queued state (LS `gen_company_{id}`, timer) with **polling `GET /companies/{domain}` every 5 s**; client-only cancel; RegenBanner while refreshing. Renders `CompanyProfileView`. Errors via global banner with method/path text.

### JobStatusTab (list card + full page only, not in side panel)
- Pipeline stepper OPEN->ACCEPTED (any step clickable -> status update) plus REJECTED fork (shown when APPLIED/INTERVIEW/OFFER/REJECTED).
- "What now?" guidance from `STATUS_GUIDANCE` (next action, 4 checklist items auto-ticked by has_draft/has_followup/has_prep, clicking jumps to tab / opens details / description, link to posting), follow-up date, nudge text.
- Fetches `GET /jobs/{id}/history` but **never renders it** (dead fetch).

### JobDocumentsTab
- **Notes**: textarea, debounced autosave 800 ms -> `PATCH /jobs/{id} {notes}`, saving/saved indicators.
- **Tasks/To-dos**: add (Enter), toggle done, delete, done counter - **stored only in LS `job-todos-{id}`** (not synced to backend).
- **Files**: drag&drop / picker (`.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp`, "max 10 MB" text, no client size check) -> `POST /jobs/{id}/documents` (multipart `file`); upload error modal assumes storage problem ("storage required" -> button to `/settings?tab=storage`); list with icon, name, size, date (de-DE); viewer modal for PDF/images (fetches `GET /jobs/{id}/documents/{docId}/view` as blob; image zoom 25-300 %, rotate, download, Esc closes); download anchor `.../download`; delete `DELETE /jobs/{id}/documents/{docId}` (no confirm). Lists all job documents incl. generated CV/letter.

### JobSidePanel (`components/JobSidePanel/*`) - used by Listings (board click; list view cards do not open it)
- 420 px slide-in (portal, backdrop click / Esc closes). Header: title, company, score, "Open page" (-> `/jobs/{id}`), close.
- `PipelineTabs`: stepper of STATUS_PIPELINE; past/current steps clickable (future steps disabled) -> status update; REJECTED fork.
- `StepCard`: "Step x of 6 · status", next-action text and status-specific CTA: OPEN -> "Apply" (sets DRAFTED) + Archive; DRAFTED -> generating text / "draft ready" / "Generate application"; INTERVIEW -> prep ready text or "Generate interview prep" (plain `POST /jobs/{id}/interview-prep`); OFFER -> Accept (ACCEPTED) / Decline (REJECTED); ACCEPTED -> congrats; others nudge. "Mark done -> next status" button (not for OPEN/OFFER); moving DRAFTED->APPLIED without `cv_html` or (`application_draft`/`cover_letter_html`) shows "apply without documents?" warning modal (client-side guard).
- Content tabs: Overview (expanded), Application, Interview, Company, Documents (no Status tab). Default tab by status (DRAFTED -> application, INTERVIEW -> interview, else overview). Favourite toggle not available in panel.

## B.5 Dead code (imported nowhere / unreachable)
- `(dashboard)/components/Dashboard.tsx` (508 lines; old jobs dashboard with `POST /scraper/search` free-text crawl, CrawlStatus list, `gen_app_*` handling) - not imported anywhere. Consequently the default `CrawlStatus` component (multi-crawl status panel with "Alle abbrechen") is only used by this dead file (its `CrawlSteps` export and `CrawlJob` type are live).
- `components/editor/DocumentEditor.tsx` + `BlockInspector.tsx` + `StylePanel.tsx` (block/style HTML editor using `PUT documents/html` + `POST documents/render`) - DocumentEditor imported nowhere.
- `(dashboard)/components/JobPlatforms/NotificationAdapters.tsx` - imported nowhere.
- `components/LanguageToggler.tsx` - imported nowhere.
- Default export of `components/JobStatusBadge.tsx` (only the `JobStatus` type is used).
- Unused code inside live files: JobCard `timeAgo`; JobStatusTab history fetch; profile `/profile/templates` fetch + `templates` state; JobPlatformsManager `sendTestPushover`, `pushoverTestStatus/Error`, `isAddingPlatform` (AddPlatformInput overlay never shown), unused `cancelCrawl/cancelAllCrawls`; `useCrawl` `reconnectTimeoutRef`; `NavItemConfig.filterParam` logic; `JobCardProps.isModal`; `CompanyProfileView` `__ENV__` fallback; `@dnd-kit/*` deps; i18n keys listed in B.1; `ApplicationModal` effectively legacy (only reachable when `application_draft` exists).

## B.6 Client-only logic (computed/stored only in the browser)
- `is_profile_complete` = `settings.role` non-empty (AuthProvider); OverviewDashboard uses a different rule (role AND skills); profile completion % (8 fields) on /profile. Search/import/add-platform disabled based on it.
- Configured-adapter detection (dashboard warning, NotificationAdaptersModal) from raw credential fields.
- Listings text search (title/company) and "domain" (company) filter run only over the already loaded pages (not server-side) -> results incomplete with infinite scroll; "N opportunities detected" = loaded count.
- Board column assignment (GENERATING/unknown -> OPEN) and counts fallback; select-all/bulk selection; "archive all from company" only if selection is single-company.
- Status workflow UX: `STATUS_PIPELINE`, `STATUS_GUIDANCE` checklists, "mark done" next-status, apply-without-docs warning, REJECTED fork visibility, future-step disabling in PipelineTabs (server may allow anything).
- Generation/analysis progress: fake phase labels and elapsed timers, persisted start times in LS (`gen_app_{id}`, `gen_cv_{id}`, `gen_interview_{id}`, `gen_company_{id}`, `analyzing_{id}`); "cancel" for analysis/interview/company is client-only (backend task continues).
- Polling loops: interview prep (5 s `GET /jobs/{id}`), company profile (5 s `GET /companies/{domain}`), document template AI-fill (3 s `GET /document-templates`), PDF re-render after HTML edit (2 s x30 `GET /jobs/{id}/documents`).
- Per-job to-do lists (LS `job-todos-{id}`) - never sent to backend.
- Platform last-run results (LS `crawl_last_run`, keyed by platform URL) built from WS events.
- View mode list/board (LS `jobAgent_viewMode`), theme (LS `theme`), language (LS `language`, also synced to backend).
- Platform setup link-pattern detection (auto pattern + manual preselect) is client-side; backend infers the final `url_pattern` from selected URLs. Platform URL edit domain-change guard. Email template preview rendering with sample data.
- URL validation for import / add platform; duplicate platform check.
- Filter/selection state mirrored into URL query (`filter, sort, search, domain, status, application, platform_id, platform_name, job, setup_url, tab`).

## B.7 Flat list of API calls made by the frontend (live code; `[dead]` = only in dead files)

| Method | Path | Calling file(s) |
|---|---|---|
| POST | /auth/login (form-urlencoded) | login/page.tsx |
| POST | /auth/refresh | components/AuthProvider.tsx |
| POST | /auth/logout | components/AuthProvider.tsx |
| POST | /auth/change-password | account/components/PasswordChangeForm.tsx |
| GET | /me | components/AuthProvider.tsx |
| GET | /status | components/DashboardShell.tsx |
| GET | /statistics | (dashboard)/components/OverviewDashboard.tsx |
| GET | /dashboard-data?limit&offset&filter_type | listings/components/Listings.tsx, [dead] Dashboard.tsx |
| GET | /settings | components/AuthProvider.tsx, components/LanguageProvider.tsx |
| POST | /settings | profile/page.tsx |
| DELETE | /settings | account/page.tsx |
| GET | /settings-view | OverviewDashboard.tsx, profile/page.tsx, settings/page.tsx |
| POST | /settings/upload-cv (multipart) | profile/page.tsx |
| PATCH | /settings/template | profile/components/DocumentTemplateGallery.tsx |
| POST | /language-preference | components/LanguageProvider.tsx |
| POST | /timezone-preference | settings/page.tsx |
| POST | /matching-preference | settings/page.tsx |
| POST | /notification-settings | settings/page.tsx |
| POST | /notification-settings/test-pushover, /test-resend, /test-smtp (/test-mailjet mapped but unreachable) | settings/page.tsx |
| GET | /notification-templates | TemplateManager.tsx, JobPlatformsManager.tsx |
| POST / PUT / DELETE | /notification-templates[/{id}] | components/TemplateManager.tsx |
| POST / PUT / DELETE | /admin/notification-templates[/{id}] | components/TemplateManager.tsx (admin mode) |
| DELETE | /user/reset | account/page.tsx |
| GET | /jobs?limit&offset&sort_by&filter_type&has_application&status_filter&platform_id&is_archived | hooks/useJobs.ts |
| DELETE | /jobs?keep_favorites&keep_applications | account/page.tsx |
| DELETE | /jobs?company&keep_favorites&keep_applications&permanent | listings/components/Listings.tsx |
| GET | /jobs/counts[?is_archived=true] | Listings.tsx, [dead] Dashboard.tsx |
| POST | /jobs/bulk-delete | hooks/useJobs.ts |
| POST | /jobs/bulk-restore | hooks/useJobs.ts |
| GET | /jobs/{id} | useJobPanel.ts, Listings.tsx, jobs/[id]/page.tsx, JobInterviewTab.tsx (poll), [dead] Dashboard.tsx |
| PATCH | /jobs/{id} | useJobs.ts, jobs/[id]/page.tsx, JobDocumentsTab.tsx (notes) |
| DELETE | /jobs/{id} | hooks/useJobs.ts |
| PATCH | /jobs/{id}/favorite | hooks/useJobs.ts |
| PATCH | /jobs/{id}/update-status | hooks/useJobs.ts, jobs/[id]/page.tsx |
| POST | /jobs/{id}/analyze | JobCard/JobOverviewTab.tsx |
| POST | /jobs/{id}/generate [{improvement_notes}] | Listings.tsx, JobApplicationTab.tsx, jobs/[id]/page.tsx, [dead] Dashboard.tsx |
| POST | /jobs/{id}/cancel-generation | Listings.tsx, JobApplicationTab.tsx, jobs/[id]/page.tsx |
| POST | /jobs/{id}/generate-package | JobCard/JobApplicationTab.tsx |
| GET | /jobs/{id}/download | components/ApplicationModal.tsx |
| POST | /jobs/{id}/interview-prep | JobInterviewTab.tsx, JobSidePanel/StepCard.tsx (plain fetch) |
| POST | /jobs/{id}/interview-prep/regenerate | JobInterviewTab.tsx |
| GET | /jobs/{id}/history | JobCard/JobStatusTab.tsx (result unused) |
| GET / POST | /jobs/{id}/documents | JobApplicationTab.tsx (GET), JobDocumentsTab.tsx (GET, POST multipart) |
| DELETE | /jobs/{id}/documents/{docId} | JobDocumentsTab.tsx |
| GET | /jobs/{id}/documents/{docId}/download | JobApplicationTab.tsx, JobDocumentsTab.tsx |
| GET | /jobs/{id}/documents/{docId}/view | JobDocumentsTab.tsx |
| GET / PUT | /jobs/{id}/documents/html?kind=cover_letter\|cv | JobApplicationTab.tsx, [dead] editor/DocumentEditor.tsx |
| POST | /jobs/{id}/documents/render?kind=cover_letter\|cv | JobApplicationTab.tsx, [dead] editor/DocumentEditor.tsx |
| GET | /companies | companies/page.tsx |
| GET | /companies/{domain} | JobCard/JobCompanyTab.tsx |
| POST | /companies/{domain}/analyze {force_refresh} | JobCompanyTab.tsx, companies/page.tsx |
| POST | /companies/{domain}/deep-dive | CompanyProfileView.tsx, JobInterviewTab.tsx |
| GET | /platforms | JobPlatformsManager.tsx, Listings.tsx |
| PATCH | /platforms/{id} | JobPlatformsManager.tsx |
| DELETE | /platforms/{id}?delete_listings=true&keep_favorites=false&keep_applications=false | JobPlatformsManager.tsx |
| POST | /platforms/{id}/crawl | JobPlatformsManager.tsx |
| POST | /platforms/{id}/generate-name | JobPlatformsManager.tsx |
| POST | /platforms/{id}/test-pushover, /test-resend, /test-mailjet, /test-smtp | JobPlatformsManager.tsx |
| POST | /platforms/preview-links | JobPlatforms/PlatformSetupModal.tsx |
| POST | /platforms/setup | JobPlatforms/PlatformSetupModal.tsx |
| GET | /scraper/crawl-status?user_id | hooks/useCrawl.ts |
| POST | /scraper/cancel-crawl | hooks/useCrawl.ts |
| POST | /scraper/cancel-all-crawls | hooks/useCrawl.ts (only used by dead Dashboard) |
| POST | /scraper/import-job | listings/components/Listings.tsx (plain fetch) |
| POST | /scraper/search | [dead] Dashboard.tsx |
| GET / POST | /profile/documents | profile/page.tsx |
| DELETE | /profile/documents/{id} | profile/page.tsx |
| GET | /profile/templates | profile/page.tsx (result unused) |
| GET / POST | /document-templates | profile/page.tsx, DocumentTemplateGallery.tsx |
| DELETE | /document-templates/{id} | DocumentTemplateGallery.tsx |
| GET | /document-templates/{id}/html | DocumentTemplateGallery.tsx |
| POST | /storage/toggle | settings/page.tsx |
| GET (navigation) | /storage/google/login | settings/page.tsx (window.location) |
| POST | /storage/google/disconnect | settings/page.tsx |
| GET / POST | /users | admin/users/page.tsx |
| DELETE | /users/{id} | admin/users/page.tsx |
| GET / POST | /admin/settings | admin/settings/page.tsx |
| GET | /admin/openrouter/models | admin/settings/page.tsx |
| POST | /admin/test/openrouter | admin/settings/page.tsx |
| POST | /admin/test/ollama | admin/settings/page.tsx |
| POST | /admin/redis/cleanup | admin/settings/page.tsx |
| POST | /admin/database/wipe | admin/settings/page.tsx |
| WS | /ws | hooks/useCrawl.ts |

---

# Part C - Gaps

## C.1 Backend capabilities the UI does not expose (or exposes incompletely)
| Backend capability | Endpoint / field | Current UI state |
|---|---|---|
| Status history timeline (from/to/note/date) | `GET /jobs/{id}/history`, `PATCH /jobs/{id}` `note` | fetched in JobStatusTab, never rendered; UI uses `update-status` (no history row) almost everywhere, so history is mostly empty |
| Structured job fields | `PATCH /jobs/{id}` `contact_persons`, `recruiter_info`, `salary_benchmark`, `next_follow_up_at`, `company_domain`, `cv_draft` | follow-up date only displayed, never editable; contacts/recruiter/salary not shown/edited at all; `cv_draft` (= CV tailoring notes read by package task) not editable since CV-notes UI was removed |
| Full package generation incl. profile documents | `POST /jobs/{id}/generate-package` (`include_profile_documents`, `generate_letter`) | UI only calls CV-only variant; letter via `/generate`; profile docs (references/certificates) are therefore never attached to a job |
| Profile document view/download | `GET /profile/documents/{id}/download\|view` | no view/download in profile page |
| Edit/rename document templates | `PUT /document-templates/{id}` | no edit/rename; only upload/select/delete |
| File template keys | `GET /profile/templates` (`classic`) | fetched, unused |
| Mailjet credentials | `POST /notification-settings` mailjet_*, `/notification-settings/test-mailjet` | no Mailjet card in Settings (but Mailjet can be enabled per platform) |
| Global email recipient | `email_global_recipient` + `POST /notification-settings/test-email` | not editable, test-email unused (settings tests prompt for recipient instead) |
| Crawl interval | `crawl_interval_minutes` | not editable (and ignored by scheduler anyway) |
| Platform delete options | `DELETE /platforms/{id}` keep_* params; `DELETE /platforms/{id}/jobs` | UI always deletes everything; keep params ignored server-side; "delete only jobs" endpoint unused |
| Ad-hoc URL search crawl | `POST /scraper/search` | only in dead Dashboard.tsx |
| Cancel all crawls / multi-crawl status panel | `/scraper/cancel-all-crawls`, `CrawlStatus` | only in dead Dashboard.tsx |
| Clear persisted AI error | `DELETE /admin/clear-ai-error` | banner can be dismissed locally only; Redis flag stays, reappears on reload |
| Job companies list | `GET /jobs/domains` | unused (`/jobs/counts` domain_counts used instead) |
| Admin user mgmt | `POST /users` creates non-admin only | no edit/role/password reset (also not in backend) |
| Legacy letter PDF | `GET /jobs/{id}/download` | only via legacy ApplicationModal |
| Generation error text | `jobs.generation_error` | not returned by `GET /jobs/{id}`; only visible via WS `job_update.error` or raw `/jobs` list |
| Online submission | `POST /jobs/{id}/submit-application` | 501 stub, out of scope |
| Google Drive re-activation | `POST /storage/toggle {service:"GOOGLE_DRIVE"}` | never called; only "NONE" wired |
| Gmail adapter | mentioned in progress tracker | does not exist in backend routers either |

## C.2 UI features that rely on client-only logic (would be lost or need backend support)
- Per-job **to-do lists** (LS `job-todos-{id}`) - not persisted server-side.
- **Platform last-run summaries** (LS `crawl_last_run`) - derived from WS events only.
- **Profile completeness** rules (3 different client rules: role only / role+skills / 8-field %), used to block import/add-platform.
- **Notification-adapter "configured" detection** from masked credential fields.
- **Status workflow**: `STATUS_PIPELINE`, `STATUS_GUIDANCE` checklists/nudges, next-step, "apply without documents" warning, REJECTED fork - server enforces nothing.
- **Listings text search & company filter** operate only on already loaded pages; "N opportunities" = loaded count.
- **Progress UX**: fake phase labels, elapsed timers persisted in LS (`gen_app_`, `gen_cv_`, `gen_interview_`, `gen_company_`, `analyzing_`); client-only "cancel" for analysis/interview/company research (task keeps running).
- **Polling** instead of WS for interview prep (5 s), company profile (5 s), template AI-fill (3 s), PDF re-render (2 s x30); `/companies` page has none (stuck "in progress").
- **Platform setup pattern detection** (auto/manual link pre-selection) client-side; server re-infers `url_pattern`.
- **Email/Pushover template preview** rendering with sample data.
- View mode, theme, language cache in LS; filters mirrored into URL.

## C.3 Behaviour mismatches / bugs to resolve before or during the rewrite
1. **Setup wizard "Sofort starten"** sends `run_initial_crawl:false` -> backend triggers *no* crawl and leaves `last_crawl_at` null, so the next crawl (manual or scheduled) is treated as an initial seeding run (SEEN placeholders only, no analysis). The UI promise ("first run analyses all") is not met. "Bekannte Jobs vormerken" (`true`) correctly seeds.
2. **Saving the profile wipes notification credentials** (`POST /settings` without notification fields; see A.13 #1).
3. **WS broadcast leak**: `new_job`/`job_updated`/`interview_prep_ready`/`company_profile_ready` go to all users; current `useCrawl` handles `new_job` without a user check (only Listings' handler filters favorites/archived).
4. No WS reconnect; one socket per `useCrawl` consumer.
5. `/jobs/[id]` page has no WS -> generation state never resets without polling.
6. Default sort mismatch (state `date` vs URL default `score`) in Listings.
7. `fetchWithAuth` refresh is not de-duplicated (parallel 401s -> parallel refreshes; refresh limit 20/min).
8. Error format heterogeneity (`detail` string vs list vs `error` for 429 vs 200+`status:"error"` for scraper) - new client needs one normaliser.
9. Hard-coded German/English strings outside i18n (see B.1); 8 missing keys.
10. Google Drive redirect URI shown with hard-coded port 8002; `X-Frame-Options: DENY` on API responses (PDF `/view` can't be iframed - current UI fetches blobs instead, keep that pattern).
