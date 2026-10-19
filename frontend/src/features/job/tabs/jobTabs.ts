import { phaseIndex, type Phase } from "@/domain/jobStatus";

export const JOB_TABS = [
  "fit",
  "documents",
  "company",
  "interview",
  "history",
  "firstDay",
  "moveOn",
] as const;
export type JobTab = (typeof JOB_TABS)[number];
export type DimReason = "documents" | "interview";

export const TAB_QUERY_KEY = "tab";

// German words in the URL, like the rest of the product's addresses (spec 2.3: URL state).
const TAB_PARAM: Readonly<Record<JobTab, string>> = {
  fit: "passung",
  documents: "unterlagen",
  company: "firma",
  interview: "interview",
  history: "verlauf",
  firstDay: "erster-tag",
  moveOn: "wie-weiter",
};

/**
 * Feedback 1 T14: the outcome tabs exist only for their status. REJECTED covers an employer's
 * rejection, a withdrawal and a declined offer alike (decision D4), so "Wie geht's weiter" fits all.
 */
const OUTCOME_TAB: Readonly<Record<string, JobTab>> = {
  ACCEPTED: "firstDay",
  REJECTED: "moveOn",
};
const OUTCOME_TABS: ReadonlySet<JobTab> = new Set(Object.values(OUTCOME_TAB));

function outcomeTab(status: string): JobTab | null {
  return Object.hasOwn(OUTCOME_TAB, status) ? OUTCOME_TAB[status] : null;
}

/** The tabs a job with this (effective) status shows, in order. */
export function visibleTabs(status: string): readonly JobTab[] {
  const own = outcomeTab(status);
  return JOB_TABS.filter((tab) => !OUTCOME_TABS.has(tab) || tab === own);
}

const DEFAULT_TAB: Readonly<Record<Phase, JobTab>> = {
  OPEN: "fit",
  DRAFTED: "documents",
  APPLIED: "history",
  INTERVIEW: "interview",
  OFFER: "history",
  CLOSED: "history",
};

// Feedback 1 T13: a change to these statuses shows the tab that holds the new phase's work.
const TAB_AFTER_STATUS_CHANGE: Readonly<Record<string, JobTab>> = {
  APPLIED: "company",
  OFFER: "history",
  ...OUTCOME_TAB,
};

/** The tab to select after a successful change to `status`, or null to keep the current one. */
export function tabAfterStatusChange(status: string): JobTab | null {
  return Object.hasOwn(TAB_AFTER_STATUS_CHANGE, status) ? TAB_AFTER_STATUS_CHANGE[status] : null;
}

export function tabParam(tab: JobTab): string {
  return TAB_PARAM[tab];
}

export function tabFromParam(value: string | null): JobTab | null {
  return JOB_TABS.find((tab) => TAB_PARAM[tab] === value) ?? null;
}

/** Decision D12: the tab that holds the phase's work. */
export function defaultTab(phase: Phase): JobTab {
  return DEFAULT_TAB[phase];
}

/** A closed job opens on its outcome tab (T14), every other one on its phase's tab. */
export function defaultTabFor(status: string, phase: Phase): JobTab {
  return outcomeTab(status) ?? defaultTab(phase);
}

/** Prototype tabDim: tabs that make no sense yet show a hint first (closed jobs never dim). */
export function dimReason(tab: JobTab, phase: Phase): DimReason | null {
  if (tab === "documents" && phase === "OPEN") return "documents";
  const beforeInterview = phaseIndex(phase) < phaseIndex("INTERVIEW");
  return tab === "interview" && beforeInterview ? "interview" : null;
}
