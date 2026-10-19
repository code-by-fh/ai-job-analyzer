import type { CrawlProgress } from "@/api/crawlProgress";

/** The crawl pipeline's stages in order (backend core/crawl_progress.py). */
export const CRAWL_STAGES = [
  "queued",
  "collecting_links",
  "filtering_links",
  "fetching_pages",
  "analysing",
  "completed",
] as const;
export type CrawlStage = (typeof CRAWL_STAGES)[number];

export function isKnownStage(stage: string): stage is CrawlStage {
  return (CRAWL_STAGES as readonly string[]).includes(stage);
}

const COUNTERS = [
  "links_found",
  "links_matched",
  "links_new",
  "pages_fetched",
  "pages_failed",
  "jobs_analysed",
  "jobs_skipped",
  "work_done",
  "work_total",
] as const;

/**
 * Several workers publish for one crawl, so an older message can arrive after a newer one. Every
 * counter only grows during a crawl, so the larger value is the newer; a stage the web does not know
 * comes from the latest message.
 */
export function mergeProgress(
  previous: CrawlProgress | undefined,
  next: CrawlProgress | undefined,
): CrawlProgress | undefined {
  if (!previous || !next) return next ?? previous;
  const merged: CrawlProgress = { ...next, stage: laterStage(previous.stage, next.stage) };
  for (const counter of COUNTERS) merged[counter] = Math.max(previous[counter], next[counter]);
  return merged;
}

function laterStage(previous: string, next: string): string {
  if (!isKnownStage(previous) || !isKnownStage(next)) return next;
  return CRAWL_STAGES.indexOf(previous) > CRAWL_STAGES.indexOf(next) ? previous : next;
}

export type StationKey = "found" | "new" | "fetched" | "analysed";
export type StationState = "done" | "current" | "open";

export interface CrawlStation {
  key: StationKey;
  state: StationState;
  /** Null while the station's number is not known yet. */
  count: number | null;
}

/** The station each stage works on; completed works on none. */
const CURRENT_STATION: Readonly<Record<CrawlStage, number>> = {
  queued: 0,
  collecting_links: 0,
  filtering_links: 1,
  fetching_pages: 2,
  analysing: 3,
  completed: 4,
};

/** The counts of each station; the links found are known once they are filtered. */
function stationCounts(progress: CrawlProgress, current: number): (number | null)[] {
  const pagesKnown = current >= CURRENT_STATION.fetching_pages;
  return [
    current >= CURRENT_STATION.filtering_links ? progress.links_found : null,
    pagesKnown ? progress.links_new : null,
    pagesKnown ? progress.pages_fetched : null,
    pagesKnown ? progress.jobs_analysed : null,
  ];
}

const STATION_KEYS: readonly StationKey[] = ["found", "new", "fetched", "analysed"];

/** The timeline found -> new -> fetched -> analysed; null without progress or for an unknown stage. */
export function crawlStations(progress: CrawlProgress | undefined): CrawlStation[] | null {
  if (!progress || !isKnownStage(progress.stage)) return null;
  const current = CURRENT_STATION[progress.stage];
  const counts = stationCounts(progress, current);
  return STATION_KEYS.map((key, index) => ({
    key,
    state: index < current ? "done" : index === current ? "current" : "open",
    count: counts[index] ?? null,
  }));
}

/** Jobs the crawl saved: analysed jobs minus the postings that were already known. */
export function savedJobCount(progress: CrawlProgress): number {
  return Math.max(0, progress.jobs_analysed - progress.jobs_skipped);
}
