"use client";

import {
  queryOptions,
  useQuery,
  type QueryClient,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import { fetchCrawlJobs } from "@/api/crawl";
import { queryKeys } from "@/api/queryKeys";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  seedCrawlTask,
  type ActivityState,
  type CrawlSeed,
} from "./activity";

async function fetchActivity({ client }: QueryFunctionContext): Promise<ActivityState> {
  const jobs = await fetchCrawlJobs();
  // Read after the fetch, so a finish event that arrived meanwhile is not lost.
  const previous = client.getQueryData<ActivityState>(queryKeys.activity) ?? EMPTY_ACTIVITY;
  return activityFromCrawlJobs(jobs, previous, Date.now());
}

/** Shared by the hook and by prefetches. Realtime patches this entry, so it must not go stale by time. */
export function activityQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.activity,
    queryFn: fetchActivity,
    staleTime: Infinity,
  });
}

/** Background tasks: seeded from the scraper, then kept current by realtime events. */
export function useActivity(enabled: boolean): ActivityState {
  const query = useQuery({ ...activityQueryOptions(), enabled });
  return query.data ?? EMPTY_ACTIVITY;
}

/**
 * How long a start waits for the running crawls before it seeds anyway. Durchsuchen stays busy and a
 * cancel of the same source queues behind the start meanwhile, so a scraper that does not answer
 * must not hold either for long.
 */
export const SEED_WAIT_MS = 2000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Seeds the activity cache right after a source's crawl was accepted (D4). With no entry yet, the
 * scraper is asked first (or the request already on its way is joined): a bare setQueryData would
 * count as fresh data under `staleTime: Infinity`, so the other running crawls would never load,
 * and a seed request that lands later would replace the seeded crawl.
 */
export async function markCrawlStarted(queryClient: QueryClient, seed: CrawlSeed): Promise<void> {
  try {
    const loaded = queryClient.ensureQueryData({ ...activityQueryOptions(), retry: false });
    await Promise.race([loaded, wait(SEED_WAIT_MS)]);
  } catch {
    // The scraper cannot be asked right now; the crawl the user just started must still show.
    // The next reconnect refetch brings the rest.
  }
  queryClient.setQueryData<ActivityState>(queryKeys.activity, (state) =>
    seedCrawlTask(state ?? EMPTY_ACTIVITY, seed, Date.now()),
  );
}
