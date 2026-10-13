import { describe, expect, it } from "vitest";
import { backoffDelay } from "@/realtime/backoff";

describe("backoffDelay", () => {
  it.each([
    [0, 1_000],
    [1, 2_000],
    [2, 4_000],
    [4, 16_000],
    [5, 30_000],
    [12, 30_000],
  ])("attempt %i waits %i ms", (attempt, delay) => {
    expect(backoffDelay(attempt)).toBe(delay);
  });
});
