"use client";

import { useQuery } from "@tanstack/react-query";
import { aiSettingsQueryOptions } from "@/api/admin";
import { SectionState } from "@/features/profile/SectionState";
import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { CloudProviderForm } from "./CloudProviderForm";
import { LocalProviderForm } from "./LocalProviderForm";
import { RoutingForm } from "./RoutingForm";

/** KI (D2, D4): the providers and the task routing; the query lives here, so only an admin who opens it sends it (ruling 18). */
export function AiSection({ report }: SettingsSectionProps) {
  const query = useQuery(aiSettingsQueryOptions());
  return (
    <SettingsSectionFrame section="ai">
      <div className="form-max">
        <SectionState query={query}>
          {(settings) => (
            <>
              <CloudProviderForm {...{ settings, report }} revision={query.dataUpdatedAt} />
              <LocalProviderForm {...{ settings, report }} revision={query.dataUpdatedAt} />
              <RoutingForm settings={settings} report={report} />
            </>
          )}
        </SectionState>
      </div>
    </SettingsSectionFrame>
  );
}
