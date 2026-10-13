import type { NotificationTemplate } from "@/api/notifications";
import {
  NOTIFICATION_LIMITS,
  type EditableTemplateType,
  type TemplateScope,
} from "@/api/settingsPaths";

export type TemplateKind = "push" | "email";

export interface TemplateDraft {
  name: string;
  kind: TemplateKind;
  content: string;
  /** Admins only, on creation: a global template (admin endpoints). */
  global: boolean;
}

export type TemplateProblem = "required" | "tooLong";
export type TemplateField = "name" | "content";
export type TemplateProblems = Partial<Record<TemplateField, TemplateProblem>>;

const PUSH_TYPE = "PUSHOVER";

/** RESEND, MAILJET and SMTP render through the same email function, so they are one kind. */
export const kindOfType = (type: string): TemplateKind => (type === PUSH_TYPE ? "push" : "email");

/** D8: an email template is created as RESEND, since the server refuses SMTP ones. */
export const typeOfKind = (kind: TemplateKind): EditableTemplateType =>
  kind === "push" ? "PUSHOVER" : "RESEND";

export function templateDraftOf(template: NotificationTemplate | null): TemplateDraft {
  if (!template) return { name: "", kind: "email", content: "", global: false };
  return {
    name: template.name,
    kind: kindOfType(template.type),
    content: template.content,
    global: template.is_admin,
  };
}

export const scopeOf = (template: { is_admin: boolean }): TemplateScope =>
  template.is_admin ? "global" : "own";

/** The server is the gate (admin endpoints); the UI only hides what a member cannot change. */
export const canEdit = (template: { is_admin: boolean }, isAdmin: boolean): boolean =>
  !template.is_admin || isAdmin;

/** Ruling 44: pydantic counts code points, not UTF-16 units. */
const codePoints = (text: string): number => Array.from(text).length;

function problemOf(text: string, max: number): TemplateProblem | null {
  if (!text) return "required";
  return codePoints(text) > max ? "tooLong" : null;
}

/** core.py NotificationTemplateCreate: the name is trimmed (1-100), the text is not (1-100,000). */
export function templateProblems(draft: TemplateDraft): TemplateProblems {
  const name = problemOf(draft.name.trim(), NOTIFICATION_LIMITS.templateName);
  const content = problemOf(draft.content, NOTIFICATION_LIMITS.templateContent);
  return { ...(name ? { name } : {}), ...(content ? { content } : {}) };
}

/** The preview renders nothing for a text the server would refuse anyway. */
export const contentTooLong = (draft: TemplateDraft): boolean =>
  codePoints(draft.content) > NOTIFICATION_LIMITS.templateContent;
