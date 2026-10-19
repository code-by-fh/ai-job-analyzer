"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import {
  createChannel,
  deleteChannel,
  updateChannel,
  type Channel,
} from "@/api/notificationChannels";
import { queryKeys } from "@/api/queryKeys";
import type { ChannelProblems } from "@/domain/notificationChannels";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { channelErrorText } from "./channelText";

const FIELDS_PREFIX = "fields.";
const NAME_FIELD = "name";

/** Channel writes run one after the other (one scope), so a delete never overtakes a save. */
const CHANNEL_SAVE_SCOPE = { id: "notification-channels" };

/**
 * A 422 of the service names `fields.<name>` (or the channel name): each shows on its field with
 * the fixed "refused" sentence; the service's message is never shown.
 */
export function refusedProblems(error: unknown): ChannelProblems | null {
  const refused = fieldErrorsFrom(error, (field) =>
    field === NAME_FIELD || field.startsWith(FIELDS_PREFIX) ? field : null,
  );
  if (refused.length === 0) return null;
  const fields = Object.fromEntries(
    refused
      .filter((field) => field.startsWith(FIELDS_PREFIX))
      .map((field) => [field.slice(FIELDS_PREFIX.length), "refused" as const]),
  );
  return refused.includes(NAME_FIELD) ? { name: "refused", fields } : { fields };
}

/** The stored channel goes into the list at once, so the closed form never shows the old values. */
function storeChannel(queryClient: QueryClient, saved: Channel): void {
  queryClient.setQueryData<Channel[]>(queryKeys.channels, (list) => {
    if (!list) return list;
    const known = list.some((channel) => channel.id === saved.id);
    return known
      ? list.map((channel) => (channel.id === saved.id ? saved : channel))
      : [...list, saved];
  });
}

function useChannelWrite<V>(write: (variables: V) => Promise<Channel>, successText: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: CHANNEL_SAVE_SCOPE,
    mutationFn: write,
    // The variables hold typed secrets: they leave the mutation cache as soon as it settles.
    gcTime: 0,
    onSuccess: (saved) => {
      storeChannel(queryClient, saved);
      toast.show({ tone: "success", message: successText });
    },
    onError: (error) => {
      if (!refusedProblems(error))
        toast.show({ tone: "error", message: channelErrorText(error, t) });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.channels }),
  });
}

export function useCreateChannel() {
  const { t } = useI18n();
  return useChannelWrite(createChannel, t("settings.notify.created"));
}

export function useUpdateChannel() {
  const { t } = useI18n();
  return useChannelWrite(updateChannel, t("sources.saved"));
}

/** The server also drops the channel from the user's sources, so the source list refreshes too. */
export function useDeleteChannel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: CHANNEL_SAVE_SCOPE,
    mutationFn: deleteChannel,
    onSuccess: () => toast.show({ tone: "success", message: t("settings.notify.deleted") }),
    onError: (error) => toast.show({ tone: "error", message: channelErrorText(error, t) }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
      void queryClient.invalidateQueries({ queryKey: queryKeys.platforms });
    },
  });
}
