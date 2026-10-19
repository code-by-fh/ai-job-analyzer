import type { CrawlJob } from "@/api/crawl";
import type { CrawlProgress } from "@/api/crawlProgress";
import { mergeProgress } from "@/domain/crawlStages";
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
  /** The pipeline's real progress from the latest event or crawl-status; absent until the first one. */
  progress?: CrawlProgress;
  /** When POST /platforms/{id}/crawl seeded it; absent for tasks the scraper or an event brought. */
  seededAt?: number;
  /** The server's start (crawl-status, else the start event), epoch ms; absent until one arrives. */
  startedAt?: number;
}

export interface FinishedTask {
  id: string;
  source: string;
  /** The source this crawl belonged to; null for imports. */
  platformId: number | null;
  outcome: ActivityOutcome;
  finishedAt: number;
  /** The crawl's last known progress; absent for runs that never reported any. */
  progress?: CrawlProgress;
}

export interface ActivityState {
  running: readonly ActivityTask[];
  /** The runs that ended in this session, newest first, at most MAX_FINISHED. */
  finished: readonly FinishedTask[];
  /**
   * Crawl ids that received a terminal event. Analysis events can still arrive afterwards
   * (several workers publish concurrently); they must not bring a finished task back.
   */
  endedIds: readonly string[];
}

export const EMPTY_ACTIVITY: ActivityState = { running: [], finished: [], endedIds: [] };
export const MAX_FINISHED = 3;

/** The run that ended last, or null. */
export function latestFinished(state: ActivityState): FinishedTask | null {
  return state.finished[0] ?? null;
}

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
  crawl_job_started: (task, event) =>
    withStart(
      {
        ...task,
        source: sourceLabel(event.platform),
        step: "starting",
        platformId: event.platform_id ?? task.platformId,
      },
      task.startedAt ?? epochStamp(event.started_at),
    ),
  // Total 0: the start page's links are counted and being filtered, no page is collected yet.
  crawl_job_progress: (task, event) => ({
    ...task,
    source: sourceLabel(event.platform),
    step: event.total > 0 ? "collecting" : task.step,
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

/** A scraper stamp (epoch ms as a string) as a number; undefined when absent or unreadable. */
function epochStamp(raw: string | null | undefined): number | undefined {
  const value = Number(raw);
  return raw && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Sets the start only when one is known, so a task without one carries no startedAt key. */
function withStart(task: ActivityTask, startedAt: number | undefined): ActivityTask {
  return startedAt === undefined ? task : { ...task, startedAt };
}

/**
 * When the crawl started, for its elapsed time: the server's stamp, else the seed's own time
 * until the scraper lists the crawl; null when neither is known.
 */
export function taskStart(task: ActivityTask): number | null {
  return task.startedAt ?? task.seededAt ?? null;
}

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
 * report when a crawl ended, so the finished runs of `previous` are kept. Progress an event already
 * brought further than this answer is kept as well.
 */
export function activityFromCrawlJobs(
  jobs: readonly CrawlJob[],
  previous: ActivityState,
  now: number,
): ActivityState {
  const isEnded = (job: CrawlJob) =>
    FINISHED_CRAWL_STATUSES.has(job.status) || previous.endedIds.includes(job.job_id);
  // A stale status can still list a crawl whose end event already arrived; it stays ended.
  const listed = jobs
    .filter((job) => !isEnded(job))
    .map((job) => taskFromCrawlJob(job, knownTask(previous, job.job_id)));
  const running = [
    ...listed,
    ...recentSeeds(previous, new Set(jobs.map((job) => job.job_id)), now),
  ];
  // Keep what `previous` knew: a seed that lands after a reseed must not revive an ended crawl.
  const endedIds = [
    ...new Set([...previous.endedIds, ...jobs.filter(isEnded).map((job) => job.job_id)]),
  ];
  return { running, finished: previous.finished, endedIds };
}

function knownTask(state: ActivityState, id: string): ActivityTask | undefined {
  return state.running.find((task) => task.id === id);
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

/**
 * Bar width in percent of the crawl's work (fetch and analyse every new link), so finding all links
 * is not 100 %; never below 5 so a task that just started still shows.
 */
export function progressPercent(task: ActivityTask): number {
  const workTotal = task.progress?.work_total ?? 0;
  if (workTotal <= 0) return MIN_VISIBLE_PERCENT;
  const percent = Math.round(((task.progress?.work_done ?? 0) / workTotal) * FULL_PERCENT);
  return Math.min(FULL_PERCENT, Math.max(MIN_VISIBLE_PERCENT, percent));
}

/** The percentage for display: null until the crawl knows its work, so a start does not read "5 %". */
export function measuredPercent(task: ActivityTask): number | null {
  return (task.progress?.work_total ?? 0) > 0 ? progressPercent(task) : null;
}

function taskFromCrawlJob(job: CrawlJob, known: ActivityTask | undefined): ActivityTask {
  const step: ActivityStep = job.status === "starting" ? "starting" : "collecting";
  return withStart(
    {
      id: job.job_id,
      source: sourceLabel(job.platform),
      platformId: job.platform_id ?? null,
      step,
      done: job.scraping_completed,
      total: job.total,
      progress: mergeProgress(known?.progress, job.progress),
    },
    // The hash keeps the queue time across reloads, so it replaces what an event or a seed brought.
    epochStamp(job.started_at) ?? known?.startedAt,
  );
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
  return { ...update(base, event), progress: mergeProgress(base.progress, event.progress) };
}

function upsertTask(tasks: readonly ActivityTask[], next: ActivityTask): ActivityTask[] {
  const exists = tasks.some((task) => task.id === next.id);
  return exists ? tasks.map((task) => (task.id === next.id ? next : task)) : [...tasks, next];
}

function finishTask(state: ActivityState, event: FinishEvent, now: number): ActivityState {
  const entry = finishedEntry(
    state.running.find((task) => task.id === event.job_id),
    event,
    now,
  );
  return {
    running: state.running.filter((task) => task.id !== event.job_id),
    finished: [entry, ...state.finished].slice(0, MAX_FINISHED),
    endedIds: state.endedIds.includes(event.job_id)
      ? state.endedIds
      : [...state.endedIds, event.job_id],
  };
}

/** Only crawl_job_completed carries progress; a failure or cancel keeps what the task knew. */
function finishedEntry(
  task: ActivityTask | undefined,
  event: FinishEvent,
  now: number,
): FinishedTask {
  const entry: FinishedTask = {
    id: event.job_id,
    source: task?.source ?? "",
    platformId: task?.platformId ?? null,
    outcome: OUTCOME_BY_EVENT[event.type],
    finishedAt: now,
  };
  const eventProgress = "progress" in event ? event.progress : undefined;
  const progress = mergeProgress(task?.progress, eventProgress);
  return progress ? { ...entry, progress } : entry;
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
