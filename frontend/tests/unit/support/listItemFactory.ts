import type { JobListItem, JobPage } from "@/api/jobList";

const ITEM_DEFAULTS: JobListItem = {
  id: "job-1",
  title: "Senior Backend Engineer",
  company: "ACME GmbH",
  match_score: 84,
  reasoning: null,
  url: "https://www.stepstone.de/stellenangebote--senior-backend-engineer--1.html",
  status: "OPEN",
  is_archived: false,
  archive_reason: null,
  platform_id: 1,
  created_at: "2026-10-06T07:00:00+00:00",
  next_follow_up_at: null,
  interview_at: null,
  cv_html_present: false,
  cover_letter_html_present: false,
  pre_generation_status: null,
  interview_prep_present: false,
  status_changed_at: null,
  application_draft_present: false,
};

/** A row as GET /jobs returns it; tests override only what they are about. */
export function buildListItem(overrides: Partial<JobListItem> = {}): JobListItem {
  return { ...ITEM_DEFAULTS, ...overrides };
}

export function pageOf(items: JobListItem[], total = items.length): JobPage {
  return { items, total };
}
