import { parseApiDate } from "./calendar";

const SECOND_MS = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
export const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS;
const PAD = 2;

/** A server start stamp as epoch milliseconds; null when absent or unreadable. */
export function startStamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = parseApiDate(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

/** The first known start: the server stamp wins, so the count survives a reload. */
export function firstStart(...candidates: ReadonlyArray<number | null | undefined>): number | null {
  return candidates.find((candidate) => typeof candidate === "number" && candidate > 0) ?? null;
}

/** Time since the start; a start ahead of this browser's clock (skew) counts as 0, never negative. */
export function elapsedSince(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

const pad = (value: number) => String(value).padStart(PAD, "0");

/** "mm:ss" ("01:24"), from one hour on "h:mm:ss" ("1:02:03"). */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / SECOND_MS);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  if (hours === 0) return `${pad(totalMinutes)}:${pad(seconds)}`;
  return `${hours}:${pad(totalMinutes % MINUTES_PER_HOUR)}:${pad(seconds)}`;
}

/** Whole minutes, for the screen-reader label and the reduced-motion text. */
export function elapsedMinutes(elapsedMs: number): number {
  return Math.floor(elapsedMs / MINUTE_MS);
}
