import type { TestReason } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

/** R4: a connection test's reason as a fixed sentence; the provider's own text never reaches the page. */
export const REASON_TEXT: Readonly<Record<TestReason, MessageKey>> = {
  auth: "settings.ai.reason.auth",
  not_found: "settings.ai.reason.not_found",
  unreachable: "settings.ai.reason.unreachable",
  timeout: "settings.ai.reason.timeout",
  failed: "settings.ai.reason.failed",
  no_key: "settings.ai.reason.no_key",
  no_model: "settings.ai.reason.no_model",
  no_url: "settings.ai.reason.no_url",
};
