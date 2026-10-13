import { describe, expect, it } from "vitest";
import { stubRoutes } from "./stubRoutes";

describe("stubRoutes", () => {
  it("answers a missing stub with 404 that names the route, so the failing test says what to add", async () => {
    stubRoutes({});
    const response = await fetch("http://api.test/jobs/job-1/history?limit=5", { method: "GET" });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: "not stubbed: GET /jobs/job-1/history",
    });
  });
});
