"use client";

import { useClearThenSet } from "@/ui/useAnnouncement";
import { useLastAnnouncement } from "./announcer";

const NO_ANNOUNCEMENT = 0;

/** The page's one persistent live region (D13); mounted from the first render, never conditional. */
export function ProfileLiveStatus() {
  const last = useLastAnnouncement();
  const shown = useClearThenSet(last?.id ?? NO_ANNOUNCEMENT);
  return (
    <p role="status" className="sr-only">
      {shown && last ? last.text : ""}
    </p>
  );
}
