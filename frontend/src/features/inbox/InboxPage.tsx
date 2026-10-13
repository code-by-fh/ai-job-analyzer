"use client";

import {
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { MouseEvent } from "react";
import {
  dueApplicationsQueryOptions,
  inboxListQueryOptions,
  type InboxTab,
  type JobListItem,
} from "@/api/jobList";
import { setupStatusQueryOptions, type SetupStatus } from "@/api/setup";
import { showOnboarding } from "@/domain/onboarding";
import { useI18n } from "@/i18n/useI18n";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ListLoading } from "./InboxList";
import { InboxListColumn } from "./InboxListColumn";
import { InboxPreview } from "./InboxPreview";
import { InboxRow } from "./InboxRow";
import { Onboarding } from "./onboarding/Onboarding";
import { RowActions } from "./RowActions";
import { useInboxUrl, type InboxUrl } from "./useInboxUrl";
import { useRemovalFocus } from "./useRemovalFocus";
import { useSelection, type Selection } from "./useSelection";
import { useTriage, type Triage } from "./useTriage";
import { useViewFocus, type InboxViewKind } from "./useViewFocus";

/**
 * Decision D2: from 1200 px the preview pane sits beside the list; below, rows open the job page.
 * R16(1): the layout itself comes from the same breakpoint in inbox.css, so it is right from the
 * server render on; this query only decides what a click does and what the pane shows.
 */
export const WIDE_INBOX_QUERY = "(min-width: 1200px)";

/** Focus and selection both move to the removed row's neighbour (same rule, same rows). */
function useInboxTriage(tab: InboxTab, selection: Selection): Triage {
  const focusAfterRemoval = useRemovalFocus(tab);
  return useTriage(tab, {
    onRemoved: (id) => {
      focusAfterRemoval(id);
      selection.onRemoved(id);
    },
    onTriageFailed: selection.onTriageFailed,
  });
}

/**
 * Eingang (spec 4.2), or the first-run onboarding in its place (decision D6). The setup status is
 * advisory: it is asked once without retries, and a failed or paused request shows the inbox.
 */
export function InboxPage() {
  const url = useInboxUrl();
  // R19(1): the due gate's two requests start with /setup-status; only the view choice waits.
  usePrefetchInfiniteQuery(inboxListQueryOptions(url.tab));
  // The deck and the Neu count read "Neu" on every tab (deduped when it is the open tab).
  usePrefetchInfiniteQuery(inboxListQueryOptions("new"));
  usePrefetchQuery(dueApplicationsQueryOptions());
  const setup = useQuery(setupStatusQueryOptions());
  const view = viewOf(setup, url.setup);
  useViewFocus(view);
  if (view === null) return <InboxSkeleton />;
  if (view === "onboarding" && setup.data) {
    // The way back only where an inbox exists; on the first run it would lead straight here again.
    const inboxExists = !showOnboarding(setup.data, false);
    return <Onboarding status={setup.data} requested={url.setup && inboxExists} />;
  }
  return <InboxView url={url} setup={setup.data} />;
}

/** Null while the setup status loads. Offline the request is paused, not failed: show the inbox. */
function viewOf(setup: UseQueryResult<SetupStatus>, requested: boolean): InboxViewKind | null {
  if (setup.isPending && setup.fetchStatus !== "paused") return null;
  return setup.data && showOnboarding(setup.data, requested) ? "onboarding" : "inbox";
}

/** R19(2): same grid as InboxView, so >=1200 px keeps both columns while the setup status loads. */
function InboxSkeleton() {
  const { t } = useI18n();
  return (
    <div className="inbox">
      <section className="inbox-list" aria-label={t("nav.inbox")}>
        <div className="inbox-top">
          <div className="mast" />
        </div>
        <ListLoading stalled={false} />
      </section>
      <aside className="inbox-detail" aria-hidden="true" />
    </div>
  );
}

interface InboxViewProps {
  url: InboxUrl;
  setup: SetupStatus | undefined;
}

/** The list, and from 1200 px the preview of the selected job beside it. */
function InboxView({ url, setup }: InboxViewProps) {
  const wide = useMediaQuery(WIDE_INBOX_QUERY);
  const selection = useSelection(url, wide);
  const triage = useInboxTriage(url.tab, selection);
  return (
    <div className="inbox">
      <InboxListColumn
        url={url}
        setup={setup}
        renderRow={(item) => (
          <Row item={item} tab={url.tab} selection={selection} triage={triage} />
        )}
      />
      <PreviewColumn selection={wide ? selection : null} tab={url.tab} triage={triage} />
    </div>
  );
}

/** A modified click (new tab, new window) keeps the browser's own handling of the link. */
function isPlainClick(event: MouseEvent): boolean {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

interface RowProps {
  item: JobListItem;
  tab: InboxTab;
  selection: Selection;
  triage: Triage;
}

function Row({ item, tab, selection, triage }: RowProps) {
  const { open } = selection;
  // The link keeps its href for middle-click and new tabs; a plain click only selects (D2).
  const onOpen = open
    ? (event: MouseEvent) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        open(item);
      }
    : undefined;
  return (
    <InboxRow
      item={item}
      selected={item.id === selection.selected?.id}
      onOpen={onOpen}
      actions={<RowActions item={item} tab={tab} triage={triage} />}
    />
  );
}

interface PreviewColumnProps {
  /** Null below 1200 px, where CSS hides the column and it stays empty. */
  selection: Selection | null;
  tab: InboxTab;
  triage: Triage;
}

/** Always rendered (CSS shows it from 1200 px); filled only once the list has data. */
function PreviewColumn({ selection, tab, triage }: PreviewColumnProps) {
  const { t } = useI18n();
  return (
    <aside className="inbox-detail" aria-label={t("inbox.previewLabel")}>
      {selection?.listLoaded ? (
        <PreviewContent selected={selection.selected} tab={tab} triage={triage} />
      ) : null}
    </aside>
  );
}

interface PreviewContentProps {
  selected: JobListItem | null;
  tab: InboxTab;
  triage: Triage;
}

function PreviewContent({ selected, tab, triage }: PreviewContentProps) {
  const { t } = useI18n();
  if (!selected) return <div className="detail-empty">{t("inbox.pickOne")}</div>;
  return <InboxPreview item={selected} tab={tab} triage={triage} />;
}
