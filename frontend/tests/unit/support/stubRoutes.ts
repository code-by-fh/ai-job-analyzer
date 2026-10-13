import { vi } from "vitest";
import { createFakeFetch, jsonResponse, type RecordedCall, type Responder } from "./fakeFetch";

/** "METHOD /path" (query string ignored) -> JSON body, Response, or a function building one (or a Promise of one). */
export type RouteTable = Readonly<Record<string, unknown>>;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

function answer(value: unknown, call: RecordedCall): Response | Promise<Response> {
  if (typeof value === "function") return (value as Responder)(call);
  return value instanceof Response ? value : jsonResponse(HTTP_OK, value);
}

/** Stubs the global fetch; an unknown route answers 404 so a missing stub fails loudly. */
export function stubRoutes(routes: RouteTable): RecordedCall[] {
  const fake = createFakeFetch((call) => {
    const key = `${call.method} ${new URL(call.url).pathname}`;
    return key in routes
      ? answer(routes[key], call)
      : jsonResponse(HTTP_NOT_FOUND, { detail: `not stubbed: ${key}` });
  });
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}
