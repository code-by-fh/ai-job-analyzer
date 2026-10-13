import type { AiErrorCode } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

/**
 * Preflight ruling 11: one provider-neutral sentence per stored code. Local-model failures are
 * stored through the same call path, so no sentence names OpenRouter.
 */
export const AI_ERROR_TEXT: Readonly<Record<AiErrorCode, MessageKey>> = {
  auth: "settings.system.auth",
  rate_limit: "settings.system.rate_limit",
  model_not_found: "settings.system.model_not_found",
  connection: "settings.system.connection",
  server: "settings.system.server",
  unknown: "settings.system.unknown",
};
