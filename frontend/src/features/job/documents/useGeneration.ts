"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { cancelGeneration, generateLetter, generatePackage } from "@/api/jobDocuments";
import { patchJob, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import type { DocumentPresence } from "@/domain/documents";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskFinished, markTaskStarted, useTaskPhase } from "@/realtime/usePendingTasks";
import { useToast } from "@/ui/ToastProvider";

export type GenerationRequest =
  | { kind: "both"; includeProfileDocuments: boolean }
  | { kind: "cv"; notes: string; includeProfileDocuments: boolean }
  | { kind: "cover_letter"; notes: string };

export type GenerationProblem = "profileIncomplete" | "unknown";

// The only generation_error texts the UI may interpret (server workers, German and English).
const PROFILE_INCOMPLETE = /^(profil unvollständig|profile incomplete)/i;

/** Decision D8: CV notes travel in jobs.cv_draft; an empty note clears an old one. */
export async function runGeneration(jobId: string, request: GenerationRequest): Promise<void> {
  if (request.kind === "cover_letter") return generateLetter(jobId, request.notes);
  if (request.kind === "cv") {
    await patchJob(jobId, { cv_draft: request.notes.trim() });
    return generatePackage(jobId, {
      cv: true,
      letter: false,
      includeProfileDocuments: request.includeProfileDocuments,
    });
  }
  return generatePackage(jobId, {
    cv: true,
    letter: true,
    includeProfileDocuments: request.includeProfileDocuments,
  });
}

/**
 * Creates only what is missing, so a finished document is never overwritten by accident; null when
 * nothing is missing.
 */
export function missingRequest(
  presence: DocumentPresence,
  includeProfileDocuments: boolean,
): GenerationRequest | null {
  if (!presence.cv && !presence.cover_letter) return { kind: "both", includeProfileDocuments };
  if (!presence.cv) return { kind: "cv", notes: "", includeProfileDocuments };
  if (!presence.cover_letter) return { kind: "cover_letter", notes: "" };
  return null;
}

export function generationProblem(error?: string | null): GenerationProblem | null {
  if (!error) return null;
  return PROFILE_INCOMPLETE.test(error.trim()) ? "profileIncomplete" : "unknown";
}

function refreshJob(queryClient: QueryClient, jobId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.job(jobId) });
}

function useStartGeneration(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (request: GenerationRequest) => runGeneration(job.id, request),
    onSuccess: () => {
      markTaskStarted(queryClient, pendingTaskId.generation(job.id), Date.now());
      refreshJob(queryClient, job.id);
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function useCancelGeneration(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: () => cancelGeneration(job.id),
    onSuccess: () => {
      markTaskFinished(queryClient, pendingTaskId.generation(job.id));
      refreshJob(queryClient, job.id);
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/**
 * Start and cancel; the end arrives as job_update (applyEvent finishes the pending task). Every
 * start control is busy while the request or the pending generation task runs, so the card and
 * the tab cannot start a second run before the job reports GENERATING.
 */
export function useGeneration(job: JobDetail) {
  const start = useStartGeneration(job);
  const cancel = useCancelGeneration(job);
  const running = useTaskPhase(pendingTaskId.generation(job.id)) === "running";
  return {
    start: start.mutate,
    starting: start.isPending || running,
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  };
}
