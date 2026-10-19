"use client";

import { FileSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import type { JobDetail } from "@/api/jobs";
import { canTakeFromPosting, foundNothingNew } from "@/domain/postingDetails";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { useToast } from "@/ui/ToastProvider";
import { TaskProgress } from "../TaskState";
import { usePostingDetails } from "./usePostingDetails";

/**
 * The block vanishes once fields are filled, so the end of a run this view saw says so with a toast.
 * It waits for the reloaded job: the task ends before the job carries the extracted marks.
 */
function useConfirmFilled(job: JobDetail, busy: boolean): void {
  const { t } = useI18n();
  const toast = useToast();
  const ran = useRef(false);
  const filled = Boolean(job.posting_extracted?.length);
  useEffect(() => {
    if (busy) ran.current = true;
    else if (ran.current && filled) {
      ran.current = false;
      toast.show({ tone: "success", message: t("dates.postingFilled") });
    }
  }, [busy, filled, toast, t]);
}

/**
 * "Aus der Anzeige übernehmen": reads contacts, recruiter and salary out of the stored posting for
 * a job analysed before that was part of the analysis. It fills empty fields only.
 */
export function PostingDetailsAction({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const task = usePostingDetails(job);
  const busy = task.phase !== "idle";
  useConfirmFilled(job, busy);
  if (!busy && !canTakeFromPosting(job)) return null;
  return (
    <div className="posting-action">
      <TaskProgress task={task} runningText={t("dates.postingRunning")} />
      {foundNothingNew(job) && !busy ? <Notice>{t("dates.postingNothingNew")}</Notice> : null}
      {task.phase === "idle" ? (
        <Button size="sm" icon={FileSearch} busy={task.pending} onClick={task.run}>
          {t("dates.takeFromPosting")}
        </Button>
      ) : null}
    </div>
  );
}
