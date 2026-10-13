"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import { platformRunsQueryOptions, type PlatformRun } from "@/api/platforms";
import { givenUp } from "@/api/queryState";
import { isFailedRun, summarizeRun, type RunSummary } from "@/domain/runLine";
import { formatDayTime } from "@/i18n/formatDayTime";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { runResult } from "../RunCell";

const HEADING_ID = "src-runs-h";

/** D8: up to ten runs, newest first. Read only, so no Speichern. */
export function RunHistory({ platformId }: { platformId: number }) {
  const { t } = useI18n();
  return (
    <section className="drawer-section">
      <h3 id={HEADING_ID} className="sec-title-sm">
        {t("sources.section.runs")}
      </h3>
      <RunHistoryBody platformId={platformId} />
    </section>
  );
}

/** A run whose finish time does not parse is left out (summarizeRun answers null). */
function summariesOf(runs: readonly PlatformRun[]): RunSummary[] {
  return runs.flatMap((run) => {
    const summary = summarizeRun(run);
    return summary ? [summary] : [];
  });
}

function RunHistoryBody({ platformId }: { platformId: number }) {
  const { t } = useI18n();
  const query = useQuery(platformRunsQueryOptions(platformId));
  // Phase 4 RB13: a request being retried counts as failed, so no skeleton through the backoff.
  if (givenUp(query)) {
    return <RunsLoadFailed onRetry={() => void query.refetch()} busy={query.isFetching} />;
  }
  if (!query.data) return <RunsLoading />;
  const runs = summariesOf(query.data);
  if (runs.length === 0) return <p className="muted">{t("sources.runs.empty")}</p>;
  return <RunList runs={runs} />;
}

function RunList({ runs }: { runs: readonly RunSummary[] }) {
  const { t } = useI18n();
  // G5 (phase 3 R9): a seed run's counts are not ratings; say so only where such a run is listed.
  const seedListed = runs.some((run) => run.seeded && run.error === null);
  return (
    <>
      <ul role="list" aria-labelledby={HEADING_ID} className="run-list">
        {runs.map((run, index) => (
          <RunItem key={`${run.finishedAt.getTime()}-${index}`} run={run} />
        ))}
      </ul>
      {seedListed ? <p className="hint">{t("sources.runs.seedNote")}</p> : null}
    </>
  );
}

/** Same words as the list's last-run cell; a failure in crimson with icon and words (spec 5). */
function RunItem({ run }: { run: RunSummary }) {
  const { t, language } = useI18n();
  const now = useNow();
  const when = formatDayTime(run.finishedAt, t, { now, language });
  const text = t("sources.run.item", { when, result: runResult(run, t) });
  if (!isFailedRun(run.error)) return <li>{text}</li>;
  return (
    <li className="t-danger run-failed">
      <Icon icon={CircleAlert} />
      <span>{text}</span>
    </li>
  );
}

function RunsLoading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <span className="skeleton-line w-2/3" />
    </div>
  );
}

/** A state on open, not an event: the drawer's dialog already announces itself (no alert). */
function RunsLoadFailed({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const { t } = useI18n();
  return (
    <div className="runs-failed">
      <Notice tone="error" announce={false}>
        {t("sources.runs.loadFailed")}
      </Notice>
      <Button icon={RotateCcw} size="sm" busy={busy} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
