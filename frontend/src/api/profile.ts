import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { postForm } from "./files";
import { api } from "./instance";
import { SETTINGS_PATH, UPLOAD_CV_PATH } from "./profilePaths";
import { queryKeys } from "./queryKeys";

// Legacy rows hold nulls, {} or entries with missing keys; the form always gets strings and lists.
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");
// cv_data is a free JSON column that the old CV import filled with unvalidated AI answers, which
// may hold a year as a number or a list of technologies: keep both as text instead of dropping
// them on the next save.
const LIST_JOINER = ", ";
type EntryValue = string | number | string[] | null | undefined;

function asText(value: EntryValue): string {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join(LIST_JOINER) : String(value);
}

const entryText = z
  .union([z.string(), z.number(), z.array(z.string())])
  .nullish()
  .catch(null)
  .transform(asText);
// An odd shape in a free JSON column reads as empty, not as a broken profile; one odd item is
// dropped without emptying its list.
const listOf = <T extends z.ZodType>(item: T) =>
  z
    .array(item.nullable().catch(null))
    .nullish()
    .catch(null)
    .transform((values) => (values ?? []).filter((value) => value !== null) as z.output<T>[]);

const experienceSchema = z.object({
  company: entryText,
  role: entryText,
  duration: entryText,
  description: entryText,
});
const projectSchema = z.object({ name: entryText, tech_stack: entryText, description: entryText });
const cvDataSchema = z.object({
  experience: listOf(experienceSchema),
  projects: listOf(projectSchema),
  education: entryText,
});
type CvDataShape = z.infer<typeof cvDataSchema>;

/** A new empty CV each call, so no profile ever shares (and mutates) the same lists. */
function emptyCv(): CvDataShape {
  return { experience: [], projects: [], education: "" };
}

/** Read-only reference value; the profile query never hands this object out. */
export const EMPTY_CV: Readonly<CvDataShape> = Object.freeze(emptyCv());

// Only profile fields: zod drops every other key, so secrets and notification settings that
// GET /settings also returns are never read, kept or sent back (spec B2, Review Focus 1).
const profileSchema = z.object({
  role: text,
  skills: text,
  min_salary: text,
  location: text,
  preferences: text,
  spoken_languages: listOf(z.string()),
  cv_data: cvDataSchema
    .nullish()
    .catch(null)
    .transform((value) => value ?? emptyCv()),
  cv_template: z.string().nullish(),
  cover_letter_template: z.string().nullish(),
});
// The server answers {status: "saved"}; nothing in it is read.
const anyBodySchema = z.unknown();

export type Profile = z.infer<typeof profileSchema>;
export type ProfileBody = z.input<typeof profileSchema>;
export type CvData = Profile["cv_data"];
export type Experience = CvData["experience"][number];
export type Project = CvData["projects"][number];
export type GoalFields = Pick<
  Profile,
  "role" | "skills" | "min_salary" | "location" | "preferences" | "spoken_languages"
>;
export type ProfilePatch = Partial<GoalFields> | { cv_data: CvData };

export function profileQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.profile,
    queryFn: () => api.request(SETTINGS_PATH, profileSchema),
  });
}

/** One section's fields; the server writes only the keys present (B2). */
export async function saveProfile(patch: ProfilePatch): Promise<void> {
  await api.request(SETTINGS_PATH, anyBodySchema, { method: "POST", json: patch });
}

// POST /settings/upload-cv answers with what it stored. Partial: only the keys the server sends
// are adopted, so an answer without one never blanks a field.
const importAnswerSchema = z.object({
  data: profileSchema
    .pick({ role: true, skills: true, min_salary: true, location: true, cv_data: true })
    .partial(),
});

export type ImportedProfile = z.infer<typeof importAnswerSchema>["data"];

/**
 * The server parses and stores the CV itself and answers with the stored values. Refusals:
 * 413/415, 422 `cv_no_text` on `file`, 502 `cv_parse_failed` (REFUSAL in profilePaths.ts).
 */
export async function importCv(file: File): Promise<ImportedProfile> {
  const form = new FormData();
  form.append("file", file);
  const answer = await postForm(UPLOAD_CV_PATH, form, importAnswerSchema);
  return answer.data;
}
