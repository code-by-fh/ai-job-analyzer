import type { CurrentUserBody } from "@/api/auth";
import type { JobListItem } from "@/api/jobList";
import type { PlatformBody } from "@/api/platforms";
import type { SetupStatus } from "@/api/setup";
import { SCORE_BUCKETS } from "@/api/threshold";
import { jsonResponse, type RecordedCall } from "./fakeFetch";
import type { RouteTable } from "./stubRoutes";

export const HTTP_OK = 200;
export const SETUP_DONE: SetupStatus = {
  has_source: true,
  ai_configured: true,
  profile_complete: true,
  has_jobs: true,
};

/** Mutable server-side lists; a test changes them to simulate what a POST did on the server. */
export interface InboxServer {
  new: JobListItem[];
  below: JobListItem[];
  dismissed: JobListItem[];
  due: JobListItem[];
}

function listOf(params: URLSearchParams): keyof InboxServer {
  if (params.get("statuses")?.includes("APPLIED")) return "due";
  const reason = params.get("archive_reason");
  if (reason === "THRESHOLD") return "below";
  return reason === "USER" ? "dismissed" : "new";
}

/** GET /jobs answered from the lists by the query's filter, honouring limit and offset. */
export function inboxJobs(server: InboxServer) {
  return (call: RecordedCall) => {
    const params = new URL(call.url).searchParams;
    const rows = server[listOf(params)];
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? rows.length);
    return jsonResponse(HTTP_OK, { items: rows.slice(offset, offset + limit), total: rows.length });
  };
}

// Only the onboarding and the AI warning load the user; a test of those overrides it.
const ADMIN: CurrentUserBody = { id: 1, username: "admin", is_admin: true };

const PLATFORMS: PlatformBody[] = [
  { id: 1, name: "StepStone", url: "https://www.stepstone.de/jobs/kotlin" },
];

/** Everything the inbox loads; `extra` adds or overrides routes. */
export function inboxStubs(server: InboxServer, extra: RouteTable = {}): RouteTable {
  return {
    "GET /jobs": inboxJobs(server),
    "GET /platforms": PLATFORMS,
    "GET /settings": { language: "de", match_threshold: 60 },
    "GET /setup-status": SETUP_DONE,
    "GET /me": ADMIN,
    "GET /matching-preference/distribution": {
      counts: Array.from({ length: SCORE_BUCKETS }, () => 0),
    },
    ...extra,
  };
}
