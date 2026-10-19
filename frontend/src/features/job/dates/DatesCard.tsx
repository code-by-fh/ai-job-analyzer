"use client";

import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { mailtoHref } from "@/domain/links";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useJobFormat, type JobFormat } from "../format/useJobFormat";
import { followUpLabel } from "../labels";
import { DATES_EDIT_ID, useOpenDates } from "./DatesDrawerProvider";
import { hasCustomTime } from "./datesForm";
import { PostingDetailsAction } from "./PostingDetailsAction";

const CARD_TITLE_ID = "dates-title";

/** Small "Termine & Daten" card under the next step (spec 4.2). */
export function DatesCard({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <section className="jd-card" aria-labelledby={CARD_TITLE_ID}>
      <div className="row-between">
        <h2 className="sec-title-sm" id={CARD_TITLE_ID}>
          {t("dates.title")}
        </h2>
        <EditButton />
      </div>
      <DatesList job={job} />
      <PostingDetailsAction job={job} />
    </section>
  );
}

function EditButton() {
  const { t } = useI18n();
  const openDates = useOpenDates();
  return (
    <Button id={DATES_EDIT_ID} size="sm" variant="ghost" icon={Pencil} onClick={() => openDates()}>
      {t("dates.edit")}
    </Button>
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
      <PostingRows job={job} />
    </dl>
  );
}

function PostingRows({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const none = t("dates.none");
  return (
    <>
      <PostingRow job={job} field="contact_persons" label={t("dates.contacts")}>
        {job.contact_persons?.length ? <ContactList contacts={job.contact_persons} /> : none}
      </PostingRow>
      <PostingRow job={job} field="recruiter_info" label={t("dates.recruiter")}>
        {recruiterText(job) || none}
      </PostingRow>
      <PostingRow job={job} field="salary_benchmark" label={t("dates.salary")} className="num">
        {salaryText(job, t) || none}
      </PostingRow>
    </>
  );
}

type PostingRowProps = {
  job: JobDetail;
  field: string;
  label: string;
  className?: string;
  children: ReactNode;
};

/** A row that says "from the posting" while the analysis' value is still untouched by the user. */
function PostingRow({ job, field, label, className, children }: PostingRowProps) {
  const { t } = useI18n();
  const fromPosting = job.posting_extracted?.includes(field);
  return (
    <>
      <dt>{label}</dt>
      <dd className={className}>
        {children}
        {fromPosting ? <small className="posting-hint">{t("dates.fromPosting")}</small> : null}
      </dd>
    </>
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

function ContactEmail({ email }: { email: string }) {
  const href = mailtoHref(email);
  return href ? (
    <a className="link" href={href}>
      {email}
    </a>
  ) : (
    <>{email}</>
  );
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
              {" "}
              · <ContactEmail email={contact.email} />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
