"use client";

import { useI18n } from "@/i18n/useI18n";
import { ConfirmDialog } from "../ConfirmDialog";

export interface DisconnectDriveDialogProps {
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** D4: Trennen asks first and says where new files go and that Drive keeps the old ones. */
export function DisconnectDriveDialog({ busy, onConfirm, onClose }: DisconnectDriveDialogProps) {
  const { t } = useI18n();
  return (
    <ConfirmDialog
      title={t("settings.storage.disconnectTitle")}
      confirmLabel={t("settings.storage.disconnect")}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p className="prose">{t("settings.storage.disconnectText")}</p>
    </ConfirmDialog>
  );
}
