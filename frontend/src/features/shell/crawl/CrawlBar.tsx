"use client";

import { useI18n } from "@/i18n/useI18n";
import { progressPercent, type ActivityTask } from "@/realtime/activity";

const FULL = 100;

interface CrawlBarProps {
  task: ActivityTask;
  sourceName: string;
  /** The stage text shown next to the bar. */
  step: string;
}

/** The native crawl bar of one running crawl (no inline style). */
export function CrawlBar({ task, sourceName, step }: CrawlBarProps) {
  const { t } = useI18n();
  return (
    // aria-valuetext: the stage says more than the 5 % a just-started bar shows.
    <progress
      className="crawl-bar"
      max={FULL}
      value={progressPercent(task)}
      aria-label={t("sources.crawl.progress", { name: sourceName })}
      aria-valuetext={step}
    />
  );
}
