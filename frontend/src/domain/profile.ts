import type { CvData, Profile } from "@/api/profile";

/** The Profil page; the shell navigation links here too (features/shell/navigation.ts). */
export const PROFILE_HREF = "/profile";
export const PROFILE_SECTIONS = ["ziel", "lebenslauf", "nachweise", "vorlagen"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export const DEFAULT_SECTION: ProfileSection = "ziel";
const SECTION_PARAM = "section";
const SKILL_SEPARATOR = ",";
const SKILL_JOINER = ", ";

export function sectionFromParam(value: string | null): ProfileSection {
  return PROFILE_SECTIONS.find((section) => section === value) ?? DEFAULT_SECTION;
}

/** D1: the default section has no parameter. */
export function profileHref(section: ProfileSection): string {
  if (section === DEFAULT_SECTION) return PROFILE_HREF;
  return `${PROFILE_HREF}?${new URLSearchParams({ [SECTION_PARAM]: section }).toString()}`;
}

/** The first spelling of each item wins; "Java" after "java" is the same chip. */
export function withoutCaseDuplicates(items: readonly string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The server stores skills as one comma separated string. */
export function splitSkills(skills: string): string[] {
  const items = skills.split(SKILL_SEPARATOR).map((item) => item.trim());
  return withoutCaseDuplicates(items.filter((item) => item.length > 0));
}

export function joinSkills(items: readonly string[]): string {
  return items.join(SKILL_JOINER);
}

export type ChipProblem = "empty" | "duplicate" | "tooLong" | "full" | "comma";

export interface ChipLimits {
  maxItems: number;
  maxLength: number;
  /** Skills: a comma would split one chip into two on the next load. */
  noComma?: boolean;
}

/** Why a chip cannot be added, or null when it can. */
export function chipProblem(
  items: readonly string[],
  value: string,
  limits: ChipLimits,
): ChipProblem | null {
  const chip = value.trim();
  if (!chip) return "empty";
  if (limits.noComma && chip.includes(SKILL_SEPARATOR)) return "comma";
  if (chip.length > limits.maxLength) return "tooLong";
  if (items.some((item) => item.toLowerCase() === chip.toLowerCase())) return "duplicate";
  return items.length >= limits.maxItems ? "full" : null;
}

export type CvGap = "role" | "skills" | "experience" | "results" | "education";
type GapInput = Pick<Profile, "role" | "skills" | "cv_data">;

const blank = (value: string) => value.trim().length === 0;

/** Usability #26: what the AI misses, read from the stored profile (D7). */
export function cvGaps(profile: GapInput): CvGap[] {
  const { experience, education } = profile.cv_data;
  const gaps: CvGap[] = [];
  if (blank(profile.role)) gaps.push("role");
  if (blank(profile.skills)) gaps.push("skills");
  if (experience.length === 0) gaps.push("experience");
  else if (experience.some((entry) => blank(entry.description))) gaps.push("results");
  if (blank(education)) gaps.push("education");
  return gaps;
}

type ImportedText = "role" | "skills" | "location" | "min_salary";
type ImportTarget = Pick<Profile, ImportedText | "cv_data">;
/**
 * UserProfile's column defaults (server/database/core.py): a fresh row holds them although the
 * user never entered them, so they are no reason to ask before an import (ruling R10).
 */
const SERVER_DEFAULT_ROLE = "Software Engineer";
const SERVER_DEFAULT_SKILLS = "Python, Docker";
const SERVER_DEFAULT_LOCATION = "Remote";
const SERVER_DEFAULT_MIN_SALARY = "60000";
const SERVER_DEFAULTS: Readonly<Record<ImportedText, string>> = {
  role: SERVER_DEFAULT_ROLE,
  skills: SERVER_DEFAULT_SKILLS,
  location: SERVER_DEFAULT_LOCATION,
  min_salary: SERVER_DEFAULT_MIN_SALARY,
};
const IMPORTED_TEXTS = Object.keys(SERVER_DEFAULTS) as ImportedText[];

function enteredByUser(profile: ImportTarget, field: ImportedText): boolean {
  const value = profile[field].trim();
  return value.length > 0 && value !== SERVER_DEFAULTS[field];
}

/** D6: whether an import would replace something the user already entered. */
export function hasCvContent(profile: ImportTarget): boolean {
  const { experience, projects, education } = profile.cv_data;
  const filled = IMPORTED_TEXTS.some((field) => enteredByUser(profile, field)) || !blank(education);
  return filled || experience.length > 0 || projects.length > 0;
}

function trimmed<T extends Record<string, string>>(entry: T): T {
  return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.trim()])) as T;
}

function filledEntries<T extends Record<string, string>>(entries: readonly T[]): T[] {
  return entries.map(trimmed).filter((entry) => Object.values(entry).some((value) => value));
}

/** D5: what a save sends; entirely blank entries are dropped. */
export function cleanCv(cv: CvData): CvData {
  return {
    experience: filledEntries(cv.experience),
    projects: filledEntries(cv.projects),
    education: cv.education.trim(),
  };
}

export type ProfileField =
  "role" | "skills" | "min_salary" | "location" | "preferences" | "spoken_languages" | "cv_data";

const PROFILE_FIELDS: readonly ProfileField[] = [
  "role",
  "skills",
  "min_salary",
  "location",
  "preferences",
  "spoken_languages",
  "cv_data",
];

/** A 422 location ("cv_data.experience.3.description") onto the form field it belongs to. */
export function toProfileField(serverField: string): ProfileField | null {
  const head = serverField.split(".")[0];
  return PROFILE_FIELDS.find((field) => field === head) ?? null;
}
