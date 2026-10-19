"use client";

import type { JobDetail } from "@/api/jobs";
import { setChecklistItem, type ChecklistKey } from "@/domain/checklist";
import { setFirstDayItem, type FirstDayKey } from "@/domain/firstDay";
import { useOptimisticWrite } from "../useOptimisticWrite";

export type Tick = (key: ChecklistKey, done?: boolean) => void;
export type FirstDayTick = (key: FirstDayKey, done: boolean) => void;

/** The apply checklist (jobs.checklist); every write carries all three keys. */
export function useTick(job: JobDetail): Tick {
  const write = useOptimisticWrite(job, "checklist");
  return (key, done = true) => write((previous) => setChecklistItem(previous, key, done));
}

/** The "1. Arbeitstag" checklist (jobs.first_day_checklist, feedback 1 T14). */
export function useFirstDayTick(job: JobDetail): FirstDayTick {
  const write = useOptimisticWrite(job, "first_day_checklist");
  return (key, done) => write((previous) => setFirstDayItem(previous, key, done));
}
