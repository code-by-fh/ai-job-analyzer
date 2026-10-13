"use client";

import type { ReactNode } from "react";
import type { PhaseFilter } from "@/domain/applications";
import { phaseIndex } from "@/domain/jobStatus";
import { PHASE_LABEL } from "@/features/job/labels";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";

const HINT: Readonly<Record<PhaseFilter, MessageKey>> = {
  DRAFTED: "applications.hint.DRAFTED",
  APPLIED: "applications.hint.APPLIED",
  INTERVIEW: "applications.hint.INTERVIEW",
  OFFER: "applications.hint.OFFER",
  CLOSED: "applications.hint.CLOSED",
};

/**
 * RB7: the one class set that gives a phase its stage colour (--c, applications.css), for the
 * sections and the strip alike; no inline styles.
 */
export const STAGE_CLASS: Readonly<Record<PhaseFilter, string>> = {
  DRAFTED: "stage-drafted",
  APPLIED: "stage-applied",
  INTERVIEW: "stage-interview",
  OFFER: "stage-offer",
  CLOSED: "stage-closed",
};

const sectionTitleId = (phase: PhaseFilter) => `phase-${phase.toLowerCase()}`;

export function applicationCount(t: Translate, count: number): string {
  return count === 1 ? t("applications.countOne") : t("applications.count", { count });
}

export interface PhaseSectionProps {
  phase: PhaseFilter;
  count: number;
  children: ReactNode;
}

/** Prototype magHead: the phase's real position, large title, count and a one-line hint. */
export function PhaseSection({ phase, count, children }: PhaseSectionProps) {
  const { t } = useI18n();
  return (
    <section className={cx("mag", STAGE_CLASS[phase])} aria-labelledby={sectionTitleId(phase)}>
      <header className="mag-head">
        <span className="mag-no" aria-hidden="true">
          {phaseIndex(phase)}
        </span>
        <h2 className="mag-title" id={sectionTitleId(phase)}>
          {t(PHASE_LABEL[phase])}
        </h2>
        <SectionCount count={count} />
        <p className="mag-hint">{t(HINT[phase])}</p>
      </header>
      {children}
    </section>
  );
}

function SectionCount({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <span className="mag-count">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{applicationCount(t, count)}</span>
    </span>
  );
}
