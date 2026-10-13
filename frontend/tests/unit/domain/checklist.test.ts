import { describe, expect, it } from "vitest";
import { checklistComplete, checklistOf, setChecklistItem } from "@/domain/checklist";

describe("setChecklistItem", () => {
  it("keeps the other two keys (the server replaces the whole object)", () => {
    const before = { posting_opened: true, documents_checked: false, sent: false };
    expect(setChecklistItem(before, "sent", true)).toEqual({
      posting_opened: true,
      documents_checked: false,
      sent: true,
    });
  });

  it("starts from all false when the job has no checklist yet", () => {
    expect(setChecklistItem(null, "documents_checked", true)).toEqual({
      posting_opened: false,
      documents_checked: true,
      sent: false,
    });
  });
});

describe("checklistComplete", () => {
  it("is true only when every item is done", () => {
    expect(checklistComplete({ posting_opened: true, documents_checked: true, sent: true })).toBe(
      true,
    );
    expect(checklistComplete({ posting_opened: true, documents_checked: true, sent: false })).toBe(
      false,
    );
    expect(checklistComplete(undefined)).toBe(false);
  });

  it("reads a missing checklist as all open", () => {
    expect(checklistOf(null)).toEqual({
      posting_opened: false,
      documents_checked: false,
      sent: false,
    });
  });
});
