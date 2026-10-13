import { describe, expect, it } from "vitest";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  progressPercent,
  reduceActivity,
  sourceLabel,
  type ActivityTask,
} from "@/realtime/activity";
import type { ActivityEvent } from "@/realtime/events";

const NOW = Date.UTC(2026, 9, 8, 12, 0);
const USER = { user_id: 7 };
const STEPSTONE = "https://www.stepstone.de/jobs/kotlin";
const started: ActivityEvent = {
  type: "crawl_job_started",
  ...USER,
  job_id: "c1",
  platform: STEPSTONE,
};
const task = (overrides: Partial<ActivityTask>): ActivityTask => ({
  id: "c1",
  source: "www.stepstone.de",
  step: "starting",
  done: 0,
  total: 0,
  platformId: null,
  ...overrides,
});

describe("reduceActivity", () => {
  it("adds a task on start with the platform host as its source", () => {
    expect(reduceActivity(EMPTY_ACTIVITY, started, NOW).running).toEqual([task({})]);
  });

  it("tracks link collection progress", () => {
    const progress: ActivityEvent = {
      type: "crawl_job_progress",
      ...USER,
      job_id: "c1",
      platform: STEPSTONE,
      total: 12,
      scraping_completed: 5,
    };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), progress, NOW);
    expect(state.running).toEqual([task({ step: "collecting", done: 5, total: 12 })]);
  });

  it("keeps the source when later events carry no platform", () => {
    const extracting: ActivityEvent = {
      type: "crawl_job_extracting",
      ...USER,
      job_id: "c1",
      extracting_count: 3,
      total: 9,
    };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), extracting, NOW);
    expect(state.running).toEqual([task({ step: "extracting", done: 3, total: 9 })]);
  });

  it("creates a task for progress that arrives before its start event", () => {
    const analysing: ActivityEvent = {
      type: "job_analysis_started",
      ...USER,
      job_id: "c2",
      analysis_completed: 1,
    };
    expect(reduceActivity(EMPTY_ACTIVITY, analysing, NOW).running).toEqual([
      task({ id: "c2", source: "", step: "analysing", done: 1 }),
    ]);
  });

  it("keeps the order of running tasks on progress", () => {
    const second: ActivityEvent = {
      type: "crawl_job_started",
      ...USER,
      job_id: "c2",
      platform: "https://de.indeed.com",
    };
    const progress: ActivityEvent = {
      type: "crawl_job_progress",
      ...USER,
      job_id: "c1",
      platform: STEPSTONE,
      total: 4,
    };
    const state = [started, second, progress].reduce(
      (current, event) => reduceActivity(current, event, NOW),
      EMPTY_ACTIVITY,
    );
    expect(state.running.map((entry) => entry.id)).toEqual(["c1", "c2"]);
  });

  it("moves a completed crawl to lastFinished", () => {
    const completed: ActivityEvent = { type: "crawl_job_completed", ...USER, job_id: "c1" };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), completed, NOW);
    expect(state).toEqual({
      running: [],
      lastFinished: {
        id: "c1",
        source: "www.stepstone.de",
        outcome: "completed",
        finishedAt: NOW,
        platformId: null,
      },
      endedIds: ["c1"],
    });
  });

  it("records failed crawls with their outcome", () => {
    const failed: ActivityEvent = { type: "crawl_job_failed", ...USER, job_id: "c1" };
    expect(reduceActivity(EMPTY_ACTIVITY, failed, NOW).lastFinished?.outcome).toBe("failed");
  });
});

describe("reduceActivity after a crawl ended", () => {
  const completed: ActivityEvent = { type: "crawl_job_completed", ...USER, job_id: "c1" };
  const lateStarted: ActivityEvent = {
    type: "job_analysis_started",
    ...USER,
    job_id: "c1",
    analysis_completed: 2,
  };
  const lateFinished: ActivityEvent = {
    type: "job_analysis_finished",
    ...USER,
    job_id: "c1",
    jobs_saved: 2,
  };

  it.each([lateStarted, lateFinished])("does not re-create a task for a late $type", (late) => {
    const ended = [started, completed].reduce(
      (current, event) => reduceActivity(current, event, NOW),
      EMPTY_ACTIVITY,
    );
    expect(reduceActivity(ended, late, NOW).running).toEqual([]);
  });

  it("updates the analysis progress on job_analysis_finished", () => {
    const finished: ActivityEvent = {
      type: "job_analysis_finished",
      ...USER,
      job_id: "c1",
      jobs_saved: 4,
    };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), finished, NOW);
    expect(state.running).toEqual([task({ step: "analysing", done: 4 })]);
  });
});

describe("activityFromCrawlJobs", () => {
  it("seeds running crawls and skips finished ones", () => {
    const state = activityFromCrawlJobs(
      [
        { job_id: "c1", platform: STEPSTONE, status: "crawling", total: 12, scraping_completed: 5 },
        { job_id: "c2", platform: STEPSTONE, status: "completed", total: 3, scraping_completed: 3 },
      ],
      EMPTY_ACTIVITY,
      NOW,
    );
    expect(state).toEqual({
      running: [task({ step: "collecting", done: 5, total: 12 })],
      lastFinished: null,
      endedIds: ["c2"],
    });
  });

  it("keeps the last finished task of the previous state on a re-seed", () => {
    const lastFinished = {
      id: "c0",
      source: "www.stepstone.de",
      outcome: "completed" as const,
      finishedAt: NOW,
      platformId: null,
    };
    const previous = { ...EMPTY_ACTIVITY, lastFinished };
    expect(activityFromCrawlJobs([], previous, NOW).lastFinished).toEqual(lastFinished);
  });
});

describe("progressPercent", () => {
  it.each([
    [0, 0, 5],
    [0, 12, 5],
    [5, 12, 42],
    [13, 12, 100],
  ])("%i of %i shows %i %%", (done, total, percent) => {
    expect(progressPercent(task({ done, total }))).toBe(percent);
  });
});

describe("sourceLabel", () => {
  it("returns a value that is not a URL unchanged", () => {
    expect(sourceLabel("stepstone.de")).toBe("stepstone.de");
  });
});
