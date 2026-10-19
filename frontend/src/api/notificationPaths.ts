/**
 * Paths and wire constants of the notification channel routes (server/routers/notifications.py).
 * Client-free (no API client import), so e2e fixtures and the fake servers can import them.
 */
import { NOTIFY_CHANNELS, type NotifyChannel } from "./platformPaths";

export const CHANNEL_TYPES_PATH = "/notifications/channel-types";
export const CHANNELS_PATH = "/notifications/channels";

export function channelPath(id: string): string {
  return `${CHANNELS_PATH}/${id}`;
}

/** Limited to 5/min per user (deps.NOTIFICATION_TEST_RATE); 429 with Retry-After beyond that. */
export function channelTestPath(id: string): string {
  return `${channelPath(id)}/test`;
}

/** The field kinds of the service's schema (notification-service/app/channel_types.py FieldKind). */
export const FIELD_KINDS = [
  "token",
  "text",
  "ascii_text",
  "email",
  "email_list",
  "host",
  "port",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/**
 * The bounds of routers/notifications.py (name 1-100 after trimming) and of the service: at most
 * 20 channels per user (409 `channel_limit_reached`), ports 1-65535.
 */
export const CHANNEL_LIMITS = {
  name: 100,
  channels: 20,
  portMin: 1,
  portMax: 65535,
} as const;

/** The fixed `reason` values of a test send that was not delivered (app/delivery/reasons.py). */
export const TEST_REASONS = [
  "auth_rejected",
  "rejected",
  "unreachable",
  "timeout",
  "tls_failed",
  "host_not_public",
  "failed",
] as const;
export type TestReason = (typeof TEST_REASONS)[number];

/**
 * The source's per-type template and recipient columns are named by the old upper-case channel
 * names (`pushover_template`, `smtp_recipients`): a service type maps onto one, or null when the
 * service offers a type the sources have no columns for.
 */
export function notifyChannelOf(type: string): NotifyChannel | null {
  const upper = type.toUpperCase();
  return NOTIFY_CHANNELS.find((channel) => channel === upper) ?? null;
}
