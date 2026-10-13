"use client";

import { MAX_SEARCH_LENGTH } from "@/domain/applications";
import { useI18n } from "@/i18n/useI18n";
import { SEARCH_INPUT_ID, type SearchDraft } from "./useSearchDraft";

export function SearchInput({ draft }: { draft: SearchDraft }) {
  const { t } = useI18n();
  return (
    <input
      id={SEARCH_INPUT_ID}
      className="input"
      type="search"
      autoComplete="off"
      maxLength={MAX_SEARCH_LENGTH}
      placeholder={t("applications.search.placeholder")}
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        draft.reset();
      }}
    />
  );
}
