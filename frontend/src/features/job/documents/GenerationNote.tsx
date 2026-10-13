"use client";

import { LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { isGenerating } from "@/domain/jobStatus";
import { pendingTaskId } from "@/domain/pendingTasks";
import { formatTime } from "@/i18n/formatTime";
import type { Language } from "@/i18n/languages";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { usePendingTasks } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
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

function startedText(startedAt: number | undefined, language: Language, t: Translate): string {
  return startedAt ? `, ${t("docs.startedAt", { time: formatTime(startedAt, language) })}` : "";
}

function RunningNote({ job }: { job: JobDetail }) {
  const { t, language } = useI18n();
  const generation = useGeneration(job);
  const startedAt = usePendingTasks()[pendingTaskId.generation(job.id)]?.startedAt;
  return (
    <div className="gen-note" role="status">
      <Icon icon={LoaderCircle} className="spin" />
      <span>{t("docs.running") + startedText(startedAt, language, t)}</span>
      <Button
        size="sm"
        variant="ghost"
        icon={X}
        busy={generation.cancelling}
        onClick={generation.cancel}
      >
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
