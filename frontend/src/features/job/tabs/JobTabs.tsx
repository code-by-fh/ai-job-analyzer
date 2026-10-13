"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { TabPanel, Tabs } from "@/ui/Tabs";
import { CompanyTab } from "../company/CompanyTab";
import { DocumentsTab } from "../documents/DocumentsTab";
import { FitTab } from "../fit/FitTab";
import { HistoryTab } from "../history/HistoryTab";
import { InterviewTab } from "../interview/InterviewTab";
import { DimPanel } from "./DimPanel";
import {
  defaultTab,
  dimReason,
  JOB_TABS,
  TAB_QUERY_KEY,
  tabFromParam,
  tabParam,
  type JobTab,
} from "./jobTabs";

const TAB_ID_PREFIX = "jd";

export const TAB_PANELS: Readonly<Record<JobTab, (props: { job: JobDetail }) => ReactNode>> = {
  fit: FitTab,
  documents: DocumentsTab,
  company: CompanyTab,
  interview: InterviewTab,
  history: HistoryTab,
};

/** Switches the tab through the URL (?tab=), so reloads and links restore it (decision D12). */
export function useOpenTab(): (tab: JobTab) => void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { requestLeave } = useUnsavedChanges();
  return (tab) => {
    const target = `${pathname}?${TAB_QUERY_KEY}=${tabParam(tab)}`;
    void requestLeave().then((leave) => leave && router.replace(target, { scroll: false }));
  };
}

/** The tab from ?tab=, or the phase's default for a missing or unknown value. */
function useSelectedTab(job: JobDetail): JobTab {
  return tabFromParam(useSearchParams().get(TAB_QUERY_KEY)) ?? defaultTab(phaseOf(job));
}

export function JobTabs({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const openTab = useOpenTab();
  const selected = useSelectedTab(job);
  const items = JOB_TABS.map((key) => ({ key, label: t(`tab.${key}`) }));
  return (
    <section className="jd-tabs">
      <Tabs
        items={items}
        selected={selected}
        onSelect={(tab) => tab !== selected && openTab(tab)}
        label={t("tab.label")}
        idPrefix={TAB_ID_PREFIX}
      />
      <JobTabPanel job={job} selected={selected} />
    </section>
  );
}

function JobTabPanel({ job, selected }: { job: JobDetail; selected: JobTab }) {
  const { t } = useI18n();
  return (
    <TabPanel idPrefix={TAB_ID_PREFIX} selected={selected}>
      {/* The aside's h2 cards come first in the DOM; this h2 keeps the tab content out of them. */}
      <h2 className="sr-only">{t(`tab.${selected}`)}</h2>
      <TabContent key={selected} job={job} tab={selected} />
    </TabPanel>
  );
}

function TabContent({ job, tab }: { job: JobDetail; tab: JobTab }) {
  const [forced, setForced] = useState(false);
  const reason = dimReason(tab, phaseOf(job));
  if (reason && !forced) return <DimPanel reason={reason} onOpen={() => setForced(true)} />;
  const Panel = TAB_PANELS[tab];
  return <Panel job={job} />;
}
