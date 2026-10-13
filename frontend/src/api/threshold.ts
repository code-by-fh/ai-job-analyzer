import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { SCORE_BUCKETS } from "@/domain/threshold";
import { queryKeys } from "./queryKeys";

// Re-exported: e2e fixtures read it from the client-free domain module.
export { SCORE_BUCKETS } from "@/domain/threshold";
const THRESHOLD_OFF = 0;

// GET /settings returns the whole profile; the inbox only needs the threshold (0 = off).
const thresholdSettingsSchema = z.object({ match_threshold: z.number().int().nullish() });

const previewSchema = z.object({
  threshold: z.number().int(),
  would_archive: z.number().int(),
  would_restore: z.number().int(),
});
type ThresholdPreview = z.infer<typeof previewSchema>;
export type ThresholdPreviewBody = z.input<typeof previewSchema>;

const distributionSchema = z.object({
  counts: z.array(z.number().int().nonnegative()).length(SCORE_BUCKETS),
});
export type ThresholdDistributionBody = z.input<typeof distributionSchema>;

const appliedSchema = z.object({
  match_threshold: z.number().int(),
  archived: z.number().int(),
  restored: z.number().int(),
});
export type ThresholdApplied = z.infer<typeof appliedSchema>;
export type ThresholdAppliedBody = z.input<typeof appliedSchema>;

export async function fetchMatchThreshold(): Promise<number> {
  const settings = await api.request("/settings", thresholdSettingsSchema);
  return settings.match_threshold ?? THRESHOLD_OFF;
}

export async function fetchThresholdPreview(threshold: number): Promise<ThresholdPreview> {
  const query = new URLSearchParams({ threshold: String(threshold) });
  return api.request(`/matching-preference/preview?${query}`, previewSchema);
}

export async function fetchThresholdDistribution(): Promise<number[]> {
  const distribution = await api.request("/matching-preference/distribution", distributionSchema);
  return distribution.counts;
}

/** Saves the threshold and re-sorts the existing matches at once (B5 apply_to_existing). */
export async function applyThreshold(threshold: number): Promise<ThresholdApplied> {
  return api.request("/matching-preference", appliedSchema, {
    method: "POST",
    json: { match_threshold: threshold, apply_to_existing: true },
  });
}

export function matchThresholdQueryOptions() {
  return queryOptions({ queryKey: queryKeys.matchThreshold, queryFn: fetchMatchThreshold });
}

export function thresholdDistributionQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.thresholdDistribution,
    queryFn: fetchThresholdDistribution,
  });
}

export function thresholdPreviewQueryOptions(threshold: number) {
  return queryOptions({
    queryKey: queryKeys.thresholdPreview(threshold),
    queryFn: () => fetchThresholdPreview(threshold),
  });
}
