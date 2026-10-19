import type { CrawlProgress } from "@/api/crawlProgress";
import { isKnownStage, type CrawlStage } from "@/domain/crawlStages";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import type { ActivityStep, ActivityTask } from "@/realtime/activity";

/** Step text from the old counters: imports and crawls without progress data. */
export const STEP_LABEL: Record<ActivityStep, MessageKey> = {
  starting: "activity.step.starting",
  collecting: "activity.step.collecting",
  extracting: "activity.step.extracting",
  analysing: "activity.step.analysing",
};

const STAGE_LABEL: Readonly<Record<CrawlStage, MessageKey>> = {
  queued: "activity.stage.queued",
  collecting_links: "activity.stage.collecting_links",
  filtering_links: "activity.stage.filtering_links",
  fetching_pages: "activity.stage.fetching_pages",
  analysing: "activity.stage.analysing",
  completed: "activity.stage.completed",
};

/** Done/total of the running stage: a failed page counts as fetched and is never analysed. */
function stageVars(progress: CrawlProgress) {
  const fetching = progress.stage === "fetching_pages";
  return {
    found: progress.links_found,
    done: fetching ? progress.pages_fetched + progress.pages_failed : progress.jobs_analysed,
    total: fetching ? progress.links_new : progress.links_new - progress.pages_failed,
  };
}

/** One line on what a crawl does now; shared by the indicator, the activity popover and source rows. */
export function crawlStepText(task: ActivityTask, t: Translate): string {
  const progress = task.progress;
  if (!progress || !isKnownStage(progress.stage)) {
    return t(STEP_LABEL[task.step], { done: task.done, total: task.total });
  }
  return t(STAGE_LABEL[progress.stage], stageVars(progress));
}
