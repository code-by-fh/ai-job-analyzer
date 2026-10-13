import type { ZodType } from "zod";
import { filenameFromContentDisposition } from "./contentDisposition";
import {
  badResponseError,
  errorFromResponse,
  errorFromScraperBody,
  HTTP_UNAUTHORIZED,
  networkError,
  unauthenticatedError,
} from "./errors";

const HTTP_FORBIDDEN = 403;
const HTTP_NO_CONTENT = 204;
const REFRESH_PATH = "/auth/refresh";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest {
  method?: HttpMethod;
  /** Sent as application/json. */
  json?: unknown;
  /** Sent as application/x-www-form-urlencoded; the login endpoint expects this. */
  form?: Readonly<Record<string, string>>;
  /** Sent as multipart/form-data (file uploads); the browser sets the Content-Type boundary. */
  formData?: FormData;
  signal?: AbortSignal;
  /** For endpoints where 401 means "wrong credentials", not "expired session". */
  skipAuthRefresh?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Called once a session cannot be restored; the app sends the user to /login?next=. */
  onAuthLost: () => void;
  fetchImpl?: typeof fetch;
}

export interface DownloadedFile {
  blob: Blob;
  /** From Content-Disposition; null when the server names no file (or does not expose the header). */
  filename: string | null;
}

export interface ApiClient {
  /** @throws ApiError for every failure except aborts, which are rethrown unchanged. */
  request<T>(path: string, schema: ZodType<T>, init?: ApiRequest): Promise<T>;
  /** Binary download (e.g. a PDF) with the same session refresh and errors as `request`. */
  requestBlob(path: string, init?: ApiRequest): Promise<DownloadedFile>;
  refreshSession(): Promise<boolean>;
}

// Resolved per call, so tests and the browser can swap the global fetch after module load.
const globalFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

// Accept is internal: JSON for request(), anything for downloads.
type SendInit = ApiRequest & { accept?: string };
type Send = (path: string, init: SendInit) => Promise<Response>;

const ACCEPT_JSON = "application/json";
const ACCEPT_ANY = "*/*";

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? globalFetch;
  const send: Send = (path, init) => sendRequest(fetchImpl, options.baseUrl + path, init);
  const { sendWithRefresh, refreshSession } = createSessionSend(send, options.onAuthLost);

  async function request<T>(path: string, schema: ZodType<T>, init: ApiRequest = {}): Promise<T> {
    return parseResponse(await sendWithRefresh(path, init), schema);
  }

  async function requestBlob(path: string, init: ApiRequest = {}): Promise<DownloadedFile> {
    return readFile(await sendWithRefresh(path, { ...init, accept: ACCEPT_ANY }));
  }

  return { request, requestBlob, refreshSession };
}

/** Wraps `send` with the 401 handling every call shares: one refresh, one retry. */
function createSessionSend(send: Send, onAuthLost: () => void) {
  const refreshSession = createSingleFlight(() => refreshOrReportLoss(send, onAuthLost));

  async function retryAfterRefresh(path: string, init: SendInit): Promise<Response> {
    if (!(await refreshSession())) throw unauthenticatedError();
    const retried = await send(path, init);
    if (retried.status !== HTTP_UNAUTHORIZED) return retried;
    onAuthLost();
    throw unauthenticatedError();
  }

  async function sendWithRefresh(path: string, init: SendInit): Promise<Response> {
    const first = await send(path, init);
    const needsRefresh = first.status === HTTP_UNAUTHORIZED && !init.skipAuthRefresh;
    return needsRefresh ? retryAfterRefresh(path, init) : first;
  }

  return { sendWithRefresh, refreshSession };
}

/** Notifying inside the shared run makes N concurrent 401s report one lost session, not N. */
async function refreshOrReportLoss(send: Send, onAuthLost: () => void): Promise<boolean> {
  const restored = await refreshCookies(send);
  if (!restored) onAuthLost();
  return restored;
}

/**
 * Only a rejected refresh token (401/403) means the session is gone. An unreachable server, a 5xx
 * or a 429 throws instead, so a hiccup never logs the user out.
 */
async function refreshCookies(send: Send): Promise<boolean> {
  const response = await send(REFRESH_PATH, { method: "POST" });
  if (response.ok) return true;
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) return false;
  throw errorFromResponse(response.status, undefined);
}

/** Concurrent callers share one in-flight run (e.g. many 401s, one refresh); the next call starts anew. */
export function createSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= task().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

async function sendRequest(
  fetchImpl: typeof fetch,
  url: string,
  init: SendInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, toRequestInit(init));
  } catch (error) {
    // TanStack Query aborts superseded requests; that is not a failure to report.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }
}

function toRequestInit(init: SendInit): RequestInit {
  const headers = new Headers({ Accept: init.accept ?? ACCEPT_JSON });
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const method = init.method ?? "GET";
  return { method, headers, credentials: "include", signal: init.signal, body: toBody(init) };
}

function toBody(init: ApiRequest): BodyInit | undefined {
  if (init.json !== undefined) return JSON.stringify(init.json);
  if (init.formData) return init.formData;
  return init.form ? new URLSearchParams(init.form) : undefined;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === HTTP_NO_CONTENT) return undefined;
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Plain-text bodies exist (the scraper proxy's 502); the normaliser handles them as text.
    return text;
  }
}

async function parseResponse<T>(response: Response, schema: ZodType<T>): Promise<T> {
  const body = await readBody(response);
  if (!response.ok) throw errorFromResponse(response.status, body);
  const upstream = errorFromScraperBody(body);
  if (upstream) throw upstream;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badResponseError(response.status);
  return parsed.data;
}

async function readFile(response: Response): Promise<DownloadedFile> {
  if (!response.ok) throw errorFromResponse(response.status, await readBody(response));
  const filename = filenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { blob: await response.blob(), filename };
}
