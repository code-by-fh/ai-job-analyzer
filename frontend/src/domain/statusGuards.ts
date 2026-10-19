import type { DocumentKind } from "@/api/jobDocuments";
import { missingDocuments, type DocumentPresence } from "./documents";
import {
  allowedTargets,
  PHASE_TARGET_STATUS,
  PHASES,
  phaseIndex,
  phaseOf,
  STATUS_GENERATING,
  type Phase,
  type StatusSource,
  type UserStatus,
} from "./jobStatus";

/** "Phase ändern" offers no way back to the inbox (usability #5 and #17). */
export const MENU_TARGETS = ["DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "CLOSED"] as const;
export type MenuTarget = (typeof MENU_TARGETS)[number];

export type StatusGuard =
  | { kind: "direct"; to: UserStatus }
  | { kind: "confirmBackward"; to: UserStatus }
  | { kind: "confirmSkip"; to: UserStatus; skipped: readonly Phase[] }
  | {
      kind: "applyWithoutDocuments";
      to: UserStatus;
      missing: readonly DocumentKind[];
      skipped: readonly Phase[];
    }
  | { kind: "askInterviewDate"; to: UserStatus }
  | { kind: "askOutcome" }
  | { kind: "blocked"; reason: "locked" | "unavailable" | "current" };

export interface GuardInput extends StatusSource {
  documents: DocumentPresence;
}

export type OutcomeKey = "accepted" | "rejected" | "withdrawn";
export interface Outcome {
  key: OutcomeKey;
  to: UserStatus;
}
// The backend has no WITHDRAWN: "Selbst abgesagt" is REJECTED plus a history note (decision D4).
export const OUTCOMES: readonly Outcome[] = [
  { key: "accepted", to: "ACCEPTED" },
  { key: "rejected", to: "REJECTED" },
  { key: "withdrawn", to: "REJECTED" },
];

const APPLIED_INDEX = phaseIndex("APPLIED");
const DRAFTED_INDEX = phaseIndex("DRAFTED");
const NEXT_PHASE = 1;

/** Which confirmation, warning or question a phase change needs (spec 4.2, usability #5/#6). */
export function guardFor(input: GuardInput, target: MenuTarget): StatusGuard {
  if (allowedTargets(input.status).length === 0) {
    return {
      kind: "blocked",
      reason: input.status === STATUS_GENERATING ? "locked" : "unavailable",
    };
  }
  if (target === "CLOSED") return { kind: "askOutcome" };
  const to = PHASE_TARGET_STATUS[target];
  if (to === input.status) return { kind: "blocked", reason: "current" };
  return forwardOrBackward(input, to, target);
}

function forwardOrBackward(input: GuardInput, to: UserStatus, target: Phase): StatusGuard {
  const from = phaseIndex(phaseOf(input));
  const goal = phaseIndex(target);
  if (goal < from) return { kind: "confirmBackward", to };
  const missing = missingDocuments(input.documents);
  const skipped = PHASES.slice(from + 1, goal);
  if (goal >= APPLIED_INDEX && from <= DRAFTED_INDEX && missing.length > 0) {
    return { kind: "applyWithoutDocuments", to, missing, skipped };
  }
  if (goal - from > NEXT_PHASE) return { kind: "confirmSkip", to, skipped };
  // Feedback 1 T13: the next step into Interview offers the (optional) interview date.
  if (target === "INTERVIEW") return { kind: "askInterviewDate", to };
  return { kind: "direct", to };
}
