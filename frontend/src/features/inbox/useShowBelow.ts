"use client";

import { useEffect, useRef } from "react";
import { tabId } from "@/ui/Tabs";
import { INBOX_TABS_ID } from "./InboxTabs";
import type { InboxUrl } from "./useInboxUrl";

/**
 * Spec 4.3 #5: the run line's "Ansehen" and the empty state's button leave with the tab switch, so
 * focus would fall to the page. Once the "Unter Schwellwert" tab is selected it takes focus, the
 * natural landing point of the WAI-ARIA tabs ("Unter Schwellwert, Tab 2 von 3").
 */
export function useShowBelow(url: InboxUrl): () => void {
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current || url.tab !== "below") return;
    pending.current = false;
    document.getElementById(tabId(INBOX_TABS_ID, "below"))?.focus();
  }, [url.tab]);
  return () => {
    pending.current = true;
    url.setTab("below");
  };
}
