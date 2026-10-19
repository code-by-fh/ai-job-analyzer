import type { FirstDayChecklist } from "@/api/jobs";

/** Order of the "1. Arbeitstag" checklist (feedback 1 T14); mirrors server FirstDayChecklist. */
export const FIRST_DAY_KEYS = [
  "contract_signed",
  "papers_ready",
  "others_declined",
  "route_planned",
  "first_day_contact",
] as const;
export type FirstDayKey = (typeof FIRST_DAY_KEYS)[number];

const EMPTY_FIRST_DAY: FirstDayChecklist = {
  contract_signed: false,
  papers_ready: false,
  others_declined: false,
  route_planned: false,
  first_day_contact: false,
};

export function firstDayChecklistOf(value?: FirstDayChecklist | null): FirstDayChecklist {
  return { ...EMPTY_FIRST_DAY, ...value };
}

/** Always returns every key: PATCH replaces the whole object, a missing key would reset to false. */
export function setFirstDayItem(
  checklist: FirstDayChecklist | null | undefined,
  key: FirstDayKey,
  done: boolean,
): FirstDayChecklist {
  return { ...firstDayChecklistOf(checklist), [key]: done };
}

export function firstDayDoneCount(checklist?: FirstDayChecklist | null): number {
  const full = firstDayChecklistOf(checklist);
  return FIRST_DAY_KEYS.filter((key) => full[key]).length;
}
