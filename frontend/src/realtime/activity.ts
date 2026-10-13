import type { CrawlJob } from "@/api/crawl";
import {
  isFinishEvent,
  type ActivityEvent,
  type EventOf,
  type FinishEvent,
  type ProgressEvent,
} from "./events";

export type ActivityStep = "starting" | "collecting" | "extracting" | "analysing";
export type ActivityOutcome = "completed" | "failed" | "cancelled";

export interface ActivityTask {
  id: string;
  source: string;
  /** The source this crawl belongs to; null for imports. */
  platformId: number | null;
  step: ActivityStep;
  done: number;
  total: number;
  /** When POST /platforms/{id}/crawl seeded it; absent for tasks the scraper or an event brought. */
  seededAt?: number;
}

export interface FinishedTask {
  id: string;
  source: string;
  /** The source this crawl belonged to; null for imports. */
  platformId: number | null;
  outcome: ActivityOutcome;
  finishedAt: number;
}

export interface ActivityState {
  running: readonly ActivityTask[];
  lastFinished: FinishedTask | null;
  /**
   * Crawl ids that received a terminal event. Analysis events can still arrive afterwards
   * (several workers publish concurrently); they must not bring a finished task back.
   */
  endedIds: readonly string[];
}

export const EMPTY_ACTIVITY: ActivityState = { running: [], lastFinished: null, endedIds: [] };

const FINISHED_CRAWL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const OUTCOME_BY_EVENT: Readonly<Record<FinishEvent["type"], ActivityOutcome>> = {
  crawl_job_completed: "completed",
  crawl_job_failed: "failed",
  crawl_job_cancelled: "cancelled",
};
/**
 * The scraper registers a crawl before it answers "Started", so a crawl-status answer without a
 * seeded crawl was computed before the start. Within this window such an answer keeps the seed.
 */
export const SEED_GRACE_MS = 10_000;
const MIN_VISIBLE_PERCENT = 5;
const FULL_PERCENT = 100;

type ProgressUpdaters = {
  [K in ProgressEvent["type"]]: (task: ActivityTask, event: EventOf<K>) => ActivityTask;
};

const PROGRESS_UPDATERS: ProgressUpdaters = {
  crawl_job_started: (task, event) => ({
    ...task,
    source: sourceLabel(event.platform),
    step: "starting",
    platformId: event.platform_id ?? task.platformId,
  }),
  crawl_job_progress: (task, event) => ({
    ...task,
    source: sourceLabel(event.platform),
    step: "collecting",
    done: event.scraping_completed ?? 0,
    total: event.total,
  }),
  crawl_job_extracting: (task, event) => ({
    ...task,
    step: "extracting",
    done: event.extracting_count,
    total: event.total,
  }),
  job_analysis_started: (task, event) => ({
    ...task,
    step: "analysing",
    done: event.analysis_completed,
  }),
  // jobs_saved excludes skipped jobs, so it must never move the bar backwards.
  job_analysis_finished: (task, event) => ({
    ...task,
    step: "analysing",
    done: Math.max(task.done, event.jobs_saved),
  }),
};

/** A platform URL's host; values that are not URLs (old bare hosts) are shown as they are. */
export function sourceLabel(platformUrl: string): string {
  try {
    return new URL(platformUrl).host;
  } catch {
    return platformUrl;
  }
}

/**
 * Seeds the state from GET /scraper/crawl-status after a load or reconnect. The scraper does not
 * report when a crawl ended, so the last finished task of `previous` is kept.
 */
export function activityFromCrawlJobs(
  jobs: readonly CrawlJob[],
  previous: ActivityState,
  now: number,
): ActivityState {
  const isEnded = (job: CrawlJob) =>
    FINISHED_CRAWL_STATUSES.has(job.status) || previous.endedIds.includes(job.job_id);
  // A stale status can still list a crawl whose end event already arrived; it stays ended.
  const listed = jobs.filter((job) => !isEnded(job)).map(taskFromCrawlJob);
  const running = [
    ...listed,
    ...recentSeeds(previous, new Set(jobs.map((job) => job.job_id)), now),
  ];
  // Keep what `previous` knew: a seed that lands after a reseed must not revive an ended crawl.
  const endedIds = [
    ...new Set([...previous.endedIds, ...jobs.filter(isEnded).map((job) => job.job_id)]),
  ];
  return { running, lastFinished: previous.lastFinished, endedIds };
}

/** Seeded crawls an older crawl-status answer cannot know yet (SEED_GRACE_MS). */
function recentSeeds(previous: ActivityState, listed: ReadonlySet<string>, now: number) {
  return previous.running.filter(
    (task) =>
      task.seededAt !== undefined &&
      now - task.seededAt < SEED_GRACE_MS &&
      !listed.has(task.id) &&
      !previous.endedIds.includes(task.id),
  );
}

/** Applies one crawl event; `now` is injected so the reducer stays pure. */
export function reduceActivity(
  state: ActivityState,
  event: ActivityEvent,
  now: number,
): ActivityState {
  if (isFinishEvent(event)) return finishTask(state, event, now);
  if (state.endedIds.includes(event.job_id)) return state;
  const previous = state.running.find((task) => task.id === event.job_id);
  return { ...state, running: upsertTask(state.running, progressTask(previous, event)) };
}

/** Bar width in percent; never below 5 so a task that just started still shows. */
export function progressPercent(task: ActivityTask): number {
  if (task.total <= 0) return MIN_VISIBLE_PERCENT;
  const percent = Math.round((task.done / task.total) * FULL_PERCENT);
  return Math.min(FULL_PERCENT, Math.max(MIN_VISIBLE_PERCENT, percent));
}

function taskFromCrawlJob(job: CrawlJob): ActivityTask {
  const step: ActivityStep = job.status === "starting" ? "starting" : "collecting";
  return {
    id: job.job_id,
    source: sourceLabel(job.platform),
    platformId: job.platform_id ?? null,
    step,
    done: job.scraping_completed,
    total: job.total,
  };
}

function progressTask(previous: ActivityTask | undefined, event: ProgressEvent): ActivityTask {
  const base: ActivityTask = previous ?? {
    id: event.job_id,
    source: "",
    platformId: null,
    step: "starting",
    done: 0,
    total: 0,
  };
  // TypeScript cannot correlate the updater with the event's own type; the mapped type guarantees it.
  const update = PROGRESS_UPDATERS[event.type] as (
    task: ActivityTask,
    event: ProgressEvent,
  ) => ActivityTask;
  return update(base, event);
}

function upsertTask(tasks: readonly ActivityTask[], next: ActivityTask): ActivityTask[] {
  const exists = tasks.some((task) => task.id === next.id);
  return exists ? tasks.map((task) => (task.id === next.id ? next : task)) : [...tasks, next];
}

function finishTask(state: ActivityState, event: FinishEvent, now: number): ActivityState {
  const finished = state.running.find((task) => task.id === event.job_id);
  const outcome = OUTCOME_BY_EVENT[event.type];
  return {
    running: state.running.filter((task) => task.id !== event.job_id),
    lastFinished: {
      id: event.job_id,
      source: finished?.source ?? "",
      platformId: finished?.platformId ?? null,
      outcome,
      finishedAt: now,
    },
    endedIds: state.endedIds.includes(event.job_id)
      ? state.endedIds
      : [...state.endedIds, event.job_id],
  };
}

export interface CrawlSeed {
  id: string;
  platformId: number;
  source: string;
}

/**
 * D4: the answer of POST /platforms/{id}/crawl shows the bar before the first event. A crawl that
 * already ended (a fast failure can beat the answer) stays ended.
 */
export function seedCrawlTask(state: ActivityState, seed: CrawlSeed, now: number): ActivityState {
  if (state.endedIds.includes(seed.id)) return state;
  const previous = state.running.find((task) => task.id === seed.id);
  const task: ActivityTask = previous
    ? { ...previous, platformId: seed.platformId }
    : { ...seed, step: "starting", done: 0, total: 0, seededAt: now };
  return { ...state, running: upsertTask(state.running, task) };
}
