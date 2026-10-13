"use client";

import { Briefcase, SearchX } from "lucide-react";
import Link from "next/link";
import {
  emptyKind,
  visiblePhases,
  type ApplicationRow,
  type EmptyKind,
  type PhaseFilter,
  type PhaseGroups,
} from "@/domain/applications";
import { flattenPages, INBOX_PATH, listPhase } from "@/domain/inbox";
import { ListError, ListLoading } from "@/features/inbox/InboxList";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PhaseRows } from "./ApplicationListRow";
import { PhaseSection } from "./PhaseSection";
import { PhaseEmpty, showAllPhases } from "./PhaseStrip";
import {
  listStatus,
  settledClosedCount,
  useActiveApplications,
  useClosedTotal,
  usePhaseGroups,
  type ApplicationsListQuery,
} from "./useApplicationLists";
import type { ApplicationsUrl } from "./useApplicationsUrl";

const COLUMNS: readonly MessageKey[] = [
  "applications.col.job",
  "applications.col.next",
  "applications.col.when",
  "applications.col.docs",
];

export interface ActiveSectionsProps {
  url: ApplicationsUrl;
  onResetSearch: () => void;
}

/** Loading, stalled, error and filled states of the active applications (decision D11). */
export function ActiveSections({ url, onResetSearch }: ActiveSectionsProps) {
  const list = useActiveApplications(url.q);
  const groups = usePhaseGroups(url.q);
  const state = listPhase(listStatus(list));
  if (state === "loading" || state === "stalled") {
    return <ListLoading stalled={state === "stalled"} />;
  }
  if (!groups) return <ListError error={list.error} onRetry={() => void list.refetch()} />;
  return <LoadedSections url={url} groups={groups} list={list} onResetSearch={onResetSearch} />;
}

interface LoadedSectionsProps {
  url: ApplicationsUrl;
  groups: PhaseGroups;
  list: ApplicationsListQuery;
  onResetSearch: () => void;
}

function LoadedSections({ url, groups, list, onResetSearch }: LoadedSectionsProps) {
  const empty = useEmptyKind(url, groups, list);
  if (empty === "noApplications") return <FirstRunEmpty />;
  if (empty === "noMatch") return <NoMatchEmpty q={url.q} onReset={onResetSearch} />;
  // The closed filter shows no active rows: ClosedSection brings its rows, states and LoadMore.
  if (url.phase === "CLOSED") return null;
  if (empty === undefined) return <ListLoading stalled={false} />;
  return (
    <div className="apps-sections" aria-busy={list.isPlaceholderData || undefined}>
      <PhaseBlocks url={url} groups={groups} />
      <LoadMore list={list} />
    </div>
  );
}

/** Decision D4: a phase filter from the strip shows only that phase (url.phase). */
function PhaseBlocks({ url, groups }: { url: ApplicationsUrl; groups: PhaseGroups }) {
  return visiblePhases(groups, url.phase).map((phase, index) => (
    <PhaseSection key={phase} phase={phase} count={groups[phase].length}>
      <PhaseContent
        rows={groups[phase]}
        withHead={index === 0}
        onShowAll={() => showAllPhases(url, phase)}
      />
    </PhaseSection>
  ));
}

interface PhaseContentProps {
  rows: readonly ApplicationRow[];
  withHead: boolean;
  onShowAll: () => void;
}

/**
 * Only a filtered phase can be empty here; unfiltered, empty phases are not rendered (D5). The
 * column head sits once, above the rows of the first shown section.
 */
function PhaseContent({ rows, withHead, onShowAll }: PhaseContentProps) {
  if (rows.length === 0) return <PhaseEmpty onShowAll={onShowAll} />;
  return (
    <>
      {withHead ? <ColumnHead keys={COLUMNS} /> : null}
      <PhaseRows rows={rows} />
    </>
  );
}

function shownIn(groups: PhaseGroups, phase: PhaseFilter | null, closed: number): number {
  if (!phase) return 0;
  return phase === "CLOSED" ? closed : groups[phase].length;
}

/**
 * Without active rows the first-run state needs the closed count too. It waits only until that
 * count settled, failed, is retried or waits for the network (RB13), never on a timer; undefined
 * means "still deciding".
 */
function useEmptyKind(
  url: ApplicationsUrl,
  groups: PhaseGroups,
  list: ApplicationsListQuery,
): EmptyKind | null | undefined {
  const closedQuery = useClosedTotal(url.q);
  const closed = settledClosedCount(closedQuery);
  const active = list.data?.pages[0]?.total ?? 0;
  if (active === 0 && closed === undefined) return undefined;
  const shown = shownIn(groups, url.phase, closed ?? 0);
  const kind = emptyKind({ q: url.q, phase: url.phase, shown, total: active + (closed ?? 0) });
  // A kept answer of the previous search must not claim "nothing found" for the new one.
  const keptAnswer = list.isPlaceholderData || closedQuery.isPlaceholderData;
  return kind === "noMatch" && keptAnswer ? undefined : kind;
}

/** Visual only: each cell carries its own label for screen readers (decision D5). */
export function ColumnHead({ keys }: { keys: readonly MessageKey[] }) {
  const { t } = useI18n();
  return (
    <div className="arows-head" aria-hidden="true">
      {keys.map((key) => (
        <span key={key}>{t(key)}</span>
      ))}
    </div>
  );
}

function FirstRunEmpty() {
  const { t } = useI18n();
  const toInbox = (
    <Link className="btn" href={INBOX_PATH}>
      {t("onboard.toInbox")}
    </Link>
  );
  return (
    <EmptyState icon={Briefcase} title={t("applications.empty.title")} actions={toInbox}>
      {t("applications.empty.text")}
    </EmptyState>
  );
}

function NoMatchEmpty({ q, onReset }: { q: string; onReset: () => void }) {
  const { t } = useI18n();
  const reset = <Button onClick={onReset}>{t("applications.search.reset")}</Button>;
  return (
    <EmptyState icon={SearchX} title={t("applications.search.noneTitle")} actions={reset}>
      {t("applications.search.none", { query: q })}
    </EmptyState>
  );
}

/**
 * Decision D7: an explicit button and how much is loaded; the strip counts the loaded rows. Busy
 * during any fetch of the list: fetchNextPage would cancel a running refetch (RB16).
 */
export function LoadMore({ list }: { list: ApplicationsListQuery }) {
  const { t } = useI18n();
  if (!list.hasNextPage) return null;
  const loaded = flattenPages(list.data?.pages).length;
  const total = list.data?.pages.at(-1)?.total ?? loaded;
  return (
    <div className="list-foot">
      <p className="apps-partial">{t("applications.partial", { loaded, total })}</p>
      <Button size="sm" busy={list.isFetching} onClick={() => void list.fetchNextPage()}>
        {t("inbox.more")}
      </Button>
    </div>
  );
}
