import type { NotificationTemplate } from "@/api/notifications";
import {
  CHANNEL_RECIPIENTS_FIELD,
  CHANNEL_TEMPLATE_FIELD,
  CHANNEL_TEMPLATE_TYPES,
  NOTIFY_CHANNELS,
  type NotifyChannel,
} from "@/api/platformPaths";
import type { Platform, PlatformPatch } from "@/api/platforms";
import { NOTIFICATION_LIMITS } from "@/api/settingsPaths";
import { parseRecipients } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";

export type EmailChannel = Exclude<NotifyChannel, "PUSHOVER">;
export const EMAIL_CHANNELS: readonly EmailChannel[] = ["RESEND", "MAILJET", "SMTP"];
const LIST = ", ";

export interface NotifyDraft {
  adapters: NotifyChannel[];
  templates: Record<NotifyChannel, string | null>;
  recipients: Record<EmailChannel, string>;
}

const isChannel = (value: string): value is NotifyChannel =>
  (NOTIFY_CHANNELS as readonly string[]).includes(value);

export const isEmailChannel = (channel: NotifyChannel): channel is EmailChannel =>
  channel !== "PUSHOVER";

export function notifyDraftOf(platform: Platform): NotifyDraft {
  const templates = Object.fromEntries(
    NOTIFY_CHANNELS.map((channel) => [channel, platform[CHANNEL_TEMPLATE_FIELD[channel]] ?? null]),
  ) as Record<NotifyChannel, string | null>;
  const recipients = Object.fromEntries(
    EMAIL_CHANNELS.map((channel) => [
      channel,
      (platform[CHANNEL_RECIPIENTS_FIELD[channel]] ?? []).join(LIST),
    ]),
  ) as Record<EmailChannel, string>;
  return {
    adapters: (platform.notification_adapters ?? []).filter(isChannel),
    templates,
    recipients,
  };
}

const isOff = (draft: NotifyDraft, channel: NotifyChannel) => !draft.adapters.includes(channel);

/**
 * One section, one PATCH with every notification field (D7). Adapters keep the server's order.
 * A switched-off channel's fields are hidden, so they go back exactly as stored (never re-parsed,
 * so legacy entries are not rewritten); edits there are neither sent nor unsaved.
 */
export function notifyPatch(draft: NotifyDraft, stored: Platform): PlatformPatch {
  const patch: PlatformPatch = {
    notification_adapters: NOTIFY_CHANNELS.filter((channel) => draft.adapters.includes(channel)),
  };
  for (const channel of NOTIFY_CHANNELS) {
    const field = CHANNEL_TEMPLATE_FIELD[channel];
    patch[field] = isOff(draft, channel) ? (stored[field] ?? null) : draft.templates[channel];
  }
  for (const channel of EMAIL_CHANNELS) {
    const field = CHANNEL_RECIPIENTS_FIELD[channel];
    patch[field] = isOff(draft, channel) ? (stored[field] ?? null) : recipientList(draft, channel);
  }
  return patch;
}

function recipientList(draft: NotifyDraft, channel: EmailChannel): string[] | null {
  const list = parseRecipients(draft.recipients[channel]).list;
  return list.length > 0 ? list : null;
}

function recipientsError(text: string): MessageKey | undefined {
  const { list, invalid } = parseRecipients(text);
  if (list.length === 0 || invalid) return "sources.error.recipients";
  // The server refuses a longer list with a 422 that only a generic toast could show.
  return list.length > NOTIFICATION_LIMITS.recipients
    ? "sources.error.tooManyRecipients"
    : undefined;
}

/**
 * An active email channel needs 1 to 50 recipients, and each address must look like one; off ones
 * are not checked.
 */
export function notifyErrors(draft: NotifyDraft): Partial<Record<EmailChannel, MessageKey>> {
  const errors: Partial<Record<EmailChannel, MessageKey>> = {};
  for (const channel of EMAIL_CHANNELS.filter((email) => !isOff(draft, email))) {
    const error = recipientsError(draft.recipients[channel]);
    if (error) errors[channel] = error;
  }
  return errors;
}

/** G11: there is no SMTP template type, so the email channels share the email templates. */
export function templatesFor(
  channel: NotifyChannel,
  templates: readonly NotificationTemplate[],
): NotificationTemplate[] {
  return templates.filter((template) => CHANNEL_TEMPLATE_TYPES[channel].includes(template.type));
}
