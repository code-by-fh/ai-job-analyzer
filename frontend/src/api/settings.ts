import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { isLanguage, type Language } from "@/i18n/languages";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";
import { TIMEZONE_PATH } from "./settingsPaths";

// GET /settings returns the whole profile; phase 1 only needs the language.
const languageSettingsSchema = z.object({ language: z.string().nullish() });
const savedLanguageSchema = z.object({ status: z.string(), language: z.string() });
export type LanguageSettingsBody = z.input<typeof languageSettingsSchema>;
export type SavedLanguageBody = z.input<typeof savedLanguageSchema>;

/** The stored language (it also sets the language of AI output); null when unset or unsupported. */
export async function fetchLanguagePreference(): Promise<Language | null> {
  const settings = await api.request("/settings", languageSettingsSchema);
  return isLanguage(settings.language) ? settings.language : null;
}

export async function saveLanguagePreference(language: Language): Promise<void> {
  await api.request("/language-preference", savedLanguageSchema, {
    method: "POST",
    json: { language },
  });
}

// Only the zone is parsed; secrets in the same body are masked server-side and never read (G26).
const timezoneSettingsSchema = z.object({ timezone: z.string().nullish() });
export type TimezoneSettingsBody = z.input<typeof timezoneSettingsSchema>;

/** The zone the scheduler compares schedule times with (D6); null when unset. */
export function profileTimezoneQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.profileTimezone,
    queryFn: async () => (await api.request("/settings", timezoneSettingsSchema)).timezone ?? null,
  });
}

const savedTimezoneSchema = z.object({ timezone: z.string() });

/** The server stores a valid zone or falls back to Europe/Berlin; the answer is what it stored. */
export async function saveTimezone(zone: string): Promise<string> {
  const json = { timezone: zone };
  const saved = await api.request(TIMEZONE_PATH, savedTimezoneSchema, { method: "POST", json });
  return saved.timezone;
}
