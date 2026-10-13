import { STALL_AFTER_MS } from "@/domain/pendingTasks";

export interface ImportEntry {
  startedAt: number;
  jobId: string | null;
  score: number | null;
  archived: boolean;
  skipped: boolean;
}

/** Imports this tab started, keyed by the crawl id their realtime events carry (decision D7). */
export type ImportState = Readonly<Record<string, ImportEntry>>;
export const EMPTY_IMPORTS: ImportState = {};

export type ImportOutcome = "imported" | "exists" | "failed";

export interface ImportResult {
  outcome: ImportOutcome;
  jobId: string | null;
  score: number | null;
  archived: boolean;
}

export interface ImportedJob {
  id: string;
  match_score?: number | null;
  is_archived?: boolean | null;
}

export function trackImport(state: ImportState, crawlId: string, now: number): ImportState {
  const entry: ImportEntry = {
    startedAt: now,
    jobId: null,
    score: null,
    archived: false,
    skipped: false,
  };
  return { ...state, [crawlId]: entry };
}

export function recordImportedJob(
  state: ImportState,
  crawlId: string,
  job: ImportedJob,
): ImportState {
  const entry = state[crawlId];
  if (!entry) return state;
  const imported = {
    jobId: job.id,
    score: job.match_score ?? null,
    archived: job.is_archived ?? false,
  };
  return { ...state, [crawlId]: { ...entry, ...imported } };
}

export function recordSkippedImport(
  state: ImportState,
  crawlId: string,
  existingJobId: string | null,
): ImportState {
  const entry = state[crawlId];
  if (!entry) return state;
  return { ...state, [crawlId]: { ...entry, skipped: true, jobId: existingJobId } };
}

export type ImportEnd = "completed" | "failed" | "cancelled";

// A completed crawl that produced no job event is a scrape the server gave up on (it still
// publishes crawl_job_completed), so it must not be reported as an import.
function importResult(entry: ImportEntry, end: ImportEnd): ImportResult {
  const nothingFound = !entry.skipped && entry.jobId === null;
  const outcome: ImportOutcome =
    end === "failed" || nothingFound ? "failed" : entry.skipped ? "exists" : "imported";
  return { outcome, jobId: entry.jobId, score: entry.score, archived: entry.archived };
}

/** Ends a tracked import. Crawls this tab did not start and cancelled imports give no result. */
export function finishImport(
  state: ImportState,
  crawlId: string,
  end: ImportEnd,
): { state: ImportState; result: ImportResult | null } {
  const entry = state[crawlId];
  if (!entry) return { state, result: null };
  const rest = { ...state };
  delete rest[crawlId];
  return { state: rest, result: end === "cancelled" ? null : importResult(entry, end) };
}

/** What one realtime event says about a crawl, independent of which event type carried it. */
export type ImportSignal =
  | { kind: "job"; job: ImportedJob }
  | { kind: "skipped"; existingJobId: string | null }
  | { kind: "end"; end: ImportEnd };

export function applyImportSignal(
  state: ImportState,
  crawlId: string,
  signal: ImportSignal,
): { state: ImportState; result: ImportResult | null } {
  if (signal.kind === "end") return finishImport(state, crawlId, signal.end);
  const next =
    signal.kind === "job"
      ? recordImportedJob(state, crawlId, signal.job)
      : recordSkippedImport(state, crawlId, signal.existingJobId);
  return { state: next, result: null };
}

// Events can beat the POST response that marks the import as started; keep a few for replay.
export const MAX_BUFFERED_IMPORT_EVENTS = 20;
export const IMPORT_EVENT_TTL_MS = 60_000;

export interface BufferedImportEvent {
  crawlId: string;
  signal: ImportSignal;
  at: number;
}
export type ImportEventBuffer = readonly BufferedImportEvent[];
export const EMPTY_IMPORT_EVENTS: ImportEventBuffer = [];

function isFresh(event: BufferedImportEvent, now: number): boolean {
  return now - event.at < IMPORT_EVENT_TTL_MS;
}

export function bufferImportEvent(
  buffer: ImportEventBuffer,
  event: BufferedImportEvent,
): ImportEventBuffer {
  const fresh = buffer.filter((entry) => isFresh(entry, event.at));
  return [...fresh, event].slice(-MAX_BUFFERED_IMPORT_EVENTS);
}

/** The fresh events of one crawl, the end event last: job events may be buffered after it. */
export function takeImportEvents(
  buffer: ImportEventBuffer,
  crawlId: string,
  now: number,
): { rest: ImportEventBuffer; signals: ImportSignal[] } {
  const fresh = buffer.filter((entry) => isFresh(entry, now));
  const mine = fresh.filter((entry) => entry.crawlId === crawlId).map((entry) => entry.signal);
  const isEnd = (signal: ImportSignal) => signal.kind === "end";
  const signals = [...mine.filter((signal) => !isEnd(signal)), ...mine.filter(isEnd)];
  return { rest: fresh.filter((entry) => entry.crawlId !== crawlId), signals };
}

// Later than the stall time on purpose: the drawer first shows "stalled" with a retry.
export const IMPORT_EXPIRE_AFTER_MS = 2 * STALL_AFTER_MS;

/** Imports whose end event was lost (disconnect): finish them with what is known. */
export function expireImports(
  state: ImportState,
  now: number,
): { state: ImportState; results: ImportResult[] } {
  const results: ImportResult[] = [];
  const kept: Record<string, ImportEntry> = {};
  for (const [crawlId, entry] of Object.entries(state)) {
    if (now - entry.startedAt < IMPORT_EXPIRE_AFTER_MS) kept[crawlId] = entry;
    else results.push(importResult(entry, "completed"));
  }
  return { state: kept, results };
}

/** No end event yet after the stall time: the drawer offers a new attempt. */
export function isImportStalled(entry: ImportEntry, now: number): boolean {
  return now - entry.startedAt >= STALL_AFTER_MS;
}
