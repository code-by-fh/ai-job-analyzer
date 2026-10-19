"use client";

import { LoaderCircle } from "lucide-react";
import { SourceIcon } from "@/features/sources/SourceIcon";
import { useI18n } from "@/i18n/useI18n";
import {
  measuredPercent,
  progressPercent,
  taskStart,
  type ActivityTask,
} from "@/realtime/activity";
import { Elapsed } from "@/ui/Elapsed";
import { Icon } from "@/ui/Icon";
import { crawlStepText } from "./crawlText";
import { useCrawlSource } from "./useCrawlSource";

const FULL = 100;

type RunningCrawls = readonly [ActivityTask, ...ActivityTask[]];

/**
 * The compact, always visible crawl indicator (sidebar on desktop, strip above the bottom bar on
 * mobile): the oldest running crawl's source, stage and progress, plus how many more run. It sits
 * inside the trigger button, so it holds only phrasing content and its bar is decorative.
 */
export function CrawlTicker({ running }: { running: RunningCrawls }) {
  const task = running[0];
  return (
    <span className="ticker">
      <TickerHead task={task} />
      <Pause />
      <TickerStep task={task} />
      <TickerMore count={running.length - 1} />
      <progress
        className="crawl-bar ticker-bar"
        max={FULL}
        value={progressPercent(task)}
        aria-hidden="true"
      />
    </span>
  );
}

function TickerHead({ task }: { task: ActivityTask }) {
  const { t } = useI18n();
  const source = useCrawlSource(task);
  const percent = measuredPercent(task);
  return (
    <>
      <SourceIcon platform={source} />
      <span className="ticker-name">{source.name}</span>
      {percent === null ? null : (
        <>
          <Pause />
          <span className="ticker-pct">{t("activity.percent", { value: percent })}</span>
        </>
      )}
    </>
  );
}

function TickerStep({ task }: { task: ActivityTask }) {
  const { t } = useI18n();
  return (
    <span className="ticker-step">
      {/* The spinner is the one moving indicator the spec allows: a running crawl. */}
      <Icon icon={LoaderCircle} className="spin" />
      <span>{crawlStepText(task, t)}</span>
      <TickerElapsed startedAt={taskStart(task)} />
    </span>
  );
}

/** The comma before the time is spoken only when there is a time. */
function TickerElapsed({ startedAt }: { startedAt: number | null }) {
  if (startedAt === null) return null;
  return (
    <>
      <Pause />
      <Elapsed startedAt={startedAt} />
    </>
  );
}

function TickerMore({ count }: { count: number }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <>
      <Pause />
      <span className="ticker-more">{t("activity.more", { count })}</span>
    </>
  );
}

/**
 * A spoken comma between the ticker's parts, which the layout places apart without a separator.
 * Screen-reader text is absolutely positioned and a blank between grid items is not rendered, so
 * neither changes the layout.
 */
function Pause() {
  return (
    <>
      <span className="sr-only">,</span>{" "}
    </>
  );
}

/** Narrows the running list for CrawlTicker: true when at least one crawl runs. */
export function hasRunning(running: readonly ActivityTask[]): running is RunningCrawls {
  return running.length > 0;
}
