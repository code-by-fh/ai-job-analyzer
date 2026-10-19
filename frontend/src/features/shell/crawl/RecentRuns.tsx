"use client";

import { TriangleAlert } from "lucide-react";
import { savedJobCount } from "@/domain/crawlStages";
import { SourceIcon } from "@/features/sources/SourceIcon";
import type { MessageKey } from "@/i18n/de";
import { formatTime } from "@/i18n/formatTime";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityOutcome, FinishedTask } from "@/realtime/activity";
import { Icon } from "@/ui/Icon";
import { SourceName } from "./SourceName";
import { useCrawlSource } from "./useCrawlSource";

const OUTCOME_LABEL: Readonly<Record<ActivityOutcome, MessageKey>> = {
  completed: "activity.outcome.completed",
  failed: "activity.outcome.failed",
  cancelled: "activity.outcome.cancelled",
};

interface RecentRunsProps {
  finished: readonly FinishedTask[];
  onNavigate?: () => void;
}

/** The runs that ended in this session, newest first; nothing before the first one ends. */
export function RecentRuns({ finished, onNavigate }: RecentRunsProps) {
  const { t } = useI18n();
  if (finished.length === 0) return null;
  return (
    <div className="recent-runs">
      <p className="recent-head">{t("activity.recent")}</p>
      <ul role="list" className="recent-list">
        {finished.map((run) => (
          <RecentRun key={run.id} run={run} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
}

function RecentRun({ run, onNavigate }: { run: FinishedTask; onNavigate?: () => void }) {
  const { t, language } = useI18n();
  const source = useCrawlSource(run);
  const saved = run.outcome === "completed" && run.progress ? savedJobCount(run.progress) : null;
  return (
    <li className="recent-run">
      <SourceIcon platform={source} />
      <SourceName source={source} onNavigate={onNavigate} />
      <span className="recent-meta">
        <Outcome outcome={run.outcome} />
        <span>{formatTime(run.finishedAt, language)}</span>
        {saved === null ? null : <span>{t("activity.saved", { count: saved })}</span>}
      </span>
    </li>
  );
}

/** A failure is crimson with an icon and words; the other outcomes are plain words. */
function Outcome({ outcome }: { outcome: ActivityOutcome }) {
  const { t } = useI18n();
  if (outcome !== "failed") return <span>{t(OUTCOME_LABEL[outcome])}</span>;
  return (
    <span className="t-danger">
      <Icon icon={TriangleAlert} />
      {t(OUTCOME_LABEL[outcome])}
    </span>
  );
}
