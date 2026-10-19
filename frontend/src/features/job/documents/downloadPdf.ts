import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import {
  downloadDocumentPdf,
  downloadJobDocument,
  generatedDocument,
  type DocumentKind,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import type { Translate } from "@/i18n/translate";
import { saveFile } from "./saveFile";

const PDF_EXTENSION = ".pdf";

/** 422 pdf_render_failed: the bounded server render gave up (in practice an oversized document). */
const PDF_DOWNLOAD_ERRORS: ErrorMessageOverrides = { VALIDATION_ERROR: "docs.pdfFailed" };
// 503 pdf_render_busy: every render slot of the server is in use. The client drops the body of a
// 5xx answer, so the status is the signal; the PDF route sends no other 503.
const HTTP_SERVICE_UNAVAILABLE = 503;

/** The sentence for a failed PDF download; never server text. */
export function describePdfError(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.status === HTTP_SERVICE_UNAVAILABLE)
    return t("docs.pdfBusy");
  return describeError(error, t, PDF_DOWNLOAD_ERRORS);
}

export interface PdfTarget {
  job: JobDetail;
  kind: DocumentKind;
  documents: readonly JobDocument[];
  /** The document's name, e.g. "Lebenslauf"; the file name when the server sends none. */
  label: string;
}

/** The PDF a job generated before Task 12 stored; used only while the document has no HTML. */
function storedPdf({ job, kind, documents }: PdfTarget): JobDocument | undefined {
  return documentPresence(job)[kind] ? undefined : generatedDocument(documents, kind);
}

export function hasPdf(target: PdfTarget): boolean {
  return documentPresence(target.job)[target.kind] || storedPdf(target) !== undefined;
}

/**
 * Ruling (Task 12): CV and letter are HTML; the server renders the PDF from the current HTML on
 * every download. An older job without HTML keeps its stored PDF. Resolves false when there is none.
 */
export async function savePdf(target: PdfTarget): Promise<boolean> {
  const { job, kind, label } = target;
  if (documentPresence(job)[kind]) {
    saveFile(await downloadDocumentPdf(job.id, kind), `${label}${PDF_EXTENSION}`);
    return true;
  }
  const stored = storedPdf(target);
  if (!stored) return false;
  saveFile(await downloadJobDocument(job.id, stored.id), stored.original_filename);
  return true;
}
