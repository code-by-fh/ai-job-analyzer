import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskPhase } from "@/domain/pendingTasks";
import { TaskState } from "@/features/job/TaskState";

const RUNNING_TEXT = "Wird bewertet …";

function show(phase: TaskPhase, busy = false) {
  const onRetry = vi.fn();
  // TaskState needs no provider; plain render keeps rerender on the same tree.
  const view = render(
    <TaskState phase={phase} runningText={RUNNING_TEXT} onRetry={onRetry} busy={busy} />,
  );
  const rerender = (next: TaskPhase) =>
    view.rerender(
      <TaskState phase={next} runningText={RUNNING_TEXT} onRetry={onRetry} busy={busy} />,
    );
  return { onRetry, rerender, container: view.container };
}

const region = (container: HTMLElement) => container.querySelector('[role="status"]');

describe("TaskState", () => {
  it("keeps one status region from idle over running to stalled, so changes are announced", () => {
    const { rerender, container } = show("idle");
    const live = region(container);
    expect(live).not.toBeNull();
    expect(live).toBeEmptyDOMElement();
    rerender("running");
    expect(region(container)).toBe(live);
    expect(live).toHaveTextContent(RUNNING_TEXT);
    rerender("stalled");
    expect(region(container)).toBe(live);
    expect(live).toHaveTextContent(/dauert ungewöhnlich lange/);
  });

  it("shows a failed task as an error, not as a warning", () => {
    show("failed");
    const notice = screen.getByText(/Das hat nicht geklappt/).closest(".notice");
    expect(notice).toHaveClass("notice-error");
    expect(notice).not.toHaveClass("notice-warn");
  });

  it("announces a failure through its status region only, without a nested alert", () => {
    const { container } = show("failed");
    const live = region(container);
    expect(live).toHaveTextContent(/Das hat nicht geklappt/);
    expect(live?.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("keeps a stalled task as a warning", () => {
    show("stalled");
    expect(screen.getByText(/dauert ungewöhnlich lange/).closest(".notice")).toHaveClass(
      "notice-warn",
    );
  });

  it("blocks the retry while the restart runs", async () => {
    const { onRetry } = show("stalled", true);
    const retry = screen.getByRole("button", { name: "Erneut versuchen" });
    expect(retry).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
