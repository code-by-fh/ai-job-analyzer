"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";

/** Length of the whole moment; matches the fade-out end of `.celebrate` in outcome.css. */
export const CELEBRATION_MS = 2300;
/** One paper strip per `.confetti i:nth-child(n)` trajectory in outcome.css. */
const CONFETTI_PIECES = 28;
const PIECES = Array.from({ length: CONFETTI_PIECES }, (_, index) => index);

type Celebrate = () => void;

// Outside the job page (a component rendered on its own) there is nothing to celebrate.
const CelebrateContext = createContext<Celebrate>(() => undefined);

/**
 * Feedback 1 T14: the success moment after "Angebot angenommen". Decorative only: the phase toast
 * announces the change and the "1. Arbeitstag" tab carries the static success message, which is
 * all a user with reduced motion sees (outcome.css hides the overlay for them).
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState(0);
  const celebrate = useCallback(() => setRun((count) => count + 1), []);
  return (
    <CelebrateContext value={celebrate}>
      {children}
      {run > 0 ? <CelebrationBurst key={run} /> : null}
    </CelebrateContext>
  );
}

export function useCelebrate(): Celebrate {
  return useContext(CelebrateContext);
}

/** True once the moment has played, so the overlay leaves the DOM. */
function usePlayed(): boolean {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, []);
  return played;
}

function CelebrationBurst() {
  if (usePlayed()) return null;
  return (
    <div className="celebrate" aria-hidden="true">
      <div className="confetti">
        {PIECES.map((piece) => (
          <i key={piece} />
        ))}
      </div>
      <Stamp />
    </div>
  );
}

function Stamp() {
  const { t } = useI18n();
  return (
    <div className="celebrate-stamp">
      <svg viewBox="0 0 96 96" className="celebrate-mark">
        <circle cx="48" cy="48" r="42" pathLength={1} />
        <path d="M29 50 L43 63 L68 35" pathLength={1} />
      </svg>
      <p className="celebrate-word">{t("firstDay.celebrate")}</p>
    </div>
  );
}
