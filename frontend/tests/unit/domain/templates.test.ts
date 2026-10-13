import { describe, expect, it } from "vitest";
import type { DocumentTemplate } from "@/api/templates";
import {
  canBeDefault,
  defaultRef,
  galleryOf,
  templateOutcome,
  templateState,
  TEMPLATE_STALL_MS,
  type TemplateCard,
  type TemplateState,
} from "@/domain/templates";

const NOW = Date.parse("2026-10-09T10:00:00Z");
const template = (overrides: Partial<DocumentTemplate> = {}): DocumentTemplate => ({
  id: 7,
  doc_type: "CV",
  name: "Meine Vorlage",
  is_admin: false,
  user_id: 1,
  status: null,
  created_at: "2026-10-09T09:00:00Z",
  updated_at: "2026-10-09T09:58:00Z",
  ...overrides,
});
const FILES = { cv: ["classic"], cover_letter: ["classic"] };
const cardWith = (state: TemplateState): TemplateCard => ({
  ref: "7",
  name: "Meine Vorlage",
  origin: "own",
  state,
  id: 7,
  createdAt: null,
});

describe("templateState", () => {
  it("maps the server statuses and treats unknown ones as ready", () => {
    expect(templateState(template(), NOW)).toBe("ready");
    expect(templateState(template({ status: "processing" }), NOW)).toBe("processing");
    expect(templateState(template({ status: "annotation_rejected" }), NOW)).toBe("rejected");
    expect(templateState(template({ status: "annotation_failed" }), NOW)).toBe("failed");
    expect(templateState(template({ status: "something_new" }), NOW)).toBe("ready");
  });

  it("calls a fill stalled once it ran longer than the limit", () => {
    const at = (age: number) => new Date(NOW - age).toISOString();
    expect(
      templateState(template({ status: "processing", updated_at: at(TEMPLATE_STALL_MS) }), NOW),
    ).toBe("processing");
    expect(
      templateState(template({ status: "processing", updated_at: at(TEMPLATE_STALL_MS + 1) }), NOW),
    ).toBe("stalled");
    expect(
      templateState(template({ status: "processing", updated_at: null, created_at: null }), NOW),
    ).toBe("processing");
  });

  it("measures from the creation time when the row has no update time", () => {
    const old = new Date(NOW - TEMPLATE_STALL_MS - 1).toISOString();
    const stale = template({ status: "processing", updated_at: null, created_at: old });
    expect(templateState(stale, NOW)).toBe("stalled");
  });
});

describe("galleryOf", () => {
  it("lists bundled, global and own templates of one kind in that order", () => {
    const cards = galleryOf({
      kind: "cv",
      files: FILES,
      templates: [
        template(),
        template({ id: 8, is_admin: true, user_id: null, name: "Firma" }),
        template({ id: 9, doc_type: "COVER_LETTER" }),
      ],
      now: NOW,
    });
    expect(cards.map((card) => [card.ref, card.origin])).toEqual([
      ["classic", "builtin"],
      ["8", "global"],
      ["7", "own"],
    ]);
  });
});

describe("defaultRef", () => {
  const cards = galleryOf({ kind: "cv", files: FILES, templates: [template()], now: NOW });

  it("uses the stored selection when it is in the gallery", () => {
    expect(defaultRef("cv", { cv_template: "7", cover_letter_template: null }, cards)).toBe("7");
  });

  it("falls back to the bundled template for a missing, deleted or foreign selection", () => {
    expect(defaultRef("cv", { cv_template: null, cover_letter_template: null }, cards)).toBe(
      "classic",
    );
    expect(defaultRef("cv", { cv_template: "99", cover_letter_template: null }, cards)).toBe(
      "classic",
    );
  });
});

describe("canBeDefault and templateOutcome", () => {
  it("never offers a template the AI is still filling", () => {
    const [card] = galleryOf({
      kind: "cv",
      files: { cv: [], cover_letter: [] },
      templates: [template({ status: "processing" })],
      now: NOW,
    });
    expect(canBeDefault(card!)).toBe(false);
  });

  it("offers ready and degraded templates but never a stalled one", () => {
    expect(canBeDefault(cardWith("ready"))).toBe(true);
    expect(canBeDefault(cardWith("rejected"))).toBe(true);
    expect(canBeDefault(cardWith("failed"))).toBe(true);
    expect(canBeDefault(cardWith("stalled"))).toBe(false);
  });

  it("reports only the step out of the fill", () => {
    expect(templateOutcome("processing", "ready")).toBe("ready");
    expect(templateOutcome("stalled", "rejected")).toBe("rejected");
    expect(templateOutcome("processing", "failed")).toBe("failed");
    expect(templateOutcome(undefined, "ready")).toBeNull();
    expect(templateOutcome("ready", "ready")).toBeNull();
    expect(templateOutcome("processing", "stalled")).toBeNull();
  });
});
