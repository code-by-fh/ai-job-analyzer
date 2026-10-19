"use client";

import type { ReactNode } from "react";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { BoundField, BoundTextArea, type FieldsProps } from "./BoundField";
import type { DatesFocus } from "./DatesDrawer";
import { InterviewTimeField } from "./InterviewTimeField";
import { type DatesForm, CONTACT_FIELD_MAX, MAX_SALARY_DIGITS, SALARY_NOTE_MAX } from "./datesForm";

type DateKey = "followUp" | "interviewAt";

interface DateFieldProps extends FieldsProps {
  id: string;
  name: DateKey;
  label: string;
  autoFocus?: boolean;
}

// A time without a date means nothing, so removing the interview date removes its time too.
function clearedFields(name: DateKey): Partial<DatesForm> {
  return name === "interviewAt" ? { interviewAt: "", interviewTime: "" } : { [name]: "" };
}

/** Date input plus an explicit "remove": clearing is a deliberate act that sends null. */
export function DateField({ id, name, label, autoFocus, form, setForm, error }: DateFieldProps) {
  const clear = () => setForm((current) => ({ ...current, ...clearedFields(name) }));
  return (
    <div className="dates-date">
      <BoundField
        {...{ form, setForm, name, id, label, autoFocus }}
        type="date"
        error={error(name)}
      />
      {form[name] ? <ClearDateButton label={label} onClick={clear} /> : null}
    </div>
  );
}

function ClearDateButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={t("dates.clearDateNamed", { label })}
      onClick={onClick}
    >
      {t("dates.clearDate")}
    </Button>
  );
}

interface Spec {
  name: "recruiterName" | "recruiterEmail" | "recruiterPhone" | "salaryMin" | "salaryMax";
  id: string;
  label: MessageKey;
  type?: "email" | "tel";
  maxLength: number;
}

const RECRUITER_SPECS: readonly Spec[] = [
  {
    name: "recruiterName",
    id: "recruiter-name",
    label: "dates.recruiterName",
    maxLength: CONTACT_FIELD_MAX,
  },
  {
    name: "recruiterEmail",
    id: "recruiter-email",
    label: "dates.recruiterEmail",
    type: "email",
    maxLength: CONTACT_FIELD_MAX,
  },
  {
    name: "recruiterPhone",
    id: "recruiter-phone",
    label: "dates.recruiterPhone",
    type: "tel",
    maxLength: CONTACT_FIELD_MAX,
  },
];
const SALARY_SPECS: readonly Spec[] = [
  { name: "salaryMin", id: "salary-min", label: "dates.salaryMin", maxLength: MAX_SALARY_DIGITS },
  { name: "salaryMax", id: "salary-max", label: "dates.salaryMax", maxLength: MAX_SALARY_DIGITS },
];

interface GroupProps extends FieldsProps {
  legend: MessageKey;
  specs: readonly Spec[];
  children?: ReactNode;
}

function FieldGroup({ legend, specs, form, setForm, error, children }: GroupProps) {
  const { t } = useI18n();
  return (
    <fieldset className="dates-group">
      <legend className="sec-title-sm">{t(legend)}</legend>
      {specs.map(({ label, ...spec }) => (
        <BoundField
          key={spec.id}
          {...{ ...spec, form, setForm }}
          inputMode={spec.name.startsWith("salary") ? "numeric" : undefined}
          label={t(label)}
          error={error(spec.name)}
        />
      ))}
      {children}
    </fieldset>
  );
}

export function RecruiterFields(props: FieldsProps) {
  return <FieldGroup {...props} legend="dates.recruiter" specs={RECRUITER_SPECS} />;
}

export function SalaryFields(props: FieldsProps) {
  const { t } = useI18n();
  const { form, setForm } = props;
  return (
    <FieldGroup {...props} legend="dates.salary" specs={SALARY_SPECS}>
      <BoundTextArea
        {...{ form, setForm }}
        name="salaryNote"
        maxLength={SALARY_NOTE_MAX}
        error={props.error("salaryNote")}
        id="salary-note"
        label={t("dates.salaryNote")}
      />
    </FieldGroup>
  );
}

function TimeField({ form, setForm, error }: FieldsProps) {
  return (
    <InterviewTimeField
      id="dates-interview-time"
      day={form.interviewAt}
      value={form.interviewTime}
      error={error("interviewTime")}
      onChange={(interviewTime) => setForm((current) => ({ ...current, interviewTime }))}
    />
  );
}

interface DateFieldsProps extends FieldsProps {
  followUpName: string;
  focus?: DatesFocus;
}

/** Follow-up (day only) and interview (day plus optional time), the follow-up named after the phase. */
export function DateFields({ followUpName, focus, ...fields }: DateFieldsProps) {
  const { t } = useI18n();
  return (
    <>
      <DateField {...fields} id="dates-follow-up" name="followUp" label={followUpName} />
      <DateField
        {...fields}
        id="dates-interview"
        name="interviewAt"
        label={t("dates.interviewAt")}
        autoFocus={focus === "interviewAt"}
      />
      <TimeField {...fields} />
    </>
  );
}
