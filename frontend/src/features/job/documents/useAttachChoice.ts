"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";

// The package attaches profile documents by default (backend default include_profile_documents=true).
export const ATTACH_BY_DEFAULT = true;

/**
 * One "attach profile documents" choice per job, shared by the next-step card and the Unterlagen
 * tab, so both create with the same setting. Client-only state in the query cache (no server field).
 */
export function useAttachChoice(jobId: string): [boolean, (attach: boolean) => void] {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.attachChoice(jobId);
  const query = useQuery({
    queryKey,
    queryFn: () => queryClient.getQueryData<boolean>(queryKey) ?? ATTACH_BY_DEFAULT,
    initialData: ATTACH_BY_DEFAULT,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return [query.data, (attach) => queryClient.setQueryData(queryKey, attach)];
}
