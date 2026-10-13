export const USER_STATUSES = [
  "OPEN",
  "DRAFTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STATUS_DRAFTED = "DRAFTED";
export const STATUS_GENERATING = "GENERATING";
export const STATUS_FAILED = "FAILED";

const ADVANCED_STATUSES: ReadonlySet<string> = new Set([
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]);
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["ACCEPTED", "REJECTED"]);

const allExcept = (status: UserStatus): readonly UserStatus[] =>
  USER_STATUSES.filter((candidate) => candidate !== status);

/**
 * Mirror of server/core/job_status.py::ALLOWED_TRANSITIONS: permissive, backward moves and
 * skips are allowed and the UI asks instead; GENERATING and SEEN cannot be left by hand.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly UserStatus[]>> = {
  OPEN: allExcept("OPEN"),
  DRAFTED: allExcept("DRAFTED"),
  APPLIED: allExcept("APPLIED"),
  INTERVIEW: allExcept("INTERVIEW"),
  OFFER: allExcept("OFFER"),
  ACCEPTED: allExcept("ACCEPTED"),
  REJECTED: allExcept("REJECTED"),
  FAILED: USER_STATUSES,
  GENERATING: [],
  SEEN: [],
};

export function isUserStatus(value: string): value is UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value);
}

/** A status outside the table (legacy free text) may move to any user status, as on the server. */
export function allowedTargets(current: string): readonly UserStatus[] {
  return Object.hasOwn(ALLOWED_TRANSITIONS, current) ? ALLOWED_TRANSITIONS[current] : USER_STATUSES;
}

export function canTransition(current: string, target: string): boolean {
  return isUserStatus(target) && allowedTargets(current).includes(target);
}

export const PHASES = ["OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "CLOSED"] as const;
export type Phase = (typeof PHASES)[number];

const PHASE_OF_STATUS: Readonly<Record<string, Phase>> = {
  OPEN: "OPEN",
  SEEN: "OPEN",
  DRAFTED: "DRAFTED",
  FAILED: "DRAFTED",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  ACCEPTED: "CLOSED",
  REJECTED: "CLOSED",
};

/** Phase-menu targets other than "Abgeschlossen" map to exactly one status. */
export const PHASE_TARGET_STATUS = {
  DRAFTED: "DRAFTED",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
} as const satisfies Record<string, UserStatus>;

export interface StatusSource {
  status: string;
  pre_generation_status?: string | null;
}

export function isGenerating(job: StatusSource): boolean {
  return job.status === STATUS_GENERATING;
}

/**
 * The status that decides phase and next step. A generation for an application that is already
 * out keeps that phase (server rule status_after_generation); an earlier one counts as Vorgemerkt.
 */
export function effectiveStatus(job: StatusSource): string {
  if (!isGenerating(job)) return job.status;
  const remembered = job.pre_generation_status ?? "";
  return ADVANCED_STATUSES.has(remembered) ? remembered : STATUS_DRAFTED;
}

export function phaseOf(job: StatusSource): Phase {
  return phaseOfStatus(effectiveStatus(job));
}

export function phaseOfStatus(status: string): Phase {
  return Object.hasOwn(PHASE_OF_STATUS, status) ? PHASE_OF_STATUS[status] : "OPEN";
}

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
