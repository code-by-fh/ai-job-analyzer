"use client";

import { useQuery } from "@tanstack/react-query";
import { platformsQueryOptions } from "@/api/platforms";
import { useI18n } from "@/i18n/useI18n";

export interface CrawlSource {
  name: string;
  favicon_url: string | null;
  /** Null for imports: they have no source to open. */
  platformId: number | null;
}

/**
 * The source's own name and favicon for a crawl; the crawled host when the crawl is an import or
 * the source list does not know it (yet).
 */
export function useCrawlSource(run: { source: string; platformId: number | null }): CrawlSource {
  const { t } = useI18n();
  const platforms = useQuery({ ...platformsQueryOptions(), enabled: run.platformId !== null });
  const platform = platforms.data?.find((entry) => entry.id === run.platformId);
  return {
    name: platform?.name ?? (run.source || t("activity.unknownSource")),
    favicon_url: platform?.favicon_url ?? null,
    platformId: platform ? platform.id : null,
  };
}
