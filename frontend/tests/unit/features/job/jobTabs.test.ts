import { describe, expect, it } from "vitest";
import {
  defaultTab,
  defaultTabFor,
  dimReason,
  tabAfterStatusChange,
  tabFromParam,
  tabParam,
  visibleTabs,
} from "@/features/job/tabs/jobTabs";

const BASE_TABS = ["fit", "documents", "company", "interview", "history"];

describe("job tabs", () => {
  it("round-trips the German URL words", () => {
    expect(tabParam("documents")).toBe("unterlagen");
    expect(tabFromParam("unterlagen")).toBe("documents");
    expect(tabFromParam("firma")).toBe("company");
    expect(tabParam("firstDay")).toBe("erster-tag");
    expect(tabFromParam("wie-weiter")).toBe("moveOn");
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

  it.each([
    ["APPLIED", "company"],
    ["OFFER", "history"],
    ["ACCEPTED", "firstDay"],
    ["REJECTED", "moveOn"],
  ] as const)("selects a tab after a change to %s: %s", (status, tab) => {
    expect(tabAfterStatusChange(status)).toBe(tab);
  });

  it.each(["DRAFTED", "INTERVIEW"])("keeps the tab after a change to %s", (status) => {
    expect(tabAfterStatusChange(status)).toBeNull();
  });

  it.each([
    ["ACCEPTED", [...BASE_TABS, "firstDay"]],
    ["REJECTED", [...BASE_TABS, "moveOn"]],
    ["OFFER", BASE_TABS],
    ["OPEN", BASE_TABS],
  ] as const)("shows the outcome tab only for its status: %s", (status, tabs) => {
    expect(visibleTabs(status)).toEqual(tabs);
  });

  it("opens a closed job on its outcome tab and every other job on its phase tab", () => {
    expect(defaultTabFor("ACCEPTED", "CLOSED")).toBe("firstDay");
    expect(defaultTabFor("REJECTED", "CLOSED")).toBe("moveOn");
    expect(defaultTabFor("INTERVIEW", "INTERVIEW")).toBe("interview");
  });
});
