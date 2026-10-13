export interface RecordedCall {
  url: string;
  method: string;
  body: string | null;
  /** The body as passed to fetch, e.g. to check that a FormData went out unchanged. */
  rawBody: BodyInit | null;
  headers: Headers;
  credentials: RequestCredentials | undefined;
}

/** A Promise lets a test hold a response back, e.g. to overlap two requests. */
export type Responder = (call: RecordedCall) => Response | Promise<Response>;

export interface FakeFetch {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
}

/** A fetch stand-in that records every call; a responder that throws simulates a network error. */
export function createFakeFetch(responder: Responder): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? String(init.body) : null,
      rawBody: init?.body ?? null,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
    };
    calls.push(call);
    return responder(call);
  };
  return { fetchImpl, calls };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
