"use client";

import { INBOX_TABS, type InboxTab } from "@/api/jobList";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { CountBadge } from "@/ui/CountBadge";
import { Tabs } from "@/ui/Tabs";
import { useInboxCounts } from "./useInboxLists";

export const INBOX_TABS_ID = "inbox";

const TAB_LABEL: Readonly<Record<InboxTab, MessageKey>> = {
  new: "inbox.tab.new",
  below: "inbox.tab.below",
  dismissed: "inbox.tab.dismissed",
};

interface InboxTabsProps {
  tab: InboxTab;
  onSelect: (tab: InboxTab) => void;
}

/** Decision D3: WAI-ARIA tabs with counts (prototype .filter-tabs); the list is their panel. */
export function InboxTabs({ tab, onSelect }: InboxTabsProps) {
  const { t } = useI18n();
  const counts = useInboxCounts();
  const items = INBOX_TABS.map((key) => ({
    key,
    label: t(TAB_LABEL[key]),
    suffix: <TabCount tab={key} count={counts[key]} />,
  }));
  return (
    <Tabs
      items={items}
      selected={tab}
      onSelect={(next) => next !== tab && onSelect(next)}
      label={t("inbox.tabsLabel")}
      idPrefix={INBOX_TABS_ID}
    />
  );
}

/** New matches get the accent badge, the other tabs a plain number (prototype). */
function TabCount({ tab, count }: { tab: InboxTab; count: number | null }) {
  const { t } = useI18n();
  if (count === null) return null;
  if (tab === "new" && count > 0) {
    return <CountBadge count={count} label={t("nav.newMatches", { count })} />;
  }
  return <span className="count-plain">{count}</span>;
}
