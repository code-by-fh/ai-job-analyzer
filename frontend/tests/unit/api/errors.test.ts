import { describe, expect, it } from "vitest";
import { ApiError, errorFromResponse, errorFromScraperBody } from "@/api/errors";

describe("errorFromResponse", () => {
  it("keeps a FastAPI detail string as the message", () => {
    const error = errorFromResponse(404, { detail: "Job not found" });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Job not found" });
  });

  it("maps a Pydantic detail list to per-field errors", () => {
    const error = errorFromResponse(422, {
      detail: [
        { loc: ["body", "username"], msg: "Field required", type: "missing" },
        {
          loc: ["body", "cv_data", "education"],
          msg: "Input should be a string",
          type: "string_type",
        },
      ],
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toEqual({
      username: "Field required",
      "cv_data.education": "Input should be a string",
    });
    expect(error.message).toBe("Field required");
  });

  it("maps the slowapi 429 body to RATE_LIMITED without passing its text on", () => {
    const error = errorFromResponse(429, { error: "Rate limit exceeded: 5 per 1 minute" });
    expect(error).toMatchObject({ code: "RATE_LIMITED", message: "" });
  });

  it("hides the detail of server errors", () => {
    const error = errorFromResponse(500, { detail: "Internal server error" });
    expect(error).toMatchObject({ status: 500, code: "SERVER_ERROR", message: "" });
  });

  it("handles the plain-text 502 of the scraper proxy", () => {
    expect(errorFromResponse(502, "Scraper service unavailable").code).toBe("SERVER_ERROR");
  });

  it("maps 409 to CONFLICT", () => {
    expect(errorFromResponse(409, { detail: "Cannot change status" }).code).toBe("CONFLICT");
  });

  it("falls back to BAD_REQUEST for an unmapped 4xx status", () => {
    expect(errorFromResponse(418, { detail: "Nope" })).toMatchObject({
      code: "BAD_REQUEST",
      message: "Nope",
    });
  });
});

describe("errorFromScraperBody", () => {
  it("turns 200 + status error into UPSTREAM_ERROR", () => {
    const error = errorFromScraperBody({ status: "Error", message: "Seite nicht erreichbar" });
    expect(error).toMatchObject({
      status: 200,
      code: "UPSTREAM_ERROR",
      message: "Seite nicht erreichbar",
    });
  });

  it("ignores successful scraper bodies", () => {
    expect(errorFromScraperBody({ status: "Started", job_id: "c1" })).toBeNull();
    expect(errorFromScraperBody({ jobs: [] })).toBeNull();
  });
});
