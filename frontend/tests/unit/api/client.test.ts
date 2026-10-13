import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient, createSingleFlight } from "@/api/client";
import { ApiError } from "@/api/errors";
import {
  createFakeFetch,
  jsonResponse,
  type RecordedCall,
  type Responder,
} from "../support/fakeFetch";

const BASE_URL = "http://api.test";
const statusSchema = z.object({ status: z.string() });
const valueSchema = z.object({ value: z.string() });
const UNAUTHORIZED = { detail: "Could not validate credentials" };

function clientWith(responder: Responder) {
  const fake = createFakeFetch(responder);
  const onAuthLost = vi.fn();
  const client = createApiClient({ baseUrl: BASE_URL, onAuthLost, fetchImpl: fake.fetchImpl });
  return { client, onAuthLost, calls: fake.calls };
}

const isRefresh = (call: RecordedCall) => call.url.endsWith("/auth/refresh");

/** Answers 401 until a successful refresh, then echoes the requested URL. */
function expiringSession(refreshStatus: number): Responder {
  let refreshed = false;
  return (call) => {
    if (isRefresh(call)) {
      refreshed = refreshStatus === 200;
      return jsonResponse(refreshStatus, { status: "ok" });
    }
    return refreshed ? jsonResponse(200, { value: call.url }) : jsonResponse(401, UNAUTHORIZED);
  };
}

describe("ApiClient.request", () => {
  it("sends cookies and returns the validated body", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { value: "x", extra: 1 }));
    await expect(client.request("/me", valueSchema)).resolves.toEqual({ value: "x" });
    expect(calls[0]).toMatchObject({
      url: "http://api.test/me",
      method: "GET",
      credentials: "include",
    });
  });

  it("asks for JSON", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { value: "x" }));
    await client.request("/me", valueSchema);
    expect(calls[0].headers.get("Accept")).toBe("application/json");
  });

  it("posts form fields url-encoded", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { status: "ok" }));
    await client.request("/auth/login", statusSchema, {
      method: "POST",
      form: { username: "admin", password: "a&b" },
    });
    expect(calls[0].body).toBe("username=admin&password=a%26b");
  });

  it("posts JSON bodies", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { status: "ok" }));
    await client.request("/language-preference", statusSchema, {
      method: "POST",
      json: { language: "en" },
    });
    expect(calls[0].body).toBe('{"language":"en"}');
  });

  it("returns undefined for 204 No Content", async () => {
    const { client } = clientWith(() => new Response(null, { status: 204 }));
    await expect(
      client.request("/x", z.undefined(), { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("refreshes once for concurrent 401s and retries every request", async () => {
    const { client, calls } = clientWith(expiringSession(200));
    const results = await Promise.all(
      ["/a", "/b", "/c"].map((path) => client.request(path, valueSchema)),
    );
    expect(results.map((result) => result.value)).toEqual([
      "http://api.test/a",
      "http://api.test/b",
      "http://api.test/c",
    ]);
    expect(calls.filter(isRefresh)).toHaveLength(1);
  });

  it("reports a lost session when the refresh is rejected", async () => {
    const { client, onAuthLost } = clientWith(expiringSession(401));
    const result = client.request("/me", valueSchema);
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it("reports a lost session when the retried request is still 401", async () => {
    const responder: Responder = (call) =>
      isRefresh(call) ? jsonResponse(200, { status: "ok" }) : jsonResponse(401, UNAUTHORIZED);
    const { client, onAuthLost, calls } = clientWith(responder);
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });

  it.each([500, 429])("keeps the session when the refresh answers %i", async (status) => {
    const { client, onAuthLost } = clientWith(expiringSession(status));
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({
      code: status === 429 ? "RATE_LIMITED" : "SERVER_ERROR",
    });
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("reports a lost session once for concurrent requests", async () => {
    const { client, onAuthLost } = clientWith(expiringSession(401));
    const results = await Promise.allSettled(
      ["/a", "/b", "/c"].map((path) => client.request(path, valueSchema)),
    );
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the refresh endpoint is unreachable", async () => {
    const responder: Responder = (call) => {
      if (isRefresh(call)) throw new TypeError("Failed to fetch");
      return jsonResponse(401, UNAUTHORIZED);
    };
    const { client, onAuthLost } = clientWith(responder);
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("does not refresh when skipAuthRefresh is set (wrong password)", async () => {
    const { client, onAuthLost, calls } = clientWith(() =>
      jsonResponse(401, { detail: "Incorrect username or password" }),
    );
    const login = client.request("/auth/login", statusSchema, {
      method: "POST",
      skipAuthRefresh: true,
    });
    await expect(login).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(calls).toHaveLength(1);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("turns a scraper 200 + status error body into UPSTREAM_ERROR", async () => {
    const { client } = clientWith(() =>
      jsonResponse(200, { status: "error", message: "Seite nicht erreichbar" }),
    );
    await expect(client.request("/scraper/x", statusSchema)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "Seite nicht erreichbar",
    });
  });

  it("rejects a body that does not match the schema with BAD_RESPONSE", async () => {
    const { client } = clientWith(() => jsonResponse(200, { unexpected: true }));
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({
      code: "BAD_RESPONSE",
      message: "",
    });
  });

  it("maps a rejected fetch to NETWORK_ERROR", async () => {
    const { client } = clientWith(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("rethrows aborts untouched so query cancellation stays silent", async () => {
    const { client } = clientWith(() => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(client.request("/me", valueSchema)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("ApiClient.request with FormData", () => {
  it("sends the FormData unchanged and lets the browser set the multipart Content-Type", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { status: "ok" }));
    const formData = new FormData();
    formData.append("file", new Blob(["%PDF"], { type: "application/pdf" }), "cv.pdf");
    await client.request("/upload-cv", statusSchema, { method: "POST", formData });
    expect(calls[0].rawBody).toBe(formData);
    expect(calls[0].headers.get("Content-Type")).toBeNull();
  });
});

const PDF_BYTES = "%PDF-1.7";

function fileResponse(contentDisposition?: string): Response {
  const headers = new Headers({ "Content-Type": "application/pdf" });
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  return new Response(PDF_BYTES, { status: 200, headers });
}

describe("ApiClient.requestBlob", () => {
  it("accepts any content type for a download", async () => {
    const { client, calls } = clientWith(() => fileResponse());
    await client.requestBlob("/cv.pdf");
    expect(calls[0].headers.get("Accept")).toBe("*/*");
  });

  it("returns the file and its filename from Content-Disposition", async () => {
    const { client } = clientWith(() => fileResponse('attachment; filename="Anschreiben.pdf"'));
    const file = await client.requestBlob("/jobs/j1/documents/letter/pdf");
    expect(await file.blob.text()).toBe(PDF_BYTES);
    expect(file.filename).toBe("Anschreiben.pdf");
  });

  it("prefers the UTF-8 filename* parameter", async () => {
    const { client } = clientWith(() =>
      fileResponse(
        "attachment; filename=\"Lebenslauf.pdf\"; filename*=UTF-8''Lebenslauf%20M%C3%BCller.pdf",
      ),
    );
    const file = await client.requestBlob("/cv.pdf");
    expect(file.filename).toBe("Lebenslauf Müller.pdf");
  });

  it("falls back to the plain filename when filename* is malformed", async () => {
    const { client } = clientWith(() =>
      fileResponse("attachment; filename=cv.pdf; filename*=UTF-8''%E0%A4%A.pdf"),
    );
    await expect(client.requestBlob("/cv.pdf")).resolves.toMatchObject({ filename: "cv.pdf" });
  });

  it("has no filename when the server sends no Content-Disposition", async () => {
    const { client } = clientWith(() => fileResponse());
    await expect(client.requestBlob("/cv.pdf")).resolves.toMatchObject({ filename: null });
  });

  it("refreshes the session on 401 and retries the download once", async () => {
    let refreshed = false;
    const responder: Responder = (call) => {
      if (isRefresh(call)) {
        refreshed = true;
        return jsonResponse(200, { status: "ok" });
      }
      return refreshed ? fileResponse() : jsonResponse(401, UNAUTHORIZED);
    };
    const { client, calls, onAuthLost } = clientWith(responder);
    const file = await client.requestBlob("/cv.pdf");
    expect(await file.blob.text()).toBe(PDF_BYTES);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/cv.pdf",
      "http://api.test/auth/refresh",
      "http://api.test/cv.pdf",
    ]);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("normalises the JSON error body of a failed download", async () => {
    const { client } = clientWith(() => jsonResponse(404, { detail: "Document not found" }));
    await expect(client.requestBlob("/cv.pdf")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Document not found",
    });
  });

  it("hides the text of a server error on a download", async () => {
    const { client } = clientWith(() => new Response("Bad Gateway", { status: 502 }));
    await expect(client.requestBlob("/cv.pdf")).rejects.toMatchObject({
      code: "SERVER_ERROR",
      message: "",
    });
  });
});

describe("createSingleFlight", () => {
  it("shares one in-flight run between concurrent callers", async () => {
    const task = vi.fn(async () => true);
    const run = createSingleFlight(task);
    await Promise.all([run(), run()]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("starts a new run after the previous one settled", async () => {
    const task = vi.fn(async () => true);
    const run = createSingleFlight(task);
    await run();
    await run();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
