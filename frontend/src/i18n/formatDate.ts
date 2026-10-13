import { calendarDaysBetween, parseApiDate } from "@/domain/calendar";
import type { Language } from "./languages";
import type { Translate } from "./translate";

export interface Clock {
  now: number;
  /** IANA zone the calendar days are counted in; defaults to the browser's own zone. */
  timeZone?: string;
}

/**
 * Calendar date in the user's language ("07.10.2026", "Oct 7, 2026").
 * @throws RangeError when `iso` is not a date.
 */
export function formatDate(iso: string, language: Language, timeZone?: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone }).format(
    parseApiDate(iso),
  );
}

/**
 * Date and short time ("07.10.2026, 12:05", "Oct 7, 2026, 12:05 PM").
 * @throws RangeError when `iso` is not a date.
 */
export function formatDateTime(iso: string, language: Language, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", timeZone };
  return new Intl.DateTimeFormat(language, options).format(parseApiDate(iso));
}

/**
 * Whole calendar days between `iso` and `clock.now` ("seit 3 Tagen", "heute", "in 2 Tagen").
 * @throws RangeError when `iso` is not a date.
 */
export function formatRelativeDays(iso: string, t: Translate, clock: Clock): string {
  const days = calendarDaysBetween(new Date(clock.now), parseApiDate(iso), clock.timeZone);
  if (days === 0) return t("date.today");
  const count = Math.abs(days);
  if (days < 0) return count === 1 ? t("date.sinceOne") : t("date.sinceMany", { count });
  return count === 1 ? t("date.inOne") : t("date.inMany", { count });
}
