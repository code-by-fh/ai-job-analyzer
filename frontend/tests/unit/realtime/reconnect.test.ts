import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { INBOX_TRIAGE_KEY, queryKeys } from "@/api/queryKeys";
import { refetchAfterReconnect } from "@/realtime/applyEvent";

const JOB_ID = "job-9";

/** An active query (one observer) that counts its fetches. */
function watch(queryClient: QueryClient, queryKey: QueryKey) {
  const fetches = { count: 0 };
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: () => {
      fetches.count += 1;
      return fetches.count;
    },
  });
  observer.subscribe(() => undefined);
  return fetches;
}

/** A triage whose request never answers, so it stays pending for the whole test. */
function startPendingTriage(queryClient: QueryClient): void {
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey: INBOX_TRIAGE_KEY,
    mutationFn: () => new Promise(() => undefined),
  });
  void mutation.execute(undefined);
}

async function setup() {
  const queryClient = new QueryClient();
  const list = watch(queryClient, queryKeys.inboxList("new"));
  const job = watch(queryClient, queryKeys.job(JOB_ID));
  await vi.waitFor(() => expect([list.count, job.count]).toEqual([1, 1]));
  return { queryClient, list, job };
}

describe("refetch after a reconnect (R15, M1)", () => {
  it("leaves the inbox list alone while a triage is pending", async () => {
    const { queryClient, list, job } = await setup();
    startPendingTriage(queryClient);
    await refetchAfterReconnect(queryClient);
    expect(list.count).toBe(1);
    expect(job.count).toBe(2);
  });

  it("refetches every active query when no triage is pending", async () => {
    const { queryClient, list, job } = await setup();
    await refetchAfterReconnect(queryClient);
    expect([list.count, job.count]).toEqual([2, 2]);
  });
});
