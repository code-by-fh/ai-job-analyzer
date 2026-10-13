"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type ApiErrorCode } from "@/api/errors";
import type { Platform, PlatformPatch } from "@/api/platforms";
import { isName, MAX_NAME_LENGTH } from "@/domain/sources";
import { parseImportUrl } from "@/features/inbox/import/importUrl";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { CheckField, TextField } from "@/ui/Field";
import { DrawerSection, type SectionProps } from "./DrawerSection";
import { SuggestName } from "./SuggestName";
import { useSectionForm, type SectionForm } from "./useSectionForm";
import { sectionFieldErrors, useSectionSave } from "./useSectionSave";

const SECTION = "source";
const ID_PREFIX = "src-source";
const MAX_PATTERN_LENGTH = 300;
// Another site or an address that is a source already: the server's 400 belongs to the URL field.
const URL_REFUSED: readonly ApiErrorCode[] = ["BAD_REQUEST"];

interface SourceDraft {
  name: string;
  url: string;
  url_pattern: string;
  is_active: boolean;
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
    is_active: platform.is_active,
  };
}

/** The server's pattern rule: "/" alone would match every link of the site. */
function isPattern(text: string): boolean {
  const pattern = text.trim();
  return pattern.replaceAll("/", "") !== "" && pattern.length <= MAX_PATTERN_LENGTH;
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

/** Errors per field; a pattern error opens "Erweitert", so the message is never hidden. */
function useSourceErrors() {
  const [errors, setErrors] = useState<SourceErrors>({});
  const [advanced, setAdvanced] = useState(false);
  const show = (found: SourceErrors) => {
    setErrors(found);
    if (found.pattern) setAdvanced(true);
  };
  return { errors, show, advanced, setAdvanced };
}

function useSourceSubmit(form: SectionForm<SourceDraft>, platformId: number) {
  const save = useSectionSave(platformId, URL_REFUSED);
  const shown = useSourceErrors();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changed = form.changed();
    const found = sourceErrors(form.draft, changed);
    shown.show(found);
    if (hasSourceErrors(found) || Object.keys(changed).length === 0) return;
    save.mutate(sourcePatch(changed), {
      // The stored form (trimmed name, canonical address) replaces what was typed.
      onSuccess: (saved) => form.commit(sourceDraftOf(saved)),
      onError: (error) => shown.show(serverErrors(error)),
    });
  };
  return { ...shown, submit, busy: save.isPending };
}

/** D5: Quelle (name, address, pattern under "Erweitert", active), saved on its own. */
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
      <SourceFields platformId={platform.id} form={form} section={section} />
    </DrawerSection>
  );
}

interface SourceFieldsProps {
  platformId: number;
  form: SectionForm<SourceDraft>;
  section: Pick<ReturnType<typeof useSourceSubmit>, "errors" | "advanced" | "setAdvanced">;
}

function SourceFields({ platformId, form, section }: SourceFieldsProps) {
  return (
    <>
      <NameField platformId={platformId} form={form} error={section.errors.name} />
      <UrlField form={form} error={section.errors.url} />
      <AdvancedFields
        form={form}
        error={section.errors.pattern}
        open={section.advanced}
        onOpenChange={section.setAdvanced}
      />
      <ActiveField form={form} />
    </>
  );
}

interface FieldPartProps {
  form: SectionForm<SourceDraft>;
  error: MessageKey | undefined;
}

function NameField({ platformId, form, error }: FieldPartProps & { platformId: number }) {
  const { t } = useI18n();
  return (
    <div className="src-name-field">
      <TextField
        id={`${ID_PREFIX}-name`}
        label={t("sources.field.name")}
        maxLength={MAX_NAME_LENGTH}
        value={form.draft.name}
        onChange={(event) => form.set({ name: event.target.value })}
        error={error ? t(error) : undefined}
      />
      <SuggestName platformId={platformId} onStored={(name) => form.rebase({ name })} />
    </div>
  );
}

interface AdvancedProps extends FieldPartProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Preflight R-3: controlled, so a pattern error can open it. */
function AdvancedFields({ open, onOpenChange, ...field }: AdvancedProps) {
  const { t } = useI18n();
  return (
    <Disclosure label={t("sources.field.advanced")} open={open} onOpenChange={onOpenChange}>
      <PatternField {...field} />
    </Disclosure>
  );
}

function PatternField({ form, error }: FieldPartProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={`${ID_PREFIX}-pattern`}
      className="code"
      label={t("sources.field.pattern")}
      hint={t("sources.field.patternHint")}
      value={form.draft.url_pattern}
      onChange={(event) => form.set({ url_pattern: event.target.value })}
      error={error ? t(error) : undefined}
    />
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

function ActiveField({ form }: Pick<FieldPartProps, "form">) {
  const { t } = useI18n();
  return (
    <CheckField
      id={`${ID_PREFIX}-active`}
      label={t("sources.field.active")}
      checked={form.draft.is_active}
      onChange={(isActive) => form.set({ is_active: isActive })}
    />
  );
}
