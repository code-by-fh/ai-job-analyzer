// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { CurrentUserBody } from "../../../src/api/auth";
import type { NotificationTemplateBody } from "../../../src/api/notifications";
import { E2E_NOTIFICATION_FIELDS, E2E_SECRETS } from "./profileFixtures";

/** One user_profiles row as the settings endpoints see it; a journey shares ProfileServer's instead. */
export type SettingsRow = Record<string, unknown>;

/**
 * Preflight ruling 16: the channel fields and secrets of the Profil fixtures (one row, no twins),
 * plus the language and time zone the settings page stores. `overrides` unsets a channel, e.g.
 * `{ mailjet_api_key: null, mailjet_secret_key: null, mailjet_from_email: null }`.
 */
export function settingsRow(overrides: SettingsRow = {}): SettingsRow {
  return {
    ...structuredClone(E2E_NOTIFICATION_FIELDS),
    ...structuredClone(E2E_SECRETS),
    language: "de",
    timezone: "Europe/Berlin",
    ...overrides,
  };
}

/** The user's own Pushover template and an admin's global E-Mail template (D8). */
export const NOTIFICATION_TEMPLATES: NotificationTemplateBody[] = [
  {
    id: 31,
    name: "Kurz",
    type: "PUSHOVER",
    content: "$title bei $company ($match_score %)",
    is_admin: false,
  },
  {
    id: 32,
    name: "Digest",
    type: "RESEND",
    content: "<h1>Hallo $userName</h1>{{#jobs}}<p>$title bei $company</p>{{/jobs}}",
    is_admin: true,
  },
];

/** A signed-in member (fixtures.ts signs in the admin): no Administration, no admin request. */
export const MEMBER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

/** Preflight ruling 36: the signed-in account's password in the FakeServer (T9). */
export const PASSWORD = "altes-passwort-1";

/** The fields of a job_entries row that archive-all reads and writes. */
export interface SettingsJob {
  id: string;
  status: string;
  is_favorite: boolean;
  is_archived: boolean;
}

const job = (id: string, status: string, isFavorite = false): SettingsJob => ({
  id,
  status,
  is_favorite: isFavorite,
  is_archived: false,
});

/**
 * Ruling 36: OPEN x3 (one a favourite), SEEN x2, DRAFTED, APPLIED. With both keep options the
 * Task 2 rule archives the two OPEN non-favourites; SEEN placeholders are never touched.
 */
export const SETTINGS_JOBS: readonly SettingsJob[] = [
  job("job-1", "OPEN"),
  job("job-2", "OPEN"),
  job("job-3", "OPEN", true),
  job("job-4", "SEEN"),
  job("job-5", "SEEN"),
  job("job-6", "DRAFTED"),
  job("job-7", "APPLIED"),
];
