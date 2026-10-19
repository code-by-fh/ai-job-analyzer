"use client";

import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { InterviewTimeField } from "../dates/InterviewTimeField";
import { useJobFormat } from "../format/useJobFormat";

/** Day (yyyy-mm-dd) and optional time (HH:mm) as the date and time inputs give them. */
export interface InterviewDate {
  day: string;
  time: string;
}

export const NO_INTERVIEW_DATE: InterviewDate = { day: "", time: "" };

interface InterviewDateFieldsProps {
  job: JobDetail;
  value: InterviewDate;
  onChange: (value: InterviewDate) => void;
}

/** The optional interview date of a change to Interview; empty keeps the stored date. */
export function InterviewDateFields({ job, value, onChange }: InterviewDateFieldsProps) {
  return (
    <div className="phase-interview">
      <DayField job={job} value={value} onChange={onChange} />
      <InterviewTimeField
        id="phase-interview-time"
        day={value.day}
        value={value.time}
        onChange={(time) => onChange({ ...value, time })}
      />
    </div>
  );
}

function DayField({ job, value, onChange }: InterviewDateFieldsProps) {
  const { t } = useI18n();
  const format = useJobFormat();
  const kept = job.interview_at
    ? t("guard.interview.kept", { date: format.date(job.interview_at) })
    : undefined;
  return (
    <TextField
      id="phase-interview-date"
      type="date"
      label={t("guard.interview.date")}
      hint={kept}
      value={value.day}
      onChange={(event) => onChange({ ...value, day: event.target.value })}
    />
  );
}
