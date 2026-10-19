"use client";

import { useQuery } from "@tanstack/react-query";
import {
  documentHtmlQueryOptions,
  generatedDocument,
  jobDocumentsQueryOptions,
  type DocumentKind,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";

export type PreviewSource =
  /** The stored HTML; undefined while it loads. */
  | { type: "html"; html: string | undefined }
  /** A job generated before Task 12 that has only its stored PDF (decision D1: blob URL). */
  | { type: "pdf"; url: string | null; document: JobDocument | undefined }
  | { type: "failed"; error: unknown };

/** What the preview sheet shows: the document's HTML, else the PDF an older generation stored. */
export function usePreviewSource(job: JobDetail, kind: DocumentKind): PreviewSource {
  const isHtml = documentPresence(job)[kind];
  const html = useQuery({ ...documentHtmlQueryOptions(job.id, kind), enabled: isHtml });
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const document = isHtml ? undefined : generatedDocument(documents, kind);
  const file = useDocumentFile(job.id, document);
  const url = useObjectUrl(file.data);
  const error = isHtml ? html.error : file.error;
  if (error) return { type: "failed", error };
  return isHtml ? { type: "html", html: html.data } : { type: "pdf", url, document };
}
