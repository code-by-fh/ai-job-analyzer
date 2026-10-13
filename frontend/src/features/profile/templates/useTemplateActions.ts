"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import type { Profile } from "@/api/profile";
import { REFUSAL } from "@/api/profilePaths";
import { queryKeys } from "@/api/queryKeys";
import { deleteTemplate, selectDefaultTemplate, type DocumentTemplate } from "@/api/templates";
import { DOC_TYPE_OF, SELECTION_FIELD, type TemplateKind } from "@/domain/templates";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { focusNextFrame, isFocusLost } from "@/ui/focus";
import { useToast } from "@/ui/ToastProvider";
import { HTTP_CONFLICT, HTTP_NOT_FOUND, HTTP_UNPROCESSABLE } from "../refusals";
import { previewButtonId } from "./labels";

export interface Selection {
  kind: TemplateKind;
  ref: string;
  name: string;
}

export interface Deletion {
  id: number;
  name: string;
}

/**
 * Task 3's refusals by status and code (ruling R8): 409 `template_processing` while the AI fills
 * it (a second tab may still show the button), 422 for an id the user may not use (deleted
 * elsewhere). The server's words ("cv_template: template not found") are never shown.
 */
function selectRefusal(error: unknown, t: Translate): string {
  if (!(error instanceof ApiError)) return describeError(error, t);
  if (error.status === HTTP_CONFLICT && error.message === REFUSAL.templateProcessing)
    return t("profile.templates.stillFilling");
  if (error.status === HTTP_UNPROCESSABLE) return t("profile.templates.notUsable");
  return describeError(error, t);
}

/**
 * Focus was lost with the gone button (body, or a detached element) or is still in the card: it is
 * ours to move.
 */
function focusIsLost(card: Element | null): boolean {
  return isFocusLost() || Boolean(card?.contains(document.activeElement));
}

/**
 * Preflight ruling 20: one frame later, after React removed the button that had focus. Ruling
 * R18 (e): only when focus fell to body or stayed in the card; a user who moved on keeps it.
 */
function focusPreviewOf({ kind, ref }: Selection): void {
  focusNextFrame(() => {
    const preview = document.getElementById(previewButtonId(kind, ref));
    return focusIsLost(preview?.closest("li") ?? null) ? preview : null;
  });
}

/** The stored selection shows at once; the refetch confirms it. */
function useSelected(): (selection: Selection) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return (selection) => {
    queryClient.setQueryData<Profile>(queryKeys.profile, (profile) =>
      profile ? { ...profile, [SELECTION_FIELD[selection.kind]]: selection.ref } : profile,
    );
    focusPreviewOf(selection);
    toast.show({
      message: t("profile.templates.selected", { name: selection.name }),
      tone: "success",
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
  };
}

export function useSelectDefault() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const selected = useSelected();
  return useMutation({
    mutationFn: ({ kind, ref }: Selection) =>
      selectDefaultTemplate({ docType: DOC_TYPE_OF[kind], ref }),
    onSuccess: (_answer, selection) => selected(selection),
    onError: (error) => {
      toast.show({ message: selectRefusal(error, t), tone: "error" });
      // The gallery was stale (filling or gone): show what the server has now.
      void queryClient.invalidateQueries({ queryKey: queryKeys.templateList });
    },
  });
}

/**
 * Preflight ruling 19: the card leaves the cache before `onDeleted` runs, so the dialog closes over
 * a gallery without it. The server may have reset the default (Task 3), so the profile refreshes too.
 */
function useTemplateRemoved(onDeleted: () => void): (deletion: Deletion) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return ({ id, name }) => {
    queryClient.setQueryData<DocumentTemplate[]>(queryKeys.templateList, (list) =>
      list?.filter((template) => template.id !== id),
    );
    onDeleted();
    toast.show({ message: t("profile.templates.deleted", { name }), tone: "success" });
    void queryClient.invalidateQueries({ queryKey: queryKeys.templateList });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
  };
}

/** A 404 means the template is already gone (another tab, a retry): the same end as a success. */
export function useDeleteTemplate(onDeleted: () => void) {
  const toast = useToast();
  const { t } = useI18n();
  const removed = useTemplateRemoved(onDeleted);
  return useMutation({
    mutationFn: ({ id }: Deletion) => deleteTemplate(id),
    onSuccess: (_answer, deletion) => removed(deletion),
    onError: (error, deletion) => {
      if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) return removed(deletion);
      toast.show({ message: describeError(error, t), tone: "error" });
    },
  });
}
