"use client";

import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { AiErrorBlock } from "./AiErrorBlock";
import { MaintenanceBlock } from "./MaintenanceBlock";
import { WipeDatabase } from "./WipeDatabase";

/**
 * Systemfehler (D6): the stored AI error, the crawl clean-up and the database wipe. Ruling 33
 * (provisional 7b-Q3): the stored AI error shows only here, there is no app-wide banner.
 */
export function SystemSection() {
  return (
    <SettingsSectionFrame section="system">
      <div className="form-max">
        <AiErrorBlock />
        <MaintenanceBlock />
        <WipeDatabase />
      </div>
    </SettingsSectionFrame>
  );
}
