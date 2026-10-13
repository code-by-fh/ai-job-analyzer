"use client";

import { useEffect, useRef } from "react";
import type { InboxTab } from "@/api/jobList";
import { flattenPages, nextSelection } from "@/domain/inbox";
import { jobRoute } from "@/features/shell/routes";
import { isFocusLost } from "@/ui/focus";
import { panelId } from "@/ui/Tabs";
import { INBOX_TABS_ID } from "./InboxTabs";
import { useInboxList } from "./useInboxLists";

interface PendingFocus {
  removedId: string;
  nextId: string | null;
}

function rowLink(panel: HTMLElement, id: string): HTMLAnchorElement | null {
  const href = jobRoute(id);
  const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>(".jrow-link"));
  return links.find((link) => link.getAttribute("href") === href) ?? null;
}

/**
 * Moves focus only when it was lost with the row (body, or a detached element) or is still in the
 * list (a closed dialog hands it back to the row's button). Focus elsewhere, e.g. in the preview
 * pane, stays where the user put it.
 */
function focusLost(panel: HTMLElement): boolean {
  return isFocusLost() || panel.contains(document.activeElement);
}

function focusNext(nextId: string | null): void {
  const panel = document.getElementById(panelId(INBOX_TABS_ID));
  if (!panel || !focusLost(panel)) return;
  ((nextId ? rowLink(panel, nextId) : null) ?? panel).focus();
}

/**
 * Spec 4.3 #5: a removed row must not drop keyboard focus to the page. The next row (else the
 * previous one) is picked before the row leaves; focus moves there once it is gone from the list,
 * which for a delete or restore is only after the refetch. Without rows the list panel takes focus.
 */
export function useRemovalFocus(tab: InboxTab): (id: string) => void {
  const list = useInboxList(tab);
  const pending = useRef<PendingFocus | null>(null);
  useEffect(() => {
    const target = pending.current;
    const rows = flattenPages(list.data?.pages);
    if (!target || rows.some((row) => row.id === target.removedId)) return;
    pending.current = null;
    focusNext(target.nextId);
  }, [list.data]);
  return (id) => {
    const rows = flattenPages(list.data?.pages);
    pending.current = { removedId: id, nextId: nextSelection(rows, id) };
  };
}
