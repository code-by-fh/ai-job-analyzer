// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { JobListItemBody } from "../../../src/api/jobList";
import {
  applicationsListPath,
  DUE_APPLICATION_STATUSES,
  dueListPath,
} from "../../../src/api/jobListPaths";
import type { JobCountsBody } from "../../../src/api/jobs";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { listItem, page, UNKEYED_LIST } from "./inboxFixtures";
import { READY } from "./jobFixtures";
import type { MockResponse, MockRoutes, MutableRoutes } from "./mockApi";

// Fixed now (NOW_ISO) is 2026-10-08 10:00 Berlin. job-1 is the job page fixture (jobBody) as a row;
// the inbox fixtures use job-1 for a new match, so a spec that shows both lists leaves one out.
export const ACTIVE_ITEMS: JobListItemBody[] = [
  listItem("job-1", {
    title: "Senior Backend Engineer (Kotlin)",
    company: "ACME GmbH",
    status: "DRAFTED",
    status_changed_at: "2026-10-06T08:00:00+00:00",
  }),
  listItem("job-5", {
    title: "Platform Engineer",
    company: "Otto",
    status: "DRAFTED",
    ...READY,
    status_changed_at: "2026-10-03T08:00:00+00:00",
  }),
  listItem("job-6", {
    title: "Java Developer",
    company: "Hermes",
    status: "GENERATING",
    pre_generation_status: "DRAFTED",
    status_changed_at: "2026-10-07T08:00:00+00:00",
  }),
  listItem("job-7", {
    title: "Kotlin Developer",
    company: "N26",
    status: "APPLIED",
    ...READY,
    next_follow_up_at: "2026-10-06T07:00:00+00:00",
    status_changed_at: "2026-09-26T08:00:00+00:00",
  }),
  // A regeneration for an application that is out: still Beworben (Review Focus 1).
  listItem("job-8", {
    title: "Backend Engineer",
    company: "Personio",
    status: "GENERATING",
    pre_generation_status: "APPLIED",
    cv_html_present: true,
    next_follow_up_at: "2026-10-20T07:00:00+00:00",
    status_changed_at: "2026-10-02T08:00:00+00:00",
  }),
  listItem("job-9", {
    title: "Staff Engineer",
    company: "Zalando",
    status: "INTERVIEW",
    ...READY,
    interview_at: "2026-10-09T08:00:00+00:00",
    status_changed_at: "2026-10-05T08:00:00+00:00",
  }),
];

export const CLOSED_ITEMS: JobListItemBody[] = [
  listItem("job-10", {
    title: "Lead Developer",
    company: "Check24",
    status: "REJECTED",
    ...READY,
    status_changed_at: "2026-10-01T08:00:00+00:00",
  }),
  listItem("job-11", {
    title: "Engineering Manager",
    company: "Tchibo",
    status: "ACCEPTED",
    ...READY,
    status_changed_at: "2026-09-20T08:00:00+00:00",
  }),
];

// The inbox fixtures show three new matches; the nav badge of Eingang stays the same everywhere.
const OPEN_MATCHES = 3;

export function applicationsCounts(
  active: readonly JobListItemBody[],
  closed: readonly JobListItemBody[],
): JobCountsBody {
  const counts: Record<string, number> = { OPEN: OPEN_MATCHES };
  for (const item of [...active, ...closed]) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return { status_counts: counts };
}

export interface ApplicationRows {
  active: readonly JobListItemBody[];
  closed: readonly JobListItemBody[];
}

/** The two lists and the closed counter for one search (q = "" is the unfiltered view). */
export function listRoutesFor(q: string, rows: ApplicationRows): [string, MockResponse][] {
  return [
    [`GET ${applicationsListPath({ group: "active", q }, 0)}`, { body: page(rows.active) }],
    [`GET ${applicationsListPath({ group: "closed", q }, 0)}`, { body: page(rows.closed) }],
    [
      `GET ${applicationsListPath({ group: "closed", q }, 0, 1)}`,
      { body: page(rows.closed.slice(0, 1), rows.closed.length) },
    ],
  ];
}

export interface ApplicationsData extends Partial<ApplicationRows> {
  /** Answers per search text, exactly as typed into the field. */
  searches?: Readonly<Record<string, ApplicationRows>>;
}

/** Everything Bewerbungen loads; counts and the due list come from the same rows. */
export function applicationsRoutes(
  data: ApplicationsData = {},
  extra: MockRoutes = {},
): MutableRoutes {
  const rows = { active: data.active ?? ACTIVE_ITEMS, closed: data.closed ?? CLOSED_ITEMS };
  const searches = Object.entries(data.searches ?? {}).flatMap(([q, found]) =>
    listRoutesFor(q, found),
  );
  const due = rows.active.filter((item) => DUE_APPLICATION_STATUSES.includes(item.status));
  return {
    ...AUTHENTICATED_ROUTES,
    "GET /jobs/counts": { body: applicationsCounts(rows.active, rows.closed) },
    // Every list query has an exact key; an unkeyed one must fail visibly.
    "GET /jobs": UNKEYED_LIST,
    [`GET ${dueListPath()}`]: { body: page(due) },
    ...Object.fromEntries(listRoutesFor("", rows)),
    ...Object.fromEntries(searches),
    ...extra,
  };
}
