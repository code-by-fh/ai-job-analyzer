import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { API_BASE_URL } from "@/config";
import { isLanguage, type Language } from "@/i18n/languages";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";
import {
  STORAGE_DISCONNECT_PATH,
  STORAGE_LOGIN_PATH,
  STORAGE_SERVICES,
  STORAGE_STATUS_PATH,
  STORAGE_TOGGLE_PATH,
  TIMEZONE_PATH,
  type StorageService,
} from "./settingsPaths";

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

// Storage writes answer a status the web does not read.
const anyBodySchema = z.unknown();
const savedTimezoneSchema = z.object({ timezone: z.string() });

/** The server stores a valid zone or falls back to Europe/Berlin; the answer is what it stored. */
export async function saveTimezone(zone: string): Promise<string> {
  const json = { timezone: zone };
  const saved = await api.request(TIMEZONE_PATH, savedTimezoneSchema, { method: "POST", json });
  return saved.timezone;
}

// routers/storage.py GET /storage/status: booleans and the user's own Drive address, no token.
export const storageStatusSchema = z.object({
  available: z.boolean().catch(false),
  connected: z.boolean().catch(false),
  active: z.enum(STORAGE_SERVICES).catch("NONE"),
  email: z
    .string()
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
});
export type StorageStatus = z.infer<typeof storageStatusSchema>;
export type StorageStatusBody = z.input<typeof storageStatusSchema>;

export function storageStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.storageStatus,
    queryFn: () => api.request(STORAGE_STATUS_PATH, storageStatusSchema),
  });
}

/** 400 when Drive is chosen but not connected. */
export async function toggleStorage(service: StorageService): Promise<void> {
  await api.request(STORAGE_TOGGLE_PATH, anyBodySchema, { method: "POST", json: { service } });
}

export async function disconnectDrive(): Promise<void> {
  await api.request(STORAGE_DISCONNECT_PATH, anyBodySchema, { method: "POST" });
}

/** A full navigation target (Google's consent page follows); built from config, never from data. */
export function driveLoginUrl(): string {
  return `${API_BASE_URL}${STORAGE_LOGIN_PATH}`;
}
