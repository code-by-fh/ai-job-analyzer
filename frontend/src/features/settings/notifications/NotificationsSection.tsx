"use client";

import { useI18n } from "@/i18n/useI18n";
import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { ChannelList } from "./ChannelList";
import { RecipientForm } from "./RecipientForm";
import { SourceOverview } from "./SourceOverview";
import { TemplateLibrary } from "./templates/TemplateLibrary";

/** Benachrichtigungen: Kanäle, Standard-Empfänger, Vorlagen, Pro Quelle (ruling 1.14). */
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
        <RecipientForm report={report} />
        <TemplateLibrary report={report} />
        <SourceOverview />
      </div>
    </SettingsSectionFrame>
  );
}
