// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { JobListItemBody, JobPageBody } from "../../../src/api/jobList";
import {
  dueListPath,
  INBOX_TABS,
  inboxListPath,
  type InboxTab,
} from "../../../src/api/jobListPaths";
import type { JobCountsBody } from "../../../src/api/jobs";
import type { ThresholdDistributionBody } from "../../../src/api/threshold";
import { SCORE_BUCKETS } from "../../../src/domain/threshold";
import { AUTHENTICATED_ROUTES } from "./fixtures";
import { jobBody } from "./jobFixtures";
import type { MockResponse, MockRoutes, MutableRoutes } from "./mockApi";
import { PLATFORMS } from "./platformFixtures";

// The job page's fit text, so a row and its job page tell the same story.
const REASONING = jobBody().reasoning;
const THRESHOLD = 60;

/** A row as GET /jobs returns it (B6: no description, presence flags). */
export function listItem(id: string, overrides: Partial<JobListItemBody> = {}): JobListItemBody {
  return {
    id,
    title: "Senior Backend Engineer",
    company: "ACME GmbH",
    status: "OPEN",
    match_score: 84,
    reasoning: REASONING,
    url: `https://www.stepstone.de/stellenangebote--${id}.html`,
    platform_id: 1,
    created_at: "2026-10-07T07:00:00+00:00",
    ...overrides,
  };
}

const BELOW = { is_archived: true, archive_reason: "THRESHOLD" };
const DISMISSED = { is_archived: true, archive_reason: "USER" };

export const NEW_ITEMS: JobListItemBody[] = [
  listItem("job-1", { title: "Senior Kotlin Engineer", company: "N26", match_score: 86 }),
  listItem("job-2", { title: "Backend Engineer (Java)", company: "Personio", match_score: 72 }),
  listItem("job-3", {
    title: "Softwareentwickler Java",
    company: "HHLA",
    match_score: 64,
    reasoning: null,
  }),
];
export const BELOW_ITEMS: JobListItemBody[] = [
  listItem("job-20", {
    title: "Fullstack-Entwickler PHP",
    company: "Aroundhome",
    match_score: 54,
    ...BELOW,
  }),
  listItem("job-21", {
    title: "SAP ABAP Entwickler",
    company: "Tchibo",
    match_score: 32,
    ...BELOW,
  }),
];
export const DISMISSED_ITEMS: JobListItemBody[] = [
  listItem("job-17", {
    title: "Teamlead Java Backend",
    company: "Check24",
    match_score: 74,
    ...DISMISSED,
  }),
];

// StepStone ran last (08:00 Berlin) and ran fine; Indeed failed the day before.
export const PLATFORMS_WITH_RUNS = PLATFORMS;

const SCORES_FOUND = [32, 54, 64, 72, 86];
export const DISTRIBUTION: ThresholdDistributionBody = {
  counts: Array.from({ length: SCORE_BUCKETS }, (_, score) =>
    SCORES_FOUND.includes(score) ? 1 : 0,
  ),
};

export function page(items: readonly JobListItemBody[], total = items.length): JobPageBody {
  return { items: [...items], total };
}

export interface InboxData {
  new?: readonly JobListItemBody[];
  below?: readonly JobListItemBody[];
  dismissed?: readonly JobListItemBody[];
  due?: readonly JobListItemBody[];
  threshold?: number;
}

function listsOf(data: InboxData): Readonly<Record<InboxTab, readonly JobListItemBody[]>> {
  return {
    new: data.new ?? NEW_ITEMS,
    below: data.below ?? BELOW_ITEMS,
    dismissed: data.dismissed ?? DISMISSED_ITEMS,
  };
}

/** Exact keys for the first page and the counter of every tab (the keys come from src, never typed by hand). */
export function listRoutes(data: InboxData = {}): MockRoutes {
  const lists = listsOf(data);
  const entries = INBOX_TABS.flatMap((tab): [string, MockResponse][] => [
    [`GET ${inboxListPath(tab, 0)}`, { body: page(lists[tab]) }],
    [`GET ${inboxListPath(tab, 0, 1)}`, { body: page(lists[tab].slice(0, 1), lists[tab].length) }],
  ]);
  return {
    ...Object.fromEntries(entries),
    [`GET ${dueListPath()}`]: { body: page(data.due ?? []) },
  };
}

export const UNKEYED_LIST: MockResponse = {
  status: 500,
  body: { detail: "list query without a fixture key" },
};

function jobCounts(open: number): JobCountsBody {
  return { status_counts: { OPEN: open, DRAFTED: 1, APPLIED: 2 } };
}

/** Everything the inbox loads, plus the authenticated shell; `extra` adds or overrides routes. */
export function inboxRoutes(data: InboxData = {}, extra: MockRoutes = {}): MutableRoutes {
  return {
    ...AUTHENTICATED_ROUTES,
    "GET /settings": { body: { language: "de", match_threshold: data.threshold ?? THRESHOLD } },
    "GET /platforms": { body: PLATFORMS_WITH_RUNS },
    "GET /matching-preference/distribution": { body: DISTRIBUTION },
    // The nav badge counts the same "Neu" list the inbox shows.
    "GET /jobs/counts": { body: jobCounts(listsOf(data).new.length) },
    // Every inbox list query has an exact key; an unkeyed one must fail visibly, not show an empty list.
    "GET /jobs": UNKEYED_LIST,
    ...listRoutes(data),
    ...extra,
  };
}
