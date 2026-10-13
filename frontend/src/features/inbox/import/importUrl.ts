import type { ErrorMessageOverrides } from "@/api/describeError";
import { safeHref } from "@/domain/links";

// Prototype importRun check: scheme, a dotted host, no whitespace.
const IMPORT_URL = /^https?:\/\/[^\s/.]+\.[^\s]+$/i;

/**
 * The scraper refuses with 200 + {status:"Error"}, the API with 422; either reads as a refused
 * link, and the server's message is never shown (spec 6).
 */
export const IMPORT_ERRORS: ErrorMessageOverrides = {
  UPSTREAM_ERROR: "import.startFailed",
  VALIDATION_ERROR: "import.startFailed",
};

/** The trimmed link when it is a complete http(s) URL with a dotted host, else null. */
export function parseImportUrl(text: string): string | null {
  const url = text.trim();
  return IMPORT_URL.test(url) && safeHref(url) ? url : null;
}
