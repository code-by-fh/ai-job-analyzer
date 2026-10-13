import { describe, expect, it } from "vitest";
import { roundScore, scoreBand } from "@/domain/scoreBand";

describe("scoreBand", () => {
  it.each([
    [100, "strong"],
    [80, "strong"],
    [79, "possible"],
    [60, "possible"],
    [59, "weak"],
    [0, "weak"],
  ] as const)("%i is %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe("roundScore", () => {
  it("rounds the float match score for display", () => {
    expect(roundScore(79.5)).toBe(80);
  });

  it("clamps values outside 0..100", () => {
    expect(roundScore(-3)).toBe(0);
    expect(roundScore(104)).toBe(100);
  });
});
