import { describe, expect, it } from "vitest";
import { phaseTrack } from "@/domain/phaseTrack";

const states = (steps: ReturnType<typeof phaseTrack>) => steps.map((step) => step.state);

describe("phaseTrack", () => {
  it("marks visited, current and future phases", () => {
    const history = [
      { to_status: "APPLIED", changed_at: "2026-10-05T10:00:00Z" },
      { to_status: "DRAFTED", changed_at: "2026-10-03T10:00:00Z" },
    ];
    expect(states(phaseTrack("APPLIED", history))).toEqual([
      "past",
      "past",
      "current",
      "future",
      "future",
      "future",
    ]);
  });

  it("marks a phase that was jumped over as skipped", () => {
    const history = [{ to_status: "APPLIED", changed_at: "2026-10-05T10:00:00Z" }];
    expect(states(phaseTrack("APPLIED", history))[1]).toBe("skipped");
  });

  it("never marks the first phase as skipped (jobs start there without a history row)", () => {
    expect(states(phaseTrack("DRAFTED", []))[0]).toBe("past");
  });

  it("shows the final phase as closed", () => {
    const history = [{ to_status: "REJECTED", changed_at: "2026-10-07T10:00:00Z" }];
    expect(states(phaseTrack("CLOSED", history))[5]).toBe("closed");
  });

  it("dates each phase with its latest arrival", () => {
    const history = [
      { to_status: "DRAFTED", changed_at: "2026-10-01T10:00:00Z" },
      { to_status: "DRAFTED", changed_at: "2026-10-04T10:00:00+02:00" },
    ];
    expect(phaseTrack("DRAFTED", history)[1].reachedAt).toBe("2026-10-04T10:00:00+02:00");
  });

  it("counts a failed generation as Vorgemerkt", () => {
    const history = [{ to_status: "FAILED", changed_at: null }];
    expect(states(phaseTrack("APPLIED", history))[1]).toBe("past");
  });

  it("marks phases after the last reached one of a closed job as not reached, not skipped", () => {
    const history = [
      { to_status: "DRAFTED", changed_at: "2026-10-01T10:00:00Z" },
      { to_status: "APPLIED", changed_at: "2026-10-02T10:00:00Z" },
      { to_status: "REJECTED", changed_at: "2026-10-03T10:00:00Z" },
    ];
    expect(states(phaseTrack("CLOSED", history))).toEqual([
      "past",
      "past",
      "past",
      "unreached",
      "unreached",
      "closed",
    ]);
  });

  it("still marks a jumped-over phase of a closed job as skipped", () => {
    const history = [
      { to_status: "DRAFTED", changed_at: "2026-10-01T10:00:00Z" },
      { to_status: "INTERVIEW", changed_at: "2026-10-02T10:00:00Z" },
      { to_status: "REJECTED", changed_at: "2026-10-03T10:00:00Z" },
    ];
    expect(states(phaseTrack("CLOSED", history))).toEqual([
      "past",
      "past",
      "skipped",
      "past",
      "unreached",
      "closed",
    ]);
  });

  it("orders arrivals by instant, not by text, across UTC offsets", () => {
    const history = [
      { to_status: "DRAFTED", changed_at: "2026-10-04T09:00:00Z" },
      { to_status: "DRAFTED", changed_at: "2026-10-04T10:00:00+02:00" },
    ];
    expect(phaseTrack("DRAFTED", history)[1].reachedAt).toBe("2026-10-04T09:00:00Z");
  });

  it("ignores history rows without a time when dating a phase", () => {
    const history = [{ to_status: "DRAFTED", changed_at: null }];
    expect(phaseTrack("DRAFTED", history)[1].reachedAt).toBeNull();
  });

  it("treats a legacy free-text status in the history as the first phase", () => {
    const history = [{ to_status: "SOMETHING_LEGACY", changed_at: "2026-10-01T10:00:00Z" }];
    expect(states(phaseTrack("DRAFTED", history))).toEqual([
      "past",
      "current",
      "future",
      "future",
      "future",
      "future",
    ]);
  });
});
