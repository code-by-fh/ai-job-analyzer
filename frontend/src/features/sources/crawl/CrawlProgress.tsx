"use client";

import type { Platform } from "@/api/platforms";
import { STEP_LABEL } from "@/features/shell/ActivityPanel";
import { useI18n } from "@/i18n/useI18n";
import { progressPercent, type ActivityTask } from "@/realtime/activity";
import { Button } from "@/ui/Button";
import { crawlCancelId, crawlStartId, useFocusHandoff, type CrawlPlace } from "./crawlFocus";
import { useCancelCrawl } from "./useCrawlActions";

const FULL = 100;

interface CrawlProgressProps {
  platform: Platform;
  task: ActivityTask;
  place?: CrawlPlace;
}

/**
 * D4: step text and a native bar (no inline style), Abbrechen in this cell, never where Durchsuchen
 * sits, so a double click cannot cancel. Progress is not announced (D13: not chatty).
 */
export function CrawlProgress({ platform, task, place = "row" }: CrawlProgressProps) {
  const { t } = useI18n();
  const ref = useFocusHandoff<HTMLDivElement>(crawlStartId(platform.id, place));
  const step = t(STEP_LABEL[task.step], { done: task.done, total: task.total });
  return (
    <div ref={ref} className="crawl-live">
      <span className="crawl-step">{step}</span>
      {/* aria-valuetext: "Startet …" says more than the 5 % a just-started bar shows. */}
      <progress
        className="crawl-bar"
        max={FULL}
        value={progressPercent(task)}
        aria-label={t("sources.crawl.progress", { name: platform.name })}
        aria-valuetext={step}
      />
      <CancelButton platform={platform} task={task} id={crawlCancelId(platform.id, place)} />
    </div>
  );
}

interface CancelButtonProps {
  platform: Platform;
  task: ActivityTask;
  id: string;
}

function CancelButton({ platform, task, id }: CancelButtonProps) {
  const { t } = useI18n();
  const cancel = useCancelCrawl(platform);
  return (
    <Button
      id={id}
      variant="ghost"
      size="sm"
      className="crawl-cancel"
      aria-label={t("sources.crawl.cancel", { name: platform.name })}
      // No spinner: the row's "Läuft" tag is its one moving element (spec 5).
      inactive={cancel.isBusy}
      aria-busy={cancel.isBusy || undefined}
      onClick={() => cancel.cancel(task.id)}
    >
      {t("guard.cancel")}
    </Button>
  );
}
