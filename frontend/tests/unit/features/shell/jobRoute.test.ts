import { describe, expect, it } from "vitest";
import { jobRoute } from "@/features/shell/routes";

describe("jobRoute", () => {
  it("builds the app route of a job and encodes the id", () => {
    expect(jobRoute("job-30")).toBe("/jobs/job-30");
    expect(jobRoute("a/b")).toBe("/jobs/a%2Fb");
  });
});
