import type { MessageKey } from "@/i18n/de";
import type { Language } from "@/i18n/languages";

// Mirror of server/routers/jobs.py ALLOWED_MIME_TYPES and MAX_FILE_SIZE (413/415 otherwise).
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
export const UPLOAD_ACCEPT = ACCEPTED_UPLOAD_TYPES.join(",");

export type UploadProblem = "tooLarge" | "unsupportedType";

/** What an endpoint accepts; each upload checks against its own server's mirror. */
export interface UploadRules {
  accepted: readonly string[];
  maxBytes: number;
}
const JOB_UPLOAD_RULES: UploadRules = {
  accepted: ACCEPTED_UPLOAD_TYPES,
  maxBytes: MAX_UPLOAD_BYTES,
};

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const TEXT_TYPE = "text/plain";
const KNOWN_KINDS = new Set([
  "UPLOADED",
  "GENERATED_CV",
  "GENERATED_LETTER",
  "ATTACHED_CERT",
  "ATTACHED_REFERENCE",
]);

/** Checked before the request, so the user gets a sentence about the file instead of a failed upload. */
export function uploadProblem(
  file: { size: number; type: string },
  rules: UploadRules = JOB_UPLOAD_RULES,
): UploadProblem | null {
  if (!rules.accepted.includes(file.type)) return "unsupportedType";
  return file.size > rules.maxBytes ? "tooLarge" : null;
}

export function formatFileSize(bytes: number, language: Language): string {
  if (bytes < KILOBYTE) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${Math.round(bytes / KILOBYTE)} KB`;
  const megabytes = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
    bytes / MEGABYTE,
  );
  return `${megabytes} MB`;
}

export function previewKind(mimeType?: string | null): "pdf" | "image" | null {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType?.startsWith("image/") ? "image" : null;
}

export type ViewKind = "pdf" | "image" | "text";

/** What the viewer can show inline; Word files have no viewer and are download-only. */
export function viewKind(mimeType?: string | null): ViewKind | null {
  if (mimeType === TEXT_TYPE) return "text";
  return previewKind(mimeType);
}

export function fileKindLabel(kind: string): MessageKey {
  return KNOWN_KINDS.has(kind) ? (`files.kind.${kind}` as MessageKey) : "files.kind.other";
}
