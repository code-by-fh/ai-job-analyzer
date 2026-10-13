import type { CurrentUserBody } from "@/api/auth";
import type { ProfileBody } from "@/api/profile";
import type { RouteTable } from "./stubRoutes";

export const PROFILE: ProfileBody = {
  role: "Lead",
  skills: "Kotlin, Java",
  min_salary: "80000",
  location: "Hamburg",
  preferences: "Hybrid",
  spoken_languages: ["Deutsch"],
  cv_data: {
    experience: [{ company: "Acme", role: "Dev", duration: "2020 – heute", description: "APIs" }],
    projects: [],
    education: "BSc",
  },
  cv_template: "classic",
  cover_letter_template: null,
};
/** What GET /settings really answers: the profile plus masked secrets the web must ignore. */
export const STORED_SETTINGS = {
  ...PROFILE,
  pushover_api_token: "__masked__",
  smtp_host: "smtp.example.com",
};

// AiSetupAction (CV import without an AI provider) reads the user.
const ADMIN: CurrentUserBody = { id: 1, username: "admin", is_admin: true };

/** Everything /profile loads; `overrides` replaces or adds routes. */
export function profileStubs(overrides: RouteTable = {}): RouteTable {
  return {
    "GET /settings": STORED_SETTINGS,
    "GET /setup-status": {
      has_source: true,
      ai_configured: true,
      profile_complete: true,
      has_jobs: true,
    },
    "GET /profile/documents": [],
    "GET /document-templates": [],
    "GET /profile/templates": { cv: ["classic"], cover_letter: ["classic"] },
    "GET /me": ADMIN,
    ...overrides,
  };
}
