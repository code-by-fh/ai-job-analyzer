export const DAY_MS = 86_400_000;

// API timestamps are ISO 8601 with "Z" or an offset; older rows carry none and are UTC by contract.
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const HAS_TIME = /^\d{4}-\d{2}-\d{2}[T ]/;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;
// en-CA formats dates as YYYY-MM-DD, which is what <input type="date"> needs.
const ISO_DAY_LOCALE = "en-CA";
// A date picked without a time means "that day"; 09:00 keeps it on the same day in every zone near Europe.
const PICKED_DAY_HOUR = 9;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;

/** Reads an API timestamp; a date-time without zone is UTC. Invalid input yields an Invalid Date. */
export function parseApiDate(iso: string): Date {
  // Date.parse reads a zone-less date-time as local time; appending "Z" pins it to UTC.
  const normalised = iso.trim().replace(" ", "T");
  const isUtcByContract = HAS_TIME.test(normalised) && !HAS_ZONE.test(normalised);
  return new Date(isUtcByContract ? `${normalised}Z` : normalised);
}

/** Whether an API timestamp reads as a date; the date formatters throw on anything else. */
export function isApiDate(iso: string): boolean {
  return !Number.isNaN(parseApiDate(iso).getTime());
}

/** The calendar day of `date` in the zone, as YYYY-MM-DD. */
export function toDateInputValue(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(ISO_DAY_LOCALE, { timeZone }).format(date);
}

/** Whole calendar days from `from` to `to` in the zone, independent of clock time and DST. */
export function calendarDaysBetween(from: Date, to: Date, timeZone?: string): number {
  const start = Date.parse(`${toDateInputValue(from, timeZone)}T00:00:00Z`);
  const end = Date.parse(`${toDateInputValue(to, timeZone)}T00:00:00Z`);
  return Math.round((end - start) / DAY_MS);
}

/**
 * Adds days as 24-hour blocks of absolute time, not local calendar components: over a DST switch the
 * local clock hour moves by one, the calendar day stays right. Reminders only use the day.
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "2026-10-20" -> that day at 09:00 local time; null when the value is not a real date. */
export function fromDateInputValue(value: string): Date | null {
  const match = DATE_INPUT.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < FIRST_MONTH || month > LAST_MONTH) return null;
  const date = new Date(year, month - 1, day, PICKED_DAY_HOUR);
  return date.getDate() === day ? date : null;
}
