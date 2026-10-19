"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { patchJob, type JobDetail, type JobPatch } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import {
  isLastJobWrite,
  jobWriteKey,
  jobWriteScope,
  refreshJobQueries,
  restoreFields,
} from "./jobWrites";

/** Job fields written optimistically, one PATCH per change: both checklists and the start date. */
export type OptimisticField = "checklist" | "first_day_checklist" | "start_date";
export type NextValue<F extends OptimisticField> = (previous: JobDetail[F]) => JobDetail[F];

interface FieldWrite<F extends OptimisticField> {
  value: JobDetail[F];
  /** The cached value before the optimistic write. */
  previous: JobDetail[F];
}

function useFieldMutation<F extends OptimisticField>(jobId: string, field: F) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationKey: jobWriteKey(jobId, field),
    scope: jobWriteScope(jobId),
    // JobPatch types each field like JobDetail minus the read-side null; the server takes both.
    mutationFn: (write: FieldWrite<F>) => patchJob(jobId, { [field]: write.value } as JobPatch),
    onError: (error, write) => {
      restoreFields(queryClient, jobId, { [field]: write.previous });
      toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => {
      if (isLastJobWrite(queryClient, jobId)) refreshJobQueries(queryClient, jobId);
    },
  });
}

/** Writes the next value into the cache at once and returns what is needed to undo it. */
function writeOptimistically<F extends OptimisticField>(
  queryClient: QueryClient,
  job: JobDetail,
  change: { field: F; next: NextValue<F> },
): FieldWrite<F> {
  const cached = queryClient.getQueryData<JobDetail>(queryKeys.job(job.id));
  const previous = (cached ?? job)[change.field];
  const value = change.next(previous);
  void queryClient.cancelQueries({ queryKey: queryKeys.job(job.id) });
  restoreFields(queryClient, job.id, { [change.field]: value });
  return { value, previous };
}

/**
 * The server replaces such a field as a whole, so every write derives the full value from the
 * latest (optimistic) cache. Writes of one job run strictly in order (shared job scope), and the
 * cache is only refetched once the last of them has settled, so a stale refetch cannot overwrite
 * a newer value or a pending to-do.
 */
export function useOptimisticWrite<F extends OptimisticField>(job: JobDetail, field: F) {
  const queryClient = useQueryClient();
  const mutation = useFieldMutation(job.id, field);
  return (next: NextValue<F>) =>
    mutation.mutate(writeOptimistically(queryClient, job, { field, next }));
}
