import { z, type ZodType } from "zod";
import type { DownloadedFile } from "./client";
import { api } from "./instance";

export type { DownloadedFile };

// Upload endpoints answer with a small JSON object the UI does not need.
const anyBodySchema = z.unknown();

/** Binary download through the app client, so a 401 refreshes once and errors become ApiError. */
export function fetchFile(path: string): Promise<DownloadedFile> {
  return api.requestBlob(path);
}

/**
 * Multipart upload whose answer the caller reads with `schema`; the browser sets the boundary, so
 * no Content-Type is sent.
 */
export function postForm<T>(path: string, form: FormData, schema: ZodType<T>): Promise<T> {
  return api.request(path, schema, { method: "POST", formData: form });
}

/** Multipart upload whose answer is not needed. */
export async function uploadForm(path: string, form: FormData): Promise<void> {
  await postForm(path, form, anyBodySchema);
}
