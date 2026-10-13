"use client";

import { Activity, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityState } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { ActivityPanel } from "./ActivityPanel";

/** Fixed activity label (spec 4.3.6): "Aktivität" when idle, "2 Aufgaben laufen" while busy. */
export function activityLabel(running: number, t: Translate): string {
  if (running === 0) return t("activity.label");
  return running === 1 ? t("activity.runningOne") : t("activity.runningMany", { count: running });
}

export function ActivityButton({ enabled }: { enabled: boolean }) {
  const activity = useActivity(enabled);
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-anchor">
      <ActivityTrigger
        running={activity.running.length}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      <ActivityPopover activity={activity} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

interface ActivityPopoverProps {
  activity: ActivityState;
  open: boolean;
  onClose: () => void;
}

function ActivityPopover({ activity, open, onClose }: ActivityPopoverProps) {
  const { t } = useI18n();
  return (
    <Popover open={open} onClose={onClose} placement="up" label={t("activity.heading")}>
      <ActivityPanel activity={activity} />
    </Popover>
  );
}

interface ActivityTriggerProps {
  running: number;
  open: boolean;
  onToggle: () => void;
}

function ActivityTrigger({ running, open, onToggle }: ActivityTriggerProps) {
  const { t } = useI18n();
  const busy = running > 0;
  return (
    <button
      type="button"
      className={cx("side-btn", busy && "activity-live")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
    >
      {/* The spinner is the one moving indicator the spec allows: a running crawl. */}
      <Icon icon={busy ? LoaderCircle : Activity} className={busy ? "spin" : undefined} />
      <span>{activityLabel(running, t)}</span>
    </button>
  );
}
