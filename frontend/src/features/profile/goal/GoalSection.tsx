"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { profileQueryOptions, type Profile } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { ProfileField, ProfileSection } from "@/domain/profile";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import { useI18n } from "@/i18n/useI18n";
import type { MessageKey } from "@/i18n/de";
import type { SectionProps } from "../ProfilePage";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { profileFieldErrors, useProfileSave } from "../useProfileSave";
import { useReportDirty } from "../useReportDirty";
import { GOAL_ID, GoalFields, type GoalErrors } from "./GoalFields";
import { goalDraftOf, goalPatch, type GoalDraft } from "./goalDraft";

const SECTION: ProfileSection = "ziel";
const TOO_LONG: MessageKey = "profile.error.tooLong";
const SKILLS_TOO_LONG: MessageKey = "profile.error.skillsTooLong";
// Preflight R8/R9: a stored legacy value over a limit is refused with 422 on its field.
const SERVER_ERROR_TEXT: Readonly<Partial<Record<ProfileField, MessageKey>>> = {
  role: TOO_LONG,
  min_salary: TOO_LONG,
  location: TOO_LONG,
  preferences: TOO_LONG,
  skills: SKILLS_TOO_LONG,
  spoken_languages: "profile.error.languages",
};
const GOAL_FIELDS = Object.keys(SERVER_ERROR_TEXT) as ProfileField[];

/** The joined skills string is what the server bounds; each chip alone may still fit. */
function clientErrors(draft: GoalDraft): GoalErrors {
  const tooLong = goalPatch(draft).skills.length > PROFILE_LIMITS.skills;
  return tooLong ? { skills: SKILLS_TOO_LONG } : {};
}

function serverErrors(error: unknown): GoalErrors {
  const errors: GoalErrors = {};
  for (const field of profileFieldErrors(error)) {
    const message = SERVER_ERROR_TEXT[field];
    if (message) errors[field as keyof GoalDraft] = message;
  }
  return errors;
}

/** Client check first, then one partial POST with Ziel's six fields (B2); clean sends nothing. */
function useGoalSubmit(form: SectionForm<GoalDraft>) {
  const save = useProfileSave(GOAL_FIELDS);
  const [errors, setErrors] = useState<GoalErrors>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = clientErrors(form.draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || !form.dirty) return;
    const patch = goalPatch(form.draft);
    save.mutate(patch, {
      onSuccess: () => form.commit(goalDraftOf(patch)),
      onError: (error) => setErrors(serverErrors(error)),
    });
  };
  return { submit, errors, busy: save.isPending };
}

function GoalForm({ profile, report }: SectionProps & { profile: Profile }) {
  const { t } = useI18n();
  const form = useSectionForm(goalDraftOf(profile), goalPatch);
  const { submit, errors, busy } = useGoalSubmit(form);
  useReportDirty(report, SECTION, form.dirty);
  return (
    <div className="form-max">
      <DrawerSection
        id={GOAL_ID}
        title={t("profile.goal.title")}
        onSubmit={submit}
        busy={busy}
        dirty={form.dirty}
      >
        <GoalFields draft={form.draft} onChange={form.set} errors={errors} />
      </DrawerSection>
    </div>
  );
}

/** D3/D4: Ziel, saved on its own. */
export function GoalSection({ report }: SectionProps) {
  const query = useQuery(profileQueryOptions());
  return (
    <ProfileSectionFrame section={SECTION}>
      <SectionState query={query}>
        {(profile) => <GoalForm profile={profile} report={report} />}
      </SectionState>
    </ProfileSectionFrame>
  );
}
