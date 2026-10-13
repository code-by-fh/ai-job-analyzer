"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { companyJobsQueryOptions } from "@/api/companies";
import type { JobListItem } from "@/api/jobList";
import { givenUp } from "@/api/queryState";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { statusLabel } from "@/features/job/labels";
import { jobRoute } from "@/features/shell/routes";
import { useI18n } from "@/i18n/useI18n";

const OWN_JOBS_HEADING_ID = "company-jobs-h";

/**
 * The user's jobs at a company, active ones first, then the archived ones (7b ruling 7): together
 * they are the directory row's job count. Both requests run in parallel.
 */
export function useCompanyJobs(domain: string) {
  const active = useQuery(companyJobsQueryOptions(domain, false));
  const archived = useQuery(companyJobsQueryOptions(domain, true));
  const loaded = active.data !== undefined && archived.data !== undefined;
  const failed = [active, archived].find((query) => givenUp(query));
  return {
    jobs: loaded ? [...active.data.items, ...archived.data.items] : undefined,
    total: loaded ? active.data.total + archived.data.total : undefined,
    // givenUp also covers a paused (offline) request, which has no error yet.
    failed: failed !== undefined,
    error: failed?.error ?? null,
    // One list failed, but one Retry reloads both, so the two halves come from the same moment.
    retry: () => void Promise.all([active.refetch(), archived.refetch()]),
  };
}

/** D8: "Deine Stellen bei {name}" with links to the job pages, or the sentence that there are none. */
export function CompanyJobs({ domain, name }: { domain: string; name: string }) {
  const { t } = useI18n();
  return (
    <section className="company-sec" aria-labelledby={OWN_JOBS_HEADING_ID}>
      <h2 id={OWN_JOBS_HEADING_ID} className="sec-title">
        {t("companies.ownJobs", { name })}
      </h2>
      <JobsBody domain={domain} />
    </section>
  );
}

function JobsBody({ domain }: { domain: string }) {
  const { t } = useI18n();
  const { jobs, failed, error, retry } = useCompanyJobs(domain);
  if (jobs !== undefined && jobs.length === 0)
    return <p className="prose">{t("companies.noOwnJobs")}</p>;
  if (jobs !== undefined) return <JobLinks jobs={jobs} />;
  if (failed) return <ListError error={error} onRetry={retry} />;
  return <ListLoading stalled={false} />;
}

function JobLinks({ jobs }: { jobs: readonly JobListItem[] }) {
  const { t } = useI18n();
  return (
    <ul role="list" className="company-jobs">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link className="company-job" href={jobRoute(job.id)}>
            <span className="company-job-title">{job.title || t("job.untitled")}</span>
            <span className="company-meta">
              {t(job.is_archived ? "jobs.archivedTag" : statusLabel(job.status))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
