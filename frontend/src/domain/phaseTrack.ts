import { parseApiDate } from "./calendar";
import { PHASES, phaseIndex, phaseOfStatus, type Phase } from "./jobStatus";

export type TrackState = "past" | "current" | "future" | "skipped" | "unreached" | "closed";

export interface TrackStep {
  phase: Phase;
  state: TrackState;
  /** ISO time of the latest arrival in this phase, from the status history. */
  reachedAt: string | null;
}

export interface TrackHistoryEntry {
  to_status: string;
  changed_at?: string | null;
}

/** Read-only phase track: done, now, later, and phases that were jumped over (usability #6). */
export function phaseTrack(current: Phase, history: readonly TrackHistoryEntry[]): TrackStep[] {
  return PHASES.map((phase) => ({
    phase,
    state: stepState(phase, current, history),
    reachedAt: latestArrival(phase, history),
  }));
}

function stepState(
  phase: Phase,
  current: Phase,
  history: readonly TrackHistoryEntry[],
): TrackState {
  const offset = phaseIndex(phase) - phaseIndex(current);
  if (offset > 0) return "future";
  if (offset === 0) return phase === "CLOSED" ? "closed" : "current";
  if (wasVisited(phase, history)) return "past";
  return jumpedOver(phase, current, history) ? "skipped" : "unreached";
}

// Every job starts as a match without a history row, so the first phase is always done.
function wasVisited(phase: Phase, history: readonly TrackHistoryEntry[]): boolean {
  return phase === "OPEN" || history.some((entry) => phaseOfStatus(entry.to_status) === phase);
}

/** An unvisited phase counts as skipped only when a later, non-closing phase was reached. */
function jumpedOver(phase: Phase, current: Phase, history: readonly TrackHistoryEntry[]): boolean {
  if (current !== "CLOSED") return true;
  return PHASES.slice(phaseIndex(phase) + 1, phaseIndex(current)).some((later) =>
    wasVisited(later, history),
  );
}

function hasTime(entry: TrackHistoryEntry): entry is TrackHistoryEntry & { changed_at: string } {
  return Boolean(entry.changed_at);
}

function latestArrival(phase: Phase, history: readonly TrackHistoryEntry[]): string | null {
  const times = history
    .filter((entry) => phaseOfStatus(entry.to_status) === phase)
    .filter(hasTime)
    .map((entry) => entry.changed_at);
  if (times.length === 0) return null;
  return times.reduce((latest, time) =>
    parseApiDate(time) > parseApiDate(latest) ? time : latest,
  );
}
