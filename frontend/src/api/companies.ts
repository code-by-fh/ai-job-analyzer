import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Language } from "@/i18n/languages";
import { companiesPath, companyJobsPath, type CompanyScope } from "./adminPaths";
import { ApiError } from "./errors";
import { api } from "./instance";
import { fetchJobPage } from "./jobList";
import { jobPath } from "./jobs";
import { queryKeys } from "./queryKeys";

// The profile is AI output stored as JSON: every field is optional and an odd shape degrades to
// "missing" instead of failing the whole tab.
export const optionalText = z.string().nullish().catch(null);
export const textList = z
  .union([z.string().transform((text) => [text]), z.array(z.string())])
  .nullish()
  .transform((value) => value ?? [])
  .catch([]);

export const deepDiveSchema = z.object({
  title: z.string(),
  focus: z.string().catch(""),
  why_it_matters: optionalText,
  how_to_proceed: z.string().catch(""),
  linked_findings: textList,
});
export type DeepDive = z.infer<typeof deepDiveSchema>;

// One stored run of a deep dive; the error is a fixed code (domain/deepDive.ts), never shown.
const deepDiveRunSchema = z.object({
  focus: z.string(),
  deep_dive_running: z.boolean().default(false),
  deep_dive_started_at: z.string().nullish(),
  deep_dive_error: z.string().nullish(),
  deep_dive_result: z.string().nullish(),
});
export type DeepDiveRun = z.infer<typeof deepDiveRunSchema>;

const analysisSchema = z.object({
  area: z.string(),
  assessment: optionalText,
  evidence_basis: optionalText,
  confidence: optionalText,
  key_uncertainty: optionalText,
});
export type CompanyAnalysis = z.infer<typeof analysisSchema>;

const riskSchema = z.object({
  title: z.string(),
  probability: optionalText,
  impact: optionalText,
  description: optionalText,
});
export type CompanyRisk = z.infer<typeof riskSchema>;

const comparisonPointSchema = z.object({
  dimension: z.string(),
  relative_position: optionalText,
  comment: optionalText,
});
export type ComparisonPoint = z.infer<typeof comparisonPointSchema>;

const companyProfileSchema = z.object({
  domain: z.string(),
  name: z.string().nullish(),
  executive_summary: z
    .object({
      assessment: optionalText,
      confidence: optionalText,
      suitable_for: textList,
      not_suitable_for: textList,
    })
    .nullish()
    .catch(null),
  analysis: z.array(analysisSchema).catch([]),
  key_insights: z
    .object({ facts: textList, interpretations: textList, uncertainties: textList })
    .nullish()
    .catch(null),
  risks: z.array(riskSchema).catch([]),
  market_comparison: z
    .object({ summary: optionalText, comparison_points: z.array(comparisonPointSchema).catch([]) })
    .nullish()
    .catch(null),
  deep_dive_buttons: z.array(deepDiveSchema).catch([]),
  // The requesting user's runs, keyed by focus (core/deep_dive_state.py): they survive a reload.
  deep_dive_runs: z.array(deepDiveRunSchema).default([]).catch([]),
  online_resources: z.unknown(),
  analyzed_at: z.string().nullish(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type CompanyProfileBody = z.input<typeof companyProfileSchema>;

const RESEARCH_START_STATUSES = ["exists", "queued"] as const;
export type ResearchStart = (typeof RESEARCH_START_STATUSES)[number];
const researchStartSchema = z.object({ status: z.enum(RESEARCH_START_STATUSES) });
const deepDiveResultSchema = z.object({ result: z.string() });

export interface DeepDiveRequest {
  focus: string;
  howToProceed: string;
  companyName: string;
  title: string;
  language: Language;
}

// database/core.py MAX_DEEP_DIVE_* (code points). The texts come from AI output and scraped names:
// a clip is harmless, a 422 would leave the user with a generic error.
export const DEEP_DIVE_LIMITS = { text: 2000, companyName: 200, title: 300 } as const;

const clip = (text: string, limit: number) => Array.from(text).slice(0, limit).join("");

/** The focus as sent, and so as the server keys its run. */
export const deepDiveFocus = (focus: string) => clip(focus, DEEP_DIVE_LIMITS.text);

const companyPath = (domain: string) => `/companies/${encodeURIComponent(domain)}`;

/** null while no research exists for the domain (the API answers 404). */
export async function fetchCompany(domain: string): Promise<CompanyProfile | null> {
  try {
    return await api.request(companyPath(domain), companyProfileSchema);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/** Ends with company_profile_ready; "exists" means nothing was started. */
export async function startCompanyResearch(
  domain: string,
  forceRefresh: boolean,
): Promise<ResearchStart> {
  const json = { force_refresh: forceRefresh };
  const started = await api.request(`${companyPath(domain)}/analyze`, researchStartSchema, {
    method: "POST",
    json,
  });
  return started.status;
}

/**
 * Researches the company of a job; ends with company_profile_ready carrying the job id. The typed
 * domain replaces the stored one as is, null lets the server's AI identify it. "exists" links a
 * stored profile and starts nothing.
 */
export async function startJobCompanyResearch(
  jobId: string,
  domain: string | null,
  forceRefresh: boolean,
): Promise<ResearchStart> {
  const json = { company_domain: domain, force_refresh: forceRefresh };
  const started = await api.request(`${jobPath(jobId)}/company-research`, researchStartSchema, {
    method: "POST",
    json,
  });
  return started.status;
}

/**
 * Synchronous AI call (can take tens of seconds). The server also stores the run per user and
 * focus (deep_dive_runs of the profile), so a reload shows it; 409 `deep_dive_running` while it runs.
 */
export async function runDeepDive(domain: string, request: DeepDiveRequest): Promise<string> {
  const json = {
    focus: deepDiveFocus(request.focus),
    how_to_proceed: clip(request.howToProceed, DEEP_DIVE_LIMITS.text),
    company_name: clip(request.companyName, DEEP_DIVE_LIMITS.companyName),
    title: clip(request.title, DEEP_DIVE_LIMITS.title),
    language: request.language,
  };
  const body = await api.request(`${companyPath(domain)}/deep-dive`, deepDiveResultSchema, {
    method: "POST",
    json,
  });
  return body.result;
}

export function companyQueryOptions(domain: string) {
  return queryOptions({ queryKey: queryKeys.company(domain), queryFn: () => fetchCompany(domain) });
}

// services/company_directory.py _summary. job_count counts every own non-SEEN job, archived included.
const companySummarySchema = z.object({
  domain: z.string(),
  name: z.string(),
  has_profile: z.boolean(),
  analyzed_at: z.string().nullish(),
  job_count: z.number().int(),
});
export type CompanySummary = z.infer<typeof companySummarySchema>;
export type CompanySummaryBody = z.input<typeof companySummarySchema>;
const directorySchema = z.object({ items: z.array(companySummarySchema) });

/** The companies of the user's own jobs, sorted by name; "all" (admins only) adds every profile. */
export function companySummariesQueryOptions(scope: CompanyScope) {
  return queryOptions({
    queryKey: queryKeys.companies(scope),
    queryFn: async () => (await api.request(companiesPath(scope), directorySchema)).items,
  });
}

/** The user's active or archived jobs at one company (G7), newest first. */
export function companyJobsQueryOptions(domain: string, archived: boolean) {
  return queryOptions({
    queryKey: queryKeys.companyJobs(domain, archived),
    queryFn: () => fetchJobPage(companyJobsPath(domain, archived)),
  });
}
