"use client";

import { useState } from "react";
import type { JobDetail } from "@/api/jobs";
import { phaseOfStatus, type Phase, type UserStatus } from "@/domain/jobStatus";
import { OUTCOMES, type Outcome, type StatusGuard } from "@/domain/statusGuards";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { TextAreaField } from "@/ui/Field";
import { PanelHeader } from "@/ui/PanelHeader";
import { DOCUMENT_LABEL, OUTCOME_LABEL, PHASE_LABEL } from "../labels";
import { useOpenTab } from "../tabs/JobTabs";
import { useChangeStatus } from "./useChangeStatus";

/** Guards that need the user's answer before the status changes. */
export type DialogGuard = Exclude<StatusGuard, { kind: "direct" } | { kind: "blocked" }>;
type ConfirmGuard = Exclude<DialogGuard, { kind: "askOutcome" }>;

export interface PhaseChangeDialogProps {
  job: JobDetail;
  guard: DialogGuard;
  onClose: () => void;
}

/** Sends the status with the user's note; the dialog closes only when the server accepted it. */
function useConfirm(job: JobDetail, onClose: () => void) {
  const [note, setNote] = useState("");
  const { changeStatus, isPending } = useChangeStatus(job);
  const confirm = async (to: UserStatus, fixedNote?: string) => {
    const text = [fixedNote, note.trim()].filter(Boolean).join(" · ");
    if (await changeStatus(text ? { to, note: text } : { to })) onClose();
  };
  return { note, setNote, confirm, isPending };
}

export function PhaseChangeDialog({ job, guard, onClose }: PhaseChangeDialogProps) {
  const { t } = useI18n();
  const { note, setNote, confirm, isPending } = useConfirm(job, onClose);
  const title = dialogTitle(guard, t);
  return (
    <Dialog open onClose={onClose} label={title}>
      <div className="panel-in">
        <PanelHeader title={title} onClose={onClose} />
        <GuardBody guard={guard} />
        <NoteField value={note} onChange={setNote} />
        <GuardActions
          guard={guard}
          busy={isPending}
          onConfirm={(to, fixed) => void confirm(to, fixed)}
          onClose={onClose}
        />
      </div>
    </Dialog>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <TextAreaField
      id="phase-note"
      label={t("guard.note")}
      rows={2}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const phaseName = (to: UserStatus, t: Translate) => t(PHASE_LABEL[phaseOfStatus(to)]);

function phaseList(phases: readonly Phase[], t: Translate): string {
  return phases.map((phase) => t(PHASE_LABEL[phase])).join(t("list.and"));
}

function dialogTitle(guard: DialogGuard, t: Translate): string {
  if (guard.kind === "askOutcome") return t("guard.outcome.title");
  if (guard.kind === "applyWithoutDocuments") return t("guard.noDocs.title");
  if (guard.kind === "confirmBackward") {
    return t("guard.backward.title", { phase: phaseName(guard.to, t) });
  }
  return t("guard.skip.title", { phases: phaseList(guard.skipped, t) });
}

function GuardBody({ guard }: { guard: DialogGuard }) {
  const { t } = useI18n();
  if (guard.kind === "confirmBackward") return <p className="prose">{t("guard.backward.text")}</p>;
  if (guard.kind === "confirmSkip") {
    return <p className="prose">{t("guard.skip.text", { phase: phaseName(guard.to, t) })}</p>;
  }
  if (guard.kind === "applyWithoutDocuments") return <MissingDocuments guard={guard} />;
  return null;
}

function MissingDocuments({
  guard,
}: {
  guard: Extract<DialogGuard, { kind: "applyWithoutDocuments" }>;
}) {
  const { t } = useI18n();
  const missing = guard.missing.map((kind) => t(DOCUMENT_LABEL[kind])).join(t("list.and"));
  return (
    <>
      <p className="prose">{t("guard.noDocs.text", { missing })}</p>
      {guard.skipped.length > 0 ? (
        <p className="prose">
          {t("guard.noDocs.skipped", { phases: phaseList(guard.skipped, t) })}
        </p>
      ) : null}
    </>
  );
}

interface GuardActionsProps {
  guard: DialogGuard;
  busy: boolean;
  onConfirm: (to: UserStatus, fixedNote?: string) => void;
  onClose: () => void;
}

function GuardActions({ guard, busy, onConfirm, onClose }: GuardActionsProps) {
  const { t } = useI18n();
  return (
    <div className="row panel-actions">
      {guard.kind === "askOutcome" ? (
        <OutcomeButtons busy={busy} onConfirm={onConfirm} />
      ) : (
        <ConfirmButton guard={guard} busy={busy} onConfirm={onConfirm} />
      )}
      {guard.kind === "applyWithoutDocuments" ? <CreateDocumentsButton onClose={onClose} /> : null}
      <Button variant="ghost" onClick={onClose}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

function OutcomeButtons({ busy, onConfirm }: Pick<GuardActionsProps, "busy" | "onConfirm">) {
  const { t } = useI18n();
  // The backend has no WITHDRAWN, so the choice is kept as a history note (ruling G9).
  const noteOf = (outcome: Outcome) =>
    outcome.key === "withdrawn" ? t(OUTCOME_LABEL.withdrawn) : undefined;
  return (
    <>
      {OUTCOMES.map((outcome) => (
        <Button
          key={outcome.key}
          busy={busy}
          onClick={() => onConfirm(outcome.to, noteOf(outcome))}
        >
          {t(OUTCOME_LABEL[outcome.key])}
        </Button>
      ))}
    </>
  );
}

type ConfirmButtonProps = { guard: ConfirmGuard } & Pick<GuardActionsProps, "busy" | "onConfirm">;

function ConfirmButton({ guard, busy, onConfirm }: ConfirmButtonProps) {
  const { t } = useI18n();
  const phase = phaseName(guard.to, t);
  const label =
    guard.kind === "confirmBackward"
      ? t("guard.backward.confirm")
      : t(guard.kind === "confirmSkip" ? "guard.skip.confirm" : "guard.noDocs.confirm", { phase });
  return (
    <Button variant="primary" busy={busy} onClick={() => onConfirm(guard.to)}>
      {label}
    </Button>
  );
}

function CreateDocumentsButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  return (
    <Button
      onClick={() => {
        onClose();
        openTab("documents");
      }}
    >
      {t("guard.noDocs.create")}
    </Button>
  );
}
