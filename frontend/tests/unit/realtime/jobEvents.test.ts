import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, pendingTaskId, startTask, type PendingTasks } from "@/domain/pendingTasks";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import { buildJob } from "../support/jobFactory";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 8, 12, 0);

function setup(pending: PendingTasks = EMPTY_PENDING) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.job("job-1"), buildJob({ status: "DRAFTED" }));
  queryClient.setQueryData(queryKeys.pendingTasks, pending);
  const deps: RealtimeDeps = { queryClient, now: () => NOW, onGlobalError: vi.fn() };
  const send = (event: object) =>
    handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, deps);
  const pendingNow = () => queryClient.getQueryData<PendingTasks>(queryKeys.pendingTasks) ?? {};
  return { queryClient, send, pendingNow };
}

const isInvalidated = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

describe("job events", () => {
  it("invalidates the job and its documents on job_update", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.jobDocuments("job-1"), []);
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED" });
    expect(isInvalidated(queryClient, queryKeys.jobDocuments("job-1"))).toBe(true);
  });

  it("a render event does not write the event status into the cache", () => {
    const { queryClient, send } = setup();
    send({ type: "job_update", job_id: "job-1", status: "FAILED", rendered_kind: "cv" });
    expect(queryClient.getQueryData<{ status: string }>(queryKeys.job("job-1"))?.status).toBe(
      "DRAFTED",
    );
  });

  it("finishes the pending render of that kind", () => {
    const cv = pendingTaskId.render("job-1", "cv");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, cv, NOW));
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED", rendered_kind: "cv" });
    expect(pendingNow()[cv]).toBeUndefined();
  });

  it("marks a pending render failed on an error event", () => {
    const letter = pendingTaskId.render("job-1", "cover_letter");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, letter, NOW));
    send({ type: "job_update", job_id: "job-1", status: "FAILED", error: "weasyprint" });
    expect(pendingNow()[letter]?.failed).toBe(true);
  });

  it("finishes a pending generation on the final job_update", () => {
    const generation = pendingTaskId.generation("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, generation, NOW));
    send({ type: "job_update", job_id: "job-1", status: "DRAFTED" });
    expect(pendingNow()[generation]).toBeUndefined();
  });

  it("finishes the re-analysis on job_updated", () => {
    const analysis = pendingTaskId.analysis("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, analysis, NOW));
    send({ type: "job_updated", job: { id: "job-1" } });
    expect(pendingNow()[analysis]).toBeUndefined();
  });

  it("finishes the interview prep", () => {
    const prep = pendingTaskId.prep("job-1");
    const { send, pendingNow } = setup(startTask(EMPTY_PENDING, prep, NOW));
    send({ type: "interview_prep_ready", job_id: "job-1" });
    expect(pendingNow()[prep]).toBeUndefined();
  });

  it("finishes the company research and refreshes the profile", () => {
    const research = pendingTaskId.research("acme.de");
    const { queryClient, send, pendingNow } = setup(startTask(EMPTY_PENDING, research, NOW));
    queryClient.setQueryData(queryKeys.company("acme.de"), null);
    send({ type: "company_profile_ready", domain: "acme.de" });
    expect(pendingNow()[research]).toBeUndefined();
    expect(isInvalidated(queryClient, queryKeys.company("acme.de"))).toBe(true);
  });
});

describe("company_profile_ready and jobs of that company", () => {
  it("refreshes cached jobs with that company_domain only", () => {
    const { queryClient, send } = setup();
    queryClient.setQueryData(queryKeys.job("job-2"), buildJob({ company_domain: "acme.de" }));
    queryClient.setQueryData(queryKeys.job("job-3"), buildJob({ company_domain: "other.de" }));
    send({ type: "company_profile_ready", domain: "acme.de" });
    expect(isInvalidated(queryClient, queryKeys.job("job-2"))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.job("job-3"))).toBe(false);
  });

  it("drops nothing when no cached job belongs to the company", () => {
    const { queryClient, send } = setup();
    send({ type: "company_profile_ready", domain: "acme.de" });
    expect(isInvalidated(queryClient, queryKeys.job("job-1"))).toBe(false);
  });
});
