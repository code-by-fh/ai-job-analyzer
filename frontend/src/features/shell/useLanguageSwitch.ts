"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { saveLanguagePreference } from "@/api/settings";
import type { Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

/** Switches the UI at once and stores the choice on the server (it also sets the AI output language). */
export function useLanguageSwitch(): (language: Language) => void {
  const { setLanguage, t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: saveLanguagePreference,
    onSuccess: (_result, language) =>
      queryClient.setQueryData(queryKeys.languagePreference, language),
    onError: () => toast.show({ tone: "error", message: t("error.languageNotSaved") }),
  });
  return (language) => {
    setLanguage(language);
    mutation.mutate(language);
  };
}
