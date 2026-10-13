import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOCK_TICK_MS, useNow } from "@/lib/clock";

const START = Date.UTC(2026, 9, 8, 10, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("returns the current time on mount", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(START);
  });

  it("moves forward every tick", () => {
    const { result } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(CLOCK_TICK_MS));
    expect(result.current).toBe(START + CLOCK_TICK_MS);
  });
});
