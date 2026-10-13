"use client";

import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import type { CvData, Experience, Project } from "@/api/profile";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import { cleanCv, type ProfileField } from "@/domain/profile";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField } from "@/ui/Field";
import { isFocusLost } from "@/ui/focus";
import { Notice } from "@/ui/Notice";
import { useProfileSave } from "../useProfileSave";
import { EntryList, LIST_REFUSED, listHeadingId } from "./EntryList";
import {
  EMPTY_EXPERIENCE,
  EMPTY_PROJECT,
  EXPERIENCE_FIELDS,
  experienceSummary,
  PROJECT_FIELDS,
  projectSummary,
} from "./entryFields";

const CV_FIELD: ProfileField = "cv_data";
const CV_SHOWN: readonly ProfileField[] = [CV_FIELD];
const CV_PATH_PREFIX = `${CV_FIELD}.`;
const EDUCATION_ROWS = 3;
const EXPERIENCE_LIST_ID = "pf-cv-exp";
const PROJECT_LIST_ID = "pf-cv-projects";
type CvList = "experience" | "projects";
const CV_LISTS: readonly string[] = ["experience", "projects"] satisfies CvList[];

/** Closes the open entry editors by remounting the lists (their editing state goes with them). */
export interface ListsReset {
  generation: number;
  /** Runs `change` and the remount in one render; focus that was inside goes to the first list. */
  reset: (change?: () => void) => void;
}

/**
 * Indices of open editors stop matching once entries are dropped or replaced, so the editors close
 * then; a focused field that went with them hands focus to the first list's heading, never body.
 */
export function useListsReset(): ListsReset {
  const [generation, setGeneration] = useState(0);
  const reset = (change?: () => void) => {
    flushSync(() => {
      change?.();
      setGeneration((value) => value + 1);
    });
    if (isFocusLost()) document.getElementById(listHeadingId(EXPERIENCE_LIST_ID))?.focus();
  };
  return { generation, reset };
}

const dropsEntries = (draft: CvData, cleaned: CvData) =>
  draft.experience.length !== cleaned.experience.length ||
  draft.projects.length !== cleaned.projects.length;

/** Ruling R14 (f): a list over the limit is not "too long" text; each cause gets its sentence. */
function cvRefusalSentence(refused: readonly string[], t: Translate): string {
  const sentences: string[] = [];
  if (refused.some((path) => CV_LISTS.includes(path)))
    sentences.push(t("profile.cv.refusedList", { max: PROFILE_LIMITS.cvEntries }));
  if (refused.some((path) => !CV_LISTS.includes(path))) sentences.push(t("profile.cv.refused"));
  return sentences.join(" ");
}

/**
 * Where a 422 refused the CV, relative to cv_data ("projects.0.tech_stack", "education"), so the
 * form marks the field; a refusal of cv_data as a whole keeps its own name. Server text is dropped.
 */
function cvRefusals(error: unknown): string[] {
  return fieldErrorsFrom(error, (field) => {
    if (field === CV_FIELD) return CV_FIELD;
    return field.startsWith(CV_PATH_PREFIX) ? field.slice(CV_PATH_PREFIX.length) : null;
  });
}

/** One list's refusals: "3.description" for a field, LIST_REFUSED for the list itself. */
function refusalsIn(paths: readonly string[], list: CvList): string[] {
  const prefix = `${list}.`;
  return paths.flatMap((path) => {
    if (path === list) return [LIST_REFUSED];
    return path.startsWith(prefix) ? [path.slice(prefix.length)] : [];
  });
}

/** B2: one partial POST with cv_data alone, replaced as a whole; blank entries are dropped (D5). */
function useCvSubmit({ form, lists }: CvFormProps) {
  const save = useProfileSave(CV_SHOWN);
  const [refused, setRefused] = useState<string[]>([]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRefused([]);
    if (!form.dirty) return;
    const cv_data = cleanCv(form.draft);
    // The draft takes the sent lists, so the indices of a 422 point at the entries shown.
    if (dropsEntries(form.draft, cv_data)) lists.reset(() => form.set(cv_data));
    else form.set(cv_data);
    save.mutate(
      { cv_data },
      { onSuccess: () => form.commit(cv_data), onError: (error) => setRefused(cvRefusals(error)) },
    );
  };
  return { submit, refused, clear: () => setRefused([]), busy: save.isPending };
}

interface CvPartProps {
  form: SectionForm<CvData>;
  refused: readonly string[];
  /** A removed entry shifts the indices a refusal names, so the refusals go with it. */
  onShrink: () => void;
}

function useListChange(props: CvPartProps) {
  const { form, onShrink } = props;
  const shrinks = (before: readonly unknown[], after: readonly unknown[]) => {
    if (after.length < before.length) onShrink();
  };
  return {
    experience: (experience: Experience[]) => {
      shrinks(form.draft.experience, experience);
      form.set({ experience });
    },
    projects: (projects: Project[]) => {
      shrinks(form.draft.projects, projects);
      form.set({ projects });
    },
  };
}

interface CvFormProps {
  form: SectionForm<CvData>;
  lists: ListsReset;
}

/** D5: Berufserfahrung, Projekte, then Ausbildung, saved together by one Speichern. */
export function CvForm(props: CvFormProps) {
  const { t } = useI18n();
  const { form, lists } = props;
  const { submit, refused, clear, busy } = useCvSubmit(props);
  const parts: CvPartProps = { form, refused, onShrink: clear };
  return (
    <DrawerSection
      id="pf-cv"
      title={t("profile.cv.title")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      {refused.length > 0 ? <Notice tone="error">{cvRefusalSentence(refused, t)}</Notice> : null}
      <CvLists key={lists.generation} {...parts} />
      <EducationField {...parts} />
    </DrawerSection>
  );
}

function CvLists(props: CvPartProps) {
  const change = useListChange(props);
  return (
    <>
      <ExperienceList {...props} onChange={change.experience} />
      <ProjectList {...props} onChange={change.projects} />
    </>
  );
}

function ExperienceList(props: CvPartProps & { onChange: (entries: Experience[]) => void }) {
  const { t } = useI18n();
  return (
    <EntryList
      id={EXPERIENCE_LIST_ID}
      title={t("profile.cv.experience")}
      addLabel="profile.cv.addExperience"
      entries={props.form.draft.experience}
      fields={EXPERIENCE_FIELDS}
      empty={EMPTY_EXPERIENCE}
      summary={experienceSummary}
      onChange={props.onChange}
      refused={refusalsIn(props.refused, "experience")}
    />
  );
}

function ProjectList(props: CvPartProps & { onChange: (entries: Project[]) => void }) {
  const { t } = useI18n();
  return (
    <EntryList
      id={PROJECT_LIST_ID}
      title={t("profile.cv.projects")}
      addLabel="profile.cv.addProject"
      entries={props.form.draft.projects}
      fields={PROJECT_FIELDS}
      empty={EMPTY_PROJECT}
      summary={projectSummary}
      onChange={props.onChange}
      refused={refusalsIn(props.refused, "projects")}
    />
  );
}

function EducationField({ form, refused }: CvPartProps) {
  const { t } = useI18n();
  return (
    <TextAreaField
      id="pf-cv-education"
      label={t("profile.cv.education")}
      error={refused.includes("education") ? t("profile.error.tooLong") : undefined}
      rows={EDUCATION_ROWS}
      maxLength={PROFILE_LIMITS.education}
      value={form.draft.education}
      onChange={(event) => form.set({ education: event.target.value })}
    />
  );
}
