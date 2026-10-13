"use client";

import type { NotifyChannel } from "@/api/platformPaths";
import { removalPatch } from "@/domain/notificationChannels";
import { CHANNEL_LABEL } from "@/features/sources/labels";
import { useI18n } from "@/i18n/useI18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { useChannelSave } from "./useChannelSave";

export interface RemoveChannelDialogProps {
  channel: NotifyChannel;
  /** After the credentials are gone; the form closes and focus moves on (ruling 20). */
  onRemoved: () => void;
  onClose: () => void;
}

/** D5: deleting credentials asks first and says that sources over this channel go quiet. */
export function RemoveChannelDialog({ channel, onRemoved, onClose }: RemoveChannelDialogProps) {
  const { t } = useI18n();
  const name = t(CHANNEL_LABEL[channel]);
  const remove = useChannelSave(t("settings.notify.removed", { channel: name }));
  return (
    <ConfirmDialog
      title={t("settings.notify.removeTitle", { channel: name })}
      confirmLabel={t("settings.notify.remove")}
      busy={remove.isPending}
      onConfirm={() => remove.mutate(removalPatch(channel), { onSuccess: onRemoved })}
      onClose={onClose}
    >
      <p className="prose">{t("settings.notify.removeText", { channel: name })}</p>
    </ConfirmDialog>
  );
}
