"use client";

import type { KeyboardEvent, RefObject } from "react";

const RESULT_SELECTOR = "a[data-result]";
const FIELD_SELECTOR = "input";
const RESULT_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/** Where a key moves from result `current`; -1 is the text field (ArrowUp on the first result). */
function targetIndex(key: string, current: number, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return Math.min(current + 1, count - 1);
  return current - 1;
}

function moveFrom(event: KeyboardEvent, panel: HTMLElement, links: HTMLAnchorElement[]): void {
  const current = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (current === -1) return;
  event.preventDefault();
  const target = targetIndex(event.key, current, links.length);
  const field = panel.querySelector<HTMLInputElement>(FIELD_SELECTOR);
  (target < 0 ? field : links[target])?.focus();
}

/**
 * D10, ruling 29: in the text field only ArrowDown acts (to the first result), so Home and End
 * keep moving the caret; on a result link the arrows, Home and End move between the results.
 */
export function useResultKeys(panelRef: RefObject<HTMLElement | null>) {
  return (event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel || !RESULT_KEYS.has(event.key)) return;
    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>(RESULT_SELECTOR));
    if (links.length === 0) return;
    const fromField = event.target === panel.querySelector(FIELD_SELECTOR);
    if (!fromField) {
      moveFrom(event, panel, links);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      links[0]?.focus();
    }
  };
}
