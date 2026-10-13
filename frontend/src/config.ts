import { z } from "zod";

/**
 * Literal baked into production builds (.env.production). env.sh swaps it for APP_API_URL when the
 * container starts, so one image serves any API host. env.sh also rewrites this constant in the
 * bundle, which is harmless: the union below then accepts the real URL twice.
 */
export const RUNTIME_API_URL_PLACEHOLDER = "APP_API_URL";

const TRAILING_SLASHES = /\/+$/;
const HTTP_SCHEME = /^http/;

const apiBaseUrlSchema = z.union([
  z.url({ protocol: /^https?$/ }),
  z.literal(RUNTIME_API_URL_PLACEHOLDER),
]);

/**
 * Validates the REST base URL and strips trailing slashes.
 * @throws ZodError when the value is missing or not an http(s) URL.
 */
export function parseApiBaseUrl(raw: string | undefined): string {
  return apiBaseUrlSchema.parse(raw).replace(TRAILING_SLASHES, "");
}

/** Derives the WebSocket endpoint from the REST base: http -> ws, https -> wss. */
export function toWebSocketUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(HTTP_SCHEME, "ws")}/ws`;
}

// Next inlines NEXT_PUBLIC_* only for direct property access, so no destructuring here.
export const API_BASE_URL = parseApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
export const WS_URL = toWebSocketUrl(API_BASE_URL);
