export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "ajp-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: string): value is ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveMode(preference: ThemePreference, systemPrefersDark: boolean): ThemeMode {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Order of the sidebar's cycle button, as in the prototype: light, dark, system. */
export function nextPreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

/** tokens.css switches every colour on :root[data-mode="dark"]. */
export function applyMode(root: HTMLElement, mode: ThemeMode): void {
  root.dataset.mode = mode;
}
