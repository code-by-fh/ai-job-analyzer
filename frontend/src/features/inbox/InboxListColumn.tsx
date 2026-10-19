"use client";

import type { ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import type { SetupStatus } from "@/api/setup";
import { useI18n } from "@/i18n/useI18n";
import { TabPanel } from "@/ui/Tabs";
import { DueCard } from "./DueCard";
import { InboxHeader } from "./InboxHeader";
import { InboxList, ListLoading } from "./InboxList";
import { INBOX_TABS_ID, InboxTabs } from "./InboxTabs";
import { AiMissingNotice } from "./onboarding/AiMissingNotice";
import { useDueGate, type DueGate } from "./useDueGate";
import { ThresholdPanel } from "./threshold/ThresholdPanel";
import type { InboxUrl } from "./useInboxUrl";
import { useShowBelow } from "./useShowBelow";

export interface InboxListColumnProps {
  url: InboxUrl;
  /** Undefined when the advisory setup status could not be loaded. */
  setup: SetupStatus | undefined;
  renderRow: (item: JobListItem) => ReactNode;
}

/** Left column: masthead, tabs and the selected tab's list (usability "Eingang" layout). */
export function InboxListColumn(props: InboxListColumnProps) {
  const { url, setup } = props;
  const { t } = useI18n();
  const gate = useDueGate(url.tab);
  const showBelow = useShowBelow(url);
  return (
    <section className="inbox-list" aria-label={t("nav.inbox")}>
      <div className="inbox-top">
        <InboxHeader onShowBelow={url.tab === "below" ? undefined : showBelow} />
        {/* Above the tabs, next to the run line it qualifies; tabs and panel stay adjacent. */}
        <AiMissingNotice status={setup} />
        <DueCard />
        {gate.open ? <InboxTabs tab={url.tab} onSelect={url.setTab} /> : null}
      </div>
      <ListArea {...props} gate={gate} onShowBelow={showBelow} />
    </section>
  );
}

interface ListPanelProps extends InboxListColumnProps {
  onShowBelow: () => void;
}

/** The tabs' panel once the due gate is open, its skeleton before. */
function ListArea({ gate, ...panel }: ListPanelProps & { gate: DueGate }) {
  if (!gate.open) return <ListLoading stalled={gate.stalled} />;
  return <ListPanel {...panel} />;
}

function ListPanel({ url, renderRow, onShowBelow }: ListPanelProps) {
  return (
    <>
      <TabPanel idPrefix={INBOX_TABS_ID} selected={url.tab}>
        {url.tab === "below" ? <ThresholdPanel /> : null}
        <InboxList tab={url.tab} renderRow={renderRow} onShowBelow={onShowBelow} />
      </TabPanel>
    </>
  );
}
