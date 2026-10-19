import type { JobDetail } from "@/api/jobs";

const JOB_DEFAULTS: JobDetail = {
  id: "job-1",
  title: "Senior Backend Engineer",
  company: "ACME GmbH",
  company_domain: null,
  description: "Wir suchen eine erfahrene Person für unser Plattform-Team.",
  match_score: 84,
  reasoning: null,
  application_draft: null,
  cv_draft: null,
  interview_prep_material: null,
  interview_prep_running: false,
  interview_prep_error: null,
  company_research_running: false,
  company_research_error: null,
  posting_details_running: false,
  posting_details_error: null,
  status: "OPEN",
  url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
  is_favorite: false,
  contact_persons: null,
  recruiter_info: null,
  salary_benchmark: null,
  notes: null,
  is_archived: false,
  archive_reason: null,
  platform_id: 1,
  generation_error: null,
  checklist: null,
  todos: null,
  created_at: "2026-10-06T07:00:00+00:00",
  next_follow_up_at: null,
  cv_html_present: false,
  cover_letter_html_present: false,
  interview_at: null,
  pre_generation_status: null,
};

/** A job detail as GET /jobs/{id} returns it; tests override only what they are about. */
export function buildJob(overrides: Partial<JobDetail> = {}): JobDetail {
  return { ...JOB_DEFAULTS, ...overrides };
}
