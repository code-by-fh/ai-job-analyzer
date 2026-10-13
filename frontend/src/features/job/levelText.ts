"use client";

import { levelKey } from "@/domain/levels";
import { useI18n } from "@/i18n/useI18n";

export type LevelLabelKey =
  | "prep.severity"
  | "prep.confidence"
  | "company.confidence"
  | "company.probability"
  | "company.impact";

/**
 * Raw AI enums are never shown (spec 6): a known level reads "Label: Mittel"; an unknown one is
 * shown as its raw text without the label, never hidden. Null for an empty value.
 */
export function useLevelText() {
  const { t } = useI18n();
  return (value: string | null | undefined, labelKey: LevelLabelKey): string | null => {
    if (!value) return null;
    const key = levelKey(value);
    return key ? t(labelKey, { level: t(`level.${key}`) }) : value;
  };
}
