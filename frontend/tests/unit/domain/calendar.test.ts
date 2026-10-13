import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDaysBetween,
  fromDateInputValue,
  isApiDate,
  parseApiDate,
  toDateInputValue,
} from "@/domain/calendar";

const BERLIN = "Europe/Berlin";

describe("parseApiDate", () => {
  it("reads an offset", () => {
    expect(parseApiDate("2026-10-08T09:00:00+02:00").toISOString()).toBe(
      "2026-10-08T07:00:00.000Z",
    );
  });

  it("reads Z", () => {
    expect(parseApiDate("2026-10-08T09:00:00Z").toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("treats a missing offset as UTC", () => {
    expect(parseApiDate("2026-10-08T09:00:00").toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("reads a space-separated zone-less timestamp as UTC", () => {
    expect(parseApiDate("2026-10-08 09:00:00").toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("reads a date-only value", () => {
    expect(parseApiDate("2026-10-08").toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("keeps fractional seconds without an offset", () => {
    expect(parseApiDate("2026-10-08T09:00:00.123456").toISOString()).toBe(
      "2026-10-08T09:00:00.123Z",
    );
  });
});

describe("calendarDaysBetween", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const lateEvening = new Date("2026-10-08T21:30:00Z"); // 23:30 in Berlin
    const afterMidnight = new Date("2026-10-08T22:30:00Z"); // 00:30 next day in Berlin
    expect(calendarDaysBetween(lateEvening, afterMidnight, BERLIN)).toBe(1);
  });

  it("is zero on the same calendar day", () => {
    expect(
      calendarDaysBetween(
        new Date("2026-10-08T05:00:00Z"),
        new Date("2026-10-08T20:00:00Z"),
        BERLIN,
      ),
    ).toBe(0);
  });

  it("is negative when the target lies in the past", () => {
    expect(
      calendarDaysBetween(
        new Date("2026-10-08T10:00:00Z"),
        new Date("2026-10-05T10:00:00Z"),
        BERLIN,
      ),
    ).toBe(-3);
  });

  it("counts 23:30 to 00:30 over the autumn switch as two days, though 25 hours pass", () => {
    // 2026-10-24 23:30 CEST -> 2026-10-26 00:30 CET: 26 h, but two calendar days.
    expect(
      calendarDaysBetween(
        new Date("2026-10-24T21:30:00Z"),
        new Date("2026-10-25T23:30:00Z"),
        BERLIN,
      ),
    ).toBe(2);
  });

  it("counts 23:30 to 00:30 over the spring switch as two days, though only 24 hours pass", () => {
    // 2026-03-28 23:30 CET -> 2026-03-30 00:30 CEST: exactly 24 h, but two calendar days.
    expect(
      calendarDaysBetween(
        new Date("2026-03-28T22:30:00Z"),
        new Date("2026-03-29T22:30:00Z"),
        BERLIN,
      ),
    ).toBe(2);
  });

  it("is not thrown off by the daylight-saving switch", () => {
    // 2026-10-25 is the end of summer time in Berlin.
    expect(
      calendarDaysBetween(
        new Date("2026-10-24T10:00:00Z"),
        new Date("2026-10-26T10:00:00Z"),
        BERLIN,
      ),
    ).toBe(2);
  });
});

describe("addDays", () => {
  it("adds whole days", () => {
    expect(addDays(new Date("2026-10-08T09:00:00Z"), 10).toISOString()).toBe(
      "2026-10-18T09:00:00.000Z",
    );
  });

  it("adds 24-hour blocks, so the local hour shifts over a DST switch but the day is right", () => {
    // 09:00 CEST on 2026-10-20 plus 10 days is 08:00 CET on 2026-10-30.
    const later = addDays(new Date("2026-10-20T07:00:00Z"), 10);
    expect(toDateInputValue(later, BERLIN)).toBe("2026-10-30");
    expect(later.toISOString()).toBe("2026-10-30T07:00:00.000Z");
  });
});

describe("date inputs", () => {
  it("formats a date for <input type=date> in the zone", () => {
    expect(toDateInputValue(new Date("2026-10-08T22:30:00Z"), BERLIN)).toBe("2026-10-09");
  });

  it("parses an input value to 09:00 local time of that day", () => {
    const parsed = fromDateInputValue("2026-10-20");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9);
    expect(parsed?.getDate()).toBe(20);
    expect(parsed?.getHours()).toBe(9);
  });

  it("rejects an empty or malformed value", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue("2026-13-40")).toBeNull();
  });

  it.each(["2026-02-30", "2026-00-10", "2026-2-3", "20.10.2026", " 2026-10-20"])(
    "rejects the impossible or foreign value %j",
    (value) => {
      expect(fromDateInputValue(value)).toBeNull();
    },
  );
});

describe("invalid API dates", () => {
  it.each(["", "not a date", "2026-13-01T10:00:00", "2026-10-08T25:00:00Z"])(
    "reads %j as an Invalid Date instead of throwing",
    (value) => {
      expect(Number.isNaN(parseApiDate(value).getTime())).toBe(true);
    },
  );
});

describe("isApiDate", () => {
  it("accepts an API timestamp", () => {
    expect(isApiDate("2026-10-06T07:00:00+00:00")).toBe(true);
  });

  it("rejects what is not a date", () => {
    expect(isApiDate("not a date")).toBe(false);
  });
});
