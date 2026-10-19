import type { RealtimeEvent } from "./events";

export interface FilterContext {
  userId: number;
  isKnownJob: (jobId: string) => boolean;
}

/** The job posting an event patches, or null when the event is not about one job. */
export function scopedJobId(event: RealtimeEvent): string | null {
  switch (event.type) {
    case "job_updated":
      return event.job.id;
    case "job_update":
    case "interview_prep_ready":
    case "posting_details_ended":
      return event.job_id;
    default:
      return null;
  }
}

/**
 * Spec 6: never trust the socket blindly. Drop events for other users and for jobs this tab has
 * not loaded. Only the whitelisted global events come without user_id (enforced by the schema).
 */
export function acceptEvent(event: RealtimeEvent, context: FilterContext): boolean {
  if (!("user_id" in event)) return true;
  if (event.user_id !== context.userId) return false;
  const jobId = scopedJobId(event);
  return jobId === null || context.isKnownJob(jobId);
}
