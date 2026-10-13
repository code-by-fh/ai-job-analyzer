"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { CompanySummary } from "@/api/companies";
import { companiesLocationOf } from "@/domain/companies";
import { SectionState } from "@/features/profile/SectionState";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";
import { CompanyRow } from "./CompanyRow";

interface CompanyListProps {
  query: UseQueryResult<CompanySummary[]>;
  /** The directory narrowed by the search; undefined until it is loaded. */
  matches: readonly CompanySummary[] | undefined;
  q: string;
}

/** Loading, a fixed error sentence, none at all, none matching, or the rows. */
export function CompanyList({ query, matches, q }: CompanyListProps) {
  return (
    <SectionState query={query}>
      {(items) => <ListBody empty={items.length === 0} matches={matches ?? []} q={q} />}
    </SectionState>
  );
}

interface ListBodyProps {
  empty: boolean;
  matches: readonly CompanySummary[];
  q: string;
}

function ListBody({ empty, matches, q }: ListBodyProps) {
  const { t } = useI18n();
  if (empty)
    return (
      <EmptyState icon={Building2} title={t("companies.emptyTitle")}>
        {t("companies.empty")}
      </EmptyState>
    );
  if (matches.length === 0)
    return <p className="prose company-none">{t("companies.noMatch", { q: q.trim() })}</p>;
  return <CompanyRows items={matches} />;
}

function CompanyRows({ items }: { items: readonly CompanySummary[] }) {
  const { t } = useI18n();
  const list = companiesLocationOf(useSearchParams());
  return (
    <ul role="list" className="company-list" aria-label={t("nav.companies")}>
      {items.map((item) => (
        <CompanyRow key={item.domain} company={item} list={list} />
      ))}
    </ul>
  );
}
