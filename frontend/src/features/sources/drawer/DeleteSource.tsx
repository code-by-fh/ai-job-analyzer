"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { deletePlatform, type Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { nextSourceId } from "@/domain/sources";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";

interface DeleteSourceProps {
  platform: Platform;
  /** A crawl of this source runs: the server would refuse the delete (409). */
  running: boolean;
  /** After the delete; receives the source whose row follows in the list, for the focus. */
  onDeleted: (nextId: number | null) => void;
}

/**
 * D9: confirm, delete (the found jobs stay), then close the drawer; blocked while the source
 * crawls. Edits in another section would go with the source, so the leave question comes first.
 */
export function DeleteSource({ platform, running, onDeleted }: DeleteSourceProps) {
  const confirm = useConfirmDelete(platform, onDeleted);
  return (
    <section className="drawer-section drawer-danger">
      <DeleteButton running={running} onClick={confirm.ask} />
      <ConfirmDelete platform={platform} {...confirm} />
    </section>
  );
}

/** Inactive (still focusable) while the source crawls, with the reason as its description. */
function DeleteButton({ running, onClick }: { running: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const reasonId = useId();
  return (
    <>
      <Button
        variant="danger"
        icon={Trash2}
        inactive={running}
        aria-describedby={running ? reasonId : undefined}
        onClick={onClick}
      >
        {t("sources.delete.open")}
      </Button>
      {running ? <BlockedReason id={reasonId} /> : null}
    </>
  );
}

function BlockedReason({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <p id={id} className="hint">
      {t("sources.delete.blocked")}
    </p>
  );
}

/** Opens the question only once nothing unsaved is left (or the user chose to discard it). */
function useConfirmDelete(platform: Platform, onDeleted: (nextId: number | null) => void) {
  const { requestLeave } = useUnsavedChanges();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const remove = useDeleteSource(platform, { onDeleted, onRefused: close });
  return {
    open,
    ask: () => void requestLeave().then((leave) => leave && setOpen(true)),
    onCancel: close,
    onConfirm: () => remove.mutate(),
    busy: remove.isPending,
  };
}

interface ConfirmDeleteProps {
  platform: Platform;
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDelete({ platform, open, busy, onCancel, onConfirm }: ConfirmDeleteProps) {
  const { t } = useI18n();
  const title = t("sources.delete.title", { name: platform.name });
  return (
    <Dialog open={open} onClose={onCancel} label={title}>
      <div className="panel-in">
        <PanelHeader title={title} onClose={onCancel} />
        <p className="prose">{t("sources.delete.text")}</p>
        <div className="row panel-actions">
          <Button variant="danger" busy={busy} onClick={onConfirm}>
            {t("files.deleteConfirm")}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface DeleteOutcome {
  onDeleted: (nextId: number | null) => void;
  onRefused: () => void;
}

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : null);

/** The source is gone: close the drawer (focus to the next row), forget it, say so. */
function useForgetDeleted(platform: Platform, onDeleted: (nextId: number | null) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return (message: string) => {
    const list = queryClient.getQueryData<Platform[]>(queryKeys.platforms) ?? [];
    onDeleted(nextSourceId(list, platform.id));
    forgetSource(queryClient, platform.id);
    toast.show({ message, tone: "success" });
  };
}

function useDeleteSource(platform: Platform, outcome: DeleteOutcome) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const forgetDeleted = useForgetDeleted(platform, outcome.onDeleted);
  return useMutation({
    mutationFn: () => deletePlatform(platform.id),
    onSuccess: (kept) => forgetDeleted(deletedMessage(platform, kept, t)),
    onError: (error) => {
      // 404: already deleted (another tab, or a retry after a lost answer); the end state is the same.
      if (codeOf(error) === "NOT_FOUND") return forgetDeleted(deletedMessage(platform, 0, t));
      outcome.onRefused();
      // 409: a crawl the page did not know about (scheduler, other tab, G23); showing it blocks the button.
      if (codeOf(error) === "CONFLICT")
        void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      toast.show({ message: refusalMessage(error, platform, t), tone: "error" });
    },
  });
}

/**
 * The jobs lost their source (inbox, applications, counts, the company directory's job counts);
 * the onboarding's "has a source" may change.
 */
function forgetSource(queryClient: QueryClient, id: number): void {
  queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
    list?.filter((platform) => platform.id !== id),
  );
  // The history is gone on the server; a refetch would only answer 404.
  queryClient.removeQueries({ queryKey: queryKeys.platformRuns(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.platforms, exact: true });
  const jobReaders = [
    queryKeys.jobsRoot,
    queryKeys.jobCounts,
    queryKeys.companiesRoot,
    queryKeys.setupStatus,
  ];
  for (const queryKey of jobReaders) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

function deletedMessage(platform: Platform, kept: number, t: Translate): string {
  const name = platform.name;
  if (kept === 0) return t("sources.delete.done", { name });
  if (kept === 1) return t("sources.delete.doneKeptOne", { name });
  return t("sources.delete.doneKept", { name, count: kept });
}

function refusalMessage(error: unknown, platform: Platform, t: Translate): string {
  if (codeOf(error) !== "CONFLICT") return describeError(error, t);
  return t("sources.delete.running", { name: platform.name });
}
