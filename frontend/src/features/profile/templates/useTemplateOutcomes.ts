"use client";

import { useEffect, useRef } from "react";
import {
  templateOutcome,
  type TemplateCard,
  type TemplateOutcome,
  type TemplateState,
} from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useProfileAnnounce } from "../announcer";
import { cardName } from "./labels";

const OUTCOME_TEXT: Readonly<Record<TemplateOutcome, MessageKey>> = {
  ready: "profile.templates.outcome.ready",
  rejected: "profile.templates.outcome.rejected",
  failed: "profile.templates.outcome.failed",
};

/**
 * D13: announces each card that left the AI fill since this gallery last saw it, once; the first
 * load announces nothing. The previous states live in a ref read only in the effect, and the
 * announcer is an external store, so no React state is set in the effect body.
 */
export function useTemplateOutcomes(cards: readonly TemplateCard[]): void {
  const { t } = useI18n();
  const announce = useProfileAnnounce();
  const seen = useRef(new Map<string, TemplateState>());
  useEffect(() => {
    for (const card of cards) {
      const outcome = templateOutcome(seen.current.get(card.ref), card.state);
      if (outcome) announce(t(OUTCOME_TEXT[outcome], { name: cardName(card, t) }));
      seen.current.set(card.ref, card.state);
    }
  }, [cards, announce, t]);
}
