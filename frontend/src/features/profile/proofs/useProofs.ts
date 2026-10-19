"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import {
  deleteProfileDocument,
  downloadProfileDocument,
  uploadProfileDocument,
  viewProfileDocument,
  type ProfileDocument,
} from "@/api/profileDocuments";
import { REFUSAL } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { saveFile } from "@/features/job/documents/saveFile";
import { viewKind } from "@/features/job/documents/uploadRules";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import {
  HTTP_NOT_FOUND,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNPROCESSABLE,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
  refusalText,
  type RefusalTable,
} from "../refusals";

/** The upload mutations, wherever they were started: the picker shows them as busy. */
export const PROOF_UPLOAD_KEY = ["profile-documents", "upload"];
const UPLOAD_SCOPE = { id: "profile-documents" };
// Unused bytes leave memory after a minute, as on the job page.
const FILE_GC_MS = 60_000;
const PDF_TYPE = "application/pdf";

// Task 1's fixed codes, by status and code; the server's words are never shown (ruling R8).
const UPLOAD_REFUSALS: RefusalTable = {
  field: "doc_type",
  refusals: [
    { status: HTTP_PAYLOAD_TOO_LARGE, code: REFUSAL.fileTooLarge, text: "files.serverTooLarge" },
    {
      status: HTTP_UNSUPPORTED_MEDIA_TYPE,
      code: REFUSAL.unsupportedType,
      text: "profile.proofs.serverUnsupportedType",
    },
    {
      status: HTTP_UNPROCESSABLE,
      code: REFUSAL.invalidDocType,
      text: "profile.proofs.invalidDocType",
    },
  ],
};

/** D8: one file after the other; the list refreshes after each (the job page reads the same key). */
export function useUploadProofs() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationKey: PROOF_UPLOAD_KEY,
    scope: UPLOAD_SCOPE,
    mutationFn: uploadProfileDocument,
    onSuccess: (_answer, { file }) =>
      toast.show({ message: t("files.uploaded", { name: file.name }), tone: "success" }),
    onError: (error, { file }) => {
      const reason = refusalText(error, t, UPLOAD_REFUSALS);
      toast.show({
        message: t("profile.proofs.uploadRefused", { name: file.name, reason }),
        tone: "error",
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.profileDocuments }),
  });
}

/**
 * Preflight ruling 19: the row leaves the cache before `onDeleted` runs, so the dialog closes over
 * a list without it; the refetch follows.
 */
function useProofRemoved(onDeleted: () => void): (proof: ProfileDocument) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return (proof) => {
    queryClient.setQueryData<ProfileDocument[]>(queryKeys.profileDocuments, (list) =>
      list?.filter((entry) => entry.id !== proof.id),
    );
    onDeleted();
    toast.show({ message: t("files.deleted", { name: proof.original_filename }) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profileDocuments });
  };
}

/** A 404 means the document is already gone (another tab, a retry): the same end as a success. */
export function useDeleteProof(onDeleted: () => void) {
  const toast = useToast();
  const { t } = useI18n();
  const removed = useProofRemoved(onDeleted);
  return useMutation({
    mutationFn: (proof: ProfileDocument) => deleteProfileDocument(proof.id),
    onSuccess: (_answer, proof) => removed(proof),
    onError: (error, proof) => {
      if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return removed(proof);
      toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}

export function useDownloadProof(proof: ProfileDocument) {
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: () => downloadProfileDocument(proof.id),
    onSuccess: (file) => saveFile(file, proof.original_filename),
    onError: (error) => toast.show({ message: describeError(error, t), tone: "error" }),
  });
}

/**
 * The bytes for the viewer, typed with the stored mime type (phase 2 D1: sniffing browsers refuse
 * octet-stream PDFs). Nothing is fetched for a file without a viewer (preflight ruling 16).
 */
export function useProofFile(proof: ProfileDocument) {
  return useQuery({
    queryKey: queryKeys.profileDocumentFile(proof.id, proof.created_at ?? ""),
    queryFn: async () => {
      const file = await viewProfileDocument(proof.id);
      return new Blob([file.blob], { type: proof.mime_type || PDF_TYPE });
    },
    enabled: viewKind(proof.mime_type) !== null,
    staleTime: Infinity,
    gcTime: FILE_GC_MS,
  });
}
