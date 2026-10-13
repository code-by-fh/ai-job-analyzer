"use client";

import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { ArchiveAll } from "./ArchiveAll";
import { FactoryReset } from "./FactoryReset";
import { PasswordForm } from "./PasswordForm";
import { ResetProfile } from "./ResetProfile";

/** Konto (D10): the password, then the clean-up actions, the factory reset last in its own zone. */
export function AccountSection({ report }: SettingsSectionProps) {
  return (
    <SettingsSectionFrame section="account">
      <div className="form-max">
        <PasswordForm report={report} />
        <ArchiveAll />
        <ResetProfile />
        <FactoryReset />
      </div>
    </SettingsSectionFrame>
  );
}
