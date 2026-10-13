import { describe, expect, it } from "vitest";
import type { JobListItem } from "@/api/jobList";
import {
  applicationsHref,
  buildRow,
  closedOpenFromParam,
  docState,
  emptyKind,
  groupByPhase,
  MAX_SEARCH_LENGTH,
  phaseFilterFromParam,
  rowWhen,
  searchFromParam,
  sortClosed,
  STRIP_TICK_MAX,
  stripCounts,
  tickCount,
  visiblePhases,
} from "@/domain/applications";
import { nextStep } from "@/domain/nextStep";
import { buildListItem } from "../support/listItemFactory";

const NOW = new Date("2026-10-08T10:00:00+02:00");
const READY = { cv_html_present: true, cover_letter_html_present: true };
const when = (item: JobListItem) => rowWhen(item, nextStep(item, NOW), NOW);
const ids = (rows: readonly { item: JobListItem }[]) => rows.map((row) => row.item.id);

describe("applications URL", () => {
  it("reads the German phase values and ignores unknown ones", () => {
    expect(phaseFilterFromParam("beworben")).toBe("APPLIED");
    expect(phaseFilterFromParam("abgeschlossen")).toBe("CLOSED");
    expect(phaseFilterFromParam("APPLIED")).toBeNull();
    expect(phaseFilterFromParam(null)).toBeNull();
    expect(phaseFilterFromParam("")).toBeNull();
  });

  it("trims the search, treats spaces as no search and caps it by code points", () => {
    expect(searchFromParam("  Kotlin  ")).toBe("Kotlin");
    expect(searchFromParam("   ")).toBe("");
    expect(searchFromParam(null)).toBe("");
    const long = "🦀".repeat(MAX_SEARCH_LENGTH + 5);
    expect(Array.from(searchFromParam(long))).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("opens the closed section only for the exact value", () => {
    expect(closedOpenFromParam("1")).toBe(true);
    expect(closedOpenFromParam("yes")).toBe(false);
  });

  it("writes only what differs from the defaults", () => {
    expect(applicationsHref({})).toBe("/applications");
    expect(applicationsHref({ q: "  ", phase: null, closedOpen: false })).toBe("/applications");
    expect(applicationsHref({ q: "Kotlin Dev", phase: "INTERVIEW", closedOpen: true })).toBe(
      "/applications?q=Kotlin+Dev&phase=interview&abgeschlossen=1",
    );
  });
});

describe("docState", () => {
  it("names both, one or none of the documents", () => {
    expect(docState(buildListItem({ status: "DRAFTED", ...READY }))).toBe("both");
    expect(docState(buildListItem({ status: "DRAFTED", cv_html_present: true }))).toBe("cvOnly");
    expect(docState(buildListItem({ status: "DRAFTED", application_draft_present: true }))).toBe(
      "letterOnly",
    );
    expect(docState(buildListItem({ status: "DRAFTED" }))).toBe("none");
  });

  it("says the documents are being made while generating", () => {
    expect(docState(buildListItem({ status: "GENERATING", ...READY }))).toBe("running");
    expect(docState(buildListItem({ status: "GENERATING" }))).toBe("running");
  });
});

describe("rowWhen", () => {
  it("shows the interview date, neutral even when it is tomorrow", () => {
    const item = buildListItem({ status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" });
    expect(when(item)).toEqual({
      kind: "interviewSoon",
      iso: "2026-10-09T08:00:00.000Z",
      warn: false,
    });
  });

  it("keeps the absolute date for an interview outside the due window", () => {
    const item = buildListItem({ status: "INTERVIEW", interview_at: "2026-10-13T08:00:00Z" });
    expect(when(item)).toEqual({ kind: "interview", iso: "2026-10-13T08:00:00.000Z", warn: false });
  });

  it("shows a past interview without a result by its date, neutral (SC7)", () => {
    const item = buildListItem({ status: "INTERVIEW", interview_at: "2026-10-06T08:00:00Z" });
    expect(when(item)).toEqual({ kind: "interview", iso: "2026-10-06T08:00:00.000Z", warn: false });
  });

  it("shows an overdue follow-up as a warning", () => {
    const item = buildListItem({
      status: "APPLIED",
      ...READY,
      next_follow_up_at: "2026-10-06T07:00:00Z",
    });
    expect(when(item)).toMatchObject({ kind: "overdue", warn: true });
  });

  it("shows a follow-up due tomorrow as a warning", () => {
    const item = buildListItem({
      status: "APPLIED",
      ...READY,
      next_follow_up_at: "2026-10-09T07:00:00Z",
    });
    expect(when(item)).toMatchObject({ kind: "dueSoon", warn: true });
  });

  it("shows the answer deadline of an offer", () => {
    const item = buildListItem({ status: "OFFER", next_follow_up_at: "2026-10-20T07:00:00Z" });
    expect(when(item)).toMatchObject({ kind: "answerBy", warn: false });
  });

  it("falls back to the last status change, then to the found date", () => {
    const changed = buildListItem({ status: "APPLIED", status_changed_at: "2026-10-05T08:00:00Z" });
    const found = buildListItem({ status: "DRAFTED", created_at: "2026-10-03T08:00:00Z" });
    expect(when(changed)).toEqual({ kind: "since", iso: "2026-10-05T08:00:00Z", today: false });
    expect(when(found)).toMatchObject({ kind: "since", iso: "2026-10-03T08:00:00Z" });
  });

  it("knows a change of today and a row without any date", () => {
    const today = buildListItem({ status: "DRAFTED", status_changed_at: "2026-10-08T06:00:00Z" });
    expect(when(today)).toMatchObject({ today: true });
    expect(when(buildListItem({ status: "DRAFTED", created_at: "not a date" }))).toEqual({
      kind: "none",
    });
  });
});

describe("groupByPhase", () => {
  it("groups by the effective phase", () => {
    const groups = groupByPhase(
      [
        buildListItem({ id: "regen", status: "GENERATING", pre_generation_status: "APPLIED" }),
        buildListItem({ id: "first", status: "GENERATING", pre_generation_status: "DRAFTED" }),
        buildListItem({ id: "failed", status: "FAILED" }),
        buildListItem({ id: "offer", status: "OFFER" }),
        buildListItem({ id: "open", status: "OPEN" }),
        buildListItem({ id: "closed", status: "REJECTED" }),
      ],
      NOW,
    );
    expect(ids(groups.APPLIED)).toEqual(["regen"]);
    expect(ids(groups.DRAFTED).sort()).toEqual(["failed", "first"]);
    expect(ids(groups.OFFER)).toEqual(["offer"]);
    expect(ids(groups.INTERVIEW)).toEqual([]);
  });

  it("puts due rows first, earliest due on top, then the longest waiting", () => {
    const groups = groupByPhase(
      [
        buildListItem({
          id: "recent",
          status: "APPLIED",
          status_changed_at: "2026-10-07T08:00:00Z",
        }),
        buildListItem({
          id: "dueLater",
          status: "APPLIED",
          next_follow_up_at: "2026-10-09T07:00:00Z",
        }),
        buildListItem({ id: "old", status: "APPLIED", status_changed_at: "2026-09-20T08:00:00Z" }),
        buildListItem({
          id: "overdue",
          status: "APPLIED",
          next_follow_up_at: "2026-10-01T07:00:00Z",
        }),
      ],
      NOW,
    );
    expect(ids(groups.APPLIED)).toEqual(["overdue", "dueLater", "old", "recent"]);
  });

  it("keeps undated rows in id order", () => {
    const undated = { status: "DRAFTED", created_at: "not a date", status_changed_at: null };
    const groups = groupByPhase(
      [
        buildListItem({ id: "c", ...undated }),
        buildListItem({ id: "a", ...undated }),
        buildListItem({ id: "b", ...undated }),
      ],
      NOW,
    );
    expect(ids(groups.DRAFTED)).toEqual(["a", "b", "c"]);
  });

  it("puts an undated row after the dated ones", () => {
    const groups = groupByPhase(
      [
        buildListItem({ id: "a", status: "DRAFTED", created_at: "not a date" }),
        buildListItem({ id: "b", status: "DRAFTED", created_at: "2026-10-03T08:00:00Z" }),
      ],
      NOW,
    );
    expect(ids(groups.DRAFTED)).toEqual(["b", "a"]);
  });

  it("groups no rows into empty phases", () => {
    expect(groupByPhase([], NOW)).toEqual({ DRAFTED: [], APPLIED: [], INTERVIEW: [], OFFER: [] });
  });

  it("builds each row once with its step, date and documents", () => {
    const row = buildRow(buildListItem({ status: "DRAFTED", ...READY }), NOW);
    expect([row.step.kind, row.docs]).toEqual(["apply", "both"]);
  });

  it("reads the checklist like the job page (G18)", () => {
    const checklist = { posting_opened: true, documents_checked: true, sent: true };
    const row = buildRow(buildListItem({ status: "DRAFTED", ...READY, checklist }), NOW);
    expect(row.step.kind).toBe("markApplied");
  });
});

describe("sortClosed", () => {
  it("shows the most recently closed first", () => {
    const rows = sortClosed([
      buildListItem({ id: "sept", status: "ACCEPTED", status_changed_at: "2026-09-20T08:00:00Z" }),
      buildListItem({ id: "oct", status: "REJECTED", status_changed_at: "2026-10-01T08:00:00Z" }),
    ]);
    expect(rows.map((item) => item.id)).toEqual(["oct", "sept"]);
  });

  it("sorts no rows into an empty list", () => {
    expect(sortClosed([])).toEqual([]);
  });
});

describe("visiblePhases, emptyKind and the strip", () => {
  const groups = groupByPhase([buildListItem({ id: "a", status: "APPLIED" })], NOW);

  it("hides empty phases without a filter and shows the filtered one even when empty", () => {
    expect(visiblePhases(groups, null)).toEqual(["APPLIED"]);
    expect(visiblePhases(groups, "OFFER")).toEqual(["OFFER"]);
    expect(visiblePhases(groups, "CLOSED")).toEqual([]);
  });

  it("tells first run, a search without results and an empty phase apart", () => {
    expect(emptyKind({ q: "", phase: null, shown: 0, total: 0 })).toBe("noApplications");
    expect(emptyKind({ q: "Rust", phase: null, shown: 0, total: 0 })).toBe("noMatch");
    expect(emptyKind({ q: "", phase: "OFFER", shown: 0, total: 3 })).toBe("phaseEmpty");
    expect(emptyKind({ q: "", phase: null, shown: 0, total: 2 })).toBeNull();
  });

  it("lets a search win over an empty phase (R10)", () => {
    expect(emptyKind({ q: "Rust", phase: "OFFER", shown: 0, total: 3 })).toBe("noMatch");
    expect(emptyKind({ q: "Rust", phase: "OFFER", shown: 1, total: 3 })).toBeNull();
  });

  it("calls a hand-written phase on a first run the first run (RB14)", () => {
    expect(emptyKind({ q: "", phase: "OFFER", shown: 0, total: 0 })).toBe("noApplications");
    expect(emptyKind({ q: "Rust", phase: "OFFER", shown: 0, total: 0 })).toBe("noMatch");
  });

  it("counts every phase and caps the ticks", () => {
    expect(stripCounts(groups, 4)).toEqual({
      DRAFTED: 0,
      APPLIED: 1,
      INTERVIEW: 0,
      OFFER: 0,
      CLOSED: 4,
    });
    expect(tickCount(3)).toEqual({ ticks: 3, more: 0 });
    expect(tickCount(STRIP_TICK_MAX + 2)).toEqual({ ticks: STRIP_TICK_MAX, more: 2 });
  });
});
