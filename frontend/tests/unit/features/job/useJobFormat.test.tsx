import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJobFormat } from "@/features/job/format/useJobFormat";
import { languageStore } from "@/i18n/useI18n";

// 12:00 in Europe/Berlin (the suite's pinned zone, see vitest.config.ts).
const NOW = new Date("2026-10-08T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

function format() {
  return renderHook(() => useJobFormat()).result.current;
}

describe("useJobFormat", () => {
  it("formats an ISO date in German", () => {
    expect(format().date("2026-10-08T09:00:00+00:00")).toBe("08.10.2026");
  });

  it("formats date and time in the pinned zone", () => {
    expect(format().dateTime("2026-10-08T09:00:00Z")).toBe("08.10.2026, 11:00");
  });

  it("formats in English when the language is English", () => {
    act(() => languageStore.set("en"));
    const result = format();
    expect(result.date("2026-10-08T09:00:00Z")).toBe("Oct 8, 2026");
    // ICU versions differ in the space before AM (plain or narrow no-break); compare plain.
    const dateTime = result.dateTime("2026-10-08T09:00:00Z").replace(/\s/g, " ");
    expect(dateTime).toBe("Oct 8, 2026, 11:00 AM");
  });

  it("words past, present and future days relative to the clock", () => {
    const result = format();
    expect(result.relativeDays("2026-10-05T09:00:00Z")).toBe("seit 3 Tagen");
    expect(result.relativeDays("2026-10-07T09:00:00Z")).toBe("seit 1 Tag");
    expect(result.relativeDays("2026-10-08T01:00:00Z")).toBe("heute");
    expect(result.relativeDays("2026-10-09T09:00:00Z")).toBe("in 1 Tag");
    expect(result.relativeDays("2026-10-10T09:00:00Z")).toBe("in 2 Tagen");
  });
});
