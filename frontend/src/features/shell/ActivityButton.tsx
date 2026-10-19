"use client";

import { Activity } from "lucide-react";
import { useState } from "react";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityState, ActivityTask } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { ActivityPanel } from "./ActivityPanel";
import { CrawlTicker, hasRunning } from "./crawl/CrawlTicker";

/** Fixed activity label (spec 4.3.6): "Aktivität" when idle, "2 Aufgaben laufen" while busy. */
export function activityLabel(running: number, t: Translate): string {
  if (running === 0) return t("activity.label");
  return running === 1 ? t("activity.runningOne") : t("activity.runningMany", { count: running });
}

/** Desktop sidebar entry: "Aktivität" when idle, the live crawl indicator while crawls run. */
export function ActivityButton({ enabled }: { enabled: boolean }) {
  const activity = useActivity(enabled);
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-anchor">
      <ActivityTrigger running={activity.running} open={open} onToggle={() => setOpen(!open)} />
      <ActivityPopover activity={activity} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

interface ActivityPopoverProps {
  activity: ActivityState;
  open: boolean;
  onClose: () => void;
}

/**
 * The detailed activity view. "dock" is fixed to the viewport, so the sidebar's scroll box neither
 * clips it nor gains a horizontal scrollbar, and it lies above the page.
 */
export function ActivityPopover({ activity, open, onClose }: ActivityPopoverProps) {
  const { t } = useI18n();
  return (
    <Popover open={open} onClose={onClose} placement="dock" label={t("activity.heading")}>
      <ActivityPanel activity={activity} onNavigate={onClose} />
    </Popover>
  );
}

interface ActivityTriggerProps {
  running: readonly ActivityTask[];
  open: boolean;
  onToggle: () => void;
}

function ActivityTrigger({ running, open, onToggle }: ActivityTriggerProps) {
  return (
    <button
      type="button"
      className={cx("side-btn", hasRunning(running) && "activity-live")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
    >
      <TriggerContent running={running} />
    </button>
  );
}

function TriggerContent({ running }: { running: readonly ActivityTask[] }) {
  const { t } = useI18n();
  if (!hasRunning(running)) {
    return (
      <>
        <Icon icon={Activity} />
        <span>{t("activity.label")}</span>
      </>
    );
  }
  return (
    <>
      <span className="sr-only">{activityLabel(running.length, t)}:</span>{" "}
      <CrawlTicker running={running} />
    </>
  );
}
