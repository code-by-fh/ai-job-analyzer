import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const listeners = new Set<() => void>();
const state = { params: new URLSearchParams(), deferred: false };
const queue: string[] = [];

function setParams(params: URLSearchParams): void {
  state.params = params;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyHref(href: string): void {
  setParams(new URL(href, "http://app").searchParams);
}

/** A router whose replace() really changes the query string, so URL-driven views re-render. */
export const liveNavigation = {
  replace: vi.fn((href: string) => {
    if (state.deferred) queue.push(href);
    else applyHref(href);
  }),
  push: vi.fn(),
  /** From now on replace() only queues; release() lets the router catch up (a lagging router). */
  defer(): void {
    state.deferred = true;
  },
  /** Applies the oldest `count` queued replaces, in order. */
  release(count = queue.length): void {
    queue.splice(0, count).forEach(applyHref);
  },
  reset(query = ""): void {
    liveNavigation.replace.mockClear();
    state.deferred = false;
    queue.length = 0;
    setParams(new URLSearchParams(query));
  },
};

/** The next/navigation module for vi.mock: `vi.mock("next/navigation", async () => (await import(...)).navigationModule("/x"))`. */
export function navigationModule(pathname: string) {
  return {
    useRouter: () => ({ replace: liveNavigation.replace, push: liveNavigation.push }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => state.params),
    usePathname: () => pathname,
  };
}
