"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { ModalLayer } from "./ModalLayer";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Extra class on the panel, e.g. a larger viewer variant. */
  className?: string;
  children: ReactNode;
}

/** Centred modal (global search, confirmations). Only rendered on the client after interaction. */
export function Dialog({ open, onClose, label, className, children }: DialogProps) {
  if (!open) return null;
  return createPortal(
    <ModalLayer className={cx("dialog anim-pop", className)} label={label} onClose={onClose}>
      {children}
    </ModalLayer>,
    document.body,
  );
}
