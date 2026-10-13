import { calendarDaysBetween } from "@/domain/calendar";
import { formatDate } from "./formatDate";
import { formatTime } from "./formatTime";
import type { Language } from "./languages";
import type { Translate } from "./translate";

export interface DayTimeClock {
  now: number;
  language: Language;
  timeZone?: string;
}

const DAYS_PER_WEEK = 7;

/** "heute 14:00", "morgen 07:00", "gestern 18:10", "Montag 07:00" (this week, ahead), else the date. */
export function formatDayTime(date: Date, t: Translate, clock: DayTimeClock): string {
  const days = calendarDaysBetween(new Date(clock.now), date, clock.timeZone);
  const time = formatTime(date.getTime(), clock.language, clock.timeZone);
  if (days === 0) return t("day.today", { time });
  if (days === 1) return t("day.tomorrow", { time });
  if (days === -1) return t("day.yesterday", { time });
  if (days > 1 && days < DAYS_PER_WEEK) {
    return t("day.weekday", { weekday: weekdayOf(date, clock), time });
  }
  const day = formatDate(date.toISOString(), clock.language, clock.timeZone);
  return t("day.date", { date: day, time });
}

function weekdayOf(date: Date, clock: DayTimeClock): string {
  const options = { weekday: "long", timeZone: clock.timeZone } as const;
  return new Intl.DateTimeFormat(clock.language, options).format(date);
}
