"use client";

import { useEffect, useRef, type RefObject } from "react";

export const LIST_ID = "applications-list";

/** The href of the last focused link inside the list, "" for another element, null for none. */
type FocusMark = string | null;

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

function restoreFocus(container: HTMLElement, mark: FocusMark): void {
  if (mark === null || !focusLost()) return;
  const link = mark ? container.querySelector<HTMLElement>(`a[href="${CSS.escape(mark)}"]`) : null;
  (link ?? container).focus();
}

function markOf(target: EventTarget | null): FocusMark {
  return target instanceof HTMLAnchorElement ? (target.getAttribute("href") ?? "") : "";
}

/**
 * Focus that moved to an element outside the list is the user's choice: forget the mark. Chrome
 * also fires focusout, without a relatedTarget, for a focused element React removes; that keeps
 * the mark (verified in applicationsLive.spec.ts). So does a click on empty page space, after
 * which a later refetch pulls focus back into the list: accepted as low risk (RB15).
 */
function leftTheList(container: HTMLElement, event: FocusEvent): boolean {
  const next = event.relatedTarget;
  return next instanceof Node && !container.contains(next);
}

/** Watches focus inside the list and repairs it after DOM changes; returns the cleanup. */
function watchFocus(container: HTMLElement): () => void {
  let mark: FocusMark = null;
  const onFocusIn = (event: FocusEvent) => (mark = markOf(event.target));
  const onFocusOut = (event: FocusEvent) => {
    if (leftTheList(container, event)) mark = null;
  };
  const observer = new MutationObserver(() => restoreFocus(container, mark));
  container.addEventListener("focusin", onFocusIn);
  container.addEventListener("focusout", onFocusOut);
  observer.observe(container, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    container.removeEventListener("focusin", onFocusIn);
    container.removeEventListener("focusout", onFocusOut);
  };
}

/**
 * Decision D14: a refetch may move the focused row to another section (React remounts it), drop
 * it from the list, or remove a button such as "Weitere laden". Focus then goes to the same job's
 * link, else to the list container, never to the body.
 */
export function useListFocus(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? watchFocus(ref.current) : undefined), []);
  return ref;
}
