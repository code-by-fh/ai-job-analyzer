"use client";

import type { JobListItem } from "@/api/jobList";
import { emptyKind, sinceOf, sortClosed } from "@/domain/applications";
import { flattenPages, listPhase } from "@/domain/inbox";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import { useJobFormat } from "@/features/job/format/useJobFormat";
import { statusLabel } from "@/features/job/labels";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Disclosure } from "@/ui/Disclosure";
import { ColumnHead, LoadMore } from "./ActiveSections";
import { RowCell, RowTitle } from "./ApplicationListRow";
import { PhaseSection } from "./PhaseSection";
import { PhaseEmpty, showAllPhases } from "./PhaseStrip";
import {
  listStatus,
  useActiveApplications,
  useClosedApplications,
  useClosedTotal,
  type ApplicationsListQuery,
} from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

const CLOSED_COLUMNS: readonly MessageKey[] = [
  "applications.col.job",
  "applications.col.outcome",
  "applications.col.closedOn",
];

/**
 * Spec 4.2: Abgeschlossen is collapsed (state in ?abgeschlossen=1). The strip's closed filter shows
 * the rows open and without the toggle, whatever ?abgeschlossen says; leaving the filter brings the
 * toggle back as the URL left it. The rows load only while shown (decision D2).
 */
export function ClosedSection({ url }: { url: ApplicationsUrl }) {
  if (url.phase === "CLOSED") return <ClosedPhase url={url} />;
  return url.phase ? null : <ClosedToggle url={url} />;
}

/** An unknown closed count counts as 0 (RB13): no toggle, and nothing waits for the count. */
function ClosedToggle({ url }: { url: ApplicationsUrl }) {
  const { t } = useI18n();
  const total = useClosedTotal(url.q);
  if (!total.data) return null;
  return (
    <div className="closed-toggle">
      <Disclosure
        label={t("applications.closed.toggle", { count: total.data })}
        open={url.closedOpen}
        onOpenChange={url.setClosedOpen}
      >
        {url.closedOpen ? <ShownClosedList q={url.q} count={total.data} /> : null}
      </Disclosure>
    </div>
  );
}

/**
 * Mounted only while open, so the closed rows load only then (decision D2). Nested under the
 * active list, whose error already alerts during an outage, its own error stays quiet (RB17).
 */
function ShownClosedList({ q, count }: { q: string; count: number }) {
  return <ClosedList list={useClosedApplications(q)} count={count} announce={false} />;
}

/**
 * The closed filter decides on the closed rows themselves, so it never waits for the closed count
 * (RB13). The active list's loading and error states, the first run and a search without hits are
 * shown by ActiveSections; this adds only what is the closed phase's own.
 */
function ClosedPhase({ url }: { url: ApplicationsUrl }) {
  const active = useActiveApplications(url.q);
  const list = useClosedApplications(url.q);
  if (!active.data) return null;
  // Under the filter the closed list is the main content, so its error is announced (R11).
  if (!list.data) return <ClosedListState list={list} announce />;
  const closed = list.data.pages[0]?.total ?? 0;
  const total = (active.data.pages[0]?.total ?? 0) + closed;
  const kind = emptyKind({ q: url.q, phase: "CLOSED", shown: closed, total });
  if (kind === null) return <ClosedList list={list} count={closed} announce />;
  if (kind !== "phaseEmpty") return null;
  return (
    <PhaseSection phase="CLOSED" count={0}>
      <PhaseEmpty onShowAll={() => showAllPhases(url, "CLOSED")} />
    </PhaseSection>
  );
}

interface ClosedListProps {
  list: ApplicationsListQuery;
  count: number;
  announce: boolean;
}

/** Kept rows of the previous search are marked busy, with the active list's bar (D3). */
function ClosedList({ list, count, announce }: ClosedListProps) {
  const rows = sortClosed(flattenPages(list.data?.pages));
  return (
    <div className="apps-closed" aria-busy={list.isPlaceholderData || undefined}>
      <PhaseSection phase="CLOSED" count={count}>
        <ClosedListState list={list} announce={announce} />
        {rows.length > 0 ? <ClosedRows rows={rows} /> : null}
        <LoadMore list={list} />
      </PhaseSection>
    </div>
  );
}

function ClosedListState({ list, announce }: { list: ApplicationsListQuery; announce: boolean }) {
  const state = listPhase(listStatus(list));
  if (state === "loading" || state === "stalled") {
    return <ListLoading stalled={state === "stalled"} />;
  }
  if (state !== "error") return null;
  return <ListError error={list.error} onRetry={() => void list.refetch()} announce={announce} />;
}

function ClosedRows({ rows }: { rows: readonly JobListItem[] }) {
  return (
    <>
      <ColumnHead keys={CLOSED_COLUMNS} />
      <ul role="list" className="arows">
        {rows.map((item) => (
          <ClosedRow key={item.id} item={item} />
        ))}
      </ul>
    </>
  );
}

/** Prototype renderClosedTable: job, outcome (never the raw status) and the closing date. */
function ClosedRow({ item }: { item: JobListItem }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const closedOn = sinceOf(item);
  return (
    <li className="arow">
      <RowTitle item={item} />
      <RowCell label="applications.col.outcome">{t(statusLabel(item.status))}</RowCell>
      <RowCell label="applications.col.closedOn">
        {closedOn ? format.date(closedOn) : t("applications.when.none")}
      </RowCell>
    </li>
  );
}
