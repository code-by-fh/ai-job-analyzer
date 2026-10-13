"use client";

import { useEffect, useRef } from "react";
import { isFocusLost } from "@/ui/focus";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";

export type InboxViewKind = "onboarding" | "inbox";

/**
 * Spec 4.3 #5: when onboarding and inbox swap places, the control that had focus is gone (a link,
 * or the import drawer of the first run). The new view's title takes focus, unless the user has
 * already put it somewhere else. Null while the setup status loads; the first view takes no focus.
 */
export function useViewFocus(view: InboxViewKind | null): void {
  const shown = useRef<InboxViewKind | null>(null);
  useEffect(() => {
    if (view === null) return;
    const previous = shown.current;
    shown.current = view;
    if (previous === null || previous === view || !isFocusLost()) return;
    document.querySelector<HTMLElement>(MASTHEAD_TITLE_SELECTOR)?.focus();
  }, [view]);
}
