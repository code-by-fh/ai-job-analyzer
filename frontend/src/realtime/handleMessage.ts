import { applyEvent, type RealtimeDeps } from "./applyEvent";
import { parseRealtimeMessage } from "./events";
import { acceptEvent } from "./filter";
import { isJobInCache } from "./knownJobs";

/** Parses, filters and applies one raw frame; anything invalid or foreign is dropped. */
export function handleRealtimeMessage(raw: string, userId: number, deps: RealtimeDeps): void {
  const event = parseRealtimeMessage(raw);
  if (!event) return;
  const context = { userId, isKnownJob: (jobId: string) => isJobInCache(deps.queryClient, jobId) };
  if (acceptEvent(event, context)) applyEvent(event, deps);
}
