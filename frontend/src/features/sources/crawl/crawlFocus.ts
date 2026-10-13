"use client";

import { useLayoutEffect, useRef } from "react";
import { focusNextFrame, isFocusLost } from "@/ui/focus";

/** Where a source's crawl controls sit: its list row, or the drawer header (a later task). */
export type CrawlPlace = "row" | "header";

export function crawlStartId(platformId: number, place: CrawlPlace): string {
  return `crawl-start-${place}-${platformId}`;
}

export function crawlCancelId(platformId: number, place: CrawlPlace): string {
  return `crawl-cancel-${place}-${platformId}`;
}

/**
 * Preflight ruling 16: a crawl control that leaves while it holds focus hands it to its partner in
 * the same place (Abbrechen -> Durchsuchen after a cancel, Durchsuchen -> Abbrechen when a start
 * swaps them), so focus never falls to <body>. A layout-effect cleanup runs before React removes
 * the nodes, so it can still tell whether focus was inside. Returns the ref for the wrapper.
 */
export function useFocusHandoff<T extends HTMLElement>(targetId: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (!element?.contains(document.activeElement)) return;
      // The partner may mount in the same commit; one frame later it is in place.
      focusNextFrame(() => (isFocusLost() ? document.getElementById(targetId) : null));
    };
  }, [targetId]);
  return ref;
}
