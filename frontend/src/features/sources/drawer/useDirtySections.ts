"use client";

import { useCallback, useEffect, useState } from "react";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";

/** How a drawer section tells the drawer whether it holds unsaved edits. */
export type ReportDirty = (section: string, dirty: boolean) => void;

function toggled(
  sections: ReadonlySet<string>,
  section: string,
  dirty: boolean,
): ReadonlySet<string> {
  if (sections.has(section) === dirty) return sections;
  const next = new Set(sections);
  if (dirty) next.add(section);
  else next.delete(section);
  return next;
}

/** One unsaved flag for all sections of the drawer (D5); it drives the leave dialog and the unload warning. */
export function useDirtySections(): { report: ReportDirty; requestLeave: () => Promise<boolean> } {
  const { setDirty, requestLeave } = useUnsavedChanges();
  const [sections, setSections] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback<ReportDirty>(
    (section, dirty) => setSections((current) => toggled(current, section, dirty)),
    [],
  );
  useEffect(() => setDirty(sections.size > 0), [sections, setDirty]);
  // A closed (or deleted) drawer holds nothing unsaved any more.
  useEffect(() => () => setDirty(false), [setDirty]);
  return { report, requestLeave };
}
