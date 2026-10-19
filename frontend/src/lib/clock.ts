"use client";

import { useSyncExternalStore } from "react";

/** Due states and "stalled" tasks change at most by the minute; 30 s keeps them current enough. */
export const CLOCK_TICK_MS = 30_000;
/** The elapsed time of a running task shows seconds. */
export const SECOND_TICK_MS = 1_000;

/** One interval per tick rate, shared by every subscriber and stopped when the last one leaves. */
class SharedClock {
  private readonly listeners = new Set<() => void>();
  private current = Date.now();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly tickMs: number) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.current = Date.now();
      this.timer = setInterval(this.tick, this.tickMs);
    }
    return () => this.unsubscribe(listener);
  };

  /**
   * Without subscribers no tick keeps `current` fresh, so a first render would show the time of the
   * last unsubscribe (or of module load). Re-reading only once it is a full tick old keeps the
   * snapshot stable between React's repeated calls within one render.
   */
  readonly read = (): number => {
    if (this.listeners.size === 0 && Date.now() - this.current >= this.tickMs) {
      this.current = Date.now();
    }
    return this.current;
  };

  private readonly tick = (): void => {
    this.current = Date.now();
    this.listeners.forEach((listener) => listener());
  };

  private unsubscribe(listener: () => void): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) clearInterval(this.timer);
  }
}

const minuteClock = new SharedClock(CLOCK_TICK_MS);
const secondClock = new SharedClock(SECOND_TICK_MS);

/** The current time as render input; render code must not call Date.now() itself (react-hooks purity). */
export function useNow(): number {
  return useSyncExternalStore(minuteClock.subscribe, minuteClock.read, minuteClock.read);
}

/** The current time, moving every second: only for the elapsed time of running tasks (`Elapsed`). */
export function useSecondNow(): number {
  return useSyncExternalStore(secondClock.subscribe, secondClock.read, secondClock.read);
}
