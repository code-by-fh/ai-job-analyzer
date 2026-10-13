"use client";

import { useCallback, useEffect, useRef, type FocusEvent } from "react";
import { isFocusLost } from "./focus";

/** Class of the element that holds both toast regions. */
export const TOAST_STACK_CLASS = "toasts";

export interface ToastFocusReturn {
  /** onFocus of the stack: remembers where focus came from when it enters from outside. */
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  /** Call before a toast is removed; a toast that held focus takes it along when it leaves. */
  noteRemoval: () => void;
}

/** The element focus came from if it is still there, else the main landmark (tabIndex -1). */
function returnFocus(origin: HTMLElement | null): void {
  const target = origin?.isConnected ? origin : document.querySelector<HTMLElement>("main");
  target?.focus();
}

/**
 * Spec 4.3 #5: activating "Rückgängig" or the close button removes the focused toast, which would
 * leave focus on the page. Focus goes back to the element it came from (e.g. the next row after a
 * triage), or to main when that element is gone too.
 */
export function useToastFocusReturn(): ToastFocusReturn {
  const origin = useRef<HTMLElement | null>(null);
  const pending = useRef(false);
  // No dependency list: it runs after every commit of the provider, so after each removal.
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    if (isFocusLost()) returnFocus(origin.current);
  });
  const onFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    const from = event.relatedTarget;
    if (from instanceof Node && event.currentTarget.contains(from)) return;
    origin.current = from instanceof HTMLElement ? from : null;
  }, []);
  const noteRemoval = useCallback(() => {
    if (document.activeElement?.closest(`.${TOAST_STACK_CLASS}`)) pending.current = true;
  }, []);
  return { onFocus, noteRemoval };
}
