"use client";

import { useEffect, useState } from "react";

/**
 * A live region stays empty this long when a new announcement arrives, so one with the same words
 * as the one before is read again.
 */
export const ANNOUNCE_GAP_MS = 100;

/**
 * Clear-then-set for a persistent live region: false while `key` is new, true once the gap has
 * passed for it. The region renders its text only while this is true.
 */
export function useClearThenSet<Key extends string | number>(key: Key): boolean {
  const [announced, setAnnounced] = useState<Key | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(key), ANNOUNCE_GAP_MS);
    return () => clearTimeout(timer);
  }, [key]);
  return announced === key;
}
