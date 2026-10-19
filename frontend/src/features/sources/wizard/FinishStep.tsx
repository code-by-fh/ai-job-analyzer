"use client";

import { useState, type Dispatch, type FormEvent } from "react";
import { INITIAL_RUNS, type InitialRun } from "@/api/platformPaths";
import { hostOf } from "@/domain/links";
import { isName } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { ScheduleFields, scheduleErrors } from "../drawer/ScheduleFields";
import { INITIAL_RUN_LABEL } from "../labels";
import { SourceNameField } from "../SourceFields";
import { StepFoot } from "./StepFoot";
import { setupRequestOf, useCreateSource } from "./useCreateSource";
import { NewChannelDialog, WizardNotify } from "./WizardNotify";
import { WizardGroup } from "./WizardGroup";
import type { WizardAction, WizardErrors, WizardState } from "./wizardState";

export const WIZARD_NAME_ID = "wizard-name";
export const WIZARD_SCHEDULE_ID = "wizard-schedule";
const RUN_GROUP = "wizard-first-run";
const NAME_HEADING_ID = "wizard-name-h";
const SCHEDULE_HEADING_ID = "wizard-schedule-h";
const RUN_HEADING_ID = "wizard-first-run-h";

interface StepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

export interface FinishStepProps extends StepProps {
  /** After the source was created; the wizard closes and focus goes to the new row. */
  onCreated: (id: number) => void;
}

/** The name is optional (the server proposes one); a typed one follows the drawer's rule. */
function finishErrors(state: WizardState): WizardErrors {
  const name = state.name.trim();
  const schedule = scheduleErrors(state.schedule);
  return {
    name: name === "" || isName(name) ? undefined : "sources.error.name",
    schedule_times: schedule.time,
    schedule_days: schedule.days,
  };
}

/** Client errors first (shown on their fields), then POST /platforms/setup. */
function useFinishSubmit({ state, dispatch, onCreated }: FinishStepProps) {
  const create = useCreateSource({ onCreated, dispatch });
  // A created source stays busy until the wizard is gone: the closing URL change is a transition.
  const busy = create.isPending || create.isSuccess;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const errors = finishErrors(state);
    dispatch({ type: "errors", errors });
    if (!Object.values(errors).some(Boolean)) create.mutate(setupRequestOf(state));
  };
  return { submit, busy };
}

/**
 * D10 step 3: name, schedule and the first run (B8), each in its own framed group (feedback 1,
 * T5), then "Quelle anlegen", which closes the wizard once the source exists.
 */
export function FinishStep(props: FinishStepProps) {
  const { state, dispatch } = props;
  const [creatingChannel, setCreatingChannel] = useState(false);
  return (
    <>
      <FinishForm {...props} onCreateChannel={() => setCreatingChannel(true)} />
      {/* Beside the form, not in it: a form in a form would submit the step. */}
      <NewChannelDialog
        open={creatingChannel}
        onClose={() => setCreatingChannel(false)}
        state={state}
        dispatch={dispatch}
      />
    </>
  );
}

function FinishForm(props: FinishStepProps & { onCreateChannel: () => void }) {
  const { t } = useI18n();
  const { state, dispatch } = props;
  const { submit, busy } = useFinishSubmit(props);
  return (
    <form noValidate onSubmit={submit} className="wizard-finish">
      <FinishGroups state={state} dispatch={dispatch} />
      <WizardNotify state={state} dispatch={dispatch} onCreate={props.onCreateChannel} />
      <StepFoot onBack={() => dispatch({ type: "back" })}>
        <Button type="submit" variant="primary" busy={busy}>
          {t("sources.wizard.create")}
        </Button>
      </StepFoot>
    </form>
  );
}

function FinishGroups({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  return (
    <>
      <WizardGroup headingId={NAME_HEADING_ID} title={t("sources.wizard.nameTitle")}>
        <NameField state={state} dispatch={dispatch} />
      </WizardGroup>
      <WizardGroup headingId={SCHEDULE_HEADING_ID} title={t("sources.section.schedule")}>
        <WizardSchedule state={state} dispatch={dispatch} />
      </WizardGroup>
      <WizardGroup headingId={RUN_HEADING_ID} title={t("sources.wizard.firstRun")}>
        <FirstRun state={state} dispatch={dispatch} />
      </WizardGroup>
    </>
  );
}

/** The shared editor (D6); client and server errors of the pair land on its fields. */
function WizardSchedule({ state, dispatch }: StepProps) {
  return (
    <ScheduleFields
      idPrefix={WIZARD_SCHEDULE_ID}
      value={state.schedule}
      onChange={(schedule) => dispatch({ type: "schedule", schedule })}
      errors={{ time: state.errors.schedule_times, days: state.errors.schedule_days }}
    />
  );
}

/** The placeholder shows the host the server's own name proposal starts from. */
function NameField({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  return (
    <SourceNameField
      id={WIZARD_NAME_ID}
      hint={t("sources.wizard.nameHint")}
      placeholder={hostOf(state.url) ?? undefined}
      value={state.name}
      onChange={(name) => dispatch({ type: "name", name })}
      error={state.errors.name}
    />
  );
}

/** Preflight ruling 30: native radios in a group named by the frame's heading, no new primitive. */
function FirstRun({ state, dispatch }: StepProps) {
  return (
    <fieldset className="run-choices" aria-labelledby={RUN_HEADING_ID}>
      {INITIAL_RUNS.map((run) => (
        <RunChoice
          key={run}
          run={run}
          checked={state.initialRun === run}
          onChoose={() => dispatch({ type: "initialRun", initialRun: run })}
        />
      ))}
    </fieldset>
  );
}

interface RunChoiceProps {
  run: InitialRun;
  checked: boolean;
  onChoose: () => void;
}

/**
 * The label holds title and hint, so the whole row is the hit target; the radio is named by the
 * title alone and described by the hint.
 */
function RunChoice({ run, checked, onChoose }: RunChoiceProps) {
  const id = `wizard-run-${run}`;
  return (
    <div className="run-choice">
      <input
        type="radio"
        id={id}
        name={RUN_GROUP}
        value={run}
        checked={checked}
        onChange={onChoose}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
      />
      <RunLabel id={id} run={run} />
    </div>
  );
}

function RunLabel({ id, run }: { id: string; run: InitialRun }) {
  const { t } = useI18n();
  return (
    <label htmlFor={id}>
      <span id={`${id}-title`}>{t(INITIAL_RUN_LABEL[run].title)}</span>
      <span className="hint" id={`${id}-hint`}>
        {t(INITIAL_RUN_LABEL[run].hint)}
      </span>
    </label>
  );
}
