"use client";

import Link from "next/link";
import type { CompanySummary } from "@/api/companies";
import { companiesHref, researchStateOf, type CompaniesLocation } from "@/domain/companies";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useJobFormat } from "@/features/job/format/useJobFormat";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Monogram } from "@/ui/Monogram";

/** "{n} Stellen", as the row and the detail header count the user's jobs at a company. */
export function jobsText(t: Translate, count: number): string {
  if (count === 0) return t("companies.jobsNone");
  return count === 1 ? t("companies.jobsOne") : t("companies.jobs", { count });
}

/** "Recherchiert am …", "Recherche läuft …" (a research this tab started) or "Noch nicht recherchiert". */
function useResearchText(company: CompanySummary): string {
  const { t } = useI18n();
  const format = useJobFormat();
  const state = researchStateOf(company, useTaskPhase(pendingTaskId.research(company.domain)));
  if (state === "running") return t("companies.running");
  if (state === "none") return t("companies.none");
  return company.analyzed_at
    ? t("companies.researched", { date: format.date(company.analyzed_at) })
    : t("companies.researchedUndated");
}

interface CompanyRowProps {
  company: CompanySummary;
  /** The list's filter and scope; the detail link keeps them for its way back. */
  list: CompaniesLocation;
}

/** One company: the name is the row's only control, a link stretched over the row (spec 4.3 #5). */
export function CompanyRow({ company, list }: CompanyRowProps) {
  const { t } = useI18n();
  const research = useResearchText(company);
  const href = companiesHref({ ...list, domain: company.domain });
  return (
    <li>
      <Monogram name={company.name} />
      <div className="company-main">
        <Link className="company-link" href={href}>
          {company.name}
        </Link>
        <p className="company-meta">
          {[company.domain, research, jobsText(t, company.job_count)].join(" · ")}
        </p>
      </div>
    </li>
  );
}
