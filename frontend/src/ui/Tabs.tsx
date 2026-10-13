"use client";

import { centerInStrip } from "./scrollStrip";
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Shown after the label, e.g. a count; part of the tab's accessible name. */
  suffix?: ReactNode;
}

export interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
  label: string;
  idPrefix: string;
}

const ARROW_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };
/** Id of one tab of a tab set, e.g. to move focus to it after a switch from elsewhere. */
export const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
/** Id of the TabPanel of a tab set, e.g. to move focus into the panel. */
export const panelId = (prefix: string) => `${prefix}-panel`;

/** Roving focus for the WAI-ARIA tabs pattern; null for keys the tablist does not handle. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = ARROW_STEP[key];
  return step === undefined ? null : (current + step + count) % count;
}

export function Tabs<K extends string>(props: TabsProps<K>) {
  const { items, selected, onSelect, label, idPrefix } = props;
  const { listRef, onKeyDown } = useTabKeyboard(items, selected, onSelect);
  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <TabButton
          key={item.key}
          item={item}
          selected={item.key === selected}
          idPrefix={idPrefix}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function useTabKeyboard<K extends string>(
  items: readonly TabItem<K>[],
  selected: K,
  onSelect: (key: K) => void,
) {
  const listRef = useRef<HTMLDivElement>(null);
  useRevealSelected(listRef, items, selected);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.key === selected);
    const target = nextTabIndex(event.key, current, items.length);
    if (target === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    onSelect(items[target].key);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  };
  return { listRef, onKeyDown };
}

/** A tab chosen by click or by a restored URL must also be scrolled into view on mobile. */
function useRevealSelected<K extends string>(
  listRef: RefObject<HTMLDivElement | null>,
  items: readonly TabItem<K>[],
  selected: K,
): void {
  useEffect(() => {
    const index = items.findIndex((item) => item.key === selected);
    centerInStrip(listRef.current, listRef.current?.querySelectorAll('[role="tab"]')[index]);
  }, [listRef, items, selected]);
}

interface TabButtonProps<K extends string> {
  item: TabItem<K>;
  selected: boolean;
  idPrefix: string;
  onSelect: (key: K) => void;
}

function TabButton<K extends string>({ item, selected, idPrefix, onSelect }: TabButtonProps<K>) {
  return (
    <button
      type="button"
      role="tab"
      className="tab"
      id={tabId(idPrefix, item.key)}
      aria-selected={selected}
      aria-controls={panelId(idPrefix)}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(item.key)}
    >
      {item.label}
      {item.suffix ? <> {item.suffix}</> : null}
    </button>
  );
}

interface TabPanelProps {
  idPrefix: string;
  selected: string;
  children: ReactNode;
}

export function TabPanel({ idPrefix, selected, children }: TabPanelProps) {
  const labelledBy = tabId(idPrefix, selected);
  return (
    <div
      className="tabpanel"
      role="tabpanel"
      tabIndex={0}
      id={panelId(idPrefix)}
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
}
