import type { JobDetail } from "@/api/jobs";
import type { TaskPhase } from "./pendingTasks";

/** workers/tasks/time_limits.py POSTING_DETAILS_FAILED: the extraction itself failed. */
export const POSTING_DETAILS_FAILED = "EXTRACTION_FAILED";
/** workers/tasks/time_limits.py POSTING_DETAILS_NOTHING_NEW: the run worked, but nothing was filled. */
export const POSTING_DETAILS_NOTHING_NEW = "NOTHING_NEW";

type PostingState = Pick<
  JobDetail,
  "posting_details_running" | "posting_details_error" | "description" | "posting_extracted"
>;

/**
 * The action is for jobs that have a stored posting and no field carrying the "from the posting"
 * mark yet: the ones analysed before the analysis read these details, or whose analysis found none.
 */
export function canTakeFromPosting(job: PostingState): boolean {
  return Boolean(job.description?.trim()) && !job.posting_extracted?.length;
}

/** The server's run state wins, so a started extraction survives a reload (its sweep ends a lost run). */
export function postingDetailsPhase(job: PostingState, clientPhase: TaskPhase): TaskPhase {
  if (job.posting_details_running) return "running";
  if (clientPhase !== "idle") return clientPhase;
  return job.posting_details_error === POSTING_DETAILS_FAILED ? "failed" : "idle";
}

/** True when the last run worked but found nothing to fill; shown as a hint, not as a failure. */
export function foundNothingNew(job: PostingState): boolean {
  return !job.posting_details_running && job.posting_details_error === POSTING_DETAILS_NOTHING_NEW;
}
