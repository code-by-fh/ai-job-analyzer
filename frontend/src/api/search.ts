import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { SEARCH_LIMITS, searchPath } from "./adminPaths";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

// The same words typed again within half a minute need no request.
const SEARCH_STALE_MS = 30_000;

// routers/search.py _job_hit; owner-scoped, at most 8 jobs and 5 companies.
const jobHitSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  company_domain: z.string().nullish(),
  status: z.string(),
  is_archived: z.boolean(),
});
const searchResultSchema = z.object({
  jobs: z.array(jobHitSchema),
  companies: z.array(z.object({ domain: z.string(), name: z.string() })),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResultBody = z.input<typeof searchResultSchema>;

/**
 * The server trims and counts code points (422 under 2), so the web trims too: it sends nothing
 * shorter, and " ko" shares the cache entry and the request of "ko". 429 after 60/min; the signal
 * aborts a request nobody observes any more (typing moved on).
 */
export function searchQueryOptions(q: string) {
  const text = q.trim();
  return queryOptions({
    queryKey: queryKeys.search(text),
    queryFn: ({ signal }) => api.request(searchPath(text), searchResultSchema, { signal }),
    enabled: Array.from(text).length >= SEARCH_LIMITS.min,
    staleTime: SEARCH_STALE_MS,
  });
}
