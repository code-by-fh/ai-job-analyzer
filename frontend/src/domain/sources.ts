import type { Platform } from "@/api/platforms";
import { isFailedRun, runErrorCode } from "./runLine";

const SOURCES_PATH = "/sources";
export const SOURCE_PARAM = "quelle";
export const ADD_PARAM = "add";
const ADD_VALUE = "1";
const POSITIVE_INT = /^[1-9]\d*$/;

export interface SourcesLocation {
  sourceId?: number | null;
  add?: boolean;
}

/** D1: one overlay at a time; the wizard wins over a drawer. */
export function sourcesHref({ sourceId, add }: SourcesLocation = {}): string {
  const params = new URLSearchParams();
  if (add) params.set(ADD_PARAM, ADD_VALUE);
  else if (sourceId) params.set(SOURCE_PARAM, String(sourceId));
  const query = params.toString();
  return query ? `${SOURCES_PATH}?${query}` : SOURCES_PATH;
}

export function sourceIdFromParam(value: string | null): number | null {
  return value && POSITIVE_INT.test(value) ? Number(value) : null;
}

export function addFromParam(value: string | null): boolean {
  return value === ADD_VALUE;
}

export type SourceState = "running" | "setup" | "paused" | "failing" | "ok";
/** Legacy rows from the old wizard (D15); the server refuses to crawl them. */
export const PENDING_SETUP = "pending_setup";

/**
 * D3: a source the user switched off ("Pausiert") or whose setup never finished ("Nicht
 * eingerichtet") is never listed as failing (banner, deck, nav badge), so no list contradicts its tag.
 */
export function isFailingSource(
  platform: Pick<Platform, "is_active" | "setup_status" | "last_run">,
): boolean {
  if (!platform.is_active || platform.setup_status === PENDING_SETUP) return false;
  return isFailedRun(runErrorCode(platform.last_run?.error));
}

/** D15, in priority order. */
export function sourceState(platform: Platform, running: boolean): SourceState {
  if (running) return "running";
  if (platform.setup_status === PENDING_SETUP) return "setup";
  if (!platform.is_active) return "paused";
  return isFailingSource(platform) ? "failing" : "ok";
}

export function canCrawl(state: SourceState): boolean {
  return state === "ok" || state === "failing";
}

// A fixed collation, so the order does not depend on the runtime's default locale.
const SORT_LOCALE = "de";
const SORT_OPTIONS: Intl.CollatorOptions = { sensitivity: "base" };

export function sortSources<P extends Pick<Platform, "id" | "name">>(platforms: readonly P[]): P[] {
  return [...platforms].sort(
    (a, b) => a.name.localeCompare(b.name, SORT_LOCALE, SORT_OPTIONS) || a.id - b.id,
  );
}

/** D9: the row that follows `id` in list order, where focus goes once that source is deleted. */
export function nextSourceId(
  platforms: readonly Pick<Platform, "id" | "name">[],
  id: number,
): number | null {
  const sorted = sortSources(platforms);
  const index = sorted.findIndex((platform) => platform.id === id);
  return index < 0 ? null : (sorted[index + 1]?.id ?? null);
}

/** D3: the banner list; the nav badge counts the same rule (countFailingPlatforms). */
export function failingSources(platforms: readonly Platform[]): Platform[] {
  return sortSources(platforms.filter(isFailingSource));
}

/** Consecutive weekdays as [first, last]: Mo-Fr -> [[0, 4]]. */
export function dayRuns(days: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const day of [...days].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

export interface LinkLike {
  url: string;
  text: string;
}

const MIN_GROUP = 2;
const DEEP_PATH = 3;
const GROUP_DEPTH = 2;
const SLUG_DELIMITER = /[-_.]/;
const ROOT = "/";

function parsed(url: string): URL | null {
  return URL.canParse(url) ? new URL(url) : null;
}

function segmentsOf(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

/** Links of one kind share their first path segments ("/jobsuche/p") or, for slugs, the first word. */
function groupKey(url: URL): string {
  if (url.search) return url.pathname;
  const segments = segmentsOf(url);
  if (segments.length <= 1) return `/${(segments[0] ?? "").split(SLUG_DELIMITER)[0]}`;
  return `/${segments.slice(0, Math.min(GROUP_DEPTH, segments.length - 1)).join("/")}`;
}

function groupLinks(links: readonly LinkLike[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const link of links) {
    const url = parsed(link.url);
    const key = url ? groupKey(url) : ROOT;
    if (key !== ROOT) groups.set(key, [...(groups.get(key) ?? []), link.url]);
  }
  return [...groups.values()];
}

function pathDepth(url: string): number {
  const link = parsed(url);
  return link ? segmentsOf(link).length : 0;
}

/** D10 step 2 preselection (the old wizard's heuristic, inventory C.2). */
export function suggestJobLinks(links: readonly LinkLike[]): string[] {
  const largest = groupLinks(links).reduce<string[]>(
    (best, group) => (group.length > best.length ? group : best),
    [],
  );
  if (largest.length >= MIN_GROUP) return largest;
  return links.filter((link) => pathDepth(link.url) >= DEEP_PATH).map((link) => link.url);
}

/** The crawl filter's own test (`pattern in url`); an empty pattern matches nothing here. */
export function matchingCount(links: readonly LinkLike[], pattern: string): number {
  const text = pattern.trim();
  return text ? links.filter((link) => link.url.includes(text)).length : 0;
}

export function linkPath(url: string): string {
  const link = parsed(url);
  return link ? `${link.pathname}${link.search}` : url;
}

export const MAX_NAME_LENGTH = 100;

/** The server's name rule (core/platform_rules.py): 1 to 100 characters after trimming. */
export function isName(text: string): boolean {
  const name = text.trim();
  return name !== "" && name.length <= MAX_NAME_LENGTH;
}

const SOURCE_FIELDS = [
  "url",
  "selected_urls",
  "url_pattern",
  "name",
  "schedule_time",
  "schedule_days",
] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];
export type WizardStep = 1 | 2 | 3;

/** For fieldErrorsFrom: server field names of a 422 that a sources form shows. */
export function toSourceField(serverField: string): SourceField | null {
  return (SOURCE_FIELDS as readonly string[]).includes(serverField)
    ? (serverField as SourceField)
    : null;
}

const WIZARD_STEP_OF: Readonly<Record<SourceField, WizardStep>> = {
  url: 1,
  selected_urls: 2,
  url_pattern: 2,
  name: 3,
  schedule_time: 3,
  schedule_days: 3,
};

/** D10: a rejected setup jumps to the earliest step that holds a field error. */
export function firstErrorStep(fields: readonly SourceField[]): WizardStep | null {
  const steps = fields.map((field) => WIZARD_STEP_OF[field]);
  return steps.length > 0 ? (Math.min(...steps) as WizardStep) : null;
}

const RECIPIENT_SEPARATOR = /[,;\s]+/;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseRecipients(text: string): { list: string[]; invalid: boolean } {
  const list = text.split(RECIPIENT_SEPARATOR).filter(Boolean);
  return { list, invalid: list.some((address) => !EMAIL.test(address)) };
}

export const DEFAULT_TEMPLATE = "default";
export const CUSTOM_TEMPLATE = "custom";

/** D7: the platform stores template content; this names which choice the select shows for it. */
export function templateChoice(
  content: string | null | undefined,
  templates: readonly { id: number; content: string }[],
): string {
  if (!content) return DEFAULT_TEMPLATE;
  const match = templates.find((template) => template.content === content);
  return match ? String(match.id) : CUSTOM_TEMPLATE;
}
