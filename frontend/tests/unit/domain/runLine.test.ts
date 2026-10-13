import { describe, expect, it } from "vitest";
import type { Platform, PlatformRun } from "@/api/platforms";
import {
  isFailedRun,
  lastRunOf,
  latestRun,
  runErrorCode,
  summarizeRun,
  type RunErrorCode,
} from "@/domain/runLine";
import { nextRunAt } from "@/domain/schedule";

function platform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: 1,
    name: "StepStone",
    url: "https://www.stepstone.de/jobs/kotlin",
    is_active: true,
    setup_status: "active",
    schedule_time: null,
    schedule_days: null,
    last_crawl_at: null,
    last_run: null,
    ...overrides,
  };
}

describe("latestRun", () => {
  it("picks the most recently finished run and derives the below count", () => {
    const run = latestRun([
      platform({
        name: "XING",
        last_run: { finished_at: "2026-10-07T06:00:00Z", found: 3, new: 2, matched: 2 },
      }),
      platform({
        last_run: { finished_at: "2026-10-08T06:00:00Z", found: 12, new: 5, matched: 3 },
      }),
    ]);
    expect(run).toMatchObject({
      source: "StepStone",
      found: 12,
      matched: 3,
      below: 2,
      error: null,
    });
  });

  it("picks the newer run whichever platform comes first", () => {
    const older = platform({
      name: "XING",
      last_run: { finished_at: "2026-10-07T06:00:00Z", found: 3, new: 2, matched: 2 },
    });
    const newer = platform({
      last_run: { finished_at: "2026-10-08T06:00:00Z", found: 12, new: 5, matched: 3 },
    });
    expect(latestRun([newer, older])?.source).toBe("StepStone");
    expect(latestRun([older, newer])?.source).toBe("StepStone");
  });

  it("keeps the first platform when two runs finished at the same time", () => {
    const finished = "2026-10-08T06:00:00Z";
    const run = latestRun([
      platform({ name: "XING", last_run: { finished_at: finished } }),
      platform({ name: "StepStone", last_run: { finished_at: finished } }),
    ]);
    expect(run?.source).toBe("XING");
  });

  it("never reports a negative below count", () => {
    const run = latestRun([
      platform({ last_run: { finished_at: "2026-10-08T06:00:00Z", new: 1, matched: 3 } }),
    ]);
    expect(run?.below).toBe(0);
  });

  it("ignores runs without an end", () => {
    expect(latestRun([platform({ last_run: { error: null } })])).toBeNull();
  });

  it("maps error codes and shows unknown text neutrally", () => {
    expect(runErrorCode("unreachable")).toBe("unreachable");
    expect(runErrorCode("Seite nicht erreichbar")).toBe("unknown");
    expect(runErrorCode(null)).toBeNull();
  });
});

describe("nextRunAt", () => {
  // Thursday 2026-10-08, 10:00 local time; the server counts Monday as 0, so Thursday is 3.
  const now = new Date(2026, 9, 8, 10, 0);

  it("finds today's later slot", () => {
    const schedule = platform({ schedule_time: "14:00", schedule_days: [3] });
    expect(nextRunAt([schedule], now)).toEqual(new Date(2026, 9, 8, 14, 0));
  });

  it("moves to the next scheduled weekday once today's slot has passed", () => {
    const schedule = platform({ schedule_time: "07:00", schedule_days: [0] });
    expect(nextRunAt([schedule], now)).toEqual(new Date(2026, 9, 12, 7, 0));
  });

  it("takes the earliest active, valid schedule", () => {
    const platforms = [
      platform({ schedule_time: "18:00", schedule_days: [3] }),
      platform({ schedule_time: "12:00", schedule_days: [3], is_active: false }),
      platform({ schedule_time: "11:00", schedule_days: [] }),
      platform({ schedule_time: "9:5", schedule_days: [3] }),
    ];
    expect(nextRunAt(platforms, now)).toEqual(new Date(2026, 9, 8, 18, 0));
  });

  it("wraps from Sunday to Monday", () => {
    const sunday = new Date(2026, 9, 11, 10, 0);
    const schedule = platform({ schedule_time: "07:00", schedule_days: [0] });
    expect(nextRunAt([schedule], sunday)).toEqual(new Date(2026, 9, 12, 7, 0));
  });

  it("is null without any schedule", () => {
    expect(nextRunAt([platform()], now)).toBeNull();
  });

  it("reads the schedule as the sources page does: unknown and repeated weekdays do not count", () => {
    const schedule = platform({ schedule_time: "14:00", schedule_days: [9, 3, 3] });
    expect(nextRunAt([schedule], now)).toEqual(new Date(2026, 9, 8, 14, 0));
    expect(nextRunAt([platform({ schedule_time: "14:00", schedule_days: [9] })], now)).toBeNull();
  });
});

describe("lastRunOf", () => {
  it("a seed run counts nothing below the threshold and says so", () => {
    const seeded = lastRunOf(
      platform({
        last_run: {
          finished_at: "2026-10-08T06:00:00+00:00",
          found: 40,
          new: 40,
          matched: 0,
          seeded: true,
        },
      }),
    );
    expect([seeded?.seeded, seeded?.below]).toEqual([true, 0]);
  });
});

describe("isFailedRun", () => {
  it("counts every error code but the user's own cancel", () => {
    const codes: Array<RunErrorCode | null> = [
      null,
      "cancelled",
      "unreachable",
      "failed",
      "unknown",
    ];
    expect(codes.map(isFailedRun)).toEqual([false, false, true, true, true]);
  });
});

describe("summarizeRun", () => {
  const FINISHED = "2026-10-08T06:00:00+00:00";

  it("reads an empty error text as no error", () => {
    const summary = summarizeRun({ finished_at: FINISHED, error: "" });
    expect(summary?.error).toBeNull();
    expect(isFailedRun(summary?.error ?? null)).toBe(false);
  });

  it("reads a history entry like a last run", () => {
    const entry: PlatformRun = {
      started_at: "2026-10-08T05:55:00+00:00",
      finished_at: FINISHED,
      found: 12,
      new: 5,
      matched: 3,
      seeded: false,
      error: null,
    };
    expect(summarizeRun(entry)).toEqual({
      finishedAt: new Date(FINISHED),
      found: 12,
      matched: 3,
      below: 2,
      error: null,
      seeded: false,
    });
  });

  it("keeps the error of a seed run", () => {
    const summary = summarizeRun({ finished_at: FINISHED, seeded: true, error: "unreachable" });
    expect([summary?.seeded, summary?.error]).toEqual([true, "unreachable"]);
  });
});
