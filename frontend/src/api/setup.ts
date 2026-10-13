import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import { queryKeys } from "./queryKeys";

// Booleans only: non-admins may not read the AI settings themselves.
const setupStatusSchema = z.object({
  has_source: z.boolean(),
  ai_configured: z.boolean(),
  profile_complete: z.boolean(),
  has_jobs: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export type SetupStatusBody = z.input<typeof setupStatusSchema>;

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return api.request("/setup-status", setupStatusSchema);
}

export function setupStatusQueryOptions() {
  // Advisory only: a failing request must not hold the home screen in a skeleton, so no retries.
  return queryOptions({
    queryKey: queryKeys.setupStatus,
    queryFn: fetchSetupStatus,
    retry: false,
  });
}
