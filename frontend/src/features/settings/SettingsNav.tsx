"use client";

import {
  ADMIN_SECTIONS,
  settingsHref,
  USER_SECTIONS,
  type SettingsSection,
} from "@/domain/settings";
import { useI18n } from "@/i18n/useI18n";
import { SubNav } from "@/ui/SubNav";
import { SECTION_LABEL } from "./labels";

const ADMIN_GROUP_ID = "settings-nav-admin";

interface SettingsNavProps {
  /** null while /me decides whether an admin section may open. */
  current: SettingsSection | null;
  /** D1: the "Administration" group exists for admins only. */
  isAdmin: boolean;
}

/** D2: links, not tabs: each section is a URL, and the unsaved guard intercepts in-app links. */
export function SettingsNav({ current, isAdmin }: SettingsNavProps) {
  const { t } = useI18n();
  const groups = isAdmin
    ? [{ id: ADMIN_GROUP_ID, label: t("settings.nav.admin"), sections: ADMIN_SECTIONS }]
    : [];
  return (
    <SubNav<SettingsSection>
      sections={USER_SECTIONS}
      current={current}
      hrefOf={settingsHref}
      labelOf={(section) => t(SECTION_LABEL[section])}
      navLabel={t("settings.nav")}
      classPrefix="settings"
      groups={groups}
    />
  );
}
