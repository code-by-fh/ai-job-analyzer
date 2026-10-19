import type { Channel } from "@/api/notificationChannels";
import { notifyChannelOf } from "@/api/notificationPaths";
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

/**
 * What the Benachrichtigungen section edits: the chosen channels by id, and per channel type the
 * template and recipients (sources keep them per type, so two channels of one type share them).
 */
export interface NotifyDraft {
  channelIds: string[];
  templates: Record<NotifyChannel, string | null>;
  recipients: Record<EmailChannel, string>;
}

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
  return { channelIds: platform.notification_channel_ids ?? [], templates, recipients };
}

/** The chosen channels the user still has, in the order of the user's channel list. */
export function chosenChannels(draft: NotifyDraft, channels: readonly Channel[]): Channel[] {
  return channels.filter((channel) => draft.channelIds.includes(channel.id));
}

/** The types of the chosen channels, in the app's order: each gets one template (and recipients). */
export function activeTypes(draft: NotifyDraft, channels: readonly Channel[]): NotifyChannel[] {
  const types = new Set(
    chosenChannels(draft, channels).map((channel) => notifyChannelOf(channel.type)),
  );
  return NOTIFY_CHANNELS.filter((channel) => types.has(channel));
}

/**
 * One section, one PATCH with every notification field (D7). The ids are the user's own channels
 * only (a deleted one would be refused). A type no chosen channel uses keeps its fields hidden, so
 * they go back exactly as stored (never re-parsed, so legacy entries are not rewritten).
 */
export function notifyPatch(
  draft: NotifyDraft,
  stored: Platform,
  channels: readonly Channel[],
): PlatformPatch {
  const active = activeTypes(draft, channels);
  const isOff = (channel: NotifyChannel) => !active.includes(channel);
  const patch: PlatformPatch = {
    notification_channel_ids: chosenChannels(draft, channels).map((channel) => channel.id),
  };
  for (const channel of NOTIFY_CHANNELS) {
    const field = CHANNEL_TEMPLATE_FIELD[channel];
    patch[field] = isOff(channel) ? (stored[field] ?? null) : draft.templates[channel];
  }
  for (const channel of EMAIL_CHANNELS) {
    const field = CHANNEL_RECIPIENTS_FIELD[channel];
    patch[field] = isOff(channel) ? (stored[field] ?? null) : recipientList(draft, channel);
  }
  return patch;
}

/** Empty is null: then the channel's own default recipients get the mail (T16 R4). */
function recipientList(draft: NotifyDraft, channel: EmailChannel): string[] | null {
  const list = parseRecipients(draft.recipients[channel]).list;
  return list.length > 0 ? list : null;
}

function recipientsError(text: string): MessageKey | undefined {
  const { list, invalid } = parseRecipients(text);
  if (invalid) return "sources.error.recipients";
  // The server refuses a longer list with a 422 that only a generic toast could show.
  return list.length > NOTIFICATION_LIMITS.recipients
    ? "sources.error.tooManyRecipients"
    : undefined;
}

/** The recipients of an active email type are optional, but each address must look like one. */
export function notifyErrors(
  draft: NotifyDraft,
  active: readonly NotifyChannel[],
): Partial<Record<EmailChannel, MessageKey>> {
  const errors: Partial<Record<EmailChannel, MessageKey>> = {};
  for (const channel of EMAIL_CHANNELS.filter((email) => active.includes(email))) {
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
