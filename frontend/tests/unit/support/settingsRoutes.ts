import type { CurrentUserBody } from "@/api/auth";
import type { ChannelStatusBody } from "@/api/notifications";
import type { NotificationSettingsBody } from "@/api/notificationSettings";
import type { StorageStatusBody } from "@/api/settings";
import type { RouteTable } from "./stubRoutes";

/** What GET /settings answers for the notification schema: masked secrets, plain values. */
export const STORED_NOTIFICATION_SETTINGS: NotificationSettingsBody & Record<string, unknown> = {
  pushover_user_key: "push-user",
  pushover_api_token: "__masked__",
  resend_api_key: "__masked__",
  resend_from_email: "jobs@example.com",
  mailjet_api_key: null,
  mailjet_secret_key: null,
  mailjet_from_email: null,
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "smtp-user",
  smtp_password: "__masked__",
  smtp_from_email: null,
  email_global_recipient: "me@example.com",
  timezone: "Europe/Berlin",
  language: "de",
  role: "Lead",
};
const CHANNELS: ChannelStatusBody = { PUSHOVER: true, RESEND: true, MAILJET: false, SMTP: true };
const STORAGE: StorageStatusBody = {
  available: true,
  connected: false,
  active: "NONE",
  email: null,
};
const USER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

/** Everything /settings loads; `overrides` replaces or adds routes. */
export function settingsStubs(overrides: RouteTable = {}): RouteTable {
  return {
    "GET /settings": STORED_NOTIFICATION_SETTINGS,
    "GET /notification-settings/channels": CHANNELS,
    "GET /notification-templates": [],
    "GET /storage/status": STORAGE,
    "GET /platforms": [],
    "GET /me": USER,
    ...overrides,
  };
}
