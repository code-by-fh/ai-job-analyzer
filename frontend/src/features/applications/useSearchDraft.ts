"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { searchFromParam } from "@/domain/applications";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { ApplicationsUrl } from "./useApplicationsUrl";

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_INPUT_ID = "applications-search";

export interface SearchDraft {
  value: string;
  setValue: (value: string) => void;
  /** Clears field and URL and keeps focus in the field (decision D14). */
  reset: () => void;
}

/**
 * What the field wrote whose answer (the URL change) has not arrived yet, oldest first, trimmed.
 * The router answers late and in order: an arriving value is the field's own echo when it is in
 * this list; that echo and every older entry are done and the draft stays as typed. Any other
 * value came from outside (Back, a nav link) and replaces the draft (RB19).
 */
function usePendingCommits(urlQ: string, adopt: (q: string) => void) {
  const pending = useRef<string[]>([]);
  const onUrlChange = useEffectEvent((q: string) => {
    const index = pending.current.indexOf(q);
    if (index >= 0) pending.current.splice(0, index + 1);
    else {
      pending.current = [];
      adopt(q);
    }
  });
  useEffect(() => onUrlChange(urlQ), [urlQ]);
  /** Writes through `write` unless the URL already is (or will be) this search. */
  return (next: string, write: (q: string) => void): void => {
    const trimmed = searchFromParam(next);
    if (trimmed === (pending.current.at(-1) ?? urlQ)) return;
    pending.current.push(trimmed);
    write(next);
  };
}

/**
 * Decision D3: the field is typed into freely; the URL, and with it the one request, follows once
 * the value settled. Only a settled change that differs from the URL is written.
 */
export function useSearchDraft(url: ApplicationsUrl): SearchDraft {
  const [value, setValue] = useState(url.q);
  const settled = useDebouncedValue(value, SEARCH_DEBOUNCE_MS);
  const commit = usePendingCommits(url.q, setValue);
  const settle = useEffectEvent((next: string) => commit(next, url.setSearch));
  useEffect(() => settle(settled), [settled]);
  const reset = () => {
    setValue("");
    commit("", url.setSearch);
    document.getElementById(SEARCH_INPUT_ID)?.focus();
  };
  return { value, setValue, reset };
}
