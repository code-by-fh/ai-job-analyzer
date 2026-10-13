import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatRelativeDays } from "@/i18n/formatDate";
import { translatorFor } from "@/i18n/translate";

const BERLIN = "Europe/Berlin";
const UTC = "UTC";
const de = translatorFor("de");
const en = translatorFor("en");

describe("formatDate", () => {
  it("formats a UTC instant as a German date", () => {
    expect(formatDate("2026-10-07T09:30:00Z", "de", BERLIN)).toBe("07.10.2026");
  });

  it("formats a UTC instant as an English date", () => {
    expect(formatDate("2026-10-07T09:30:00Z", "en", BERLIN)).toBe("Oct 7, 2026");
  });

  it("applies the offset and the target time zone (late UTC evening is the next day in Berlin)", () => {
    expect(formatDate("2026-10-07T23:30:00+00:00", "de", BERLIN)).toBe("08.10.2026");
  });

  it("treats a legacy timestamp without offset as UTC", () => {
    expect(formatDate("2026-10-07T23:30:00", "de", BERLIN)).toBe("08.10.2026");
  });

  it("accepts the space separator and microseconds of legacy Python timestamps", () => {
    expect(formatDate("2026-10-07 23:30:00.123456", "de", UTC)).toBe("07.10.2026");
  });

  it("throws a RangeError for a value that is not a date", () => {
    expect(() => formatDate("not a date", "de", UTC)).toThrow(RangeError);
  });
});

describe("formatDateTime", () => {
  it("formats date and 24-hour time in German", () => {
    expect(formatDateTime("2026-10-07T12:05:00Z", "de", UTC)).toBe("07.10.2026, 12:05");
  });

  it("formats date and 12-hour time in English", () => {
    expect(formatDateTime("2026-10-07T12:05:00Z", "en", UTC)).toMatch(/^Oct 7, 2026, 12:05\sPM$/);
  });
});

describe("formatRelativeDays", () => {
  const clock = { now: Date.UTC(2026, 9, 8, 9, 0), timeZone: UTC };

  it.each([
    ["2026-10-05T10:00:00Z", "seit 3 Tagen", "3 days ago"],
    ["2026-10-07T20:00:00Z", "seit 1 Tag", "1 day ago"],
    ["2026-10-08T00:30:00Z", "heute", "today"],
    ["2026-10-09T23:00:00Z", "in 1 Tag", "in 1 day"],
    ["2026-10-10T08:00:00Z", "in 2 Tagen", "in 2 days"],
  ])("describes %s as %s / %s", (iso, german, english) => {
    expect(formatRelativeDays(iso, de, clock)).toBe(german);
    expect(formatRelativeDays(iso, en, clock)).toBe(english);
  });

  it("counts calendar days in the given time zone, not 24-hour spans", () => {
    const lateEvening = { now: Date.UTC(2026, 9, 7, 23, 30) };
    const earlierThatEvening = "2026-10-07T21:00:00Z";
    expect(formatRelativeDays(earlierThatEvening, de, { ...lateEvening, timeZone: UTC })).toBe(
      "heute",
    );
    expect(formatRelativeDays(earlierThatEvening, de, { ...lateEvening, timeZone: BERLIN })).toBe(
      "seit 1 Tag",
    );
  });
});
