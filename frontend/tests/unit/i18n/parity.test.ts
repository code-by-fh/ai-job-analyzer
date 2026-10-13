import { describe, expect, it } from "vitest";
import { de, type MessageKey } from "@/i18n/de";
import { en } from "@/i18n/en";
import { placeholdersOf } from "@/i18n/format";

const KEYS = Object.keys(de) as MessageKey[];
const EMOJI = /\p{Extended_Pictographic}/u;

describe("DE/EN dictionaries", () => {
  it("have identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual([...KEYS].sort());
  });

  it.each(KEYS)("%s uses the same placeholders in both languages", (key) => {
    expect(placeholdersOf(en[key])).toEqual(placeholdersOf(de[key]));
  });

  it("contain no empty strings", () => {
    expect(
      [...Object.values(de), ...Object.values(en)].filter((text) => text.trim() === ""),
    ).toEqual([]);
  });

  it("contain no emoji", () => {
    expect([...Object.values(de), ...Object.values(en)].filter((text) => EMOJI.test(text))).toEqual(
      [],
    );
  });
});
