"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { describeError } from "@/api/describeError";
import type { TaskPhase } from "@/domain/pendingTasks";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Elapsed } from "@/ui/Elapsed";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { useToast } from "@/ui/ToastProvider";

export interface TaskStateProps {
  phase: TaskPhase;
  runningText: string;
  onRetry: () => void;
  /** The restart request runs: the retry is blocked so it cannot start a second task. */
  busy?: boolean;
  /** Epoch ms of the run's start; while running, the elapsed time shows next to the text. */
  startedAt?: number | null;
  /** The text of a failed run when the cause is known; the generic "task.failed" otherwise. */
  failureKey?: MessageKey | null;
}

/**
 * Progress text for server tasks without cancel (spec 9: no client-only cancel; spec 4.3 #6).
 * The status region stays mounted in every phase, so the switch from running to stalled or failed
 * is announced instead of replacing the live node.
 */
export function TaskState(props: TaskStateProps) {
  // The elapsed time sits beside the live region, never in it, so its ticks are not announced.
  return (
    <div className="task-run">
      <div className="task-state" role="status">
        <TaskContent {...props} />
      </div>
      {props.phase === "running" ? <Elapsed startedAt={props.startedAt ?? null} /> : null}
    </div>
  );
}

function TaskContent(props: TaskStateProps) {
  if (props.phase === "idle") return null;
  if (props.phase === "running") {
    return (
      <p className="task-line">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{props.runningText}</span>
      </p>
    );
  }
  return <TaskProblem {...props} />;
}

function TaskProblem({ phase, onRetry, busy, failureKey }: TaskStateProps) {
  const { t } = useI18n();
  // A stall may still finish (amber); a reported failure is an error (crimson, spec 5).
  const failed = phase === "failed";
  return (
    // The wrapper is the live region; a nested alert would announce the failure twice.
    <Notice tone={failed ? "error" : "warn"} announce={false}>
      {t(failed ? (failureKey ?? "task.failed") : "task.stalled")}{" "}
      <Button size="sm" icon={RotateCcw} busy={busy} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </Notice>
  );
}

/** A task as useStartTask plus its phase returns it. */
export interface StartedTask {
  phase: TaskPhase;
  run: () => void;
  pending: boolean;
  /** Epoch ms of the run's start: the server stamp, else this tab's own start; null when unknown. */
  startedAt: number | null;
}

/** TaskState of a started task: retry restarts it and is blocked while that request runs. */
export function TaskProgress({
  task,
  runningText,
  failureKey,
}: {
  task: StartedTask;
  runningText: string;
  failureKey?: MessageKey | null;
}) {
  return (
    <TaskState
      phase={task.phase}
      runningText={runningText}
      onRetry={task.run}
      busy={task.pending}
      startedAt={task.startedAt}
      failureKey={failureKey}
    />
  );
}

function useTaskMutation<T>(
  taskId: string,
  start: () => Promise<T>,
  onStarted?: (result: T) => boolean,
) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: start,
    onSuccess: (result) => {
      // onStarted may report that nothing was started (e.g. "exists"), then nothing is pending.
      if (onStarted?.(result) ?? true) markTaskStarted(queryClient, taskId, Date.now());
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** Starts a server task and records it as pending; the matching realtime event ends it (Task 7). */
export function useStartTask<T>(
  taskId: string,
  start: () => Promise<T>,
  onStarted?: (result: T) => boolean,
) {
  const mutation = useTaskMutation(taskId, start, onStarted);
  // A double click can land before the busy state renders; the ref blocks the second start.
  const inFlight = useRef(false);
  const settle = () => {
    inFlight.current = false;
  };
  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(undefined, { onSettled: settle });
  };
  return { run, pending: mutation.isPending };
}
