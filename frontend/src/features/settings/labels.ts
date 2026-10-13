import type { SettingsSection } from "@/domain/settings";
import type { MessageKey } from "@/i18n/de";

export const SECTION_LABEL: Readonly<Record<SettingsSection, MessageKey>> = {
  general: "settings.section.general",
  notifications: "settings.section.notifications",
  account: "settings.section.account",
  ai: "settings.section.ai",
  users: "settings.section.users",
  system: "settings.section.system",
};

export const SECTION_INTRO: Readonly<Record<SettingsSection, MessageKey>> = {
  general: "settings.intro.general",
  notifications: "settings.intro.notifications",
  account: "settings.intro.account",
  ai: "settings.intro.ai",
  users: "settings.intro.users",
  system: "settings.intro.system",
};

/** The focus target after an item of the section disappears. */
export const settingsHeadingId = (section: SettingsSection) => `settings-${section}-h`;
