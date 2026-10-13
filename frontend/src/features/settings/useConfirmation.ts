"use client";

import { useState } from "react";
import { closeThenFocus } from "@/ui/focus";

/** One confirmation question of Einstellungen (Konto, Systemfehler); after a confirmed action the opener takes focus back. */
export function useConfirmation(openerId: string) {
  const [open, setOpen] = useState(false);
  const done = () =>
    closeThenFocus(
      () => setOpen(false),
      () => document.getElementById(openerId),
    );
  return { open, ask: () => setOpen(true), cancel: () => setOpen(false), done };
}
