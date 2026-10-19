"use client";

import { LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { firstStart, startStamp } from "@/domain/elapsed";
import { isGenerating } from "@/domain/jobStatus";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { usePendingStart } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Elapsed } from "@/ui/Elapsed";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { generationProblem, useGeneration } from "./useGeneration";

/** Honest progress text (no intermediate steps exist); cancel is offered because the server honours it. */
export function GenerationNote({ job }: { job: JobDetail }) {
  if (isGenerating(job)) return <RunningNote job={job} />;
  if (job.status === "FAILED" || job.generation_error)
    return <FailedNote error={job.generation_error} />;
  return null;
}

/**
 * How long the generation runs. The worker's start stamp wins; while the job still waits in the
 * queue only this tab's own start is known (after a reload: nothing until the run ends).
 */
export function GenerationElapsed({ job, className }: { job: JobDetail; className?: string }) {
  const pendingStart = usePendingStart(pendingTaskId.generation(job.id));
  const startedAt = firstStart(startStamp(job.generation_started_at), pendingStart);
  return <Elapsed className={className} startedAt={startedAt} />;
}

/** The elapsed time sits outside the status region, so its ticks are not announced. */
function RunningNote({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const { cancel, cancelling } = generation;
  return (
    <div className="gen-note">
      <p className="task-line" role="status">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{t("docs.running")}</span>
      </p>
      <GenerationElapsed job={job} />
      <Button size="sm" variant="ghost" icon={X} busy={cancelling} onClick={cancel}>
        {t("docs.cancel")}
      </Button>
    </div>
  );
}

/** The server's generation_error is never shown; only the profile-incomplete case is recognised. */
function FailedNote({ error }: { error?: string | null }) {
  const { t } = useI18n();
  const profile = generationProblem(error) === "profileIncomplete";
  return (
    <Notice tone="error">
      {t(profile ? "next.profileIncomplete" : "docs.failed")}{" "}
      {profile ? (
        <Link className="link" href="/profile">
          {t("next.toProfile")}
        </Link>
      ) : null}
    </Notice>
  );
}
