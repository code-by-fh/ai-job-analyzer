"use client";

import { useState } from "react";
import type { JobDetail } from "@/api/jobs";
import { fromDateInputValue } from "@/domain/calendar";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { useOptimisticWrite } from "../useOptimisticWrite";

/** The stored day "YYYY-MM-DD" as an instant on that local day, for the date formatters. */
function startInstant(day: string): string | null {
  return fromDateInputValue(day)?.toISOString() ?? null;
}

function useStartHint(day: string): string {
  const { t } = useI18n();
  const format: JobFormat = useJobFormat();
  const instant = startInstant(day);
  if (!instant) return t("firstDay.startEmpty");
  return t("firstDay.startHint", {
    date: format.date(instant),
    relative: format.relativeDays(instant),
  });
}

function useStartDate(job: JobDetail) {
  const write = useOptimisticWrite(job, "start_date");
  const [draft, setDraft] = useState(job.start_date ?? "");
  const change = (value: string) => {
    setDraft(value);
    if (fromDateInputValue(value)) write(() => value);
  };
  const clearIfEmpty = () => {
    if (draft === "" && job.start_date) write(() => null);
  };
  return { draft, change, clearIfEmpty };
}

/**
 * First working day (T14). A complete date saves at once; an emptied field clears the day on blur,
 * so a half-typed date (the browser reports "" meanwhile) never clears a stored one.
 */
export function StartDateField({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const { draft, change, clearIfEmpty } = useStartDate(job);
  // The hint follows the field, so a picked day is named before the save returns.
  const hint = useStartHint(draft);
  return (
    <TextField
      id="start-date"
      type="date"
      label={t("firstDay.startLabel")}
      hint={hint}
      value={draft}
      onChange={(event) => change(event.target.value)}
      onBlur={clearIfEmpty}
    />
  );
}
