"use client";

import type { DriveCallback } from "@/domain/settings";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";
import { useClearThenSet } from "@/ui/useAnnouncement";

const CALLBACK_TEXT: Readonly<Record<DriveCallback, MessageKey>> = {
  connected: "settings.storage.callbackConnected",
  failed: "settings.storage.callbackFailed",
};
const NO_OUTCOME = "none";

/**
 * The OAuth callback's outcome as fixed text (the URL carries fixed values only, R10). The live
 * region is mounted empty and the notice appears after the clear-then-set gap, so it is announced
 * exactly once; the notice itself therefore does not announce (no second alert).
 */
export function DriveCallbackNotice({ outcome }: { outcome: DriveCallback | null }) {
  const { t } = useI18n();
  const shown = useClearThenSet(outcome ?? NO_OUTCOME);
  return (
    <div role="status" className="settings-callback">
      {outcome && shown ? (
        <Notice tone={outcome === "failed" ? "error" : "info"} announce={false}>
          {t(CALLBACK_TEXT[outcome])}
        </Notice>
      ) : null}
    </div>
  );
}
