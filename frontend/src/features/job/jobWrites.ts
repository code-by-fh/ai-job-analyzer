import type { QueryClient } from "@tanstack/react-query";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";

/**
 * One mutation scope for every optimistic write of a job (checklist, to-dos, notes): they run
 * strictly one after the other, so a settle refetch never lands while another write of the same job
 * is still waiting, and its stale answer cannot overwrite that write's optimistic value.
 */
export const jobWriteScope = (jobId: string) => ({ id: `job-${jobId}` });

/** Every key lies under ["job", id], so isLastJobWrite counts the writes of all three fields. */
export const jobWriteKey = (jobId: string, field: "checklist" | "todos" | "notes") =>
  [...queryKeys.job(jobId), `${field}-write`] as const;

/** True while settling the last pending write of the job (the settling one still counts). */
export function isLastJobWrite(queryClient: QueryClient, jobId: string): boolean {
  return queryClient.isMutating({ mutationKey: queryKeys.job(jobId) }) === 1;
}

/** Rolls back only the failed write's own field; other optimistic fields stay. */
export function restoreFields(
  queryClient: QueryClient,
  jobId: string,
  fields: Partial<JobDetail>,
): void {
  queryClient.setQueryData<JobDetail>(queryKeys.job(jobId), (current) =>
    current ? { ...current, ...fields } : current,
  );
}

/** After a PATCH: the job, its lists and the nav counts (due badge) may all have changed. */
export function refreshJobQueries(queryClient: QueryClient, jobId: string): void {
  for (const queryKey of [queryKeys.job(jobId), queryKeys.jobsRoot, queryKeys.jobCounts]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
