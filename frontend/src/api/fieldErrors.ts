import { ApiError } from "./errors";

/**
 * The form fields a 422 rejected (spec 6: field errors on the field). `toField` maps a server field
 * ("salary_benchmark.max") onto a form field or null; the server's message is never passed on, the
 * form shows its own text. Empty for every other error, which the caller toasts as usual.
 */
export function fieldErrorsFrom<F extends string>(
  error: unknown,
  toField: (serverField: string) => F | null,
): F[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR") return [];
  const fields = Object.keys(error.fields).map(toField);
  return [...new Set(fields.filter((field): field is F => field !== null))];
}
