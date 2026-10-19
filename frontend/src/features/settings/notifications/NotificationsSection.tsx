"use client";

import { useI18n } from "@/i18n/useI18n";
import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { ChannelList } from "./ChannelList";
import { SourceOverview } from "./SourceOverview";
import { TemplateLibrary } from "./templates/TemplateLibrary";

/** Benachrichtigungen: Kanäle (each with its default recipients), Vorlagen, Pro Quelle. */
export function NotificationsSection({ report }: SettingsSectionProps) {
  const { t } = useI18n();
  return (
    <SettingsSectionFrame section="notifications">
      <div className="form-max">
        <section className="settings-block" aria-labelledby="settings-channels-h">
          <h3 id="settings-channels-h" className="sec-title-sm">
            {t("settings.notify.channels")}
          </h3>
          <ChannelList report={report} />
        </section>
        <TemplateLibrary report={report} />
        <SourceOverview />
      </div>
    </SettingsSectionFrame>
  );
}
