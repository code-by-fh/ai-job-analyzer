"use client";

import { useState } from "react";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useClearThenSet } from "@/ui/useAnnouncement";
import { useActiveApplications, useClosedTotal } from "./useApplicationLists";

function foundText(t: Translate, count: number): string {
  if (count === 0) return t("applications.search.foundNone");
  return count === 1
    ? t("applications.search.foundOne")
    : t("applications.search.found", { count });
}

/** The settled answer for the search, or "" while it is not known yet (never a kept previous one). */
function useFoundText(q: string): string {
  const { t } = useI18n();
  const list = useActiveApplications(q);
  const closed = useClosedTotal(q);
  const settled =
    q !== "" &&
    list.data !== undefined &&
    !list.isPlaceholderData &&
    closed.data !== undefined &&
    !closed.isPlaceholderData;
  return settled ? foundText(t, (list.data?.pages[0]?.total ?? 0) + (closed.data ?? 0)) : "";
}

/** Once a search was active, an empty one means the user cleared it. */
function useClearedText(q: string): string {
  const { t } = useI18n();
  const [searched, setSearched] = useState(q !== "");
  if (q !== "" && !searched) setSearched(true);
  return q === "" && searched ? t("applications.search.cleared") : "";
}

/**
 * Decision D15: the page's one live region. It is mounted with the page and only its text changes.
 * Each query is announced once, when its answer settled: the text is empty until then and for a
 * short gap after every change, so repeating an earlier text still counts as a change.
 */
export function SearchStatus({ q }: { q: string }) {
  const found = useFoundText(q);
  const cleared = useClearedText(q);
  const target = found || cleared;
  const ready = useClearThenSet(`${q}|${target}`);
  return (
    <p className="sr-only" role="status">
      {ready ? target : ""}
    </p>
  );
}
