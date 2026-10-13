"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalLayer } from "./ModalLayer";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Centred modal (global search, confirmations). Only rendered on the client after interaction. */
export function Dialog({ open, onClose, label, children }: DialogProps) {
  if (!open) return null;
  return createPortal(
    <ModalLayer className="dialog anim-pop" label={label} onClose={onClose}>
      {children}
    </ModalLayer>,
    document.body,
  );
}
