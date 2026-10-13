"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { applicationsListQueryOptions, applicationsTotalQueryOptions } from "@/api/jobList";
import { givenUp } from "@/api/queryState";
import { groupByPhase, type PhaseGroups } from "@/domain/applications";
import { flattenPages, type ListStatus } from "@/domain/inbox";
import { useNow } from "@/lib/clock";

export function useActiveApplications(q: string) {
  return useInfiniteQuery(applicationsListQueryOptions({ group: "active", q }));
}

/** Both lists share one options factory, so one type serves the active and the closed list. */
export type ApplicationsListQuery = ReturnType<typeof useActiveApplications>;

/** Mounted only while the closed rows are shown, so they load only then (decision D2). */
export function useClosedApplications(q: string): ApplicationsListQuery {
  return useInfiniteQuery(applicationsListQueryOptions({ group: "closed", q }));
}

export function useClosedTotal(q: string) {
  return useQuery(applicationsTotalQueryOptions({ group: "closed", q }));
}

export type ClosedTotalQuery = ReturnType<typeof useClosedTotal>;

/**
 * The closed count as far as a gate needs it (RB13): known, or given up on because the request
 * failed, is being retried or waits for the network. An unknown count then counts as 0, so no
 * view waits on it without bound. Undefined means "still asking".
 */
export function settledClosedCount(total: ClosedTotalQuery): number | undefined {
  if (total.data !== undefined) return total.data;
  return givenUp(total) ? 0 : undefined;
}

/** The loaded active rows by effective phase (gap G4); undefined until the first answer. */
export function usePhaseGroups(q: string): PhaseGroups | undefined {
  const list = useActiveApplications(q);
  const now = useNow();
  return list.data ? groupByPhase(flattenPages(list.data.pages), new Date(now)) : undefined;
}

/** The input of listPhase for either list (RB6: one place for the active and the closed list). */
export function listStatus(list: ApplicationsListQuery): ListStatus {
  return {
    hasData: list.data !== undefined,
    isError: list.isError,
    failureCount: list.failureCount,
    itemCount: flattenPages(list.data?.pages).length,
  };
}
