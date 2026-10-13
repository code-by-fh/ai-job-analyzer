"use client";

import { useQuery } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import { thresholdDistributionQueryOptions, thresholdPreviewQueryOptions } from "@/api/threshold";
import { POSSIBLE_SCORE_MIN, STRONG_SCORE_MIN } from "@/domain/scoreBand";
import { thresholdBand, THRESHOLD_MAX, THRESHOLD_MIN, thresholdPercent } from "@/domain/threshold";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { BAND_TEXT, ThresholdControl, THRESHOLD_NUMBER_ID } from "./ThresholdControl";
import { ThresholdTicks } from "./ThresholdTicks";
import { useThreshold, type ThresholdState } from "./useThreshold";

const TITLE_ID = "thr-title";
const PREVIEW_DEBOUNCE_MS = 300;

/** Spec 4.3 #2: the threshold lives in Eingang › Unter Schwellwert, with preview, apply and undo. */
export function ThresholdPanel() {
  const { t } = useI18n();
  const threshold = useThreshold();
  return (
    <section className="threshold-panel" aria-labelledby={TITLE_ID}>
      <h2 className="sec-title-sm" id={TITLE_ID}>
        {t("threshold.title")}
      </h2>
      <p className="thr-note">{t("threshold.intro")}</p>
      <ThresholdBody threshold={threshold} />
    </section>
  );
}

function ThresholdBody({ threshold }: { threshold: ThresholdState }) {
  const { t } = useI18n();
  if (threshold.saved === undefined) {
    if (!threshold.loadFailed) return <span className="skeleton-line thr-skeleton" />;
    return <ErrorLine message={t("threshold.loadError")} onRetry={threshold.retryLoad} />;
  }
  return <ThresholdEditor threshold={threshold} />;
}

function ThresholdEditor({ threshold }: { threshold: ThresholdState }) {
  return (
    <>
      <ThresholdHead value={threshold.value} />
      <ThresholdControl
        value={threshold.value}
        onChange={threshold.setDraft}
        onValidity={threshold.setValidity}
      />
      <TicksSlot threshold={threshold.value} />
      <ScaleLabels />
      <PreviewLine threshold={threshold} />
      <ApplyRow threshold={threshold} />
    </>
  );
}

/** Spec 5 and preflight ruling 17: errors in crimson with icon, words and a retry. */
function ErrorLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="thr-error">
      <Notice tone="error">
        {message}{" "}
        <button type="button" className="link" onClick={onRetry}>
          {t("error.retry")}
        </button>
      </Notice>
    </div>
  );
}

function ThresholdHead({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <div className="thr-head" aria-hidden="true">
      <span className="thr-big">{value}</span>
      <span className="thr-band">{t(BAND_TEXT[thresholdBand(value)])}</span>
    </div>
  );
}

function TicksSlot({ threshold }: { threshold: number }) {
  const { t } = useI18n();
  const distribution = useQuery(thresholdDistributionQueryOptions());
  if (distribution.data) return <ThresholdTicks counts={distribution.data} threshold={threshold} />;
  if (!distribution.isError) return <div className="thr-ticks" aria-hidden="true" />;
  const retry = () => void distribution.refetch();
  return <ErrorLine message={t("threshold.ticksError")} onRetry={retry} />;
}

interface ScaleMark {
  at: number;
  word: MessageKey | null;
}

// Each numeral sits at its score, like the ticks (percent of the 0..100 scale); its word below it.
const SCALE_MARKS: readonly ScaleMark[] = [
  { at: THRESHOLD_MIN, word: "threshold.scale.all" },
  { at: POSSIBLE_SCORE_MIN, word: "threshold.scale.possible" },
  { at: STRONG_SCORE_MIN, word: "threshold.scale.strong" },
  { at: THRESHOLD_MAX, word: null },
];

function ScaleLabels() {
  const { t } = useI18n();
  return (
    <div className="thr-scale" aria-hidden="true">
      <div>
        {SCALE_MARKS.map(({ at, word }) => (
          <span key={at} className="thr-mark" style={{ left: `${thresholdPercent(at)}%` }}>
            <span className="thr-num">{at}</span>
            {word ? <span className="thr-word">{t(word)}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

interface PreviewText {
  /** Only the settled server count goes into the live region; loading text never does. */
  announced: string;
  plain: string;
  error: { message: string; retry: () => void } | null;
}

const NO_TEXT: PreviewText = { announced: "", plain: "", error: null };

/** The committed count is the server's (B5 compares the raw score), never the rounded ticks. */
function usePreviewText(threshold: ThresholdState): PreviewText {
  const { t } = useI18n();
  const debounced = useDebouncedValue(threshold.value, PREVIEW_DEBOUNCE_MS);
  const settled = debounced === threshold.value;
  const enabled = threshold.changed && settled;
  const preview = useQuery({ ...thresholdPreviewQueryOptions(debounced), enabled });
  if (!threshold.changed) {
    return { ...NO_TEXT, plain: t("threshold.current", { value: threshold.value }) };
  }
  if (preview.isError && settled) {
    const error = { message: describeError(preview.error, t), retry: () => void preview.refetch() };
    return { ...NO_TEXT, error };
  }
  if (!settled || !preview.data) return { ...NO_TEXT, plain: t("threshold.previewLoading") };
  const { would_archive: archive, would_restore: restore } = preview.data;
  return { ...NO_TEXT, announced: t("threshold.preview", { value: debounced, archive, restore }) };
}

/** The live region stays mounted (R7 pattern), so a screen reader hears each new server count. */
function PreviewLine({ threshold }: { threshold: ThresholdState }) {
  const { announced, plain, error } = usePreviewText(threshold);
  return (
    <>
      <p className="thr-note">
        <span aria-live="polite">{announced}</span>
        {plain}
      </p>
      {error ? <ErrorLine message={error.message} onRetry={error.retry} /> : null}
    </>
  );
}

/** Spec 4.3 #5: Übernehmen stays focusable while there is nothing to apply, so focus stays. */
function ApplyRow({ threshold }: { threshold: ThresholdState }) {
  const { t } = useI18n();
  return (
    <div className="row thr-actions">
      <Button
        variant="primary"
        inactive={!threshold.changed || threshold.invalid}
        busy={threshold.applying}
        onClick={threshold.apply}
      >
        {t("threshold.apply")}
      </Button>
      {threshold.changed ? <ResetButton onReset={threshold.reset} /> : null}
    </div>
  );
}

/** It unmounts itself on activation, so it hands focus to the number field (spec 4.3 #5). */
function ResetButton({ onReset }: { onReset: () => void }) {
  const { t } = useI18n();
  const reset = () => {
    onReset();
    document.getElementById(THRESHOLD_NUMBER_ID)?.focus();
  };
  return (
    <Button variant="ghost" onClick={reset}>
      {t("threshold.reset")}
    </Button>
  );
}
