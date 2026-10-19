"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchJob, type JobDetail, type JobPatch } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { interviewDatePatch } from "../dates/datesForm";
import { refreshJobQueries } from "../jobWrites";
import type { InterviewDate } from "./InterviewDateFields";

/** Saves the phase dialog's interview date after the status change; an empty day sends nothing. */
export function useSaveInterviewDate(job: JobDetail) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: JobPatch) => patchJob(job.id, patch),
    onSuccess: () => refreshJobQueries(queryClient, job.id),
    // The status is already changed, so the fixed sentence points to where the date can be added.
    onError: () => toast.show({ tone: "error", message: t("guard.interview.failed") }),
  });
  const save = async ({ day, time }: InterviewDate): Promise<void> => {
    const patch = interviewDatePatch(day, time);
    if (Object.keys(patch).length === 0) return;
    // onError has told the user; the dialog closes either way because the status did change.
    await mutation.mutateAsync(patch).catch(() => undefined);
  };
  return { save, isPending: mutation.isPending };
}
