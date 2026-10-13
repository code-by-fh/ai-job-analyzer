"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";

/** The step's foot: Zurück on the left when there is a step before, the step's action on the right. */
export function StepFoot({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={cx("panel-foot", !onBack && "panel-foot-end")}>
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          {t("sources.wizard.back")}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
