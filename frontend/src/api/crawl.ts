import { z } from "zod";
import { api } from "./instance";
import { CANCEL_CRAWL_PATH } from "./platformPaths";

// The scraper omits counters before the first progress event.
const crawlJobSchema = z.object({
  job_id: z.string(),
  platform: z.string(),
  // Null for imports; set for source crawls (backend Task 2).
  platform_id: z.number().int().nullish(),
  status: z.string(),
  total: z.number().default(0),
  scraping_completed: z.number().default(0),
});
export type CrawlJob = z.infer<typeof crawlJobSchema>;

const crawlStatusSchema = z.object({ jobs: z.array(crawlJobSchema) });
export type CrawlStatusBody = z.input<typeof crawlStatusSchema>;

/** Crawls of the signed-in user (the scraper reads the user from the session cookie). */
export async function fetchCrawlJobs(): Promise<CrawlJob[]> {
  const status = await api.request("/scraper/crawl-status", crawlStatusSchema);
  return status.jobs;
}

const cancelledSchema = z.object({ status: z.string() });

/** A refusal is 200 + {status:"error"}, which the client turns into an UPSTREAM_ERROR. */
export async function cancelCrawl(jobId: string): Promise<void> {
  await api.request(CANCEL_CRAWL_PATH, cancelledSchema, {
    method: "POST",
    json: { job_id: jobId },
  });
}
