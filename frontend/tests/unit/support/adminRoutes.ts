import type { AiSettingsBody } from "@/api/admin";
import type { CurrentUserBody } from "@/api/auth";
import { settingsStubs } from "./settingsRoutes";
import type { RouteTable } from "./stubRoutes";

export const ADMIN: CurrentUserBody = { id: 1, username: "admin", is_admin: true };
export const MEMBER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

/** routers/admin.py _settings_answer: a stored key shows only as its boolean. */
export const STORED_AI_SETTINGS: AiSettingsBody = {
  openrouter_model: "openai/gpt-4o-mini",
  openrouter_api_key_set: true,
  ollama_model: "llama3.1:8b",
  ollama_base_url: "http://192.168.1.20:1234/v1",
  ollama_base_url_from_env: false,
  ai_task_routing: {
    job_analysis: "cloud",
    cover_letter: "cloud",
    cv_tailoring: "local",
    interview_prep: "cloud",
    company_profile: "cloud",
    deep_dive: "cloud",
    extract_job_details: "cloud",
    platform_name: "cloud",
  },
};

/** Everything /settings loads for an admin, the admin sections' GETs included. */
export function adminStubs(overrides: RouteTable = {}): RouteTable {
  return settingsStubs({
    "GET /me": ADMIN,
    "GET /admin/settings": STORED_AI_SETTINGS,
    "GET /admin/system-status": { ai_error: null },
    "GET /users": [ADMIN, MEMBER],
    ...overrides,
  });
}
