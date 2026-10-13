import type { Experience, Project } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";

/** One input of a CV entry editor; `max` mirrors the server's limit for that key. */
export interface EntryField<T> {
  key: keyof T & string;
  label: MessageKey;
  max: number;
  multiline?: boolean;
  hint?: MessageKey;
}

/** What an entry's read view shows. */
export interface EntrySummary {
  title: string;
  sub: string;
  text: string;
}

export const EMPTY_EXPERIENCE: Experience = {
  company: "",
  role: "",
  duration: "",
  description: "",
};
export const EMPTY_PROJECT: Project = { name: "", tech_stack: "", description: "" };

export const EXPERIENCE_FIELDS: readonly EntryField<Experience>[] = [
  { key: "role", label: "profile.cv.exp.role", max: PROFILE_LIMITS.entryTitle },
  { key: "company", label: "profile.cv.exp.company", max: PROFILE_LIMITS.entryTitle },
  { key: "duration", label: "profile.cv.exp.duration", max: PROFILE_LIMITS.entryDuration },
  {
    key: "description",
    label: "profile.cv.description",
    max: PROFILE_LIMITS.entryText,
    multiline: true,
    hint: "profile.cv.descriptionHint",
  },
];

// Preflight R9: the server bounds tech_stack like a title (EntryTitle, 200).
export const PROJECT_FIELDS: readonly EntryField<Project>[] = [
  { key: "name", label: "profile.cv.project.name", max: PROFILE_LIMITS.entryTitle },
  { key: "tech_stack", label: "profile.cv.project.tech", max: PROFILE_LIMITS.entryTitle },
  {
    key: "description",
    label: "profile.cv.description",
    max: PROFILE_LIMITS.entryText,
    multiline: true,
  },
];

const SUMMARY_JOINER = " · ";
const joined = (...parts: string[]) => parts.filter((part) => part.trim()).join(SUMMARY_JOINER);

export function experienceSummary(entry: Experience): EntrySummary {
  const role = entry.role.trim();
  return {
    title: role || entry.company,
    // Without a role the employer is the title; it is not repeated below it.
    sub: joined(role ? entry.company : "", entry.duration),
    text: entry.description,
  };
}

export function projectSummary(entry: Project): EntrySummary {
  return { title: entry.name, sub: entry.tech_stack, text: entry.description };
}
