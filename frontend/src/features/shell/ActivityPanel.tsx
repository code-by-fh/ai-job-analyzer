"use client";

import { LoaderCircle } from "lucide-react";
import type { MessageKey } from "@/i18n/de";
import { formatTime } from "@/i18n/formatTime";
import { useI18n } from "@/i18n/useI18n";
import {
  progressPercent,
  type ActivityOutcome,
  type ActivityState,
  type ActivityStep,
  type ActivityTask,
  type FinishedTask,
} from "@/realtime/activity";
import { Icon } from "@/ui/Icon";

export const STEP_LABEL: Record<ActivityStep, MessageKey> = {
  starting: "activity.step.starting",
  collecting: "activity.step.collecting",
  extracting: "activity.step.extracting",
  analysing: "activity.step.analysing",
};

const OUTCOME_LABEL: Record<ActivityOutcome, MessageKey> = {
  completed: "activity.finished.completed",
  failed: "activity.finished.failed",
  cancelled: "activity.finished.cancelled",
};

/** Step-based progress text for background tasks (spec 4.3.6); shared by popover and mobile sheet. */
export function ActivityPanel({ activity }: { activity: ActivityState }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="pop-head">{t("activity.heading")}</div>
      {activity.running.length === 0 ? (
        <IdleActivity lastFinished={activity.lastFinished} />
      ) : (
        activity.running.map((task) => <RunningTask key={task.id} task={task} />)
      )}
    </div>
  );
}

function RunningTask({ task }: { task: ActivityTask }) {
  const { t } = useI18n();
  const source = task.source || t("activity.unknownSource");
  return (
    <div className="task">
      <div className="task-title">
        <Icon icon={LoaderCircle} className="spin" />
        <span>{t("activity.crawlTitle", { source })}</span>
      </div>
      <div className="task-sub">
        {t(STEP_LABEL[task.step], { done: task.done, total: task.total })}
      </div>
      <div className="progress">
        <i style={{ width: `${progressPercent(task)}%` }} />
      </div>
    </div>
  );
}

function IdleActivity({ lastFinished }: { lastFinished: FinishedTask | null }) {
  const { t, language } = useI18n();
  return (
    <div className="task">
      <div className="muted">{t("activity.none")}</div>
      {lastFinished ? (
        <div className="meta faint mt-1">
          {t(OUTCOME_LABEL[lastFinished.outcome], {
            source: lastFinished.source || t("activity.unknownSource"),
            time: formatTime(lastFinished.finishedAt, language),
          })}
        </div>
      ) : null}
    </div>
  );
}
