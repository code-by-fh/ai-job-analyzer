import { flushSync } from "react-dom";

/**
 * True when keyboard focus fell to the page: nothing focused, the body, or an element that has
 * left the DOM with the control that held it (spec 4.3 #5, "focus never lands on body").
 */
export function isFocusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/** Focuses the target one frame later, once the commit that removed the old focus holder is done. */
export function focusNextFrame(target: () => HTMLElement | null): void {
  requestAnimationFrame(() => target()?.focus());
}

/**
 * After a confirmed action whose control goes away: flushSync commits the close now, so the
 * dialog's own focus return runs first, and the target takes focus one frame later. A close that
 * committed late, after that frame, would leave focus on a removed node (spec 4.3 #5).
 */
export function closeThenFocus(close: () => void, target: () => HTMLElement | null): void {
  flushSync(close);
  focusNextFrame(target);
}
