import { describe, expect, it } from "vitest";
import {
  activityFromCrawlJobs,
  EMPTY_ACTIVITY,
  reduceActivity,
  SEED_GRACE_MS,
  seedCrawlTask,
} from "@/realtime/activity";
import type { ActivityEvent } from "@/realtime/events";

const NOW = Date.UTC(2026, 9, 8, 12, 0);
const URL_1 = "https://www.stepstone.de/jobs/kotlin";
const SEED = { id: "c1", platformId: 1, source: "www.stepstone.de" };
const started = (platformId?: number): ActivityEvent => ({
  type: "crawl_job_started",
  user_id: 7,
  job_id: "c1",
  platform: URL_1,
  platform_id: platformId,
});
const failed: ActivityEvent = { type: "crawl_job_failed", user_id: 7, job_id: "c1" };

describe("crawl activity per source", () => {
  it("seeds a waiting bar for the source before the first event", () => {
    expect(seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW).running).toEqual([
      {
        id: "c1",
        platformId: 1,
        source: "www.stepstone.de",
        step: "starting",
        done: 0,
        total: 0,
        seededAt: NOW,
      },
    ]);
  });

  it("the started event names the platform", () => {
    expect(reduceActivity(EMPTY_ACTIVITY, started(1), NOW).running[0]!.platformId).toBe(1);
  });

  it("the started event keeps the seeded platform when it names none", () => {
    const seeded = seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW);
    expect(reduceActivity(seeded, started(), NOW).running[0]!.platformId).toBe(1);
  });

  it("a late seed does not revive an ended crawl", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW), failed, NOW);
    expect(seedCrawlTask(ended, SEED, NOW).running).toEqual([]);
  });

  it("a finished task remembers its platform", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW), failed, NOW);
    expect(ended.finished[0]).toMatchObject({ id: "c1", platformId: 1, outcome: "failed" });
  });

  it("crawl status entries carry their platform, imports none", () => {
    const state = activityFromCrawlJobs(
      [
        {
          job_id: "c2",
          platform: URL_1,
          platform_id: 2,
          status: "crawling",
          total: 4,
          scraping_completed: 1,
        },
        {
          job_id: "i1",
          platform: `${URL_1}/job/9`,
          status: "starting",
          total: 1,
          scraping_completed: 0,
        },
      ],
      EMPTY_ACTIVITY,
      NOW,
    );
    expect(state.running.map((task) => task.platformId)).toEqual([2, null]);
  });

  it("a reseed keeps the ended ids, so a late seed cannot revive an ended crawl", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW), failed, NOW);
    const reseeded = activityFromCrawlJobs([], ended, NOW);
    expect(reseeded.endedIds).toEqual(["c1"]);
    expect(seedCrawlTask(reseeded, SEED, NOW).running).toEqual([]);
  });
});

describe("a reseed after a crawl ended", () => {
  it("does not bring the ended crawl back while the scraper still lists it as running", () => {
    const ended = reduceActivity(seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW), failed, NOW);
    const stale = {
      job_id: "c1",
      platform: URL_1,
      platform_id: 1,
      status: "crawling",
      total: 4,
      scraping_completed: 1,
    };
    expect(activityFromCrawlJobs([stale], ended, NOW).running).toEqual([]);
  });
});

describe("a crawl-status answer older than a start", () => {
  const ONE_SECOND_MS = 1000;
  const seeded = seedCrawlTask(EMPTY_ACTIVITY, SEED, NOW);
  const listedSeed = {
    job_id: "c1",
    platform: URL_1,
    platform_id: 1,
    status: "crawling",
    total: 9,
    scraping_completed: 2,
  };

  it("keeps a seeded crawl it does not list yet", () => {
    const state = activityFromCrawlJobs([], seeded, NOW + ONE_SECOND_MS);
    expect(state.running.map((task) => task.id)).toEqual(["c1"]);
  });

  it("drops it once the grace window is over", () => {
    expect(activityFromCrawlJobs([], seeded, NOW + SEED_GRACE_MS).running).toEqual([]);
  });

  it("never keeps a seed that already ended", () => {
    const ended = { ...seeded, endedIds: ["c1"] };
    expect(activityFromCrawlJobs([], ended, NOW + ONE_SECOND_MS).running).toEqual([]);
  });

  it("a listed seed is one task built from the scraper's data", () => {
    const state = activityFromCrawlJobs([listedSeed], seeded, NOW + ONE_SECOND_MS);
    expect(state.running).toEqual([
      {
        id: "c1",
        source: "www.stepstone.de",
        platformId: 1,
        step: "collecting",
        done: 2,
        total: 9,
      },
    ]);
  });
});
