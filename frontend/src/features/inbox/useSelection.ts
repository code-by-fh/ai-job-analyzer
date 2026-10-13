"use client";

import { useLayoutEffect, useRef } from "react";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { flattenPages, nextSelection, selectedItem } from "@/domain/inbox";
import { useInboxList } from "./useInboxLists";
import type { InboxUrl } from "./useInboxUrl";

export interface Selection {
  /** The job in the preview pane; null below 1200 px, where the pane stays empty. */
  selected: JobListItem | null;
  /** Whether the list has data, so the pane can tell "empty" from "not loaded yet". */
  listLoaded: boolean;
  /** Null below 1200 px: then a row click navigates to the job page (decision D2). */
  open: ((item: JobListItem) => void) | null;
  /** Before a row leaves the list. */
  onRemoved: (id: string) => void;
  /** An optimistic triage failed and its row is back. */
  onTriageFailed: (id: string) => void;
}

interface Handoff {
  tab: InboxTab;
  movedTo: string | null;
}

interface Shown {
  tab: InboxTab;
  selectedId: string | null;
  /** ?view=setup: the onboarding may have replaced the list (decision D6). */
  setup: boolean;
}

/**
 * R16(2): a failed triage takes the selection back only while it still rests where onRemoved moved
 * it. The failure arrives after later renders (queued mutations), so it reads the latest selection
 * from a ref, never from the closure of the render that started the triage. Once the list is gone
 * (unmounted, e.g. for the setup view) or the URL asks for the setup view, nothing is taken back:
 * re-selecting would replace the URL and pull the user out of where they went.
 */
function useHandoffs(url: InboxUrl, selectedId: string | null) {
  const handoffs = useRef(new Map<string, Handoff>());
  const latest = useLatestShown({ tab: url.tab, selectedId, setup: url.setup });
  return {
    record: (id: string, movedTo: string | null) => {
      handoffs.current.set(id, { tab: url.tab, movedTo });
    },
    /** True when the selection still rests where `id`'s removal moved it, in the same tab. */
    takeBack: (id: string): boolean => {
      const handoff = handoffs.current.get(id);
      handoffs.current.delete(id);
      return mayTakeBack(handoff, latest.current);
    },
  };
}

/** The latest render's view; null once the list is unmounted. */
function useLatestShown(shown: Shown) {
  const latest = useRef<Shown | null>(shown);
  useLayoutEffect(() => {
    latest.current = shown;
  });
  useLayoutEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );
  return latest;
}

function mayTakeBack(handoff: Handoff | undefined, now: Shown | null): boolean {
  if (!handoff || !now || now.setup) return false;
  return handoff.tab === now.tab && handoff.movedTo === now.selectedId;
}

/**
 * Decision D2: the selection lives in `?job=` and only from 1200 px. It picks its successor with the
 * same rule and rows as useRemovalFocus, so the preview and the focused row move to the same job.
 */
export function useSelection(url: InboxUrl, wide: boolean): Selection {
  const list = useInboxList(url.tab);
  const rows = flattenPages(list.data?.pages);
  const selected = wide ? selectedItem(rows, url.jobId) : null;
  const handoffs = useHandoffs(url, selected?.id ?? null);
  return {
    selected,
    listLoaded: list.data !== undefined,
    open: wide ? (item) => url.select(item.id) : null,
    // Only the shown row hands its place to a neighbour; removing another row keeps the selection.
    onRemoved: (id) => {
      if (selected?.id !== id) return;
      const next = nextSelection(rows, id);
      handoffs.record(id, next);
      url.select(next);
    },
    onTriageFailed: (id) => {
      if (handoffs.takeBack(id)) url.select(id);
    },
  };
}
