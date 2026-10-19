import type {
  Channel,
  ChannelCreate,
  ChannelType,
  ChannelUpdate,
  FieldChanges,
  FieldSpec,
  FieldValue,
  ServiceLabel,
} from "@/api/notificationChannels";
import { CHANNEL_LIMITS } from "@/api/notificationPaths";
import type { Language } from "@/i18n/languages";
import { parseRecipients } from "./sources";

/**
 * How a secret field is edited. Secrets are write-only: a stored one is only known as "set"; it is
 * kept, replaced by a typed value, or removed (optional secrets only, a required one would be refused).
 */
export type SecretMode = "keep" | "replace" | "remove";

/** What a channel form edits: every value as text; a secret's text is only what was typed. */
export interface ChannelDraft {
  name: string;
  values: Record<string, string>;
  secrets: Record<string, SecretMode>;
}

export type FieldProblem =
  | "required"
  | "email"
  | "emails"
  | "tooManyItems"
  | "port"
  | "tooLong"
  | "token"
  | "ascii"
  | "refused";

export interface ChannelProblems {
  name?: FieldProblem;
  fields: Record<string, FieldProblem>;
}

// notification-service/app/channel_types.py: _EMAIL, _TOKEN and _ASCII_TEXT, applied to whole values.
const EMAIL_SHAPE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const TOKEN_SHAPE = /^[\x21-\x7e]+$/;
const ASCII_SHAPE = /^[\x20-\x7e]+$/;
const DIGITS = /^\d+$/;
const LIST = ", ";

/** The service's label in the UI language. */
export const labelIn = (label: ServiceLabel, language: Language): string => label[language];

/** Python's len() counts code points, as the service's length bounds do. */
const lengthOf = (text: string): number => Array.from(text).length;

function textOf(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join(LIST) : String(value);
}

/** A blank form for a new channel of this type; secrets start as inputs. */
export function newChannelDraft(type: ChannelType, name: string): ChannelDraft {
  const values = Object.fromEntries(type.fields.map((spec) => [spec.name, ""]));
  const secrets = Object.fromEntries(
    type.fields.filter((spec) => spec.secret).map((spec) => [spec.name, "replace" as const]),
  );
  return { name, values, secrets };
}

/** The stored channel as a form: plain values as text, a set secret kept, an unset one as an input. */
export function channelDraftOf(type: ChannelType, channel: Channel): ChannelDraft {
  const values: Record<string, string> = {};
  const secrets: Record<string, SecretMode> = {};
  for (const spec of type.fields) {
    values[spec.name] = spec.secret ? "" : textOf(channel.fields[spec.name]);
    if (spec.secret) secrets[spec.name] = channel.secrets[spec.name] ? "keep" : "replace";
  }
  return { name: channel.name, values, secrets };
}

/** A secret is sent as typed (spaces may belong to it); other text is trimmed. */
function typedText(spec: FieldSpec, raw: string): string {
  return spec.secret ? raw : raw.trim();
}

/** The wire value of a non-blank text: a port as a number, a list as its addresses. */
function wireValue(spec: FieldSpec, text: string): FieldValue {
  if (spec.kind === "port") return Number(text);
  if (spec.kind === "email_list") return parseRecipients(text).list;
  return text;
}

/** A secret that is sent: replaced by a typed value, or removed (null). */
function secretChange(spec: FieldSpec, draft: ChannelDraft): FieldValue | undefined {
  const mode = draft.secrets[spec.name];
  if (mode === "remove") return null;
  const raw = draft.values[spec.name] ?? "";
  return mode === "replace" && raw.trim() !== "" ? raw : undefined;
}

/** Every filled field of a new channel; blank optional fields are left out. */
export function createBody(type: ChannelType, draft: ChannelDraft): ChannelCreate {
  const fields: FieldChanges = {};
  for (const spec of type.fields) {
    const text = typedText(spec, draft.values[spec.name] ?? "");
    if (text.trim() !== "") fields[spec.name] = wireValue(spec, text);
  }
  return { type: type.id, name: draft.name.trim(), fields };
}

function plainChange(spec: FieldSpec, draft: ChannelDraft, channel: Channel) {
  const text = typedText(spec, draft.values[spec.name] ?? "");
  if (text === textOf(channel.fields[spec.name])) return undefined;
  return text === "" ? null : wireValue(spec, text);
}

/**
 * Only what changed: the name, edited plain fields (cleared -> null), replaced or removed secrets.
 * A kept secret is never sent, so its stored value stays (PATCH omits it).
 */
export function updateChange(
  type: ChannelType,
  draft: ChannelDraft,
  channel: Channel,
): ChannelUpdate["change"] {
  const fields: FieldChanges = {};
  for (const spec of type.fields) {
    const value = spec.secret ? secretChange(spec, draft) : plainChange(spec, draft, channel);
    if (value !== undefined) fields[spec.name] = value;
  }
  const name = draft.name.trim();
  return {
    ...(name !== channel.name ? { name } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

function textProblem(spec: FieldSpec, text: string): FieldProblem | null {
  if (spec.max_length && lengthOf(text) > spec.max_length) return "tooLong";
  if (spec.kind === "email" && !EMAIL_SHAPE.test(text)) return "email";
  if (spec.kind === "token" && !TOKEN_SHAPE.test(text)) return "token";
  if (spec.kind === "ascii_text" && !ASCII_SHAPE.test(text)) return "ascii";
  return null;
}

function portProblem(text: string): FieldProblem | null {
  const port = Number(text);
  const inRange = port >= CHANNEL_LIMITS.portMin && port <= CHANNEL_LIMITS.portMax;
  return DIGITS.test(text) && inRange ? null : "port";
}

function listProblem(spec: FieldSpec, text: string): FieldProblem | null {
  const { list } = parseRecipients(text);
  const tooLong = spec.max_length ? list.some((item) => lengthOf(item) > spec.max_length!) : false;
  if (tooLong || list.some((address) => !EMAIL_SHAPE.test(address))) return "emails";
  return spec.max_items && list.length > spec.max_items ? "tooManyItems" : null;
}

function valueProblem(spec: FieldSpec, text: string): FieldProblem | null {
  if (spec.kind === "port") return portProblem(text);
  if (spec.kind === "email_list") return listProblem(spec, text);
  return textProblem(spec, text);
}

/** A field that the save leaves alone (a kept or removed secret) has nothing to check. */
function isUntouchedSecret(spec: FieldSpec, draft: ChannelDraft): boolean {
  return spec.secret && draft.secrets[spec.name] !== "replace";
}

/**
 * A required field is blank only when nothing is stored for it either: a stored secret whose
 * replace input stays empty keeps the stored value.
 */
function fieldProblem(spec: FieldSpec, draft: ChannelDraft, channel: Channel | null) {
  if (isUntouchedSecret(spec, draft)) return null;
  const text = typedText(spec, draft.values[spec.name] ?? "");
  const storedSecret = spec.secret && Boolean(channel?.secrets[spec.name]);
  if (text.trim() === "") return spec.required && !storedSecret ? "required" : null;
  return valueProblem(spec, text);
}

function nameProblem(name: string): FieldProblem | undefined {
  const length = lengthOf(name.trim());
  if (length === 0) return "required";
  return length > CHANNEL_LIMITS.name ? "tooLong" : undefined;
}

/** The client check before a save, from the type's schema; the service checks the same again. */
export function channelProblems(
  type: ChannelType,
  draft: ChannelDraft,
  channel: Channel | null,
): ChannelProblems {
  const fields: Record<string, FieldProblem> = {};
  for (const spec of type.fields) {
    const problem = fieldProblem(spec, draft, channel);
    if (problem) fields[spec.name] = problem;
  }
  const name = nameProblem(draft.name);
  return name ? { name, fields } : { fields };
}

export const hasProblems = (problems: ChannelProblems): boolean =>
  problems.name !== undefined || Object.keys(problems.fields).length > 0;

/** The type of a channel, or undefined for a type the service no longer offers. */
export function typeOf(types: readonly ChannelType[], channel: Channel): ChannelType | undefined {
  return types.find((type) => type.id === channel.type);
}
