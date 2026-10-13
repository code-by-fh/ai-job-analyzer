"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { describeError } from "@/api/describeError";
import { queryKeys } from "@/api/queryKeys";
import {
  disconnectDrive,
  driveLoginUrl,
  storageStatusQueryOptions,
  toggleStorage,
} from "@/api/settings";
import type { StorageService } from "@/api/settingsPaths";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

type StorageDoneKey = Extract<
  MessageKey,
  "settings.storage.saved" | "settings.storage.disconnected"
>;

/**
 * Review M1 (as the time zone): only the latest call's answer toasts, so two quick choices give
 * one "gespeichert" and a superseded choice that fails gives no error. Each call takes the next
 * number in onMutate; an answer whose number is no longer the latest stays quiet.
 */
function useLatestToasts(doneKey: StorageDoneKey) {
  const toast = useToast();
  const { t } = useI18n();
  const latest = useRef(0);
  return {
    onMutate: () => ++latest.current,
    onSuccess: (_answer: void, _sent: unknown, call: number) => {
      if (call === latest.current) toast.show({ tone: "success", message: t(doneKey) });
    },
    onError: (error: Error, _sent: unknown, call: number | undefined) => {
      if (call === latest.current) toast.show({ tone: "error", message: describeError(error, t) });
    },
  };
}

/**
 * Both writes answer a status the web does not read, so the status is refetched. Returning the
 * refetch keeps the mutation pending until it lands: the radios show the pending choice until
 * the new status is there, and mutate's own onSuccess runs on the new status.
 */
function useStorageMutation<T>(run: (input: T) => Promise<void>, doneKey: StorageDoneKey) {
  const queryClient = useQueryClient();
  const toasts = useLatestToasts(doneKey);
  return useMutation({
    mutationFn: run,
    ...toasts,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.storageStatus }),
  });
}

/**
 * Review Focus 5: the login is a top-level GET that only carries cookies, so an authenticated
 * call through the API client goes first and lets its single-flight refresh renew an expired
 * access cookie. A failed call stays in the tab as a toast (ruling 38): no navigation, and as a
 * mutation no unhandled rejection.
 */
function useConnectDrive() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async () => {
      // Review M2: a user is waiting on the button, so a failure answers at once, without retries.
      await queryClient.fetchQuery({ ...storageStatusQueryOptions(), staleTime: 0, retry: false });
      window.location.assign(driveLoginUrl());
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** D4: choosing a service saves at once; Drive is chosen only once it is connected. */
export function useStorageActions() {
  const choose = useStorageMutation(
    (service: StorageService) => toggleStorage(service),
    "settings.storage.saved",
  );
  // Ruling 38: an explicit void, else T is inferred as unknown and mutate() needs an argument.
  const disconnect = useStorageMutation<void>(
    () => disconnectDrive(),
    "settings.storage.disconnected",
  );
  const connect = useConnectDrive();
  return { choose, disconnect, connect };
}
