"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { changeJobStatus, type JobDetail, type StatusChange } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { isUserStatus, type UserStatus } from "@/domain/jobStatus";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast, type ToastApi } from "@/ui/ToastProvider";
import { currentPhaseLabel } from "../labels";

export interface StatusChangeInput {
  to: UserStatus;
  note?: string;
}

// 400 (system target) and 409 (locked state) both mean the server refused this phase.
const REFUSED = { BAD_REQUEST: "phase.refused", CONFLICT: "phase.refused" } as const;

function storeJob(queryClient: QueryClient, job: JobDetail): void {
  // A GET still in flight (e.g. realtime-triggered) carries the old status; it must not land after.
  void queryClient.cancelQueries({ queryKey: queryKeys.job(job.id), exact: true });
  queryClient.setQueryData(queryKeys.job(job.id), job);
  for (const queryKey of [queryKeys.jobHistory(job.id), queryKeys.jobsRoot, queryKeys.jobCounts]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

function useStatusMutation(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (change: StatusChange) => changeJobStatus(job.id, change),
    onSuccess: (updated) => storeJob(queryClient, updated),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t, REFUSED) }),
  });
}

/** The only status write of the UI (spec success criterion 2): server-validated, with history and undo. */
export function useChangeStatus(job: JobDetail) {
  const { t } = useI18n();
  const toast = useToast();
  const mutation = useStatusMutation(job);
  // Errors are already toasted by the mutation; callers only need to know that it failed.
  const run = (change: StatusChange) => mutation.mutateAsync(change).catch(() => null);
  const changeStatus = async (input: StatusChangeInput): Promise<JobDetail | null> => {
    const updated = await run(input);
    if (updated) announce({ toast, t, previous: job.status, updated, run });
    return updated;
  };
  return { changeStatus, isPending: mutation.isPending };
}

interface Announcement {
  toast: ToastApi;
  t: Translate;
  previous: string;
  updated: JobDetail;
  run: (change: StatusChange) => Promise<JobDetail | null>;
}

function announce({ toast, t, previous, updated, run }: Announcement): void {
  const message = t("phase.changed", { phase: t(currentPhaseLabel(updated)) });
  // A failed generation (FAILED) is not a user status, so there is nothing to go back to.
  // Undo skips the backward-move confirmation: the user has just made the move being undone.
  const undo = async () => {
    const restored = await run({ to: previous });
    if (restored)
      toast.show({ message: t("phase.undone", { phase: t(currentPhaseLabel(restored)) }) });
  };
  const action = isUserStatus(previous)
    ? { label: t("phase.undo"), onAction: () => void undo() }
    : undefined;
  toast.show({ message, action });
}
