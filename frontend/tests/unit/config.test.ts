import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseApiBaseUrl, RUNTIME_API_URL_PLACEHOLDER, toWebSocketUrl } from "@/config";

describe("parseApiBaseUrl", () => {
  it("strips trailing slashes from an http URL", () => {
    expect(parseApiBaseUrl("http://localhost:8002/")).toBe("http://localhost:8002");
  });

  it("accepts the Docker runtime placeholder", () => {
    expect(parseApiBaseUrl(RUNTIME_API_URL_PLACEHOLDER)).toBe("APP_API_URL");
  });

  it("rejects a missing value", () => {
    expect(() => parseApiBaseUrl(undefined)).toThrow(ZodError);
  });

  it("rejects a non-http protocol", () => {
    expect(() => parseApiBaseUrl("ftp://files.example.com")).toThrow(ZodError);
  });
});

describe("toWebSocketUrl", () => {
  it("maps http to ws and appends /ws", () => {
    expect(toWebSocketUrl("http://localhost:8002")).toBe("ws://localhost:8002/ws");
  });

  it("maps https to wss", () => {
    expect(toWebSocketUrl("https://api.example.com")).toBe("wss://api.example.com/ws");
  });
});
