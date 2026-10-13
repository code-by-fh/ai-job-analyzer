"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { jobHistoryQueryOptions, type JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { phaseOf } from "@/domain/jobStatus";
import { phaseTrack, type TrackStep } from "@/domain/phaseTrack";
import { guardFor, MENU_TARGETS, type MenuTarget } from "@/domain/statusGuards";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { MenuButton } from "@/ui/Menu";
import { Stepper, type StepItem } from "@/ui/Stepper";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { currentPhaseLabel, PHASE_LABEL } from "../labels";
import { PhaseChangeDialog, type DialogGuard } from "./PhaseChangeDialog";
import { useChangeStatus } from "./useChangeStatus";

const guardOf = (job: JobDetail, target: MenuTarget) =>
  guardFor({ ...job, documents: documentPresence(job) }, target);

/** Read-only stepper plus the one place to change a status (usability #6, spec 4.2). */
export function PhaseTrack({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const steps = useTrackItems(job);
  const [guard, setGuard] = useState<DialogGuard | null>(null);
  const { changeStatus, isPending } = useChangeStatus(job);
  const select = (target: MenuTarget) => {
    const next = guardOf(job, target);
    if (next.kind === "direct") void changeStatus({ to: next.to });
    else if (next.kind !== "blocked") setGuard(next);
  };
  return (
    <div className="jd-phase">
      <Stepper steps={steps} label={t("phase.label")} />
      <PhaseMenu job={job} onSelect={select} busy={isPending} />
      {guard ? <PhaseChangeDialog job={job} guard={guard} onClose={() => setGuard(null)} /> : null}
    </div>
  );
}

function useTrackItems(job: JobDetail): StepItem[] {
  const { t } = useI18n();
  const format = useJobFormat();
  const history = useQuery(jobHistoryQueryOptions(job.id)).data ?? [];
  return phaseTrack(phaseOf(job), history).map((step) => ({
    key: step.phase,
    state: step.state,
    label: t(step.state === "closed" ? currentPhaseLabel(job) : PHASE_LABEL[step.phase]),
    date: stepDate(step, format, t),
  }));
}

function stepDate(step: TrackStep, format: JobFormat, t: Translate): string | undefined {
  if (!step.reachedAt || step.state === "future" || step.state === "skipped") return undefined;
  const date = format.date(step.reachedAt);
  return step.state === "current" ? t("phase.since", { date }) : date;
}

function menuItems(job: JobDetail, t: Translate) {
  const phase = phaseOf(job);
  return MENU_TARGETS.map((target) => ({
    key: target,
    label: t(PHASE_LABEL[target]),
    checked: target === phase,
    disabled: guardOf(job, target).kind === "blocked",
  }));
}

/** Why no phase can be chosen: a running generation, or a seen job that awaits triage first. */
function lockHint(job: JobDetail): MessageKey | null {
  const guard = guardOf(job, MENU_TARGETS[0]);
  if (guard.kind !== "blocked" || guard.reason === "current") return null;
  return guard.reason === "locked" ? "phase.locked" : "phase.lockedSeen";
}

interface PhaseMenuProps {
  job: JobDetail;
  onSelect: (target: MenuTarget) => void;
  busy: boolean;
}

/** An archived job keeps the menu: a status change restores it on the server. */
function PhaseMenu({ job, onSelect, busy }: PhaseMenuProps) {
  const { t } = useI18n();
  const hint = lockHint(job);
  return (
    <div className="jd-phase-menu">
      <MenuButton
        buttonLabel={t("phase.change")}
        menuLabel={t("phase.change")}
        items={menuItems(job, t)}
        onSelect={onSelect}
        busy={busy}
      />
      {hint ? <p className="meta">{t(hint)}</p> : null}
    </div>
  );
}
