"use client";

import { RotateCcw } from "lucide-react";
import { describeError } from "@/api/describeError";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";

/** Error state with retry (spec 6: message plus retry, never raw server text). */
export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <Notice tone="error">{describeError(error, t)}</Notice>
      <Button className="mt-4" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
