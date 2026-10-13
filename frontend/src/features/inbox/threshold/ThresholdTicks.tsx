"use client";

import {
  countAll,
  countBelow,
  distributionTicks,
  MAX_TICK_LEVEL,
  thresholdPercent,
  type Tick,
} from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";

const TICK_HEIGHT = 24;
const LEVEL_HEIGHT = TICK_HEIGHT / MAX_TICK_LEVEL;
const TICK_WIDTH = 0.6;
const LINE_WIDTH = 0.5;
// The x axis is the percentage of thresholdPercent, so a mark is centred on its score.
const SCALE_WIDTH = 100;

interface TicksProps {
  counts: readonly number[];
  threshold: number;
}

/**
 * One tick per score with jobs (usability tick/barcode device); jobs below the threshold recede.
 * The counts are bucketed by the rounded score, so the label is approximate: the committed count
 * next to "Übernehmen" comes from the server preview (B5), which compares the raw score.
 */
export function ThresholdTicks({ counts, threshold }: TicksProps) {
  const label = useTicksLabel(counts, threshold);
  const line = thresholdPercent(threshold) - LINE_WIDTH / 2;
  return (
    <div className="thr-ticks">
      <svg
        viewBox={`0 0 ${SCALE_WIDTH} ${TICK_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        {distributionTicks(counts).map((tick) => (
          <TickMark key={tick.score} tick={tick} below={tick.score < threshold} />
        ))}
        <rect className="thr-line" x={line} y={0} width={LINE_WIDTH} height={TICK_HEIGHT} />
      </svg>
    </div>
  );
}

function useTicksLabel(counts: readonly number[], threshold: number): string {
  const { t } = useI18n();
  const below = countBelow(counts, threshold);
  return t("threshold.ticksLabel", { total: countAll(counts), below, value: threshold });
}

function TickMark({ tick, below }: { tick: Tick; below: boolean }) {
  const height = tick.level * LEVEL_HEIGHT;
  return (
    <rect
      className={cx("thr-tick", below && "below")}
      x={thresholdPercent(tick.score) - TICK_WIDTH / 2}
      data-score={tick.score}
      y={TICK_HEIGHT - height}
      width={TICK_WIDTH}
      height={height}
    />
  );
}
