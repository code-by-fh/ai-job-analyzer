"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import {
  EMPTY_PENDING,
  finishTask,
  startTask,
  taskPhase,
  type PendingTasks,
  type TaskPhase,
} from "@/domain/pendingTasks";
import { useNow } from "@/lib/clock";

function readPending(queryClient: QueryClient): PendingTasks {
  return queryClient.getQueryData<PendingTasks>(queryKeys.pendingTasks) ?? EMPTY_PENDING;
}

/** Client-only state in the query cache, so applyEvent can finish tasks in one place (spec 6). */
export function usePendingTasks(): PendingTasks {
  const queryClient = useQueryClient();
  // The "fetch" re-reads the cache: a refetch after a reconnect must not wipe running tasks.
  const query = useQuery({
    queryKey: queryKeys.pendingTasks,
    queryFn: () => readPending(queryClient),
    initialData: EMPTY_PENDING,
    staleTime: Infinity,
    // Running prep/research has no server state; it must survive leaving the job page.
    gcTime: Infinity,
  });
  return query.data;
}

export function useTaskPhase(id: string): TaskPhase {
  const tasks = usePendingTasks();
  return taskPhase(tasks, id, useNow());
}

/** When this tab started the pending task; null when none is pending or it failed. */
export function usePendingStart(id: string): number | null {
  const task = usePendingTasks()[id];
  return task && !task.failed ? task.startedAt : null;
}

export function markTaskStarted(queryClient: QueryClient, id: string, now: number): void {
  queryClient.setQueryData(queryKeys.pendingTasks, startTask(readPending(queryClient), id, now));
}

export function markTaskFinished(queryClient: QueryClient, id: string): void {
  queryClient.setQueryData(queryKeys.pendingTasks, finishTask(readPending(queryClient), id));
}
