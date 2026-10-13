"use client";

import { useState } from "react";
import type { MessageKey } from "@/i18n/de";
import {
  parseThreshold,
  thresholdBand,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
  type ThresholdBand,
} from "@/domain/threshold";
import { useI18n } from "@/i18n/useI18n";

export const BAND_TEXT: Readonly<Record<ThresholdBand, MessageKey>> = {
  all: "threshold.band.all",
  weak: "threshold.band.weak",
  possible: "threshold.band.possible",
  strong: "threshold.band.strong",
};

export const THRESHOLD_NUMBER_ID = "thr-number";
const LABEL_ID = "thr-label";
const BOUNDS = { min: THRESHOLD_MIN, max: THRESHOLD_MAX, step: THRESHOLD_STEP };

interface ControlProps {
  value: number;
  onChange: (value: number) => void;
}

interface NumberProps extends ControlProps {
  /** False while the field holds text that is no threshold (empty, fractional, out of range). */
  onValidity: (valid: boolean) => void;
}

/**
 * Slider and number field share one value and one label; the numeral above repeats the value
 * for sighted users only. The slider spans the panel's full width, like the ticks and the scale
 * below it, so score n on the slider lines up with score n on the tick strip.
 */
export function ThresholdControl({ value, onChange, onValidity }: NumberProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="thr-field">
        <label className="label" id={LABEL_ID} htmlFor={THRESHOLD_NUMBER_ID}>
          {t("threshold.label")}
        </label>
        <ThresholdNumber value={value} onChange={onChange} onValidity={onValidity} />
      </div>
      <ThresholdSlider value={value} onChange={onChange} />
    </>
  );
}

/**
 * R17: the typed text stays as typed while it is no threshold, so an emptied field never turns
 * into 0. It shows the value again once the text agrees with it, the value changed elsewhere,
 * or the field lost focus.
 */
function useTypedThreshold({ value, onChange, onValidity }: NumberProps) {
  const [text, setText] = useState<string | null>(null);
  const parsed = text === null ? null : parseThreshold(text);
  const showText = text !== null && (parsed === null || parsed === value);
  return {
    display: showText ? text : String(value),
    invalid: showText && parsed === null,
    edit: (raw: string) => {
      const next = parseThreshold(raw);
      setText(raw);
      onValidity(next !== null);
      if (next !== null) onChange(next);
    },
    leave: () => {
      setText(null);
      onValidity(true);
    },
  };
}

function ThresholdNumber(props: NumberProps) {
  const typed = useTypedThreshold(props);
  return (
    <input
      className="input"
      id={THRESHOLD_NUMBER_ID}
      type="number"
      inputMode="numeric"
      {...BOUNDS}
      value={typed.display}
      aria-invalid={typed.invalid || undefined}
      onChange={(event) => typed.edit(event.target.value)}
      onBlur={typed.leave}
    />
  );
}

function ThresholdSlider({ value, onChange }: ControlProps) {
  const { t } = useI18n();
  const band = t(BAND_TEXT[thresholdBand(value)]);
  return (
    <input
      type="range"
      className="thr-slider"
      {...BOUNDS}
      value={value}
      aria-labelledby={LABEL_ID}
      aria-valuetext={t("threshold.valueText", { value, band })}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}
