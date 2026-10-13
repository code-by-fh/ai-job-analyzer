"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { inboxListQueryOptions, inboxTotalQueryOptions, type InboxTab } from "@/api/jobList";

export function useInboxList(tab: InboxTab) {
  return useInfiniteQuery(inboxListQueryOptions(tab));
}

export type InboxListQuery = ReturnType<typeof useInboxList>;

/** Tab counters. "Neu" reads its own list (always loaded for the masthead); the others one row each. */
export function useInboxCounts(): Readonly<Record<InboxTab, number | null>> {
  const fresh = useInboxList("new");
  const below = useQuery(inboxTotalQueryOptions("below"));
  const dismissed = useQuery(inboxTotalQueryOptions("dismissed"));
  return {
    new: fresh.data?.pages[0]?.total ?? null,
    below: below.data ?? null,
    dismissed: dismissed.data ?? null,
  };
}
