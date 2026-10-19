"use client";

import { useQueryClient } from "@tanstack/react-query";
import { startPostingDetails, type JobDetail, type PostingDetailsStart } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { firstStart, startStamp } from "@/domain/elapsed";
import { pendingTaskId } from "@/domain/pendingTasks";
import { postingDetailsPhase } from "@/domain/postingDetails";
import { usePendingStart, useTaskPhase } from "@/realtime/usePendingTasks";
import { useStartTask } from "../TaskState";

/**
 * Starts the extraction of contacts, recruiter and salary from the stored posting. The phase comes
 * from the job's server run state and the pending task, so it survives a reload.
 */
export function usePostingDetails(job: JobDetail) {
  const queryClient = useQueryClient();
  const taskId = pendingTaskId.postingDetails(job.id);
  // "running": one is already running and its end event follows; load the job to show its state.
  const onStarted = (started: PostingDetailsStart) => {
    if (started === "running")
      void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) });
    return true;
  };
  const task = useStartTask(taskId, () => startPostingDetails(job.id), onStarted);
  const startedAt = firstStart(startStamp(job.posting_details_started_at), usePendingStart(taskId));
  return { ...task, phase: postingDetailsPhase(job, useTaskPhase(taskId)), startedAt };
}
