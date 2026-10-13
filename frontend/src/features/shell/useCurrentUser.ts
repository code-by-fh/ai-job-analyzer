"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/api/auth";
import { queryKeys } from "@/api/queryKeys";

export function useCurrentUser() {
  // The user only changes through login or logout, and both reset the cache.
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchCurrentUser, staleTime: Infinity });
}
