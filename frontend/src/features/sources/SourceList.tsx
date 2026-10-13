"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Globe, Plus } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { listPhase } from "@/domain/inbox";
import { sortSources, sourceState } from "@/domain/sources";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityState, ActivityTask } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { CrawlButton } from "./crawl/CrawlButton";
import { CrawlProgress } from "./crawl/CrawlProgress";
import { SourceRow } from "./SourceRow";
import { SOURCES_LIST_ID } from "./useFocusFallback";

interface SourceListProps {
  query: UseQueryResult<Platform[]>;
  onAdd: () => void;
}

/** The running crawl of a source (D2: from the activity cache, no polling). */
export function runningTaskOf(activity: ActivityState, platformId: number): ActivityTask | null {
  return activity.running.find((task) => task.platformId === platformId) ?? null;
}

/** Loading, stalled, error, empty and filled states of the list (constraint "States"). */
export function SourceList({ query, onAdd }: SourceListProps) {
  const phase = listPhase({
    hasData: query.data !== undefined,
    isError: query.isError,
    failureCount: query.failureCount,
    itemCount: query.data?.length ?? 0,
  });
  if (phase === "loading" || phase === "stalled") {
    return <ListLoading stalled={phase === "stalled"} />;
  }
  if (phase === "error")
    return <ListError error={query.error} onRetry={() => void query.refetch()} />;
  if (phase === "empty") return <SourcesEmpty onAdd={onAdd} />;
  return <SourceRows platforms={query.data ?? []} />;
}

function SourceRows({ platforms }: { platforms: readonly Platform[] }) {
  const { t } = useI18n();
  const activity = useActivity(true);
  return (
    <section className="src-table">
      <ColumnHead />
      <ul role="list" id={SOURCES_LIST_ID} className="src-rows" aria-label={t("sources.list")}>
        {sortSources(platforms).map((platform) => (
          <SourceListItem key={platform.id} platform={platform} activity={activity} />
        ))}
      </ul>
    </section>
  );
}

/** D4: while the source runs, its last-run cell shows the live progress with Abbrechen. */
function SourceListItem({ platform, activity }: { platform: Platform; activity: ActivityState }) {
  const task = runningTaskOf(activity, platform.id);
  return (
    <SourceRow
      platform={platform}
      task={task}
      progress={task ? <CrawlProgress platform={platform} task={task} /> : undefined}
      action={<CrawlButton platform={platform} state={sourceState(platform, task !== null)} />}
    />
  );
}

/** Visual only: each cell carries its own label for screen readers (SourceRow). */
function ColumnHead() {
  const { t } = useI18n();
  return (
    <div className="src-head" aria-hidden="true">
      <span>{t("sources.col.source")}</span>
      <span>{t("sources.col.schedule")}</span>
      <span>{t("sources.col.lastRun")}</span>
      <span>{t("sources.col.status")}</span>
    </div>
  );
}

function SourcesEmpty({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const action = (
    <Button variant="primary" icon={Plus} onClick={onAdd}>
      {t("onboard.source.action")}
    </Button>
  );
  return (
    <EmptyState icon={Globe} title={t("onboard.source.title")} actions={action}>
      {t("onboard.source.text")}
    </EmptyState>
  );
}
