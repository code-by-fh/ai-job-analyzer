"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { patchJob, type JobChecklist, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { setChecklistItem, type ChecklistKey } from "@/domain/checklist";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import {
  isLastJobWrite,
  jobWriteKey,
  jobWriteScope,
  refreshJobQueries,
  restoreFields,
} from "../jobWrites";

export type Tick = (key: ChecklistKey, done?: boolean) => void;

interface ChecklistWrite {
  checklist: JobChecklist;
  /** The cached checklist before the optimistic write. */
  previous: JobDetail["checklist"];
}

function useChecklistMutation(jobId: string) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationKey: jobWriteKey(jobId, "checklist"),
    scope: jobWriteScope(jobId),
    mutationFn: (write: ChecklistWrite) => patchJob(jobId, { checklist: write.checklist }),
    onError: (error, write) => {
      restoreFields(queryClient, jobId, { checklist: write.previous });
      toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => {
      if (isLastJobWrite(queryClient, jobId)) refreshJobQueries(queryClient, jobId);
    },
  });
}

/** Writes the next checklist into the cache at once and returns what is needed to undo it. */
function writeOptimistically(
  queryClient: QueryClient,
  job: JobDetail,
  next: { key: ChecklistKey; done: boolean },
): ChecklistWrite {
  const cached = queryClient.getQueryData<JobDetail>(queryKeys.job(job.id));
  const previous = (cached ?? job).checklist;
  const checklist = setChecklistItem(previous, next.key, next.done);
  void queryClient.cancelQueries({ queryKey: queryKeys.job(job.id) });
  restoreFields(queryClient, job.id, { checklist });
  return { checklist, previous };
}

/**
 * The server replaces the whole checklist, so every write carries all three keys, derived from the
 * latest (optimistic) cache. Writes of one job run strictly in order (shared job scope), and the
 * cache is only refetched once the last of them has settled, so a stale refetch cannot overwrite
 * newer ticks or a pending to-do.
 */
export function useTick(job: JobDetail): Tick {
  const queryClient = useQueryClient();
  const mutation = useChecklistMutation(job.id);
  return (key, done = true) =>
    mutation.mutate(writeOptimistically(queryClient, job, { key, done }));
}
