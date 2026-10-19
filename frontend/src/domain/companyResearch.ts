import type { JobDetail } from "@/api/jobs";
import type { TaskPhase } from "./pendingTasks";

/** workers/tasks/time_limits.py RESEARCH_DOMAIN_NOT_FOUND: the AI found no web address of the company. */
export const RESEARCH_DOMAIN_NOT_FOUND = "DOMAIN_NOT_FOUND";
/** workers/tasks/time_limits.py RESEARCH_AI_UNREACHABLE: the AI service could not be reached, even on retry. */
export const RESEARCH_AI_UNREACHABLE = "AI_UNREACHABLE";

type FailureKey = "company.domainNotFound" | "company.aiUnreachable" | "company.researchFailed";

type ResearchState = Pick<JobDetail, "company_research_running" | "company_research_error">;

/**
 * The server's run state wins, so a research started on the job survives a reload (its sweep ends a
 * lost run); the client phase covers the time between the start request and the next load of the job.
 */
export function jobResearchPhase(job: ResearchState, clientPhase: TaskPhase): TaskPhase {
  if (job.company_research_running) return "running";
  if (clientPhase !== "idle") return clientPhase;
  return job.company_research_error ? "failed" : "idle";
}

/** The fixed text of a failed run; the server's code is never shown. null while nothing failed. */
export function researchFailureKey(job: ResearchState): FailureKey | null {
  if (job.company_research_running || !job.company_research_error) return null;
  switch (job.company_research_error) {
    case RESEARCH_DOMAIN_NOT_FOUND:
      return "company.domainNotFound";
    case RESEARCH_AI_UNREACHABLE:
      return "company.aiUnreachable";
    default:
      return "company.researchFailed";
  }
}
