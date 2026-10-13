import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN_PATH, loginRedirectUrl, safeNextPath } from "@/api/session";

describe("loginRedirectUrl", () => {
  it("carries the current path and query as an encoded next parameter", () => {
    expect(loginRedirectUrl("/jobs/1?tab=firma")).toBe("/login?next=%2Fjobs%2F1%3Ftab%3Dfirma");
  });
});

describe("safeNextPath", () => {
  it("accepts an encoded slash as a same-origin path", () => {
    expect(safeNextPath("/%2F/evil.example")).toBe("/%2F/evil.example");
  });

  it("does not mistake a path that merely starts with /login for the login page", () => {
    expect(safeNextPath("/login-help")).toBe("/login-help");
  });

  it("accepts a same-origin path with query", () => {
    expect(safeNextPath("/sources?quelle=3")).toBe("/sources?quelle=3");
  });

  it.each([
    "//evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\t\\evil.example",
    "javascript:alert(1)",
    "/login",
    "/login/",
    "https://evil.example",
    "/\\evil.example",
    "/login?next=%2Finbox",
    "inbox",
    "",
    null,
  ])("falls back to the inbox for %s", (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });
});
