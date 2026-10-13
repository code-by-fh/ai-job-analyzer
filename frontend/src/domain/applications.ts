import type { JobListItem } from "@/api/jobList";
import { calendarDaysBetween, isApiDate, parseApiDate } from "./calendar";
import { documentPresence } from "./documents";
import { isGenerating, phaseOf, type Phase } from "./jobStatus";
import { isDue, isWarning, nextStep, type NextStep } from "./nextStep";

const APPLICATIONS_PATH = "/applications";
export const SEARCH_QUERY_KEY = "q";
export const PHASE_QUERY_KEY = "phase";
export const CLOSED_QUERY_KEY = "abgeschlossen";
const CLOSED_OPEN_VALUE = "1";
/** Same cap as MAX_SEARCH_LENGTH in server/routers/jobs.py (longer input answers 422). */
export const MAX_SEARCH_LENGTH = 200;
/** Decision D4: one tick per application up to this many, then "+n". */
export const STRIP_TICK_MAX = 24;

const ACTIVE_PHASES = ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER"] as const;
export type ActivePhase = (typeof ACTIVE_PHASES)[number];
export type PhaseFilter = ActivePhase | "CLOSED";
export const PHASE_FILTERS: readonly PhaseFilter[] = [...ACTIVE_PHASES, "CLOSED"];

// Decision D1: German URL values like the inbox (?tab=unter) and the prototype (?abgeschlossen=1).
const PHASE_PARAM: Readonly<Record<PhaseFilter, string>> = {
  DRAFTED: "vorgemerkt",
  APPLIED: "beworben",
  INTERVIEW: "interview",
  OFFER: "angebot",
  CLOSED: "abgeschlossen",
};

export function phaseFilterFromParam(value: string | null): PhaseFilter | null {
  return PHASE_FILTERS.find((filter) => PHASE_PARAM[filter] === value) ?? null;
}

/** Trimmed and capped by code points like the server; spaces alone are no search. */
export function searchFromParam(value: string | null | undefined): string {
  return Array.from((value ?? "").trim())
    .slice(0, MAX_SEARCH_LENGTH)
    .join("")
    .trim();
}

export function closedOpenFromParam(value: string | null): boolean {
  return value === CLOSED_OPEN_VALUE;
}

export interface ApplicationsLocation {
  q?: string;
  phase?: PhaseFilter | null;
  closedOpen?: boolean;
}

/** Defaults are never written, so a plain /applications is the unfiltered view. */
export function applicationsHref({ q, phase, closedOpen }: ApplicationsLocation): string {
  const params = new URLSearchParams();
  const search = searchFromParam(q);
  if (search) params.set(SEARCH_QUERY_KEY, search);
  if (phase) params.set(PHASE_QUERY_KEY, PHASE_PARAM[phase]);
  if (closedOpen) params.set(CLOSED_QUERY_KEY, CLOSED_OPEN_VALUE);
  const query = params.toString();
  return query ? `${APPLICATIONS_PATH}?${query}` : APPLICATIONS_PATH;
}

export type DocState = "both" | "cvOnly" | "letterOnly" | "running" | "none";

/** Decision D9: the list's presence flags through the job page's rule, so both tell the same. */
export function docState(item: JobListItem): DocState {
  if (isGenerating(item)) return "running";
  const presence = documentPresence(item);
  if (presence.cv && presence.cover_letter) return "both";
  if (presence.cv) return "cvOnly";
  return presence.cover_letter ? "letterOnly" : "none";
}

type DueKind = "interview" | "interviewSoon" | "answerBy" | "overdue" | "dueSoon";

export type RowWhen =
  | { kind: DueKind; iso: string; warn: boolean }
  | { kind: "since"; iso: string; today: boolean }
  | { kind: "none" };

/** The last user status change ("since"), else the found date; null without a readable date. */
export function sinceOf(
  item: Pick<JobListItem, "status_changed_at" | "created_at">,
): string | null {
  for (const iso of [item.status_changed_at, item.created_at]) {
    if (iso && isApiDate(iso)) return iso;
  }
  return null;
}

function dueKind(step: NextStep): DueKind | null {
  if (!step.due) return null;
  // Q4: inside the due window the relative date, like the inbox due card; a past one keeps its date.
  if (step.dateField === "interview_at") {
    return step.dueSoon && !step.overdue ? "interviewSoon" : "interview";
  }
  if (step.kind === "decideOffer") return "answerBy";
  if (step.overdue) return "overdue";
  return isDue(step) ? "dueSoon" : null;
}

function sinceWhen(item: JobListItem, now: Date): RowWhen {
  const iso = sinceOf(item);
  if (!iso) return { kind: "none" };
  return { kind: "since", iso, today: calendarDaysBetween(parseApiDate(iso), now) <= 0 };
}

/** Decision D8 "Seit / Fällig": the step's own date when it has one worth showing, else "since". */
export function rowWhen(item: JobListItem, step: NextStep, now: Date): RowWhen {
  const kind = dueKind(step);
  if (kind && step.due) return { kind, iso: step.due.toISOString(), warn: isWarning(step) };
  return sinceWhen(item, now);
}

export interface ApplicationRow {
  item: JobListItem;
  step: NextStep;
  when: RowWhen;
  docs: DocState;
}

export type PhaseGroups = Readonly<Record<ActivePhase, readonly ApplicationRow[]>>;

export function buildRow(item: JobListItem, now: Date): ApplicationRow {
  const step = nextStep(item, now);
  return { item, step, when: rowWhen(item, step, now), docs: docState(item) };
}

function isActivePhase(phase: Phase): phase is ActivePhase {
  return (ACTIVE_PHASES as readonly string[]).includes(phase);
}

// Finite, so two undated rows differ by 0 (not Infinity - Infinity = NaN) and fall to the id.
const UNDATED_SORT_TIME = Number.MAX_SAFE_INTEGER;

function sortTime(row: ApplicationRow): number {
  if (isDue(row.step) && row.step.due) return row.step.due.getTime();
  const since = sinceOf(row.item);
  return since ? parseApiDate(since).getTime() : UNDATED_SORT_TIME;
}

/** Decision D5: due rows first (earliest due on top), then the longest waiting; the id keeps it stable. */
function compareRows(first: ApplicationRow, second: ApplicationRow): number {
  const rank = Number(!isDue(first.step)) - Number(!isDue(second.step));
  return rank || sortTime(first) - sortTime(second) || first.item.id.localeCompare(second.item.id);
}

function emptyGroups(): Record<ActivePhase, ApplicationRow[]> {
  return { DRAFTED: [], APPLIED: [], INTERVIEW: [], OFFER: [] };
}

/** Gap G4: the server cannot filter by the effective phase, so one active list is grouped here. */
export function groupByPhase(items: readonly JobListItem[], now: Date): PhaseGroups {
  const groups = emptyGroups();
  for (const item of items) {
    const phase = phaseOf(item);
    if (isActivePhase(phase)) groups[phase].push(buildRow(item, now));
  }
  for (const phase of ACTIVE_PHASES) groups[phase].sort(compareRows);
  return groups;
}

function closedTime(item: JobListItem): number {
  const iso = sinceOf(item);
  return iso ? parseApiDate(iso).getTime() : 0;
}

function byClosedTimeDesc(first: JobListItem, second: JobListItem): number {
  return closedTime(second) - closedTime(first) || first.id.localeCompare(second.id);
}

export function sortClosed(items: readonly JobListItem[]): JobListItem[] {
  return [...items].sort(byClosedTimeDesc);
}

export function visiblePhases(groups: PhaseGroups, filter: PhaseFilter | null): ActivePhase[] {
  if (filter === "CLOSED") return [];
  if (filter) return [filter];
  return ACTIVE_PHASES.filter((phase) => groups[phase].length > 0);
}

export type EmptyKind = "noApplications" | "noMatch" | "phaseEmpty";

export interface EmptyInput {
  q: string;
  phase: PhaseFilter | null;
  /** Rows of the filtered phase. */
  shown: number;
  /** Active plus closed applications for the current search. */
  total: number;
}

/** Decisions D11 and RB14: no applications at all is the first run, whatever phase the URL names. */
export function emptyKind({ q, phase, shown, total }: EmptyInput): EmptyKind | null {
  if (total === 0 && !q) return "noApplications";
  // R10: a search that finds nothing in the shown phase is a search result, whatever the phase.
  if (phase) return shown === 0 ? (q ? "noMatch" : "phaseEmpty") : null;
  if (total > 0) return null;
  return "noMatch";
}

export function stripCounts(groups: PhaseGroups, closed: number): Record<PhaseFilter, number> {
  return {
    DRAFTED: groups.DRAFTED.length,
    APPLIED: groups.APPLIED.length,
    INTERVIEW: groups.INTERVIEW.length,
    OFFER: groups.OFFER.length,
    CLOSED: closed,
  };
}

export function tickCount(count: number): { ticks: number; more: number } {
  const ticks = Math.min(count, STRIP_TICK_MAX);
  return { ticks, more: count - ticks };
}
