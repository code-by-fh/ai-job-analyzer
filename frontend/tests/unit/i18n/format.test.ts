import { describe, expect, it } from "vitest";
import { formatMessage, placeholdersOf } from "@/i18n/format";
import { formatTime } from "@/i18n/formatTime";

describe("formatMessage", () => {
  it("replaces every occurrence of a placeholder", () => {
    expect(formatMessage("{n} von {n}", { n: 3 })).toBe("3 von 3");
  });

  it("leaves unknown placeholders visible instead of printing undefined", () => {
    expect(formatMessage("{source}, {time}", { source: "StepStone" })).toBe("StepStone, {time}");
  });

  it("does not treat inherited object properties as variables", () => {
    expect(formatMessage("{toString}", { count: 1 })).toBe("{toString}");
  });

  it("returns the template unchanged without variables", () => {
    expect(formatMessage("Eingang")).toBe("Eingang");
  });
});

describe("placeholdersOf", () => {
  it("lists placeholder names sorted", () => {
    expect(placeholdersOf("{total} {done} {done}")).toEqual(["done", "done", "total"]);
  });
});

describe("formatTime", () => {
  const AFTERNOON = Date.UTC(2026, 9, 8, 14, 5);

  it("formats a 24-hour time in German", () => {
    expect(formatTime(AFTERNOON, "de", "UTC")).toBe("14:05");
  });

  it("formats a 12-hour time in English", () => {
    expect(formatTime(AFTERNOON, "en", "UTC")).toMatch(/^2:05\sPM$/);
  });
});
