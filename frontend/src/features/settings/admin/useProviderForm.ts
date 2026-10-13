"use client";

import { useState, type FormEvent } from "react";
import type { AiSettings, AiSettingsPatch } from "@/api/admin";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { useReportDirty } from "@/features/profile/useReportDirty";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import type { DraftErrors } from "./providerDrafts";
import { toAiField, useAiSettingsSave } from "./useAiSettingsSave";

/** What each provider form (OpenRouter, the local model) plugs into the shared save flow. */
export interface ProviderFormConfig<T extends object> {
  settings: AiSettings;
  report: ReportDirty;
  /** The unsaved-changes id (ai-cloud, ai-local). */
  dirtyId: string;
  draftOf: (settings: AiSettings) => T;
  errorsOf: (draft: T) => DraftErrors<T>;
  patchOf: (draft: T, settings: AiSettings) => AiSettingsPatch;
  /** Server field -> form field and its fixed text; the server's message is never shown. */
  refusals: Readonly<Record<string, [keyof T, MessageKey]>>;
}

function refusedFields<T extends object>(error: unknown, config: ProviderFormConfig<T>) {
  const fields = fieldErrorsFrom(error, toAiField).filter((field) => field in config.refusals);
  return Object.fromEntries(fields.map((field) => config.refusals[field]!)) as DraftErrors<T>;
}

export interface ProviderForm<T> {
  form: SectionForm<T>;
  errors: DraftErrors<T>;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}

/**
 * D5: the form edits its own copy and is checked before sending (spec 6: field errors on the
 * field). After a save the stored answer becomes the draft (the key input is empty again) and the
 * mutation is dropped, so the typed key does not stay in its variables.
 */
export function useProviderForm<T extends object>(config: ProviderFormConfig<T>): ProviderForm<T> {
  const form = useSectionForm(config.draftOf(config.settings));
  const [errors, setErrors] = useState<DraftErrors<T>>({});
  useReportDirty(config.report, config.dirtyId, form.dirty);
  const save = useAiSettingsSave("settings.ai.saved");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = config.errorsOf(form.draft);
    setErrors(found);
    if (!form.dirty || Object.keys(found).length > 0) return;
    save.mutate(config.patchOf(form.draft, config.settings), {
      onSuccess: (answer) => {
        form.commit(config.draftOf(answer));
        save.reset();
      },
      onError: (error) => setErrors(refusedFields(error, config)),
    });
  };
  return { form, errors, submit, busy: save.isPending };
}
