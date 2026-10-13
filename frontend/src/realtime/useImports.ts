"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_IMPORTS, type ImportState } from "./imports";
import { readImports } from "./importSignals";

/** Client-only state in the query cache, so applyEvent can finish imports in one place (spec 6). */
export function useImports(): ImportState {
  const queryClient = useQueryClient();
  // The "fetch" re-reads the cache; gcTime keeps a running import after the drawer closed.
  const query = useQuery({
    queryKey: queryKeys.imports,
    queryFn: () => readImports(queryClient),
    initialData: EMPTY_IMPORTS,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return query.data;
}

export { forgetImport, markImportStarted } from "./importSignals";
