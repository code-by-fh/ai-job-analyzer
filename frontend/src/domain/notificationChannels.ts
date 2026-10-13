// Runtime imports stay relative: e2e fixtures load this module outside the app's path aliases.
import type { NotificationPatch, NotificationSettings } from "@/api/notificationSettings";
import type { NotifyChannel } from "@/api/platformPaths";
import {
  CHANNEL_FIELDS,
  EMAIL_FIELDS,
  NOTIFICATION_LIMITS,
  REQUIRED_FIELDS,
  SECRET_FIELDS,
  type ChannelField,
  type PlainField,
  type SecretField,
} from "../api/settingsPaths";

/** What a channel form edits: every value as text; secrets start empty (write-only). */
export type ChannelDraft = Partial<Record<ChannelField, string>>;
export type ChannelProblem = "required" | "email" | "port" | "tooLong";

// core.py EMAIL_PATTERN, applied to the trimmed text as pydantic does (strip_whitespace).
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DIGITS = /^\d+$/;
export const PORT_FIELD: ChannelField = "smtp_port";
const HOST_FIELD: ChannelField = "smtp_host";

/** Write-only fields: never read back, sent only when typed. */
export const isSecretField = (field: ChannelField): field is SecretField =>
  (SECRET_FIELDS as readonly string[]).includes(field);
/** Address fields, checked by emailProblem. */
export const isEmailField = (field: ChannelField): boolean =>
  (EMAIL_FIELDS as readonly string[]).includes(field);

function storedText(settings: NotificationSettings, field: PlainField): string {
  const value = settings[field];
  return value === null ? "" : String(value);
}

export function channelDraftOf(
  channel: NotifyChannel,
  settings: NotificationSettings,
): ChannelDraft {
  return Object.fromEntries(
    CHANNEL_FIELDS[channel].map((field) => [
      field,
      isSecretField(field) ? "" : storedText(settings, field as PlainField),
    ]),
  );
}

/** A secret is sent as typed (spaces may belong to it); plain values are trimmed like the server does. */
function typedValue(field: ChannelField, raw: string): string {
  return isSecretField(field) ? raw : raw.trim();
}

// The server refuses "" for every field (core.py): a cleared field is sent as null.
function sentValue(field: ChannelField, text: string): string | number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return field === PORT_FIELD ? Number(trimmed) : trimmed;
}

/** Changed plain fields (cleared -> null) and typed secrets only (B2, write-only secrets). */
export function channelPatch(
  channel: NotifyChannel,
  draft: ChannelDraft,
  settings: NotificationSettings,
): NotificationPatch {
  const patch: NotificationPatch = {};
  for (const field of CHANNEL_FIELDS[channel]) {
    const raw = draft[field] ?? "";
    if (isSecretField(field)) {
      if (raw.trim()) patch[field] = raw;
    } else if (raw.trim() !== storedText(settings, field as PlainField)) {
      patch[field] = sentValue(field, raw);
    }
  }
  return patch;
}

export function removalPatch(channel: NotifyChannel): NotificationPatch {
  return Object.fromEntries(CHANNEL_FIELDS[channel].map((field) => [field, null]));
}

/** The check of an address field (also the test recipient and the default recipient); empty is no problem. */
export function emailProblem(text: string): ChannelProblem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTIFICATION_LIMITS.email) return "tooLong";
  return EMAIL_SHAPE.test(trimmed) ? null : "email";
}

function portProblem(text: string): ChannelProblem | null {
  if (!DIGITS.test(text)) return "port";
  const port = Number(text);
  const inRange = port >= NOTIFICATION_LIMITS.portMin && port <= NOTIFICATION_LIMITS.portMax;
  return inRange ? null : "port";
}

function valueProblem(field: ChannelField, value: string): ChannelProblem | null {
  if (field === PORT_FIELD) return portProblem(value);
  if (isEmailField(field)) return emailProblem(value);
  const limit = field === HOST_FIELD ? NOTIFICATION_LIMITS.host : NOTIFICATION_LIMITS.credential;
  return value.length > limit ? "tooLong" : null;
}

export interface ChannelCheck {
  channel: NotifyChannel;
  draft: ChannelDraft;
  settings: NotificationSettings;
}

/**
 * Ruling 14: a field the server predicate needs is required whether or not the channel is
 * configured, so a save never half-deletes a channel; a stored secret counts as present.
 */
function fieldProblem(field: ChannelField, check: ChannelCheck): ChannelProblem | null {
  const raw = check.draft[field] ?? "";
  const blank = raw.trim() === "";
  const stored = isSecretField(field) && check.settings[field];
  if (blank && !stored && REQUIRED_FIELDS[check.channel].includes(field)) return "required";
  return blank ? null : valueProblem(field, typedValue(field, raw));
}

/** Client check before a save; the server applies the same limits (422 on the field). */
export function channelErrors(check: ChannelCheck): Partial<Record<ChannelField, ChannelProblem>> {
  const errors: Partial<Record<ChannelField, ChannelProblem>> = {};
  for (const field of CHANNEL_FIELDS[check.channel]) {
    const problem = fieldProblem(field, check);
    if (problem) errors[field] = problem;
  }
  return errors;
}

const DETAIL_FIELD: Readonly<Record<NotifyChannel, PlainField | null>> = {
  PUSHOVER: null,
  RESEND: "resend_from_email",
  MAILJET: "mailjet_from_email",
  SMTP: "smtp_host",
};

/** The non-secret detail of the "Eingerichtet · …" line, or null. */
export function channelDetail(
  channel: NotifyChannel,
  settings: NotificationSettings,
): string | null {
  const field = DETAIL_FIELD[channel];
  return field ? storedText(settings, field) || null : null;
}
