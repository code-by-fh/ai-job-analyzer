"use client";

import { useEffect, useReducer, useRef } from "react";
import type { Platform } from "@/api/platforms";
import type { WizardStep } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Drawer } from "@/ui/Drawer";
import { PanelHeader } from "@/ui/PanelHeader";
import { Stepper, type StepItem } from "@/ui/Stepper";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { focusSource, focusSourceOrTitle } from "../useFocusFallback";
import { CheckStep, WIZARD_URL_ID, type CheckStepProps } from "./CheckStep";
import { firstDayId, scheduleTimeId } from "../drawer/ScheduleFields";
import { FinishStep, WIZARD_NAME_ID, WIZARD_SCHEDULE_ID } from "./FinishStep";
import {
  LinksStep,
  linkRowId,
  WIZARD_FILTER_ID,
  WIZARD_PATTERN_ID,
  WIZARD_PATTERN_OK_ID,
} from "./LinksStep";
import { useLinkCheck } from "./useLinkCheck";
import { WizardLiveStatus } from "./WizardLiveStatus";
import {
  INITIAL_WIZARD,
  isWizardDirty,
  wizardReducer,
  type WizardErrors,
  type WizardState,
} from "./wizardState";

const STEP_KEYS: readonly MessageKey[] = [
  "sources.wizard.step1",
  "sources.wizard.step2",
  "sources.wizard.step3",
];

/** Preflight ruling 16: a step change puts focus on the new step's first field. */
const STEP_FIELD: Readonly<Record<WizardStep, string>> = {
  1: WIZARD_URL_ID,
  2: WIZARD_FILTER_ID,
  3: WIZARD_NAME_ID,
};

/** Ruling 16 / R12: new errors put focus on the first field that has one, in page order. */
const ERROR_FIELD: ReadonlyArray<[keyof WizardErrors, string]> = [
  ["url", WIZARD_URL_ID],
  ["selected_urls", linkRowId(0)],
  // A filter that hides every row leaves no first link; focus then falls back to the step's first field.
  ["links", linkRowId(0)],
  ["url_pattern", WIZARD_PATTERN_ID],
  ["patternConfirm", WIZARD_PATTERN_OK_ID],
  ["name", WIZARD_NAME_ID],
  ["schedule_times", scheduleTimeId(WIZARD_SCHEDULE_ID)],
  ["schedule_days", firstDayId(WIZARD_SCHEDULE_ID)],
];

type FocusView = Pick<WizardState, "step" | "errors">;

export interface AddSourceWizardProps {
  platforms: readonly Platform[];
  /** Called once leaving is settled (nothing typed, or the user chose to discard). */
  onClose: () => void;
  onOpenSource: (id: number) => void;
  /** After "Quelle anlegen" succeeded; leaves without asking (nothing is left to lose). */
  onCreated: (id: number) => void;
}

type LeaveCallbacks = Omit<AddSourceWizardProps, "platforms">;

function wizardSteps(step: WizardStep, t: (key: MessageKey) => string): StepItem[] {
  return STEP_KEYS.map((key, index) => {
    const position = index + 1;
    const state = position < step ? "past" : position === step ? "current" : "future";
    return { key, label: t(key), state };
  });
}

/**
 * D5/D10: the wizard's one unsaved flag. Every way of closing asks first; the duplicate's link
 * leaves without asking (the only entry is that source's own address, so nothing is lost).
 */
function useWizardLeave(state: WizardState, callbacks: LeaveCallbacks) {
  const { setDirty, requestLeave } = useUnsavedChanges();
  const dirty = isWizardDirty(state);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  const close = () => void requestLeave().then((leave) => leave && callbacks.onClose());
  const leaveFor = (go: (id: number) => void) => (id: number) => {
    setDirty(false);
    go(id);
  };
  return {
    close,
    openExisting: leaveFor(callbacks.onOpenSource),
    finish: leaveFor(callbacks.onCreated),
  };
}

function erroredField(errors: WizardErrors): string | null {
  return ERROR_FIELD.find(([key]) => errors[key])?.[1] ?? null;
}

/**
 * A step change lands on the first field with an error, else on the step's first field. New
 * errors on the same step (a submit, a setup 422) land on their first field; typing keeps the
 * errors object as it is, so it never moves focus.
 */
function focusTargetOf(previous: FocusView, current: FocusView): string | null {
  const errored = erroredField(current.errors);
  if (previous.step !== current.step) return errored ?? STEP_FIELD[current.step];
  return previous.errors === current.errors ? null : errored;
}

/** Not on the first render: the drawer focuses its data-autofocus field itself (ModalLayer). */
function useStepFocus({ step, errors }: WizardState): void {
  const shown = useRef<FocusView>({ step, errors });
  useEffect(() => {
    const target = focusTargetOf(shown.current, { step, errors });
    shown.current = { step, errors };
    if (target)
      (document.getElementById(target) ?? document.getElementById(STEP_FIELD[step]))?.focus();
  }, [step, errors]);
}

/**
 * Preflight ruling 15: a wizard opened by a deep link has no trigger to return focus to; once it
 * is gone, focus that fell to <body> goes to the page title. A created source takes focus on its
 * new row (D10), from the unmount too, because the URL change that closes the wizard is a transition.
 */
function useWizardFocus(state: WizardState): (id: number) => void {
  useStepFocus(state);
  const created = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (created.current === null) focusSourceOrTitle(null);
      else focusSource(created.current);
    },
    [],
  );
  return (id) => {
    created.current = id;
  };
}

function useWizard(callbacks: LeaveCallbacks) {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);
  const markCreated = useWizardFocus(state);
  const { finish, ...leave } = useWizardLeave(state, callbacks);
  const created = (id: number) => {
    markCreated(id);
    finish(id);
  };
  return { state, dispatch, created, ...leave };
}

/** D10: the steps in one narrow drawer; the step list is a read-only track, not buttons (usability #15). */
export function AddSourceWizard({ platforms, ...callbacks }: AddSourceWizardProps) {
  const { t } = useI18n();
  const { state, dispatch, close, openExisting, created } = useWizard(callbacks);
  return (
    <Drawer open onClose={close} label={t("onboard.source.action")} variant="narrow">
      <div className="panel-in source-wizard">
        <PanelHeader title={t("onboard.source.action")} onClose={close} />
        <Stepper steps={wizardSteps(state.step, t)} label={t("sources.wizard.steps")} />
        <WizardBody
          state={state}
          dispatch={dispatch}
          platforms={platforms}
          onOpenExisting={openExisting}
          onCreated={created}
        />
      </div>
    </Drawer>
  );
}

type StepsProps = CheckStepProps & Pick<AddSourceWizardProps, "onCreated">;

/** The link check lives here, beside its always-mounted live region, so it outlives step 1. */
function WizardBody(props: Omit<StepsProps, "link">) {
  const link = useLinkCheck(props.dispatch);
  return (
    <>
      <CurrentStep {...props} link={link} />
      <WizardLiveStatus started={link.started} checking={link.checking} />
    </>
  );
}

/** Every entry lives in the reducer, so a step may unmount freely. */
function CurrentStep({ onCreated, ...props }: StepsProps) {
  const { state, dispatch } = props;
  if (state.step === 1) return <CheckStep {...props} />;
  if (state.step === 2) return <LinksStep state={state} dispatch={dispatch} />;
  return <FinishStep state={state} dispatch={dispatch} onCreated={onCreated} />;
}
