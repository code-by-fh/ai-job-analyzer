export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "de";
export const LANGUAGE_STORAGE_KEY = "ajp-language";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Maps a BCP 47 tag such as "en-US" to a supported language; German otherwise. */
export function languageFromLocale(locale: string | undefined): Language {
  const primary = locale?.split("-")[0]?.toLowerCase();
  return isLanguage(primary) ? primary : DEFAULT_LANGUAGE;
}
