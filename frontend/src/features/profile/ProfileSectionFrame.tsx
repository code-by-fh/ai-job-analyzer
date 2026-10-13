"use client";

import type { ReactNode } from "react";
import type { ProfileSection } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { SectionFrame } from "@/ui/SectionFrame";
import { profileHeadingId, SECTION_INTRO, SECTION_LABEL } from "./labels";

interface ProfileSectionFrameProps {
  section: ProfileSection;
  children?: ReactNode;
}

/** The open section's heading (a focus target, tabIndex -1) and its one-line intro. */
export function ProfileSectionFrame({ section, children }: ProfileSectionFrameProps) {
  const { t } = useI18n();
  return (
    <SectionFrame
      headingId={profileHeadingId(section)}
      label={t(SECTION_LABEL[section])}
      intro={t(SECTION_INTRO[section])}
      classPrefix="profile"
    >
      {children}
    </SectionFrame>
  );
}
