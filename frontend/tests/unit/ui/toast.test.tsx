import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_TOAST_DURATION_MS, TOAST_DURATION_MS, type ToastInput } from "@/ui/toast";
import { ToastProvider, useToast } from "@/ui/ToastProvider";

function Trigger({ input }: { input: ToastInput }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(input)}>
      zeigen
    </button>
  );
}

function renderTrigger(input: ToastInput) {
  render(
    <ToastProvider>
      <Trigger input={input} />
    </ToastProvider>,
  );
  return () => fireEvent.click(screen.getByRole("button", { name: "zeigen" }));
}

const toastOf = (text: string) => screen.getByText(text).closest(".toast") as HTMLElement;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toasts", () => {
  it("dismiss themselves after the default duration", () => {
    renderTrigger({ message: "Gespeichert" })();
    advance(TOAST_DURATION_MS - 1);
    expect(screen.getByText("Gespeichert")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
  });

  it("keep an action toast for at least 10 s", () => {
    const action = { label: "Rückgängig", onAction: vi.fn() };
    renderTrigger({ message: "Aussortiert", action })();
    advance(ACTION_TOAST_DURATION_MS - 1);
    expect(screen.getByText("Aussortiert")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
  });

  it("pause while hovered and resume with the remaining time", () => {
    renderTrigger({ message: "Gespeichert" })();
    advance(2_000);
    fireEvent.mouseEnter(toastOf("Gespeichert"));
    advance(TOAST_DURATION_MS * 2);
    expect(screen.getByText("Gespeichert")).toBeInTheDocument();
    fireEvent.mouseLeave(toastOf("Gespeichert"));
    advance(TOAST_DURATION_MS - 2_000);
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
  });

  it("show at most two at a time, dropping the oldest", () => {
    const show = renderTrigger({ message: "Meldung" });
    show();
    show();
    show();
    expect(screen.getAllByText("Meldung")).toHaveLength(2);
  });

  it("run the action and close when the action is clicked", () => {
    const action = { label: "Rückgängig", onAction: vi.fn() };
    renderTrigger({ message: "Aussortiert", action })();
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(action.onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
  });

  it("announce errors as alerts with a close button", () => {
    renderTrigger({ message: "Fehlgeschlagen", tone: "error" })();
    expect(screen.getByRole("alert")).toHaveTextContent("Fehlgeschlagen");
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(screen.queryByText("Fehlgeschlagen")).not.toBeInTheDocument();
  });
});

describe("toast timing and announcements", () => {
  it("pause while focus is inside", () => {
    const action = { label: "Rückgängig", onAction: vi.fn() };
    renderTrigger({ message: "Aussortiert", action })();
    fireEvent.focus(screen.getByRole("button", { name: "Rückgängig" }));
    advance(ACTION_TOAST_DURATION_MS * 2);
    expect(screen.getByText("Aussortiert")).toBeInTheDocument();
    fireEvent.blur(screen.getByRole("button", { name: "Rückgängig" }));
    advance(ACTION_TOAST_DURATION_MS);
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
  });

  it("leave no timer running after unmount", () => {
    const show = renderTrigger({ message: "Gespeichert" });
    show();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("announce through persistent live regions, with no role on the items", () => {
    renderTrigger({ message: "Gespeichert" })();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toContainElement(toastOf("Gespeichert"));
    expect(toastOf("Gespeichert")).not.toHaveAttribute("role");
  });

  it("keep the live regions mounted while no toast is shown", () => {
    renderTrigger({ message: "Gespeichert" });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("announce an error exactly once, in the alert region only", () => {
    renderTrigger({ message: "Fehlgeschlagen", tone: "error" })();
    expect(screen.getByRole("alert")).toContainElement(toastOf("Fehlgeschlagen"));
    expect(screen.getByRole("status")).not.toHaveTextContent("Fehlgeschlagen");
    expect(toastOf("Fehlgeschlagen")).not.toHaveAttribute("role");
  });
});

/** A row the user worked in before tabbing into the toast; the toast's action may remove it. */
function RowWithToast({ removeRowOnAction }: { removeRowOnAction: boolean }) {
  const toast = useToast();
  const [rowShown, setRowShown] = useState(true);
  const onAction = () => removeRowOnAction && setRowShown(false);
  const show = () =>
    toast.show({ message: "Aussortiert", action: { label: "Rückgängig", onAction } });
  return (
    <main tabIndex={-1}>
      {rowShown ? <button type="button">Zeile</button> : null}
      <button type="button" onClick={show}>
        zeigen
      </button>
    </main>
  );
}

function focusRowThenToast(removeRowOnAction: boolean) {
  render(
    <ToastProvider>
      <RowWithToast removeRowOnAction={removeRowOnAction} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "zeigen" }));
  const row = screen.getByRole("button", { name: "Zeile" });
  row.focus();
  screen.getByRole("button", { name: "Rückgängig" }).focus();
  return row;
}

describe("toast focus return (spec 4.3 #5)", () => {
  it("hands focus back to where it came from after the action", () => {
    const row = focusRowThenToast(false);
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(screen.queryByText("Aussortiert")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("hands focus back to where it came from after the close button", () => {
    const row = focusRowThenToast(false);
    const close = screen.getByRole("button", { name: "Meldung schließen" });
    close.focus();
    fireEvent.click(close);
    expect(row).toHaveFocus();
  });

  it("lands on main, never on body, when the origin is gone", () => {
    focusRowThenToast(true);
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(screen.queryByRole("button", { name: "Zeile" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });
});
