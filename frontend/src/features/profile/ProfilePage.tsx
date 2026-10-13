"use client";

import { usePrefetchQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { profileQueryOptions } from "@/api/profile";
import { profileDocumentsQueryOptions } from "@/api/profileDocuments";
import { setupStatusQueryOptions } from "@/api/setup";
import { documentTemplatesQueryOptions, fileTemplatesQueryOptions } from "@/api/templates";
import type { ProfileSection } from "@/domain/profile";
import { navNumber } from "@/features/shell/navigation";
import { useDirtySections, type ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";
import { AnnouncerContext, createAnnouncer } from "./announcer";
import { CvSection } from "./cv/CvSection";
import { GoalSection } from "./goal/GoalSection";
import { ProfileLiveStatus } from "./ProfileLiveStatus";
import { ProfileNav } from "./ProfileNav";
import { ProofsSection } from "./proofs/ProofsSection";
import { TemplatesSection } from "./templates/TemplatesSection";
import { useProfileSection } from "./useProfileSection";

/** What every section body receives: the page's one unsaved-changes reporter. */
export interface SectionProps {
  report: ReportDirty;
}

const SECTION_BODY: Readonly<Record<ProfileSection, (props: SectionProps) => ReactNode>> = {
  ziel: GoalSection,
  lebenslauf: CvSection,
  nachweise: ProofsSection,
  vorlagen: TemplatesSection,
};

/** Constraint "queries start in parallel": every section's data is asked for at mount. */
function usePrefetchProfile(): void {
  usePrefetchQuery(profileQueryOptions());
  usePrefetchQuery(profileDocumentsQueryOptions());
  usePrefetchQuery(documentTemplatesQueryOptions());
  usePrefetchQuery(fileTemplatesQueryOptions());
  usePrefetchQuery(setupStatusQueryOptions());
}

/** Profil (spec 4.2): masthead, the in-page sub-nav and the open section only (D2). */
export function ProfilePage() {
  const [announcer] = useState(createAnnouncer);
  usePrefetchProfile();
  return (
    <AnnouncerContext value={announcer}>
      <ProfileFrame />
    </AnnouncerContext>
  );
}

function ProfileFrame() {
  const { t } = useI18n();
  const section = useProfileSection();
  const { report } = useDirtySections();
  const Body = SECTION_BODY[section];
  return (
    <div className="page profile">
      <Masthead number={navNumber("profile")} title={t("nav.profile")} deck={t("profile.deck")} />
      <div className="profile-layout">
        <ProfileNav current={section} />
        <div className="profile-pane">
          <Body report={report} />
        </div>
      </div>
      <ProfileLiveStatus />
    </div>
  );
}
