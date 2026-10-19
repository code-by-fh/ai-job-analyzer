"use client";

import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";

interface InterviewTimeFieldProps {
  id: string;
  /** The interview day (yyyy-mm-dd) the time belongs to; empty disables the field. */
  day: string;
  value: string;
  onChange: (time: string) => void;
  error?: string;
}

/** The optional interview time (HH:mm), shared by the dates drawer and the change to Interview. */
export function InterviewTimeField({ id, day, value, onChange, error }: InterviewTimeFieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={id}
      type="time"
      label={t("dates.interviewTime")}
      value={value}
      error={error}
      // A time without a day is never saved, so it is offered only with a day.
      disabled={day === ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
