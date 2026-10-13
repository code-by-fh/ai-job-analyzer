import { QueryClient } from "@tanstack/react-query";
import { ApiError, FIRST_SERVER_ERROR_STATUS, NO_RESPONSE_STATUS } from "./errors";

export const MAX_QUERY_RETRIES = 2;
const STALE_TIME_MS = 30_000;

/** Retries only what can heal by itself: network failures and 5xx. 4xx will not change on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const isClientError =
    error instanceof ApiError &&
    error.status > NO_RESPONSE_STATUS &&
    error.status < FIRST_SERVER_ERROR_STATUS;
  return !isClientError && failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // The WebSocket keeps data fresh, so focus refetches would only add load.
      queries: { retry: shouldRetry, staleTime: STALE_TIME_MS, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
