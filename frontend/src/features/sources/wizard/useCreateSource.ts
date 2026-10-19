"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Dispatch } from "react";
import { describeError } from "@/api/describeError";
import {
  platformSchema,
  setupPlatform,
  type Platform,
  type PlatformSetupRequest,
  type PlatformSetupResult,
} from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import type { ToastTone } from "@/ui/toast";
import { useToast } from "@/ui/ToastProvider";
import { isProfileRequired } from "../profileGate";
import { scheduleRequest } from "../drawer/ScheduleFields";
import { sectionFieldErrors } from "../drawer/useSectionSave";
import type { WizardAction, WizardState } from "./wizardState";

/** D10: an empty name is left out, so the server proposes one (G8); the pattern is the confirmed one. */
export function setupRequestOf(state: WizardState): PlatformSetupRequest {
  const name = state.name.trim();
  return {
    url: state.url.trim(),
    selected_urls: state.selected,
    initial_run: state.initialRun,
    ...(name ? { name } : {}),
    ...scheduleRequest(state.schedule),
    url_pattern: state.pattern,
    ...(state.channelIds.length > 0 ? { notification_channel_ids: state.channelIds } : {}),
  };
}

/** Only an "analyze" run is something the user waits for, so only its start is reported (B8). */
function firstRunFailed(result: PlatformSetupResult, request: PlatformSetupRequest): boolean {
  return request.initial_run === "analyze" && !result.initial_crawl_started;
}

function createdMessage(
  result: PlatformSetupResult,
  request: PlatformSetupRequest,
  t: Translate,
): string {
  const name = result.name;
  if (request.initial_run !== "analyze") return t("sources.wizard.created", { name });
  return result.initial_crawl_started
    ? t("sources.wizard.createdRunning", { name })
    : t("sources.wizard.firstRunFailed", { name });
}

/** D15: the server may finish a pending legacy row of that address, so it replaces that row. */
function withCreated(list: readonly Platform[], created: Platform): Platform[] {
  return list.some((platform) => platform.id === created.id)
    ? list.map((platform) => (platform.id === created.id ? created : platform))
    : [...list, created];
}

/** Queries the create changes; a first run started now shows as a crawl ("none" starts none). */
function changedQueries(request: PlatformSetupRequest) {
  const changed = [queryKeys.platforms, queryKeys.setupStatus];
  return request.initial_run === "none" ? changed : [...changed, queryKeys.activity];
}

/**
 * The row exists at once, so focus can land on it when the wizard is gone; the refetch then brings
 * the server's view, and the setup status leaves the inbox onboarding (D12). The schema strips
 * the setup's one-off `initial_crawl_started`.
 */
function adoptCreated(
  queryClient: QueryClient,
  result: PlatformSetupResult,
  request: PlatformSetupRequest,
): void {
  const created = platformSchema.parse(result);
  queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
    withCreated(list ?? [], created),
  );
  for (const queryKey of changedQueries(request)) void queryClient.invalidateQueries({ queryKey });
}

interface CreateSourceOptions {
  onCreated: (id: number) => void;
  dispatch: Dispatch<WizardAction>;
}

function failureMessage(error: unknown, t: Translate): string {
  if (isProfileRequired(error)) return t("sources.profileRequired.error");
  return describeError(error, t, { BAD_REQUEST: "sources.wizard.duplicate" });
}

/** A 422 lands on its fields (the reducer jumps to their step); anything else is one toast. */
function useCreateFailure(dispatch: Dispatch<WizardAction>) {
  const toast = useToast();
  const { t } = useI18n();
  return (error: unknown) => {
    const fields = sectionFieldErrors(error);
    if (fields.length > 0) dispatch({ type: "serverErrors", fields });
    else toast.show({ message: failureMessage(error, t), tone: "error" });
  };
}

/** D10 "Quelle anlegen": POST /platforms/setup, then the new row, a toast and the wizard closes. */
export function useCreateSource({ onCreated, dispatch }: CreateSourceOptions) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const onError = useCreateFailure(dispatch);
  return useMutation({
    mutationFn: (request: PlatformSetupRequest) => setupPlatform(request),
    onSuccess: (result, request) => {
      adoptCreated(queryClient, result, request);
      const tone: ToastTone = firstRunFailed(result, request) ? "error" : "success";
      toast.show({ message: createdMessage(result, request, t), tone });
      onCreated(result.id);
    },
    onError,
  });
}
