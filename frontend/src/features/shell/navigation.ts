import { Briefcase, Globe, Inbox, SlidersHorizontal, User, type LucideIcon } from "lucide-react";
import { PROFILE_HREF } from "@/domain/profile";
import { SETTINGS_HREF } from "@/domain/settings";
import type { MessageKey } from "@/i18n/de";

export type NavKey = "inbox" | "applications" | "sources" | "profile";

export interface NavItem {
  key: NavKey;
  number: string;
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}

export const SOURCES_HREF = "/sources";
export { PROFILE_HREF };

// Numbered like the prototype: the product is a sequence (find, triage, apply). Spec 4.1.
export const MAIN_NAV: readonly NavItem[] = [
  { key: "inbox", number: "01", href: "/inbox", labelKey: "nav.inbox", icon: Inbox },
  {
    key: "applications",
    number: "02",
    href: "/applications",
    labelKey: "nav.applications",
    icon: Briefcase,
  },
  { key: "sources", number: "03", href: SOURCES_HREF, labelKey: "nav.sources", icon: Globe },
  { key: "profile", number: "04", href: PROFILE_HREF, labelKey: "nav.profile", icon: User },
];

export { SETTINGS_HREF };
export const SETTINGS_NUMBER = "05";
export const ACCOUNT_HREF = "/settings?section=account";
// Contracts for later phases (decision D6 of phase 3): Quellen opens its add wizard on ?add=1
// (phase 5), Einstellungen its KI section on ?section=ai and its notification channels on
// ?section=notifications (phase 7).
export const SOURCES_ADD_HREF = "/sources?add=1";
export const AI_SETTINGS_HREF = "/settings?section=ai";
export const NOTIFICATION_SETTINGS_HREF = "/settings?section=notifications";

// The mobile bottom bar shows the first three; Profil and Einstellungen live under "Mehr".
const BOTTOM_BAR_SIZE = 3;
export const BOTTOM_BAR_NAV = MAIN_NAV.slice(0, BOTTOM_BAR_SIZE);
export const MORE_NAV: readonly Omit<NavItem, "key" | "number">[] = [
  { href: PROFILE_HREF, labelKey: "nav.profile", icon: User },
  { href: SETTINGS_HREF, labelKey: "nav.settings", icon: SlidersHorizontal },
];

export function navNumber(key: NavKey): string {
  return MAIN_NAV.find((item) => item.key === key)?.number ?? "";
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_NAV.some((item) => isActivePath(pathname, item.href));
}

export function initialOf(username: string): string {
  return username.trim().charAt(0).toUpperCase();
}

const JOB_PATH = /^\/jobs\/([^/]+)\/?$/;

/** A malformed escape (truncated paste, mangled link) is no job id; it must not crash the shell. */
export function jobIdFromPath(pathname: string): string | null {
  const match = JOB_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Decision D10 (phase-1 ruling): matches and sorted-out jobs live in Eingang, applications in Bewerbungen. */
export function navKeyForJob(job: { status: string; is_archived?: boolean | null }): NavKey {
  return job.status === "OPEN" || job.is_archived ? "inbox" : "applications";
}

export function navKeyForPath(pathname: string): NavKey | null {
  return MAIN_NAV.find((item) => isActivePath(pathname, item.href))?.key ?? null;
}
