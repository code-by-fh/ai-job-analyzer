import { describe, expect, it } from "vitest";
import { allowedTargets, canTransition, effectiveStatus, phaseOf } from "@/domain/jobStatus";

// Literal copy of server/core/job_status.py::ALLOWED_TRANSITIONS (phase 0). If the server table
// changes, this test must change with it.
describe("allowedTargets mirrors the server table", () => {
  it.each([
    ["OPEN", ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["DRAFTED", ["OPEN", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["APPLIED", ["OPEN", "DRAFTED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["INTERVIEW", ["OPEN", "DRAFTED", "APPLIED", "OFFER", "ACCEPTED", "REJECTED"]],
    ["OFFER", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "ACCEPTED", "REJECTED"]],
    ["ACCEPTED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"]],
    ["REJECTED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED"]],
    ["FAILED", ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"]],
    ["GENERATING", []],
    ["SEEN", []],
    [
      "SOMETHING_LEGACY",
      ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED"],
    ],
  ])("from %s", (from, targets) => {
    expect([...allowedTargets(from)].sort()).toEqual([...targets].sort());
  });
});

describe("canTransition", () => {
  it("never allows a system status as target", () => {
    expect(canTransition("DRAFTED", "GENERATING")).toBe(false);
    expect(canTransition("DRAFTED", "FAILED")).toBe(false);
    expect(canTransition("OPEN", "SEEN")).toBe(false);
  });

  it("does not allow staying in the same status", () => {
    expect(canTransition("APPLIED", "APPLIED")).toBe(false);
  });

  it("does not treat inherited object keys as statuses", () => {
    expect(canTransition("toString", "DRAFTED")).toBe(true);
    expect(canTransition("DRAFTED", "constructor")).toBe(false);
  });
});

describe("phaseOf", () => {
  it.each([
    ["OPEN", "OPEN"],
    ["SEEN", "OPEN"],
    ["DRAFTED", "DRAFTED"],
    ["FAILED", "DRAFTED"],
    ["APPLIED", "APPLIED"],
    ["INTERVIEW", "INTERVIEW"],
    ["OFFER", "OFFER"],
    ["ACCEPTED", "CLOSED"],
    ["REJECTED", "CLOSED"],
    ["SOMETHING_LEGACY", "OPEN"],
  ])("puts %s into %s", (status, phase) => {
    expect(phaseOf({ status })).toBe(phase);
  });

  it("shows a generation without a remembered status as Vorgemerkt", () => {
    expect(phaseOf({ status: "GENERATING" })).toBe("DRAFTED");
    expect(phaseOf({ status: "GENERATING", pre_generation_status: "OPEN" })).toBe("DRAFTED");
  });

  it("keeps an advanced phase while generating", () => {
    expect(phaseOf({ status: "GENERATING", pre_generation_status: "APPLIED" })).toBe("APPLIED");
    expect(effectiveStatus({ status: "GENERATING", pre_generation_status: "OFFER" })).toBe("OFFER");
  });
});
