// No API client import here: e2e fixtures key their mocks on these paths and run outside the app.
export const INBOX_TABS = ["new", "below", "dismissed"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const INBOX_PAGE_SIZE = 50;
// The server caps a page at 100; an occasional user has far fewer active applications.
export const DUE_PAGE_SIZE = 100;
// GENERATING counts: a regeneration for an application that is out keeps its due date.
export const DUE_APPLICATION_STATUSES: readonly string[] = [
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "GENERATING",
];
export const CLOSED_APPLICATION_STATUSES: readonly string[] = ["ACCEPTED", "REJECTED"];

// Fixed key order: e2e fixtures key their mocks on the exact query string.
const TAB_FILTERS: Readonly<Record<InboxTab, Readonly<Record<string, string>>>> = {
  new: { statuses: "OPEN", is_archived: "false", sort_by: "score" },
  below: { is_archived: "true", archive_reason: "THRESHOLD", sort_by: "date" },
  dismissed: { is_archived: "true", archive_reason: "USER", sort_by: "date" },
};

function listPath(filters: Readonly<Record<string, string>>, offset: number, limit: number) {
  const params = new URLSearchParams({ ...filters, limit: String(limit), offset: String(offset) });
  return `/jobs?${params}`;
}

export function inboxListPath(tab: InboxTab, offset: number, limit = INBOX_PAGE_SIZE): string {
  return listPath(TAB_FILTERS[tab], offset, limit);
}

export function dueListPath(): string {
  const filters = {
    statuses: DUE_APPLICATION_STATUSES.join(","),
    is_archived: "false",
    sort_by: "date",
  };
  return listPath(filters, 0, DUE_PAGE_SIZE);
}

// The server caps a page at 100; grouping by phase needs the rows, and few users have more.
export const APPLICATIONS_PAGE_SIZE = 100;
export const APPLICATION_GROUPS = ["active", "closed"] as const;
export type ApplicationGroup = (typeof APPLICATION_GROUPS)[number];

/** FAILED and GENERATING belong to a phase too; the client groups them (phaseOf). */
export const ACTIVE_APPLICATION_STATUSES: readonly string[] = [
  "DRAFTED",
  "FAILED",
  "GENERATING",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
];
const GROUP_STATUSES: Readonly<Record<ApplicationGroup, readonly string[]>> = {
  active: ACTIVE_APPLICATION_STATUSES,
  closed: CLOSED_APPLICATION_STATUSES,
};

export interface ApplicationsQuery {
  group: ApplicationGroup;
  /** Already trimmed (domain/applications.ts searchFromParam); empty means no search. */
  q: string;
}

export function applicationsListPath(
  query: ApplicationsQuery,
  offset: number,
  limit = APPLICATIONS_PAGE_SIZE,
): string {
  const filters: Record<string, string> = {
    statuses: GROUP_STATUSES[query.group].join(","),
    is_archived: "false",
    sort_by: "date",
  };
  if (query.q) filters.q = query.q;
  return listPath(filters, offset, limit);
}
