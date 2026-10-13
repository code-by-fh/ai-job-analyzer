"use client";

import type { TemplateCard } from "@/domain/templates";
import { useI18n } from "@/i18n/useI18n";
import { Dialog } from "@/ui/Dialog";
import { closeThenFocus } from "@/ui/focus";
import { PanelHeader } from "@/ui/PanelHeader";
import { profileHeadingId } from "../labels";
import { DeleteActions } from "../proofs/DeleteProofDialog";
import { cardName } from "./labels";
import { useDeleteTemplate } from "./useTemplateActions";

export interface DeleteTemplateDialogProps {
  card: TemplateCard;
  isDefault: boolean;
  onClose: () => void;
}

/**
 * Preflight ruling 19: ModalLayer's cleanup returns focus to the card's delete button, which is
 * gone; one frame later the section heading takes it, so focus never rests on <body>.
 */
const sectionHeading = () => document.getElementById(profileHeadingId("vorlagen"));

function useDeleteAndRefocus(onClose: () => void) {
  return useDeleteTemplate(() => closeThenFocus(onClose, sectionHeading));
}

/** D9: deleting the default falls back to the bundled template, and the text says so. */
function DeleteText({ name, isDefault }: { name: string; isDefault: boolean }) {
  const { t } = useI18n();
  const text = t("profile.templates.deleteText", { name });
  return (
    <p className="prose">{isDefault ? `${text} ${t("profile.templates.deleteDefault")}` : text}</p>
  );
}

export function DeleteTemplateDialog({ card, isDefault, onClose }: DeleteTemplateDialogProps) {
  const { t } = useI18n();
  const name = cardName(card, t);
  const remove = useDeleteAndRefocus(onClose);
  return (
    <Dialog open onClose={onClose} label={t("profile.templates.deleteTitle")}>
      <div className="panel-in profile-dialog">
        <PanelHeader title={t("profile.templates.deleteTitle")} onClose={onClose} />
        <DeleteText name={name} isDefault={isDefault} />
        <DeleteActions
          busy={remove.isPending}
          onDelete={() => card.id !== null && remove.mutate({ id: card.id, name })}
          onCancel={onClose}
        />
      </div>
    </Dialog>
  );
}
