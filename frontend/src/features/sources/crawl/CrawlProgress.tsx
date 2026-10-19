"use client";

import type { Platform } from "@/api/platforms";
import { CrawlBar } from "@/features/shell/crawl/CrawlBar";
import { crawlStepText } from "@/features/shell/crawl/crawlText";
import { useI18n } from "@/i18n/useI18n";
import { taskStart, type ActivityTask } from "@/realtime/activity";
import { Button } from "@/ui/Button";
import { Elapsed } from "@/ui/Elapsed";
import { crawlCancelId, crawlStartId, useFocusHandoff, type CrawlPlace } from "./crawlFocus";
import { useCancelCrawl } from "./useCrawlActions";

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
  const step = crawlStepText(task, t);
  return (
    <div ref={ref} className="crawl-live">
      <span className="crawl-step">
        {step} <Elapsed startedAt={taskStart(task)} />
      </span>
      <CrawlBar task={task} sourceName={platform.name} step={step} />
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
