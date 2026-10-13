import { vi } from "vitest";

export interface FakeMediaQuery {
  setMatches: (matches: boolean) => void;
}

/** jsdom has no matchMedia; this stands in for the browser's prefers-color-scheme query. */
export function installFakeMatchMedia(initialMatches: boolean): FakeMediaQuery {
  const listeners = new Set<() => void>();
  let matches = initialMatches;
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => mediaQueryList);
  return {
    setMatches: (next) => {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}
