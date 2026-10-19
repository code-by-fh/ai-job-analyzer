"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import type { CrawlProgress } from "@/api/crawlProgress";
import { SourceIcon } from "@/features/sources/SourceIcon";
import { useI18n } from "@/i18n/useI18n";
import { measuredPercent, taskStart, type ActivityTask } from "@/realtime/activity";
import { Elapsed } from "@/ui/Elapsed";
import { Icon } from "@/ui/Icon";
import { CrawlBar } from "./CrawlBar";
import { CrawlStations } from "./CrawlStations";
import { crawlStepText } from "./crawlText";
import { SourceName } from "./SourceName";
import { useCrawlSource } from "./useCrawlSource";

interface CrawlCardProps {
  task: ActivityTask;
  onNavigate?: () => void;
}

/** One running crawl in detail: source, stage, bar, the station timeline and what went wrong. */
export function CrawlCard({ task, onNavigate }: CrawlCardProps) {
  const source = useCrawlSource(task);
  return (
    <div className="crawl-card">
      <div className="crawl-card-head">
        <SourceIcon platform={source} />
        <SourceName source={source} onNavigate={onNavigate} />
        <CrawlPercent task={task} />
      </div>
      <CrawlStep task={task} sourceName={source.name} />
      <CrawlStations progress={task.progress} />
      <CrawlNotes progress={task.progress} />
    </div>
  );
}

function CrawlPercent({ task }: { task: ActivityTask }) {
  const { t } = useI18n();
  const percent = measuredPercent(task);
  if (percent === null) return null;
  return <span className="crawl-pct">{t("activity.percent", { value: percent })}</span>;
}

function CrawlStep({ task, sourceName }: { task: ActivityTask; sourceName: string }) {
  const { t } = useI18n();
  const step = crawlStepText(task, t);
  return (
    <>
      <p className="crawl-card-step">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{step}</span>
        <Elapsed startedAt={taskStart(task)} />
      </p>
      <CrawlBar task={task} sourceName={sourceName} step={step} />
    </>
  );
}

/** Known postings and pages that could not be fetched; nothing when neither happened. */
function CrawlNotes({ progress }: { progress: CrawlProgress | undefined }) {
  const { t } = useI18n();
  const skipped = progress?.jobs_skipped ?? 0;
  const failed = progress?.pages_failed ?? 0;
  if (skipped === 0 && failed === 0) return null;
  return (
    <p className="crawl-notes">
      {skipped > 0 ? <span>{t("activity.skipped", { count: skipped })}</span> : null}
      {failed > 0 ? (
        <span className="t-danger">
          <Icon icon={TriangleAlert} />
          {t("activity.failedPages", { count: failed })}
        </span>
      ) : null}
    </p>
  );
}
