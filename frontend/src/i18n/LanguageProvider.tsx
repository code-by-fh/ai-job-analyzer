"use client";

import { useEffect, type ReactNode } from "react";
import { useI18n } from "./useI18n";

/** Keeps <html lang> in sync with the chosen language for screen readers and hyphenation. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return children;
}
