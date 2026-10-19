import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { CHANNEL_LIMITS, type TestReason } from "@/api/notificationPaths";
import type { FieldProblem } from "@/domain/notificationChannels";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

/** routers/notifications.py answers 502 `notification_service_unavailable` when the service fails. */
const HTTP_BAD_GATEWAY = 502;

export const FIELD_PROBLEM_TEXT: Readonly<Record<FieldProblem, MessageKey>> = {
  required: "settings.problem.required",
  email: "settings.problem.email",
  emails: "settings.problem.emails",
  tooManyItems: "settings.problem.tooManyItems",
  port: "settings.problem.port",
  tooLong: "settings.problem.tooLong",
  token: "settings.problem.token",
  ascii: "settings.problem.ascii",
  refused: "settings.problem.refused",
};

/** One fixed sentence per test outcome; the service's reason code itself is never shown. */
export const TEST_REASON_TEXT: Readonly<Record<TestReason, MessageKey>> = {
  auth_rejected: "notify.reason.auth_rejected",
  rejected: "notify.reason.rejected",
  unreachable: "notify.reason.unreachable",
  timeout: "notify.reason.timeout",
  tls_failed: "notify.reason.tls_failed",
  host_not_public: "notify.reason.host_not_public",
  failed: "notify.reason.failed",
};

/**
 * The sentence for a refused channel call: the service is down (502), the channel limit (409), a
 * channel that is gone (404), too many requests (429); anything else through describeError.
 */
export function channelErrorText(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.status === HTTP_BAD_GATEWAY) {
    return t("notify.error.serviceDown");
  }
  if (error instanceof ApiError && error.code === "CONFLICT") {
    return t("notify.error.limit", { max: CHANNEL_LIMITS.channels });
  }
  return describeError(error, t, { NOT_FOUND: "notify.error.gone" });
}

/** A failed channel list: a 5xx there is the notification service (the server only proxies it). */
export const CHANNEL_LIST_ERROR = { SERVER_ERROR: "notify.error.serviceDown" } as const;
