"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { saveNotificationSettings, type NotificationPatch } from "@/api/notificationSettings";
import { queryKeys } from "@/api/queryKeys";
import {
  PLAIN_FIELDS,
  SECRET_FIELDS,
  type PlainField,
  type SecretField,
} from "@/api/settingsPaths";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** Every field POST /notification-settings writes: the channels' and the default recipient. */
export type NotificationField = PlainField | SecretField;

const ALL_FIELDS: ReadonlySet<string> = new Set([...PLAIN_FIELDS, ...SECRET_FIELDS]);

export const toNotificationField = (field: string): NotificationField | null =>
  ALL_FIELDS.has(field) ? (field as NotificationField) : null;

/** Writes to the settings row run one after the other (one scope), like the profile saves. */
export const NOTIFICATION_SAVE_SCOPE = { id: "notification-settings" };

/**
 * D5: one partial POST. R10: it refreshes exactly the two readers of these fields, the section
 * and the drawer's channel booleans, not every ["settings"] query.
 */
export function useChannelSave(successText: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: NOTIFICATION_SAVE_SCOPE,
    mutationFn: (patch: NotificationPatch) => saveNotificationSettings(patch),
    onSuccess: () => toast.show({ tone: "success", message: successText }),
    onError: (error) => {
      // Field refusals show on their fields (the form maps them); anything else is one toast.
      if (fieldErrorsFrom(error, toNotificationField).length === 0)
        toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelStatus });
    },
  });
}
