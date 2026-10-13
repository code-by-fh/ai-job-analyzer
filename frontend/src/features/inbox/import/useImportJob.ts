"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importJobByUrl } from "@/api/imports";
import { markImportStarted } from "@/realtime/useImports";

/** Starts the import; from then on realtime events drive it (decision D7). */
export function useImportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importJobByUrl,
    // Tracked as soon as the crawl id is known, so early events are replayed (importSignals).
    onSuccess: (crawlId) => markImportStarted(queryClient, crawlId, Date.now()),
  });
}
