import { describe, expect, it } from "vitest";
import {
  clampThreshold,
  countAll,
  countBelow,
  distributionTicks,
  MAX_TICK_LEVEL,
  parseThreshold,
  thresholdBand,
} from "@/domain/threshold";

const counts = Array.from({ length: 101 }, () => 0);
counts[40] = 1;
counts[60] = 2;
counts[84] = 9;

describe("threshold", () => {
  it("bands like the prototype", () => {
    expect([0, 5, 59, 60, 79, 80, 100].map(thresholdBand)).toEqual([
      "all",
      "weak",
      "weak",
      "possible",
      "possible",
      "strong",
      "strong",
    ]);
  });

  it("clamps and rounds input", () => {
    expect([-3, 42.6, 140, Number.NaN].map(clampThreshold)).toEqual([0, 43, 100, 0]);
  });

  it("draws one tick per score with jobs, capped in height", () => {
    expect(distributionTicks(counts)).toEqual([
      { score: 40, level: 1 },
      { score: 60, level: 2 },
      { score: 84, level: MAX_TICK_LEVEL },
    ]);
  });

  it("counts all jobs and those below a threshold", () => {
    expect(countAll(counts)).toBe(12);
    expect(countBelow(counts, 60)).toBe(1);
    expect(countBelow(counts, 61)).toBe(3);
    expect(countBelow(counts, 0)).toBe(0);
  });

  it("parses a typed threshold and rejects empty, fractional and out-of-range text (R17)", () => {
    expect(["0", "72", "100", " 60 "].map(parseThreshold)).toEqual([0, 72, 100, 60]);
    expect(["", "  ", "7.5", "-1", "101", "abc"].map(parseThreshold)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
