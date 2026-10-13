"use client";

import { renderDocument, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { TaskState, useStartTask } from "../TaskState";

/** Progress of a PDF re-render; it ends with job_update {rendered_kind} (applyEvent). */
export function RenderStatus({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const taskId = pendingTaskId.render(job.id, kind);
  const phase = useTaskPhase(taskId);
  const retry = useStartTask(taskId, () => renderDocument(job.id, kind));
  return (
    <TaskState
      phase={phase}
      runningText={t("edit.rendering")}
      onRetry={retry.run}
      busy={retry.pending}
    />
  );
}

export function useRenderRunning(jobId: string, kind: DocumentKind): boolean {
  return useTaskPhase(pendingTaskId.render(jobId, kind)) === "running";
}
