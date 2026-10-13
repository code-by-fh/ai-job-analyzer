"use client";

import Link from "next/link";
import { AI_SETTINGS_HREF } from "@/features/shell/navigation";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useI18n } from "@/i18n/useI18n";

/**
 * The way to an AI provider: only admins can configure it (admin settings, phase 7); everyone else
 * is asked to turn to the administration. Renders nothing until the user is known, so an admin
 * never sees the "ask the administration" sentence flash first.
 */
export function AiSetupAction({ className }: { className: string }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  if (!user.data) return null;
  if (!user.data.is_admin) return <span className="meta">{t("onboard.ai.askAdmin")}</span>;
  return (
    <Link className={className} href={AI_SETTINGS_HREF}>
      {t("onboard.ai.action")}
    </Link>
  );
}
