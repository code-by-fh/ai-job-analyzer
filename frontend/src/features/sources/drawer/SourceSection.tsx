"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type ApiErrorCode } from "@/api/errors";
import type { Platform, PlatformPatch } from "@/api/platforms";
import { isName, isPattern } from "@/domain/sources";
import { parseImportUrl } from "@/features/inbox/import/importUrl";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { SourceNameField, UrlPatternField } from "../SourceFields";
import { DrawerSection, type SectionProps } from "./DrawerSection";
import { SuggestName } from "./SuggestName";
import { useSectionForm, type SectionForm } from "./useSectionForm";
import { sectionFieldErrors, useSectionSave } from "./useSectionSave";

const SECTION = "source";
const ID_PREFIX = "src-source";
// Another site or an address that is a source already: the server's 400 belongs to the URL field.
const URL_REFUSED: readonly ApiErrorCode[] = ["BAD_REQUEST"];

interface SourceDraft {
  name: string;
  url: string;
  url_pattern: string;
}

interface SourceErrors {
  name?: MessageKey;
  url?: MessageKey;
  pattern?: MessageKey;
}

function sourceDraftOf(platform: Platform): SourceDraft {
  return {
    name: platform.name,
    url: platform.url,
    url_pattern: platform.url_pattern ?? "",
  };
}

/**
 * Fixed texts per field, never the server's. Only edited fields are checked, so a legacy row whose
 * stored address no longer passes can still be renamed or paused.
 */
function sourceErrors(draft: SourceDraft, changed: Partial<SourceDraft>): SourceErrors {
  return {
    name: "name" in changed && !isName(draft.name) ? "sources.error.name" : undefined,
    url: "url" in changed && !parseImportUrl(draft.url) ? "sources.error.url" : undefined,
    pattern:
      "url_pattern" in changed && !isPattern(draft.url_pattern)
        ? "sources.error.pattern"
        : undefined,
  };
}

function hasSourceErrors(errors: SourceErrors): boolean {
  return Boolean(errors.name ?? errors.url ?? errors.pattern);
}

/** Only the edited keys, trimmed; an unchanged URL is never sent, so it is never re-resolved. */
function sourcePatch(changed: Partial<SourceDraft>): PlatformPatch {
  const patch: PlatformPatch = { ...changed };
  if (changed.name !== undefined) patch.name = changed.name.trim();
  if (changed.url !== undefined) patch.url = parseImportUrl(changed.url) ?? changed.url;
  if (changed.url_pattern !== undefined) patch.url_pattern = changed.url_pattern.trim();
  return patch;
}

function urlError(error: unknown, fields: readonly string[]): MessageKey | undefined {
  if (error instanceof ApiError && URL_REFUSED.includes(error.code)) {
    return "sources.error.urlRefused";
  }
  return fields.includes("url") ? "sources.error.url" : undefined;
}

function serverErrors(error: unknown): SourceErrors {
  const fields = sectionFieldErrors(error);
  return {
    name: fields.includes("name") ? "sources.error.name" : undefined,
    url: urlError(error, fields),
    pattern: fields.includes("url_pattern") ? "sources.error.pattern" : undefined,
  };
}

function useSourceSubmit(form: SectionForm<SourceDraft>, platformId: number) {
  const save = useSectionSave(platformId, URL_REFUSED);
  const [errors, setErrors] = useState<SourceErrors>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changed = form.changed();
    const found = sourceErrors(form.draft, changed);
    setErrors(found);
    if (hasSourceErrors(found) || Object.keys(changed).length === 0) return;
    save.mutate(sourcePatch(changed), {
      // The stored form (trimmed name, canonical address) replaces what was typed.
      onSuccess: (saved) => form.commit(sourceDraftOf(saved)),
      onError: (error) => setErrors(serverErrors(error)),
    });
  };
  return { errors, submit, busy: save.isPending };
}

/**
 * D5: Quelle (name, address, pattern), saved on its own. The pattern is in plain view, as in the
 * wizard, and on/off lives in Zeitplan's one switch (feedback 1, T5).
 */
export function SourceSection({ platform, report }: SectionProps) {
  const { t } = useI18n();
  const form = useSectionForm(sourceDraftOf(platform));
  const section = useSourceSubmit(form, platform.id);
  useEffect(() => report(SECTION, form.dirty), [form.dirty, report]);
  return (
    <DrawerSection
      id={ID_PREFIX}
      title={t("sources.section.source")}
      onSubmit={section.submit}
      busy={section.busy}
      dirty={form.dirty}
    >
      <SourceFields platformId={platform.id} form={form} errors={section.errors} />
    </DrawerSection>
  );
}

interface SourceFieldsProps {
  platformId: number;
  form: SectionForm<SourceDraft>;
  errors: SourceErrors;
}

function SourceFields({ platformId, form, errors }: SourceFieldsProps) {
  return (
    <>
      <NameField platformId={platformId} form={form} error={errors.name} />
      <UrlField form={form} error={errors.url} />
      <UrlPatternField
        id={`${ID_PREFIX}-pattern`}
        value={form.draft.url_pattern}
        onChange={(pattern) => form.set({ url_pattern: pattern })}
        error={errors.pattern}
      />
    </>
  );
}

interface FieldPartProps {
  form: SectionForm<SourceDraft>;
  error: MessageKey | undefined;
}

function NameField({ platformId, form, error }: FieldPartProps & { platformId: number }) {
  return (
    <SourceNameField
      id={`${ID_PREFIX}-name`}
      value={form.draft.name}
      onChange={(name) => form.set({ name })}
      error={error}
    >
      <SuggestName platformId={platformId} onStored={(name) => form.rebase({ name })} />
    </SourceNameField>
  );
}

function UrlField({ form, error }: FieldPartProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={`${ID_PREFIX}-url`}
      type="url"
      label={t("sources.field.url")}
      hint={t("sources.field.urlHint")}
      value={form.draft.url}
      onChange={(event) => form.set({ url: event.target.value })}
      error={error ? t(error) : undefined}
    />
  );
}
