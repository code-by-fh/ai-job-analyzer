"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { saveAiSettings, type AiSettings, type AiSettingsPatch } from "@/api/admin";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { queryKeys } from "@/api/queryKeys";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** The fields POST /admin/settings validates; a 422 on one of them shows on the form's field. */
const AI_FIELDS: ReadonlySet<string> = new Set([
  "openrouter_api_key",
  "openrouter_model",
  "ollama_base_url",
  "ollama_model",
  "ai_task_routing",
]);

/** "ai_task_routing.jobs" names the routing field. */
export function toAiField(field: string): string | null {
  const name = field.split(".")[0] ?? "";
  return AI_FIELDS.has(name) ? name : null;
}

/** The provider forms and the routing write one settings row, one after the other. */
const AI_SAVE_SCOPE = { id: "ai-settings" };

/** The answer is the stored state; without a key no model list may stay shown (fix round M4). */
function storeAnswer(queryClient: QueryClient, answer: AiSettings) {
  queryClient.setQueryData(queryKeys.aiSettings, answer);
  if (!answer.openrouter_api_key_set)
    queryClient.removeQueries({ queryKey: queryKeys.openRouterModels });
}

/**
 * One partial POST; the answer is the stored state and replaces the cache entry. gcTime 0: the
 * typed key sits in the mutation's variables, which must not outlive the save (preflight 3.26).
 * Onboarding's ai_configured depends on these settings, so the setup status is refetched.
 */
export function useAiSettingsSave(successKey: MessageKey) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    scope: AI_SAVE_SCOPE,
    gcTime: 0,
    mutationFn: (patch: AiSettingsPatch) => saveAiSettings(patch),
    onSuccess: (answer) => {
      storeAnswer(queryClient, answer);
      toast.show({ tone: "success", message: t(successKey) });
    },
    onError: (error) => {
      if (fieldErrorsFrom(error, toAiField).length === 0)
        toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus }),
  });
}
