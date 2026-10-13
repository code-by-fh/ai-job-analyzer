"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { describeError } from "@/api/describeError";
import { jobHistoryQueryOptions, type JobDetail, type JobHistoryEntry } from "@/api/jobs";
import { parseApiDate } from "@/domain/calendar";
import { phaseOfStatus } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { useJobFormat } from "../format/useJobFormat";
import { statusLabel } from "../labels";

// One dot class per phase; job.css colours them with the stage tokens (--st-*).
const PHASE_DOT = {
  OPEN: "tl-dot--open",
  DRAFTED: "tl-dot--drafted",
  APPLIED: "tl-dot--applied",
  INTERVIEW: "tl-dot--interview",
  OFFER: "tl-dot--offer",
  CLOSED: "tl-dot--closed",
} as const;

/** Rows without a usable date sort last (rank -Infinity); equal ranks fall back to the newer id. */
const dateRank = (entry: JobHistoryEntry): number => {
  const time = entry.changed_at ? parseApiDate(entry.changed_at).getTime() : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

const newestFirst = (a: JobHistoryEntry, b: JobHistoryEntry): number => {
  const [rankA, rankB] = [dateRank(a), dateRank(b)];
  if (rankA === rankB) return b.id - a.id;
  return rankB > rankA ? 1 : -1;
};

/** Every status change with its note (B1 history), and the day the job was found. */
export function Timeline({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const query = useQuery(jobHistoryQueryOptions(job.id));
  if (query.isError)
    return <HistoryError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p className="hint">{t("history.loading")}</p>;
  return <TimelineList job={job} history={[...query.data].sort(newestFirst)} />;
}

function TimelineList({ job, history }: { job: JobDetail; history: JobHistoryEntry[] }) {
  const { t } = useI18n();
  return (
    <>
      <ol role="list" className="timeline" aria-label={t("history.title")}>
        {history.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} />
        ))}
        {job.created_at ? <FoundEntry createdAt={job.created_at} /> : null}
      </ol>
      {history.length === 0 ? <p className="hint">{t("history.empty")}</p> : null}
    </>
  );
}

function HistoryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Notice tone="error">
      {describeError(error, t)}{" "}
      <Button size="sm" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </Notice>
  );
}

function TimelineEntry({ entry }: { entry: JobHistoryEntry }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const dot = PHASE_DOT[phaseOfStatus(entry.to_status)];
  return (
    <li>
      <span className="tl-date">{entry.changed_at ? format.dateTime(entry.changed_at) : ""}</span>
      <span className={`tl-dot ${dot}`}>
        <i />
      </span>
      <div>
        <div className="tl-title">
          {t("history.phase", { phase: t(statusLabel(entry.to_status)) })}
        </div>
        {entry.note ? <div className="tl-sub">{entry.note}</div> : null}
      </div>
    </li>
  );
}

function FoundEntry({ createdAt }: { createdAt: string }) {
  const { t } = useI18n();
  const format = useJobFormat();
  return (
    <li>
      <span className="tl-date">{format.dateTime(createdAt)}</span>
      <span className="tl-dot">
        <i />
      </span>
      <div>{t("history.found")}</div>
    </li>
  );
}
