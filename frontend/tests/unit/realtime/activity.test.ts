import { describe, expect, it } from "vitest";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  latestFinished,
  measuredPercent,
  progressPercent,
  reduceActivity,
  sourceLabel,
  taskStart,
  type ActivityTask,
} from "@/realtime/activity";
import type { CrawlProgress } from "@/api/crawlProgress";
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

const progressOf = (overrides: Partial<CrawlProgress>): CrawlProgress => ({
  stage: "fetching_pages",
  links_found: 30,
  links_matched: 6,
  links_new: 4,
  pages_fetched: 0,
  pages_failed: 0,
  jobs_analysed: 0,
  jobs_skipped: 0,
  work_done: 0,
  work_total: 8,
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

  it("keeps the crawl's progress from its latest event", () => {
    const progress = progressOf({ pages_fetched: 2, work_done: 2 });
    const extracting: ActivityEvent = {
      type: "crawl_job_extracting",
      ...USER,
      job_id: "c1",
      extracting_count: 3,
      total: 4,
      progress,
    };
    const finished: ActivityEvent = {
      type: "job_analysis_finished",
      ...USER,
      job_id: "c1",
      jobs_saved: 1,
    };
    const state = [started, extracting, finished].reduce(
      (current, event) => reduceActivity(current, event, NOW),
      EMPTY_ACTIVITY,
    );
    expect(state.running[0]?.progress).toEqual(progress);
  });

  it("keeps the step while the links found are filtered (no new links known yet)", () => {
    const filtering: ActivityEvent = {
      type: "crawl_job_progress",
      ...USER,
      job_id: "c1",
      platform: STEPSTONE,
      total: 0,
      progress: progressOf({ stage: "filtering_links", links_new: 0, work_total: 0 }),
    };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), filtering, NOW);
    expect(state.running[0]?.step).toBe("starting");
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

  it("moves a completed crawl to the finished runs", () => {
    const completed: ActivityEvent = { type: "crawl_job_completed", ...USER, job_id: "c1" };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), completed, NOW);
    expect(state).toEqual({
      running: [],
      finished: [
        {
          id: "c1",
          source: "www.stepstone.de",
          outcome: "completed",
          finishedAt: NOW,
          platformId: null,
        },
      ],
      endedIds: ["c1"],
    });
  });

  it("records failed crawls with their outcome", () => {
    const failed: ActivityEvent = { type: "crawl_job_failed", ...USER, job_id: "c1" };
    expect(latestFinished(reduceActivity(EMPTY_ACTIVITY, failed, NOW))?.outcome).toBe("failed");
  });

  it("keeps the final progress of a completed crawl", () => {
    const progress = progressOf({ stage: "completed", jobs_analysed: 4, work_done: 8 });
    const completed: ActivityEvent = {
      type: "crawl_job_completed",
      ...USER,
      job_id: "c1",
      progress,
    };
    const state = reduceActivity(reduceActivity(EMPTY_ACTIVITY, started, NOW), completed, NOW);
    expect(latestFinished(state)?.progress).toEqual(progress);
  });

  it("keeps the newest three finished runs, newest first", () => {
    const ids = ["c1", "c2", "c3", "c4"];
    const state = ids.reduce(
      (current, job_id) =>
        reduceActivity(current, { type: "crawl_job_completed", ...USER, job_id }, NOW),
      EMPTY_ACTIVITY,
    );
    expect(state.finished.map((entry) => entry.id)).toEqual(["c4", "c3", "c2"]);
  });

  it("does not step the progress back when an older worker's event arrives late", () => {
    const event = (work_done: number): ActivityEvent => ({
      type: "job_analysis_started",
      ...USER,
      job_id: "c1",
      analysis_completed: 0,
      progress: progressOf({ work_done, jobs_analysed: work_done }),
    });
    const state = [started, event(6), event(4)].reduce(
      (current, next) => reduceActivity(current, next, NOW),
      EMPTY_ACTIVITY,
    );
    expect(state.running[0]?.progress).toMatchObject({ work_done: 6, jobs_analysed: 6 });
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
      finished: [],
      endedIds: ["c2"],
    });
  });

  it("seeds a running crawl with its progress", () => {
    const progress = progressOf({ pages_fetched: 3, work_done: 3 });
    const state = activityFromCrawlJobs(
      [
        {
          job_id: "c1",
          platform: STEPSTONE,
          status: "crawling",
          total: 4,
          scraping_completed: 3,
          progress,
        },
      ],
      EMPTY_ACTIVITY,
      NOW,
    );
    expect(state.running[0]?.progress).toEqual(progress);
  });

  it("keeps the finished runs of the previous state on a re-seed", () => {
    const finished = [
      {
        id: "c0",
        source: "www.stepstone.de",
        outcome: "completed" as const,
        finishedAt: NOW,
        platformId: null,
      },
    ];
    const previous = { ...EMPTY_ACTIVITY, finished };
    expect(activityFromCrawlJobs([], previous, NOW).finished).toEqual(finished);
  });

  it("keeps the further progress an event brought over an older crawl-status answer", () => {
    const previous = {
      ...EMPTY_ACTIVITY,
      running: [task({ progress: progressOf({ pages_fetched: 4, work_done: 6 }) })],
    };
    const stale = progressOf({ pages_fetched: 2, work_done: 3 });
    const jobs = [
      {
        job_id: "c1",
        platform: STEPSTONE,
        status: "crawling",
        total: 4,
        scraping_completed: 2,
        progress: stale,
      },
    ];
    expect(activityFromCrawlJobs(jobs, previous, NOW).running[0]?.progress).toMatchObject({
      pages_fetched: 4,
      work_done: 6,
    });
  });
});

describe("progressPercent", () => {
  it.each([
    [0, 0, 5],
    [0, 12, 5],
    [5, 12, 42],
    [13, 12, 100],
  ])("%i of %i steps of work shows %i %%", (work_done, work_total, percent) => {
    expect(progressPercent(task({ progress: progressOf({ work_done, work_total }) }))).toBe(
      percent,
    );
  });

  it("is not full once every link is found and fetched but no job is analysed yet", () => {
    const fetched = progressOf({
      stage: "analysing",
      pages_fetched: 4,
      work_done: 4,
      work_total: 8,
    });
    expect(progressPercent(task({ done: 4, total: 4, progress: fetched }))).toBe(50);
  });

  it("shows a task without progress data as just started", () => {
    expect(progressPercent(task({ done: 12, total: 12 }))).toBe(5);
  });
});

describe("sourceLabel", () => {
  it("returns a value that is not a URL unchanged", () => {
    expect(sourceLabel("stepstone.de")).toBe("stepstone.de");
  });
});

describe("measuredPercent", () => {
  it("has no percentage before the crawl knows its work", () => {
    expect(measuredPercent(task({ progress: progressOf({ work_total: 0 }) }))).toBeNull();
  });

  it("is the bar's percentage once the work is known", () => {
    expect(measuredPercent(task({ progress: progressOf({ work_done: 2, work_total: 8 }) }))).toBe(
      25,
    );
  });
});

describe("crawl start for the elapsed time", () => {
  const QUEUED_AT = NOW - 90_000;
  const WORKER_AT = NOW - 60_000;

  it("takes the start from the start event", () => {
    const event: ActivityEvent = { ...started, started_at: String(WORKER_AT) };
    const [running] = reduceActivity(EMPTY_ACTIVITY, event, NOW).running;
    expect(running && taskStart(running)).toBe(WORKER_AT);
  });

  it("takes the queue time from crawl-status, so a reload counts from the same start", () => {
    const state = activityFromCrawlJobs(
      [
        {
          job_id: "c1",
          platform: STEPSTONE,
          status: "crawling",
          total: 1,
          scraping_completed: 0,
          started_at: String(QUEUED_AT),
        },
      ],
      { ...EMPTY_ACTIVITY, running: [task({ startedAt: WORKER_AT })] },
      NOW,
    );
    expect(state.running[0]?.startedAt).toBe(QUEUED_AT);
  });

  it("keeps a known start when crawl-status has none", () => {
    const state = activityFromCrawlJobs(
      [{ job_id: "c1", platform: STEPSTONE, status: "crawling", total: 1, scraping_completed: 0 }],
      { ...EMPTY_ACTIVITY, running: [task({ startedAt: WORKER_AT })] },
      NOW,
    );
    expect(state.running[0]?.startedAt).toBe(WORKER_AT);
  });

  it("keeps the first start when a second start event arrives", () => {
    const first = reduceActivity(
      EMPTY_ACTIVITY,
      { ...started, started_at: String(QUEUED_AT) },
      NOW,
    );
    const again = reduceActivity(first, { ...started, started_at: String(WORKER_AT) }, NOW);
    expect(again.running[0]?.startedAt).toBe(QUEUED_AT);
  });

  it("ignores an unreadable stamp", () => {
    const [running] = reduceActivity(EMPTY_ACTIVITY, { ...started, started_at: "" }, NOW).running;
    expect(running).toEqual(task({}));
  });

  it("falls back to the seed's own time until the server's start is known", () => {
    expect(taskStart(task({ seededAt: NOW }))).toBe(NOW);
  });

  it("knows no start for a task without stamp or seed", () => {
    expect(taskStart(task({}))).toBeNull();
  });
});
