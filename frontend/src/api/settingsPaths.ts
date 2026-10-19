/**
 * Paths, limits and field names of the settings endpoints. Client-free (no API client import), so
 * e2e fixtures and the FakeServer can import them at runtime.
 */
import { NOTIFICATION_TEMPLATES_PATH } from "./platformPaths";

export const NOTIFICATION_PREVIEW_PATH = `${NOTIFICATION_TEMPLATES_PATH}/preview`;
const GLOBAL_TEMPLATES_PATH = "/admin/notification-templates";
export const TIMEZONE_PATH = "/timezone-preference";
export const CHANGE_PASSWORD_PATH = "/auth/change-password";
export const JOBS_PATH = "/jobs";
export const PROFILE_RESET_PATH = "/settings";
export const FACTORY_RESET_PATH = "/user/reset";

export const TEMPLATE_SCOPES = ["own", "global"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

/** Global templates are written through the admin router (403 for others). */
export function notificationTemplatesWritePath(scope: TemplateScope): string {
  return scope === "global" ? GLOBAL_TEMPLATES_PATH : NOTIFICATION_TEMPLATES_PATH;
}

export function notificationTemplatePath(id: number, scope: TemplateScope): string {
  return `${notificationTemplatesWritePath(scope)}/${id}`;
}

// Mirrors server/database/core.py (MAX_NOTIFICATION_TEMPLATE_*, MAX_NOTIFICATION_RECIPIENTS); the
// server answers 422 on the field otherwise.
export const NOTIFICATION_LIMITS = {
  templateName: 100,
  templateContent: 100_000,
  // MAX_NOTIFICATION_RECIPIENTS: a changed recipient list of a source (PATCH /platforms).
  recipients: 50,
} as const;
// Mirrors routers/auth.py NewPassword: 8-128 characters (code points) and at most 72 UTF-8 bytes,
// because bcrypt reads no further.
export const PASSWORD_LIMITS = { min: 8, max: 128, maxBytes: 72 } as const;

/** E-Mail templates are created as RESEND: the server refuses SMTP templates (spec section 3). */
export const EDITABLE_TEMPLATE_TYPES = ["PUSHOVER", "RESEND"] as const;
export type EditableTemplateType = (typeof EDITABLE_TEMPLATE_TYPES)[number];
