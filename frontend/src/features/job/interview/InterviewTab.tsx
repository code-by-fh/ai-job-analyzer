"use client";

import { MessageSquare, RefreshCw } from "lucide-react";
import type { JobDetail } from "@/api/jobs";
import { parseInterviewPrep } from "@/domain/interviewPrep";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { TaskProgress } from "../TaskState";
import { InterviewPrepView } from "./InterviewPrepView";
import { usePrep } from "./usePrep";

/** Prototype tabInterview; ends with interview_prep_ready (no polling, no cancel: the server cannot cancel). */
export function InterviewTab({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const parsed = parseInterviewPrep(job.interview_prep_material);
  if (parsed.kind === "none") return <NoPrep job={job} />;
  return (
    <>
      {parsed.kind === "prep" ? (
        <InterviewPrepView job={job} prep={parsed.prep} />
      ) : (
        <Notice tone="warn">{t("prep.unreadable")}</Notice>
      )}
      <RegenerateStamp job={job} />
    </>
  );
}

function NoPrep({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const prep = usePrep(job, false);
  return (
    <div className="dim-panel">
      <h3>{t("prep.emptyTitle")}</h3>
      <p>{t("prep.emptyText", { company: job.company ?? t("prep.companyFallback") })}</p>
      <TaskProgress task={prep} runningText={t("prep.running")} />
      {prep.phase === "idle" ? (
        <div className="row">
          <Button icon={MessageSquare} busy={prep.pending} onClick={prep.run}>
            {t("prep.create")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RegenerateStamp({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const prep = usePrep(job, true);
  return (
    <div className="ai-stamp">
      <span>{t("prep.stamp")}</span>
      <TaskProgress task={prep} runningText={t("prep.running")} />
      {prep.phase === "idle" ? (
        <Button size="sm" variant="ghost" icon={RefreshCw} busy={prep.pending} onClick={prep.run}>
          {t("prep.recreate")}
        </Button>
      ) : null}
    </div>
  );
}
