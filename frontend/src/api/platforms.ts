import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { isFailingSource } from "@/domain/sources";
import { api } from "./instance";
import {
  PLATFORM_SETUP_PATH,
  PLATFORMS_PATH,
  PREVIEW_LINKS_PATH,
  platformCrawlPath,
  platformNamePath,
  platformPath,
  platformRunsPath,
  platformTestPath,
  type InitialRun,
  type NotifyChannel,
} from "./platformPaths";
import { queryKeys } from "./queryKeys";

// B9 summary of the last crawl; error is a fixed code (cancelled, unreachable, failed); seeded = B8 seed run.
const lastRunSchema = z.object({
  error: z.string().nullish(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
  found: z.number().int().nullish(),
  new: z.number().int().nullish(),
  matched: z.number().int().nullish(),
  seeded: z.boolean().nullish(),
});

// Free JSON columns: an odd shape reads as empty, not as a broken list.
const stringList = z.array(z.string()).nullish().catch(null);

export const platformSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string(),
  is_active: z.boolean().default(true),
  setup_status: z.string().default("active"),
  url_pattern: z.string().nullish(),
  schedule_time: z.string().nullish(),
  schedule_days: z.array(z.number().int()).nullish().catch(null),
  last_crawl_at: z.string().nullish(),
  last_run: lastRunSchema.nullish().catch(null),
  notification_adapters: stringList,
  pushover_template: z.string().nullish(),
  resend_template: z.string().nullish(),
  resend_recipients: stringList,
  mailjet_template: z.string().nullish(),
  mailjet_recipients: stringList,
  smtp_template: z.string().nullish(),
  smtp_recipients: stringList,
});
export type Platform = z.infer<typeof platformSchema>;
export type PlatformBody = z.input<typeof platformSchema>;

/** Only the fields a drawer section owns; the server applies exactly the keys sent (D5). */
export interface PlatformPatch {
  name?: string;
  url?: string;
  url_pattern?: string;
  is_active?: boolean;
  schedule_time?: string | null;
  schedule_days?: number[] | null;
  notification_adapters?: NotifyChannel[];
  pushover_template?: string | null;
  resend_template?: string | null;
  mailjet_template?: string | null;
  smtp_template?: string | null;
  resend_recipients?: string[] | null;
  mailjet_recipients?: string[] | null;
  smtp_recipients?: string[] | null;
}

export async function fetchPlatforms(): Promise<Platform[]> {
  return api.request(PLATFORMS_PATH, z.array(platformSchema));
}

export function platformsQueryOptions() {
  return queryOptions({ queryKey: queryKeys.platforms, queryFn: fetchPlatforms });
}

/** Sources badge (D3): the same rule as the banner; cancelled is not an error. */
export function countFailingPlatforms(platforms: readonly Platform[]): number {
  return platforms.filter(isFailingSource).length;
}

export async function patchPlatform({ id, patch }: { id: number; patch: PlatformPatch }) {
  return api.request(platformPath(id), platformSchema, { method: "PATCH", json: patch });
}

const crawlStartedSchema = z.object({ job_id: z.string() });

/** The crawl id the realtime events carry; 409 (CONFLICT) when this source is already crawling. */
export async function startPlatformCrawl(id: number): Promise<string> {
  const started = await api.request(platformCrawlPath(id), crawlStartedSchema, { method: "POST" });
  return started.job_id;
}

const deletedSchema = z.object({ kept_jobs: z.number().int().default(0) });

/** Deletes the source; its jobs stay (G7). Answers how many jobs were kept. */
export async function deletePlatform(id: number): Promise<number> {
  const deleted = await api.request(platformPath(id), deletedSchema, { method: "DELETE" });
  return deleted.kept_jobs;
}

const nameSchema = z.object({ name: z.string() });

export async function suggestPlatformName(id: number): Promise<string> {
  return (await api.request(platformNamePath(id), nameSchema, { method: "POST" })).name;
}

const sentSchema = z.object({ ok: z.boolean() });

export async function sendPlatformTest({ id, channel }: { id: number; channel: NotifyChannel }) {
  await api.request(platformTestPath(id, channel), sentSchema, { method: "POST" });
}

const runSchema = z.object({
  started_at: z.string().nullish(),
  finished_at: z.string(),
  found: z.number().int().default(0),
  new: z.number().int().default(0),
  matched: z.number().int().default(0),
  seeded: z.boolean().default(false),
  error: z.string().nullish(),
});
export type PlatformRun = z.infer<typeof runSchema>;
export type PlatformRunBody = z.input<typeof runSchema>;

export function platformRunsQueryOptions(id: number) {
  return queryOptions({
    queryKey: queryKeys.platformRuns(id),
    queryFn: () => api.request(platformRunsPath(id), z.array(runSchema)),
  });
}

const previewSchema = z.object({
  links: z.array(z.object({ url: z.string(), text: z.string().default("") })),
});
export type PreviewLinksBody = z.input<typeof previewSchema>;
export type PreviewLink = z.infer<typeof previewSchema>["links"][number];

/** Wizard step 1; takes up to 90 s, so the caller passes a signal to abort it (G21). */
export async function previewSourceLinks({
  url,
  signal,
}: {
  url: string;
  signal?: AbortSignal;
}): Promise<PreviewLink[]> {
  const preview = await api.request(PREVIEW_LINKS_PATH, previewSchema, {
    method: "POST",
    json: { url },
    signal,
  });
  return preview.links;
}

export interface PlatformSetupRequest {
  url: string;
  selected_urls: string[];
  initial_run: InitialRun;
  name?: string;
  schedule_time: string | null;
  schedule_days: number[] | null;
  url_pattern?: string;
}

const setupSchema = platformSchema.extend({ initial_crawl_started: z.boolean().default(false) });
export type PlatformSetupResult = z.infer<typeof setupSchema>;
export type PlatformSetupBody = z.input<typeof setupSchema>;

export async function setupPlatform(request: PlatformSetupRequest): Promise<PlatformSetupResult> {
  return api.request(PLATFORM_SETUP_PATH, setupSchema, { method: "POST", json: request });
}
