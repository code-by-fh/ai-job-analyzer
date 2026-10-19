import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_ACTIVITY, type ActivityState } from "@/realtime/activity";
import {
  activityQueryOptions,
  markCrawlStarted,
  SEED_WAIT_MS,
  useActivity,
} from "@/realtime/useActivity";
import { createTestQueryClient } from "../support/render";
import { jsonResponse } from "../support/fakeFetch";

const FINISHED_AT = Date.UTC(2026, 9, 8, 12, 0);
const RUNNING_CRAWL = {
  job_id: "c1",
  platform: "https://www.stepstone.de/jobs",
  status: "crawling",
  total: 12,
  scraping_completed: 5,
};

describe("useActivity", () => {
  it("keeps the finished runs when a reconnect re-seeds from the scraper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { jobs: [RUNNING_CRAWL] })),
    );
    const queryClient = createTestQueryClient();
    const finished = [
      {
        id: "c0",
        source: "de.indeed.com",
        outcome: "failed" as const,
        finishedAt: FINISHED_AT,
        platformId: null,
      },
    ];
    queryClient.setQueryData<ActivityState>(queryKeys.activity, { ...EMPTY_ACTIVITY, finished });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useActivity(true), { wrapper });
    await queryClient.refetchQueries({ type: "active" });
    await waitFor(() => expect(result.current.running).toHaveLength(1));
    expect(result.current.finished).toEqual(finished);
  });
});

describe("markCrawlStarted", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const SEED = { id: "c9", platformId: 2, source: "de.indeed.com" };
  const HTTP_SERVER_ERROR = 500;
  const runningIds = (queryClient: QueryClient) =>
    queryClient.getQueryData<ActivityState>(queryKeys.activity)?.running.map((task) => task.id);

  it("with an empty cache asks the scraper first, so its running crawls are not lost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { jobs: [RUNNING_CRAWL] })),
    );
    const queryClient = createTestQueryClient();
    await markCrawlStarted(queryClient, SEED);
    expect(runningIds(queryClient)).toEqual(["c1", "c9"]);
  });

  it("joins a crawl-status request already on its way instead of being overwritten by it", async () => {
    let answer: (value: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    vi.stubGlobal("fetch", fetch);
    const queryClient = createTestQueryClient();
    const loading = queryClient.prefetchQuery(activityQueryOptions());
    const marking = markCrawlStarted(queryClient, SEED);
    answer(jsonResponse(200, { jobs: [RUNNING_CRAWL] }));
    await Promise.all([loading, marking]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runningIds(queryClient)).toEqual(["c1", "c9"]);
  });

  it("seeds after a bounded wait when the scraper does not answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const queryClient = createTestQueryClient();
    const marking = markCrawlStarted(queryClient, SEED);
    await vi.advanceTimersByTimeAsync(SEED_WAIT_MS);
    await marking;
    expect(runningIds(queryClient)).toEqual(["c9"]);
  });

  it("keeps the seed when the joined request answers after the bound without it", async () => {
    vi.useFakeTimers();
    let answer: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const queryClient = createTestQueryClient();
    const loading = queryClient.prefetchQuery(activityQueryOptions());
    const marking = markCrawlStarted(queryClient, SEED);
    await vi.advanceTimersByTimeAsync(SEED_WAIT_MS);
    await marking;
    answer(jsonResponse(200, { jobs: [RUNNING_CRAWL] }));
    await loading;
    expect(runningIds(queryClient)).toEqual(["c1", "c9"]);
  });

  it("still shows the started crawl when the scraper cannot be asked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(HTTP_SERVER_ERROR, { detail: "down" })),
    );
    const queryClient = createTestQueryClient();
    await markCrawlStarted(queryClient, SEED);
    expect(runningIds(queryClient)).toEqual(["c9"]);
  });
});
