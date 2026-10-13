"use client";

import { Archive, Bookmark, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { DeleteJobDialog } from "./DeleteJobDialog";
import type { Triage } from "./useTriage";

export interface RowActionsProps {
  item: JobListItem;
  tab: InboxTab;
  triage: Triage;
}

type ButtonsProps = Omit<RowActionsProps, "tab">;

/** Decision D12: Neu -> Vormerken/Aussortieren; archive tabs -> Wiederherstellen (+ löschen). */
export function RowActions({ item, tab, triage }: RowActionsProps) {
  if (tab === "new") {
    return (
      <>
        <ShortlistButton item={item} triage={triage} />
        <DismissButton item={item} triage={triage} />
      </>
    );
  }
  return (
    <>
      <RestoreButton item={item} triage={triage} />
      {tab === "dismissed" ? <DeleteButton item={item} triage={triage} /> : null}
    </>
  );
}

/** Row and pane buttons name their job, so a list of buttons stays unambiguous (D12, R16(3)). */
export function useJobTitle(item: JobListItem): string {
  const { t } = useI18n();
  return item.title ?? t("job.untitled");
}

function ShortlistButton({ item, triage }: ButtonsProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      size="sm"
      icon={Bookmark}
      aria-label={t("inbox.shortlistJob", { title })}
      onClick={() => triage.shortlist(item)}
    >
      {t("next.shortlist")}
    </Button>
  );
}

function DismissButton({ item, triage }: ButtonsProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={Archive}
      aria-label={t("inbox.dismissJob", { title })}
      onClick={() => triage.dismiss(item)}
    >
      {t("next.dismiss")}
    </Button>
  );
}

function RestoreButton({ item, triage }: ButtonsProps) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      size="sm"
      icon={RotateCcw}
      busy={triage.busyId === item.id}
      aria-label={t("inbox.restoreJob", { title })}
      onClick={() => triage.restore(item)}
    >
      {t("next.restoreAction")}
    </Button>
  );
}

function DeleteButton({ item, triage }: ButtonsProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <TrashButton item={item} onClick={() => setConfirming(true)} />
      {confirming ? (
        <DeleteJobDialog
          item={item}
          onConfirm={() => triage.remove(item)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

function TrashButton({ item, onClick }: { item: JobListItem; onClick: () => void }) {
  const { t } = useI18n();
  const title = useJobTitle(item);
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={Trash2}
      aria-label={t("inbox.deleteJob", { title })}
      onClick={onClick}
    />
  );
}
