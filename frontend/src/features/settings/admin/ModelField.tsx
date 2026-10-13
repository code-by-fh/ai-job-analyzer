"use client";

import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";

export interface ModelFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: MessageKey;
}

/** A provider's model id as text (OpenRouter's until ModelPicker has loaded the list). */
export function ModelField({ id, value, onChange, error }: ModelFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={id}
      autoComplete="off"
      spellCheck={false}
      label={t("settings.ai.model")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error ? t(error) : undefined}
    />
  );
}
