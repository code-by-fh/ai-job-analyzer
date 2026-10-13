"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { SEARCH_LIMITS } from "@/api/adminPaths";
import { givenUp } from "@/api/queryState";
import { searchQueryOptions, type SearchResult } from "@/api/search";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

export type SearchState = "short" | "loading" | "ready" | "error";

export interface SearchResults {
  query: string;
  result: SearchResult | undefined;
  state: SearchState;
  error: unknown;
  retry: () => void;
}

function stateOf(query: string, results: UseQueryResult<SearchResult>): SearchState {
  if (Array.from(query).length < SEARCH_LIMITS.min) return "short";
  if (results.data) return "ready";
  return givenUp(results) ? "error" : "loading";
}

/**
 * D10: one request per pause in typing. The query key carries the text, so a late answer for
 * older text never shows for newer text. Code points as the server counts them (ruling 9).
 */
export function useSearchResults(text: string): SearchResults {
  const query = useDebouncedValue(text.trim(), SEARCH_LIMITS.debounceMs);
  const results = useQuery(searchQueryOptions(query));
  return {
    query,
    result: results.data,
    state: stateOf(query, results),
    error: results.error,
    retry: () => void results.refetch(),
  };
}
