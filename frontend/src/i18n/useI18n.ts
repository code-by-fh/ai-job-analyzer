"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createPreferenceStore } from "@/lib/preferenceStore";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  languageFromLocale,
  type Language,
} from "./languages";
import { translatorFor, type Translate } from "./translate";

export const languageStore = createPreferenceStore<Language>({
  key: LANGUAGE_STORAGE_KEY,
  isValid: isLanguage,
  fallback: () => languageFromLocale(navigator.language),
});

// The server render has no localStorage; German avoids a mismatch for the common case.
const serverLanguage = (): Language => DEFAULT_LANGUAGE;

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

export function useI18n(): I18n {
  const language = useSyncExternalStore(languageStore.subscribe, languageStore.get, serverLanguage);
  const t = useMemo(() => translatorFor(language), [language]);
  return { language, setLanguage: languageStore.set, t };
}
