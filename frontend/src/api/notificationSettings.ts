import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import type { NotifyChannel } from "./platformPaths";
import { SETTINGS_PATH } from "./profilePaths";
import { queryKeys } from "./queryKeys";
import {
  NOTIFICATION_SETTINGS_PATH,
  notificationTestPath,
  type ChannelField,
  type PlainField,
} from "./settingsPaths";

// Legacy rows may hold nulls or odd types; an odd value reads as empty instead of failing the section.
const plain = z
  .string()
  .nullish()
  .catch(null)
  .transform((value) => value ?? "");
// The server answers a stored secret as "__masked__": only "is there one" survives parsing, so
// neither the mask nor a value can reach state, the DOM or a request (Global Constraints).
const secretSet = z
  .string()
  .nullish()
  .catch(null)
  .transform((value) => Boolean(value));
const port = z.number().int().nullish().catch(null);

// Only notification fields: zod drops the rest of GET /settings (profile, Drive token, ...).
export const notificationSettingsSchema = z.object({
  pushover_user_key: plain,
  pushover_api_token: secretSet,
  resend_api_key: secretSet,
  resend_from_email: plain,
  mailjet_api_key: secretSet,
  mailjet_secret_key: secretSet,
  mailjet_from_email: plain,
  smtp_host: plain,
  smtp_port: port,
  smtp_user: plain,
  smtp_password: secretSet,
  smtp_from_email: plain,
  email_global_recipient: plain,
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type NotificationSettingsBody = z.input<typeof notificationSettingsSchema>;
/** null clears a field; "" is refused by the server for every field (core.py Credential, HostName, EmailAddress). */
export type NotificationPatch = Partial<Record<ChannelField | PlainField, string | number | null>>;

// Writes and tests answer {status} or {ok}; nothing in them is read.
const anyBodySchema = z.unknown();

export function notificationSettingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => api.request(SETTINGS_PATH, notificationSettingsSchema),
  });
}

/** One channel's (or the recipient's) changed fields; the server writes only the keys sent (B2). */
export async function saveNotificationSettings(patch: NotificationPatch): Promise<void> {
  await api.request(NOTIFICATION_SETTINGS_PATH, anyBodySchema, { method: "POST", json: patch });
}

export interface SettingsTest {
  channel: NotifyChannel;
  /** Email channels only; empty means the stored default recipient. */
  recipient?: string;
}

/**
 * Sends a real message with the stored credentials. 400 = credentials or recipient missing,
 * 422 = the recipient is no address, 429 = more than five tests of this channel per minute.
 */
export async function sendSettingsTest({ channel, recipient }: SettingsTest): Promise<void> {
  // Only spaces means "use the stored default": the server strips an address but refuses "  ".
  const json = channel === "PUSHOVER" ? undefined : { recipient: recipient?.trim() ?? "" };
  await api.request(notificationTestPath(channel), anyBodySchema, { method: "POST", json });
}
