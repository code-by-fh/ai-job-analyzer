import { z } from "zod";
import { api } from "./instance";

// {status:"Started", job_id}; a refusal is 200 + {status:"Error"}, which the client turns into an ApiError.
const importStartedSchema = z.object({ job_id: z.string() });

/** Starts a single-URL import; the answer is the crawl id its realtime events carry. */
export async function importJobByUrl(url: string): Promise<string> {
  const started = await api.request("/scraper/import-job", importStartedSchema, {
    method: "POST",
    json: { url },
  });
  return started.job_id;
}
