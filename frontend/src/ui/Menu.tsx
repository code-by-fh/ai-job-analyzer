"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { Icon } from "./Icon";
import { isTopLayer, pushLayer } from "./layerStack";

export interface MenuItem<K extends string> {
  key: K;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface MenuButtonProps<K extends string> {
  buttonLabel: string;
  menuLabel: string;
  items: readonly MenuItem<K>[];
  onSelect: (key: K) => void;
  /** A selection is being carried out: the button stays focusable but does not open. */
  busy?: boolean;
}

const FOCUS_STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
const ITEM_SELECTOR = '[role="menuitemradio"]';

/** Roving focus inside the menu (WAI-ARIA menu pattern); null for keys the menu does not handle. */
export function menuFocusIndex(key: string, current: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = FOCUS_STEP[key];
  return step === undefined ? null : (current + step + count) % count;
}

/**
 * Menu button (decision D2): a short list of mutually exclusive commands. Arrow keys move,
 * Escape closes and returns focus to the button, Tab closes and moves on.
 */
export function MenuButton<K extends string>(props: MenuButtonProps<K>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };
  const trigger = { label: props.buttonLabel, menuId, open, buttonRef, setOpen, busy: props.busy };
  const { items, onSelect, menuLabel } = props;
  return (
    <div className="pop-anchor">
      <MenuTrigger {...trigger} />
      {open ? (
        <MenuList id={menuId} label={menuLabel} items={items} onSelect={onSelect} onClose={close} />
      ) : null}
    </div>
  );
}

interface MenuTriggerProps {
  label: string;
  menuId: string;
  open: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  setOpen: (open: boolean) => void;
  busy?: boolean;
}

function MenuTrigger({ label, menuId, open, buttonRef, setOpen, busy }: MenuTriggerProps) {
  const toggle = (next: boolean) => !busy && setOpen(next);
  return (
    <button
      ref={buttonRef}
      type="button"
      className="btn btn-sm"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={() => toggle(!open)}
      onKeyDown={(event) => openOnArrowDown(event, () => toggle(true))}
    >
      <span>{label}</span>
      <Icon icon={ChevronDown} />
    </button>
  );
}

function openOnArrowDown(event: ReactKeyboardEvent<HTMLButtonElement>, open: () => void): void {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  open();
}

interface MenuListProps<K extends string> {
  id: string;
  label: string;
  items: readonly MenuItem<K>[];
  onSelect: (key: K) => void;
  onClose: (returnFocus: boolean) => void;
}

/** Choosing returns focus to the button before the caller reacts, like Escape does. */
function closeThen<K extends string>(
  onClose: (returnFocus: boolean) => void,
  onSelect: (key: K) => void,
): (key: K) => void {
  return (key) => {
    onClose(true);
    onSelect(key);
  };
}

function MenuList<K extends string>({ id, label, items, onSelect, onClose }: MenuListProps<K>) {
  const choose = closeThen(onClose, onSelect);
  const listRef = useRef<HTMLDivElement>(null);
  useMenuLayer(listRef, onClose);
  return (
    <div
      ref={listRef}
      id={id}
      role="menu"
      aria-label={label}
      className="popover down-right anim-pop menu"
      onKeyDown={(event) => moveFocus(event, listRef.current)}
    >
      {items.map((item) => (
        <MenuEntry key={item.key} item={item} onSelect={choose} />
      ))}
    </div>
  );
}

interface MenuEntryProps<K extends string> {
  item: MenuItem<K>;
  onSelect: (key: K) => void;
}

function MenuEntry<K extends string>({ item, onSelect }: MenuEntryProps<K>) {
  return (
    <button
      type="button"
      role="menuitemradio"
      tabIndex={-1}
      className="pop-item"
      aria-checked={item.checked ?? false}
      aria-disabled={item.disabled || undefined}
      onClick={() => (item.disabled ? undefined : onSelect(item.key))}
    >
      <span>{item.label}</span>
      {item.checked ? <Icon icon={Check} className="pop-check" /> : null}
    </button>
  );
}

function menuItems(list: HTMLElement | null): HTMLElement[] {
  return list ? Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : [];
}

function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>, list: HTMLElement | null): void {
  const items = menuItems(list);
  const current = items.findIndex((item) => item === document.activeElement);
  const target = menuFocusIndex(event.key, current, items.length);
  if (target === null) return;
  event.preventDefault();
  items[target]?.focus();
}

function useMenuLayer(
  listRef: RefObject<HTMLDivElement | null>,
  onClose: (returnFocus: boolean) => void,
) {
  const close = useEffectEvent(onClose);
  useEffect(() => listenWhileOpen(listRef, close), [listRef]);
}

/** Registers the menu as top layer, focuses the checked item and closes on Escape, Tab or outside click. */
function listenWhileOpen(
  listRef: RefObject<HTMLDivElement | null>,
  close: (returnFocus: boolean) => void,
): () => void {
  const layer = pushLayer();
  const items = menuItems(listRef.current);
  (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  const onKey = menuKeyHandler(layer.id, close);
  const onPointer = outsidePointerHandler(listRef, close);
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", onPointer);
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", onPointer);
    layer.pop();
  };
}

function menuKeyHandler(layerId: symbol, close: (returnFocus: boolean) => void) {
  return (event: KeyboardEvent) => {
    if (!isTopLayer(layerId)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };
}

function outsidePointerHandler(
  listRef: RefObject<HTMLDivElement | null>,
  close: (returnFocus: boolean) => void,
) {
  return (event: MouseEvent) => {
    const anchor = listRef.current?.parentElement;
    if (anchor && event.target instanceof Node && !anchor.contains(event.target)) close(false);
  };
}
