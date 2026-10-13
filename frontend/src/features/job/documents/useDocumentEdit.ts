"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { describeError } from "@/api/describeError";
import { renderDocument, saveDocumentHtml, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { useToast } from "@/ui/ToastProvider";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { MAX_HTML_LENGTH, serializeDocument } from "./editDocument";

interface EditSave {
  kind: DocumentKind;
  html: string;
}

async function saveAndRender(jobId: string, edit: EditSave): Promise<void> {
  await saveDocumentHtml(jobId, edit.kind, edit.html);
  await renderDocument(jobId, edit.kind);
}

function useSaveEdit(job: JobDetail, onSaved: () => void) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (edit: EditSave) => saveAndRender(job.id, edit),
    onSuccess: (_result, edit) => {
      markTaskStarted(queryClient, pendingTaskId.render(job.id, edit.kind), Date.now());
      void queryClient.invalidateQueries({
        queryKey: queryKeys.jobDocumentHtml(job.id, edit.kind),
      });
      toast.show({ tone: "success", message: t("edit.saved") });
      onSaved();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

/** Reports the unsaved state to the app-wide guard (links, tabs, unload) and clears it on unmount. */
function useUnsavedGuard(): { markDirty: () => void; clear: () => void } {
  const { setDirty } = useUnsavedChanges();
  useEffect(() => () => setDirty(false), [setDirty]);
  return { markDirty: () => setDirty(true), clear: () => setDirty(false) };
}

interface SaveSource {
  job: JobDetail;
  editing: DocumentKind | null;
  frameRef: RefObject<HTMLIFrameElement | null>;
}

function useSaveEditedHtml({ job, editing, frameRef }: SaveSource, onSaved: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const saveEdit = useSaveEdit(job, onSaved);
  const save = () => {
    const doc = frameRef.current?.contentDocument;
    if (!editing || !doc) return;
    const html = serializeDocument(doc);
    if (html.length > MAX_HTML_LENGTH) toast.show({ tone: "error", message: t("edit.tooLarge") });
    else saveEdit.mutate({ kind: editing, html });
  };
  return { save, saving: saveEdit.isPending };
}

/** Which document is edited; leaving it asks first when it has unsaved changes. */
function useEditSession() {
  const { requestLeave } = useUnsavedChanges();
  const [editing, setEditing] = useState<DocumentKind | null>(null);
  const guard = useUnsavedGuard();
  const stop = () => {
    setEditing(null);
    guard.clear();
  };
  /** Resolves false when the user chose to stay. */
  const leaveEdit = async (next: DocumentKind | null): Promise<boolean> => {
    if (editing === next && next !== null) return true;
    const leave = await requestLeave();
    if (leave) {
      guard.clear();
      setEditing(next);
    }
    return leave;
  };
  return { editing, stop, leaveEdit, markDirty: guard.markDirty };
}

/** Edit -> PUT html -> POST render -> wait for job_update {rendered_kind} (inventory A.2). */
export function useDocumentEdit(job: JobDetail) {
  const session = useEditSession();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const saved = useSaveEditedHtml({ job, editing: session.editing, frameRef }, session.stop);
  return {
    editing: session.editing,
    start: (kind: DocumentKind) => session.leaveEdit(kind),
    stop: () => session.leaveEdit(null),
    markDirty: session.markDirty,
    frameRef,
    ...saved,
  };
}
