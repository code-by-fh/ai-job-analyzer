"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { queryKeys } from "@/api/queryKeys";
import { fetchLanguagePreference } from "@/api/settings";
import type { Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";

/** After login the server preference wins over the browser default; later switches go through useLanguageSwitch. */
export function useServerLanguageSync(): void {
  const { language, setLanguage } = useI18n();
  const { data } = useQuery({
    queryKey: queryKeys.languagePreference,
    queryFn: fetchLanguagePreference,
    staleTime: Infinity,
  });
  // An effect event, so a local switch does not re-run the sync and revert to the old server value.
  const adopt = useEffectEvent((serverLanguage: Language) => {
    if (serverLanguage !== language) setLanguage(serverLanguage);
  });
  useEffect(() => {
    if (data) adopt(data);
  }, [data]);
}
