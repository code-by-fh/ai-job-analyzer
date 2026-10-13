"use client";

import { TriangleAlert } from "lucide-react";
import type { TemplateState } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";

export const TEMPLATE_STATE_TEXT: Readonly<Record<Exclude<TemplateState, "ready">, MessageKey>> = {
  processing: "profile.templates.state.processingNotYet",
  stalled: "profile.templates.state.stalled",
  rejected: "profile.templates.state.rejected",
  failed: "profile.templates.state.failed",
};

/**
 * Static text (no spinner, spec 5). Ruling R17: a filling card shows one line, which also says why
 * it cannot be the default yet. The degraded states are amber warnings with an icon (D10): they
 * stay usable, so they are never shown as errors.
 */
export function TemplateStateLine({ state }: { state: TemplateState }) {
  const { t } = useI18n();
  if (state === "ready") return null;
  if (state === "processing")
    return <p className="tpl-state">{t(TEMPLATE_STATE_TEXT.processing)}</p>;
  return (
    <p className="tpl-state is-warn">
      <Icon icon={TriangleAlert} />
      <span>{t(TEMPLATE_STATE_TEXT[state])}</span>
    </p>
  );
}
