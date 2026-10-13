import type { ReactNode } from "react";

export interface ChipProps {
  /** For a form that moves focus to the chip, e.g. onto a group with an error. */
  id?: string;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Toggle pill for filters (e.g. phase strip, spoken languages). */
export function Chip({ id, pressed, onToggle, children }: ChipProps) {
  return (
    <button type="button" id={id} className="chip" aria-pressed={pressed} onClick={onToggle}>
      {children}
    </button>
  );
}
