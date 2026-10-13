"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/queryKeys";
import { HTTP_NOT_FOUND } from "@/features/profile/refusals";
import { closeThenFocus } from "@/ui/focus";

/** The detail's h1; it stays when the profile and its admin actions go. */
export const DETAIL_HEADING_ID = "company-detail-h";

/** Closes an admin dialog whose opener may leave with the profile; focus moves to the h1. */
export function leaveForHeading(onClose: () => void): void {
  closeThenFocus(onClose, () => document.getElementById(DETAIL_HEADING_ID));
}

/** A 404 from an admin action: another admin deleted the profile meanwhile. */
export const isProfileGone = (error: unknown): boolean =>
  error instanceof ApiError && error.status === HTTP_NOT_FOUND;

/**
 * The profile's name changed or went: a cached search still holds the old one. Invalidating would
 * show it once more on reopen until the refetch, so the entries go and the next search loads.
 */
export function dropCachedSearches(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.searchRoot });
}

/**
 * After a 404 the detail refetches the profile (none, so the admin actions go) and the directory,
 * and the dialog closes onto the h1 (7b ruling 28).
 */
export function useProfileGone(domain: string, onClose: () => void): () => void {
  const queryClient = useQueryClient();
  return () => {
    leaveForHeading(onClose);
    void queryClient.invalidateQueries({ queryKey: queryKeys.company(domain) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.companiesRoot });
    dropCachedSearches(queryClient);
  };
}
