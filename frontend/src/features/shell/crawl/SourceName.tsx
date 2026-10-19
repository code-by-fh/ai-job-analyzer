"use client";

import Link from "next/link";
import { sourcesHref } from "@/domain/sources";
import type { CrawlSource } from "./useCrawlSource";

interface SourceNameProps {
  source: CrawlSource;
  /** Closes the surrounding popover or sheet when the link leaves for the source. */
  onNavigate?: () => void;
}

/** The crawled source's name; a link to its drawer when it is a source (imports have none). */
export function SourceName({ source, onNavigate }: SourceNameProps) {
  if (source.platformId === null) return <span className="crawl-name">{source.name}</span>;
  return (
    <Link
      className="crawl-name crawl-link"
      href={sourcesHref({ sourceId: source.platformId })}
      onClick={onNavigate}
    >
      {source.name}
    </Link>
  );
}
