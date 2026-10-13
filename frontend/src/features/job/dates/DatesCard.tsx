"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { followUpLabel } from "../labels";
import { DatesDrawer } from "./DatesDrawer";
import { hasCustomTime } from "./datesForm";

const CARD_TITLE_ID = "dates-title";

/** Small "Termine & Daten" card under the next step (spec 4.2). */
export function DatesCard({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <section className="jd-card" aria-labelledby={CARD_TITLE_ID}>
      <div className="row-between">
        <h2 className="sec-title-sm" id={CARD_TITLE_ID}>
          {t("dates.title")}
        </h2>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
          {t("dates.edit")}
        </Button>
      </div>
      <DatesList job={job} />
      {editing ? <DatesDrawer job={job} onClose={() => setEditing(false)} /> : null}
    </section>
  );
}

function DatesList({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const none = t("dates.none");
  const day = (iso?: string | null) => (iso ? format.date(iso) : none);
  return (
    <dl className="kv kv-compact">
      <dt>{t(followUpLabel(job))}</dt>
      <dd className="num">{day(job.next_follow_up_at)}</dd>
      <dt>{t("dates.interviewAt")}</dt>
      <dd className="num">{interviewText(job.interview_at, format) ?? none}</dd>
      <dt>{t("dates.contacts")}</dt>
      <dd>{job.contact_persons?.length ? <ContactList contacts={job.contact_persons} /> : none}</dd>
      <dt>{t("dates.recruiter")}</dt>
      <dd>{recruiterText(job) || none}</dd>
      <dt>{t("dates.salary")}</dt>
      <dd className="num">{salaryText(job, t) || none}</dd>
    </dl>
  );
}

function interviewText(iso: string | null | undefined, format: JobFormat): string | null {
  if (!iso) return null;
  return hasCustomTime(iso) ? format.dateTime(iso) : format.date(iso);
}

function recruiterText({ recruiter_info: recruiter }: JobDetail): string {
  return [recruiter?.name, recruiter?.email, recruiter?.phone].filter(Boolean).join(" · ");
}

type Translate = ReturnType<typeof useI18n>["t"];

function salaryText({ salary_benchmark: salary }: JobDetail, t: Translate): string {
  if (!salary || (salary.min == null && salary.max == null)) return "";
  const open = t("dates.none");
  return t("dates.salaryRange", { min: salary.min ?? open, max: salary.max ?? open });
}

function ContactList({ contacts }: { contacts: NonNullable<JobDetail["contact_persons"]> }) {
  return (
    <ul role="list" className="plain-list">
      {contacts.map((contact, index) => (
        <li key={index}>
          {[contact.name, contact.role].filter(Boolean).join(", ")}
          {contact.phone ? ` · ${contact.phone}` : null}
          {contact.email ? (
            <>
              {" · "}
              <a className="link" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
