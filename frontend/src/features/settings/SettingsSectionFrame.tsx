"use client";

import type { ReactNode } from "react";
import type { SettingsSection } from "@/domain/settings";
import { useI18n } from "@/i18n/useI18n";
import { SectionFrame } from "@/ui/SectionFrame";
import { SECTION_INTRO, SECTION_LABEL, settingsHeadingId } from "./labels";

interface SettingsSectionFrameProps {
  section: SettingsSection;
  children?: ReactNode;
}

/** The open section's heading (a focus target, tabIndex -1) and its one-line intro. */
export function SettingsSectionFrame({ section, children }: SettingsSectionFrameProps) {
  const { t } = useI18n();
  return (
    <SectionFrame
      headingId={settingsHeadingId(section)}
      label={t(SECTION_LABEL[section])}
      intro={t(SECTION_INTRO[section])}
      classPrefix="settings"
    >
      {children}
    </SectionFrame>
  );
}
