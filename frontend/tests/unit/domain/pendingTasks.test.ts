import { describe, expect, it } from "vitest";
import {
  EMPTY_PENDING,
  failTasks,
  finishTask,
  pendingTaskId,
  STALL_AFTER_MS,
  startTask,
  taskPhase,
} from "@/domain/pendingTasks";

const T0 = 1_000_000;
const PREP = pendingTaskId.prep("job-1");

describe("pending tasks", () => {
  it("is idle until started", () => {
    expect(taskPhase(EMPTY_PENDING, PREP, T0)).toBe("idle");
  });

  it("runs after a start", () => {
    expect(taskPhase(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + 1)).toBe("running");
  });

  it("stalls after three minutes without an answer", () => {
    expect(taskPhase(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + STALL_AFTER_MS)).toBe(
      "stalled",
    );
  });

  it("is idle again once finished", () => {
    const tasks = finishTask(startTask(EMPTY_PENDING, PREP, T0), PREP);
    expect(taskPhase(tasks, PREP, T0 + 1)).toBe("idle");
  });

  it("marks every render of a job failed, and nothing else", () => {
    const cv = pendingTaskId.render("job-1", "cv");
    const tasks = startTask(startTask(EMPTY_PENDING, cv, T0), PREP, T0);
    const failed = failTasks(tasks, pendingTaskId.renderPrefix("job-1"));
    expect(taskPhase(failed, cv, T0 + 1)).toBe("failed");
    expect(taskPhase(failed, PREP, T0 + 1)).toBe("running");
  });

  it("keeps the earliest start when started twice", () => {
    const twice = startTask(startTask(EMPTY_PENDING, PREP, T0), PREP, T0 + 5);
    expect(twice[PREP].startedAt).toBe(T0);
  });
});
