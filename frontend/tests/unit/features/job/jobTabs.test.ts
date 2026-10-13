import { describe, expect, it } from "vitest";
import { defaultTab, dimReason, tabFromParam, tabParam } from "@/features/job/tabs/jobTabs";

describe("job tabs", () => {
  it("round-trips the German URL words", () => {
    expect(tabParam("documents")).toBe("unterlagen");
    expect(tabFromParam("unterlagen")).toBe("documents");
    expect(tabFromParam("firma")).toBe("company");
  });

  it("ignores unknown tab words", () => {
    expect(tabFromParam("hacked")).toBeNull();
    expect(tabFromParam(null)).toBeNull();
  });

  it.each([
    ["OPEN", "fit"],
    ["DRAFTED", "documents"],
    ["APPLIED", "history"],
    ["INTERVIEW", "interview"],
    ["OFFER", "history"],
    ["CLOSED", "history"],
  ] as const)("opens %s on %s", (phase, tab) => {
    expect(defaultTab(phase)).toBe(tab);
  });

  it("dims Unterlagen before Vorgemerkt and Interview before the interview phase", () => {
    expect(dimReason("documents", "OPEN")).toBe("documents");
    expect(dimReason("documents", "DRAFTED")).toBeNull();
    expect(dimReason("interview", "APPLIED")).toBe("interview");
    expect(dimReason("interview", "INTERVIEW")).toBeNull();
    expect(dimReason("interview", "CLOSED")).toBeNull();
  });
});
