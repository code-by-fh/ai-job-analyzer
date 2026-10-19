"use client";

import { Plus } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { failingSources } from "@/domain/sources";
import { navNumber } from "@/features/shell/navigation";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Masthead } from "@/ui/Masthead";
import { PROFILE_REQUIRED_ID, useProfileMissing } from "./profileGate";

/** D14 deck: how many sources, and how many of them failed (the banner's rule, D3). */
function sourcesDeck(platforms: readonly Platform[], t: Translate): string {
  const count = platforms.length;
  const failing = failingSources(platforms).length;
  if (count === 0) return t("sources.deck.none");
  if (failing === 0) {
    return count === 1 ? t("sources.deck.fineOne") : t("sources.deck.fine", { count });
  }
  return count === 1 ? t("sources.deck.failingOne") : t("sources.deck.failing", { count, failing });
}

interface SourcesHeaderProps {
  platforms?: readonly Platform[];
  onAdd: () => void;
}

export function SourcesHeader({ platforms, onAdd }: SourcesHeaderProps) {
  const { t } = useI18n();
  // While loading, "Lädt …" holds the deck's line, so nothing jumps when the list arrives.
  const deck = platforms ? <b>{sourcesDeck(platforms, t)}</b> : t("loading");
  const action = <AddButton onAdd={onAdd} />;
  return (
    <Masthead number={navNumber("sources")} title={t("nav.sources")} deck={deck} actions={action} />
  );
}

/** Inactive without a profile (the notice below says why); still focusable. */
export function AddButton({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const blocked = useProfileMissing();
  return (
    <Button
      variant="primary"
      icon={Plus}
      inactive={blocked}
      aria-describedby={blocked ? PROFILE_REQUIRED_ID : undefined}
      onClick={onAdd}
    >
      {t("onboard.source.action")}
    </Button>
  );
}
