"use client";

import { useI18n } from "@/i18n/useI18n";
import { useTheme } from "@/theme/useTheme";
import { Icon } from "@/ui/Icon";
import { THEME_ICON, THEME_LABEL } from "./PreferenceOptions";

/** Sidebar shortcut from the prototype: cycles light, dark, system. */
export function ThemeButton() {
  const { t } = useI18n();
  const { preference, cycle } = useTheme();
  return (
    <button type="button" className="side-btn" onClick={cycle} title={t("theme.cycle")}>
      <Icon icon={THEME_ICON[preference]} />
      <span>{t("theme.label")}</span>
      <span className="end meta faint">{t(THEME_LABEL[preference])}</span>
    </button>
  );
}
