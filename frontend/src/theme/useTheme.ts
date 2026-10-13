"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPreferenceStore } from "@/lib/preferenceStore";
import {
  applyMode,
  DARK_SCHEME_QUERY,
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  nextPreference,
  resolveMode,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

export const themeStore = createPreferenceStore<ThemePreference>({
  key: THEME_STORAGE_KEY,
  isValid: isThemePreference,
  fallback: () => DEFAULT_THEME_PREFERENCE,
});

const serverPreference = (): ThemePreference => DEFAULT_THEME_PREFERENCE;

export interface ThemeControls {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  cycle: () => void;
}

export function useTheme(): ThemeControls {
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.get, serverPreference);
  return {
    preference,
    setPreference: themeStore.set,
    cycle: () => themeStore.set(nextPreference(preference)),
  };
}

/** Applies the resolved mode and keeps following the OS while the preference is "system". */
export function useApplyThemeMode(preference: ThemePreference): void {
  useEffect(() => {
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    const apply = () => applyMode(document.documentElement, resolveMode(preference, media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
}
