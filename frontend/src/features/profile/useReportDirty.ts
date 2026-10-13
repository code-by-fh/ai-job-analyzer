"use client";

import { useEffect } from "react";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";

/** Only the open section is mounted: when the user leaves it (after the leave question), its flag goes. */
export function useReportDirty(report: ReportDirty, section: string, dirty: boolean): void {
  useEffect(() => report(section, dirty), [report, section, dirty]);
  useEffect(() => () => report(section, false), [report, section]);
}
