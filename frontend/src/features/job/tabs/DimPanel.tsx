"use client";

import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import type { DimReason } from "./jobTabs";

export function DimPanel({ reason, onOpen }: { reason: DimReason; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div className="dim-panel">
      <h3>{t(`dim.${reason}.title`)}</h3>
      <p>{t(`dim.${reason}.text`)}</p>
      <div className="row">
        <Button size="sm" onClick={onOpen}>
          {t("dim.open")}
        </Button>
      </div>
    </div>
  );
}
