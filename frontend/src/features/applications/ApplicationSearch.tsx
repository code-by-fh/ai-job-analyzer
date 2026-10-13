"use client";

import { Search } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { SearchInput } from "./SearchInput";
import { SEARCH_INPUT_ID, type SearchDraft } from "./useSearchDraft";

/** Spec 4.2 header search. Escape clears a type="search" field natively (decision D3). */
export function ApplicationSearch({ draft }: { draft: SearchDraft }) {
  const { t } = useI18n();
  const label = t("applications.search.label");
  return (
    <form
      className="apps-search"
      role="search"
      aria-label={label}
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="sr-only" htmlFor={SEARCH_INPUT_ID}>
        {label}
      </label>
      <Icon icon={Search} />
      <SearchInput draft={draft} />
    </form>
  );
}
