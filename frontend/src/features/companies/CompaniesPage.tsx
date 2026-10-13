"use client";

import { useEffect, useRef } from "react";
import { companiesHref } from "@/domain/companies";
import { isFocusLost } from "@/ui/focus";
import { MASTHEAD_TITLE_SELECTOR } from "@/ui/Masthead";
import { CompanyDetail } from "./CompanyDetail";
import { CompanyListPage } from "./CompanyListPage";
import { DETAIL_HEADING_ID } from "./afterProfileAction";
import { useCompaniesUrl } from "./useCompaniesUrl";

/**
 * Spec 4.3 #5: list and detail swap in place, so the link that was followed leaves the page. The
 * new view's title takes focus, unless the user already put it somewhere; the first view takes none.
 */
function useSwapFocus(domain: string | null): void {
  const shown = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = shown.current;
    shown.current = domain;
    if (previous === undefined || previous === domain || !isFocusLost()) return;
    const heading = domain
      ? document.getElementById(DETAIL_HEADING_ID)
      : document.querySelector<HTMLElement>(MASTHEAD_TITLE_SELECTOR);
    heading?.focus();
  }, [domain]);
}

/** /companies: the list, or with ?domain= one company (phase 2 contract of the Firma tab). */
export function CompaniesPage() {
  const url = useCompaniesUrl();
  const { domain } = url.location;
  useSwapFocus(domain);
  if (!domain) return <CompanyListPage url={url} />;
  return (
    <CompanyDetail domain={domain} backHref={companiesHref({ ...url.location, domain: null })} />
  );
}
