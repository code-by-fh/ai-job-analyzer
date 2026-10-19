import { z } from "zod";

/**
 * Real crawl progress (backend core/crawl_progress.py): the pipeline stage and its counters. Work is
 * two steps per new link (fetch its page, analyse its job); work_done reaches work_total only at the end.
 * `stage` stays a string so a stage the web does not know yet never drops the whole message.
 */
export const crawlProgressSchema = z.object({
  stage: z.string(),
  links_found: z.number(),
  links_matched: z.number(),
  links_new: z.number(),
  pages_fetched: z.number(),
  pages_failed: z.number(),
  jobs_analysed: z.number(),
  jobs_skipped: z.number(),
  work_done: z.number(),
  work_total: z.number(),
});
export type CrawlProgress = z.infer<typeof crawlProgressSchema>;
