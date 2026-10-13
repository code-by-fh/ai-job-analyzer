"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  applicationsHref,
  CLOSED_QUERY_KEY,
  closedOpenFromParam,
  PHASE_QUERY_KEY,
  phaseFilterFromParam,
  SEARCH_QUERY_KEY,
  searchFromParam,
  type ApplicationsLocation,
  type PhaseFilter,
} from "@/domain/applications";

export interface ApplicationsUrl {
  q: string;
  phase: PhaseFilter | null;
  closedOpen: boolean;
  setSearch: (q: string) => void;
  setPhase: (phase: PhaseFilter | null) => void;
  setClosedOpen: (open: boolean) => void;
}

/** Decision D1: search, phase filter and the closed section live in the query string (spec 2.3). */
export function useApplicationsUrl(): ApplicationsUrl {
  const params = useSearchParams();
  const router = useRouter();
  const current = {
    q: searchFromParam(params.get(SEARCH_QUERY_KEY)),
    phase: phaseFilterFromParam(params.get(PHASE_QUERY_KEY)),
    closedOpen: closedOpenFromParam(params.get(CLOSED_QUERY_KEY)),
  };
  // replace, not push: Back leaves Bewerbungen instead of walking through every keystroke.
  const go = (patch: ApplicationsLocation) =>
    router.replace(applicationsHref({ ...current, ...patch }), { scroll: false });
  return {
    ...current,
    setSearch: (q) => go({ q }),
    setPhase: (phase) => go({ phase }),
    setClosedOpen: (closedOpen) => go({ closedOpen }),
  };
}
