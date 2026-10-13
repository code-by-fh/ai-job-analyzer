import type { Platform } from "@/api/platforms";
import type { MessageKey } from "@/i18n/de";
import { parseApiDate } from "./calendar";

const RUN_ERROR_CODES = ["cancelled", "unreachable", "failed"] as const;
export type RunErrorCode = (typeof RUN_ERROR_CODES)[number] | "unknown";

export interface LastRun {
  source: string;
  finishedAt: Date;
  found: number;
  matched: number;
  below: number;
  error: RunErrorCode | null;
  seeded: boolean;
}

export type RunSummary = Omit<LastRun, "source">;

interface RunLike {
  finished_at?: string | null;
  found?: number | null;
  new?: number | null;
  matched?: number | null;
  seeded?: boolean | null;
  error?: string | null;
}

/** last_run.error is a fixed server code; anything else (older free text) is shown neutrally. */
export function runErrorCode(raw?: string | null): RunErrorCode | null {
  if (!raw) return null;
  return (RUN_ERROR_CODES as readonly string[]).includes(raw) ? (raw as RunErrorCode) : "unknown";
}

// last_run.error is a fixed server code; it is never shown as raw text.
export const RUN_ERROR_LABEL: Readonly<Record<RunErrorCode, MessageKey>> = {
  cancelled: "run.error.cancelled",
  unreachable: "run.error.unreachable",
  failed: "run.error.failed",
  unknown: "run.error.unknown",
};

/** D3: the user's own cancel is not a failure. */
export function isFailedRun(code: RunErrorCode | null): code is Exclude<RunErrorCode, "cancelled"> {
  return code !== null && code !== "cancelled";
}

/** The most recently finished crawl over all sources, for the inbox run line (D11). */
export function latestRun(platforms: readonly Platform[]): LastRun | null {
  return platforms
    .flatMap(toLastRun)
    .reduce<LastRun | null>(
      (latest, run) => (latest && latest.finishedAt >= run.finishedAt ? latest : run),
      null,
    );
}

function toLastRun(platform: Platform): LastRun[] {
  const run = lastRunOf(platform);
  return run ? [run] : [];
}

export function lastRunOf(platform: Platform): LastRun | null {
  const summary = summarizeRun(platform.last_run);
  return summary ? { source: platform.name, ...summary } : null;
}

/** Reads `platform.last_run` and a history entry alike; null without a parseable finish time. */
export function summarizeRun(run?: RunLike | null): RunSummary | null {
  const finishedAt = run?.finished_at ? parseApiDate(run.finished_at) : null;
  if (!run || !finishedAt || Number.isNaN(finishedAt.getTime())) return null;
  const matched = run.matched ?? 0;
  const seeded = run.seeded === true;
  // "new" counts every saved job, matched or hidden by the threshold.
  // G5: a seed run saved unanalysed jobs; none of them is below the threshold yet.
  const below = seeded ? 0 : Math.max(0, (run.new ?? 0) - matched);
  const error = runErrorCode(run.error);
  return { finishedAt, found: run.found ?? 0, matched, below, error, seeded };
}
