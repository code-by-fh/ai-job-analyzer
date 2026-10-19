"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { FirstDayChecklist, JobDetail } from "@/api/jobs";
import { FIRST_DAY_KEYS, firstDayChecklistOf, firstDayDoneCount } from "@/domain/firstDay";
import { useI18n } from "@/i18n/useI18n";
import { CheckField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { NotesEditor } from "../history/NotesEditor";
import { useFirstDayTick } from "../next/useChecklist";
import { FIRST_DAY_NOTES } from "./outcomeNotes";
import { StartDateField } from "./StartDateField";

// Curated, static tips (no AI call): they hold for any first day.
const TIPS = [
  "firstDay.tip1",
  "firstDay.tip2",
  "firstDay.tip3",
  "firstDay.tip4",
  "firstDay.tip5",
] as const;

/** Feedback 1 T14: the tab of an accepted offer, from the celebration to the first day. */
export function FirstDayTab({ job }: { job: JobDetail }) {
  return (
    <div className="outcome">
      <FirstDayHead job={job} />
      <div className="fit-grid outcome-grid">
        <div>
          <FirstDayChecklist job={job} />
          <FirstDayTips />
        </div>
        <div className="history-side">
          <StartDateField job={job} />
          <NotesEditor job={job} spec={FIRST_DAY_NOTES} />
        </div>
      </div>
    </div>
  );
}

/** The static success message; with reduced motion it is the whole celebration. */
function FirstDayHead({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const title = job.company
    ? t("firstDay.titleCompany", { company: job.company })
    : t("firstDay.title");
  return (
    <header className="outcome-head">
      <span className="outcome-seal" aria-hidden="true">
        <Icon icon={CircleCheck} />
      </span>
      <div>
        <h3 className="outcome-title">{title}</h3>
        <p className="outcome-lead">{t("firstDay.lead")}</p>
      </div>
    </header>
  );
}

function FirstDayChecklist({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const checklist = firstDayChecklistOf(job.first_day_checklist);
  const done = firstDayDoneCount(job.first_day_checklist);
  return (
    <section aria-labelledby="first-day-checklist">
      <h3 className="sec-title-sm" id="first-day-checklist">
        {t("firstDay.checklistTitle")}
      </h3>
      <p className="meta">{t("firstDay.progress", { done, total: FIRST_DAY_KEYS.length })}</p>
      <FirstDayChecks job={job} checklist={checklist} />
      {checklist.others_declined ? null : (
        <Link className="btn" href="/applications">
          {t("firstDay.openApplications")}
        </Link>
      )}
    </section>
  );
}

function FirstDayChecks({ job, checklist }: { job: JobDetail; checklist: FirstDayChecklist }) {
  const { t } = useI18n();
  const tick = useFirstDayTick(job);
  return (
    <ul role="list" className="outcome-checks">
      {FIRST_DAY_KEYS.map((key) => (
        <li key={key}>
          <CheckField
            id={`first-day-${key}`}
            label={t(`firstDay.check.${key}`)}
            checked={checklist[key]}
            onChange={(value) => tick(key, value)}
          />
        </li>
      ))}
    </ul>
  );
}

function FirstDayTips() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="first-day-tips" className="outcome-tips">
      <h3 className="sec-title-sm" id="first-day-tips">
        {t("firstDay.tipsTitle")}
      </h3>
      <ul role="list">
        {TIPS.map((tip) => (
          <li key={tip}>{t(tip)}</li>
        ))}
      </ul>
    </section>
  );
}
