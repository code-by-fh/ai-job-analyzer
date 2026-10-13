"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface DisclosureProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode (state in the URL): the parent owns `open` and hears every toggle. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type OpenState = Pick<DisclosureProps, "defaultOpen" | "open" | "onOpenChange">;

/** Controlled only when `open` is given; a listener alone does not take the state over. */
function useOpenState({ defaultOpen = false, open, onOpenChange }: OpenState) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const shown = open ?? ownOpen;
  const toggle = () => {
    if (open === undefined) setOwnOpen(!shown);
    onOpenChange?.(!shown);
  };
  return { shown, toggle };
}

/** Show/hide region (prototype .disclosure); the region stays in the DOM so aria-controls resolves. */
export function Disclosure({ label, children, ...state }: DisclosureProps) {
  const { shown, toggle } = useOpenState(state);
  const regionId = useId();
  return (
    <div className="disclosure-block">
      <DisclosureToggle label={label} open={shown} regionId={regionId} onToggle={toggle} />
      <div id={regionId} className="disclosure-body" hidden={!shown}>
        {children}
      </div>
    </div>
  );
}

interface DisclosureToggleProps {
  label: string;
  open: boolean;
  regionId: string;
  onToggle: () => void;
}

function DisclosureToggle({ label, open, regionId, onToggle }: DisclosureToggleProps) {
  return (
    <button
      type="button"
      className="disclosure"
      aria-expanded={open}
      aria-controls={regionId}
      onClick={onToggle}
    >
      <Icon icon={ChevronRight} />
      {label}
    </button>
  );
}
