import { phaseIndex, type Phase } from "@/domain/jobStatus";

export const JOB_TABS = ["fit", "documents", "company", "interview", "history"] as const;
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
};

const DEFAULT_TAB: Readonly<Record<Phase, JobTab>> = {
  OPEN: "fit",
  DRAFTED: "documents",
  APPLIED: "history",
  INTERVIEW: "interview",
  OFFER: "history",
  CLOSED: "history",
};

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

/** Prototype tabDim: tabs that make no sense yet show a hint first (closed jobs never dim). */
export function dimReason(tab: JobTab, phase: Phase): DimReason | null {
  if (tab === "documents" && phase === "OPEN") return "documents";
  const beforeInterview = phaseIndex(phase) < phaseIndex("INTERVIEW");
  return tab === "interview" && beforeInterview ? "interview" : null;
}
