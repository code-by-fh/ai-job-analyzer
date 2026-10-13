import type { CurrentUserBody } from "@/api/auth";
import type { CompanyProfileBody, CompanySummaryBody } from "@/api/companies";
import type { JobPageBody } from "@/api/jobList";
import { jsonResponse, type RecordedCall } from "./fakeFetch";
import type { RouteTable } from "./stubRoutes";

export const ADMIN: CurrentUserBody = { id: 1, username: "admin", is_admin: true };
export const MEMBER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

/** GET /companies (scope own): the user's companies, sorted by name like company_summaries. */
export const COMPANY_SUMMARIES: CompanySummaryBody[] = [
  {
    domain: "acme.de",
    name: "ACME GmbH",
    has_profile: true,
    analyzed_at: "2026-10-07T10:00:00Z",
    job_count: 2,
  },
  { domain: "initech.de", name: "Initech AG", has_profile: false, analyzed_at: null, job_count: 1 },
];

/** Scope all adds every profile of the installation; a foreign one counts none of the user's jobs. */
export const ALL_COMPANY_SUMMARIES: CompanySummaryBody[] = [
  ...COMPANY_SUMMARIES,
  {
    domain: "globex.de",
    name: "Globex Corporation",
    has_profile: true,
    analyzed_at: "2026-10-01T08:00:00Z",
    job_count: 0,
  },
];

/** GET /jobs?company_domain=acme.de: one active job there. */
export const COMPANY_JOBS: JobPageBody = {
  items: [{ id: "job-1", title: "Senior Backend Engineer", company: "ACME GmbH", status: "OPEN" }],
  total: 1,
};

/** GET /jobs?company_domain=acme.de&is_archived=true: one archived job; with COMPANY_JOBS the row's 2. */
export const COMPANY_ARCHIVED_JOBS: JobPageBody = {
  items: [
    {
      id: "job-2",
      title: "Platform Engineer",
      company: "ACME GmbH",
      status: "OPEN",
      is_archived: true,
    },
  ],
  total: 1,
};

/** The phase 2 profile fixture of the Firma tab. */
export const PROFILE: CompanyProfileBody = {
  domain: "acme.de",
  name: "ACME GmbH",
  executive_summary: {
    assessment: "Solider Mittelständler.",
    confidence: "Moderate",
    suitable_for: ["Backend"],
    not_suitable_for: [],
  },
  analysis: [{ area: "Kultur", assessment: "Offen und direkt.", confidence: "Low" }],
  key_insights: null,
  risks: [
    { title: "Fluktuation", probability: "Medium", impact: "High", description: "Viele Wechsel." },
  ],
  market_comparison: null,
  deep_dive_buttons: [
    {
      title: "Gehalt",
      focus: "Gehaltsband",
      how_to_proceed: "Portale",
      why_it_matters: "Verhandlung",
    },
  ],
  online_resources: ["https://acme.de/karriere"],
  analyzed_at: "2026-10-07T10:00:00Z",
};

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const scopeOf = (call: RecordedCall) => new URL(call.url).searchParams.get("scope") ?? "own";

/** routers/companies.py list_companies: scope=all is 403 unless `me` is an admin. */
function directory(me: CurrentUserBody) {
  return (call: RecordedCall) => {
    if (scopeOf(call) !== "all") return jsonResponse(200, { items: COMPANY_SUMMARIES });
    if (!me.is_admin) return jsonResponse(HTTP_FORBIDDEN, { detail: "Admins only" });
    return jsonResponse(200, { items: ALL_COMPANY_SUMMARIES });
  };
}

const EMPTY_PAGE: JobPageBody = { items: [], total: 0 };
const NO_PROFILE = () => jsonResponse(HTTP_NOT_FOUND, { detail: "Company profile not found" });

/** routers/jobs.py with company_domain: ACME's jobs (active unless is_archived=true), none elsewhere. */
function companyJobs(call: RecordedCall) {
  const query = new URL(call.url).searchParams;
  if (query.get("company_domain") !== "acme.de") return jsonResponse(200, EMPTY_PAGE);
  const archived = query.get("is_archived") === "true";
  return jsonResponse(200, archived ? COMPANY_ARCHIVED_JOBS : COMPANY_JOBS);
}

/** Everything /companies loads for `me`; `overrides` replaces or adds routes. */
export function companiesStubs(me: CurrentUserBody = MEMBER, overrides: RouteTable = {}) {
  return {
    "GET /me": me,
    "GET /companies": directory(me),
    "GET /companies/acme.de": PROFILE,
    "GET /companies/initech.de": NO_PROFILE,
    "GET /jobs": companyJobs,
    ...overrides,
  };
}
