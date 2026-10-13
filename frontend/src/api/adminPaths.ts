/**
 * Paths and wire constants of the admin, company directory and search endpoints. Client-free (no
 * API client import), so e2e fixtures and the FakeServers can import them at runtime.
 */
import { JOBS_PATH } from "./settingsPaths";

export const ADMIN_SETTINGS_PATH = "/admin/settings";
export const OPENROUTER_TEST_PATH = "/admin/test/openrouter";
export const LOCAL_TEST_PATH = "/admin/test/ollama";
export const OPENROUTER_MODELS_PATH = "/admin/openrouter/models";
export const SYSTEM_STATUS_PATH = "/admin/system-status";
export const CLEAR_AI_ERROR_PATH = "/admin/clear-ai-error";
export const CRAWL_CLEANUP_PATH = "/admin/redis/cleanup";
export const DATABASE_WIPE_PATH = "/admin/database/wipe";
export const USERS_PATH = "/users";
export const COMPANIES_PATH = "/companies";
export const SEARCH_PATH = "/search";
// routers/jobs.py MAX_PAGE_SIZE: one page holds every job of a company the detail lists.
const COMPANY_JOBS_LIMIT = 100;
const SORT_BY_DATE = "date";
// The server's default is is_archived=false, so only the archived list sends the flag.
const ARCHIVED_ONLY = "true";

export const userPath = (id: number) => `${USERS_PATH}/${id}`;
export const adminCompanyPath = (domain: string) =>
  `/admin/companies/${encodeURIComponent(domain)}`;

// routers/companies.py CompanyScope; "all" is admin only (403 for a member).
export const COMPANY_SCOPES = ["own", "all"] as const;
export type CompanyScope = (typeof COMPANY_SCOPES)[number];
export const companiesPath = (scope: CompanyScope) =>
  scope === "own" ? COMPANIES_PATH : `${COMPANIES_PATH}?scope=${scope}`;
export const searchPath = (q: string) => `${SEARCH_PATH}?${new URLSearchParams({ q }).toString()}`;

/** The user's jobs at one company, active or archived ones (the server's default is active). */
export function companyJobsPath(domain: string, archived: boolean): string {
  const params = new URLSearchParams({ company_domain: domain });
  if (archived) params.set("is_archived", ARCHIVED_ONLY);
  params.set("limit", String(COMPANY_JOBS_LIMIT));
  params.set("sort_by", SORT_BY_DATE);
  return `${JOBS_PATH}?${params.toString()}`;
}

// Mirrors intelligence/service.py TASK_DEFAULTS (order = display order).
export const AI_TASKS = [
  "job_analysis",
  "cover_letter",
  "cv_tailoring",
  "interview_prep",
  "company_profile",
  "deep_dive",
  "extract_job_details",
  "platform_name",
] as const;
export type AiTask = (typeof AI_TASKS)[number];
// routers/admin.py AI_PROVIDERS.
export const AI_PROVIDERS = ["cloud", "local"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
// core/connection_errors.py REASON_* and routers/admin.py REASON_NO_*.
export const TEST_REASONS = [
  "auth",
  "not_found",
  "unreachable",
  "timeout",
  "failed",
  "no_key",
  "no_model",
  "no_url",
] as const;
export type TestReason = (typeof TEST_REASONS)[number];
// intelligence/service.py AI_ERROR_*.
export const AI_ERROR_CODES = [
  "auth",
  "rate_limit",
  "model_not_found",
  "connection",
  "server",
  "unknown",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

// routers/admin.py MAX_MODEL_LENGTH, MAX_API_KEY_LENGTH, MAX_BASE_URL_LENGTH, MAX_AVAILABLE_MODELS
// (the local test's model list, capped server-side); routers/auth.py MIN/MAX_USERNAME_LENGTH and
// MAX_USERS_PAGE (R10: the list asks for one full page and says when it is cut);
// workers/tasks/research.py MAX_COMPANY_NAME_LENGTH. Web-only: the model picker shows at most
// modelOptions matches and a test result at most availableModelsShown names.
export const ADMIN_LIMITS = {
  model: 200,
  apiKey: 500,
  baseUrl: 500,
  availableModels: 200,
  usernameMin: 3,
  usernameMax: 50,
  usersPage: 200,
  companyName: 200,
  modelOptions: 200,
  availableModelsShown: 10,
} as const;
export const USERS_LIST_PATH = `${USERS_PATH}?limit=${ADMIN_LIMITS.usersPage}`;
// routers/auth.py USERNAME_PATTERN (checked after the trim).
export const USERNAME_PATTERN = /^[A-Za-z0-9._@-]+$/;
/** The codes the admin endpoints refuse with (detail); the web maps each to a fixed sentence. */
export const ADMIN_REFUSAL = {
  usernameTaken: "username_taken",
  cannotDeleteSelf: "cannot_delete_self",
  cannotDeleteAdmin: "cannot_delete_admin",
  // routers/deps.py CRAWL_RUNNING: a member whose crawl runs cannot be deleted (409).
  crawlRunning: "Crawl running",
  wrongPassword: "wrong_password",
  // GET /admin/openrouter/models without a stored key (400).
  noKey: "no_key",
} as const;
// routers/search.py MIN/MAX_QUERY_LENGTH (code points after the trim); the dialog debounces typing.
export const SEARCH_LIMITS = { min: 2, max: 200, debounceMs: 250 } as const;
