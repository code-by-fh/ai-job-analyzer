import type { QueryClient } from "@tanstack/react-query";
import type { JobListPage } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";

type CachedList = Partial<JobListPage> & { pages?: ReadonlyArray<Partial<JobListPage>> };

/** Rows of a cached list: a plain page ({items}) or an infinite query ({pages: [{items}]}). */
function listedRows(data: unknown): ReadonlyArray<{ id: string }> {
  if (typeof data !== "object" || data === null) return [];
  const list = data as CachedList;
  return list.items ?? list.pages?.flatMap((page) => page.items ?? []) ?? [];
}

/**
 * True when this tab holds the job in a detail query or in any loaded list. Other data under
 * the jobs root (tab counters) has no rows and is skipped.
 */
export function isJobInCache(queryClient: QueryClient, jobId: string): boolean {
  if (queryClient.getQueryData(queryKeys.job(jobId)) !== undefined) return true;
  return queryClient
    .getQueriesData({ queryKey: queryKeys.jobsRoot })
    .some(([, data]) => listedRows(data).some((row) => row.id === jobId));
}
