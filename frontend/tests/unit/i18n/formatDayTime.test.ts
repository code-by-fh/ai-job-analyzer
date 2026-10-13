import { describe, expect, it } from "vitest";
import { formatDayTime } from "@/i18n/formatDayTime";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
// 10:00 in Berlin on Thursday 2026-10-08.
const clock = {
  now: Date.parse("2026-10-08T08:00:00Z"),
  language: "de" as const,
  timeZone: "Europe/Berlin",
};

describe("formatDayTime", () => {
  it.each([
    ["2026-10-08T12:00:00Z", "heute 14:00"],
    ["2026-10-09T05:00:00Z", "morgen 07:00"],
    ["2026-10-07T16:10:00Z", "gestern 18:10"],
    ["2026-10-12T05:00:00Z", "Montag 07:00"],
    ["2026-10-14T05:00:00Z", "Mittwoch 07:00"],
    ["2026-10-15T05:00:00Z", "15.10.2026, 07:00"],
    ["2026-10-06T05:00:00Z", "06.10.2026, 07:00"],
    ["2026-10-20T05:00:00Z", "20.10.2026, 07:00"],
    ["2026-10-08T23:30:00Z", "morgen 01:30"],
  ])("%s reads %s", (iso, expected) => {
    expect(formatDayTime(new Date(iso), t, clock)).toBe(expected);
  });
});

describe("formatDayTime in English", () => {
  it("reads the English day word and clock", () => {
    const text = formatDayTime(new Date("2026-10-08T12:00:00Z"), translatorFor("en"), {
      ...clock,
      language: "en",
    });
    expect(text).toMatch(/^today 2:00\sPM$/);
  });
});

describe("formatDayTime across the DST switch", () => {
  // Berlin leaves summer time at 03:00 on 2026-10-25, so that day lasts 25 hours.
  const night = { ...clock, now: Date.parse("2026-10-24T22:30:00Z") };

  it.each([
    ["2026-10-25T22:30:00Z", "heute 23:30"],
    ["2026-10-25T23:30:00Z", "morgen 00:30"],
  ])("%s reads %s", (iso, expected) => {
    expect(formatDayTime(new Date(iso), t, night)).toBe(expected);
  });
});
