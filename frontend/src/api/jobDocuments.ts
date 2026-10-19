import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { fetchFile, uploadForm, type DownloadedFile } from "./files";
import { api } from "./instance";
import { jobPath } from "./jobs";
import { queryKeys } from "./queryKeys";

/** The two generated documents; the API's stored document kind. */
export const GENERATED_KIND = { cv: "GENERATED_CV", cover_letter: "GENERATED_LETTER" } as const;
export type DocumentKind = keyof typeof GENERATED_KIND;
export const DOCUMENT_KINDS: readonly DocumentKind[] = ["cv", "cover_letter"];

const jobDocumentSchema = z.object({
  id: z.number().int(),
  original_filename: z.string(),
  file_size: z.number().nullish(),
  mime_type: z.string().nullish(),
  kind: z.string(),
  uploaded_at: z.string().nullish(),
});
export type JobDocument = z.infer<typeof jobDocumentSchema>;
export type JobDocumentBody = z.input<typeof jobDocumentSchema>;

export interface PackageRequest {
  cv: boolean;
  letter: boolean;
  includeProfileDocuments: boolean;
}

const anyBodySchema = z.unknown();
const htmlSchema = z.object({ html: z.string() });

const documentsPath = (jobId: string) => `${jobPath(jobId)}/documents`;
const documentPath = (jobId: string, docId: number) => `${documentsPath(jobId)}/${docId}`;
const kindQuery = (kind: DocumentKind) => `?kind=${kind}`;
const htmlPath = (jobId: string, kind: DocumentKind) =>
  `${documentsPath(jobId)}/html${kindQuery(kind)}`;

export async function fetchJobDocuments(jobId: string): Promise<JobDocument[]> {
  return api.request(documentsPath(jobId), z.array(jobDocumentSchema));
}

export async function uploadJobDocument(jobId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await uploadForm(documentsPath(jobId), form);
}

export async function deleteJobDocument(jobId: string, docId: number): Promise<void> {
  await api.request(documentPath(jobId, docId), anyBodySchema, { method: "DELETE" });
}

/** Inline variant; the bytes are the same as the download, only the disposition differs. */
export async function viewJobDocument(jobId: string, docId: number): Promise<DownloadedFile> {
  return fetchFile(`${documentPath(jobId, docId)}/view`);
}

export async function downloadJobDocument(jobId: string, docId: number): Promise<DownloadedFile> {
  return fetchFile(`${documentPath(jobId, docId)}/download`);
}

export async function fetchDocumentHtml(jobId: string, kind: DocumentKind): Promise<string> {
  const body = await api.request(htmlPath(jobId, kind), htmlSchema);
  return body.html;
}

export async function saveDocumentHtml(
  jobId: string,
  kind: DocumentKind,
  html: string,
): Promise<void> {
  await api.request(htmlPath(jobId, kind), anyBodySchema, { method: "PUT", json: { html } });
}

/** The PDF rendered by the server from the current HTML; nothing is stored (Task 12). */
export async function downloadDocumentPdf(
  jobId: string,
  kind: DocumentKind,
): Promise<DownloadedFile> {
  return fetchFile(`${documentsPath(jobId)}/pdf${kindQuery(kind)}`);
}

export async function generatePackage(jobId: string, request: PackageRequest): Promise<void> {
  const json = {
    generate_cv: request.cv,
    generate_letter: request.letter,
    include_profile_documents: request.includeProfileDocuments,
  };
  await api.request(`${jobPath(jobId)}/generate-package`, anyBodySchema, { method: "POST", json });
}

/** Letter only; notes refine the existing draft (empty notes write a fresh letter). */
export async function generateLetter(jobId: string, notes: string): Promise<void> {
  const json = { improvement_notes: notes.trim() === "" ? null : notes.trim() };
  await api.request(`${jobPath(jobId)}/generate`, anyBodySchema, { method: "POST", json });
}

export async function cancelGeneration(jobId: string): Promise<void> {
  await api.request(`${jobPath(jobId)}/cancel-generation`, anyBodySchema, { method: "POST" });
}

export function generatedDocument(
  documents: readonly JobDocument[],
  kind: DocumentKind,
): JobDocument | undefined {
  return documents.find((document) => document.kind === GENERATED_KIND[kind]);
}

/** A re-render replaces the row, so the upload time identifies the stored bytes. */
export function documentVersion(document: JobDocument): string {
  return document.uploaded_at ?? String(document.id);
}

export function jobDocumentsQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: queryKeys.jobDocuments(jobId),
    queryFn: () => fetchJobDocuments(jobId),
  });
}

export function documentHtmlQueryOptions(jobId: string, kind: DocumentKind) {
  return queryOptions({
    queryKey: queryKeys.jobDocumentHtml(jobId, kind),
    queryFn: () => fetchDocumentHtml(jobId, kind),
  });
}
