import type { Page, Request, Route, WebSocketRoute } from "@playwright/test";
import { MOCK_API_PREFIX } from "./constants";

export interface MockResponse {
  status?: number;
  body: unknown;
  /**
   * Answers each request instead of `body`, with the parsed JSON body sent (null without one) and
   * the request itself (for a multipart file name or a query string): a stateful fake server.
   */
  respond?: (sent: unknown, request: Request) => unknown;
  /** Answers `body` (a string or Buffer) as raw bytes of this type instead of JSON, e.g. a PDF. */
  contentType?: string;
}

/** Keys are "METHOD /path" or, more specific, "METHOD /path?query" (the longer key wins). */
export type MockRoutes = Readonly<Record<string, MockResponse>>;

/** A stateful answer: `respond` computes each reply from the parsed JSON body that was sent. */
export const live = (respond: (sent: unknown, request: Request) => unknown): MockResponse => ({
  body: null,
  respond,
});

/** Routes a test may extend after the page is loaded, e.g. when a login call creates the session. */
export type MutableRoutes = Record<string, MockResponse>;

export interface ApiCall {
  key: string;
  body: unknown;
}

export interface ApiLog {
  requests: string[];
  unexpected: string[];
  /** Every mocked call with its parsed JSON body (null without one), for request assertions. */
  calls: ApiCall[];
  /** Accepted realtime sockets; a test pushes an event with `sockets[0].send(JSON.stringify(...))`. */
  sockets: WebSocketRoute[];
  /** Sockets the page has closed (e.g. on a full navigation). */
  closedSockets: WebSocketRoute[];
}

const REPLY = Symbol("reply");

/**
 * A stateful answer with its own status (e.g. 409 or 422 from a FakeServer); return it from
 * `respond`. JSON only: a route with `contentType` sends its answer as the raw body.
 */
export interface Reply {
  [REPLY]: true;
  status: number;
  body: unknown;
}

export function reply(status: number, body: unknown): Reply {
  return { [REPLY]: true, status, body };
}

function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && REPLY in value;
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** Adds `more` to routes already handed to the mock; later requests see them. */
export function setRoutes(routes: MutableRoutes, more: MockRoutes): void {
  Object.assign(routes, more);
}

export async function mockApi(page: Page, routes: MockRoutes): Promise<ApiLog> {
  const log: ApiLog = { requests: [], unexpected: [], calls: [], sockets: [], closedSockets: [] };
  await page.route(`**${MOCK_API_PREFIX}/**`, (route) => fulfil(route, routes, log));
  // Accept the realtime socket without a server; tests push events through log.sockets.
  await page.routeWebSocket(new RegExp(`${MOCK_API_PREFIX}/ws$`), (socket) => {
    log.sockets.push(socket);
    socket.onClose(() => void log.closedSockets.push(socket));
  });
  return log;
}

function routeKeys(request: Request): { exact: string; plain: string } {
  const { pathname, search } = new URL(request.url());
  const path = pathname.slice(pathname.indexOf(MOCK_API_PREFIX) + MOCK_API_PREFIX.length);
  const plain = `${request.method()} ${path}`;
  return { exact: `${plain}${search}`, plain };
}

function jsonBody(request: Request): unknown {
  try {
    return request.postDataJSON() as unknown;
  } catch {
    // Multipart uploads and empty bodies are not JSON.
    return null;
  }
}

function answerOf(response: MockResponse, sent: unknown, request: Request): unknown {
  return response.respond ? response.respond(sent, request) : response.body;
}

interface Answer {
  status: number;
  json: unknown;
}

function jsonAnswer(response: MockResponse | undefined, sent: unknown, request: Request): Answer {
  if (!response) return { status: HTTP_NOT_FOUND, json: { detail: "not mocked" } };
  const answer = answerOf(response, sent, request);
  if (isReply(answer)) return { status: answer.status, json: answer.body };
  return { status: response.status ?? HTTP_OK, json: answer };
}

async function fulfil(route: Route, routes: MockRoutes, log: ApiLog): Promise<void> {
  const keys = routeKeys(route.request());
  const key = keys.exact in routes ? keys.exact : keys.plain;
  log.requests.push(key);
  const sent = jsonBody(route.request());
  log.calls.push({ key, body: sent });
  const response = routes[key];
  if (!response) log.unexpected.push(key);
  if (response?.contentType) {
    await route.fulfill({
      status: response.status ?? HTTP_OK,
      contentType: response.contentType,
      body: answerOf(response, sent, route.request()) as string,
    });
    return;
  }
  await route.fulfill(jsonAnswer(response, sent, route.request()));
}
