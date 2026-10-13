"use client";

import { useState } from "react";
import type { JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";

export interface DeleteJobDialogProps {
  item: JobListItem;
  /** Resolves true when the server deleted the job, or archived it while it was still active. */
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}

/** No undo exists for a hard delete, so it is confirmed first (D4). Ink button: crimson is for errors. */
export function DeleteJobDialog({ item, onConfirm, onClose }: DeleteJobDialogProps) {
  const { t } = useI18n();
  const heading = t("inbox.delete.title");
  const names = {
    title: item.title ?? t("job.untitled"),
    company: item.company ?? t("job.unknownCompany"),
  };
  return (
    <Dialog open onClose={onClose} label={heading}>
      <div className="panel-in">
        <PanelHeader title={heading} onClose={onClose} />
        <p className="prose">{t("inbox.delete.text", names)}</p>
        <DeleteActions onConfirm={onConfirm} onClose={onClose} />
      </div>
    </Dialog>
  );
}

/** The dialog stays open on a failure, so the user can try again or cancel. */
function DeleteActions({ onConfirm, onClose }: Omit<DeleteJobDialogProps, "item">) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    if (await onConfirm()) onClose();
    else setBusy(false);
  };
  return (
    <div className="row panel-actions">
      <Button busy={busy} onClick={() => void confirm()}>
        {t("inbox.delete.confirm")}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}
