import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOCK_TICK_MS, SECOND_TICK_MS, useNow, useSecondNow } from "@/lib/clock";

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

  it("reads the current time again after a pause with no subscribers", () => {
    renderHook(() => useNow()).unmount();
    vi.setSystemTime(START + 5 * CLOCK_TICK_MS);
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(START + 5 * CLOCK_TICK_MS);
  });

  it("moves forward every tick", () => {
    const { result } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(CLOCK_TICK_MS));
    expect(result.current).toBe(START + CLOCK_TICK_MS);
  });
});

describe("useSecondNow", () => {
  it("moves forward every second", () => {
    const { result } = renderHook(() => useSecondNow());
    act(() => vi.advanceTimersByTime(SECOND_TICK_MS));
    expect(result.current).toBe(START + SECOND_TICK_MS);
  });

  it("shares one interval between all subscribers", () => {
    renderHook(() => [useSecondNow(), useSecondNow(), useSecondNow()]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops its interval when the last subscriber leaves", () => {
    const { unmount } = renderHook(() => useSecondNow());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
