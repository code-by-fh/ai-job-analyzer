"use client";

import { useMemo } from "react";
import { formatDate, formatDateTime, formatRelativeDays } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";

export interface JobFormat {
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
  /** "heute", "seit 3 Tagen", "in 2 Tagen". */
  relativeDays: (iso: string) => string;
}

/** The one place the job page touches the i18n date helpers. */
export function useJobFormat(): JobFormat {
  const { language, t } = useI18n();
  const now = useNow();
  return useMemo(
    () => ({
      date: (iso) => formatDate(iso, language),
      dateTime: (iso) => formatDateTime(iso, language),
      relativeDays: (iso) => formatRelativeDays(iso, t, { now }),
    }),
    [language, t, now],
  );
}
