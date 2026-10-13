"use client";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { ApiError } from "@/api/errors";
import { importCv, type Profile } from "@/api/profile";
import { MAX_FILE_BYTES, REFUSAL } from "@/api/profilePaths";
import { hasCvContent } from "@/domain/profile";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { useProfileAnnounce } from "../announcer";
import {
  HTTP_BAD_GATEWAY,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNPROCESSABLE,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
  refusalText,
  type RefusalTable,
} from "../refusals";
import { PROFILE_SAVE_SCOPE, storeSaved } from "../useProfileSave";

/** The import's mutations, wherever they were started: busy state and outcome outlive a section. */
export const CV_IMPORT_KEY = ["cv-import"];
const PDF_TYPE = "application/pdf";
const PDF_EXTENSION = ".pdf";
/** The upload field the server names in its 422 (`loc: ["body", "file"]`). */
const FILE_FIELD = "file";
const PROBLEM_TEXT = {
  unsupportedType: "files.unsupportedType",
  tooLarge: "files.tooLarge",
} as const satisfies Record<string, MessageKey>;

// Task 2's fixed codes, by status and code; the server's words are never shown (ruling R8).
const IMPORT_REFUSALS: RefusalTable = {
  field: FILE_FIELD,
  refusals: [
    { status: HTTP_PAYLOAD_TOO_LARGE, code: REFUSAL.fileTooLarge, text: "files.serverTooLarge" },
    {
      status: HTTP_UNSUPPORTED_MEDIA_TYPE,
      code: REFUSAL.unsupportedType,
      text: "profile.cv.import.notPdf",
    },
    { status: HTTP_UNPROCESSABLE, code: REFUSAL.cvNoText, text: "profile.cv.import.noText" },
  ],
};

/** The fixed sentence for a refused import; anything unknown gets the generic one. */
function importErrorText(error: unknown, t: Translate): string {
  // errors.ts keeps no body of a 5xx; 502 is the status only `cv_parse_failed` answers with.
  if (error instanceof ApiError && error.status === HTTP_BAD_GATEWAY)
    return t("profile.cv.import.failed");
  return refusalText(error, t, IMPORT_REFUSALS);
}

/**
 * Checked before the request; the server checks the bytes again (Task 2). By choice, a PDF with
 * neither a .pdf name nor a declared PDF type is refused here rather than sent.
 */
export function cvFileProblem(file: File): keyof typeof PROBLEM_TEXT | null {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith(PDF_EXTENSION);
  if (!isPdf) return "unsupportedType";
  return file.size > MAX_FILE_BYTES ? "tooLarge" : null;
}

/**
 * D6: the server parses and stores the CV and answers with what it stored; that answer goes into
 * the profile cache at once (Ziel and Lebenslauf read it), then both queries refetch. Only the
 * start is announced on the page region; the end is a toast (its own live region).
 */
export function useCvImport() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = useProfileAnnounce();
  const { t } = useI18n();
  return useMutation({
    mutationKey: CV_IMPORT_KEY,
    scope: PROFILE_SAVE_SCOPE,
    mutationFn: importCv,
    onMutate: () => announce(t("profile.cv.import.reading")),
    onSuccess: (imported) => {
      storeSaved(queryClient, imported);
      toast.show({ message: t("profile.cv.import.done"), tone: "success" });
    },
    onError: (error) => toast.show({ message: importErrorText(error, t), tone: "error" }),
  });
}

/**
 * True while any import runs, also one started before this section was mounted again (only the
 * open section is mounted, so a fresh useMutation observer would not know it).
 */
export function useCvImportRunning(): boolean {
  return useIsMutating({ mutationKey: CV_IMPORT_KEY }) > 0;
}

/** The file input's change: a refused file is a toast and is never sent. */
function useCheckedPick(onAccepted: (file: File) => void) {
  const { t } = useI18n();
  const toast = useToast();
  return (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be picked again after a refusal
    if (!file) return;
    const problem = cvFileProblem(file);
    if (!problem) return onAccepted(file);
    toast.show({ message: t(PROBLEM_TEXT[problem], { name: file.name }), tone: "error" });
  };
}

interface CvPickerOptions {
  profile: Profile;
  start: (file: File) => void;
}

/**
 * A file over existing data waits for the confirmation (ruling R1); any other starts at once
 * (preflight ruling 14).
 */
export function useCvPicker({ profile, start }: CvPickerOptions) {
  const [pending, setPending] = useState<File | null>(null);
  const pick = useCheckedPick((file) => (hasCvContent(profile) ? setPending(file) : start(file)));
  const confirm = () => {
    if (pending) start(pending);
    setPending(null);
  };
  return { pick, pending, confirm, cancel: () => setPending(null) };
}
