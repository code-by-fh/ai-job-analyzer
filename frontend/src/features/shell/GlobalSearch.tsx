"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { SEARCH_LIMITS } from "@/api/adminPaths";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Dialog } from "@/ui/Dialog";
import { TextField } from "@/ui/Field";
import { closeThenFocus, isFocusLost } from "@/ui/focus";
import { PanelHeader } from "@/ui/PanelHeader";
import { SearchResults } from "./search/SearchResults";
import { useResultKeys } from "./search/useResultKeys";
import { useSearchResults, type SearchResults as Results } from "./search/useSearchResults";

const SEARCH_SHORTCUT_KEY = "/";
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const OPEN_SEARCH_EVENT = "app:open-search";
const CONTENT_EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';
// AppShell's <main>: where focus lands when the dialog closes and the page had none focused.
const MAIN_ID = "main";

/** <main> when the dialog's own focus return found nothing to go back to (focus never on body). */
const mainIfLost = () => (isFocusLost() ? document.getElementById(MAIN_ID) : null);

/** True for elements where "/" must type a slash instead of opening search. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.closest(CONTENT_EDITABLE_SELECTOR) !== null;
}

/** Lets controls without the "/" key (the mobile "Mehr" sheet) open the same dialog. */
export function requestSearch(): void {
  document.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** Spec 4.1, D10: "/" opens a dialog that searches the user's jobs and companies. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  useSlashShortcut(() => setOpen(true));
  // Escape, X, scrim and a followed link: "/" pressed on the page leaves the dialog nothing to
  // return focus to, so every close falls back to <main> (4.18).
  const close = () => closeThenFocus(() => setOpen(false), mainIfLost);
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={close} label={t("search.label")}>
      <SearchPanel onClose={close} />
    </Dialog>
  );
}

/**
 * Lives inside the dialog, so closing unmounts it and clears the text (ruling 29). Following a
 * link closes the dialog; the link itself navigates.
 */
function SearchPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useResultKeys(panelRef);
  const search = useSearchResults(text);
  return (
    <div ref={panelRef} className="panel-in search-panel" onKeyDown={onKeyDown}>
      <PanelHeader title={t("search.label")} onClose={onClose} />
      <SearchField text={text} onChange={setText} short={search.state === "short"} />
      <p className="meta muted search-status" role="status">
        {statusText(search, t)}
      </p>
      <SearchBody search={search} onNavigate={onClose} />
    </div>
  );
}

interface SearchFieldProps {
  text: string;
  onChange: (text: string) => void;
  /** Under two characters: the hint asks for more (and no request goes out). */
  short: boolean;
}

function SearchField({ text, onChange, short }: SearchFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id="global-search"
      type="search"
      label={t("search.inputLabel")}
      autoComplete="off"
      maxLength={SEARCH_LIMITS.max}
      value={text}
      onChange={(event) => onChange(event.target.value)}
      hint={short ? t("search.hint") : undefined}
      data-autofocus
    />
  );
}

/** The live line: the hit count, or that nothing matched; empty until an answer is there. */
function statusText({ state, result, query }: Results, t: Translate): string {
  if (state !== "ready" || !result) return "";
  const count = result.jobs.length + result.companies.length;
  if (count === 0) return t("search.none", { q: query });
  return count === 1 ? t("search.foundOne") : t("search.found", { count });
}

function SearchBody({ search, onNavigate }: { search: Results; onNavigate: () => void }) {
  if (search.state === "loading") return <ListLoading stalled={false} />;
  if (search.state === "error") return <ListError error={search.error} onRetry={search.retry} />;
  if (search.state === "ready" && search.result) {
    return <SearchResults result={search.result} onNavigate={onNavigate} />;
  }
  return null;
}

function isSearchShortcut(event: KeyboardEvent): boolean {
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  const ignored = modified || event.defaultPrevented || event.isComposing || event.repeat;
  return event.key === SEARCH_SHORTCUT_KEY && !ignored && !isTypingTarget(event.target);
}

function useSlashShortcut(onTrigger: () => void): void {
  const trigger = useEffectEvent(onTrigger);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      trigger();
    };
    const open = () => trigger();
    document.addEventListener("keydown", listener);
    document.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => {
      document.removeEventListener("keydown", listener);
      document.removeEventListener(OPEN_SEARCH_EVENT, open);
    };
  }, []);
}
