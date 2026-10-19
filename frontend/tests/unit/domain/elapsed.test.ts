import { describe, expect, it } from "vitest";
import {
  elapsedMinutes,
  elapsedSince,
  firstStart,
  formatElapsed,
  startStamp,
} from "@/domain/elapsed";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 9, 16, 8, 0);

describe("formatElapsed", () => {
  it("shows minutes and seconds with two digits each", () => {
    expect(formatElapsed(MINUTE + 24 * SECOND)).toBe("01:24");
  });

  it("starts at 00:00", () => {
    expect(formatElapsed(0)).toBe("00:00");
  });

  it("drops the part of a second that has not passed yet", () => {
    expect(formatElapsed(59 * MINUTE + 59 * SECOND + 999)).toBe("59:59");
  });

  it("adds the hours from one hour on", () => {
    expect(formatElapsed(HOUR + 2 * MINUTE + 3 * SECOND)).toBe("1:02:03");
  });

  it("keeps counting hours past ten", () => {
    expect(formatElapsed(12 * HOUR)).toBe("12:00:00");
  });
});

describe("elapsedSince", () => {
  it("counts the time since the start", () => {
    expect(elapsedSince(START, START + 90 * SECOND)).toBe(90 * SECOND);
  });

  it("clamps a start ahead of the browser clock to 0", () => {
    expect(elapsedSince(START + 5 * SECOND, START)).toBe(0);
  });
});

describe("elapsedMinutes", () => {
  it("counts whole minutes only", () => {
    expect(elapsedMinutes(2 * MINUTE - 1)).toBe(1);
  });
});

describe("startStamp", () => {
  it("reads an ISO stamp with offset", () => {
    expect(startStamp("2026-10-16T08:00:00+00:00")).toBe(START);
  });

  it("reads a stamp without zone as UTC", () => {
    expect(startStamp("2026-10-16T08:00:00")).toBe(START);
  });

  it("returns null for a missing stamp", () => {
    expect(startStamp(null)).toBeNull();
  });

  it("returns null for an unreadable stamp", () => {
    expect(startStamp("soon")).toBeNull();
  });
});

describe("firstStart", () => {
  it("prefers the first known start", () => {
    expect(firstStart(START, START + MINUTE)).toBe(START);
  });

  it("falls back to a later candidate when the first is unknown", () => {
    expect(firstStart(null, undefined, START)).toBe(START);
  });

  it("returns null when no start is known", () => {
    expect(firstStart(null, undefined)).toBeNull();
  });
});
