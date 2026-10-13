"use client";

import { useSyncExternalStore } from "react";

/** Due states and "stalled" tasks change at most by the minute; 30 s keeps them current enough. */
export const CLOCK_TICK_MS = 30_000;

const listeners = new Set<() => void>();
let current = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function tick(): void {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    current = Date.now();
    timer = setInterval(tick, CLOCK_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearInterval(timer);
  };
}

const read = (): number => current;

/** The current time as render input; render code must not call Date.now() itself (react-hooks purity). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, read, read);
}
