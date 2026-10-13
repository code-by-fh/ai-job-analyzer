"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from "react";

import { isTopLayer, pushLayer } from "./layerStack";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
const HIDDEN_SELECTOR = '[hidden], [inert], [aria-hidden="true"]';
const AUTOFOCUS_SELECTOR = "[data-autofocus]";

export interface ModalLayerProps {
  className: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Scrim plus modal panel: focus moves in, Tab is trapped, Escape and the scrim close it. */
export function ModalLayer({ className, label, onClose, children }: ModalLayerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehaviour(panelRef, onClose);
  return (
    <>
      <div className="scrim anim-fade" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}

function useModalBehaviour(panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) =>
    handleModalKey(event, panelRef.current, onClose),
  );
  useEffect(() => enterModal(panelRef.current, onKeyDown), [panelRef]);
}

/** Locks scroll, moves focus in and listens for keys; the returned cleanup undoes all of it. */
function enterModal(
  panel: HTMLElement | null,
  onKeyDown: (event: KeyboardEvent) => void,
): () => void {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const restoreScroll = lockBodyScroll();
  const layer = pushLayer();
  focusInitial(panel);
  const listener = (event: KeyboardEvent) => {
    if (isTopLayer(layer.id)) onKeyDown(event);
  };
  document.addEventListener("keydown", listener);
  return () => {
    document.removeEventListener("keydown", listener);
    layer.pop();
    restoreScroll();
    returnFocus?.focus();
  };
}

/** Visible, enabled, tabbable descendants of the panel. */
function focusableItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.closest(HIDDEN_SELECTOR) && el.checkVisibility?.({ visibilityProperty: true }) !== false,
  );
}

/** Wraps Tab and Shift+Tab at the panel edges and pulls stray focus back in. */
function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = focusableItems(panel);
  if (items.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const wrapToFirst = !event.shiftKey && active === last;
  const wrapToLast = event.shiftKey && active === first;
  if (!wrapToFirst && !wrapToLast && panel.contains(active)) return;
  event.preventDefault();
  (wrapToLast ? last : first).focus();
}

function handleModalKey(
  event: KeyboardEvent,
  panel: HTMLElement | null,
  onClose: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key === "Tab" && panel) trapTab(event, panel);
}

function focusInitial(panel: HTMLElement | null): void {
  if (!panel) return;
  const preferred =
    panel.querySelector<HTMLElement>(AUTOFOCUS_SELECTOR) ?? focusableItems(panel)[0];
  (preferred ?? panel).focus();
}

let scrollLocks = 0;
let scrollBeforeLock = "";

/** Reference-counted, so stacked layers unmounting in any order restore the original value. */
function lockBodyScroll(): () => void {
  if (scrollLocks === 0) scrollBeforeLock = document.body.style.overflow;
  scrollLocks += 1;
  document.body.style.overflow = "hidden";
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = scrollBeforeLock;
  };
}
