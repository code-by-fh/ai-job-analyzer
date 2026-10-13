import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const DELAY = 300;

afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("follows the value after the delay and only with the last value", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, DELAY), {
      initialProps: { value: 60 },
    });
    rerender({ value: 65 });
    rerender({ value: 70 });
    expect(result.current).toBe(60);
    act(() => vi.advanceTimersByTime(DELAY));
    expect(result.current).toBe(70);
  });
});
