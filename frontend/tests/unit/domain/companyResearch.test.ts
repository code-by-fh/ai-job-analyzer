import { describe, expect, it } from "vitest";
import {
  jobResearchPhase,
  RESEARCH_AI_UNREACHABLE,
  RESEARCH_DOMAIN_NOT_FOUND,
  researchFailureKey,
} from "@/domain/companyResearch";

const IDLE_JOB = { company_research_running: false, company_research_error: null };
const RESEARCH_FAILED = "RESEARCH_FAILED";

describe("jobResearchPhase", () => {
  it("is running while the server reports a run, whatever the client remembers", () => {
    expect(jobResearchPhase({ ...IDLE_JOB, company_research_running: true }, "idle")).toBe(
      "running",
    );
    expect(jobResearchPhase({ ...IDLE_JOB, company_research_running: true }, "stalled")).toBe(
      "running",
    );
  });

  it("follows the client between the start request and the next load of the job", () => {
    expect(jobResearchPhase(IDLE_JOB, "running")).toBe("running");
  });

  it("is failed after a run the server ended with an error", () => {
    expect(jobResearchPhase({ ...IDLE_JOB, company_research_error: RESEARCH_FAILED }, "idle")).toBe(
      "failed",
    );
  });

  it("is idle without any run", () => {
    expect(jobResearchPhase(IDLE_JOB, "idle")).toBe("idle");
  });
});

describe("researchFailureKey", () => {
  it("asks for the domain when the AI found none", () => {
    const job = { ...IDLE_JOB, company_research_error: RESEARCH_DOMAIN_NOT_FOUND };
    expect(researchFailureKey(job)).toBe("company.domainNotFound");
  });

  it("says the AI service is unreachable when the server could not reach it", () => {
    const job = { ...IDLE_JOB, company_research_error: RESEARCH_AI_UNREACHABLE };
    expect(researchFailureKey(job)).toBe("company.aiUnreachable");
  });

  it("maps every other code to the fixed failure text", () => {
    const job = { ...IDLE_JOB, company_research_error: RESEARCH_FAILED };
    expect(researchFailureKey(job)).toBe("company.researchFailed");
  });

  it("is null while nothing failed or a new run is under way", () => {
    expect(researchFailureKey(IDLE_JOB)).toBeNull();
    const running = { company_research_running: true, company_research_error: RESEARCH_FAILED };
    expect(researchFailureKey(running)).toBeNull();
  });
});
