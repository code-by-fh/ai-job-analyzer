import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { isJobInCache } from "@/realtime/knownJobs";

describe("isJobInCache", () => {
  it("finds a job in an infinite inbox list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxList("new"), {
      pages: [{ items: [{ id: "job-9" }], total: 1 }],
      pageParams: [0],
    });
    expect(isJobInCache(queryClient, "job-9")).toBe(true);
    expect(isJobInCache(queryClient, "job-8")).toBe(false);
  });

  it("finds a job in a plain page", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.dueApplications, { items: [{ id: "job-3" }], total: 1 });
    expect(isJobInCache(queryClient, "job-3")).toBe(true);
  });

  it("ignores counters stored under the jobs root", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.inboxTotal("below"), 4);
    expect(isJobInCache(queryClient, "job-1")).toBe(false);
  });
});
