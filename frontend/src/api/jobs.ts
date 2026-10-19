import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { ACTIVE_APPLICATION_STATUSES } from "./jobListPaths";
import { queryKeys } from "./queryKeys";

const jobCountsSchema = z.object({ status_counts: z.record(z.string(), z.number()) });
export type JobCounts = z.infer<typeof jobCountsSchema>;
export type JobCountsBody = z.input<typeof jobCountsSchema>;

/** Page shape of GET /jobs (`{items, total}`, limit <= 100); the list queries arrive with the inbox (phase 3). */
export interface JobListPage {
  items: ReadonlyArray<{ id: string }>;
  total: number;
}

// Backend JobChecklist: exactly these keys, defaults false, replaced as a whole on PATCH.
export const checklistSchema = z.object({
  posting_opened: z.boolean().default(false),
  documents_checked: z.boolean().default(false),
  sent: z.boolean().default(false),
});
export type JobChecklist = z.infer<typeof checklistSchema>;
export const EMPTY_CHECKLIST: JobChecklist = {
  posting_opened: false,
  documents_checked: false,
  sent: false,
};

// Backend FirstDayChecklist (feedback 1 T14): fixed keys, defaults false, replaced as a whole on PATCH.
export const firstDayChecklistSchema = z.object({
  contract_signed: z.boolean().default(false),
  papers_ready: z.boolean().default(false),
  others_declined: z.boolean().default(false),
  route_planned: z.boolean().default(false),
  first_day_contact: z.boolean().default(false),
});
export type FirstDayChecklist = z.infer<typeof firstDayChecklistSchema>;

const todoSchema = z.object({ id: z.string(), text: z.string(), done: z.boolean() });
export type JobTodo = z.infer<typeof todoSchema>;

// contact_persons, recruiter_info and salary_benchmark are free JSON columns that only this UI
// writes; an older or foreign shape is shown as empty instead of breaking the page.
// The server stores unset optional fields as null; they read as "" so one null cannot drop the
// whole object (and a later save blank it). Every server key is kept, so a save never loses one.
const optionalText = () =>
  z
    .string()
    .nullish()
    .transform((value) => value ?? "");
const contactSchema = z.object({
  name: z.string(),
  role: optionalText(),
  email: optionalText(),
  phone: optionalText(),
});
export type JobContact = z.infer<typeof contactSchema>;
const recruiterSchema = z.object({
  name: optionalText(),
  role: optionalText(),
  email: optionalText(),
  phone: optionalText(),
});
export type JobRecruiter = z.infer<typeof recruiterSchema>;
const salarySchema = z.object({
  min: z.number().nullish(),
  max: z.number().nullish(),
  note: z.string().default(""),
});
export type JobSalary = z.infer<typeof salarySchema>;

export const jobDetailSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  company_domain: z.string().nullish(),
  description: z.string().nullish(),
  match_score: z.number().nullish(),
  reasoning: z.string().nullish(),
  application_draft: z.string().nullish(),
  cv_draft: z.string().nullish(),
  interview_prep_material: z.string().nullish(),
  // Durable server run state: a running prep survives a reload; the error is a fixed text never shown.
  interview_prep_running: z.boolean().default(false),
  interview_prep_error: z.string().nullish(),
  // Start stamps of the running work (ISO UTC); the elapsed time counts from them across a reload.
  interview_prep_started_at: z.string().nullish(),
  // Durable company research run state of this job; the error is a fixed code (companyResearch.ts).
  company_research_running: z.boolean().default(false),
  company_research_error: z.string().nullish(),
  company_research_started_at: z.string().nullish(),
  // Durable run state of "Aus der Anzeige übernehmen"; the error is a fixed code (domain/postingDetails.ts).
  posting_details_running: z.boolean().default(false),
  posting_details_error: z.string().nullish(),
  posting_details_started_at: z.string().nullish(),
  status: z.string(),
  url: z.string().nullish(),
  is_favorite: z.boolean().nullish(),
  contact_persons: z.array(contactSchema).nullish().catch(null),
  recruiter_info: recruiterSchema.nullish().catch(null),
  salary_benchmark: salarySchema.nullish().catch(null),
  // Names of the fields above that the job analysis filled from the posting.
  posting_extracted: z.array(z.string()).nullish().catch(null),
  notes: z.string().nullish(),
  is_archived: z.boolean().nullish(),
  archive_reason: z.string().nullish(),
  platform_id: z.number().int().nullish(),
  generation_error: z.string().nullish(),
  // Set when a worker really starts the generation; null while it waits in the queue.
  generation_started_at: z.string().nullish(),
  checklist: checklistSchema.nullish().catch(EMPTY_CHECKLIST),
  todos: z.array(todoSchema).nullish().catch(null),
  // Offer outcome tabs (feedback 1 T14); start_date is a calendar day "YYYY-MM-DD", no instant.
  outcome_notes: z.string().nullish(),
  first_day_checklist: firstDayChecklistSchema.nullish().catch(null),
  start_date: z.string().nullish(),
  created_at: z.string().nullish(),
  next_follow_up_at: z.string().nullish(),
  interview_at: z.string().nullish(),
  cv_html_present: z.boolean().default(false),
  cover_letter_html_present: z.boolean().default(false),
  pre_generation_status: z.string().nullish(),
});
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type JobDetailBody = z.input<typeof jobDetailSchema>;

const historyEntrySchema = z.object({
  id: z.number().int(),
  from_status: z.string().nullish(),
  to_status: z.string(),
  changed_at: z.string().nullish(),
  note: z.string().nullish(),
});
export type JobHistoryEntry = z.infer<typeof historyEntrySchema>;
export type JobHistoryBody = z.input<typeof historyEntrySchema>;

export interface StatusChange {
  to: string;
  note?: string;
}

export interface JobPatch {
  is_archived?: boolean;
  notes?: string;
  outcome_notes?: string;
  checklist?: JobChecklist;
  first_day_checklist?: FirstDayChecklist;
  // "YYYY-MM-DD" sets the day, null clears it, omitted keeps it.
  start_date?: string | null;
  todos?: readonly JobTodo[];
  // ISO string sets the date, null clears it, omitted keeps it.
  next_follow_up_at?: string | null;
  interview_at?: string | null;
  contact_persons?: readonly JobContact[];
  recruiter_info?: JobRecruiter;
  salary_benchmark?: JobSalary;
  cv_draft?: string;
}

const PREP_START_STATUSES = ["exists", "queued"] as const;
export type PrepStart = (typeof PREP_START_STATUSES)[number];
const prepStartSchema = z.object({ status: z.enum(PREP_START_STATUSES) });
const statusSchema = z.object({ status: z.string() });

export function jobPath(id: string): string {
  return `/jobs/${encodeURIComponent(id)}`;
}

export async function fetchJobCounts(): Promise<JobCounts> {
  return api.request("/jobs/counts?is_archived=false", jobCountsSchema);
}

/** Inbox badge: active OPEN jobs, the "Treffer" (spec 4.3). */
export function openMatchCount(counts: JobCounts | undefined): number {
  return counts?.status_counts.OPEN ?? 0;
}

/** Bewerbungen header "n aktiv": every active application, whatever its phase. */
export function activeApplicationCount(counts: JobCounts | undefined): number {
  const byStatus = counts?.status_counts ?? {};
  return ACTIVE_APPLICATION_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
}

/** One query for the nav badges and the Bewerbungen header. */
export function jobCountsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.jobCounts, queryFn: fetchJobCounts });
}

export async function fetchJob(id: string): Promise<JobDetail> {
  return api.request(jobPath(id), jobDetailSchema);
}

/** The one way to change a status (B1): validated on the server, always written to the history. */
export async function changeJobStatus(id: string, change: StatusChange): Promise<JobDetail> {
  return api.request(`${jobPath(id)}/status`, jobDetailSchema, { method: "POST", json: change });
}

/** PATCH answers {"status":"updated"}; callers invalidate the job afterwards. */
export async function patchJob(id: string, patch: JobPatch): Promise<void> {
  await api.request(jobPath(id), statusSchema, { method: "PATCH", json: patch });
}

export async function fetchJobHistory(id: string): Promise<JobHistoryEntry[]> {
  return api.request(`${jobPath(id)}/history`, z.array(historyEntrySchema));
}

/** Ends with a job_updated event once the new score is stored. */
export async function reanalyzeJob(id: string): Promise<void> {
  await api.request(`${jobPath(id)}/analyze`, statusSchema, { method: "POST" });
}

/** Ends with interview_prep_ready; "exists" means nothing was started. */
export async function startInterviewPrep(id: string, regenerate: boolean): Promise<PrepStart> {
  const suffix = regenerate ? "/interview-prep/regenerate" : "/interview-prep";
  const started = await api.request(`${jobPath(id)}${suffix}`, prepStartSchema, {
    method: "POST",
  });
  return started.status;
}

const POSTING_DETAILS_START_STATUSES = ["queued", "running"] as const;
export type PostingDetailsStart = (typeof POSTING_DETAILS_START_STATUSES)[number];
const postingDetailsStartSchema = z.object({ status: z.enum(POSTING_DETAILS_START_STATUSES) });

/** Ends with posting_details_ended; "running" means one is already running. */
export async function startPostingDetails(id: string): Promise<PostingDetailsStart> {
  const started = await api.request(`${jobPath(id)}/posting-details`, postingDetailsStartSchema, {
    method: "POST",
  });
  return started.status;
}

export function jobQueryOptions(id: string) {
  return queryOptions({ queryKey: queryKeys.job(id), queryFn: () => fetchJob(id) });
}

export function jobHistoryQueryOptions(id: string) {
  return queryOptions({ queryKey: queryKeys.jobHistory(id), queryFn: () => fetchJobHistory(id) });
}

const deletedSchema = z.object({ status: z.enum(["archived", "deleted"]) });
export type DeleteOutcome = z.infer<typeof deletedSchema>["status"];

/** DELETE archives an active job and removes an archived one for good, with its history and document rows (files on disk are not removed). */
export async function deleteJob(id: string): Promise<DeleteOutcome> {
  const deleted = await api.request(jobPath(id), deletedSchema, { method: "DELETE" });
  return deleted.status;
}
