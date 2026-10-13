"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { patchJob, type JobDetail, type JobPatch } from "@/api/jobs";
import { addDays } from "@/domain/calendar";
import { FOLLOW_UP_DAYS } from "@/domain/nextStep";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { useJobFormat } from "../format/useJobFormat";
import { refreshJobQueries } from "../jobWrites";

/** PATCH, then refresh the job, its lists and the nav counts. */
export function usePatchJob(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (patch: JobPatch) => patchJob(job.id, patch),
    onSuccess: () => refreshJobQueries(queryClient, job.id),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

type PatchMutation = ReturnType<typeof usePatchJob>;

/** "Nachgefasst": the next reminder moves FOLLOW_UP_DAYS ahead (history only records statuses). */
function useFollowedUp(patch: PatchMutation): () => void {
  const { t } = useI18n();
  const toast = useToast();
  const format = useJobFormat();
  return () => {
    // Event handler, not render: reading the clock here is fine.
    const next = addDays(new Date(), FOLLOW_UP_DAYS).toISOString();
    const message = t("next.followUpSaved", { date: format.date(next) });
    patch.mutate({ next_follow_up_at: next }, { onSuccess: () => toast.show({ message }) });
  };
}

function useDismiss(job: JobDetail, patch: PatchMutation): () => void {
  const { t } = useI18n();
  const toast = useToast();
  const message = t("next.dismissed", { company: job.company ?? "" });
  const undo = { label: t("phase.undo"), onAction: () => patch.mutate({ is_archived: false }) };
  return () =>
    patch.mutate({ is_archived: true }, { onSuccess: () => toast.show({ message, action: undo }) });
}

function useRestore(job: JobDetail, patch: PatchMutation): () => void {
  const { t } = useI18n();
  const toast = useToast();
  const message = t("next.restored", { company: job.company ?? "" });
  return () => patch.mutate({ is_archived: false }, { onSuccess: () => toast.show({ message }) });
}

export function useJobActions(job: JobDetail) {
  const patch = usePatchJob(job);
  return {
    dismiss: useDismiss(job, patch),
    restore: useRestore(job, patch),
    followedUp: useFollowedUp(patch),
    busy: patch.isPending,
  };
}
