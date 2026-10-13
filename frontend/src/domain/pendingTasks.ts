import type { DocumentKind } from "@/api/jobDocuments";

export interface PendingTask {
  startedAt: number;
  failed: boolean;
}

/** Background work the server keeps no state for; finished by realtime events (applyEvent). */
export type PendingTasks = Readonly<Record<string, PendingTask>>;

export const EMPTY_PENDING: PendingTasks = {};

/** Interview prep and research publish no failure event (backend gap G6); after this, offer a retry. */
export const STALL_AFTER_MS = 180_000;

export const pendingTaskId = {
  analysis: (jobId: string) => `analysis:${jobId}`,
  prep: (jobId: string) => `prep:${jobId}`,
  research: (domain: string) => `research:${domain}`,
  render: (jobId: string, kind: DocumentKind) => `render:${jobId}:${kind}`,
  renderPrefix: (jobId: string) => `render:${jobId}:`,
  generation: (jobId: string) => `generation:${jobId}`,
};

export type TaskPhase = "idle" | "running" | "stalled" | "failed";

export function startTask(tasks: PendingTasks, id: string, now: number): PendingTasks {
  const startedAt = tasks[id] && !tasks[id].failed ? tasks[id].startedAt : now;
  return { ...tasks, [id]: { startedAt, failed: false } };
}

export function finishTask(tasks: PendingTasks, id: string): PendingTasks {
  if (!(id in tasks)) return tasks;
  const rest = { ...tasks };
  delete rest[id];
  return rest;
}

export function failTasks(tasks: PendingTasks, prefix: string): PendingTasks {
  const next: Record<string, PendingTask> = {};
  for (const [id, task] of Object.entries(tasks)) {
    next[id] = id.startsWith(prefix) ? { ...task, failed: true } : task;
  }
  return next;
}

export function taskPhase(tasks: PendingTasks, id: string, now: number): TaskPhase {
  const task = tasks[id];
  if (!task) return "idle";
  if (task.failed) return "failed";
  return now - task.startedAt >= STALL_AFTER_MS ? "stalled" : "running";
}
