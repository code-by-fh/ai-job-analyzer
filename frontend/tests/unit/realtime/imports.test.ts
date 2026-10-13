import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { STALL_AFTER_MS } from "@/domain/pendingTasks";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import { handleRealtimeMessage } from "@/realtime/handleMessage";
import {
  EMPTY_IMPORTS,
  IMPORT_EVENT_TTL_MS,
  IMPORT_EXPIRE_AFTER_MS,
  MAX_BUFFERED_IMPORT_EVENTS,
  isImportStalled,
  trackImport,
  type ImportResult,
  type ImportState,
} from "@/realtime/imports";
import {
  expireStalledImports,
  markImportStarted,
  setImportFinishedListener,
} from "@/realtime/importSignals";

const USER_ID = 7;
const NOW = Date.UTC(2026, 9, 8, 12, 0);
const CRAWL = "crawl-9";

function setup({ tracked = true } = {}) {
  const queryClient = new QueryClient();
  const clock = { now: NOW };
  if (tracked) queryClient.setQueryData(queryKeys.imports, trackImport(EMPTY_IMPORTS, CRAWL, NOW));
  queryClient.setQueryData(queryKeys.setupStatus, { has_jobs: false });
  queryClient.setQueryData(queryKeys.thresholdDistribution, { counts: [] });
  queryClient.setQueryData(queryKeys.thresholdPreview(70), { count: 1 });
  const onImportFinished = vi.fn();
  const deps: RealtimeDeps = {
    queryClient,
    now: () => clock.now,
    onGlobalError: vi.fn(),
    onImportFinished,
  };
  const send = (event: object) =>
    handleRealtimeMessage(JSON.stringify({ user_id: USER_ID, ...event }), USER_ID, deps);
  const imports = () => queryClient.getQueryData<ImportState>(queryKeys.imports) ?? {};
  const isInvalidated = (queryKey: QueryKey) =>
    queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
  setImportFinishedListener(queryClient, onImportFinished);
  return { queryClient, clock, send, onImportFinished, imports, isInvalidated };
}

const job = (overrides: object = {}) => ({
  id: "job-30",
  match_score: 80,
  is_archived: false,
  ...overrides,
});

describe("import tracking", () => {
  it("reports the imported job with its score when the crawl ends", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "new_job", crawl_job_id: CRAWL, job: job() });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith({
      outcome: "imported",
      jobId: "job-30",
      score: 80,
      archived: false,
    });
    expect(imports()).toEqual({});
  });

  it("says when the import landed below the threshold", () => {
    const { send, onImportFinished } = setup();
    send({
      type: "new_job",
      crawl_job_id: CRAWL,
      job: job({ match_score: 54, is_archived: true }),
    });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "imported", score: 54, archived: true }),
    );
  });

  it("names the existing job of a duplicate", () => {
    const { send, onImportFinished } = setup();
    send({ type: "job_skipped", job_id: CRAWL, existing_job_id: "job-1", jobs_skipped: 1 });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith({
      outcome: "exists",
      jobId: "job-1",
      score: null,
      archived: false,
    });
  });

  it.each([
    ["omitted", {}],
    ["null", { existing_job_id: null }],
  ])("accepts a skipped import whose existing job id is %s", (_name, extra) => {
    const { send, onImportFinished } = setup();
    send({ type: "job_skipped", job_id: CRAWL, ...extra });
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith({
      outcome: "exists",
      jobId: null,
      score: null,
      archived: false,
    });
  });

  it("reports a failed crawl", () => {
    const { send, onImportFinished } = setup();
    send({ type: "crawl_job_failed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });

  it("ignores crawls this tab did not start", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "new_job", crawl_job_id: "other", job: job() });
    send({ type: "crawl_job_completed", job_id: "other" });
    expect(onImportFinished).not.toHaveBeenCalled();
    expect(imports()[CRAWL]?.jobId).toBeNull();
  });

  it("refreshes the threshold ticks and the setup status on a new job", () => {
    const { send, isInvalidated } = setup();
    send({ type: "new_job", job: { id: "job-31" } });
    expect(isInvalidated(queryKeys.thresholdDistribution)).toBe(true);
    expect(isInvalidated(queryKeys.thresholdPreview(70))).toBe(true);
    expect(isInvalidated(queryKeys.setupStatus)).toBe(true);
  });

  it("refreshes the threshold ticks and the preview when a crawl completes", () => {
    const { send, isInvalidated } = setup();
    send({ type: "crawl_completed" });
    expect(isInvalidated(queryKeys.thresholdDistribution)).toBe(true);
    expect(isInvalidated(queryKeys.thresholdPreview(70))).toBe(true);
  });

  it("turns stalled after the stall time", () => {
    const entry = trackImport(EMPTY_IMPORTS, CRAWL, NOW)[CRAWL]!;
    expect(isImportStalled(entry, NOW + STALL_AFTER_MS - 1)).toBe(false);
    expect(isImportStalled(entry, NOW + STALL_AFTER_MS)).toBe(true);
  });

  it("reports a completed crawl without any job event as failed", () => {
    const { send, onImportFinished } = setup();
    send({ type: "crawl_job_completed", job_id: CRAWL });
    expect(onImportFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });

  it("ends a cancelled import silently", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "crawl_job_cancelled", job_id: CRAWL });
    expect(onImportFinished).not.toHaveBeenCalled();
    expect(imports()).toEqual({});
  });

  it("ignores a skip of a crawl this tab did not start", () => {
    const { send, onImportFinished, imports } = setup();
    send({ type: "job_skipped", job_id: "other", existing_job_id: "job-1" });
    expect(onImportFinished).not.toHaveBeenCalled();
    expect(imports()[CRAWL]?.skipped).toBe(false);
  });
});

describe("events that arrive before the import is marked as started", () => {
  const started = (result: ImportResult | null, ctx: ReturnType<typeof setup>) => {
    markImportStarted(ctx.queryClient, CRAWL, ctx.clock.now);
    return result;
  };

  it("replays a job event and the end event", () => {
    const ctx = setup({ tracked: false });
    ctx.send({ type: "new_job", crawl_job_id: CRAWL, job: job() });
    ctx.send({ type: "crawl_job_completed", job_id: CRAWL });
    started(null, ctx);
    expect(ctx.onImportFinished).toHaveBeenCalledWith({
      outcome: "imported",
      jobId: "job-30",
      score: 80,
      archived: false,
    });
    expect(ctx.imports()).toEqual({});
  });

  it("replays a skip that arrived after the end event", () => {
    const ctx = setup({ tracked: false });
    ctx.send({ type: "crawl_job_completed", job_id: CRAWL });
    ctx.send({ type: "job_skipped", job_id: CRAWL, existing_job_id: "job-1" });
    started(null, ctx);
    expect(ctx.onImportFinished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "exists", jobId: "job-1" }),
    );
  });

  it("keeps at most the newest events", () => {
    const ctx = setup({ tracked: false });
    ctx.send({ type: "crawl_job_completed", job_id: CRAWL });
    for (let index = 0; index < MAX_BUFFERED_IMPORT_EVENTS; index += 1) {
      ctx.send({ type: "crawl_job_completed", job_id: `noise-${index}` });
    }
    started(null, ctx);
    expect(ctx.onImportFinished).not.toHaveBeenCalled();
    expect(ctx.imports()[CRAWL]).toBeDefined();
  });

  it("drops events older than the time to live", () => {
    const ctx = setup({ tracked: false });
    ctx.send({ type: "crawl_job_completed", job_id: CRAWL });
    ctx.clock.now += IMPORT_EVENT_TTL_MS;
    started(null, ctx);
    expect(ctx.onImportFinished).not.toHaveBeenCalled();
    expect(ctx.imports()[CRAWL]).toBeDefined();
  });
});

describe("an import whose end event never came", () => {
  it("is removed with a result once it is long overdue", () => {
    const { queryClient, clock, send, onImportFinished, imports } = setup();
    send({ type: "new_job", crawl_job_id: CRAWL, job: job() });
    expireStalledImports(queryClient, NOW + IMPORT_EXPIRE_AFTER_MS - 1);
    expect(imports()[CRAWL]).toBeDefined();
    clock.now = NOW + IMPORT_EXPIRE_AFTER_MS;
    expireStalledImports(queryClient, clock.now);
    expect(onImportFinished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "imported", jobId: "job-30" }),
    );
    expect(imports()).toEqual({});
  });

  it("reports failed when no job was ever seen", () => {
    const { queryClient, onImportFinished } = setup();
    expireStalledImports(queryClient, NOW + IMPORT_EXPIRE_AFTER_MS);
    expect(onImportFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });
});
