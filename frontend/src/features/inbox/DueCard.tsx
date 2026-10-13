"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { describeError } from "@/api/describeError";
import { dueApplicationsQueryOptions } from "@/api/jobList";
import { dueEntries, type DueEntry } from "@/domain/dueJobs";
import { isWarning } from "@/domain/nextStep";
import { useJobFormat, type JobFormat } from "@/features/job/format/useJobFormat";
import { jobRoute } from "@/features/shell/routes";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { Notice } from "@/ui/Notice";
import { hasDueFailed } from "./dueStatus";

const DUE_TITLE_ID = "due-title";

/** Decision D8: up to 3 applications whose next step is due; hidden while loading and when none. */
export function DueCard() {
  const now = useNow();
  const due = useQuery(dueApplicationsQueryOptions());
  if (hasDueFailed(due)) {
    return (
      <DueError error={due.error} retrying={due.isFetching} onRetry={() => void due.refetch()} />
    );
  }
  const entries = dueEntries(due.data?.items ?? [], new Date(now));
  return entries.length === 0 ? null : <DueList entries={entries} />;
}

function DueList({ entries }: { entries: DueEntry[] }) {
  const { t } = useI18n();
  return (
    <section className="due" aria-labelledby={DUE_TITLE_ID}>
      <h2 className="sec-title-sm" id={DUE_TITLE_ID}>
        {t("due.title")}
      </h2>
      <ul role="list" className="due-list">
        {entries.map((entry) => (
          <DueRow key={entry.item.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function DueRow({ entry }: { entry: DueEntry }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const { item, step } = entry;
  // The same rule as the job page: only a deadline is amber, a past interview day is not (spec 4.4).
  const warning = isWarning(step);
  return (
    <li className={cx("due-row", warning && "is-warning")}>
      <Link className="due-link" href={jobRoute(item.id)}>
        <span className="due-what">{t(step.label)}</span>
        <span className="due-sep" aria-hidden="true">
          ·
        </span>
        <span className="due-job">{[item.company, item.title].filter(Boolean).join(" · ")}</span>
        <span className={cx("due-when", warning && "t-warn")}>{dueText(entry, format, t)}</span>
      </Link>
    </li>
  );
}

/** "Overdue" is a warning word, so it is reserved for the steps that are warnings. */
function dueText({ step }: DueEntry, format: JobFormat, t: Translate): string {
  if (!step.due) return "";
  const iso = step.due.toISOString();
  if (!step.overdue) return format.relativeDays(iso);
  const key = isWarning(step) ? "due.overdueSince" : "due.since";
  return t(key, { date: format.date(iso) });
}

/** M4: the list error is the one alert when the API is down; this one stays visible, not loud. */
function DueError({ error, retrying, onRetry }: DueErrorProps) {
  const { t } = useI18n();
  return (
    <div className="due">
      <Notice tone="error" announce={false}>
        <b>{t("due.title")}:</b> {describeError(error, t)}
      </Notice>
      <Button
        className="due-error-action"
        size="sm"
        icon={RotateCcw}
        busy={retrying}
        aria-label={t("due.retry")}
        onClick={onRetry}
      >
        {t("error.retry")}
      </Button>
    </div>
  );
}

interface DueErrorProps {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}
