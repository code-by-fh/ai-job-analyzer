"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { STEP_LABEL } from "@/features/shell/crawl/crawlText";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { taskStart, type ActivityTask } from "@/realtime/activity";
import { isImportStalled, type ImportEntry } from "@/realtime/imports";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { Elapsed } from "@/ui/Elapsed";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";

export interface ImportProgressProps {
  crawlId: string;
  entry: ImportEntry;
  onRetry: () => void;
}

/**
 * The crawl's live step from the activity cache; "stalled" after STALL_AFTER_MS without an end.
 * One persistent status region announces both, and takes the focus from the replaced form. The
 * elapsed time sits beside that region, so its ticks are not announced.
 */
export function ImportProgress({ crawlId, entry, onRetry }: ImportProgressProps) {
  const stalled = isImportStalled(entry, useNow());
  const task = useActivity(true).running.find((running) => running.id === crawlId);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => region.current?.focus(), []);
  return (
    <div className="task-run import-run">
      <div ref={region} role="status" tabIndex={-1}>
        {stalled ? <ImportStalled onRetry={onRetry} /> : <ImportStep task={task} />}
      </div>
      {stalled ? null : <Elapsed startedAt={(task && taskStart(task)) ?? entry.startedAt} />}
    </div>
  );
}

function ImportStep({ task }: { task: ActivityTask | undefined }) {
  const { t } = useI18n();
  const text = task
    ? t(STEP_LABEL[task.step], { done: task.done, total: task.total })
    : t("import.reading");
  return (
    <p className="task-line">
      <Icon icon={LoaderCircle} className="spin" />
      <span>{text}</span>
    </p>
  );
}

function ImportStalled({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Notice tone="warn">
      <p>{t("import.stalled")}</p>
      <Button size="sm" icon={RotateCcw} className="import-again" onClick={onRetry}>
        {t("import.again")}
      </Button>
    </Notice>
  );
}
