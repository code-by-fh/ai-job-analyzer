"use client";

import { useQueryClient } from "@tanstack/react-query";
import { startInterviewPrep, type JobDetail, type PrepStart } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { prepPhase } from "@/domain/interviewPrep";
import { firstStart, startStamp } from "@/domain/elapsed";
import { pendingTaskId } from "@/domain/pendingTasks";
import { usePendingStart, useTaskPhase } from "@/realtime/usePendingTasks";
import { useStartTask } from "../TaskState";

/**
 * The one way to start the interview prep (next-step card and Interview tab). The phase comes
 * from the job's server run state and the pending task, so every start control sees a running prep
 * until interview_prep_ready, also after a reload.
 */
export function usePrep(job: JobDetail, regenerate: boolean) {
  const queryClient = useQueryClient();
  const taskId = pendingTaskId.prep(job.id);
  // "exists": nothing was started and no event follows, so load the stored prep now.
  const onStarted = (started: PrepStart) => {
    if (started === "exists")
      void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) });
    return started === "queued";
  };
  const task = useStartTask(taskId, () => startInterviewPrep(job.id, regenerate), onStarted);
  const startedAt = firstStart(startStamp(job.interview_prep_started_at), usePendingStart(taskId));
  return { ...task, phase: prepPhase(job, useTaskPhase(taskId)), startedAt };
}
