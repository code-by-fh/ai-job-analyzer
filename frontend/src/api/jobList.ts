import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { checklistSchema } from "./jobs";
import {
  applicationsListPath,
  dueListPath,
  inboxListPath,
  type ApplicationsQuery,
  type InboxTab,
} from "./jobListPaths";
import { queryKeys } from "./queryKeys";

// Re-exported: the path builders live apart so e2e fixtures can import them without the API client.
export {
  ACTIVE_APPLICATION_STATUSES,
  APPLICATION_GROUPS,
  APPLICATIONS_PAGE_SIZE,
  applicationsListPath,
  type ApplicationGroup,
  type ApplicationsQuery,
  DUE_PAGE_SIZE,
  dueListPath,
  INBOX_PAGE_SIZE,
  INBOX_TABS,
  inboxListPath,
  type InboxTab,
} from "./jobListPaths";

// GET /jobs items (B6): no description or HTML bodies, presence flags instead.
const jobListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  company: z.string().nullish(),
  match_score: z.number().nullish(),
  reasoning: z.string().nullish(),
  url: z.string().nullish(),
  status: z.string(),
  is_archived: z.boolean().nullish(),
  archive_reason: z.string().nullish(),
  platform_id: z.number().int().nullish(),
  created_at: z.string().nullish(),
  next_follow_up_at: z.string().nullish(),
  interview_at: z.string().nullish(),
  cv_html_present: z.boolean().default(false),
  cover_letter_html_present: z.boolean().default(false),
  pre_generation_status: z.string().nullish(),
  interview_prep_present: z.boolean().default(false),
  // The last user status change ("since") and whether a letter draft exists.
  status_changed_at: z.string().nullish(),
  application_draft_present: z.boolean().default(false),
  // nextStep needs it to tell "Bewerben" from "Als beworben markieren"; one odd legacy value must not fail the page.
  checklist: checklistSchema.nullish().catch(null),
});
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobListItemBody = z.input<typeof jobListItemSchema>;

const jobPageSchema = z.object({
  items: z.array(jobListItemSchema),
  total: z.number().int().nonnegative(),
});
export type JobPage = z.infer<typeof jobPageSchema>;
export type JobPageBody = z.input<typeof jobPageSchema>;

export async function fetchJobPage(path: string): Promise<JobPage> {
  return api.request(path, jobPageSchema);
}

/** Offset of the next page; undefined once every row is loaded or the server sent an empty page. */
export function nextOffset(last: JobPage, pages: readonly JobPage[]): number | undefined {
  const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
  return last.items.length > 0 && loaded < last.total ? loaded : undefined;
}

export function inboxListQueryOptions(tab: InboxTab) {
  return infiniteQueryOptions({
    queryKey: queryKeys.inboxList(tab),
    queryFn: ({ pageParam }) => fetchJobPage(inboxListPath(tab, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
  });
}

/** Tab counter: one row is enough, the answer's total is the count. */
export function inboxTotalQueryOptions(tab: InboxTab) {
  return queryOptions({
    queryKey: queryKeys.inboxTotal(tab),
    queryFn: async () => (await fetchJobPage(inboxListPath(tab, 0, 1))).total,
  });
}

export function dueApplicationsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.dueApplications,
    queryFn: () => fetchJobPage(dueListPath()),
  });
}

/** The previous rows stay on screen while the answer for a new search loads. */
export function applicationsListQueryOptions(query: ApplicationsQuery) {
  return infiniteQueryOptions({
    queryKey: queryKeys.applicationsList(query.group, query.q),
    queryFn: ({ pageParam }) => fetchJobPage(applicationsListPath(query, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
    placeholderData: keepPreviousData,
  });
}

/** Counter of a group: one row is enough, the answer's total is the count. */
export function applicationsTotalQueryOptions(query: ApplicationsQuery) {
  return queryOptions({
    queryKey: queryKeys.applicationsTotal(query.group, query.q),
    queryFn: async () => (await fetchJobPage(applicationsListPath(query, 0, 1))).total,
    placeholderData: keepPreviousData,
  });
}
