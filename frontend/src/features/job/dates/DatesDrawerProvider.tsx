"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { closeThenFocus, isFocusLost } from "@/ui/focus";
import { DatesDrawer, type DatesFocus } from "./DatesDrawer";

/** DOM id of the "Termine & Daten" edit button, where focus goes when the opener is gone. */
export const DATES_EDIT_ID = "dates-edit";

type OpenDates = (focus?: DatesFocus) => void;

const OpenDatesContext = createContext<OpenDates | null>(null);

/**
 * Owns the one "Termine & Daten" drawer of the job page, so the card's edit button and
 * "Einladung eintragen" (Feedback 1 T13) open the same drawer.
 */
export function DatesDrawerProvider({ job, children }: { job: JobDetail; children: ReactNode }) {
  const [open, setOpen] = useState<{ focus?: DatesFocus } | null>(null);
  // The opener can be gone: "Einladung eintragen" disappears with the status change it made.
  const close = () =>
    closeThenFocus(
      () => setOpen(null),
      () => (isFocusLost() ? document.getElementById(DATES_EDIT_ID) : null),
    );
  return (
    <OpenDatesContext value={(focus) => setOpen({ focus })}>
      {children}
      {open ? <DatesDrawer job={job} focus={open.focus} onClose={close} /> : null}
    </OpenDatesContext>
  );
}

/** Opens the drawer, optionally on one field instead of the first. */
export function useOpenDates(): OpenDates {
  const openDates = useContext(OpenDatesContext);
  if (!openDates) throw new Error("useOpenDates needs a DatesDrawerProvider");
  return openDates;
}
