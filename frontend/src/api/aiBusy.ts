import { ApiError } from "./errors";

// 503 ai_busy (server/routers/sync_ai_runs.py): every slot for an AI run inside a request (CV import,
// deep dive) is in use. The client drops the body of a 5xx answer, so the status is the signal;
// these routes send no other 503.
const HTTP_SERVICE_UNAVAILABLE = 503;

export function isAiBusy(error: unknown): boolean {
  return error instanceof ApiError && error.status === HTTP_SERVICE_UNAVAILABLE;
}
