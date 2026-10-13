import type { GoalFields } from "@/api/profile";
import { joinSkills, splitSkills, withoutCaseDuplicates } from "@/domain/profile";

/** Ziel as the form edits it: skills as chips instead of the stored comma separated string. */
export interface GoalDraft {
  role: string;
  skills: string[];
  min_salary: string;
  location: string;
  preferences: string;
  spoken_languages: string[];
}

/** Preflight ruling 28: legacy rows may hold a language twice; chips are keyed by their text. */
export function goalDraftOf(fields: GoalFields): GoalDraft {
  return {
    role: fields.role,
    skills: splitSkills(fields.skills),
    min_salary: fields.min_salary,
    location: fields.location,
    preferences: fields.preferences,
    spoken_languages: withoutCaseDuplicates(fields.spoken_languages),
  };
}

/** D3: what Speichern sends; also the dirty comparison, so trailing spaces alone are not "unsaved". */
export function goalPatch(draft: GoalDraft): GoalFields {
  return {
    role: draft.role.trim(),
    skills: joinSkills(draft.skills),
    min_salary: draft.min_salary.trim(),
    location: draft.location.trim(),
    preferences: draft.preferences.trim(),
    spoken_languages: [...draft.spoken_languages],
  };
}
