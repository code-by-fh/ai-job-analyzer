import { POSSIBLE_SCORE_MIN, STRONG_SCORE_MIN } from "./scoreBand";

export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 100;
/** One count per whole score 0..THRESHOLD_MAX (GET /matching-preference/distribution). */
export const SCORE_BUCKETS = THRESHOLD_MAX + 1;
/** Step 1 on slider and number field alike, so the thumb always draws the applied value (R17). */
export const THRESHOLD_STEP = 1;
/** Ticks grow with the number of jobs on one score, up to this many levels. */
export const MAX_TICK_LEVEL = 4;

export type ThresholdBand = "all" | "weak" | "possible" | "strong";

export interface Tick {
  score: number;
  level: number;
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return THRESHOLD_MIN;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(value)));
}

/** A typed threshold, or null when it is empty, fractional or out of range (R17). */
export function parseThreshold(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  const inRange = value >= THRESHOLD_MIN && value <= THRESHOLD_MAX;
  return Number.isInteger(value) && inRange ? value : null;
}

/**
 * Where score n sits on the threshold scale, in percent of the track. Slider thumb, ticks and
 * scale labels all use this one mapping inside a box inset by half a thumb on each side.
 */
export function thresholdPercent(score: number): number {
  return (score / THRESHOLD_MAX) * 100;
}

/** Prototype thresholdBand: which matches still reach "Neu" at this value. */
export function thresholdBand(value: number): ThresholdBand {
  if (value >= STRONG_SCORE_MIN) return "strong";
  if (value >= POSSIBLE_SCORE_MIN) return "possible";
  return value > THRESHOLD_MIN ? "weak" : "all";
}

/** The tick/barcode device of the usability review: one tick per score that has jobs. */
export function distributionTicks(counts: readonly number[]): Tick[] {
  return counts.flatMap((count, score) =>
    count > 0 ? [{ score, level: Math.min(count, MAX_TICK_LEVEL) }] : [],
  );
}

export function countAll(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

export function countBelow(counts: readonly number[], threshold: number): number {
  return countAll(counts.slice(0, clampThreshold(threshold)));
}
