import { z } from "zod";

// Backend change B3: every user-related event carries a top-level user_id.
const userScoped = { user_id: z.number().int() };
// Crawl events use job_id for the crawl run, not for a job posting.
const crawlRun = { ...userScoped, job_id: z.string() };
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
    ...crawlRun,
    platform: z.string(),
    platform_id: z.number().int().nullish(),
  }),
  z.object({
    type: z.literal("crawl_job_progress"),
    ...crawlRun,
    platform: z.string(),
    total: z.number(),
    scraping_completed: z.number().optional(),
  }),
  z.object({
    type: z.literal("crawl_job_extracting"),
    ...crawlRun,
    extracting_count: z.number(),
    total: z.number(),
  }),
  z.object({
    type: z.literal("job_analysis_started"),
    ...crawlRun,
    analysis_completed: z.number(),
  }),
  z.object({ type: z.literal("job_analysis_finished"), ...crawlRun, jobs_saved: z.number() }),
  z.object({ type: z.literal("crawl_job_completed"), ...crawlRun }),
  z.object({ type: z.literal("crawl_job_failed"), ...crawlRun }),
  z.object({ type: z.literal("crawl_job_cancelled"), ...crawlRun }),
  // A posting that already exists. The seed path omits existing_job_id, a duplicate sets it.
  z.object({ type: z.literal("job_skipped"), ...crawlRun, existing_job_id: z.string().nullish() }),
  z.object({ type: z.literal("crawl_completed"), ...userScoped }),
  z.object({
    type: z.literal("new_job"),
    ...userScoped,
    crawl_job_id: z.string().nullish(),
    job: newJobRef,
  }),
  z.object({ type: z.literal("job_updated"), ...userScoped, job: jobRef }),
  // Generation and render tasks. `status` is deliberately not parsed: ai.render_document_pdf
  // publishes a status it never wrote to the database, so the client always refetches instead.
  z.object({
    type: z.literal("job_update"),
    ...userScoped,
    job_id: z.string(),
    rendered_kind: z.enum(["cv", "cover_letter"]).optional(),
    error: z.string().nullish(),
  }),
  z.object({ type: z.literal("interview_prep_ready"), ...userScoped, job_id: z.string() }),
  z.object({ type: z.literal("company_profile_ready"), ...userScoped, domain: z.string() }),
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
