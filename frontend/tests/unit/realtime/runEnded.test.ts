import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { applyEvent, type RealtimeDeps } from "@/realtime/applyEvent";
import { parseRealtimeMessage } from "@/realtime/events";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 16, 9, 30);
const CACHED: readonly QueryKey[] = [
  queryKeys.profile,
  queryKeys.setupStatus,
  queryKeys.company("acme.de"),
  queryKeys.company("initech.de"),
];

function setup() {
  const queryClient = new QueryClient();
  for (const queryKey of CACHED) queryClient.setQueryData(queryKey, { cached: true });
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError: vi.fn() };
  return { queryClient, deps };
}

const invalidated = (queryClient: QueryClient) =>
  CACHED.filter((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated);

describe("the end of a run that happens inside a request (CV import, deep dive)", () => {
  it("parses both end events", () => {
    const cv = parseRealtimeMessage(JSON.stringify({ type: "cv_import_ended", user_id: USER_ID }));
    const deepDive = parseRealtimeMessage(
      JSON.stringify({ type: "deep_dive_ended", user_id: USER_ID, domain: "acme.de" }),
    );
    expect([cv?.type, deepDive?.type]).toEqual(["cv_import_ended", "deep_dive_ended"]);
  });

  it("an ended CV import reloads the profile and the setup status", () => {
    const { queryClient, deps } = setup();
    applyEvent({ type: "cv_import_ended", user_id: USER_ID }, deps);
    expect(invalidated(queryClient)).toEqual([queryKeys.profile, queryKeys.setupStatus]);
  });

  it("an ended deep dive reloads only that company", () => {
    const { queryClient, deps } = setup();
    applyEvent({ type: "deep_dive_ended", user_id: USER_ID, domain: "acme.de" }, deps);
    expect(invalidated(queryClient)).toEqual([queryKeys.company("acme.de")]);
  });
});

describe("the end of the posting details run", () => {
  it("parses the end event", () => {
    const event = parseRealtimeMessage(
      JSON.stringify({ type: "posting_details_ended", user_id: USER_ID, job_id: "job-1" }),
    );
    expect(event?.type).toBe("posting_details_ended");
  });

  it("reloads that job and ends its pending task", () => {
    const { queryClient, deps } = setup();
    queryClient.setQueryData(queryKeys.job("job-1"), { cached: true });
    queryClient.setQueryData(queryKeys.pendingTasks, {
      "posting-details:job-1": { startedAt: NOW, failed: false },
    });
    applyEvent({ type: "posting_details_ended", user_id: USER_ID, job_id: "job-1" }, deps);
    expect(queryClient.getQueryState(queryKeys.job("job-1"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(queryKeys.pendingTasks)).toEqual({});
  });
});
