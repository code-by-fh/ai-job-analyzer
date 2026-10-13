import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelCrawl, fetchCrawlJobs } from "@/api/crawl";
import { ApiError } from "@/api/errors";
import { channelStatusQueryOptions } from "@/api/notifications";
import { platformRunsPath, platformTestPath } from "@/api/platformPaths";
import {
  deletePlatform,
  fetchPlatforms,
  patchPlatform,
  platformRunsQueryOptions,
  previewSourceLinks,
  sendPlatformTest,
  setupPlatform,
  startPlatformCrawl,
} from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { createTestQueryClient } from "../support/render";
import { jsonResponse } from "../support/fakeFetch";
import { stubRoutes } from "../support/stubRoutes";

const PLATFORM = { id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs/kotlin" };
const HTTP_CONFLICT = 409;

afterEach(() => vi.unstubAllGlobals());

describe("platforms api", () => {
  it("reads the drawer fields and treats odd JSON columns as empty", async () => {
    stubRoutes({
      "GET /platforms": [
        {
          ...PLATFORM,
          notification_adapters: "PUSHOVER",
          resend_recipients: [1],
          last_run: { seeded: true },
        },
      ],
    });
    const [platform] = await fetchPlatforms();
    expect([
      platform!.notification_adapters,
      platform!.resend_recipients,
      platform!.setup_status,
      platform!.last_run?.seeded,
    ]).toEqual([null, null, "active", true]);
  });

  it("starts a crawl and answers its id", async () => {
    stubRoutes({ "POST /platforms/1/crawl": { status: "Started", job_id: "crawl-9" } });
    await expect(startPlatformCrawl(1)).resolves.toBe("crawl-9");
  });

  it("turns a second start into a CONFLICT error", async () => {
    stubRoutes({
      "POST /platforms/1/crawl": () =>
        jsonResponse(HTTP_CONFLICT, { detail: "Crawl already running" }),
    });
    await expect(startPlatformCrawl(1)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sends exactly the patch it is given", async () => {
    const calls = stubRoutes({ "PATCH /platforms/1": PLATFORM });
    await patchPlatform({ id: 1, patch: { schedule_time: null, schedule_days: null } });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ schedule_time: null, schedule_days: null });
  });

  it("reports how many jobs a delete kept", async () => {
    stubRoutes({ "DELETE /platforms/1": { status: "deleted", kept_jobs: 3 } });
    await expect(deletePlatform(1)).resolves.toBe(3);
  });

  it("asks for the run history with its size", async () => {
    const calls = stubRoutes({
      "GET /platforms/1/runs": [{ finished_at: "2026-10-08T06:00:00+00:00" }],
    });
    const runs = await createTestQueryClient().fetchQuery(platformRunsQueryOptions(1));
    expect(calls[0]!.url.endsWith(platformRunsPath(1))).toBe(true);
    expect(runs[0]).toMatchObject({ found: 0, seeded: false });
    expect(runs[0]?.error ?? null).toBeNull();
    expect(platformRunsQueryOptions(1).queryKey).toEqual(queryKeys.platformRuns(1));
  });

  it("sends a test through the channel's own path", async () => {
    const calls = stubRoutes({ "POST /platforms/1/test-smtp": { ok: true } });
    await sendPlatformTest({ id: 1, channel: "SMTP" });
    expect(calls[0]!.url.endsWith(platformTestPath(1, "SMTP"))).toBe(true);
  });

  it("reads found links and gives a link without text an empty one", async () => {
    stubRoutes({ "POST /platforms/preview-links": { links: [{ url: "https://x.de/job/1" }] } });
    await expect(previewSourceLinks({ url: "https://x.de/jobs" })).resolves.toEqual([
      { url: "https://x.de/job/1", text: "" },
    ]);
  });

  it("reads the setup flag from the setup answer", async () => {
    stubRoutes({ "POST /platforms/setup": { ...PLATFORM, initial_crawl_started: true } });
    const result = await setupPlatform({
      url: PLATFORM.url,
      selected_urls: [`${PLATFORM.url}/1`],
      initial_run: "analyze",
      schedule_time: null,
      schedule_days: null,
    });
    expect(result.initial_crawl_started).toBe(true);
  });
});

describe("crawl api", () => {
  it("reads the platform of a running crawl", async () => {
    stubRoutes({
      "GET /scraper/crawl-status": {
        jobs: [{ job_id: "c1", platform: PLATFORM.url, platform_id: 1, status: "crawling" }],
      },
    });
    const [job] = await fetchCrawlJobs();
    expect(job!.platform_id).toBe(1);
  });

  it("surfaces a scraper refusal of a cancel as an error", async () => {
    stubRoutes({ "POST /scraper/cancel-crawl": { status: "error", message: "Job not found" } });
    const error = await cancelCrawl("c1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UPSTREAM_ERROR");
  });
});

describe("notification channels", () => {
  it("reads missing channels as not configured", async () => {
    stubRoutes({ "GET /notification-settings/channels": { PUSHOVER: true } });
    const status = await createTestQueryClient().fetchQuery(channelStatusQueryOptions());
    expect(status).toEqual({ PUSHOVER: true, RESEND: false, MAILJET: false, SMTP: false });
  });
});
