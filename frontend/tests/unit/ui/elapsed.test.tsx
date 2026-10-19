import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECOND_TICK_MS } from "@/lib/clock";
import { Elapsed } from "@/ui/Elapsed";

const NOW = Date.UTC(2026, 9, 16, 8, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const ticking = (container: HTMLElement) => container.querySelector(".elapsed-ticking");
const calm = (container: HTMLElement) => container.querySelector(".elapsed-calm");

describe("Elapsed", () => {
  it("shows the running time as mm:ss after 'seit'", () => {
    const { container } = render(<Elapsed startedAt={NOW - (MINUTE + 24 * SECOND)} />);
    expect(ticking(container)).toHaveTextContent("seit 01:24");
  });

  it("hides both visible faces from screen readers", () => {
    const { container } = render(<Elapsed startedAt={NOW - MINUTE} />);
    expect(ticking(container)).toHaveAttribute("aria-hidden", "true");
    expect(calm(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("gives screen readers the time in whole minutes", () => {
    render(<Elapsed startedAt={NOW - (MINUTE + 24 * SECOND)} />);
    expect(screen.getByText("läuft seit 1 Minute")).toHaveClass("sr-only");
  });

  it("names a run under a minute without a number", () => {
    render(<Elapsed startedAt={NOW - 10 * SECOND} />);
    expect(screen.getByText("läuft seit weniger als einer Minute")).toBeInTheDocument();
  });

  it("names longer runs in minutes", () => {
    render(<Elapsed startedAt={NOW - 5 * MINUTE} />);
    expect(screen.getByText("läuft seit 5 Minuten")).toBeInTheDocument();
  });

  it("ticks once per second", () => {
    const { container } = render(<Elapsed startedAt={NOW - 59 * SECOND} />);
    act(() => vi.advanceTimersByTime(SECOND_TICK_MS));
    expect(ticking(container)).toHaveTextContent("seit 01:00");
  });

  it("switches to h:mm:ss after an hour", () => {
    const { container } = render(<Elapsed startedAt={NOW - (61 * MINUTE + 5 * SECOND)} />);
    expect(ticking(container)).toHaveTextContent("seit 1:01:05");
  });

  it("shows 00:00, never a negative time, for a start ahead of the browser clock", () => {
    const { container } = render(<Elapsed startedAt={NOW + 30 * SECOND} />);
    expect(ticking(container)).toHaveTextContent("seit 00:00");
  });

  it("keeps a calm whole-minute face for reduced motion", () => {
    const { container } = render(<Elapsed startedAt={NOW - (3 * MINUTE + 10 * SECOND)} />);
    expect(calm(container)).toHaveTextContent("seit 3 Min.");
  });

  it("calls a fresh run 'gerade gestartet' on the calm face", () => {
    const { container } = render(<Elapsed startedAt={NOW - 5 * SECOND} />);
    expect(calm(container)).toHaveTextContent("gerade gestartet");
  });

  it("renders nothing without a start", () => {
    const { container } = render(<Elapsed startedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is not a live region itself", () => {
    const { container } = render(<Elapsed startedAt={NOW - MINUTE} />);
    expect(container.querySelector("[role], [aria-live]")).toBeNull();
  });

  it("drives every instance from one shared interval", () => {
    render(
      <>
        <Elapsed startedAt={NOW - MINUTE} />
        <Elapsed startedAt={NOW - 2 * MINUTE} />
        <Elapsed startedAt={NOW - 3 * MINUTE} />
      </>,
    );
    expect(vi.getTimerCount()).toBe(1);
  });
});
