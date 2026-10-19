import { describe, expect, it } from "vitest";
import type { CrawlProgress } from "@/api/crawlProgress";
import { crawlStations, mergeProgress, savedJobCount } from "@/domain/crawlStages";

const progressOf = (overrides: Partial<CrawlProgress>): CrawlProgress => ({
  stage: "fetching_pages",
  links_found: 48,
  links_matched: 20,
  links_new: 12,
  pages_fetched: 5,
  pages_failed: 1,
  jobs_analysed: 3,
  jobs_skipped: 1,
  work_done: 10,
  work_total: 24,
  ...overrides,
});

describe("mergeProgress", () => {
  it("takes the next progress when nothing was known", () => {
    const next = progressOf({});
    expect(mergeProgress(undefined, next)).toEqual(next);
  });

  it("keeps the known progress when the next message carries none", () => {
    const previous = progressOf({});
    expect(mergeProgress(previous, undefined)).toEqual(previous);
  });

  it("never steps back when an older worker's message arrives late", () => {
    const newer = progressOf({ stage: "analysing", pages_fetched: 11, work_done: 18 });
    const older = progressOf({ stage: "fetching_pages", pages_fetched: 7, work_done: 12 });
    expect(mergeProgress(newer, older)).toMatchObject({
      stage: "analysing",
      pages_fetched: 11,
      work_done: 18,
    });
  });

  it("keeps each counter at its largest value", () => {
    const fetched = progressOf({ pages_fetched: 9, jobs_analysed: 2 });
    const analysed = progressOf({ pages_fetched: 6, jobs_analysed: 5 });
    expect(mergeProgress(fetched, analysed)).toMatchObject({ pages_fetched: 9, jobs_analysed: 5 });
  });

  it("takes a stage the web does not know from the latest message", () => {
    const merged = mergeProgress(progressOf({}), progressOf({ stage: "rendering" }));
    expect(merged?.stage).toBe("rendering");
  });
});

describe("crawlStations", () => {
  it("marks link collection as the current station before links are counted", () => {
    const stations = crawlStations(progressOf({ stage: "collecting_links", links_found: 0 }));
    expect(stations?.map((station) => [station.key, station.state, station.count])).toEqual([
      ["found", "current", null],
      ["new", "open", null],
      ["fetched", "open", null],
      ["analysed", "open", null],
    ]);
  });

  it("counts every station while pages are fetched", () => {
    const stations = crawlStations(progressOf({}));
    expect(stations?.map((station) => [station.key, station.state, station.count])).toEqual([
      ["found", "done", 48],
      ["new", "done", 12],
      ["fetched", "current", 5],
      ["analysed", "open", 3],
    ]);
  });

  it("marks every station done at completion", () => {
    const stations = crawlStations(progressOf({ stage: "completed" }));
    expect(stations?.every((station) => station.state === "done")).toBe(true);
  });

  it("has no stations for a stage the web does not know", () => {
    expect(crawlStations(progressOf({ stage: "rendering" }))).toBeNull();
  });

  it("has no stations without progress data", () => {
    expect(crawlStations(undefined)).toBeNull();
  });
});

describe("savedJobCount", () => {
  it("counts analysed jobs that were not already known", () => {
    expect(savedJobCount(progressOf({ jobs_analysed: 7, jobs_skipped: 2 }))).toBe(5);
  });
});
