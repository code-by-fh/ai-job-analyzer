"use client";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type RefObject } from "react";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { MAX_TEMPLATE_HTML_LENGTH, MAX_TEMPLATE_NAME_LENGTH } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { uploadTemplate, type DocumentTemplate } from "@/api/templates";
import { DOC_TYPE_OF, type TemplateKind } from "@/domain/templates";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";

const HTML_TYPE = "text/html";
const HTML_FILE = /\.html?$/i;
/** The template fields the server names in its 422 (`loc: ["body", field]`). */
const HTML_FIELD = "html";
const NAME_FIELD = "name";

export interface TemplateFile {
  name: string;
  html: string;
}

export type TemplateFileProblem = "unsupportedType" | "tooLarge";

/**
 * The template's name: the file name without its extension, trimmed, within the server's limit.
 * Cut by code points, as the server counts, so no half of a surrogate pair is left at the end.
 */
export function templateName(fileName: string, fallback: string): string {
  const name = fileName.trim().replace(HTML_FILE, "").trim();
  return Array.from(name).slice(0, MAX_TEMPLATE_NAME_LENGTH).join("") || fallback;
}

/** D10: HTML only; the length is the server's character limit, so it is checked on the text. */
export async function readTemplateFile(
  file: File,
  fallbackName: string,
): Promise<TemplateFile | { problem: TemplateFileProblem }> {
  if (file.type !== HTML_TYPE && !HTML_FILE.test(file.name)) return { problem: "unsupportedType" };
  const html = await file.text();
  if (html.length > MAX_TEMPLATE_HTML_LENGTH) return { problem: "tooLarge" };
  return { name: templateName(file.name, fallbackName), html };
}

const uploadKey = (kind: TemplateKind) => ["template-upload", kind];

/** The created template shows at once with its server status; template_ready refreshes it (D10). */
function useUploaded(kind: TemplateKind): (created: DocumentTemplate) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return (created) => {
    queryClient.setQueryData<DocumentTemplate[]>(queryKeys.templateList, (list) =>
      list ? [...list, created] : list,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
    const key = kind === "cv" ? "profile.templates.uploadedCv" : "profile.templates.uploaded";
    toast.show({ message: t(key, { name: created.name }), tone: "success" });
  };
}

/**
 * A 422 carries free server text (the save-time Jinja check on `html`), so each refused field maps
 * to one fixed sentence (ruling R9); anything else gets the generic one.
 */
function uploadErrorText(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.fields[HTML_FIELD] !== undefined)
    return t("profile.templates.rejectedOnUpload");
  if (error instanceof ApiError && error.fields[NAME_FIELD] !== undefined)
    return t("profile.templates.badName");
  return describeError(error, t);
}

export function useTemplateUpload(kind: TemplateKind) {
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationKey: uploadKey(kind),
    mutationFn: (input: TemplateFile) => uploadTemplate({ docType: DOC_TYPE_OF[kind], ...input }),
    onSuccess: useUploaded(kind),
    onError: (error) => toast.show({ message: uploadErrorText(error, t), tone: "error" }),
  });
}

export interface TemplatePicker {
  pick: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  problem: TemplateFileProblem | null;
  busy: boolean;
}

/** Runs `task` unless one still runs; the flag is set synchronously, before the first await. */
async function exclusive(running: RefObject<boolean>, task: () => Promise<void>): Promise<void> {
  if (running.current) return;
  running.current = true;
  try {
    await task();
  } finally {
    running.current = false;
  }
}

/** Reads the file and uploads it; a refused file sets its problem, an unreadable one is a toast. */
function useReadAndUpload(
  kind: TemplateKind,
  setProblem: (problem: TemplateFileProblem | null) => void,
): (file: File) => Promise<void> {
  const { t } = useI18n();
  const toast = useToast();
  const upload = useTemplateUpload(kind);
  return async (file) => {
    // The read rejects when the file changed or went away after the pick.
    const read = await readTemplateFile(file, t("profile.templates.unnamed")).catch(() => null);
    if (!read) {
      toast.show({ message: t("error.unexpected"), tone: "error" });
      return;
    }
    setProblem("problem" in read ? read.problem : null);
    if (!("problem" in read)) upload.mutate(read);
  };
}

/**
 * Preflight ruling 14: the file check before the request, as the job page's picker does. A pick
 * while a file of this kind is read or uploaded is ignored, so one file never goes out twice: the
 * upload's `busy` arrives only after the read, hence the synchronous `reading` flag for the read.
 */
export function useTemplatePicker(kind: TemplateKind): TemplatePicker {
  const busy = useIsMutating({ mutationKey: uploadKey(kind) }) > 0;
  const [problem, setProblem] = useState<TemplateFileProblem | null>(null);
  const readAndUpload = useReadAndUpload(kind, setProblem);
  const reading = useRef(false);
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    await exclusive(reading, () => readAndUpload(file));
  };
  return { pick, problem, busy };
}
