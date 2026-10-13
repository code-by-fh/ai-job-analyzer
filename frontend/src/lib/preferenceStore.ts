type Listener = () => void;

export interface PreferenceStoreOptions<T extends string> {
  key: string;
  isValid: (value: string) => value is T;
  fallback: () => T;
}

/** A tiny external store for useSyncExternalStore, persisted in localStorage when available. */
export interface PreferenceStore<T extends string> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createPreferenceStore<T extends string>(
  options: PreferenceStoreOptions<T>,
): PreferenceStore<T> {
  const listeners = new Set<Listener>();
  let current: T | null = null;
  const get = (): T => (current ??= readStored(options) ?? options.fallback());
  const set = (value: T): void => {
    current = value;
    writeStored(options.key, value);
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return { get, set, subscribe };
}

function readStored<T extends string>(options: PreferenceStoreOptions<T>): T | null {
  try {
    const raw = window.localStorage.getItem(options.key);
    return raw !== null && options.isValid(raw) ? raw : null;
  } catch {
    // Storage blocked (private mode, sandboxed preview): fall back to the default.
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the in-memory value still applies for this tab.
  }
}
