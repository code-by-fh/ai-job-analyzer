"use client";

import { useIsMutating } from "@tanstack/react-query";
import { Archive, Check, Gauge, Globe, RotateCcw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import type { InboxTab, JobListItem } from "@/api/jobList";
import { INBOX_TRIAGE_KEY } from "@/api/queryKeys";
import { flattenPages, listPhase } from "@/domain/inbox";
import { SOURCES_HREF } from "@/features/shell/navigation";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { useInboxList, type InboxListQuery } from "./useInboxLists";

type RenderRow = (item: JobListItem) => ReactNode;

export interface InboxListProps {
  tab: InboxTab;
  renderRow: RenderRow;
  onShowBelow: () => void;
}

const SKELETON_ROWS = [0, 1, 2];

interface EmptyCopy {
  icon: LucideIcon;
  title: MessageKey;
  text: MessageKey;
}

const EMPTY_COPY: Readonly<Record<InboxTab, EmptyCopy>> = {
  new: { icon: Check, title: "inbox.empty.newTitle", text: "inbox.empty.newText" },
  below: { icon: Gauge, title: "inbox.empty.belowTitle", text: "inbox.empty.belowText" },
  dismissed: {
    icon: Archive,
    title: "inbox.empty.dismissedTitle",
    text: "inbox.empty.dismissedText",
  },
};

/** Loading, stalled, error, empty and filled states of one tab (spec 6, decision D10). */
export function InboxList({ tab, renderRow, onShowBelow }: InboxListProps) {
  const list = useInboxList(tab);
  const rows = flattenPages(list.data?.pages);
  const phase = listPhase({
    hasData: list.data !== undefined,
    isError: list.isError,
    failureCount: list.failureCount,
    itemCount: rows.length,
  });
  if (phase === "loading" || phase === "stalled") {
    return <ListLoading stalled={phase === "stalled"} />;
  }
  if (phase === "error")
    return <ListError error={list.error} onRetry={() => void list.refetch()} />;
  if (phase === "empty") return <InboxEmpty tab={tab} onShowBelow={onShowBelow} />;
  return <ListRows rows={rows} list={list} renderRow={renderRow} />;
}

interface ListRowsProps {
  rows: readonly JobListItem[];
  list: InboxListQuery;
  renderRow: RenderRow;
}

function ListRows({ rows, list, renderRow }: ListRowsProps) {
  return (
    <>
      <ul role="list" className="jrows">
        {rows.map((row) => (
          <Fragment key={row.id}>{renderRow(row)}</Fragment>
        ))}
      </ul>
      <LoadMore list={list} />
    </>
  );
}

export function ListLoading({ stalled }: { stalled: boolean }) {
  const { t } = useI18n();
  return (
    <div className="jrows-loading" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="jrow-skeleton">
          <span className="skeleton-line w-2/3" />
          <span className="skeleton-line w-1/2" />
        </div>
      ))}
      {stalled ? <p className="jrows-stalled">{t("inbox.stalled")}</p> : null}
    </div>
  );
}

export interface ListErrorProps {
  error: unknown;
  onRetry: () => void;
  /** False when another alert already announces the same outage (one alert per outage). */
  announce?: boolean;
  /** What a code means for this request (describeError), e.g. a 503 the server documents. */
  overrides?: ErrorMessageOverrides;
}

export function ListError({ error, onRetry, announce = true, overrides }: ListErrorProps) {
  const { t } = useI18n();
  return (
    <div className="inbox-notice">
      <Notice tone="error" announce={announce}>
        {describeError(error, t, overrides)}
      </Notice>
      <Button className="mt-3" icon={RotateCcw} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}

function InboxEmpty({ tab, onShowBelow }: { tab: InboxTab; onShowBelow: () => void }) {
  const { t } = useI18n();
  const copy = EMPTY_COPY[tab];
  const actions = tab === "new" ? <NewEmptyActions onShowBelow={onShowBelow} /> : undefined;
  return (
    <EmptyState icon={copy.icon} title={t(copy.title)} actions={actions}>
      {t(copy.text)}
    </EmptyState>
  );
}

function NewEmptyActions({ onShowBelow }: { onShowBelow: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <Link className="btn" href={SOURCES_HREF}>
        <Icon icon={Globe} />
        <span>{t("action.viewSources")}</span>
      </Link>
      <Button variant="ghost" onClick={onShowBelow}>
        {t("inbox.toBelow")}
      </Button>
    </>
  );
}

/**
 * Decision D9: an explicit button instead of infinite scroll. It waits while a triage runs: the next
 * page's offset and answer would still count the row the triage only removed in the cache. It also
 * waits for any refetch of the list: fetchNextPage would cancel it, and with it the updates that
 * realtime events skipped during the triage (R15).
 */
function LoadMore({ list }: { list: InboxListQuery }) {
  const { t } = useI18n();
  const triaging = useIsMutating({ mutationKey: INBOX_TRIAGE_KEY }) > 0;
  if (!list.hasNextPage) return null;
  const busy = list.isFetching || triaging;
  return (
    <div className="list-foot">
      <Button size="sm" busy={busy} onClick={() => void list.fetchNextPage()}>
        {t("inbox.more")}
      </Button>
    </div>
  );
}
