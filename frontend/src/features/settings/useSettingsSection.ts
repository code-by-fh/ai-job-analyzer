"use client";

import { useSearchParams } from "next/navigation";
import {
  DEFAULT_SETTINGS_SECTION,
  isAdminSection,
  settingsSectionFromParam,
  type SettingsSection,
} from "@/domain/settings";
import { useCurrentUser } from "@/features/shell/useCurrentUser";

/**
 * D1: the open section from `?section=`; an unknown value reads as Allgemein and is not rewritten.
 * Members never get an admin section; an admin URL waits for /me (null) instead of flashing
 * Allgemein, and falls back to it when /me fails.
 */
export function useSettingsSection(): { section: SettingsSection | null } {
  const value = useSearchParams().get("section");
  const user = useCurrentUser();
  if (isAdminSection(value) && !user.data) {
    return { section: user.isError ? DEFAULT_SETTINGS_SECTION : null };
  }
  return { section: settingsSectionFromParam(value, user.data?.is_admin ?? false) };
}
