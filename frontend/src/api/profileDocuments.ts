import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { fetchFile, uploadForm, type DownloadedFile } from "./files";
import { api } from "./instance";
import {
  PROFILE_DOCUMENTS_PATH,
  profileDocumentFilePath,
  profileDocumentPath,
  type ProofDocType,
} from "./profilePaths";
import { queryKeys } from "./queryKeys";

const profileDocumentSchema = z.object({
  id: z.number().int(),
  doc_type: z.string(),
  label: z.string().nullish(),
  original_filename: z.string(),
  file_size: z.number().int().nullish(),
  mime_type: z.string().nullish(),
  created_at: z.string().nullish(),
  // Drive files answer 400 on view/download; an answer without the flag predates it.
  downloadable: z
    .boolean()
    .nullish()
    .transform((value) => value ?? true),
});
const anyBodySchema = z.unknown();
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
export type ProfileDocumentBody = z.input<typeof profileDocumentSchema>;

/** Certificates and references that "generate-package" can copy into a job. */
export async function fetchProfileDocuments(): Promise<ProfileDocument[]> {
  return api.request(PROFILE_DOCUMENTS_PATH, z.array(profileDocumentSchema));
}

export function profileDocumentsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.profileDocuments, queryFn: fetchProfileDocuments });
}

/** Refusals: 413 `file_too_large`, 415 `unsupported_type`, 422 `invalid_doc_type` on doc_type. */
export async function uploadProfileDocument(input: { file: File; docType: ProofDocType }) {
  const form = new FormData();
  form.append("file", input.file);
  form.append("doc_type", input.docType);
  await uploadForm(PROFILE_DOCUMENTS_PATH, form);
}

export async function deleteProfileDocument(id: number): Promise<void> {
  await api.request(profileDocumentPath(id), anyBodySchema, { method: "DELETE" });
}

export function viewProfileDocument(id: number): Promise<DownloadedFile> {
  return fetchFile(profileDocumentFilePath(id, "view"));
}

export function downloadProfileDocument(id: number): Promise<DownloadedFile> {
  return fetchFile(profileDocumentFilePath(id, "download"));
}
