"use client";

import { usePrefetchQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { channelsQueryOptions, channelTypesQueryOptions } from "@/api/notificationChannels";
import { notificationTemplatesQueryOptions } from "@/api/notifications";
import { platformsQueryOptions } from "@/api/platforms";
import { profileTimezoneQueryOptions } from "@/api/settings";
import type { SettingsSection } from "@/domain/settings";
import { SETTINGS_NUMBER } from "@/features/shell/navigation";
import { ListLoading } from "@/features/inbox/InboxList";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useDirtySections, type ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { AccountSection } from "./account/AccountSection";
import { AiSection } from "./admin/AiSection";
import { SystemSection } from "./admin/SystemSection";
import { UsersSection } from "./admin/UsersSection";
import { GeneralSection } from "./general/GeneralSection";
import { NotificationsSection } from "./notifications/NotificationsSection";
import { SettingsNav } from "./SettingsNav";
import { useSettingsSection } from "./useSettingsSection";

/** What every section body receives: the page's one unsaved-changes reporter. */
export interface SettingsSectionProps {
  report: ReportDirty;
}

const SECTION_BODY: Readonly<Record<SettingsSection, (props: SettingsSectionProps) => ReactNode>> =
  {
    general: GeneralSection,
    notifications: NotificationsSection,
    account: AccountSection,
    ai: AiSection,
    users: UsersSection,
    system: SystemSection,
  };

/**
 * Constraint "queries start in parallel": every user section's data is asked for at mount. The
 * admin sections fetch their own data, so a member never sends an admin request (ruling 18).
 */
function usePrefetchSettings(): void {
  usePrefetchQuery(channelTypesQueryOptions());
  usePrefetchQuery(channelsQueryOptions());
  usePrefetchQuery(notificationTemplatesQueryOptions());
  usePrefetchQuery(profileTimezoneQueryOptions());
  usePrefetchQuery(platformsQueryOptions());
}

/** Einstellungen (spec 4.2): masthead, the in-page sub-nav and the open section only (D2). */
export function SettingsPage() {
  const { t } = useI18n();
  const { section } = useSettingsSection();
  const isAdmin = useCurrentUser().data?.is_admin ?? false;
  const { report } = useDirtySections();
  usePrefetchSettings();
  return (
    <div className="page settings">
      <Masthead number={SETTINGS_NUMBER} title={t("nav.settings")} deck={t("settings.deck")} />
      <div className="settings-layout">
        <SettingsNav current={section} isAdmin={isAdmin} />
        <div className="settings-pane">
          <SectionBody section={section} report={report} />
        </div>
      </div>
    </div>
  );
}

/** D1: while /me decides an admin URL, the pane shows the skeleton, never Allgemein. */
function SectionBody({
  section,
  report,
}: { section: SettingsSection | null } & SettingsSectionProps) {
  if (section === null) return <ListLoading stalled={false} />;
  const Body = SECTION_BODY[section];
  return <Body report={report} />;
}
