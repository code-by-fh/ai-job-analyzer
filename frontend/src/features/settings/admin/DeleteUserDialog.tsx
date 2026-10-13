"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUser, type AdminUser } from "@/api/admin";
import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/queryKeys";
import { HTTP_NOT_FOUND, refusalText } from "@/features/profile/refusals";
import { useI18n } from "@/i18n/useI18n";
import { closeThenFocus } from "@/ui/focus";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { settingsHeadingId } from "../labels";
import { USER_REFUSALS } from "./userRefusals";

const sectionHeading = () => document.getElementById(settingsHeadingId("users"));
const isGone = (error: unknown) => error instanceof ApiError && error.status === HTTP_NOT_FOUND;

/**
 * Success and a 404 (someone else deleted the user) both refetch the list, whose row and button
 * then go: focus moves to the section heading, never to the page (ruling 23). A 409 keeps the row,
 * so the dialog's own focus return goes back to its button.
 */
function useLeaveForHeading(onClose: () => void) {
  const queryClient = useQueryClient();
  return () => {
    closeThenFocus(onClose, sectionHeading);
    void queryClient.invalidateQueries({ queryKey: queryKeys.users });
  };
}

function useDeleteUser(onClose: () => void) {
  const toast = useToast();
  const { t } = useI18n();
  const leave = useLeaveForHeading(onClose);
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      leave();
      toast.show({ tone: "success", message: t("settings.users.deleted") });
    },
    onError: (error) => {
      // A 409 closes too: self and admin refusals never change, and a crawl takes minutes, so a
      // second try from the open dialog would only repeat the refusal; the toast says why.
      if (isGone(error)) leave();
      else onClose();
      toast.show({ tone: "error", message: refusalText(error, t, USER_REFUSALS) });
    },
  });
}

interface DeleteUserDialogProps {
  user: AdminUser;
  onClose: () => void;
}

/** D5: danger, and the text names everything services/user_data.py delete_user removes. */
export function DeleteUserDialog({ user, onClose }: DeleteUserDialogProps) {
  const { t } = useI18n();
  const remove = useDeleteUser(onClose);
  return (
    <ConfirmDialog
      title={t("settings.users.deleteTitle", { name: user.username })}
      confirmLabel={t("settings.users.deleteConfirm")}
      tone="danger"
      busy={remove.isPending}
      onConfirm={() => remove.mutate(user.id)}
      onClose={onClose}
    >
      <p className="prose">{t("settings.users.deleteText")}</p>
    </ConfirmDialog>
  );
}
