"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  ADD_PARAM,
  addFromParam,
  SOURCE_PARAM,
  sourceIdFromParam,
  sourcesHref,
} from "@/domain/sources";

export interface SourcesUrl {
  /** The source whose drawer is open (Task 9); null while the wizard is open. */
  sourceId: number | null;
  /** The add wizard is open (Task 12). */
  adding: boolean;
  openSource: (id: number) => void;
  openWizard: () => void;
  close: () => void;
}

/**
 * D1: the open drawer and the wizard live in the query string; replace keeps Back for leaving.
 * The callbacks are stable, so effects that depend on them (useDropUnknownSource) run only on change.
 */
export function useSourcesUrl(): SourcesUrl {
  const params = useSearchParams();
  const router = useRouter();
  const openSource = useCallback(
    (id: number) => router.replace(sourcesHref({ sourceId: id }), { scroll: false }),
    [router],
  );
  const openWizard = useCallback(
    () => router.replace(sourcesHref({ add: true }), { scroll: false }),
    [router],
  );
  const close = useCallback(() => router.replace(sourcesHref(), { scroll: false }), [router]);
  const adding = addFromParam(params.get(ADD_PARAM));
  const sourceId = adding ? null : sourceIdFromParam(params.get(SOURCE_PARAM));
  return { sourceId, adding, openSource, openWizard, close };
}
