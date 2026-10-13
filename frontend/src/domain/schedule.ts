import type { Platform } from "@/api/platforms";

// The schedule rules of the scheduler (server/workers/tasks/scheduling.py), read by the sources
// page and the inbox run line alike. Kept apart so runLine.ts and sources.ts need not import
// each other.

const SCHEDULE_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAYS_AHEAD = 7;
const DAYS_PER_WEEK = 7;
// Date#getDay() starts on Sunday; the server's schedule_days start on Monday (0).
const MONDAY_SHIFT = 6;

export function isScheduleTime(text: string): boolean {
  return SCHEDULE_TIME.test(text);
}

export interface Schedule {
  time: string;
  days: number[];
}

/** Server weekday indices: 0 = Monday (workers/tasks/scheduling.py). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** D6: what switching the schedule on starts from (the old UI's default). */
export const DEFAULT_SCHEDULE: Schedule = { time: "08:00", days: [0, 1, 2, 3, 4] };

const isWeekday = (day: number) => (WEEKDAYS as readonly number[]).includes(day);

/** A schedule the scheduler would run, or null ("Nur manuell"). Wall time of the profile zone. */
export function scheduleOf(
  platform: Pick<Platform, "schedule_time" | "schedule_days">,
): Schedule | null {
  const time = platform.schedule_time ?? "";
  const days = [...new Set((platform.schedule_days ?? []).filter(isWeekday))].sort((a, b) => a - b);
  return isScheduleTime(time) && days.length > 0 ? { time, days } : null;
}

/** Next scheduled crawl over all active sources, in the browser's zone (G12). */
export function nextRunAt(platforms: readonly Platform[], now: Date): Date | null {
  return platforms
    .flatMap((platform) => nextSlot(platform, now) ?? [])
    .reduce<Date | null>((first, slot) => (first && first <= slot ? first : slot), null);
}

function nextSlot(platform: Platform, now: Date): Date | null {
  const schedule = scheduleOf(platform);
  if (!platform.is_active || !schedule) return null;
  const [hours, minutes] = schedule.time.split(":").map(Number);
  for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
    const day = now.getDate() + offset;
    const slot = new Date(now.getFullYear(), now.getMonth(), day, hours, minutes);
    if (slot > now && schedule.days.includes(serverWeekday(slot))) return slot;
  }
  return null;
}

function serverWeekday(date: Date): number {
  return (date.getDay() + MONDAY_SHIFT) % DAYS_PER_WEEK;
}
