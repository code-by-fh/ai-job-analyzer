"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { companiesHref, companiesLocationOf, type CompaniesLocation } from "@/domain/companies";

export interface CompaniesUrl {
  location: CompaniesLocation;
  setQuery: (q: string) => void;
  setAll: (on: boolean) => void;
}

/** D7: the open company, the search and the admin scope live in the query string. */
export function useCompaniesUrl(): CompaniesUrl {
  const params = useSearchParams();
  const router = useRouter();
  const location = companiesLocationOf(params);
  // replace, not push: Back leaves Firmen instead of walking through every keystroke.
  const go = (patch: Partial<CompaniesLocation>) =>
    router.replace(companiesHref({ ...location, ...patch }), { scroll: false });
  return {
    location,
    setQuery: (q) => go({ q }),
    setAll: (all) => go({ all }),
  };
}
