"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { activeApplicationCount, jobCountsQueryOptions } from "@/api/jobs";
import { navNumber } from "@/features/shell/navigation";
import { useDueCount } from "@/features/shell/useDueCount";
import { useI18n } from "@/i18n/useI18n";
import { Masthead } from "@/ui/Masthead";

const DECK_SEPARATOR = " · ";

/** Spec 4.2: "n aktiv · m fällig" plus (Task 6) the search in the actions slot. */
export function ApplicationsHeader({ actions }: { actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Masthead
      number={navNumber("applications")}
      title={t("nav.applications")}
      deck={<Deck />}
      actions={actions}
    />
  );
}

/**
 * Over all applications: the search narrows the list, not this summary. Each part shows once its
 * query answered, so a failed one hides only its own part (decision D11). The deck line keeps its
 * height meanwhile (applications.css), so nothing below jumps.
 */
function Deck() {
  const { t } = useI18n();
  const counts = useQuery(jobCountsQueryOptions());
  const due = useDueCount();
  const active = counts.data
    ? t("applications.deck.active", { count: activeApplicationCount(counts.data) })
    : null;
  const dueText = due === null ? null : t("nav.due", { count: due });
  return (
    <>
      {active ? <b>{active}</b> : null}
      {active && dueText ? DECK_SEPARATOR : null}
      {dueText}
    </>
  );
}
