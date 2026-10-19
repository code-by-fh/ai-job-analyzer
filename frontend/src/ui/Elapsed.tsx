"use client";

import { elapsedMinutes, elapsedSince, formatElapsed } from "@/domain/elapsed";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useSecondNow } from "@/lib/clock";
import { cx } from "./cx";

// The trailing seconds of "mm:ss" / "h:mm:ss".
const SECONDS_DIGITS = 2;

export interface ElapsedProps {
  /** Epoch ms of the run's start (server stamp first); null shows nothing. */
  startedAt: number | null;
  className?: string;
}

/**
 * How long a running task has been running ("seit 01:24"). Never place it inside a live region:
 * both faces are aria-hidden and screen readers read the whole-minute label instead, so nothing is
 * announced per tick. With reduced motion CSS shows the calm face (whole minutes) instead of the
 * ticking one, so nothing on screen changes every second.
 */
export function Elapsed({ startedAt, className }: ElapsedProps) {
  if (startedAt === null) return null;
  return <ElapsedFaces startedAt={startedAt} className={className} />;
}

function ElapsedFaces({ startedAt, className }: { startedAt: number; className?: string }) {
  const { t } = useI18n();
  const elapsed = elapsedSince(startedAt, useSecondNow());
  return (
    <span className={cx("elapsed", className)}>
      <TickingFace elapsed={elapsed} />
      <CalmFace elapsed={elapsed} />
      <span className="sr-only">{elapsedLabel(elapsed, t)}</span>
    </span>
  );
}

function TickingFace({ elapsed }: { elapsed: number }) {
  const { t } = useI18n();
  const text = formatElapsed(elapsed);
  return (
    <span className="elapsed-face elapsed-ticking" aria-hidden="true">
      <span className="elapsed-since">{t("elapsed.since")}</span>{" "}
      <span className="elapsed-n">
        {text.slice(0, -SECONDS_DIGITS)}
        <span className="elapsed-s">{text.slice(-SECONDS_DIGITS)}</span>
      </span>
    </span>
  );
}

function CalmFace({ elapsed }: { elapsed: number }) {
  const { t } = useI18n();
  const minutes = elapsedMinutes(elapsed);
  return (
    <span className="elapsed-face elapsed-calm" aria-hidden="true">
      {minutes === 0 ? (
        <span className="elapsed-since">{t("elapsed.justStarted")}</span>
      ) : (
        <>
          <span className="elapsed-since">{t("elapsed.since")}</span>{" "}
          <span className="elapsed-n">{t("elapsed.minutes", { count: minutes })}</span>
        </>
      )}
    </span>
  );
}

/** The screen-reader text in whole minutes ("läuft seit 1 Minute"). */
export function elapsedLabel(elapsedMs: number, t: Translate): string {
  const minutes = elapsedMinutes(elapsedMs);
  if (minutes === 0) return t("elapsed.labelUnderMinute");
  if (minutes === 1) return t("elapsed.labelOne");
  return t("elapsed.label", { count: minutes });
}
