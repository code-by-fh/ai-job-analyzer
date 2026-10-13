"use client";

import type { InputHTMLAttributes } from "react";
import type { NotificationSettings } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import { CHANNEL_FIELDS, DEFAULT_SMTP_PORT, type ChannelField } from "@/api/settingsPaths";
import {
  isEmailField,
  isSecretField,
  PORT_FIELD,
  type ChannelDraft,
  type ChannelProblem,
} from "@/domain/notificationChannels";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";

export const FIELD_LABEL: Readonly<Record<ChannelField, MessageKey>> = {
  pushover_user_key: "settings.field.pushover_user_key",
  pushover_api_token: "settings.field.pushover_api_token",
  resend_api_key: "settings.field.resend_api_key",
  resend_from_email: "settings.field.resend_from_email",
  mailjet_api_key: "settings.field.mailjet_api_key",
  mailjet_secret_key: "settings.field.mailjet_secret_key",
  mailjet_from_email: "settings.field.mailjet_from_email",
  smtp_host: "settings.field.smtp_host",
  smtp_port: "settings.field.smtp_port",
  smtp_user: "settings.field.smtp_user",
  smtp_password: "settings.field.smtp_password",
  smtp_from_email: "settings.field.smtp_from_email",
};

export const PROBLEM_TEXT: Readonly<Record<ChannelProblem, MessageKey>> = {
  required: "settings.problem.required",
  email: "settings.problem.email",
  port: "settings.problem.port",
  tooLong: "settings.problem.tooLong",
};

export type ChannelFieldErrors = Partial<Record<ChannelField, ChannelProblem>>;

type InputKind = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "autoComplete" | "placeholder"
>;

/** Secrets are write-only: a password input that never autofills a stored value (R4). */
function inputKind(field: ChannelField): InputKind {
  if (isSecretField(field)) return { type: "password", autoComplete: "new-password" };
  if (isEmailField(field)) return { type: "email", inputMode: "email", autoComplete: "off" };
  if (field === PORT_FIELD)
    return { type: "text", inputMode: "numeric", placeholder: String(DEFAULT_SMTP_PORT) };
  return { type: "text", autoComplete: "off" };
}

/** Only "is one stored" is known about a secret; its value never reaches the browser. */
function secretHint(field: ChannelField, settings: NotificationSettings): MessageKey | null {
  if (!isSecretField(field)) return null;
  return settings[field as keyof NotificationSettings]
    ? "settings.notify.secretStored"
    : "settings.notify.secretMissing";
}

export interface ChannelFieldsProps {
  channel: NotifyChannel;
  settings: NotificationSettings;
  draft: ChannelDraft;
  errors: ChannelFieldErrors;
  onChange: (patch: ChannelDraft) => void;
}

export const channelFieldId = (field: ChannelField) => `settings-chan-${field}`;

/** D5: one field per credential of the channel, in the server's order. */
export function ChannelFields({ channel, settings, draft, errors, onChange }: ChannelFieldsProps) {
  const { t } = useI18n();
  return CHANNEL_FIELDS[channel].map((field) => {
    const hint = secretHint(field, settings);
    const problem = errors[field];
    return (
      <TextField
        key={field}
        id={channelFieldId(field)}
        {...inputKind(field)}
        label={t(FIELD_LABEL[field])}
        hint={hint ? t(hint) : undefined}
        value={draft[field] ?? ""}
        onChange={(event) => onChange({ [field]: event.target.value })}
        error={problem ? t(PROBLEM_TEXT[problem]) : undefined}
      />
    );
  });
}
