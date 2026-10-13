"use client";

import { useQuery } from "@tanstack/react-query";
import { profileQueryOptions, type Profile } from "@/api/profile";
import { cleanCv, type ProfileSection } from "@/domain/profile";
import { useSectionForm } from "@/features/sources/drawer/useSectionForm";
import type { SectionProps } from "../ProfilePage";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { useReportDirty } from "../useReportDirty";
import { CvForm, useListsReset } from "./CvForm";
import { CvGapsNotice } from "./CvGapsNotice";
import { CvImport } from "./CvImport";
import { DraftKeptNotice, useImportOverDraft } from "./ImportOverDraft";

const SECTION: ProfileSection = "lebenslauf";

function CvBody({ profile, report }: SectionProps & { profile: Profile }) {
  // cleanCv as the effect: a blank new entry or trailing spaces are not unsaved edits.
  const form = useSectionForm(profile.cv_data, cleanCv);
  useReportDirty(report, SECTION, form.dirty);
  const lists = useListsReset();
  const imported = useImportOverDraft({ form, profile, lists });
  return (
    <div className="form-max cv-body">
      <CvImport profile={profile} dirty={form.dirty} />
      {imported.shown ? <DraftKeptNotice onShowImport={imported.showImport} /> : null}
      <CvGapsNotice profile={profile} />
      <CvForm form={form} lists={lists} />
    </div>
  );
}

/** D5/D7: Lebenslauf, saved on its own, with what the AI still misses above it. */
export function CvSection({ report }: SectionProps) {
  const query = useQuery(profileQueryOptions());
  return (
    <ProfileSectionFrame section={SECTION}>
      <SectionState query={query}>
        {(profile) => <CvBody profile={profile} report={report} />}
      </SectionState>
    </ProfileSectionFrame>
  );
}
