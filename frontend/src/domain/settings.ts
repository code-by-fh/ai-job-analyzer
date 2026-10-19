// Runtime imports stay relative: e2e fixtures load this module outside the app's path aliases.
import { ADMIN_LIMITS, USERNAME_PATTERN } from "../api/adminPaths";
import { PASSWORD_LIMITS } from "../api/settingsPaths";

/** The Einstellungen page; the shell links here too (features/shell/navigation.ts re-exports it). */
export const SETTINGS_HREF = "/settings";
export const USER_SECTIONS = ["general", "notifications", "account"] as const;
/** D1: shown under "Administration" to admins only. */
export const ADMIN_SECTIONS = ["ai", "users", "system"] as const;
export type UserSection = (typeof USER_SECTIONS)[number];
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type SettingsSection = UserSection | AdminSection;
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";
const SECTION_PARAM = "section";
const ALL_SECTIONS: readonly SettingsSection[] = [...USER_SECTIONS, ...ADMIN_SECTIONS];

export const isAdminSection = (value: string | null): value is AdminSection =>
  (ADMIN_SECTIONS as readonly (string | null)[]).includes(value);

export function visibleSections(isAdmin: boolean): readonly SettingsSection[] {
  return isAdmin ? ALL_SECTIONS : USER_SECTIONS;
}

/** D1: an admin section reads as Allgemein for members; unknown values too. */
export function settingsSectionFromParam(value: string | null, isAdmin: boolean): SettingsSection {
  return visibleSections(isAdmin).find((section) => section === value) ?? DEFAULT_SETTINGS_SECTION;
}

/** D1: the default section has no parameter. */
export function settingsHref(section: SettingsSection): string {
  if (section === DEFAULT_SETTINGS_SECTION) return SETTINGS_HREF;
  return `${SETTINGS_HREF}?${new URLSearchParams({ [SECTION_PARAM]: section }).toString()}`;
}

/** routers/settings.py: the zone the server uses when none (or an unknown one) is stored. */
export const DEFAULT_TIMEZONE = "Europe/Berlin";

/** The browser's zones plus a stored one it does not know (a legacy value must stay selectable). */
export function timeZoneOptions(current: string | null, supported: readonly string[]): string[] {
  const zones = new Set(supported);
  if (current) zones.add(current);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

/** "tooLong" covers both server bounds (characters and UTF-8 bytes), so the form shows one fixed text (R9). */
export type PasswordProblem = "tooShort" | "tooLong" | "mismatch";

const utf8 = new TextEncoder();

/**
 * Python's len() counts code points, as pydantic's length bounds do. UTF-16 .length is never
 * smaller, so it would only be stricter on the upper bound, but too lenient on the minimum: four
 * emoji are 8 units yet 4 characters, which the server refuses. Code points mirror it exactly.
 */
function characterCount(text: string): number {
  return Array.from(text).length;
}

export function passwordProblem(input: { next: string; repeat: string }): PasswordProblem | null {
  const characters = characterCount(input.next);
  if (characters < PASSWORD_LIMITS.min) return "tooShort";
  const bytes = utf8.encode(input.next).length;
  // Mirrors the server, which checks both; 128 characters are at least 128 bytes, so the 72-byte
  // bound always decides first and the character bound never refuses on its own.
  if (characters > PASSWORD_LIMITS.max || bytes > PASSWORD_LIMITS.maxBytes) return "tooLong";
  return input.next === input.repeat ? null : "mismatch";
}

export type UsernameProblem = "tooShort" | "tooLong" | "chars";

/** routers/auth.py UserCreate: the bounds and the pattern apply after the trim. */
export function usernameProblem(name: string): UsernameProblem | null {
  const trimmed = name.trim();
  const characters = characterCount(trimmed);
  if (characters < ADMIN_LIMITS.usernameMin) return "tooShort";
  if (characters > ADMIN_LIMITS.usernameMax) return "tooLong";
  return USERNAME_PATTERN.test(trimmed) ? null : "chars";
}
