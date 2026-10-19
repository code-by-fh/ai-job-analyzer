"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx";
import { isTopLayer, pushLayer } from "./layerStack";

/** "dock": fixed to the viewport (shell.css places it), for a panel too big for its anchor. */
export type PopoverPlacement = "up" | "down-right" | "dock";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  placement: PopoverPlacement;
  label: string;
  children: ReactNode;
}

/** Non-modal panel anchored to its parent `.pop-anchor`, which also contains the trigger. */
export function Popover({ open, onClose, placement, label, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onClose);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={cx("popover", "anim-pop", placement)}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function useDismiss(
  ref: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useEffectEvent(onClose);
  useEffect(() => (open ? listenForDismiss(ref, close) : undefined), [open, ref]);
}

function listenForDismiss(ref: RefObject<HTMLDivElement | null>, close: () => void): () => void {
  const layer = pushLayer();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // The anchor includes the trigger, so clicking the trigger toggles instead of closing twice.
  const onPointer = (event: MouseEvent) => {
    const anchor = ref.current?.parentElement;
    if (anchor && event.target instanceof Node && !anchor.contains(event.target)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !isTopLayer(layer.id)) return;
    restoreFocus(opener, ref.current);
    close();
  };
  document.addEventListener("mousedown", onPointer);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onPointer);
    document.removeEventListener("keydown", onKey);
    layer.pop();
  };
}

/** Escape hands focus back to what had it when the popover opened, else to the anchor's first control. */
function restoreFocus(opener: HTMLElement | null, popover: HTMLElement | null): void {
  if (opener?.isConnected && opener !== document.body && !popover?.contains(opener)) {
    opener.focus();
    return;
  }
  const fallback = popover?.parentElement?.querySelector<HTMLElement>(
    "button, a[href], [tabindex]",
  );
  fallback?.focus();
}
