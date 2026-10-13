import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { INBOX_TRIAGE_KEY, queryKeys } from "@/api/queryKeys";
import { applyEvent, type RealtimeDeps } from "@/realtime/applyEvent";
import type { RealtimeEvent } from "@/realtime/events";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 8, 12, 0);
const NEW_JOB: RealtimeEvent = { type: "new_job", user_id: USER_ID, job: { id: "job-9" } };
const CACHED: readonly QueryKey[] = [
  queryKeys.inboxList("new"),
  queryKeys.inboxTotal("dismissed"),
  queryKeys.dueApplications,
  queryKeys.jobCounts,
];

function setup() {
  const queryClient = new QueryClient();
  for (const queryKey of CACHED) queryClient.setQueryData(queryKey, { cached: true });
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError: vi.fn() };
  return { queryClient, deps };
}

/** A triage whose request never answers, so it stays pending for the whole test. */
function startPendingTriage(queryClient: QueryClient): void {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey: INBOX_TRIAGE_KEY,
    mutationFn: () => new Promise(() => undefined),
  });
  void mutation.execute(undefined);
}

const isInvalidated = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

describe("realtime invalidation during an inbox triage (R15)", () => {
  it("leaves the inbox lists alone while a triage is pending", () => {
    const { queryClient, deps } = setup();
    startPendingTriage(queryClient);
    applyEvent(NEW_JOB, deps);
    expect(isInvalidated(queryClient, queryKeys.inboxList("new"))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.inboxTotal("dismissed"))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.dueApplications)).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(true);
  });

  it("invalidates every key when no triage is pending", () => {
    const { queryClient, deps } = setup();
    applyEvent(NEW_JOB, deps);
    expect(CACHED.map((queryKey) => isInvalidated(queryClient, queryKey))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe("setup status on a new job (M7)", () => {
  it("leaves the setup status alone once it knows a job", () => {
    const { queryClient, deps } = setup();
    queryClient.setQueryData(queryKeys.setupStatus, { has_jobs: true });
    applyEvent(NEW_JOB, deps);
    expect(isInvalidated(queryClient, queryKeys.setupStatus)).toBe(false);
  });

  it("refreshes the setup status while it knows no job yet", () => {
    const { queryClient, deps } = setup();
    queryClient.setQueryData(queryKeys.setupStatus, { has_jobs: false });
    applyEvent(NEW_JOB, deps);
    expect(isInvalidated(queryClient, queryKeys.setupStatus)).toBe(true);
  });
});
