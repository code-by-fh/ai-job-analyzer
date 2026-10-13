"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { companyQueryOptions, companySummariesQueryOptions } from "@/api/companies";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { CompanyJobs, useCompanyJobs } from "./CompanyJobs";
import { jobsText } from "./CompanyRow";
import { CompanyResearchPanel } from "./CompanyResearchPanel";
import { DETAIL_HEADING_ID } from "./afterProfileAction";

/**
 * 7b ruling 14 b: the shared profile names the company once it is loaded (an admin link to a
 * company outside the own directory too), else the own directory entry, else the domain.
 */
function useCompanyName(domain: string): string {
  const profile = useQuery(companyQueryOptions(domain));
  const directory = useQuery(companySummariesQueryOptions("own"));
  const listed = directory.data?.find((item) => item.domain === domain)?.name;
  return profile.data?.name || listed || domain;
}

interface CompanyDetailProps {
  domain: string;
  /** The list with the filter and scope the detail was opened from (7b ruling 14 c). */
  backHref: string;
}

/** D8: the way back, the header, the shared profile with its research, and the user's jobs there. */
export function CompanyDetail({ domain, backHref }: CompanyDetailProps) {
  const { t } = useI18n();
  const name = useCompanyName(domain);
  return (
    <div className="page companies">
      <Link className="link company-back" href={backHref}>
        <Icon icon={ArrowLeft} />
        {t("company.all")}
      </Link>
      <CompanyHead domain={domain} name={name} />
      <CompanyResearchPanel domain={domain} name={name} />
      <CompanyJobs domain={domain} name={name} />
    </div>
  );
}

function CompanyHead({ domain, name }: { domain: string; name: string }) {
  const { t } = useI18n();
  const { total } = useCompanyJobs(domain);
  const meta = total === undefined ? domain : `${domain} · ${jobsText(t, total)}`;
  return (
    <header className="company-head">
      <Monogram name={name} />
      <div className="company-main">
        <h1 id={DETAIL_HEADING_ID} className="company-title" tabIndex={-1}>
          {name}
        </h1>
        <p className="company-meta">{meta}</p>
      </div>
    </header>
  );
}
