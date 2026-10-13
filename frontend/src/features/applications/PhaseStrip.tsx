"use client";

import { PHASE_FILTERS, stripCounts, tickCount, type PhaseFilter } from "@/domain/applications";
import { phaseIndex } from "@/domain/jobStatus";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";
import { PHASE_LABEL } from "@/features/job/labels";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { applicationCount, STAGE_CLASS } from "./PhaseSection";
import { settledClosedCount, useClosedTotal, usePhaseGroups } from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

type StripCounts = Record<PhaseFilter, number>;

const stripButtonId = (phase: PhaseFilter) => `strip-${phase.toLowerCase()}`;

/**
 * D14: the "show all" button leaves with the filter, so focus moves to that phase's strip button.
 * Without the strip (RB14) the page title takes it, so focus never falls to the body.
 */
export function showAllPhases(url: ApplicationsUrl, phase: PhaseFilter): void {
  url.setPhase(null);
  const target =
    document.getElementById(stripButtonId(phase)) ??
    document.querySelector<HTMLElement>(MASTHEAD_TITLE_SELECTOR);
  target?.focus();
}

/** Null until the rows and the closed count are known, or the count was given up on (RB13). */
function useStripCounts(q: string): StripCounts | null {
  const groups = usePhaseGroups(q);
  const closed = settledClosedCount(useClosedTotal(q));
  return groups && closed !== undefined ? stripCounts(groups, closed) : null;
}

const sum = (counts: StripCounts) =>
  PHASE_FILTERS.reduce((total, phase) => total + counts[phase], 0);

/**
 * Decision D4: the phase overview is the only phase filter; pressing the pressed phase shows all.
 * While the counts load, and while the list shows its error (SC6, accepted), a placeholder keeps
 * the strip's height; it has no role, so nothing is announced.
 */
export function PhaseStrip({ url }: { url: ApplicationsUrl }) {
  const { t } = useI18n();
  const counts = useStripCounts(url.q);
  if (!counts) return <PendingStrip />;
  // Nothing to filter on the first run, whatever phase the URL names (D11, RB14).
  if (!url.q && sum(counts) === 0) return null;
  return (
    <div className="strip" role="group" aria-label={t("applications.strip.label")}>
      {PHASE_FILTERS.map((phase) => (
        <StripButton
          key={phase}
          phase={phase}
          count={counts[phase]}
          pressed={url.phase === phase}
          onPress={() => url.setPhase(url.phase === phase ? null : phase)}
        />
      ))}
    </div>
  );
}

/** Same grid and labels as the strip, invisible, so its height matches at any font size (R11). */
function PendingStrip() {
  return (
    <div className="strip strip-pending" aria-hidden="true">
      {PHASE_FILTERS.map((phase) => (
        <div key={phase} className="strip-item strip-ghost">
          <StripHead phase={phase} />
          <span className="strip-count">0</span>
          <span className="strip-ticks" />
        </div>
      ))}
    </div>
  );
}

interface StripButtonProps {
  phase: PhaseFilter;
  count: number;
  pressed: boolean;
  onPress: () => void;
}

// An explicit name: joined inline spans would read "Vorgemerkt2" in some engines.
const stripName = (t: Translate, phase: PhaseFilter, count: number) =>
  t("applications.strip.item", { phase: t(PHASE_LABEL[phase]), count: applicationCount(t, count) });

function StripButton({ phase, count, pressed, onPress }: StripButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      id={stripButtonId(phase)}
      className={cx("strip-item", STAGE_CLASS[phase])}
      aria-label={stripName(t, phase, count)}
      aria-pressed={pressed}
      onClick={onPress}
    >
      <StripHead phase={phase} />
      <span className="strip-count">{count}</span>
      <Ticks count={count} />
    </button>
  );
}

function StripHead({ phase }: { phase: PhaseFilter }) {
  const { t } = useI18n();
  return (
    <span className="strip-head">
      <span className="strip-no" aria-hidden="true">
        {phaseIndex(phase)}
      </span>
      <span>{t(PHASE_LABEL[phase])}</span>
    </span>
  );
}

/** Decorative: the count says the same in words (usability #12, one tick per application). */
function Ticks({ count }: { count: number }) {
  const { t } = useI18n();
  const { ticks, more } = tickCount(count);
  return (
    <span className="strip-ticks" aria-hidden="true">
      {Array.from({ length: ticks }, (_, index) => (
        <i key={index} className="strip-tick" />
      ))}
      {more > 0 ? (
        <span className="strip-more">{t("applications.strip.more", { count: more })}</span>
      ) : null}
    </span>
  );
}

/** An empty filtered phase is not the first run: say so and offer the way back (decision D11). */
export function PhaseEmpty({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useI18n();
  return (
    <div className="phase-empty">
      <p>{t("applications.phaseEmpty")}</p>
      <Button size="sm" variant="ghost" onClick={onShowAll}>
        {t("applications.filter.clear")}
      </Button>
    </div>
  );
}
