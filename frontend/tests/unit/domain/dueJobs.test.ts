import { describe, expect, it } from "vitest";
import { countDue, dueEntries, MAX_DUE_ENTRIES } from "@/domain/dueJobs";
import { isWarning } from "@/domain/nextStep";
import { buildListItem } from "../support/listItemFactory";

const NOW = new Date("2026-10-08T10:00:00Z");
const OVERDUE = "2026-10-01T08:00:00Z";

const ids = (items: Parameters<typeof dueEntries>[0]) =>
  dueEntries(items, NOW).map((entry) => entry.item.id);

describe("dueEntries", () => {
  it("keeps applications whose next step is due, earliest first", () => {
    const items = [
      buildListItem({ id: "later", status: "APPLIED", next_follow_up_at: "2026-10-09T08:00:00Z" }),
      buildListItem({ id: "overdue", status: "APPLIED", next_follow_up_at: OVERDUE }),
      buildListItem({ id: "far", status: "APPLIED", next_follow_up_at: "2026-10-30T08:00:00Z" }),
      buildListItem({ id: "none", status: "APPLIED" }),
    ];
    expect(ids(items)).toEqual(["overdue", "later"]);
  });

  it("shows at most three", () => {
    const items = ["a", "b", "c", "d"].map((id) =>
      buildListItem({ id, status: "APPLIED", next_follow_up_at: OVERDUE }),
    );
    expect(ids(items)).toHaveLength(MAX_DUE_ENTRIES);
  });

  it("uses the interview date and knows a prepared interview from the list flag", () => {
    const item = buildListItem({
      status: "INTERVIEW",
      interview_at: "2026-10-09T08:00:00Z",
      interview_prep_present: true,
    });
    expect(dueEntries([item], NOW)[0]?.step.kind).toBe("interviewReady");
  });

  it("keeps an application due while its documents are regenerated", () => {
    const item = buildListItem({
      status: "GENERATING",
      pre_generation_status: "APPLIED",
      next_follow_up_at: OVERDUE,
    });
    expect(dueEntries([item], NOW)[0]?.step.kind).toBe("followUp");
  });

  it("includes a past interview that needs its result, without a warning", () => {
    const item = buildListItem({ status: "INTERVIEW", interview_at: OVERDUE });
    const [entry] = dueEntries([item], NOW);
    expect(entry?.step.kind).toBe("recordOutcome");
    expect(entry && isWarning(entry.step)).toBe(false);
  });

  it("sorts mixed kinds by their date, earliest first", () => {
    const items = [
      buildListItem({ id: "offer", status: "OFFER", next_follow_up_at: "2026-10-09T08:00:00Z" }),
      buildListItem({ id: "interview", status: "INTERVIEW", interview_at: "2026-10-08T15:00:00Z" }),
      buildListItem({ id: "applied", status: "APPLIED", next_follow_up_at: OVERDUE }),
    ];
    expect(ids(items)).toEqual(["applied", "interview", "offer"]);
  });

  it("leaves out open and archived rows even with a date", () => {
    const items = [
      buildListItem({ id: "open", status: "OPEN", next_follow_up_at: OVERDUE }),
      buildListItem({
        id: "gone",
        status: "APPLIED",
        is_archived: true,
        next_follow_up_at: OVERDUE,
      }),
    ];
    expect(ids(items)).toEqual([]);
  });
});

describe("countDue", () => {
  it("counts every due step without the card's limit, a neutral interview included", () => {
    const items = [
      ...["a", "b", "c", "d"].map((id) =>
        buildListItem({ id, status: "APPLIED", next_follow_up_at: OVERDUE }),
      ),
      buildListItem({ id: "iv", status: "INTERVIEW", interview_at: "2026-10-09T08:00:00Z" }),
      buildListItem({ id: "wait", status: "APPLIED", next_follow_up_at: "2026-10-30T08:00:00Z" }),
      buildListItem({ id: "drafted", status: "DRAFTED" }),
    ];
    expect(countDue(items, NOW)).toBe(5);
  });
});
