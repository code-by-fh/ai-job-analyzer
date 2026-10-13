import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/domain/markdown";

describe("parseMarkdown", () => {
  it("reads headings, lists and paragraphs", () => {
    expect(parseMarkdown("# Titel\n\nErster Satz\nzweiter Satz.\n\n- a\n- b\n1. c")).toEqual([
      { type: "heading", text: "Titel" },
      { type: "paragraph", text: "Erster Satz zweiter Satz." },
      { type: "list", items: ["a", "b", "c"] },
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(parseMarkdown("  \n \n")).toEqual([]);
  });

  it("keeps raw HTML as plain text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([
      { type: "paragraph", text: "<img src=x onerror=alert(1)>" },
    ]);
  });
});

describe("parseInline", () => {
  it("marks bold text", () => {
    expect(parseInline("vor **fett** nach")).toEqual([
      { type: "text", text: "vor " },
      { type: "strong", text: "fett" },
      { type: "text", text: " nach" },
    ]);
  });

  it("keeps http links", () => {
    expect(parseInline("[Karriere](https://acme.de/jobs)")).toEqual([
      { type: "link", text: "Karriere", href: "https://acme.de/jobs" },
    ]);
  });

  it("shows any other link target as plain text", () => {
    expect(parseInline("[klick](javascript:alert(1))")).toEqual([
      { type: "text", text: "[klick](javascript:alert(1))" },
    ]);
  });
});

const HOSTILE_LENGTH = 50_000;
const TIME_LIMIT_MS = 250;

function timeOf(action: () => void): number {
  const start = performance.now();
  action();
  return performance.now() - start;
}

describe("hostile input", () => {
  it.each([
    ["open brackets", "[".repeat(HOSTILE_LENGTH)],
    ["open link texts", "[a".repeat(HOSTILE_LENGTH)],
    ["open bold marks", "**a".repeat(HOSTILE_LENGTH)],
    ["long link target", `[a](${"(".repeat(HOSTILE_LENGTH)}`],
  ])("parses %s in linear time", (_name, input) => {
    expect(timeOf(() => parseInline(input))).toBeLessThan(TIME_LIMIT_MS);
  });
});

describe("link allow-list", () => {
  it.each([
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "//evil.example",
    "\u0001https://a.de",
    "ht\ntps://a.de",
  ])("shows %j as plain text", (target) => {
    const segments = parseInline(`[x](${target})`);
    expect(segments.every((segment) => segment.type === "text")).toBe(true);
  });

  it("accepts an upper-case scheme", () => {
    expect(parseInline("[x](HTTPS://a.de)")).toEqual([
      { type: "link", text: "x", href: "HTTPS://a.de" },
    ]);
  });

  it("keeps balanced parentheses in the target", () => {
    expect(parseInline("[W](https://de.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      { type: "link", text: "W", href: "https://de.wikipedia.org/wiki/Foo_(bar)" },
    ]);
  });
});

describe("lists", () => {
  it("keeps one list across blank lines between bullets", () => {
    expect(parseMarkdown("- a\n\n- b\n\n- c")).toEqual([{ type: "list", items: ["a", "b", "c"] }]);
  });
});
