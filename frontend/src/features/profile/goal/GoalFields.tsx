"use client";

import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField, TextField } from "@/ui/Field";
import { ChipListField } from "./ChipListField";
import type { GoalDraft } from "./goalDraft";

export type GoalErrors = Partial<Record<keyof GoalDraft, MessageKey>>;

interface GoalFieldsProps {
  draft: GoalDraft;
  onChange: (patch: Partial<GoalDraft>) => void;
  errors: GoalErrors;
}

/** Prefix of every Ziel id: the form, its heading and its fields. */
export const GOAL_ID = "pf-goal";
const PREFERENCES_ROWS = 4;
// The joined string is what the server bounds (checked on submit); the item count is a loose cap.
const SKILL_LIMITS = {
  maxItems: PROFILE_LIMITS.skills,
  maxLength: PROFILE_LIMITS.skill,
  noComma: true,
};
const LANGUAGE_LIMITS = {
  maxItems: PROFILE_LIMITS.spokenLanguages,
  maxLength: PROFILE_LIMITS.spokenLanguage,
};
const ERROR_VALUES = {
  max: PROFILE_LIMITS.spokenLanguages,
  length: PROFILE_LIMITS.spokenLanguage,
  skillsMax: PROFILE_LIMITS.skills,
};

/** The field's sentence for a client or server refusal, or nothing. */
function useGoalError(errors: GoalErrors) {
  const { t } = useI18n();
  return (key: keyof GoalDraft) => {
    const message = errors[key];
    return message ? t(message, ERROR_VALUES) : undefined;
  };
}

/** Ziel's six fields in the prototype's order. */
export function GoalFields(props: GoalFieldsProps) {
  return (
    <>
      <RoleField {...props} />
      <SkillsField {...props} />
      <SalaryField {...props} />
      <LocationField {...props} />
      <PreferencesField {...props} />
      <LanguagesField {...props} />
    </>
  );
}

function RoleField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <TextField
      id={`${GOAL_ID}-role`}
      label={t("profile.goal.role")}
      hint={t("profile.goal.roleHint")}
      error={error("role")}
      value={draft.role}
      maxLength={PROFILE_LIMITS.role}
      onChange={(event) => onChange({ role: event.target.value })}
    />
  );
}

function SkillsField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <ChipListField
      id={`${GOAL_ID}-skills`}
      label={t("profile.goal.skills")}
      hint={t("profile.goal.skillsHint")}
      error={error("skills")}
      items={draft.skills}
      limits={SKILL_LIMITS}
      onChange={(skills) => onChange({ skills })}
    />
  );
}

function SalaryField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <TextField
      id={`${GOAL_ID}-salary`}
      label={t("profile.goal.minSalary")}
      hint={t("profile.goal.minSalaryHint")}
      error={error("min_salary")}
      inputMode="numeric"
      value={draft.min_salary}
      maxLength={PROFILE_LIMITS.minSalary}
      onChange={(event) => onChange({ min_salary: event.target.value })}
    />
  );
}

function LocationField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <TextField
      id={`${GOAL_ID}-location`}
      label={t("profile.goal.location")}
      hint={t("profile.goal.locationHint")}
      error={error("location")}
      value={draft.location}
      maxLength={PROFILE_LIMITS.location}
      onChange={(event) => onChange({ location: event.target.value })}
    />
  );
}

function PreferencesField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <TextAreaField
      id={`${GOAL_ID}-preferences`}
      label={t("profile.goal.preferences")}
      hint={t("profile.goal.preferencesHint")}
      error={error("preferences")}
      rows={PREFERENCES_ROWS}
      value={draft.preferences}
      maxLength={PROFILE_LIMITS.preferences}
      onChange={(event) => onChange({ preferences: event.target.value })}
    />
  );
}

function LanguagesField({ draft, onChange, errors }: GoalFieldsProps) {
  const { t } = useI18n();
  const error = useGoalError(errors);
  return (
    <ChipListField
      id={`${GOAL_ID}-languages`}
      label={t("profile.goal.languages")}
      hint={t("profile.goal.languagesHint")}
      error={error("spoken_languages")}
      items={draft.spoken_languages}
      limits={LANGUAGE_LIMITS}
      onChange={(spoken_languages) => onChange({ spoken_languages })}
    />
  );
}
