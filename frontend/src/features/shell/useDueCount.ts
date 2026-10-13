"use client";

import { useQuery } from "@tanstack/react-query";
import { dueApplicationsQueryOptions } from "@/api/jobList";
import { countDue } from "@/domain/dueJobs";
import { useNow } from "@/lib/clock";

/**
 * Decision D13: "fällig" for the nav badge and the Bewerbungen header. It reads the query the inbox
 * "Anstehend" card reads, so the three never disagree (spec 4.4). Null until the list answered.
 */
export function useDueCount(enabled = true): number | null {
  const now = useNow();
  const due = useQuery({ ...dueApplicationsQueryOptions(), enabled });
  return due.data ? countDue(due.data.items, new Date(now)) : null;
}
