import type { ProfileSection } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";

export const SECTION_LABEL: Readonly<Record<ProfileSection, MessageKey>> = {
  ziel: "profile.section.ziel",
  lebenslauf: "profile.section.lebenslauf",
  nachweise: "profile.section.nachweise",
  vorlagen: "profile.section.vorlagen",
};

export const SECTION_INTRO: Readonly<Record<ProfileSection, MessageKey>> = {
  ziel: "profile.intro.ziel",
  lebenslauf: "profile.intro.lebenslauf",
  nachweise: "profile.intro.nachweise",
  vorlagen: "profile.intro.vorlagen",
};

/** The focus target after an item of the section disappears (Global Constraints, Focus). */
export const profileHeadingId = (section: ProfileSection) => `profile-${section}-h`;
