"use client";

import { PreferenceSegs } from "@/features/shell/PreferenceOptions";
import { useI18n } from "@/i18n/useI18n";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { TimeZoneField } from "./TimeZoneField";

/**
 * Usability #20: the same segs as the mobile "Mehr" sheet over the same stores, so this section
 * and the user menu always agree.
 */
function PreferencesBlock() {
  const { t } = useI18n();
  return (
    <div className="settings-block">
      <h3 className="sec-title-sm">{t("settings.general.appearance")}</h3>
      <PreferenceSegs />
      <p className="hint">{t("settings.general.languageHint")}</p>
    </div>
  );
}

/** D3: every control here applies at once; there is no draft and no "Speichern". */
export function GeneralSection() {
  return (
    <SettingsSectionFrame section="general">
      <div className="form-max">
        <PreferencesBlock />
        <TimeZoneField />
      </div>
    </SettingsSectionFrame>
  );
}
