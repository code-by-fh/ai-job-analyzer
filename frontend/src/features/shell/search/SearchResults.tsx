"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SearchResult } from "@/api/search";
import { companiesHref } from "@/domain/companies";
import { statusLabel } from "@/features/job/labels";
import { jobRoute } from "@/features/shell/routes";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";

type JobHit = SearchResult["jobs"][number];
type CompanyHit = SearchResult["companies"][number];

interface SearchResultsProps {
  result: SearchResult;
  /** Runs when a result link is followed; the link itself navigates. */
  onNavigate: () => void;
}

interface ResultGroupProps {
  id: string;
  titleKey: MessageKey;
  children: ReactNode;
}

function ResultGroup({ id, titleKey, children }: ResultGroupProps) {
  const { t } = useI18n();
  const headingId = `search-group-${id}`;
  return (
    <section className="search-group">
      <h3 id={headingId} className="sec-title-sm">
        {t(titleKey)}
      </h3>
      <ul role="list" className="search-list" aria-labelledby={headingId}>
        {children}
      </ul>
    </section>
  );
}

/** The space between title and meta keeps the two apart in the link's accessible name. */
function ResultLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <Link className="search-hit" href={href} data-result onClick={onNavigate}>
        {children}
      </Link>
    </li>
  );
}

/** D10: title, then company and phase label, or the archived marker (ruling 35). */
function JobResult({ job, onNavigate }: { job: JobHit; onNavigate: () => void }) {
  const { t } = useI18n();
  const state = t(job.is_archived ? "jobs.archivedTag" : statusLabel(job.status));
  const meta = job.company ? `${job.company} · ${state}` : state;
  return (
    <ResultLink href={jobRoute(job.id)} onNavigate={onNavigate}>
      <span className="search-hit-title">{job.title || t("job.untitled")}</span>{" "}
      <span className="meta muted">{meta}</span>
    </ResultLink>
  );
}

function CompanyResult({ company, onNavigate }: { company: CompanyHit; onNavigate: () => void }) {
  const href = companiesHref({ domain: company.domain, q: "", all: false });
  return (
    <ResultLink href={href} onNavigate={onNavigate}>
      <span className="search-hit-title">{company.name}</span>{" "}
      <span className="meta muted">{company.domain}</span>
    </ResultLink>
  );
}

/** D10: the groups "Stellen" and "Firmen" as lists of links; a group without hits is left out. */
export function SearchResults({ result, onNavigate }: SearchResultsProps) {
  return (
    <>
      {result.jobs.length > 0 ? (
        <ResultGroup id="jobs" titleKey="search.jobs">
          {result.jobs.map((job) => (
            <JobResult key={job.id} job={job} onNavigate={onNavigate} />
          ))}
        </ResultGroup>
      ) : null}
      {result.companies.length > 0 ? (
        <ResultGroup id="companies" titleKey="search.companies">
          {result.companies.map((company) => (
            <CompanyResult key={company.domain} company={company} onNavigate={onNavigate} />
          ))}
        </ResultGroup>
      ) : null}
    </>
  );
}
