"use client";

import type { ProfileDocument } from "@/api/profileDocuments";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { closeThenFocus } from "@/ui/focus";
import { PanelHeader } from "@/ui/PanelHeader";
import { profileHeadingId } from "../labels";
import { useDeleteProof } from "./useProofs";

interface DeleteProofDialogProps {
  proof: ProfileDocument;
  onClose: () => void;
}

/**
 * Preflight ruling 19: ModalLayer's cleanup returns focus to the row's delete button, which is
 * gone; one frame later the section heading takes it, so focus never rests on <body>.
 */
const sectionHeading = () => document.getElementById(profileHeadingId("nachweise"));

export function DeleteProofDialog({ proof, onClose }: DeleteProofDialogProps) {
  const { t } = useI18n();
  const remove = useDeleteProof(() => closeThenFocus(onClose, sectionHeading));
  return (
    <Dialog open onClose={onClose} label={t("files.deleteTitle")}>
      <div className="panel-in profile-dialog">
        <PanelHeader title={t("files.deleteTitle")} onClose={onClose} />
        <p className="prose">{t("files.deleteText", { name: proof.original_filename })}</p>
        <DeleteActions
          busy={remove.isPending}
          onDelete={() => remove.mutate(proof)}
          onCancel={onClose}
        />
      </div>
    </Dialog>
  );
}

export interface DeleteActionsProps {
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}

/** The profile's delete confirmation buttons (Nachweise, Vorlagen). */
export function DeleteActions({ busy, onDelete, onCancel }: DeleteActionsProps) {
  const { t } = useI18n();
  return (
    <div className="row panel-actions">
      <Button variant="danger" busy={busy} onClick={onDelete}>
        {t("files.deleteConfirm")}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}
