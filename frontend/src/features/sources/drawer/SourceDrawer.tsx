"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, type ComponentType } from "react";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { hostOf, safeHref } from "@/domain/links";
import { PENDING_SETUP, sourceState } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityTask } from "@/realtime/activity";
import { useActivity } from "@/realtime/useActivity";
import { Drawer } from "@/ui/Drawer";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { CrawlButton } from "../crawl/CrawlButton";
import { CrawlProgress } from "../crawl/CrawlProgress";
import { SourcesLiveStatus } from "../crawl/SourcesLiveStatus";
import { runningTaskOf } from "../SourceList";
import { focusSourceOrTitle } from "../useFocusFallback";
import { DeleteSource } from "./DeleteSource";
import type { SectionProps } from "./DrawerSection";
import { NotifySection } from "./NotifySection";
import { RunHistory } from "./RunHistory";
import { ScheduleSection } from "./ScheduleSection";
import { SourceSection } from "./SourceSection";
import { useDirtySections } from "./useDirtySections";

/** D5 order of the editable sections; Letzte Läufe and Quelle löschen follow them. */
const SECTIONS: ReadonlyArray<[string, ComponentType<SectionProps>]> = [
  ["source", SourceSection],
  ["schedule", ScheduleSection],
  ["notify", NotifySection],
];

interface SourceDrawerProps {
  platform: Platform;
  /** Called once leaving is settled (nothing unsaved, or the user chose to discard). */
  onClose: () => void;
  /** After a confirmed delete: closes without the leave question (the edits went with the source). */
  onDeleted: () => void;
}

/**
 * Preflight ruling 15: after the drawer is gone, focus that fell to <body> (a deep link has no
 * trigger to return to) goes to the source's row, else the page title. From the unmount, because
 * the URL change that closes the drawer is a transition. A delete points the target at the next
 * row (D9); the drawer is keyed by its source, so the first id is the one to start from.
 */
function useFocusFallbackOnUnmount(
  platformId: number,
  onDeleted: () => void,
): (nextId: number | null) => void {
  const targetRef = useRef<number | null>(platformId);
  useEffect(() => () => focusSourceOrTitle(targetRef.current), []);
  return (nextId) => {
    targetRef.current = nextId;
    onDeleted();
  };
}

/** Every way of closing (X, Escape, scrim) asks about unsaved edits first. */
function useGuardedClose(onClose: () => void) {
  const { report, requestLeave } = useDirtySections();
  const close = () => void requestLeave().then((leave) => leave && onClose());
  return { report, close };
}

/**
 * D5: one drawer per source; the editable sections, then Letzte Läufe and Quelle löschen. The
 * drawer is modal and hides the page's live region, so it has its own (the page's is muted).
 */
export function SourceDrawer({ platform, onClose, onDeleted }: SourceDrawerProps) {
  const { t } = useI18n();
  const { report, close } = useGuardedClose(onClose);
  const deleted = useFocusFallbackOnUnmount(platform.id, onDeleted);
  const task = runningTaskOf(useActivity(true), platform.id);
  const platforms = useQuery(platformsQueryOptions());
  const label = t("sources.drawer", { name: platform.name });
  return (
    <Drawer open onClose={close} label={label} variant="wide">
      <div className="panel-in source-drawer">
        <PanelHeader title={platform.name} onClose={close} />
        <DrawerSubline platform={platform} task={task} />
        <DrawerBody platform={platform} report={report} />
        <RunHistory platformId={platform.id} />
        <DeleteSource platform={platform} running={task !== null} onDeleted={deleted} />
        <SourcesLiveStatus platforms={platforms.data ?? []} />
      </div>
    </Drawer>
  );
}

/** D15: a legacy source that never finished setup says how to finish it; then the sections. */
function DrawerBody({ platform, report }: SectionProps) {
  const { t } = useI18n();
  return (
    <>
      {platform.setup_status === PENDING_SETUP ? (
        <Notice>{t("sources.setupPending")}</Notice>
      ) : null}
      {SECTIONS.map(([key, Section]) => (
        <Section key={key} platform={platform} report={report} />
      ))}
    </>
  );
}

interface CrawlProps {
  platform: Platform;
  task: ActivityTask | null;
}

/** The stored (canonical) host, the page itself (http(s) only) and this source's crawl control. */
function DrawerSubline({ platform, task }: CrawlProps) {
  const { t } = useI18n();
  const href = safeHref(platform.url);
  return (
    <div className="drawer-subline">
      <span className="src-host">{hostOf(platform.url) ?? platform.url}</span>
      {href ? (
        <a className="link" href={href} target="_blank" rel="noreferrer">
          {t("sources.openPage")} <Icon icon={ExternalLink} />
        </a>
      ) : null}
      <HeaderCrawl platform={platform} task={task} />
    </div>
  );
}

/** D4: the header repeats Durchsuchen, or the live progress with Abbrechen while it runs. */
function HeaderCrawl({ platform, task }: CrawlProps) {
  return (
    <span className="drawer-crawl">
      {task ? (
        <CrawlProgress platform={platform} task={task} place="header" />
      ) : (
        <CrawlButton platform={platform} state={sourceState(platform, false)} place="header" />
      )}
    </span>
  );
}
