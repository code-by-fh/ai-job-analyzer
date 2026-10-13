"use client";

import { usePrefetchInfiniteQuery, usePrefetchQuery, useQueryClient } from "@tanstack/react-query";
import {
  applicationsListQueryOptions,
  applicationsTotalQueryOptions,
  dueApplicationsQueryOptions,
} from "@/api/jobList";
import { jobCountsQueryOptions } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { ActiveSections } from "./ActiveSections";
import { ApplicationSearch } from "./ApplicationSearch";
import { ApplicationsHeader } from "./ApplicationsHeader";
import { ClosedSection } from "./ClosedSection";
import { PhaseStrip } from "./PhaseStrip";
import { SearchStatus } from "./SearchStatus";
import { useApplicationsUrl, type ApplicationsUrl } from "./useApplicationsUrl";
import { LIST_ID, useListFocus } from "./useListFocus";
import { useSearchDraft, type SearchDraft } from "./useSearchDraft";

/**
 * The closed rows load only while shown (decision D2). When the URL shows them they start with the
 * page instead of after the closed count (RB11). usePrefetchInfiniteQuery has no "enabled", so
 * this does what it does (prefetch unless cached), only conditionally.
 */
function usePrefetchClosedRows(url: ApplicationsUrl): void {
  const client = useQueryClient();
  const options = applicationsListQueryOptions({ group: "closed", q: url.q });
  const shown = url.closedOpen || url.phase === "CLOSED";
  if (shown && !client.getQueryState(options.queryKey)) void client.prefetchInfiniteQuery(options);
}

/** All of the page's requests start at once; nothing waits for another answer (no waterfall). */
function usePrefetchApplications(url: ApplicationsUrl): void {
  usePrefetchInfiniteQuery(applicationsListQueryOptions({ group: "active", q: url.q }));
  usePrefetchClosedRows(url);
  usePrefetchQuery(applicationsTotalQueryOptions({ group: "closed", q: url.q }));
  usePrefetchQuery(jobCountsQueryOptions());
  usePrefetchQuery(dueApplicationsQueryOptions());
}

/** Bewerbungen (spec 4.2): one list of phase sections; rows open the job page (decision D10). */
export function ApplicationsPage() {
  const url = useApplicationsUrl();
  const search = useSearchDraft(url);
  usePrefetchApplications(url);
  return (
    <div className="page applications">
      <ApplicationsHeader actions={<ApplicationSearch draft={search} />} />
      <PhaseStrip url={url} />
      <ApplicationsList url={url} search={search} />
      <SearchStatus q={url.q} />
    </div>
  );
}

/**
 * The list below the header keeps focus when a refetch moves or drops rows (decision D14). A named
 * group, not a region: the phase sections are the landmarks, so no extra landmark level.
 */
function ApplicationsList({ url, search }: { url: ApplicationsUrl; search: SearchDraft }) {
  const { t } = useI18n();
  const listRef = useListFocus();
  return (
    <div
      id={LIST_ID}
      ref={listRef}
      className="apps-list"
      role="group"
      aria-label={t("applications.list.label")}
      tabIndex={-1}
    >
      <ActiveSections url={url} onResetSearch={search.reset} />
      <ClosedSection url={url} />
    </div>
  );
}
