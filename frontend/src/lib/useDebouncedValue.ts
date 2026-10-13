"use client";

import { useEffect, useState } from "react";

/** The value once it stopped changing for delayMs (e.g. a slider before a preview request). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    // setState runs in the timer callback, not in the effect body.
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
