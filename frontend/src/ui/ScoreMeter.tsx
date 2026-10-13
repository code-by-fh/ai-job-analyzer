"use client";

import { roundScore, scoreBand, type ScoreBand } from "@/domain/scoreBand";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "./cx";

// Vermilion is reserved for strong scores (spec 5); weak scores recede.
const BAND_CLASS: Record<ScoreBand, string | null> = {
  strong: "strong",
  possible: null,
  weak: "weak",
};
export const BAND_LABEL: Record<ScoreBand, MessageKey> = {
  strong: "score.strong",
  possible: "score.possible",
  weak: "score.weak",
};

/** List score: a typographic numeral with its band word underneath. */
export function ScoreMeter({ score }: { score: number }) {
  const { t } = useI18n();
  const shown = roundScore(score);
  const band = scoreBand(shown);
  const word = t(BAND_LABEL[band]);
  return (
    <span
      className={cx("score", BAND_CLASS[band])}
      title={t("score.title", { score: shown, band: word })}
    >
      <span className="score-n">{shown}</span>
      <span className="score-w">{word}</span>
    </span>
  );
}
