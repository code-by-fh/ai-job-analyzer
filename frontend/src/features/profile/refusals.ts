import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_PAYLOAD_TOO_LARGE = 413;
export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
export const HTTP_UNPROCESSABLE = 422;
export const HTTP_BAD_GATEWAY = 502;

/** One fixed refusal of a profile upload: the status and code the server sends, the text shown. */
export interface Refusal {
  status: number;
  code: string;
  text: MessageKey;
}

export interface RefusalTable {
  /** The form field a 422 names (`loc: ["body", field]`); other refusals carry the code as detail. */
  field: string;
  refusals: readonly Refusal[];
}

/**
 * The fixed sentence for a refused upload, matched by status and code; anything unknown gets
 * describeError's generic sentence. The server's words are never shown (ruling R8).
 */
export function refusalText(error: unknown, t: Translate, table: RefusalTable): string {
  if (!(error instanceof ApiError)) return describeError(error, t);
  const code = error.fields[table.field] ?? error.message;
  const known = table.refusals.find(
    (refusal) => refusal.status === error.status && refusal.code === code,
  );
  return known ? t(known.text) : describeError(error, t);
}
