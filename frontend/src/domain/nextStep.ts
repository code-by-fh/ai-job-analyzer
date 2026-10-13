import type { JobChecklist } from "@/api/jobs";
import type { MessageKey } from "@/i18n/de";
import { calendarDaysBetween, parseApiDate } from "./calendar";
import { checklistComplete } from "./checklist";
import { documentPresence, missingDocuments, type PresenceSource } from "./documents";
import { effectiveStatus, isGenerating, type StatusSource, type UserStatus } from "./jobStatus";

/** Days after applying until following up is suggested (prototype FOLLOW_UP_DAYS). */
export const FOLLOW_UP_DAYS = 10;
/** Spec 4.4: a date is due when it is at most this many calendar days ahead, or overdue. */
export const DUE_WINDOW_DAYS = 2;

const STATUS_INTERVIEW = "INTERVIEW";

export type NextTab = "documents" | "interview";

export type NextAction =
  | { type: "shortlist" }
  | { type: "restore" }
  | { type: "generate" }
  | { type: "openTab"; tab: NextTab }
  | { type: "apply" }
  | { type: "followUp" }
  | { type: "setStatus"; to: UserStatus }
  | { type: "generatePrep" }
  | { type: "decideOffer" }
  // Opens the guarded phase menu so the user can record the result (Angebot, Abgesagt, ...).
  | { type: "changePhase" }
  | { type: "none" };

export type NextStepKind =
  | "triage"
  | "restore"
  | "generating"
  | "generationFailed"
  | "createDocuments"
  | "createCv"
  | "createLetter"
  | "apply"
  | "markApplied"
  | "awaitReply"
  | "followUp"
  | "prepareInterview"
  | "interviewReady"
  | "recordOutcome"
  | "decideOffer"
  | "closed";

/** The job field the step's date comes from, so the UI can label and format it. */
export type DateField = "interview_at" | "next_follow_up_at";

export interface NextStep {
  kind: NextStepKind;
  label: MessageKey;
  text: MessageKey;
  due: Date | null;
  dueSoon: boolean;
  overdue: boolean;
  dateField: DateField | null;
  action: NextAction;
}

export interface NextStepInput extends StatusSource, PresenceSource {
  is_archived?: boolean | null;
  checklist?: JobChecklist | null;
  next_follow_up_at?: string | null;
  interview_at?: string | null;
  interview_prep_material?: string | null;
  /** List rows carry only this flag instead of the prep text (GET /jobs). */
  interview_prep_present?: boolean | null;
}

interface DueInfo {
  due: Date | null;
  dueSoon: boolean;
  overdue: boolean;
  dateField: DateField | null;
}

/** The phase's own date (interview in Interview) and the follow-up date. */
interface StepDates {
  due: DueInfo;
  followUp: DueInfo;
}

type StepCore = Pick<NextStep, "kind" | "action"> & DueInfo;
type StepRule = (job: NextStepInput, dates: StepDates) => StepCore;

const NO_DUE: DueInfo = { due: null, dueSoon: false, overdue: false, dateField: null };
const plain = (kind: NextStepKind, action: NextAction): StepCore => ({ kind, action, ...NO_DUE });
const dated = (kind: NextStepKind, action: NextAction, due: DueInfo): StepCore => ({
  kind,
  action,
  ...due,
});

/** Names exactly the work that is missing (one document or both). */
function createKind(job: NextStepInput): NextStepKind | null {
  const missing = missingDocuments(documentPresence(job));
  if (missing.length !== 1) return missing.length === 0 ? null : "createDocuments";
  return missing[0] === "cv" ? "createCv" : "createLetter";
}

function readyStep(job: NextStepInput): StepCore {
  return plain(checklistComplete(job.checklist) ? "markApplied" : "apply", { type: "apply" });
}

function draftedStep(job: NextStepInput): StepCore {
  if (isGenerating(job)) return plain("generating", { type: "openTab", tab: "documents" });
  const create = createKind(job);
  return create ? plain(create, { type: "generate" }) : readyStep(job);
}

/** A failed regeneration keeps the old documents: with both present the user can still apply. */
function failedStep(job: NextStepInput): StepCore {
  return createKind(job) ? plain("generationFailed", { type: "generate" }) : readyStep(job);
}

function appliedStep(_job: NextStepInput, { due }: StepDates): StepCore {
  if (isDue(due)) return dated("followUp", { type: "followUp" }, due);
  return dated("awaitReply", { type: "setStatus", to: STATUS_INTERVIEW }, due);
}

function interviewStep(job: NextStepInput, { due, followUp }: StepDates): StepCore {
  // Without an upcoming interview a due follow-up is the next move (spec 4.4).
  const noUpcomingInterview = !due.due || due.overdue;
  if (noUpcomingInterview && isDue(followUp)) {
    return dated("followUp", { type: "followUp" }, followUp);
  }
  // The interview day has passed: preparing makes no sense, the result is what is missing.
  if (due.overdue) return dated("recordOutcome", { type: "changePhase" }, due);
  if (job.interview_prep_material || job.interview_prep_present) {
    return dated("interviewReady", { type: "openTab", tab: "interview" }, due);
  }
  return dated("prepareInterview", { type: "generatePrep" }, due);
}

const triage: StepRule = () => plain("triage", { type: "shortlist" });
const closed: StepRule = () => plain("closed", { type: "none" });

const RULES: Readonly<Record<string, StepRule>> = {
  OPEN: triage,
  SEEN: triage,
  FAILED: failedStep,
  DRAFTED: draftedStep,
  APPLIED: appliedStep,
  INTERVIEW: interviewStep,
  OFFER: (_job, { due }) => dated("decideOffer", { type: "decideOffer" }, due),
  ACCEPTED: closed,
  REJECTED: closed,
};

interface DueClock {
  now: Date;
  timeZone?: string;
}

function dueInfo(job: NextStepInput, field: DateField, clock: DueClock): DueInfo {
  const iso = job[field];
  if (!iso) return NO_DUE;
  const due = parseApiDate(iso);
  if (Number.isNaN(due.getTime())) return NO_DUE;
  const days = calendarDaysBetween(clock.now, due, clock.timeZone);
  return {
    due,
    dueSoon: days >= 0 && days <= DUE_WINDOW_DAYS,
    overdue: days < 0,
    dateField: field,
  };
}

function stepDates(job: NextStepInput, status: string, clock: DueClock): StepDates {
  const followUp = dueInfo(job, "next_follow_up_at", clock);
  const due = status === STATUS_INTERVIEW ? dueInfo(job, "interview_at", clock) : followUp;
  return { due, followUp };
}

function withCopy(core: StepCore): NextStep {
  return {
    ...core,
    label: `next.${core.kind}.title` as MessageKey,
    text: `next.${core.kind}.text` as MessageKey,
  };
}

/**
 * The single source of "what now" (spec 4.4). It drives the job page card, the inbox "Anstehend"
 * card, the applications column and the due badge, so `now` is injected and the result is pure.
 * The date is the interview date in Interview (unless a due follow-up wins) and the follow-up /
 * answer date otherwise.
 */
export function nextStep(job: NextStepInput, now: Date, timeZone?: string): NextStep {
  if (job.is_archived) return withCopy(plain("restore", { type: "restore" }));
  const status = effectiveStatus(job);
  const rule = Object.hasOwn(RULES, status) ? RULES[status] : triage;
  return withCopy(rule(job, stepDates(job, status, { now, timeZone })));
}

export function isDue(step: Pick<NextStep, "dueSoon" | "overdue">): boolean {
  return step.dueSoon || step.overdue;
}

// Only a due follow-up or answer deadline is a warning (amber); a past interview day is not.
const DEADLINE_KINDS: readonly NextStepKind[] = ["followUp", "decideOffer"];

/** Single source for the amber warning tone on the job page and the inbox due card (spec 4.4). */
export function isWarning(step: Pick<NextStep, "kind" | "dueSoon" | "overdue">): boolean {
  return isDue(step) && DEADLINE_KINDS.includes(step.kind);
}
