"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { documentHtmlQueryOptions, type DocumentKind } from "@/api/jobDocuments";

export interface EditSource {
  /** The stored HTML as it was when editing began; undefined while loading. */
  html: string | undefined;
  /** The server copy differs from `html` (regenerated or saved elsewhere). */
  changed: boolean;
}

interface Latch {
  kind: DocumentKind | null;
  html: string | undefined;
}

/**
 * Freezes the HTML for the whole edit: a refetch must never reset the editing frame. Cached
 * data that is still being refetched is not taken, because it may be older than the server copy.
 */
export function useEditSource(jobId: string, kind: DocumentKind, active: boolean): EditSource {
  const query = useQuery({ ...documentHtmlQueryOptions(jobId, kind), enabled: active });
  const [latch, setLatch] = useState<Latch>({ kind: null, html: undefined });
  const current = active ? kind : null;
  const fresh = query.isFetching ? undefined : query.data;
  if (latch.kind !== current) setLatch({ kind: current, html: undefined });
  else if (current && latch.html === undefined && fresh !== undefined) {
    setLatch({ kind: current, html: fresh });
  }
  const html = latch.kind === current ? latch.html : undefined;
  return { html, changed: html !== undefined && query.data !== undefined && query.data !== html };
}
