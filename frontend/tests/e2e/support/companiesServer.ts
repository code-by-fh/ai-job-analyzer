// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { Request } from "@playwright/test";
import type { CurrentUserBody } from "../../../src/api/auth";
import type { CompanyProfileBody, CompanySummaryBody } from "../../../src/api/companies";
import type { JobListItemBody, JobPageBody } from "../../../src/api/jobList";
import type { SearchResultBody } from "../../../src/api/search";
import {
  ADMIN_LIMITS,
  COMPANIES_PATH,
  SEARCH_LIMITS,
  SEARCH_PATH,
  adminCompanyPath,
} from "../../../src/api/adminPaths";
import { JOBS_PATH } from "../../../src/api/settingsPaths";
import { ADMIN_USER_ID, AUTHENTICATED_ROUTES } from "./fixtures";
import { COMPANY_PROFILE } from "./jobFixtures";
import {
  live,
  reply,
  type MockResponse,
  type MockRoutes,
  type MutableRoutes,
  type Reply,
} from "./mockApi";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
// routers/companies.py ADMINS_ONLY, core/auth.py get_current_admin_user, routers/admin.py COMPANY_NOT_FOUND.
const ADMINS_ONLY = "Admins only";
const NOT_ADMIN = "The user doesn't have enough privileges";
const NO_PROFILE = "Company profile not found";
// core/job_status.py STATUS_SEEN: neither the directory nor the search counts these jobs.
const STATUS_SEEN = "SEEN";
// routers/search.py JOB_RESULTS, services/company_directory.py COMPANY_RESULTS.
const JOB_RESULTS = 8;
const COMPANY_RESULTS = 5;

/** The signed-in account and the other user of the installation. */
export const CS_USERS = { me: ADMIN_USER_ID, other: 2 } as const;

/** A job row as the directory, the job filter and the search read it. */
export interface CompanyJob {
  id: string;
  user_id: number;
  title: string;
  company: string;
  company_domain: string;
  status: string;
  is_archived: boolean;
}

export const CS_JOBS: readonly CompanyJob[] = [
  {
    id: "acme-1",
    user_id: CS_USERS.me,
    title: "Senior Backend Engineer",
    company: "ACME GmbH",
    company_domain: "acme.de",
    status: "OPEN",
    is_archived: false,
  },
  {
    id: "acme-2",
    user_id: CS_USERS.me,
    title: "Platform Engineer",
    company: "ACME GmbH",
    company_domain: "acme.de",
    status: "OPEN",
    is_archived: true,
  },
  {
    id: "initech-1",
    user_id: CS_USERS.me,
    title: "Kotlin Developer",
    company: "Initech AG",
    company_domain: "initech.de",
    status: "APPLIED",
    is_archived: false,
  },
  {
    id: "seen-1",
    user_id: CS_USERS.me,
    title: "Gesehene Stelle",
    company: "Seen GmbH",
    company_domain: "seen.de",
    status: STATUS_SEEN,
    is_archived: false,
  },
  {
    id: "globex-1",
    user_id: CS_USERS.other,
    title: "Data Engineer",
    company: "Globex Corporation",
    company_domain: "globex.de",
    status: "OPEN",
    is_archived: false,
  },
];

const GLOBEX_PROFILE: CompanyProfileBody = {
  ...COMPANY_PROFILE,
  domain: "globex.de",
  name: "Globex Corporation",
  analyzed_at: "2026-10-01T08:00:00+00:00",
};

/** Every domain the server knows (jobs and profiles); GET/POST per domain are exact routes. */
export const CS_DOMAINS = ["acme.de", "initech.de", "seen.de", "globex.de"] as const;

type Body = Record<string, unknown>;
const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** Python's len() counts code points, as pydantic's length bounds do. */
const lengthOf = (text: string) => Array.from(text).length;
/** Python's sort order: code points, not the locale. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const detail = (status: number, code: string): Reply => reply(status, { detail: code });
const refused = (field: string): Reply =>
  reply(HTTP_UNPROCESSABLE, {
    detail: [{ type: "value_error", loc: ["body", field], msg: "refused" }],
  });

function listItem(job: CompanyJob): JobListItemBody {
  const { id, title, company, status, is_archived } = job;
  return { id, title, company, status, is_archived, created_at: "2026-10-05T09:00:00+00:00" };
}

/**
 * The company endpoints by the rules of routers/companies.py, routers/admin.py, routers/jobs.py and
 * routers/search.py: answers come from this state, never from the request body.
 */
export class CompaniesServer {
  jobs: CompanyJob[] = CS_JOBS.map((job) => ({ ...job }));
  profiles: Record<string, CompanyProfileBody> = {
    "acme.de": structuredClone(COMPANY_PROFILE),
    "globex.de": structuredClone(GLOBEX_PROFILE),
  };
  /** Every research start: the domain and whether it forced a refresh. */
  readonly researchStarts: { domain: string; force: boolean }[] = [];
  private admin = true;

  /** GET /me answers a member from now on (same account, so the own jobs stay). */
  setMember(): void {
    this.admin = false;
  }

  me(): CurrentUserBody {
    return { id: CS_USERS.me, username: "admin", is_admin: this.admin };
  }

  private ownJobs(): CompanyJob[] {
    return this.jobs.filter((job) => job.user_id === CS_USERS.me && job.status !== STATUS_SEEN);
  }

  /**
   * services/company_directory.py company_summaries, sorted by name case-insensitively. The server
   * uses casefold(), this lower case: they differ only for letters like "ß", which no fixture has.
   */
  summaries(includeAll: boolean): CompanySummaryBody[] {
    const own = this.ownJobs();
    const domains = new Set(own.map((job) => job.company_domain));
    if (includeAll) Object.keys(this.profiles).forEach((domain) => domains.add(domain));
    const items = [...domains].map((domain) => this.summary(domain, own));
    return items.sort(
      (a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.domain, b.domain),
    );
  }

  private summary(domain: string, own: readonly CompanyJob[]): CompanySummaryBody {
    const jobs = own.filter((job) => job.company_domain === domain);
    const profile = this.profiles[domain];
    return {
      domain,
      name: profile?.name || jobs[0]?.company || domain,
      has_profile: profile !== undefined,
      analyzed_at: profile?.analyzed_at ?? null,
      job_count: jobs.length,
    };
  }

  /** GET /companies?scope=own|all: all is 403 for a member. */
  directory(request: Request): Reply | { items: CompanySummaryBody[] } {
    const all = new URL(request.url()).searchParams.get("scope") === "all";
    if (all && !this.admin) return detail(HTTP_FORBIDDEN, ADMINS_ONLY);
    return { items: this.summaries(all) };
  }

  /** GET /companies/{domain}: 404 without a profile. */
  profile(domain: string): Reply | CompanyProfileBody {
    const profile = this.profiles[domain];
    return profile ? structuredClone(profile) : detail(HTTP_NOT_FOUND, NO_PROFILE);
  }

  /** POST /companies/{domain}/analyze: "exists" for a profile unless forced; the spec pushes the event. */
  analyze(domain: string, sent: unknown): { status: string; domain: string } {
    const force = isObject(sent) && sent.force_refresh === true;
    this.researchStarts.push({ domain, force });
    const status = this.profiles[domain] && !force ? "exists" : "queued";
    return { status, domain };
  }

  /** PATCH /admin/companies/{domain}: 403 member, 422 name outside 1-200 after the trim, 404 no profile. */
  rename(domain: string, sent: unknown): Reply | { domain: string; name: string } {
    if (!this.admin) return detail(HTTP_FORBIDDEN, NOT_ADMIN);
    const name = isObject(sent) && typeof sent.name === "string" ? sent.name.trim() : "";
    if (lengthOf(name) < 1 || lengthOf(name) > ADMIN_LIMITS.companyName) return refused("name");
    const profile = this.profiles[domain];
    if (!profile) return detail(HTTP_NOT_FOUND, NO_PROFILE);
    profile.name = name;
    return { domain, name };
  }

  /** DELETE /admin/companies/{domain}: only the profile goes, the jobs keep their domain. */
  deleteProfile(domain: string): Reply | { status: string } {
    if (!this.admin) return detail(HTTP_FORBIDDEN, NOT_ADMIN);
    if (!this.profiles[domain]) return detail(HTTP_NOT_FOUND, NO_PROFILE);
    delete this.profiles[domain];
    return { status: "deleted" };
  }

  /** GET /jobs?company_domain=: the own non-SEEN jobs there, active ones unless is_archived=true. */
  companyJobs(query: URLSearchParams): JobPageBody {
    const domain = query.get("company_domain");
    const archived = query.get("is_archived") === "true";
    const items = this.ownJobs()
      .filter((job) => job.company_domain === domain && job.is_archived === archived)
      .map(listItem);
    return { items, total: items.length };
  }

  /** GET /search?q=: 2-200 code points after the trim; own non-SEEN jobs (active first) and companies. */
  search(query: URLSearchParams): Reply | SearchResultBody {
    const text = (query.get("q") ?? "").trim();
    const length = lengthOf(text);
    if (length < SEARCH_LIMITS.min || length > SEARCH_LIMITS.max)
      return reply(HTTP_UNPROCESSABLE, { detail: [{ loc: ["query", "q"], msg: "refused" }] });
    const needle = text.toLowerCase();
    const has = (value: string) => value.toLowerCase().includes(needle);
    const companies = this.summaries(false)
      .filter((item) => has(item.name) || has(item.domain))
      .slice(0, COMPANY_RESULTS)
      .map(({ domain, name }) => ({ domain, name }));
    return { jobs: this.jobHits(has), companies };
  }

  private jobHits(has: (value: string) => boolean): SearchResultBody["jobs"] {
    return this.ownJobs()
      .filter((job) => has(job.title) || has(job.company))
      .sort((a, b) => Number(a.is_archived) - Number(b.is_archived))
      .slice(0, JOB_RESULTS)
      .map(({ id, title, company, company_domain, status, is_archived }) => {
        return { id, title, company, company_domain, status, is_archived };
      });
  }
}

const companyPath = (domain: string) => `${COMPANIES_PATH}/${encodeURIComponent(domain)}`;

/** Per domain: the profile, the research start and the admin rename/delete (exact keys in mockApi). */
function domainRoutes(server: CompaniesServer): MockRoutes {
  return Object.fromEntries(
    CS_DOMAINS.flatMap((domain) => [
      [`GET ${companyPath(domain)}`, live(() => server.profile(domain))],
      [`POST ${companyPath(domain)}/analyze`, live((sent) => server.analyze(domain, sent))],
      [`PATCH ${adminCompanyPath(domain)}`, live((sent) => server.rename(domain, sent))],
      [`DELETE ${adminCompanyPath(domain)}`, live(() => server.deleteProfile(domain))],
    ]),
  );
}

/** A company's job list from the server; any other list query goes to the base's GET /jobs. */
function jobsRoute(server: CompaniesServer, fallback: MockResponse | undefined): MockResponse {
  return live((sent, request) => {
    const query = new URL(request.url()).searchParams;
    if (query.has("company_domain")) return server.companyJobs(query);
    if (!fallback) return reply(HTTP_NOT_FOUND, { detail: "not mocked" });
    return fallback.respond ? fallback.respond(sent, request) : fallback.body;
  });
}

/**
 * The company routes over `base` (by default the authenticated shell), settings-pattern. GET /me
 * comes from the server, so `setMember()` turns the account into a member.
 */
export function companiesRoutes(
  server = new CompaniesServer(),
  extra: MockRoutes = {},
  base: MockRoutes = AUTHENTICATED_ROUTES,
): MutableRoutes {
  return {
    ...base,
    "GET /me": live(() => server.me()),
    [`GET ${COMPANIES_PATH}`]: live((_sent, request) => server.directory(request)),
    [`GET ${JOBS_PATH}`]: jobsRoute(server, base[`GET ${JOBS_PATH}`]),
    [`GET ${SEARCH_PATH}`]: live((_sent, request) =>
      server.search(new URL(request.url()).searchParams),
    ),
    ...domainRoutes(server),
    ...extra,
  };
}
