import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import {
  CHANNEL_STATUS_PATH,
  NOTIFICATION_TEMPLATES_PATH,
  type NotifyChannel,
} from "./platformPaths";
import { queryKeys } from "./queryKeys";
import {
  NOTIFICATION_PREVIEW_PATH,
  notificationTemplatePath,
  notificationTemplatesWritePath,
  type EditableTemplateType,
  type TemplateScope,
} from "./settingsPaths";

// Booleans only (backend Task 4): which channels have credentials; no secret is ever read here.
const channelStatusSchema = z.object({
  PUSHOVER: z.boolean().default(false),
  RESEND: z.boolean().default(false),
  MAILJET: z.boolean().default(false),
  SMTP: z.boolean().default(false),
});
export type ChannelStatus = z.infer<typeof channelStatusSchema>;
export type ChannelStatusBody = z.input<typeof channelStatusSchema>;

const templateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.string(),
  content: z.string(),
  is_admin: z.boolean().default(false),
});
export type NotificationTemplate = z.infer<typeof templateSchema>;
export type NotificationTemplateBody = z.input<typeof templateSchema>;

export function channelStatusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.channelStatus,
    queryFn: () => api.request(CHANNEL_STATUS_PATH, channelStatusSchema),
  });
}

/** The user's and the global templates of every type; the drawer filters per channel. */
export function notificationTemplatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.notificationTemplates,
    queryFn: () => api.request(NOTIFICATION_TEMPLATES_PATH, z.array(templateSchema)),
  });
}

export interface NotificationTemplateWrite {
  name: string;
  type: EditableTemplateType;
  content: string;
}

// Untrusted: `body` is user-authored HTML when `html` is true (sandboxed frame only, R4).
const previewSchema = z.object({ html: z.boolean(), body: z.string() });
export type TemplatePreview = z.infer<typeof previewSchema>;
// Deletes answer {ok: true}; nothing in it is read.
const anyBodySchema = z.unknown();

/** Name 1-100 after trimming, text 1-100,000 (NOTIFICATION_LIMITS); 400 for an SMTP type. */
export async function createNotificationTemplate(input: {
  scope: TemplateScope;
  template: NotificationTemplateWrite;
}): Promise<NotificationTemplate> {
  const path = notificationTemplatesWritePath(input.scope);
  return api.request(path, templateSchema, { method: "POST", json: input.template });
}

/** The type cannot change after creation (the server ignores it); name and text can. */
export async function updateNotificationTemplate(input: {
  id: number;
  scope: TemplateScope;
  template: Omit<NotificationTemplateWrite, "type">;
}): Promise<NotificationTemplate> {
  const path = notificationTemplatePath(input.id, input.scope);
  return api.request(path, templateSchema, { method: "PUT", json: input.template });
}

export async function deleteNotificationTemplate(input: {
  id: number;
  scope: TemplateScope;
}): Promise<void> {
  const path = notificationTemplatePath(input.id, input.scope);
  await api.request(path, anyBodySchema, { method: "DELETE" });
}

/**
 * Rendered by the senders' own functions with a sample job; nothing is sent. Empty text previews
 * the default. Limited to 30/min per user (NOTIFICATION_PREVIEW_RATE): a 429 goes through
 * describeError (T8 maps it like the test sends).
 */
export async function previewNotificationTemplate(input: {
  type: NotifyChannel;
  content: string;
}): Promise<TemplatePreview> {
  return api.request(NOTIFICATION_PREVIEW_PATH, previewSchema, { method: "POST", json: input });
}

/**
 * Ruling 43: one render per draft text, kept while the dialog is open (a rate-limited endpoint is
 * not asked twice for the same text) and dropped once it closes.
 */
export function notificationPreviewQueryOptions(input: { type: NotifyChannel; content: string }) {
  return queryOptions({
    queryKey: queryKeys.notificationPreview(input.type, input.content),
    queryFn: () => previewNotificationTemplate(input),
    staleTime: Infinity,
    gcTime: 0,
  });
}
