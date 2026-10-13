"use client";

import type { NotificationTemplate } from "@/api/notifications";
import { useI18n } from "@/i18n/useI18n";
import { ConfirmDialog } from "../../ConfirmDialog";
import { useDeleteTemplate } from "./useTemplateEditor";

export interface DeleteNotificationTemplateDialogProps {
  template: NotificationTemplate;
  /** After the delete; the library moves focus to the section heading (ruling 20). */
  onDeleted: () => void;
  onClose: () => void;
}

/** R1: the text says that sources keep the copy they took of this template. */
export function DeleteNotificationTemplateDialog(props: DeleteNotificationTemplateDialogProps) {
  const { template, onDeleted, onClose } = props;
  const { t } = useI18n();
  const remove = useDeleteTemplate();
  return (
    <ConfirmDialog
      title={t("settings.templates.deleteTitle", { name: template.name })}
      confirmLabel={t("files.deleteConfirm")}
      busy={remove.isPending}
      onConfirm={() => remove.mutate(template, { onSuccess: onDeleted })}
      onClose={onClose}
    >
      <p className="prose">{t("settings.templates.deleteText")}</p>
    </ConfirmDialog>
  );
}
