"use client";

import {
  Archive,
  Bookmark,
  CalendarPlus,
  Check,
  ClipboardCheck,
  FileText,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import type { NextAction, NextStep } from "@/domain/nextStep";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TaskProgress } from "../TaskState";
import { useOpenDates } from "../dates/DatesDrawerProvider";
import { useAttachChoice } from "../documents/useAttachChoice";
import {
  generationProblem,
  missingRequest,
  useGeneration,
  type GenerationRequest,
} from "../documents/useGeneration";
import { usePrep } from "../interview/usePrep";
import { PhaseChangeDialog } from "../phase/PhaseChangeDialog";
import { useChangeStatus } from "../phase/useChangeStatus";
import { useOpenTab } from "../tabs/JobTabs";
import { OfferDecision } from "./OfferDecision";
import { useJobActions } from "./useJobActions";

interface ActionProps {
  job: JobDetail;
  step: NextStep;
}

/** One busy state: while either request runs, both buttons are blocked. */
function useTriageBusy(job: JobDetail) {
  const status = useChangeStatus(job);
  const actions = useJobActions(job);
  return { ...status, actions, busy: status.isPending || actions.busy };
}

function TriageActions({ job }: ActionProps) {
  const { t } = useI18n();
  const { changeStatus, actions, busy } = useTriageBusy(job);
  return (
    <div className="row">
      <Button
        variant="primary"
        icon={Bookmark}
        busy={busy}
        onClick={() => void changeStatus({ to: "DRAFTED" })}
      >
        {t("next.shortlist")}
      </Button>
      <Button icon={Archive} busy={busy} onClick={actions.dismiss}>
        {t("next.dismiss")}
      </Button>
    </div>
  );
}

function RestoreAction({ job }: ActionProps) {
  const { t } = useI18n();
  const actions = useJobActions(job);
  return (
    <Button icon={RotateCcw} busy={actions.busy} onClick={actions.restore}>
      {t("next.restoreAction")}
    </Button>
  );
}

const CREATE_LABEL: Readonly<Record<GenerationRequest["kind"], MessageKey>> = {
  both: "next.createAction",
  cv: "next.createCvAction",
  cover_letter: "next.createLetterAction",
};

function GenerateAction({ job }: ActionProps) {
  return (
    <>
      <ProfileHint error={job.generation_error} />
      <CreateMissingButton job={job} />
    </>
  );
}

/** Names and creates exactly the missing documents; with nothing missing there is no button. */
function CreateMissingButton({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const [attach] = useAttachChoice(job.id);
  const request = missingRequest(documentPresence(job), attach);
  if (!request) return null;
  return (
    <Button
      variant="primary"
      icon={FileText}
      busy={generation.starting}
      onClick={() => generation.start(request)}
    >
      {t(CREATE_LABEL[request.kind])}
    </Button>
  );
}

/** Only an allow-listed meaning of generation_error is shown; raw text never (spec 6). */
function ProfileHint({ error }: { error?: string | null }) {
  const { t } = useI18n();
  if (generationProblem(error) !== "profileIncomplete") return null;
  return (
    <p className="next-hint">
      {t("next.profileIncomplete")}{" "}
      <Link className="link" href="/profile">
        {t("next.toProfile")}
      </Link>
    </p>
  );
}

function OpenTabAction({ action }: { action: Extract<NextAction, { type: "openTab" }> }) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  return (
    <Button
      variant="primary"
      icon={action.tab === "interview" ? MessageSquare : FileText}
      onClick={() => openTab(action.tab)}
    >
      {t(action.tab === "interview" ? "next.openPrep" : "next.progress")}
    </Button>
  );
}

function FollowUpAction({ job }: ActionProps) {
  const { t } = useI18n();
  const actions = useJobActions(job);
  return (
    <Button variant="primary" icon={Check} busy={actions.busy} onClick={actions.followedUp}>
      {t("next.followedUp")}
    </Button>
  );
}

/** Feedback 1 T13: the invitation moves to Interview, then "Termine & Daten" asks for its date. */
function InviteAction({ job }: ActionProps) {
  const { t } = useI18n();
  const { changeStatus, isPending } = useChangeStatus(job);
  const openDates = useOpenDates();
  const invite = async () => {
    if (await changeStatus({ to: "INTERVIEW" })) openDates("interviewAt");
  };
  return (
    <Button variant="primary" icon={CalendarPlus} busy={isPending} onClick={() => void invite()}>
      {t("next.invite")}
    </Button>
  );
}

/** The prep start of the Interview tab, which then opens that tab to show the progress. */
function usePrepAndOpen(job: JobDetail) {
  const prep = usePrep(job, false);
  const openTab = useOpenTab();
  const run = () => {
    prep.run();
    openTab("interview");
  };
  return { ...prep, run };
}

/** Same start path and label as the Interview tab; a running prep replaces the button. */
function PrepAction({ job }: ActionProps) {
  const { t } = useI18n();
  const prep = usePrepAndOpen(job);
  if (prep.phase !== "idle") return <TaskProgress task={prep} runningText={t("prep.running")} />;
  return (
    <Button variant="primary" icon={MessageSquare} busy={prep.pending} onClick={prep.run}>
      {t("prep.create")}
    </Button>
  );
}

/** The interview is over: the guarded outcome question of the phase change flow (Task 10). */
function ChangePhaseAction({ job }: ActionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" icon={ClipboardCheck} onClick={() => setOpen(true)}>
        {t("next.recordOutcome")}
      </Button>
      {open ? (
        <PhaseChangeDialog
          job={job}
          guard={{ kind: "askOutcome" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const NoAction = () => null;

const ACTION_VIEWS: Readonly<Record<NextAction["type"], (props: ActionProps) => ReactNode>> = {
  shortlist: TriageActions,
  restore: RestoreAction,
  generate: GenerateAction,
  openTab: ({ step }) =>
    step.action.type === "openTab" ? <OpenTabAction action={step.action} /> : null,
  // The apply checklist is the action (Task 12), rendered in the card's extras.
  apply: NoAction,
  followUp: FollowUpAction,
  setStatus: InviteAction,
  generatePrep: PrepAction,
  decideOffer: ({ job }) => <OfferDecision job={job} />,
  changePhase: ChangePhaseAction,
  none: NoAction,
};

export function NextStepActions({ job, step }: ActionProps) {
  const View = ACTION_VIEWS[step.action.type];
  return <View job={job} step={step} />;
}
