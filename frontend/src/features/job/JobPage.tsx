"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import type { JobDetail } from "@/api/jobs";
import { ApiError } from "@/api/errors";
import { PageError } from "@/features/shell/PageError";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { PageSkeleton } from "@/ui/Skeleton";
import { JobCrumbs, JobHeader } from "./JobHeader";
import { DatesCard } from "./dates/DatesCard";
import { NextStepCard } from "./next/NextStepCard";
import { PhaseTrack } from "./phase/PhaseTrack";
import { JobTabs } from "./tabs/JobTabs";
import { useJob } from "./useJob";

const isNotFound = (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND";

/** The one job view (spec 4.2): replaces the side panel, the modal and the old detail page. */
export function JobPage({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  if (job.data) return <JobView job={job.data} />;
  if (job.isError && isNotFound(job.error)) return <JobNotFound />;
  if (job.isError) return <PageError error={job.error} onRetry={() => void job.refetch()} />;
  return <PageSkeleton />;
}

/** Desktop: tabs left, sticky next-step column right. Mobile: header, next card, tabs (DOM order). */
function JobView({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <article className="page jd" aria-labelledby="jd-title">
      <JobCrumbs job={job} />
      <JobHeader job={job} />
      <PhaseTrack job={job} />
      <div className="jd-grid">
        <aside className="jd-side" aria-label={t("next.kicker")}>
          <NextStepCard job={job} />
          <DatesCard job={job} />
        </aside>
        <div className="jd-main">
          <JobTabs job={job} />
        </div>
      </div>
    </article>
  );
}

function JobNotFound() {
  const { t } = useI18n();
  const back = (
    <Link className="btn" href="/inbox">
      {t("notFound.back")}
    </Link>
  );
  return (
    <div className="page">
      <EmptyState icon={SearchX} title={t("job.notFoundTitle")} actions={back}>
        {t("job.notFoundText")}
      </EmptyState>
    </div>
  );
}
