import type { MessageKey } from "@/i18n/de";
import { translate } from "@/i18n/translate";

// @ts-expect-error: a dictionary that misses keys must not type-check.
export const incomplete: Record<MessageKey, string> = { "app.name": "Job Agent" };

// @ts-expect-error: unknown message keys are rejected at compile time.
export const unknownKey = translate("de", "nav.doesNotExist");
