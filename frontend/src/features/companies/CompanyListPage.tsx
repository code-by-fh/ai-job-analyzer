"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useOptimistic, useState, useTransition } from "react";
import { SEARCH_LIMITS, type CompanyScope } from "@/api/adminPaths";
import { companySummariesQueryOptions } from "@/api/companies";
import { filterCompanies } from "@/domain/companies";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { CheckField, TextField } from "@/ui/Field";
import { Masthead } from "@/ui/Masthead";
import { CompanyList } from "./CompanyList";
import type { CompaniesUrl } from "./useCompaniesUrl";

const SEARCH_ID = "companies-search";
const ALL_ID = "companies-all";

interface DirectoryScope {
  scope: CompanyScope;
  /** ?alle=1 while /me is unknown: neither scope may be requested yet (ruling 25). */
  waiting: boolean;
  isAdmin: boolean;
}

/** R1: a member never sends scope=all, whatever the URL says; the server would answer 403. */
function useDirectoryScope(all: boolean): DirectoryScope {
  const user = useCurrentUser();
  const isAdmin = user.data?.is_admin === true;
  return { scope: all && isAdmin ? "all" : "own", waiting: all && user.isPending, isAdmin };
}

/** The field is typed into freely; the URL follows once the value settled (one replace per pause). */
function useSearchDraft(url: CompaniesUrl) {
  const [draft, setDraft] = useState(url.location.q);
  const settled = useDebouncedValue(draft, SEARCH_LIMITS.debounceMs);
  const write = useEffectEvent((q: string) => {
    if (q !== url.location.q) url.setQuery(q);
  });
  useEffect(() => write(settled), [settled]);
  return { draft, setDraft };
}

function foundText(t: Translate, count: number): string {
  return count === 1 ? t("companies.foundOne") : t("companies.found", { count });
}

/** D7: Masthead, the search (and for admins the scope), a count line and the list. */
export function CompanyListPage({ url }: { url: CompaniesUrl }) {
  const { t } = useI18n();
  const { scope, waiting, isAdmin } = useDirectoryScope(url.location.all);
  const directory = useQuery({ ...companySummariesQueryOptions(scope), enabled: !waiting });
  const matches = directory.data ? filterCompanies(directory.data, url.location.q) : undefined;
  return (
    <div className="page companies">
      <Masthead title={t("nav.companies")} deck={t("companies.deck")} />
      <CompaniesToolbar url={url} isAdmin={isAdmin} />
      <p className="company-count" role="status">
        {matches ? foundText(t, matches.length) : ""}
      </p>
      <CompanyList query={directory} matches={matches} q={url.location.q} />
    </div>
  );
}

function CompaniesToolbar({ url, isAdmin }: { url: CompaniesUrl; isAdmin: boolean }) {
  return (
    <div className="companies-toolbar">
      <CompanySearch url={url} />
      {isAdmin ? <ScopeCheck url={url} /> : null}
    </div>
  );
}

/**
 * The URL is the source of truth (Back and forward re-sync the check); the optimistic value shows
 * the click at once instead of a frame later, when the router has applied the replace.
 */
function ScopeCheck({ url }: { url: CompaniesUrl }) {
  const { t } = useI18n();
  const [all, setOptimisticAll] = useOptimistic(url.location.all);
  const [, startTransition] = useTransition();
  const change = (on: boolean) =>
    startTransition(() => {
      setOptimisticAll(on);
      url.setAll(on);
    });
  return <CheckField id={ALL_ID} label={t("companies.all")} checked={all} onChange={change} />;
}

function CompanySearch({ url }: { url: CompaniesUrl }) {
  const { t } = useI18n();
  const { draft, setDraft } = useSearchDraft(url);
  return (
    <TextField
      id={SEARCH_ID}
      label={t("companies.search")}
      type="search"
      autoComplete="off"
      maxLength={SEARCH_LIMITS.max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
