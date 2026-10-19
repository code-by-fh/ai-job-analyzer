import { z } from "zod";
import { crawlProgressSchema } from "@/api/crawlProgress";

// Backend change B3: every user-related event carries a top-level user_id.
const userScoped = { user_id: z.number().int() };
// Crawl events use job_id for the crawl run, not for a job posting.
const crawlRun = { ...userScoped, job_id: z.string() };
// Crawl events that can follow the pipeline carry its real progress (backend Task 6, additive).
const crawlStep = { ...crawlRun, progress: crawlProgressSchema.optional() };
const jobRef = z.object({ id: z.string() });
// new_job also carries the score and archive flag; an import toast reports both (decision D7).
const newJobRef = z.object({
  id: z.string(),
  match_score: z.number().nullish(),
  is_archived: z.boolean().nullish(),
});

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("crawl_job_started"),
    ...crawlStep,
    platform: z.string(),
    platform_id: z.number().int().nullish(),
    // Epoch milliseconds as a string (scraper hash convention).
    started_at: z.string().nullish(),
  }),
  z.object({
    type: z.literal("crawl_job_progress"),
    ...crawlStep,
    platform: z.string(),
    total: z.number(),
    scraping_completed: z.number().optional(),
  }),
  z.object({
    type: z.literal("crawl_job_extracting"),
    ...crawlStep,
    extracting_count: z.number(),
    total: z.number(),
  }),
  z.object({
    type: z.literal("job_analysis_started"),
    ...crawlStep,
    analysis_completed: z.number(),
  }),
  z.object({ type: z.literal("job_analysis_finished"), ...crawlStep, jobs_saved: z.number() }),
  z.object({ type: z.literal("crawl_job_completed"), ...crawlStep }),
  z.object({ type: z.literal("crawl_job_failed"), ...crawlRun }),
  z.object({ type: z.literal("crawl_job_cancelled"), ...crawlRun }),
  // A posting that already exists. The seed path omits existing_job_id, a duplicate sets it.
  z.object({ type: z.literal("job_skipped"), ...crawlStep, existing_job_id: z.string().nullish() }),
  z.object({ type: z.literal("crawl_completed"), ...userScoped }),
  z.object({
    type: z.literal("new_job"),
    ...userScoped,
    crawl_job_id: z.string().nullish(),
    job: newJobRef,
  }),
  z.object({ type: z.literal("job_updated"), ...userScoped, job: jobRef }),
  // End of a generation. `status` is not parsed: the client always refetches the job instead.
  z.object({
    type: z.literal("job_update"),
    ...userScoped,
    job_id: z.string(),
    error: z.string().nullish(),
  }),
  z.object({ type: z.literal("interview_prep_ready"), ...userScoped, job_id: z.string() }),
  // A research started on a job also names the job; its domain is null when the AI found none.
  z.object({
    type: z.literal("company_profile_ready"),
    ...userScoped,
    domain: z.string().nullish(),
    job_id: z.string().optional(),
  }),
  // The end of "Aus der Anzeige übernehmen"; the client reloads the job, which tells the outcome.
  z.object({ type: z.literal("posting_details_ended"), ...userScoped, job_id: z.string() }),
  // The end (either outcome) of a run inside a request; the client reloads the stored state.
  z.object({ type: z.literal("cv_import_ended"), ...userScoped }),
  z.object({ type: z.literal("deep_dive_ended"), ...userScoped, domain: z.string() }),
  // Also sent when the AI fill failed, so the gallery stops showing "in progress".
  z.object({ type: z.literal("template_ready"), ...userScoped, template_id: z.number().int() }),
  z.object({ type: z.literal("global_error"), ...userScoped }),
  // The only events the server may broadcast without user_id (B3 whitelist).
  z.object({ type: z.literal("ai_error") }),
  z.object({ type: z.literal("ai_error_cleared") }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent["type"];
export type EventOf<K extends RealtimeEventType> = Extract<RealtimeEvent, { type: K }>;

export const PROGRESS_EVENT_TYPES = [
  "crawl_job_started",
  "crawl_job_progress",
  "crawl_job_extracting",
  "job_analysis_started",
  "job_analysis_finished",
] as const;
export const FINISH_EVENT_TYPES = [
  "crawl_job_completed",
  "crawl_job_failed",
  "crawl_job_cancelled",
] as const;

export type ProgressEvent = EventOf<(typeof PROGRESS_EVENT_TYPES)[number]>;
export type FinishEvent = EventOf<(typeof FINISH_EVENT_TYPES)[number]>;
export type ActivityEvent = ProgressEvent | FinishEvent;

export function isFinishEvent(event: ActivityEvent): event is FinishEvent {
  return (FINISH_EVENT_TYPES as readonly string[]).includes(event.type);
}

/** Validates one WebSocket frame; anything unknown or malformed becomes null and is dropped. */
export function parseRealtimeMessage(raw: string): RealtimeEvent | null {
  try {
    const parsed = realtimeEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON (e.g. a proxy keep-alive frame): nothing to apply.
    return null;
  }
}
