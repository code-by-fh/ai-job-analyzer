"use client";

import { useSyncExternalStore } from "react";

// One flag for every subscriber: the print events are per window, not per component.
let printing = false;

function subscribe(onChange: () => void) {
  const start = () => {
    printing = true;
    onChange();
  };
  const end = () => {
    printing = false;
    onChange();
  };
  window.addEventListener("beforeprint", start);
  window.addEventListener("afterprint", end);
  return () => {
    window.removeEventListener("beforeprint", start);
    window.removeEventListener("afterprint", end);
  };
}

const serverSnapshot = () => false;

/**
 * True between the browser's beforeprint and afterprint events, so a view can render its print
 * layout before the page is laid out for paper (a CSS print query cannot change what React renders).
 */
export function usePrinting(): boolean {
  return useSyncExternalStore(subscribe, () => printing, serverSnapshot);
}
