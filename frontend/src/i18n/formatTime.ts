import type { Language } from "./languages";

/** Short clock time in the user's language; timeZone defaults to the browser's own zone. */
export function formatTime(timestamp: number, language: Language, timeZone?: string): string {
  return new Intl.DateTimeFormat(language, { timeStyle: "short", timeZone }).format(timestamp);
}
