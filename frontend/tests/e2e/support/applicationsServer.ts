// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { JobListItemBody, JobPageBody } from "../../../src/api/jobList";
import {
  APPLICATION_GROUPS,
  applicationsListPath,
  dueListPath,
  INBOX_TABS,
  inboxListPath,
} from "../../../src/api/jobListPaths";
import type { JobCountsBody, JobDetailBody, JobHistoryBody } from "../../../src/api/jobs";
import { historyFor, jobBody, NOW_ISO } from "./jobFixtures";
import { live, type MockRoutes } from "./mockApi";

// The same rules as server/core/job_status.py and the list endpoint of server/routers/jobs.py.
const USER_SETTABLE = new Set([
  "OPEN",
  "DRAFTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
]);
// A running generation and a dedup placeholder cannot be left by hand.
const SYSTEM_OWNED = new Set(["GENERATING", "SEEN"]);
const HIDDEN_FROM_LISTS = "SEEN";
const MAX_PAGE_SIZE = 100;
const LIST_PARAMS = [
  "statuses",
  "is_archived",
  "archive_reason",
  "sort_by",
  "q",
  "limit",
  "offset",
];
const NOW_UTC = new Date(NOW_ISO).toISOString();
const PATCHABLE = ["next_follow_up_at", "interview_at", "checklist"] as const;

const byId = (a: JobListItemBody, b: JobListItemBody) => a.id.localeCompare(b.id);
const createdAt = (row: JobListItemBody) => row.created_at ?? "";
const score = (row: JobListItemBody) => row.match_score ?? Number.NEGATIVE_INFINITY;

function bySort(sort: string | null): (a: JobListItemBody, b: JobListItemBody) => number {
  // No sort_by means "date": JobListQuery.sort_by defaults to it (server/routers/jobs.py).
  if (sort === "date" || sort === null) {
    return (a, b) => createdAt(b).localeCompare(createdAt(a)) || byId(a, b);
  }
  return (a, b) => score(b) - score(a) || byId(a, b);
}

function rejectUnknownFields(sent: object): void {
  for (const key of Object.keys(sent)) {
    if (!(PATCHABLE as readonly string[]).includes(key)) {
      throw new Error(`fake server: unknown patch field ${key}`);
    }
  }
}

/** What the server keeps: the job rows, their history and the time of the last user status change. */
export class FakeServer {
  private readonly rows = new Map<string, JobListItemBody>();
  private readonly histories = new Map<string, JobHistoryBody[]>();
  /** Status changes the real server would have answered with 400 or 409. */
  readonly refused: string[] = [];

  constructor(rows: readonly JobListItemBody[]) {
    for (const row of rows) this.rows.set(row.id, row);
  }

  get(id: string): JobListItemBody {
    return this.rows.get(id)!;
  }

  /** The row as a rejected or accepted application, a date change or an edit from elsewhere left it. */
  update(id: string, patch: Partial<JobListItemBody>): void {
    this.rows.set(id, { ...this.get(id), ...patch });
  }

  /** GET /jobs for the query string of `path`: filter, sort and page like the endpoint does. */
  list(path: string): JobPageBody {
    const params = new URL(path, "http://server").searchParams;
    const unknown = [...params.keys()].filter((key) => !LIST_PARAMS.includes(key));
    if (unknown.length > 0) throw new Error(`fake server: unknown list parameter ${unknown}`);
    const found = [...this.rows.values()]
      .filter((row) => this.matches(row, params))
      .sort(bySort(params.get("sort_by")));
    const limit = Math.min(Number(params.get("limit") ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Number(params.get("offset") ?? 0);
    return { items: found.slice(offset, offset + limit), total: found.length };
  }

  private matches(row: JobListItemBody, params: URLSearchParams): boolean {
    const statuses = (params.get("statuses") ?? "").split(",").filter(Boolean);
    const reason = params.get("archive_reason");
    return (
      row.status !== HIDDEN_FROM_LISTS &&
      Boolean(row.is_archived) === (params.get("is_archived") === "true") &&
      (statuses.length === 0 || statuses.includes(row.status)) &&
      (!reason || row.archive_reason === reason) &&
      matchesSearch(row, params.get("q"))
    );
  }

  /** GET /jobs/counts: per status, archived jobs only in ARCHIVE. */
  counts(): JobCountsBody {
    const status_counts: Record<string, number> = { ARCHIVE: 0 };
    for (const row of this.rows.values()) {
      if (row.is_archived) status_counts.ARCHIVE = (status_counts.ARCHIVE ?? 0) + 1;
      else if (row.status !== HIDDEN_FROM_LISTS) {
        status_counts[row.status] = (status_counts[row.status] ?? 0) + 1;
      }
    }
    return { status_counts };
  }

  /** POST /jobs/{id}/status: the transition table, a history entry and the new "since" date. */
  changeStatus(id: string, to: string, note?: string): JobDetailBody {
    const row = this.get(id);
    if (!isAllowed(row.status, to)) {
      this.refused.push(`${id}: ${row.status} -> ${to}`);
      return this.detail(id);
    }
    const history = this.history(id);
    history.push({
      id: history.length + 1,
      from_status: row.status,
      to_status: to,
      changed_at: NOW_UTC,
      note: note ?? null,
    });
    this.update(id, { status: to, status_changed_at: NOW_UTC, is_archived: false });
    return this.detail(id);
  }

  /** PATCH /jobs/{id}: an explicit null clears a date, an omitted field keeps its value. */
  patch(id: string, sent: Partial<JobListItemBody>): void {
    rejectUnknownFields(sent);
    const changes = Object.fromEntries(
      PATCHABLE.filter((key) => key in sent).map((key) => [key, sent[key]]),
    );
    this.update(id, changes);
  }

  history(id: string): JobHistoryBody[] {
    const known = this.histories.get(id) ?? [...historyFor(this.get(id).status)];
    this.histories.set(id, known);
    return known;
  }

  /** GET /jobs/{id} for a row: the detail the job page reads. */
  detail(id: string): JobDetailBody {
    const row = this.get(id);
    return jobBody({
      id,
      title: row.title,
      company: row.company,
      status: row.status,
      pre_generation_status: row.pre_generation_status ?? null,
      checklist: row.checklist ?? null,
      created_at: row.created_at,
      next_follow_up_at: row.next_follow_up_at ?? null,
      interview_at: row.interview_at ?? null,
      cv_html_present: row.cv_html_present ?? false,
      cover_letter_html_present: row.cover_letter_html_present ?? false,
    });
  }
}

/** The title or company contains the trimmed text, case-insensitive and literal (no wildcards). */
function matchesSearch(row: JobListItemBody, raw: string | null): boolean {
  const needle = (raw ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [row.title, row.company].some((text) => (text ?? "").toLowerCase().includes(needle));
}

function isAllowed(current: string, target: string): boolean {
  if (!USER_SETTABLE.has(target) || SYSTEM_OWNED.has(current)) return false;
  return target !== current;
}

/** Every list query the screens send, answered from the server's rows; q is the typed search text. */
export function listRoutesOf(server: FakeServer, searches: readonly string[] = []): MockRoutes {
  const paths = [
    dueListPath(),
    ...INBOX_TABS.flatMap((tab) => [inboxListPath(tab, 0), inboxListPath(tab, 0, 1)]),
    ...["", ...searches].flatMap((q) =>
      APPLICATION_GROUPS.flatMap((group) => [
        applicationsListPath({ group, q }, 0),
        applicationsListPath({ group, q }, 0, 1),
      ]),
    ),
  ];
  return {
    ...Object.fromEntries(paths.map((path) => [`GET ${path}`, live(() => server.list(path))])),
    "GET /jobs/counts": live(() => server.counts()),
  };
}

/** The job page of one row: read, status change, date patch and history, all against the server. */
export function jobRoutesOf(server: FakeServer, id: string): MockRoutes {
  const path = `/jobs/${id}`;
  return {
    [`GET ${path}`]: live(() => server.detail(id)),
    [`GET ${path}/history`]: live(() => server.history(id)),
    [`POST ${path}/status`]: live((sent) => {
      const { to, note } = sent as { to: string; note?: string };
      return server.changeStatus(id, to, note);
    }),
    [`PATCH ${path}`]: live((sent) => {
      server.patch(id, sent as Partial<JobListItemBody>);
      return { status: "updated" };
    }),
  };
}
