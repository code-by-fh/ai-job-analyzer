"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { isApiDate } from "@/domain/calendar";
import { phaseIndex, phaseOf } from "@/domain/jobStatus";
import { hostOf, safeHref } from "@/domain/links";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import { navKeyForJob } from "@/features/shell/navigation";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { useJobFormat } from "./format/useJobFormat";

const RECEDE_FROM = phaseIndex("APPLIED");
const BAND_CLASS = { strong: "strong", possible: null, weak: "weak" } as const;

export function JobCrumbs({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const inbox = navKeyForJob(job) === "inbox";
  return (
    <nav className="crumbs" aria-label={t("job.crumbs")}>
      <Link href={inbox ? "/inbox" : "/applications"}>
        {t(inbox ? "nav.inbox" : "nav.applications")}
      </Link>
      <Icon icon={ChevronRight} />
      <span>{job.company ?? t("job.unknownCompany")}</span>
    </nav>
  );
}

/** Title block (spec 4.2): monogram, title, company, meta, posting link and the big score. */
export function JobHeader({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <header className="jd-head">
      <Monogram name={job.company} />
      <div className="jd-headline">
        <h1 className="jd-title" id="jd-title">
          {job.title ?? t("job.untitled")}
        </h1>
        <p className="jd-meta">{job.company ?? t("job.unknownCompany")}</p>
        <JobMetaLine job={job} />
        <ArchiveNote job={job} />
      </div>
      <ScoreBox score={job.match_score} recede={phaseIndex(phaseOf(job)) >= RECEDE_FROM} />
    </header>
  );
}

/** The job fields the meta line reads; a list item (inbox preview) has them too. */
export type JobMeta = Pick<JobDetail, "url" | "created_at">;

/** "Gefunden am …", source host and the posting link (http(s) only). */
export function JobMetaLine({ job }: { job: JobMeta }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const host = hostOf(job.url);
  const href = safeHref(job.url);
  return (
    <p className="jd-meta jd-meta-sub">
      {job.created_at && isApiDate(job.created_at) ? (
        <span>{t("job.foundOn", { date: format.date(job.created_at) })}</span>
      ) : null}
      {host ? <span>{t("job.via", { host })}</span> : null}
      {href ? (
        <a className="link" href={href} target="_blank" rel="noopener noreferrer">
          {t("job.posting")}
          <Icon icon={ExternalLink} />
        </a>
      ) : null}
    </p>
  );
}

export type JobArchiveState = Pick<JobDetail, "is_archived" | "archive_reason">;

/** Why an archived job is out of "Neu": the threshold, else the user. */
export function ArchiveNote({ job }: { job: JobArchiveState }) {
  const { t } = useI18n();
  if (!job.is_archived) return null;
  const key = job.archive_reason === "THRESHOLD" ? "job.archivedThreshold" : "job.archivedUser";
  return <p className="jd-meta jd-meta-sub">{t(key)}</p>;
}

export function ScoreBox({ score, recede }: { score: number | null | undefined; recede: boolean }) {
  const { t } = useI18n();
  if (score === null || score === undefined) return <UnscoredBox />;
  const shown = roundScore(score);
  const band = scoreBand(shown);
  return (
    <div className={cx("jd-scorebox", BAND_CLASS[band], recede && "recede")}>
      <div className="jd-score" aria-label={t("job.scoreAria", { score: shown })}>
        {shown}
      </div>
      <div className="jd-band">
        <span className="jd-band-w">{t(BAND_LABEL[band])}</span>
        <span className="jd-band-of">{t("job.scoreOf")}</span>
      </div>
    </div>
  );
}

function UnscoredBox() {
  const { t } = useI18n();
  return (
    <div className="jd-scorebox unscored">
      <div className="jd-score" aria-hidden="true">
        –
      </div>
      <div className="jd-band">
        <span className="jd-band-of">{t("job.unscored")}</span>
      </div>
    </div>
  );
}
