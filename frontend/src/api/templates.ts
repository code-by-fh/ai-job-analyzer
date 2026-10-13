import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import {
  DOCUMENT_TEMPLATES_PATH,
  documentTemplatePath,
  FILE_TEMPLATES_PATH,
  TEMPLATE_SELECTION_PATH,
  templatePreviewPath,
  type TemplateDocType,
} from "./profilePaths";
import { queryKeys } from "./queryKeys";

const documentTemplateSchema = z.object({
  id: z.number().int(),
  doc_type: z.string(),
  name: z.string(),
  is_admin: z.boolean().nullish(),
  user_id: z.number().int().nullish(),
  // processing, annotation_rejected, annotation_failed or null (ready); see TEMPLATE_STATUS.
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
const fileTemplatesSchema = z.object({
  cv: z.array(z.string()),
  cover_letter: z.array(z.string()),
});
const previewSchema = z.object({ html: z.string() });
const anyBodySchema = z.unknown();

export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export type DocumentTemplateBody = z.input<typeof documentTemplateSchema>;
export type FileTemplates = z.infer<typeof fileTemplatesSchema>;
export type FileTemplatesBody = z.input<typeof fileTemplatesSchema>;
export type TemplatePreviewBody = z.input<typeof previewSchema>;

const SELECTION_KEY: Readonly<Record<TemplateDocType, string>> = {
  CV: "cv_template",
  COVER_LETTER: "cover_letter_template",
};

export function documentTemplatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.templateList,
    queryFn: () => api.request(DOCUMENT_TEMPLATES_PATH, z.array(documentTemplateSchema)),
  });
}

export function fileTemplatesQueryOptions() {
  // The bundled templates only change with a deployment.
  return queryOptions({
    queryKey: queryKeys.fileTemplates,
    queryFn: () => api.request(FILE_TEMPLATES_PATH, fileTemplatesSchema),
    staleTime: Infinity,
  });
}

/**
 * The template rendered with the user's own profile; 422 `template_rejected`, 404 unknown.
 * Ruling R7: the HTML is untrusted (stored rows can carry script and remote images). Render it
 * only as `<iframe sandbox="" srcDoc={prepareForEditing(html)}>` (no allow-scripts, no
 * allow-same-origin, editor CSP); never dangerouslySetInnerHTML and never a top-level `src`.
 */
export function templatePreviewQueryOptions(docType: TemplateDocType, ref: string) {
  return queryOptions({
    queryKey: queryKeys.templatePreview(docType, ref),
    queryFn: async () => (await api.request(templatePreviewPath(docType, ref), previewSchema)).html,
  });
}

/** 409 `template_processing` while the AI fill runs; 422 for an id the user may not use. */
export async function selectDefaultTemplate(input: { docType: TemplateDocType; ref: string }) {
  const json = { [SELECTION_KEY[input.docType]]: input.ref };
  await api.request(TEMPLATE_SELECTION_PATH, anyBodySchema, { method: "PATCH", json });
}

/** A CV template answers with status "processing" (AI fill); 422 on `name` or `html` otherwise. */
export async function uploadTemplate(input: {
  docType: TemplateDocType;
  name: string;
  html: string;
}): Promise<DocumentTemplate> {
  const json = { doc_type: input.docType, name: input.name, html: input.html };
  return api.request(DOCUMENT_TEMPLATES_PATH, documentTemplateSchema, { method: "POST", json });
}

/** The server resets a default that named this template to the bundled one. */
export async function deleteTemplate(id: number): Promise<void> {
  await api.request(documentTemplatePath(id), anyBodySchema, { method: "DELETE" });
}
