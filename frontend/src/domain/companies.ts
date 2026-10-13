// Runtime imports stay relative: e2e fixtures load this module outside the app's path aliases.
import type { CompanySummary } from "../api/companies";
import { normalizeDomain } from "./companyDomain";
import type { TaskPhase } from "./pendingTasks";

/** The Firmen page; the detail is ?domain= (phase 2 contract of the Firma tab). */
export const COMPANIES_HREF = "/companies";
const DOMAIN_PARAM = "domain";
const QUERY_PARAM = "q";
const ALL_PARAM = "alle";
const ALL_VALUE = "1";

export interface CompaniesLocation {
  domain: string | null;
  q: string;
  all: boolean;
}

/** Only a domain already in its normal form counts; anything else shows the list, so a crafted link never reaches the API. */
export function companiesLocationOf(params: URLSearchParams): CompaniesLocation {
  const raw = params.get(DOMAIN_PARAM);
  const domain = raw !== null && normalizeDomain(raw) === raw ? raw : null;
  return {
    domain,
    q: params.get(QUERY_PARAM) ?? "",
    all: params.get(ALL_PARAM) === ALL_VALUE,
  };
}

/**
 * A detail link also carries the list's filter and scope, so its "Alle Firmen" link returns to
 * them, after a reload too (7b ruling 14 c).
 */
export function companiesHref(location: CompaniesLocation): string {
  const params = new URLSearchParams();
  if (location.domain) params.set(DOMAIN_PARAM, location.domain);
  if (location.q) params.set(QUERY_PARAM, location.q);
  if (location.all) params.set(ALL_PARAM, ALL_VALUE);
  const query = params.toString();
  return query ? `${COMPANIES_HREF}?${query}` : COMPANIES_HREF;
}

/** A literal substring of name or domain, case-insensitive; a blank filter keeps every company. */
export function filterCompanies(items: readonly CompanySummary[], q: string): CompanySummary[] {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return [...items];
  const matches = (text: string) => text.toLocaleLowerCase().includes(needle);
  return items.filter((item) => matches(item.name) || matches(item.domain));
}

export type ResearchState = "done" | "running" | "none";

/** A research this tab started wins over the stored state, until company_profile_ready ends it. */
export function researchStateOf(summary: CompanySummary, phase: TaskPhase): ResearchState {
  if (phase === "running" || phase === "stalled") return "running";
  return summary.has_profile ? "done" : "none";
}
