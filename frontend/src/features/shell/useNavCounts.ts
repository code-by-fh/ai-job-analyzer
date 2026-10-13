"use client";

import { useQuery } from "@tanstack/react-query";
import { jobCountsQueryOptions, openMatchCount } from "@/api/jobs";
import { countFailingPlatforms, fetchPlatforms } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { useDueCount } from "./useDueCount";

export interface NavCounts {
  inbox: number;
  sourceErrors: number;
  /** Due next steps of active applications (spec 4.1). */
  applicationsDue: number;
}

/** Badge numbers of the main navigation; realtime invalidates both queries after crawls. */
export function useNavCounts(enabled: boolean): NavCounts {
  const counts = useQuery({ ...jobCountsQueryOptions(), enabled });
  const platforms = useQuery({ queryKey: queryKeys.platforms, queryFn: fetchPlatforms, enabled });
  const applicationsDue = useDueCount(enabled);
  return {
    inbox: openMatchCount(counts.data),
    sourceErrors: countFailingPlatforms(platforms.data ?? []),
    applicationsDue: applicationsDue ?? 0,
  };
}
