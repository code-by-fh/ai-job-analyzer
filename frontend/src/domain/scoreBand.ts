export type ScoreBand = "strong" | "possible" | "weak";

// Bands of the prototype: Stark >= 80, Möglich >= 60, Schwach below.
export const STRONG_SCORE_MIN = 80;
export const POSSIBLE_SCORE_MIN = 60;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/** match_score is a float 0..100; the UI shows whole numbers and bands the shown number. */
export function roundScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(score)));
}

export function scoreBand(score: number): ScoreBand {
  if (score >= STRONG_SCORE_MIN) return "strong";
  return score >= POSSIBLE_SCORE_MIN ? "possible" : "weak";
}
