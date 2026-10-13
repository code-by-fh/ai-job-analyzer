"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/useI18n";
import {
  hasScheduleErrors,
  ScheduleFields,
  scheduleDraftOf,
  scheduleErrors,
  schedulePatch,
  type ScheduleDraft,
  type ScheduleErrors,
} from "./ScheduleFields";
import { DrawerSection, type SectionProps } from "./DrawerSection";
import { useSectionForm, type SectionForm } from "./useSectionForm";
import { sectionFieldErrors, useSectionSave } from "./useSectionSave";

const SECTION = "schedule";
const ID_PREFIX = "src-schedule";

/** "Days without time" comes back on schedule_time, so it reads as the time field's error. */
function serverErrors(error: unknown): ScheduleErrors {
  const fields = sectionFieldErrors(error);
  return {
    time: fields.includes("schedule_time") ? "sources.error.time" : undefined,
    days: fields.includes("schedule_days") ? "sources.error.days" : undefined,
  };
}

/** Client check first, then one PATCH with both halves (D6); nothing changed sends nothing. */
function useScheduleSubmit(form: SectionForm<ScheduleDraft>, platformId: number) {
  const save = useSectionSave(platformId);
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = scheduleErrors(form.draft);
    setErrors(found);
    if (hasScheduleErrors(found) || !form.dirty) return;
    save.mutate(schedulePatch(form.draft), {
      onSuccess: (saved) => form.commit(scheduleDraftOf(saved)),
      onError: (error) => setErrors(serverErrors(error)),
    });
  };
  return { submit, errors, busy: save.isPending };
}

/** D5/D6: Zeitplan, saved on its own. */
export function ScheduleSection({ platform, report }: SectionProps) {
  const { t } = useI18n();
  const form = useSectionForm(scheduleDraftOf(platform), schedulePatch);
  const { submit, errors, busy } = useScheduleSubmit(form, platform.id);
  useEffect(() => report(SECTION, form.dirty), [form.dirty, report]);
  return (
    <DrawerSection
      id={ID_PREFIX}
      title={t("sources.section.schedule")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <ScheduleFields idPrefix={ID_PREFIX} value={form.draft} onChange={form.set} errors={errors} />
    </DrawerSection>
  );
}
