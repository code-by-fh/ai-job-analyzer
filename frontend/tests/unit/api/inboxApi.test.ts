import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { importJobByUrl } from "@/api/imports";
import { dueListPath, fetchJobPage, inboxListPath, nextOffset } from "@/api/jobList";
import { deleteJob } from "@/api/jobs";
import { fetchPlatforms } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { fetchSetupStatus, setupStatusQueryOptions } from "@/api/setup";
import {
  applyThreshold,
  fetchMatchThreshold,
  fetchThresholdDistribution,
  fetchThresholdPreview,
  SCORE_BUCKETS,
} from "@/api/threshold";
import { buildListItem, pageOf } from "../support/listItemFactory";
import { stubRoutes } from "../support/stubRoutes";

const bodyOf = (calls: { body: string | null }[]) => JSON.parse(calls[0]?.body ?? "null");

describe("inbox list paths", () => {
  it("asks for active matches by score", () => {
    expect(inboxListPath("new", 0)).toBe(
      "/jobs?statuses=OPEN&is_archived=false&sort_by=score&limit=50&offset=0",
    );
  });

  it("asks for threshold-archived jobs, newest first", () => {
    expect(inboxListPath("below", 50)).toBe(
      "/jobs?is_archived=true&archive_reason=THRESHOLD&sort_by=date&limit=50&offset=50",
    );
  });

  it("asks for the user's own discards with a custom page size", () => {
    expect(inboxListPath("dismissed", 0, 1)).toBe(
      "/jobs?is_archived=true&archive_reason=USER&sort_by=date&limit=1&offset=0",
    );
  });

  it("asks for active applications for the due card", () => {
    expect(dueListPath()).toBe(
      "/jobs?statuses=APPLIED%2CINTERVIEW%2COFFER%2CGENERATING&is_archived=false&sort_by=date&limit=100&offset=0",
    );
  });
});

describe("fetchJobPage", () => {
  it("reads rows and fills missing flags", async () => {
    stubRoutes({ "GET /jobs": { items: [{ id: "job-1", status: "OPEN" }], total: 1 } });
    await expect(fetchJobPage(inboxListPath("new", 0))).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "job-1",
          cv_html_present: false,
          interview_prep_present: false,
        }),
      ],
      total: 1,
    });
  });
});

describe("nextOffset", () => {
  const two = pageOf([buildListItem({ id: "a" }), buildListItem({ id: "b" })], 3);

  it("continues after the loaded rows", () => {
    expect(nextOffset(two, [two])).toBe(2);
  });

  it("stops when every row is loaded", () => {
    const all = pageOf([buildListItem({ id: "c" })], 3);
    expect(nextOffset(all, [two, all])).toBeUndefined();
  });

  it("stops on an empty page even if the total says more", () => {
    const empty = pageOf([], 5);
    expect(nextOffset(empty, [two, empty])).toBeUndefined();
  });
});

describe("threshold", () => {
  it("reads the saved threshold and treats a missing one as off", async () => {
    stubRoutes({ "GET /settings": { language: "de" } });
    await expect(fetchMatchThreshold()).resolves.toBe(0);
  });

  it("previews a threshold", async () => {
    const calls = stubRoutes({
      "GET /matching-preference/preview": { threshold: 70, would_archive: 4, would_restore: 1 },
    });
    await expect(fetchThresholdPreview(70)).resolves.toEqual({
      threshold: 70,
      would_archive: 4,
      would_restore: 1,
    });
    expect(calls[0].url).toBe("http://api.test/matching-preference/preview?threshold=70");
  });

  it("reads the distribution and refuses one of the wrong length", async () => {
    const counts = Array.from({ length: SCORE_BUCKETS }, () => 0);
    stubRoutes({ "GET /matching-preference/distribution": { counts } });
    await expect(fetchThresholdDistribution()).resolves.toHaveLength(SCORE_BUCKETS);
    stubRoutes({ "GET /matching-preference/distribution": { counts: [1, 2] } });
    await expect(fetchThresholdDistribution()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("applies to existing jobs", async () => {
    const calls = stubRoutes({
      "POST /matching-preference": {
        status: "saved",
        match_threshold: 70,
        archived: 4,
        restored: 1,
      },
    });
    await expect(applyThreshold(70)).resolves.toEqual({
      match_threshold: 70,
      archived: 4,
      restored: 1,
    });
    expect(bodyOf(calls)).toEqual({ match_threshold: 70, apply_to_existing: true });
  });
});

describe("setup, import and delete", () => {
  it("reads the setup status", async () => {
    const status = {
      has_source: true,
      ai_configured: false,
      profile_complete: true,
      has_jobs: false,
    };
    stubRoutes({ "GET /setup-status": status });
    await expect(fetchSetupStatus()).resolves.toEqual(status);
  });

  it("starts an import and returns the crawl id", async () => {
    const calls = stubRoutes({
      "POST /scraper/import-job": { status: "Started", job_id: "crawl-9" },
    });
    await expect(importJobByUrl("https://karriere.example.de/jobs/1")).resolves.toBe("crawl-9");
    expect(bodyOf(calls)).toEqual({ url: "https://karriere.example.de/jobs/1" });
  });

  it("turns a scraper refusal into an upstream error", async () => {
    stubRoutes({
      "POST /scraper/import-job": { status: "Error", message: "URL muss mit http(s) beginnen." },
    });
    await expect(importJobByUrl("x")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("deletes a job and reports what happened", async () => {
    stubRoutes({ "DELETE /jobs/job-1": { status: "deleted" } });
    await expect(deleteJob("job-1")).resolves.toBe("deleted");
  });
});

describe("platforms for the run line", () => {
  it("reads schedules and last-run counts with defaults", async () => {
    stubRoutes({
      "GET /platforms": [
        {
          id: 1,
          name: "StepStone",
          url: "https://www.stepstone.de/jobs/kotlin",
          schedule_times: ["07:00"],
          schedule_days: [0, 1, 2],
          last_run: { finished_at: "2026-10-08T06:00:00+00:00", found: 12, new: 5, matched: 3 },
        },
        { id: 2, name: "Indeed", url: "https://de.indeed.com", last_run: "broken" },
      ],
    });
    const [stepstone, indeed] = await fetchPlatforms();
    expect(stepstone).toMatchObject({
      is_active: true,
      schedule_times: ["07:00"],
      last_run: { found: 12, new: 5, matched: 3 },
    });
    expect(indeed?.last_run).toBeNull();
  });
});

describe("inbox query pins", () => {
  it("never retries the advisory setup-status request", () => {
    expect(setupStatusQueryOptions().retry).toBe(false);
  });

  it("marks the inbox list and total queries stale when the jobs root is invalidated", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxList("new"), { pages: [], pageParams: [] });
    queryClient.setQueryData(queryKeys.inboxTotal("new"), 3);
    await queryClient.invalidateQueries({ queryKey: queryKeys.jobsRoot, refetchType: "none" });
    expect(queryClient.getQueryState(queryKeys.inboxList("new"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.inboxTotal("new"))?.isInvalidated).toBe(true);
  });
});
