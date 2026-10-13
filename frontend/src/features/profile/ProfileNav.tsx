"use client";

import { PROFILE_SECTIONS, profileHref, type ProfileSection } from "@/domain/profile";
import { useI18n } from "@/i18n/useI18n";
import { SubNav } from "@/ui/SubNav";
import { SECTION_LABEL } from "./labels";

/** D2: links, not tabs: each section is a URL, and the unsaved guard intercepts in-app links. */
export function ProfileNav({ current }: { current: ProfileSection }) {
  const { t } = useI18n();
  return (
    <SubNav
      sections={PROFILE_SECTIONS}
      current={current}
      hrefOf={profileHref}
      labelOf={(section) => t(SECTION_LABEL[section])}
      navLabel={t("profile.nav")}
      classPrefix="profile"
    />
  );
}
