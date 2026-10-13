"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import type { RealtimeDeps } from "@/realtime/applyEvent";
import type { ImportResult } from "@/realtime/imports";
import {
  clearImportFinishedListener,
  expireStalledImports,
  setImportFinishedListener,
} from "@/realtime/importSignals";
import { openRealtime } from "@/realtime/openRealtime";
import { useToast } from "@/ui/ToastProvider";
import { useImportToast } from "./useImportToast";

const IMPORT_SWEEP_INTERVAL_MS = 30_000;

/** Opens the socket and the sweep of lost imports; returns what closes both again. */
function startRealtime(userId: number, queryClient: QueryClient, deps: RealtimeDeps): () => void {
  if (deps.onImportFinished) setImportFinishedListener(queryClient, deps.onImportFinished);
  const sweep = setInterval(
    () => expireStalledImports(queryClient, Date.now()),
    IMPORT_SWEEP_INTERVAL_MS,
  );
  const connection = openRealtime(userId, deps);
  return () => {
    clearInterval(sweep);
    connection.close();
    clearImportFinishedListener(queryClient);
  };
}

/** Opens the socket once per user; toasts read the latest language without reconnecting. */
function useRealtimeConnection(userId: number): void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const showImport = useImportToast();
  const reportBackgroundError = useEffectEvent(() =>
    toast.show({ tone: "error", message: t("toast.backgroundError") }),
  );
  const reportImport = useEffectEvent((result: ImportResult) => showImport(result));
  useEffect(() => {
    const onGlobalError = () => reportBackgroundError();
    const onImportFinished = (result: ImportResult) => reportImport(result);
    const deps = { queryClient, now: Date.now, onGlobalError, onImportFinished };
    return startRealtime(userId, queryClient, deps);
  }, [queryClient, userId]);
}

/** One WebSocket per tab for the signed-in user (spec 2.3). */
export function RealtimeProvider({ userId, children }: { userId: number; children: ReactNode }) {
  useRealtimeConnection(userId);
  return children;
}
