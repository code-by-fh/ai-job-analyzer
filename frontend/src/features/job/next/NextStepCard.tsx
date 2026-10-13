"use client";

import type { JobDetail } from "@/api/jobs";
import { isWarning, nextStep, type NextStep } from "@/domain/nextStep";
import type { MessageKey } from "@/i18n/de";
import { useNow } from "@/lib/clock";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { followUpLabel } from "../labels";
import { NextStepActions } from "./NextStepActions";
import { NextStepExtras } from "./NextStepExtras";

const CARD_TITLE_ID = "next-step-title";

function tone(step: NextStep): string | null {
  return isWarning(step) ? "tone-warn" : null;
}

/** Spec 4.2 / usability #8: the one card with every control for the next move. */
export function NextStepCard({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const step = nextStep(job, new Date(useNow()));
  return (
    <section className={cx("next", tone(step))} aria-labelledby={CARD_TITLE_ID}>
      <div className="next-kicker">{t("next.kicker")}</div>
      <h2 className="next-title" id={CARD_TITLE_ID}>
        {t(step.label)}
      </h2>
      <DueLine job={job} step={step} />
      <p className="next-text">{t(step.text)}</p>
      <div className="next-actions">
        <NextStepActions job={job} step={step} />
        <NextStepExtras job={job} step={step} />
      </div>
    </section>
  );
}

interface DueText {
  label: MessageKey;
  date: string;
}

/** The interview carries a time of day; follow-up and answer dates are whole days. */
function dueText(job: JobDetail, step: NextStep, format: JobFormat): DueText | null {
  if (!step.due) return null;
  const iso = step.due.toISOString();
  if (step.dateField === "interview_at") {
    return { label: "dates.interviewAt", date: format.dateTime(iso) };
  }
  return { label: followUpLabel(job), date: format.date(iso) };
}

function DueLine({ job, step }: { job: JobDetail; step: NextStep }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const text = dueText(job, step, format);
  if (!text) return null;
  const { label, date } = text;
  const overdue = step.overdue && isWarning(step);
  return (
    <p className={cx("next-due", overdue && "t-warn")}>
      {t("next.dueOn", { label: t(label), date })}
      {overdue ? ` · ${t("next.overdue")}` : null}
    </p>
  );
}
