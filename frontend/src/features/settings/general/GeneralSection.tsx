"use client";

import { PreferenceSegs } from "@/features/shell/PreferenceOptions";
import { useI18n } from "@/i18n/useI18n";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { DriveCallbackNotice } from "./DriveCallbackNotice";
import { StorageSettings } from "./StorageSettings";
import { TimeZoneField } from "./TimeZoneField";
import { useDriveCallback } from "./useDriveCallback";

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

/**
 * D3: every control here applies at once; there is no draft and no "Speichern". Ruling 39: the
 * OAuth callback is read here, since the server's redirect never names a section.
 */
export function GeneralSection() {
  const driveCallback = useDriveCallback();
  return (
    <SettingsSectionFrame section="general">
      <div className="form-max">
        <DriveCallbackNotice outcome={driveCallback} />
        <PreferencesBlock />
        <TimeZoneField />
        <StorageSettings />
      </div>
    </SettingsSectionFrame>
  );
}
