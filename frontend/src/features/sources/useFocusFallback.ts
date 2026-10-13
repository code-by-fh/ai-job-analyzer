import { focusNextFrame, isFocusLost } from "@/ui/focus";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";

export const SOURCES_LIST_ID = "sources-list";

export function sourceLinkId(id: number): string {
  return `source-link-${id}`;
}

function fallbackTarget(sourceId: number | null): HTMLElement | null {
  const row = sourceId === null ? null : document.getElementById(sourceLinkId(sourceId));
  return row ?? document.querySelector<HTMLElement>(MASTHEAD_TITLE_SELECTOR);
}

/**
 * An overlay opened by a deep link (or whose source was deleted) has no trigger to return focus to,
 * so ModalLayer leaves it on <body>. One frame later, put it on the source's row, else the title.
 * Callers run it from the overlay's unmount (preflight ruling 15), not right after router.replace:
 * the replace is a transition, so the overlay may still be mounted one frame later.
 */
export function focusSourceOrTitle(sourceId: number | null): void {
  focusNextFrame(() => (isFocusLost() ? fallbackTarget(sourceId) : null));
}

/**
 * D10: a source the wizard just created takes focus on its row even when ModalLayer gave focus
 * back to the wizard's trigger; one frame later, so it runs after that return.
 */
export function focusSource(sourceId: number): void {
  focusNextFrame(() => fallbackTarget(sourceId));
}
