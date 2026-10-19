"use client";

import { useI18n } from "@/i18n/useI18n";
import type { ActivityState } from "@/realtime/activity";
import { CrawlCard } from "./crawl/CrawlCard";
import { RecentRuns } from "./crawl/RecentRuns";

interface ActivityPanelProps {
  activity: ActivityState;
  /** Closes the popover or sheet around the panel when one of its source links is followed. */
  onNavigate?: () => void;
}

/** The detailed activity view: every running crawl, then the runs that ended; popover and mobile sheet. */
export function ActivityPanel({ activity, onNavigate }: ActivityPanelProps) {
  const { t } = useI18n();
  return (
    <div className="activity-panel">
      <div className="pop-head">{t("activity.heading")}</div>
      {activity.running.length === 0 ? (
        <p className="activity-none">{t("activity.none")}</p>
      ) : (
        activity.running.map((task) => (
          <CrawlCard key={task.id} task={task} onNavigate={onNavigate} />
        ))
      )}
      <RecentRuns finished={activity.finished} onNavigate={onNavigate} />
    </div>
  );
}
