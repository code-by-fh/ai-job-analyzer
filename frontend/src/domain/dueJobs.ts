import type { JobListItem } from "@/api/jobList";
import { isDue, nextStep, type NextStep } from "./nextStep";

export const MAX_DUE_ENTRIES = 3;

export interface DueEntry {
  item: JobListItem;
  step: NextStep;
}

/** The inbox "Anstehend" card (spec 4.2): applications whose next step is due, earliest first. */
export function dueEntries(items: readonly JobListItem[], now: Date): DueEntry[] {
  return items
    .map((item) => ({ item, step: nextStep(item, now) }))
    .filter((entry) => isDue(entry.step))
    .sort((first, second) => dueTime(first) - dueTime(second))
    .slice(0, MAX_DUE_ENTRIES);
}

function dueTime(entry: DueEntry): number {
  return entry.step.due?.getTime() ?? Number.POSITIVE_INFINITY;
}

/** Spec 4.1/4.2 "fällig": the card's rule without its limit (Bewerbungen header and nav badge). */
export function countDue(items: readonly JobListItem[], now: Date): number {
  return items.filter((item) => isDue(nextStep(item, now))).length;
}
