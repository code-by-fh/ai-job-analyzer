import type { SetupStatus } from "@/api/setup";

export const ONBOARDING_STEPS = ["profile", "source", "ai"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Spec 4.3 #8 / decision D6: the first run (no source or no AI provider, nothing found yet), or on
 * request (?view=setup). Without a status (the request failed) the inbox shows: the setup is advisory.
 */
export function showOnboarding(status: SetupStatus | undefined, requested: boolean): boolean {
  if (!status) return false;
  if (requested) return true;
  return (!status.has_source || !status.ai_configured) && !status.has_jobs;
}

export function stepDone(status: SetupStatus, step: OnboardingStep): boolean {
  const done: Readonly<Record<OnboardingStep, boolean>> = {
    profile: status.profile_complete,
    source: status.has_source,
    ai: status.ai_configured,
  };
  return done[step];
}

export function doneCount(status: SetupStatus): number {
  return ONBOARDING_STEPS.filter((step) => stepDone(status, step)).length;
}

/** The first open step carries the one primary button (one next move, spec 5); null when all are done. */
export function currentStep(status: SetupStatus): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !stepDone(status, step)) ?? null;
}
