import { describe, expect, it } from "vitest";
import { documentPresence } from "@/domain/documents";

const NOTHING = { cv_html_present: false, cover_letter_html_present: false };

describe("documentPresence", () => {
  it("counts a list row's letter draft as a letter", () => {
    expect(documentPresence({ ...NOTHING, application_draft_present: true })).toEqual({
      cv: false,
      cover_letter: true,
    });
  });

  it("still counts the detail's draft text", () => {
    expect(documentPresence({ ...NOTHING, application_draft: "Sehr geehrte …" }).cover_letter).toBe(
      true,
    );
  });

  it("reports nothing without flags", () => {
    expect(documentPresence({ ...NOTHING, application_draft_present: false })).toEqual({
      cv: false,
      cover_letter: false,
    });
  });
});
