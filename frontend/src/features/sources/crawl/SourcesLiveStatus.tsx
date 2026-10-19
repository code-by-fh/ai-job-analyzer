"use client";

import { useState } from "react";
import type { Platform } from "@/api/platforms";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { latestFinished, type ActivityOutcome } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { useClearThenSet } from "@/ui/useAnnouncement";

const LIVE_TEXT: Readonly<Record<ActivityOutcome, MessageKey>> = {
  completed: "sources.live.completed",
  failed: "sources.live.failed",
  cancelled: "sources.live.cancelled",
};

/**
 * The end that happened while this region speaks: the one known at mount is old news, and so is
 * every end while it is muted (another region spoke for it).
 */
function useFreshEnd(
  platforms: readonly Platform[],
  muted: boolean,
): { key: string; text: string } {
  const { t } = useI18n();
  const finished = latestFinished(useActivity(true));
  const finishedId = finished?.id ?? null;
  const [oldNews, setOldNews] = useState(finishedId);
  if (muted && oldNews !== finishedId) setOldNews(finishedId);
  const fresh = finished && !muted && finished.id !== oldNews ? finished : null;
  const source = fresh ? platforms.find((platform) => platform.id === fresh.platformId) : undefined;
  if (!fresh || !source) return { key: "", text: "" };
  return { key: fresh.id, text: t(LIVE_TEXT[fresh.outcome], { name: source.name }) };
}

interface SourcesLiveStatusProps {
  platforms: readonly Platform[];
  /** True while a modal drawer has its own instance: the page's stays empty, so no end is read twice. */
  muted?: boolean;
}

/**
 * D13: the live region of the page, and of the modal source drawer (which hides the page's region),
 * mounted with its owner and never conditionally. It says when a source's crawl ended, never each
 * step. Each end clears the text first, then sets it.
 */
export function SourcesLiveStatus({ platforms, muted = false }: SourcesLiveStatusProps) {
  const { key, text } = useFreshEnd(platforms, muted);
  const ready = useClearThenSet(key);
  return (
    <p role="status" className="sr-only src-live">
      {ready ? text : ""}
    </p>
  );
}
