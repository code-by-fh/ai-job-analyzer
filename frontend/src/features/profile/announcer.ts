"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export interface Announcement {
  id: number;
  text: string;
}

export interface Announcer {
  say: (text: string) => void;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => Announcement | null;
}

/**
 * D13: the page's one live region reads from this store, so an effect (a template that left the
 * AI fill) or an event handler (the CV import) can announce without a React state update in an
 * effect body. Each message gets a new id, so the same words are read again.
 */
export function createAnnouncer(): Announcer {
  let last: Announcement | null = null;
  const listeners = new Set<() => void>();
  return {
    say: (text) => {
      last = { id: (last?.id ?? 0) + 1, text };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => last,
  };
}

export const AnnouncerContext = createContext<Announcer | null>(null);

function useAnnouncer(): Announcer {
  const announcer = useContext(AnnouncerContext);
  if (!announcer) throw new Error("profile announcements need the ProfilePage");
  return announcer;
}

export function useProfileAnnounce(): (text: string) => void {
  return useAnnouncer().say;
}

const NONE = () => null;

export function useLastAnnouncement(): Announcement | null {
  const announcer = useAnnouncer();
  return useSyncExternalStore(announcer.subscribe, announcer.snapshot, NONE);
}
