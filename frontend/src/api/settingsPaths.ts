/**
 * Paths, limits and field names of the settings endpoints. Client-free (no API client import), so
 * e2e fixtures and the FakeServer can import them at runtime.
 */
import { NOTIFICATION_TEMPLATES_PATH, type NotifyChannel } from "./platformPaths";

export const NOTIFICATION_SETTINGS_PATH = "/notification-settings";
export const NOTIFICATION_PREVIEW_PATH = `${NOTIFICATION_TEMPLATES_PATH}/preview`;
const GLOBAL_TEMPLATES_PATH = "/admin/notification-templates";
export const TIMEZONE_PATH = "/timezone-preference";
export const STORAGE_STATUS_PATH = "/storage/status";
export const STORAGE_LOGIN_PATH = "/storage/google/login";
export const STORAGE_TOGGLE_PATH = "/storage/toggle";
export const STORAGE_DISCONNECT_PATH = "/storage/google/disconnect";
export const CHANGE_PASSWORD_PATH = "/auth/change-password";
export const JOBS_PATH = "/jobs";
export const PROFILE_RESET_PATH = "/settings";
export const FACTORY_RESET_PATH = "/user/reset";

export const TEMPLATE_SCOPES = ["own", "global"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

/** routers/settings.py test-{channel}: limited per user (deps.NOTIFICATION_TEST_RATE, 429 after 5/min). */
export function notificationTestPath(channel: NotifyChannel): string {
  return `${NOTIFICATION_SETTINGS_PATH}/test-${channel.toLowerCase()}`;
}

/** Global templates are written through the admin router (403 for others). */
export function notificationTemplatesWritePath(scope: TemplateScope): string {
  return scope === "global" ? GLOBAL_TEMPLATES_PATH : NOTIFICATION_TEMPLATES_PATH;
}

export function notificationTemplatePath(id: number, scope: TemplateScope): string {
  return `${notificationTemplatesWritePath(scope)}/${id}`;
}

export const STORAGE_SERVICES = ["NONE", "GOOGLE_DRIVE"] as const;
export type StorageService = (typeof STORAGE_SERVICES)[number];

// Mirrors server/database/core.py (MAX_EMAIL_LENGTH, MAX_CREDENTIAL_LENGTH, MAX_HOST_LENGTH,
// MIN_PORT/MAX_PORT, MAX_NOTIFICATION_TEMPLATE_*); the server answers 422 on the field otherwise.
// A credential or host must not be "": only null clears a field.
export const NOTIFICATION_LIMITS = {
  email: 254,
  credential: 500,
  host: 253,
  portMin: 1,
  portMax: 65535,
  templateName: 100,
  templateContent: 100_000,
  // MAX_NOTIFICATION_RECIPIENTS: a changed recipient list of a source (PATCH /platforms).
  recipients: 50,
} as const;
// Mirrors routers/auth.py NewPassword: 8-128 characters (code points) and at most 72 UTF-8 bytes,
// because bcrypt reads no further.
export const PASSWORD_LIMITS = { min: 8, max: 128, maxBytes: 72 } as const;
export const DEFAULT_SMTP_PORT = 587;

export const PLAIN_FIELDS = [
  "pushover_user_key",
  "resend_from_email",
  "mailjet_from_email",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_from_email",
  "email_global_recipient",
] as const;
export type PlainField = (typeof PLAIN_FIELDS)[number];
/** routers/deps.py _SECRET_FIELDS without the Drive token (it is not a channel field). */
export const SECRET_FIELDS = [
  "pushover_api_token",
  "resend_api_key",
  "mailjet_api_key",
  "mailjet_secret_key",
  "smtp_password",
] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];
export type ChannelField = Exclude<PlainField, "email_global_recipient"> | SecretField;

/** The fields of each channel's form, in display order. */
export const CHANNEL_FIELDS: Readonly<Record<NotifyChannel, readonly ChannelField[]>> = {
  PUSHOVER: ["pushover_user_key", "pushover_api_token"],
  RESEND: ["resend_api_key", "resend_from_email"],
  MAILJET: ["mailjet_api_key", "mailjet_secret_key", "mailjet_from_email"],
  SMTP: ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from_email"],
};
/** routers/settings.py _channel_status: what makes a channel sendable. */
export const REQUIRED_FIELDS: Readonly<Record<NotifyChannel, readonly ChannelField[]>> = {
  PUSHOVER: ["pushover_user_key", "pushover_api_token"],
  RESEND: ["resend_api_key", "resend_from_email"],
  MAILJET: ["mailjet_api_key", "mailjet_secret_key", "mailjet_from_email"],
  SMTP: ["smtp_host", "smtp_user", "smtp_password"],
};
export const EMAIL_FIELDS: readonly PlainField[] = [
  "resend_from_email",
  "mailjet_from_email",
  "smtp_from_email",
  "email_global_recipient",
];

/** E-Mail templates are created as RESEND: the server refuses SMTP templates (spec section 3). */
export const EDITABLE_TEMPLATE_TYPES = ["PUSHOVER", "RESEND"] as const;
export type EditableTemplateType = (typeof EDITABLE_TEMPLATE_TYPES)[number];

/**
 * Query parameters of the OAuth redirects (routers/storage.py DRIVE_CONNECTED_QUERY and
 * DRIVE_FAILED_QUERY). Every failure, an unconfigured server's login included, lands on the
 * fixed error value; no Google or server text reaches the URL.
 */
export const DRIVE_CALLBACK = {
  successParam: "success",
  connected: "google_connected",
  errorParam: "error",
  failed: "google_auth_failed",
} as const;
