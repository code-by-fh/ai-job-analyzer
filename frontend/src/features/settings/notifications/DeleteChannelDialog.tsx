"use client";

import type { Channel } from "@/api/notificationChannels";
import { useI18n } from "@/i18n/useI18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { useDeleteChannel } from "./useChannelSave";

export interface DeleteChannelDialogProps {
  channel: Channel;
  /** After the channel is gone; the form closes and focus moves on (ruling 20). */
  onDeleted: () => void;
  onClose: () => void;
}

/** D5: deleting a channel asks first and says that sources lose it. */
export function DeleteChannelDialog({ channel, onDeleted, onClose }: DeleteChannelDialogProps) {
  const { t } = useI18n();
  const remove = useDeleteChannel();
  return (
    <ConfirmDialog
      title={t("settings.notify.deleteTitle", { channel: channel.name })}
      confirmLabel={t("settings.notify.delete")}
      busy={remove.isPending}
      onConfirm={() => remove.mutate(channel.id, { onSuccess: onDeleted })}
      onClose={onClose}
    >
      <p className="prose">{t("settings.notify.deleteText")}</p>
    </ConfirmDialog>
  );
}
