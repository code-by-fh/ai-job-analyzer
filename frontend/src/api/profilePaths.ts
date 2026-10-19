/**
 * Paths, limits and codes of the profile endpoints. Client-free (no API client import), so the
 * e2e fixtures and FakeServer can import them at runtime.
 */
export const SETTINGS_PATH = "/settings";
export const UPLOAD_CV_PATH = "/settings/upload-cv";
export const TEMPLATE_SELECTION_PATH = "/settings/template";
export const PROFILE_DOCUMENTS_PATH = "/profile/documents";
export const FILE_TEMPLATES_PATH = "/profile/templates";
export const DOCUMENT_TEMPLATES_PATH = "/document-templates";
export const TEMPLATE_PREVIEW_PATH = "/document-templates/preview";

export const profileDocumentPath = (id: number) => `${PROFILE_DOCUMENTS_PATH}/${id}`;
export const profileDocumentFilePath = (id: number, mode: "view" | "download") =>
  `${profileDocumentPath(id)}/${mode}`;
export const documentTemplatePath = (id: number) => `${DOCUMENT_TEMPLATES_PATH}/${id}`;

export const TEMPLATE_DOC_TYPES = ["CV", "COVER_LETTER"] as const;
export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

export function templatePreviewPath(docType: TemplateDocType, ref: string): string {
  const query = new URLSearchParams({ doc_type: docType, template: ref });
  return `${TEMPLATE_PREVIEW_PATH}?${query.toString()}`;
}

// Mirrors the MAX_* constants of server/database/core.py; the server answers 422 on the field
// otherwise. `skill` has no server twin: one chip of the comma separated skills string.
export const PROFILE_LIMITS = {
  role: 200,
  skills: 2000,
  skill: 100,
  minSalary: 50,
  location: 200,
  preferences: 5000,
  spokenLanguages: 20,
  spokenLanguage: 50,
  cvEntries: 30,
  entryTitle: 200,
  entryDuration: 100,
  entryText: 5000,
  education: 5000,
} as const;

// Mirrors core/uploads.py MAX_UPLOAD_BYTES (profile documents and the CV import; 413 otherwise).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Mirrors routers/profile_documents.py ALLOWED_MIME_TYPES (415 otherwise).
export const PROOF_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const PROOF_DOC_TYPES = ["CERTIFICATE", "REFERENCE"] as const;
export type ProofDocType = (typeof PROOF_DOC_TYPES)[number];

/** Fixed refusal codes the server sends as `detail` (or as `msg` of a 422 field item); never shown. */
export const REFUSAL = {
  fileTooLarge: "file_too_large",
  unsupportedType: "unsupported_type",
  invalidDocType: "invalid_doc_type",
  cvNoText: "cv_no_text",
  cvParseFailed: "cv_parse_failed",
  cvImportRunning: "cv_import_running",
  templateProcessing: "template_processing",
  templateRejected: "template_rejected",
  // routers/templates.py TEMPLATE_NOT_FOUND: the preview's fixed 404 body.
  templateNotFound: "Template not found",
} as const;

// Mirrors server/database/core.py MAX_TEMPLATE_HTML_LENGTH and MAX_TEMPLATE_NAME_LENGTH (the
// server trims the name first and requires at least one character).
export const MAX_TEMPLATE_HTML_LENGTH = 1_000_000;
export const MAX_TEMPLATE_NAME_LENGTH = 100;
/** The bundled template the server falls back to (services/document_renderer.py). */
export const DEFAULT_FILE_TEMPLATE = "classic";
// Mirrors services/template_access.py and workers/tasks/fill_cv_template.py; null means ready.
export const TEMPLATE_STATUS = {
  processing: "processing",
  rejected: "annotation_rejected",
  failed: "annotation_failed",
} as const;
/** What GET /settings answers for a stored secret; the profile never parses or sends it. */
export const SECRET_MASK = "__masked__";
