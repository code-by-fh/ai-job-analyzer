import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Preflight ruling 29 (phase 4 RB13): a request that failed, is being retried or waits for the
 * network counts as failed, so a section never shows a skeleton through a whole retry backoff.
 */
export function givenUp(query: UseQueryResult<unknown>): boolean {
  if (query.data !== undefined) return false;
  return query.isError || query.failureCount > 0 || query.fetchStatus === "paused";
}
