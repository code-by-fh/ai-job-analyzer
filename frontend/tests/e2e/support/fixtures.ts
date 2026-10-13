import type { CurrentUserBody } from "../../../src/api/auth";
import type { JobPageBody } from "../../../src/api/jobList";
import type { JobCountsBody } from "../../../src/api/jobs";
import type {
  LanguageSettingsBody,
  SavedLanguageBody,
  TimezoneSettingsBody,
} from "../../../src/api/settings";
import type { SetupStatusBody } from "../../../src/api/setup";
import type { MockResponse, MockRoutes } from "./mockApi";
import { CRAWL_STATUS, PLATFORMS } from "./platformFixtures";

// The bodies are typed with the zod input types of src/api, so a drifted fixture fails typecheck.
const ADMIN_USER: CurrentUserBody = { id: 1, username: "admin", is_admin: true };
const SETTINGS: LanguageSettingsBody & TimezoneSettingsBody = {
  language: "de",
  timezone: "Europe/Berlin",
};
const JOB_COUNTS: JobCountsBody = { status_counts: { OPEN: 3, DRAFTED: 1, APPLIED: 2 } };
const LANGUAGE_SAVED: SavedLanguageBody = { status: "ok", language: "en" };
const EMPTY_PAGE: JobPageBody = { items: [], total: 0 };

/** Everything set up: the inbox shows its lists, not the onboarding. */
export const SETUP_DONE: SetupStatusBody = {
  has_source: true,
  ai_configured: true,
  profile_complete: true,
  has_jobs: true,
};

export const ADMIN_USER_ID = ADMIN_USER.id;
export const LOGIN_OK: MockResponse = { body: { status: "ok" } };
export const LOGOUT_OK: MockResponse = { body: { status: "ok" } };
export const RUNNING_CRAWL_ID = CRAWL_STATUS.jobs[0]!.job_id;
export const LANGUAGE_PREFERENCE_SAVED: MockResponse = { body: LANGUAGE_SAVED };
export const UNAUTHORIZED: MockResponse = {
  status: 401,
  body: { detail: "Could not validate credentials" },
};

export const AUTHENTICATED_ROUTES: MockRoutes = {
  "GET /me": { body: ADMIN_USER },
  "GET /settings": { body: SETTINGS },
  "GET /jobs/counts": { body: JOB_COUNTS },
  "GET /platforms": { body: PLATFORMS },
  "GET /scraper/crawl-status": { body: CRAWL_STATUS },
  // For non-inbox specs that land on the home screen (shell, login, documentEdit): every list query
  // gets an empty page. Inbox specs use inboxRoutes, which keys each list and fails unkeyed ones.
  "GET /jobs": { body: EMPTY_PAGE },
  "GET /setup-status": { body: SETUP_DONE },
};
