"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { cancelCrawl } from "@/api/crawl";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { startPlatformCrawl, type Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { sourceLabel, type ActivityState } from "@/realtime/activity";
import { markCrawlStarted } from "@/realtime/useActivity";
import { useToast, type ToastApi } from "@/ui/ToastProvider";
import { isProfileRequired } from "../profileGate";

// Start and cancel of one source run one after the other: a cancel never overtakes its start.
const crawlScope = (platform: Platform) => ({ id: `crawl-${platform.id}` });

interface StartContext {
  platform: Platform;
  queryClient: QueryClient;
  toast: ToastApi;
  t: Translate;
}

interface Accepted extends StartContext {
  crawlId: string;
}

interface Refusal extends StartContext {
  error: unknown;
}

async function announceStart({ crawlId, platform, queryClient, toast, t }: Accepted) {
  const seed = { id: crawlId, platformId: platform.id, source: sourceLabel(platform.url) };
  await markCrawlStarted(queryClient, seed);
  toast.show({ message: t("sources.crawl.started", { name: platform.name }), tone: "info" });
}

/** D4: a 409 means another crawl of this source runs (scheduler, other tab), so show that one. */
function reportRefusedStart({ error, platform, queryClient, toast, t }: Refusal): void {
  if (isProfileRequired(error)) {
    toast.show({ message: t("sources.profileRequired.error"), tone: "error" });
    return;
  }
  const running = error instanceof ApiError && error.code === "CONFLICT";
  if (!running) {
    toast.show({ message: describeError(error, t), tone: "error" });
    return;
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
  // Not an error: the source is being searched, which is what the user asked for.
  toast.show({ message: t("sources.crawl.alreadyRunning", { name: platform.name }), tone: "info" });
}

interface StartCrawl {
  isPending: boolean;
  /** Ignored while a start of this source is pending, also from a click in the same frame. */
  start: () => void;
}

/** POST /platforms/{id}/crawl; the answer's job_id seeds the bar before the first event (D4). */
export function useStartCrawl(platform: Platform): StartCrawl {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const mutationKey = ["crawl-start", platform.id];
  const mutation = useMutation({
    mutationKey,
    scope: crawlScope(platform),
    mutationFn: () => startPlatformCrawl(platform.id),
    // Awaited, so the start stays pending (Durchsuchen busy) until the bar is in the cache.
    onSuccess: (crawlId) => announceStart({ crawlId, platform, queryClient, toast, t }),
    onError: (error) => reportRefusedStart({ error, platform, queryClient, toast, t }),
  });
  // A double click delivers both clicks before React renders `busy`; the cache knows at once.
  const start = () => {
    if (queryClient.isMutating({ mutationKey }) === 0) mutation.mutate();
  };
  return { isPending: mutation.isPending, start };
}

function hasEnded(queryClient: QueryClient, crawlId: string): boolean {
  const activity = queryClient.getQueryData<ActivityState>(queryKeys.activity);
  return activity?.endedIds.includes(crawlId) ?? false;
}

interface CancelCrawl {
  /** Pending, or accepted and waiting for crawl_job_cancelled to remove the bar. */
  isBusy: boolean;
  /** Ignored while a cancel of this source is pending, also from a click in the same frame. */
  cancel: (crawlId: string) => void;
}

/** POST /scraper/cancel-crawl; success needs nothing here: crawl_job_cancelled ends the task. */
export function useCancelCrawl(platform: Platform): CancelCrawl {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const mutationKey = ["crawl-cancel", platform.id];
  const mutation = useMutation({
    mutationKey,
    scope: crawlScope(platform),
    mutationFn: (crawlId: string) => cancelCrawl(crawlId),
    onError: (_error, crawlId) => {
      // Best effort: the crawl ended on its own meanwhile, so the scraper had nothing to cancel.
      if (!hasEnded(queryClient, crawlId)) {
        toast.show({ message: t("sources.crawl.cancelFailed"), tone: "error" });
      }
    },
  });
  const cancel = (crawlId: string) => {
    if (queryClient.isMutating({ mutationKey }) === 0) mutation.mutate(crawlId);
  };
  // A second cancel after an accepted one would only be refused by the scraper. Should
  // crawl_job_cancelled be lost, the reconnect refetch of the running crawls removes the bar.
  return { isBusy: mutation.isPending || mutation.isSuccess, cancel };
}
