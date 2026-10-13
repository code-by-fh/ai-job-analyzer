import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@/api/setup";
import { currentStep, doneCount, showOnboarding, stepDone } from "@/domain/onboarding";

const NOTHING: SetupStatus = {
  has_source: false,
  ai_configured: false,
  profile_complete: false,
  has_jobs: false,
};
const DONE: SetupStatus = {
  has_source: true,
  ai_configured: true,
  profile_complete: true,
  has_jobs: true,
};

describe("showOnboarding", () => {
  it("shows on first run while a source or the AI provider is missing", () => {
    expect(showOnboarding(NOTHING, false)).toBe(true);
    expect(showOnboarding({ ...NOTHING, has_source: true }, false)).toBe(true);
    expect(showOnboarding({ ...NOTHING, ai_configured: true }, false)).toBe(true);
    expect(showOnboarding({ ...NOTHING, has_source: true, ai_configured: true }, false)).toBe(
      false,
    );
  });

  it("never hides found jobs behind the onboarding", () => {
    expect(showOnboarding({ ...NOTHING, has_jobs: true }, false)).toBe(false);
  });

  it("shows on request, but not without a status", () => {
    expect(showOnboarding(DONE, true)).toBe(true);
    expect(showOnboarding(undefined, true)).toBe(false);
    expect(showOnboarding(undefined, false)).toBe(false);
  });
});

describe("steps", () => {
  it("maps each step to its own flag", () => {
    expect(stepDone({ ...NOTHING, profile_complete: true }, "profile")).toBe(true);
    expect(stepDone({ ...NOTHING, has_source: true }, "source")).toBe(true);
    expect(stepDone({ ...NOTHING, ai_configured: true }, "ai")).toBe(true);
    expect(stepDone({ ...NOTHING, has_jobs: true }, "ai")).toBe(false);
  });

  it("counts done steps and names the first open one", () => {
    const status = { ...NOTHING, profile_complete: true };
    expect(doneCount(status)).toBe(1);
    expect(currentStep(status)).toBe("source");
    expect(currentStep(NOTHING)).toBe("profile");
    expect(doneCount(DONE)).toBe(3);
    expect(currentStep(DONE)).toBeNull();
  });
});
