"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { SOURCES_HREF } from "@/features/shell/navigation";
import { isFailedRun, latestRun, RUN_ERROR_LABEL, type LastRun } from "@/domain/runLine";
import { nextRunAt } from "@/domain/schedule";
import { formatDayTime, type DayTimeClock } from "@/i18n/formatDayTime";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";

// Stands in for the source name in the translated sentence, so the name can be set in bold.
const SOURCE_SLOT = "\uE000";
const SEPARATOR = " · ";
// The last-run part has no closing stop: " · " joins it to the next run, else this ends it.
const SENTENCE_END = ".";

interface ShowBelow {
  /** Absent while the "Unter Schwellwert" tab is open: the link would lead nowhere. */
  onShowBelow?: () => void;
}

/** Decision D11: last finished crawl over all sources, and the next scheduled one. */
export function RunLine({ onShowBelow }: ShowBelow) {
  const platforms = useQuery(platformsQueryOptions());
  if (platforms.isError) return <RunLineError onRetry={() => void platforms.refetch()} />;
  // Loading stays silent (like the due card); without sources the onboarding speaks instead.
  if (!platforms.data || platforms.data.length === 0) return null;
  return <RunLineText platforms={platforms.data} onShowBelow={onShowBelow} />;
}

/** "Letzter Lauf … · Nächster Lauf …" with the action last, so the link never reads as part of a sentence. */
function RunLineText({ platforms, onShowBelow }: ShowBelow & { platforms: Platform[] }) {
  const { t, language } = useI18n();
  const now = useNow();
  // No time zone: the browser's zone stands in for the scheduler's profile zone (G12).
  const clock: DayTimeClock = { now, language };
  const run = latestRun(platforms);
  const next = nextRunAt(platforms, new Date(now));
  return (
    <p className="runline">
      {run ? <LastRunText run={run} clock={clock} /> : t("runline.never")}
      {next
        ? `${SEPARATOR}${t("runline.next", { when: formatDayTime(next, t, clock) })}`
        : SENTENCE_END}
      {run ? <RunAction run={run} onShowBelow={onShowBelow} /> : null}
    </p>
  );
}

function LastRunText({ run, clock }: { run: LastRun; clock: DayTimeClock }) {
  const { t } = useI18n();
  const when = formatDayTime(run.finishedAt, t, clock);
  if (isFailedRun(run.error)) {
    const reason = t(RUN_ERROR_LABEL[run.error]);
    const text = t("runline.failed", { source: SOURCE_SLOT, when, reason });
    return <FailedRun text={text} source={run.source} />;
  }
  // D3: the user's own cancel is no error, so it reads neutrally and offers no way to the sources.
  if (run.error === "cancelled") {
    const text = t("runline.cancelled", { source: SOURCE_SLOT, when });
    return <WithSource text={text} source={run.source} />;
  }
  return <RunCounts run={run} when={when} />;
}

function RunCounts({ run, when }: { run: LastRun; when: string }) {
  const { t } = useI18n();
  const counts = { found: run.found, matched: run.matched, below: run.below };
  return (
    <>
      <WithSource text={t("runline.last", { source: SOURCE_SLOT, when })} source={run.source} />{" "}
      {t("runline.counts", counts)}
    </>
  );
}

/** The source name in bold, as the prototype's `.runline b`. */
function WithSource({ text, source }: { text: string; source: string }) {
  const [before, after] = text.split(SOURCE_SLOT);
  return (
    <>
      {before}
      <b>{source}</b>
      {after}
    </>
  );
}

/** Errors in crimson, always with icon and words (spec 5). */
function FailedRun({ text, source }: { text: string; source: string }) {
  return (
    <span className="runline-error t-danger">
      <Icon icon={CircleAlert} />
      <span>
        <WithSource text={text} source={source} />
      </span>
    </span>
  );
}

/** The one action of the line: the sources after a failed run, else the jobs below the threshold. */
function RunAction({ run, onShowBelow }: ShowBelow & { run: LastRun }) {
  const { t } = useI18n();
  if (isFailedRun(run.error)) {
    return (
      <>
        {" "}
        <Link className="link" href={SOURCES_HREF}>
          {t("action.viewSources")}
        </Link>
      </>
    );
  }
  return !run.error && run.below > 0 && onShowBelow ? (
    <ShowBelowButton onShowBelow={onShowBelow} />
  ) : null;
}

function ShowBelowButton({ onShowBelow }: { onShowBelow: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {" "}
      {/* The visible "Ansehen" alone does not say what it shows. */}
      <button type="button" className="link" aria-label={t("inbox.toBelow")} onClick={onShowBelow}>
        {t("action.view")}
      </button>
    </>
  );
}

/**
 * Spec 6: the run line has an error state with retry, not silence (preflight ruling 19). M4: the
 * list error is the one alert when the API is down; this one stays visible, not loud.
 */
function RunLineError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="runline">
      <Notice tone="error" announce={false}>
        {t("runline.loadFailed")}{" "}
        <button type="button" className="link" onClick={onRetry}>
          {t("error.retry")}
        </button>
      </Notice>
    </div>
  );
}
