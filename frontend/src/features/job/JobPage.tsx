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
import { DatesDrawerProvider } from "./dates/DatesDrawerProvider";
import { NextStepCard } from "./next/NextStepCard";
import { CelebrationProvider } from "./outcome/Celebration";
import { PhaseTrack } from "./phase/PhaseTrack";
import { JobTabs } from "./tabs/JobTabs";
import { TodoList } from "./todos/TodoList";
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

/** Desktop: tabs left, sticky next-step column right. Mobile: header, side cards, tabs (DOM order). */
function JobView({ job }: { job: JobDetail }) {
  return (
    <article className="page jd" aria-labelledby="jd-title">
      <CelebrationProvider>
        <JobCrumbs job={job} />
        <JobHeader job={job} />
        <PhaseTrack job={job} />
        <DatesDrawerProvider job={job}>
          <div className="jd-grid">
            <JobSide job={job} />
            <div className="jd-main">
              <JobTabs job={job} />
            </div>
          </div>
        </DatesDrawerProvider>
      </CelebrationProvider>
    </article>
  );
}

/** Next step, "Termine & Daten" and the to-dos below them (Feedback 1 T13). */
function JobSide({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <aside className="jd-side" aria-label={t("next.kicker")}>
      <NextStepCard job={job} />
      <DatesCard job={job} />
      <TodoList job={job} />
    </aside>
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
