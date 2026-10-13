import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import type { ActivityState } from "@/realtime/activity";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";

const USER_ID = 7;
const OTHER_USER_ID = 8;
const NOW = Date.UTC(2026, 9, 8, 12, 0);
const LIST_KEY = ["jobs", { tab: "new" }];

function setup() {
  const queryClient = new QueryClient();
  const onGlobalError = vi.fn();
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError };
  const send = (event: object) => handleRealtimeMessage(JSON.stringify(event), USER_ID, deps);
  return { queryClient, onGlobalError, deps, send };
}

const isInvalidated = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

describe("handleRealtimeMessage", () => {
  it("invalidates the counts for the user's new job", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobCounts, { status_counts: {} });
    send({ type: "new_job", user_id: USER_ID, job: { id: "j1" } });
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(true);
  });

  it("ignores another user's new job", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobCounts, { status_counts: {} });
    send({ type: "new_job", user_id: OTHER_USER_ID, job: { id: "j1" } });
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(false);
  });

  it("ignores updates for jobs that are not in any loaded query", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    send({ type: "job_update", user_id: USER_ID, job_id: "j2" });
    expect(isInvalidated(queryClient, LIST_KEY)).toBe(false);
  });

  it("invalidates the lists when a loaded job changes", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    send({ type: "job_update", user_id: USER_ID, job_id: "j1" });
    expect(isInvalidated(queryClient, LIST_KEY)).toBe(true);
  });

  it.each([
    ["job_updated", { job: { id: "j1" } }],
    ["job_update", { job_id: "j1" }],
  ])("invalidates the nav counts when %s changes a loaded job", (type, payload) => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    queryClient.setQueryData(queryKeys.jobCounts, { status_counts: {} });
    send({ type, user_id: USER_ID, ...payload });
    expect(isInvalidated(queryClient, queryKeys.jobCounts)).toBe(true);
  });

  it("skips cached data under the jobs key that is not a list page", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(["jobs", "facets"], { counts: {} });
    queryClient.setQueryData(LIST_KEY, { items: [{ id: "j1" }], total: 1 });
    send({ type: "job_update", user_id: USER_ID, job_id: "j1" });
    expect(isInvalidated(queryClient, LIST_KEY)).toBe(true);
  });

  it("records crawl progress in the activity cache", () => {
    const { queryClient, send } = setup();
    send({
      type: "crawl_job_started",
      user_id: USER_ID,
      job_id: "c1",
      platform: "https://www.stepstone.de/jobs",
    });
    expect(queryClient.getQueryData<ActivityState>(queryKeys.activity)?.running[0]?.source).toBe(
      "www.stepstone.de",
    );
  });

  it("invalidates the templates when one is ready", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.templates, []);
    queryClient.setQueryData(queryKeys.templateList, []);
    queryClient.setQueryData(queryKeys.templatePreview("CV", "7"), "<p></p>");
    send({ type: "template_ready", template_id: 3, user_id: USER_ID });
    expect(isInvalidated(queryClient, queryKeys.templates)).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.templateList)).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.templatePreview("CV", "7"))).toBe(true);
  });

  it("company_profile_ready also refreshes the company directory", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.companies("own"), []);
    queryClient.setQueryData(queryKeys.company("acme.de"), null);
    send({ type: "company_profile_ready", domain: "acme.de", user_id: USER_ID });
    expect(isInvalidated(queryClient, queryKeys.companies("own"))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.company("acme.de"))).toBe(true);
  });

  it("a crawl end refreshes the company directory (new jobs change its counts)", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.companies("own"), []);
    send({ type: "crawl_job_completed", job_id: "c1", user_id: USER_ID });
    expect(isInvalidated(queryClient, queryKeys.companies("own"))).toBe(true);
  });

  it("reports the user's background errors", () => {
    const { onGlobalError, send } = setup();
    send({ type: "global_error", user_id: USER_ID, message: "Kein Profil" });
    expect(onGlobalError).toHaveBeenCalledTimes(1);
  });

  it("drops malformed frames without side effects", () => {
    const { queryClient, onGlobalError, deps } = setup();
    handleRealtimeMessage("{not json", USER_ID, deps);
    expect(onGlobalError).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
