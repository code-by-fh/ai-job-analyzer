"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityState } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { focusNextFrame, isFocusLost } from "@/ui/focus";
import { activityLabel, ActivityPopover } from "../ActivityButton";
import { CrawlTicker, hasRunning } from "./CrawlTicker";

/** The bottom bar's "Mehr" button: where focus goes when the strip leaves with it. */
export const MORE_BUTTON_ID = "bottombar-more";

/**
 * Mobile crawl indicator: a strip docked above the bottom bar while a crawl runs, opening the same
 * activity popover as the sidebar. It stays while its popover is open, so the run that just ended
 * can be read there; closing it then removes the strip and hands focus to "Mehr".
 */
export function CrawlStrip({ signedIn }: { signedIn: boolean }) {
  const activity = useActivity(signedIn);
  const [open, setOpen] = useState(false);
  const busy = hasRunning(activity.running);
  if (!busy && !open) return null;
  const close = () => {
    setOpen(false);
    if (busy) return;
    focusNextFrame(() => (isFocusLost() ? document.getElementById(MORE_BUTTON_ID) : null));
  };
  return (
    <div className="crawl-dock pop-anchor">
      <StripButton activity={activity} open={open} onToggle={open ? close : () => setOpen(true)} />
      <ActivityPopover activity={activity} open={open} onClose={close} />
    </div>
  );
}

interface StripButtonProps {
  activity: ActivityState;
  open: boolean;
  onToggle: () => void;
}

function StripButton({ activity, open, onToggle }: StripButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="crawl-strip"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="sr-only">{activityLabel(activity.running.length, t)}:</span>{" "}
      {hasRunning(activity.running) ? (
        <CrawlTicker running={activity.running} />
      ) : (
        <span className="ticker-idle">{t("activity.none")}</span>
      )}
    </button>
  );
}
