"use client";

import type { SetupStatus } from "@/api/setup";
import { useI18n } from "@/i18n/useI18n";
import { Notice } from "@/ui/Notice";
import { AiSetupAction } from "./AiSetupAction";

/**
 * Decision D6: jobs exist, so no onboarding; but new ones would not be scored (a warning, amber).
 * The user is loaded only inside this branch (pre-flight ruling 4).
 */
export function AiMissingNotice({ status }: { status: SetupStatus | undefined }) {
  const { t } = useI18n();
  if (!status || status.ai_configured) return null;
  return (
    <div className="ai-missing">
      <Notice tone="warn">
        {t("inbox.aiMissing")} <AiSetupAction className="link" />
      </Notice>
    </div>
  );
}
