import { describe, expect, it } from "vitest";
import {
  canTakeFromPosting,
  foundNothingNew,
  POSTING_DETAILS_FAILED,
  POSTING_DETAILS_NOTHING_NEW,
  postingDetailsPhase,
} from "@/domain/postingDetails";

const JOB = {
  description: "Wir suchen eine Person.",
  posting_extracted: null,
  posting_details_running: false,
  posting_details_error: null,
};

describe("canTakeFromPosting", () => {
  it("offers the action for a job with posting text and no extracted mark", () => {
    expect(canTakeFromPosting(JOB)).toBe(true);
  });

  it("does not offer it without posting text", () => {
    expect(canTakeFromPosting({ ...JOB, description: "  " })).toBe(false);
    expect(canTakeFromPosting({ ...JOB, description: null })).toBe(false);
  });

  it("does not offer it once a field carries the extracted mark", () => {
    expect(canTakeFromPosting({ ...JOB, posting_extracted: ["salary_benchmark"] })).toBe(false);
  });
});

describe("postingDetailsPhase", () => {
  it("is running while the server reports a run, whatever the client remembers", () => {
    expect(postingDetailsPhase({ ...JOB, posting_details_running: true }, "idle")).toBe("running");
  });

  it("follows the client between the start request and the next load of the job", () => {
    expect(postingDetailsPhase(JOB, "running")).toBe("running");
  });

  it("is failed after a run the server ended with the failure code", () => {
    expect(
      postingDetailsPhase({ ...JOB, posting_details_error: POSTING_DETAILS_FAILED }, "idle"),
    ).toBe("failed");
  });

  it("treats an empty result as idle, not as a failure", () => {
    const job = { ...JOB, posting_details_error: POSTING_DETAILS_NOTHING_NEW };
    expect(postingDetailsPhase(job, "idle")).toBe("idle");
    expect(foundNothingNew(job)).toBe(true);
  });
});
