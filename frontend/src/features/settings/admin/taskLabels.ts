import type { AiTask } from "@/api/adminPaths";
import type { MessageKey } from "@/i18n/de";

/** The name of each AI task; a task id is never shown. */
export const TASK_LABEL: Readonly<Record<AiTask, MessageKey>> = {
  job_analysis: "settings.task.job_analysis",
  cover_letter: "settings.task.cover_letter",
  cv_tailoring: "settings.task.cv_tailoring",
  interview_prep: "settings.task.interview_prep",
  company_profile: "settings.task.company_profile",
  deep_dive: "settings.task.deep_dive",
  extract_job_details: "settings.task.extract_job_details",
  platform_name: "settings.task.platform_name",
};
