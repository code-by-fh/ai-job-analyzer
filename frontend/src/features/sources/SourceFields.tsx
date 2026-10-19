"use client";

import type { ReactNode } from "react";
import { MAX_NAME_LENGTH } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";

// The source fields the add wizard and the drawer share (feedback 1, T5: no duplicated elements).

interface SourceTextFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: MessageKey;
  hint?: string;
  placeholder?: string;
}

type NameFieldProps = SourceTextFieldProps & { children?: ReactNode };

/** The name; the drawer adds "Namen vorschlagen" below it, the wizard a placeholder and a hint. */
export function SourceNameField({ children, ...field }: NameFieldProps) {
  const { t } = useI18n();
  return (
    <div className="src-name-field">
      <TextField
        id={field.id}
        label={t("sources.field.name")}
        hint={field.hint}
        maxLength={MAX_NAME_LENGTH}
        placeholder={field.placeholder}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        error={field.error ? t(field.error) : undefined}
      />
      {children}
    </div>
  );
}

/** The URL pattern in code type; the crawl reads only links that contain it as postings. */
export function UrlPatternField({
  id,
  value,
  onChange,
  error,
}: Omit<SourceTextFieldProps, "hint">) {
  const { t } = useI18n();
  return (
    <TextField
      id={id}
      className="code"
      label={t("sources.field.pattern")}
      hint={t("sources.field.patternHint")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error ? t(error) : undefined}
    />
  );
}
