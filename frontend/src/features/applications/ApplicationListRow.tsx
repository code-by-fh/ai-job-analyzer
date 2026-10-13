"use client";

import { CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import type { ApplicationRow, DocState, RowWhen } from "@/domain/applications";
import { isWarning, type NextStep } from "@/domain/nextStep";
import { useJobFormat, type JobFormat } from "@/features/job/format/useJobFormat";
import { jobRoute } from "@/features/shell/routes";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";

const DOC_TEXT: Readonly<Record<DocState, MessageKey>> = {
  both: "applications.docs.both",
  cvOnly: "applications.docs.cvOnly",
  letterOnly: "applications.docs.letterOnly",
  running: "applications.docs.running",
  none: "applications.docs.none",
};

const DATE_TEXT = {
  interview: "applications.when.interview",
  answerBy: "applications.when.answerBy",
  overdue: "due.overdueSince",
} as const satisfies Record<string, MessageKey>;

export function PhaseRows({ rows }: { rows: readonly ApplicationRow[] }) {
  return (
    <ul role="list" className="arows">
      {rows.map((row) => (
        <ApplicationListRow key={row.item.id} row={row} />
      ))}
    </ul>
  );
}

/** Spec 4.2 row: the title link stretches over the row (4.3 #5); the cells only read (D10). */
export function ApplicationListRow({ row }: { row: ApplicationRow }) {
  const { t } = useI18n();
  return (
    <li className="arow">
      <RowTitle item={row.item} />
      <RowCell label="applications.col.next">
        <NextCell step={row.step} />
      </RowCell>
      <RowCell label="applications.col.when">
        <WhenText when={row.when} />
      </RowCell>
      <RowCell label="applications.col.docs">{t(DOC_TEXT[row.docs])}</RowCell>
    </li>
  );
}

const companyId = (jobId: string) => `arow-company-${jobId}`;

/** The company describes the link, so two applications with the same title stay distinguishable. */
export function RowTitle({ item }: { item: Pick<JobListItem, "id" | "title" | "company"> }) {
  const { t } = useI18n();
  return (
    <div className="arow-main">
      <Link className="arow-link" href={jobRoute(item.id)} aria-describedby={companyId(item.id)}>
        {item.title ?? t("job.untitled")}
      </Link>
      <p className="arow-sub" id={companyId(item.id)}>
        {item.company ?? t("job.unknownCompany")}
      </p>
    </div>
  );
}

/** The label is screen-reader text from 768 px (the column head shows it) and visible below (D12). */
export function RowCell({ label, children }: { label: MessageKey; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <p className="arow-cell">
      <span className="arow-label">{t("applications.cellLabel", { label: t(label) })}</span>
      {children}
    </p>
  );
}

/** Amber only for a deadline (isWarning, spec 4.4); a failed generation is an error: crimson, icon, words. */
function NextCell({ step }: { step: NextStep }) {
  const { t } = useI18n();
  const warn = isWarning(step);
  const failed = step.kind === "generationFailed";
  return (
    <span className={cx("next-cell", warn && "t-warn", failed && "t-danger")}>
      {warn ? <Icon icon={Clock} /> : null}
      {failed ? <Icon icon={CircleAlert} /> : null}
      {t(step.label)}
    </span>
  );
}

function WhenText({ when }: { when: RowWhen }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const warn = "warn" in when && when.warn;
  return <span className={cx("when-cell", warn && "t-warn")}>{whenText(when, format, t)}</span>;
}

function whenText(when: RowWhen, format: JobFormat, t: Translate): string {
  if (when.kind === "none") return t("applications.when.none");
  if (when.kind === "since") {
    return when.today ? t("applications.when.sinceToday") : format.relativeDays(when.iso);
  }
  if (when.kind === "dueSoon") {
    return t("applications.when.dueSoon", { when: format.relativeDays(when.iso) });
  }
  if (when.kind === "interviewSoon") {
    return t("applications.when.interview", { date: format.relativeDays(when.iso) });
  }
  return t(DATE_TEXT[when.kind], { date: format.date(when.iso) });
}
