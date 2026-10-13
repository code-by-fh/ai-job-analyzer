"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { useI18n } from "@/i18n/useI18n";
import type { MessageKey } from "@/i18n/de";
import { cx } from "./cx";
import { centerInStrip } from "./scrollStrip";

export type StepState = "past" | "current" | "future" | "skipped" | "closed" | "unreached";

export interface StepItem {
  key: string;
  label: string;
  date?: string;
  state: StepState;
}

export interface StepperProps {
  steps: readonly StepItem[];
  /** Accessible name; rendered as a visible heading when headingLevel is set. */
  label: string;
  headingLevel?: 2 | 3;
}

// "unreached" renders quietly like "future" but is named differently for screen readers.
const STATE_TEXT: Readonly<Record<StepState, MessageKey>> = {
  past: "step.past",
  current: "step.current",
  future: "step.future",
  skipped: "step.skipped",
  closed: "step.closed",
  unreached: "track.unreached",
};

// "closed" is the final phase reached; it is the current position like "current".
const ACTIVE_STATES: ReadonlySet<StepState> = new Set<StepState>(["current", "closed"]);

/** Read-only phase track: ink for done, vermilion for now, dotted for skipped (usability #6). */
export function Stepper({ steps, label, headingLevel }: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const headingId = useId();
  useCenterActiveStep(
    listRef,
    steps.findIndex((step) => ACTIVE_STATES.has(step.state)),
  );
  const columns = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` };
  const naming = headingLevel ? { "aria-labelledby": headingId } : { "aria-label": label };
  return (
    <>
      {headingLevel ? <StepperHeading id={headingId} level={headingLevel} text={label} /> : null}
      <ol role="list" ref={listRef} className="stepper" style={columns} {...naming}>
        {steps.map((step) => (
          <StepEntry key={step.key} step={step} />
        ))}
      </ol>
    </>
  );
}

function StepperHeading({ id, level, text }: { id: string; level: 2 | 3; text: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Heading id={id} className="sec-title-sm stepper-heading">
      {text}
    </Heading>
  );
}

function StepEntry({ step }: { step: StepItem }) {
  const { t } = useI18n();
  const active = ACTIVE_STATES.has(step.state);
  return (
    <li className={cx("step", step.state)} aria-current={active ? "step" : undefined}>
      <span className="step-label">{step.label}</span>
      <span className="sr-only">{t(STATE_TEXT[step.state])}</span>
      <span className="step-date">{step.date ?? ""}</span>
    </li>
  );
}

/** Mobile shows the stepper as a horizontal scroller; centre the current phase without scrolling the page. */
function useCenterActiveStep(listRef: RefObject<HTMLOListElement | null>, index: number): void {
  useEffect(() => {
    const list = listRef.current;
    centerInStrip(list, list?.children.item(index));
  }, [listRef, index]);
}
