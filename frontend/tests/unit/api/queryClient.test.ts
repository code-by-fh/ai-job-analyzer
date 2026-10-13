import { describe, expect, it } from "vitest";
import { ApiError, networkError } from "@/api/errors";
import { MAX_QUERY_RETRIES, shouldRetry } from "@/api/queryClient";

const clientError = new ApiError({ status: 404, code: "NOT_FOUND", message: "" });
const serverError = new ApiError({ status: 500, code: "SERVER_ERROR", message: "" });
const expiredSession = new ApiError({ status: 401, code: "UNAUTHENTICATED", message: "" });

describe("shouldRetry", () => {
  it("does not retry client errors", () => {
    expect(shouldRetry(0, clientError)).toBe(false);
  });

  it("does not retry an expired session (apiFetch already refreshed once)", () => {
    expect(shouldRetry(0, expiredSession)).toBe(false);
  });

  it("retries server and network errors", () => {
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(1, networkError())).toBe(true);
  });

  it("stops at the retry limit", () => {
    expect(shouldRetry(MAX_QUERY_RETRIES, serverError)).toBe(false);
  });
});
