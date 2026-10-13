import { z } from "zod";
import { api } from "./instance";
import {
  CHANGE_PASSWORD_PATH,
  FACTORY_RESET_PATH,
  JOBS_PATH,
  PROFILE_RESET_PATH,
} from "./settingsPaths";

// The writes answer a status the web does not read.
const anyBodySchema = z.unknown();
const archivedSchema = z.object({ count: z.number().int() });

/**
 * 400 = wrong current password; 422 on new_password (PASSWORD_LIMITS); 429 after 5/min.
 * The server's text is never shown.
 */
export async function changePassword(input: { current: string; next: string }): Promise<void> {
  const json = { current_password: input.current, new_password: input.next };
  await api.request(CHANGE_PASSWORD_PATH, anyBodySchema, { method: "POST", json });
}

/**
 * Archives the inbox matches (reason USER) and answers how many. SEEN placeholders are never
 * touched; keepApplications keeps every status after OPEN (routers/jobs.py delete_all_jobs).
 */
export async function archiveAllJobs(input: {
  keepFavorites: boolean;
  keepApplications: boolean;
}): Promise<number> {
  const query = new URLSearchParams({
    keep_favorites: String(input.keepFavorites),
    keep_applications: String(input.keepApplications),
  });
  const path = `${JOBS_PATH}?${query.toString()}`;
  return (await api.request(path, archivedSchema, { method: "DELETE" })).count;
}

/** Empties Ziel and Lebenslauf (onboarding asks again); channels, templates and proofs stay. 404 without a profile. */
export async function resetProfile(): Promise<void> {
  await api.request(PROFILE_RESET_PATH, anyBodySchema, { method: "DELETE" });
}

/**
 * Deletes everything the account owns except the account itself. 400 = wrong password,
 * 409 = a crawl is running, 429 after 5/min (each attempt checks the password).
 */
export async function factoryReset(password: string): Promise<void> {
  await api.request(FACTORY_RESET_PATH, anyBodySchema, { method: "DELETE", json: { password } });
}
