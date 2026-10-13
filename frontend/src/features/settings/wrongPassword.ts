import { ApiError } from "@/api/errors";
import { HTTP_BAD_REQUEST } from "@/features/profile/refusals";

/** The server's password check failed: 400 by status (never by code, which unmapped statuses share); `detail` narrows it where the route sends a fixed code. */
export function isWrongPassword(error: unknown, detail?: string): boolean {
  return (
    error instanceof ApiError &&
    error.status === HTTP_BAD_REQUEST &&
    (detail === undefined || error.message === detail)
  );
}
