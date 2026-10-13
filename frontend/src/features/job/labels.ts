import type { DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { phaseOf, type Phase, type StatusSource } from "@/domain/jobStatus";
import type { OutcomeKey } from "@/domain/statusGuards";
import type { MessageKey } from "@/i18n/de";

export const PHASE_LABEL: Readonly<Record<Phase, MessageKey>> = {
  OPEN: "phase.OPEN",
  DRAFTED: "phase.DRAFTED",
  APPLIED: "phase.APPLIED",
  INTERVIEW: "phase.INTERVIEW",
  OFFER: "phase.OFFER",
  CLOSED: "phase.CLOSED",
};

export const OUTCOME_LABEL: Readonly<Record<OutcomeKey, MessageKey>> = {
  accepted: "outcome.accepted",
  rejected: "outcome.rejected",
  withdrawn: "outcome.withdrawn",
};

export const DOCUMENT_LABEL: Readonly<Record<DocumentKind, MessageKey>> = {
  cv: "doc.cv",
  cover_letter: "doc.cover_letter",
};

const STATUS_LABEL: Readonly<Record<string, MessageKey>> = {
  OPEN: "phase.OPEN",
  DRAFTED: "phase.DRAFTED",
  APPLIED: "phase.APPLIED",
  INTERVIEW: "phase.INTERVIEW",
  OFFER: "phase.OFFER",
  ACCEPTED: "outcome.accepted",
  // REJECTED also records a declined offer and "Selbst abgesagt" (D4), so its label is neutral.
  REJECTED: "status.REJECTED",
  GENERATING: "status.GENERATING",
  FAILED: "status.FAILED",
  SEEN: "status.SEEN",
};

/** Label of a raw status, e.g. in the history timeline. */
export function statusLabel(status: string): MessageKey {
  return Object.hasOwn(STATUS_LABEL, status) ? STATUS_LABEL[status] : "status.unknown";
}

/** The phase name, except that a closed job shows its outcome (prototype renderStepper). */
export function currentPhaseLabel(job: StatusSource): MessageKey {
  const phase = phaseOf(job);
  return phase === "CLOSED" ? statusLabel(job.status) : PHASE_LABEL[phase];
}

/** After an offer the reminder date is the answer deadline (decision D5). */
export function followUpLabel(job: JobDetail): MessageKey {
  return phaseOf(job) === "OFFER" ? "dates.OFFER" : "dates.followUp";
}
