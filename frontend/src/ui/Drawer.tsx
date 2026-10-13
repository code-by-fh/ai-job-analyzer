"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalLayer } from "./ModalLayer";

export type DrawerVariant = "wide" | "narrow" | "sheet";

// "sheet" is the mobile bottom sheet of the prototype's "Mehr" menu.
const DRAWER_CLASS: Record<DrawerVariant, string> = {
  wide: "drawer anim-drawer",
  narrow: "drawer narrow anim-drawer",
  sheet: "drawer sheet anim-pop",
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  variant?: DrawerVariant;
  children: ReactNode;
}

export function Drawer({ open, onClose, label, variant = "wide", children }: DrawerProps) {
  if (!open) return null;
  return createPortal(
    <ModalLayer className={DRAWER_CLASS[variant]} label={label} onClose={onClose}>
      {children}
    </ModalLayer>,
    document.body,
  );
}
