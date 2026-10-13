import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { ApiError, type ApiErrorCode } from "./errors";

// One generic sentence per code; server detail text is never shown by default (spec 6: no raw internals).
const GENERIC_MESSAGE: Readonly<Record<ApiErrorCode, MessageKey>> = {
  NETWORK_ERROR: "error.network",
  SERVER_ERROR: "error.server",
  BAD_RESPONSE: "error.server",
  RATE_LIMITED: "error.rateLimited",
  UNAUTHENTICATED: "error.sessionExpired",
  FORBIDDEN: "error.forbidden",
  NOT_FOUND: "error.notFound",
  VALIDATION_ERROR: "error.invalidInput",
  UPSTREAM_ERROR: "error.upstream",
  PAYLOAD_TOO_LARGE: "error.tooLarge",
  UNSUPPORTED_MEDIA_TYPE: "error.unsupportedType",
  CONFLICT: "error.conflict",
  BAD_REQUEST: "error.unexpected",
};

export type ErrorMessageOverrides = Partial<Record<ApiErrorCode, MessageKey>>;

/**
 * User-facing sentence for anything an API call can throw. A caller that knows what a code means
 * in its context opts in with `overrides`; per-field details stay on ApiError.fields.
 */
export function describeError(
  error: unknown,
  t: Translate,
  overrides: ErrorMessageOverrides = {},
): string {
  if (!(error instanceof ApiError)) return t("error.unexpected");
  return t(overrides[error.code] ?? GENERIC_MESSAGE[error.code]);
}
