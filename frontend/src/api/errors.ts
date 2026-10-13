import { z } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "BAD_RESPONSE"
  | "SERVER_ERROR"
  | "NETWORK_ERROR";

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Readonly<Record<string, string>>;
}

/**
 * The one error every API call rejects with. `message` is empty whenever the UI must supply its
 * own sentence (server errors, rate limits, network, malformed bodies); see describeError.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Readonly<Record<string, string>>;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
  }
}

const HTTP_OK = 200;
export const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
export const FIRST_SERVER_ERROR_STATUS = 500;
/** ApiError.status when no response arrived (network failure). */
export const NO_RESPONSE_STATUS = 0;

const CODE_BY_STATUS: Readonly<Record<number, ApiErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_ERROR",
};

// FastAPI prefixes validation locations with where the value came from; that is not a field name.
const LOCATION_ROOTS = new Set(["body", "query", "path"]);

const detailTextSchema = z.object({ detail: z.string() });
const validationIssueSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
});
const detailListSchema = z.object({ detail: z.array(validationIssueSchema) });
const scraperErrorSchema = z.object({
  status: z.string().regex(/^error$/i),
  message: z.string().optional(),
});

type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** Normalises a non-2xx body (FastAPI detail string or list, slowapi 429, plain text) into an ApiError. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  if (status >= FIRST_SERVER_ERROR_STATUS)
    return new ApiError({ status, code: "SERVER_ERROR", message: "" });
  if (status === HTTP_TOO_MANY_REQUESTS)
    return new ApiError({ status, code: "RATE_LIMITED", message: "" });
  const list = detailListSchema.safeParse(body);
  if (list.success) return validationError(status, list.data.detail);
  const text = detailTextSchema.safeParse(body);
  const message = text.success ? text.data.detail : "";
  return new ApiError({ status, code: CODE_BY_STATUS[status] ?? "BAD_REQUEST", message });
}

/** The scraper reports logical failures as 200 + {status: "error"}; null for any other body. */
export function errorFromScraperBody(body: unknown): ApiError | null {
  const parsed = scraperErrorSchema.safeParse(body);
  if (!parsed.success) return null;
  return new ApiError({
    status: HTTP_OK,
    code: "UPSTREAM_ERROR",
    message: parsed.data.message ?? "",
  });
}

export function networkError(): ApiError {
  return new ApiError({ status: NO_RESPONSE_STATUS, code: "NETWORK_ERROR", message: "" });
}

export function badResponseError(status: number): ApiError {
  return new ApiError({ status, code: "BAD_RESPONSE", message: "" });
}

export function unauthenticatedError(): ApiError {
  return new ApiError({ status: HTTP_UNAUTHORIZED, code: "UNAUTHENTICATED", message: "" });
}

function validationError(status: number, issues: readonly ValidationIssue[]): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[fieldName(issue.loc)] ??= issue.msg;
  }
  return new ApiError({ status, code: "VALIDATION_ERROR", message: issues[0]?.msg ?? "", fields });
}

function fieldName(location: ReadonlyArray<string | number>): string {
  return location.filter((part) => !LOCATION_ROOTS.has(String(part))).join(".");
}
