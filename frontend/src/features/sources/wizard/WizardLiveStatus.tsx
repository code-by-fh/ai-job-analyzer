"use client";

import { useI18n } from "@/i18n/useI18n";
import { useClearThenSet } from "@/ui/useAnnouncement";

/**
 * The wizard's own live region: the drawer is modal, so the page's region outside it is not read.
 * Mounted with the wizard, never conditionally. It says once that a check started (each start
 * clears, then sets, so a second check is read again) and goes quiet when the check settles; the
 * result speaks for itself (a field alert, or the next step taking focus).
 */
export function WizardLiveStatus({ started, checking }: { started: number; checking: boolean }) {
  const { t } = useI18n();
  const ready = useClearThenSet(started);
  return (
    <p role="status" className="sr-only">
      {checking && ready ? t("sources.wizard.checking") : ""}
    </p>
  );
}
