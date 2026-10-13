import type { JobListItem } from "@/api/jobList";
import {
  ACTIVE_APPLICATION_STATUSES,
  CLOSED_APPLICATION_STATUSES,
  DUE_APPLICATION_STATUSES,
} from "@/api/jobListPaths";
import { jsonResponse, type RecordedCall } from "./fakeFetch";
import { HTTP_OK } from "./inboxRoutes";
import type { RouteTable } from "./stubRoutes";

/** Mutable server-side rows; a test changes them to simulate what happened on the server. */
export interface ApplicationsServer {
  active: JobListItem[];
  closed: JobListItem[];
}

function rowsFor(server: ApplicationsServer, statuses: string): JobListItem[] {
  if (statuses === CLOSED_APPLICATION_STATUSES.join(",")) return server.closed;
  if (statuses === ACTIVE_APPLICATION_STATUSES.join(",")) return server.active;
  if (statuses === DUE_APPLICATION_STATUSES.join(",")) {
    return server.active.filter((item) => DUE_APPLICATION_STATUSES.includes(item.status));
  }
  throw new Error(`applicationsJobs: no list for statuses=${statuses}`);
}

function matches(item: JobListItem, q: string | null): boolean {
  const needle = q?.toLowerCase();
  return !needle || [item.title, item.company].some((text) => text?.toLowerCase().includes(needle));
}

/** GET /jobs by group (statuses), search and paging, the way the server answers it. */
export function applicationsJobs(server: ApplicationsServer) {
  return (call: RecordedCall) => {
    const params = new URL(call.url).searchParams;
    const rows = rowsFor(server, params.get("statuses") ?? "").filter((item) =>
      matches(item, params.get("q")),
    );
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? rows.length);
    return jsonResponse(HTTP_OK, { items: rows.slice(offset, offset + limit), total: rows.length });
  };
}

function statusCounts(server: ApplicationsServer): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of [...server.active, ...server.closed]) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

/** Everything Bewerbungen loads; the counts come from the same rows (fixtures stay consistent). */
export function applicationsStubs(server: ApplicationsServer, extra: RouteTable = {}): RouteTable {
  return {
    "GET /jobs": applicationsJobs(server),
    "GET /jobs/counts": { status_counts: statusCounts(server) },
    ...extra,
  };
}
