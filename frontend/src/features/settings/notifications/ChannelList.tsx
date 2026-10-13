"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { channelStatusQueryOptions, type ChannelStatus } from "@/api/notifications";
import {
  notificationSettingsQueryOptions,
  type NotificationSettings,
} from "@/api/notificationSettings";
import { NOTIFY_CHANNELS, type NotifyChannel } from "@/api/platformPaths";
import { SectionState } from "@/features/profile/SectionState";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { ChannelRow } from "./ChannelRow";

/**
 * Ruling 42: one form open. Switching or closing asks only when the open form is dirty; the rows'
 * flags pass through here on their way to the page's reporter.
 */
function useOpenChannel(report: ReportDirty) {
  const { requestLeave } = useUnsavedChanges();
  const [open, setOpen] = useState<NotifyChannel | null>(null);
  const dirtyRows = useRef(new Set<string>());
  const trackedReport = useCallback<ReportDirty>(
    (row, dirty) => {
      if (dirty) dirtyRows.current.add(row);
      else dirtyRows.current.delete(row);
      report(row, dirty);
    },
    [report],
  );
  const toggle = async (channel: NotifyChannel) => {
    if (dirtyRows.current.size > 0 && !(await requestLeave())) return;
    setOpen((current) => (current === channel ? null : channel));
  };
  return { open, toggle, close: () => setOpen(null), report: trackedReport };
}

type OpenChannel = ReturnType<typeof useOpenChannel>;

interface ChannelRowsProps {
  settings: NotificationSettings;
  status: ChannelStatus;
  channels: OpenChannel;
}

function ChannelRows({ settings, status, channels }: ChannelRowsProps) {
  return (
    <ul role="list" className="chan-list">
      {NOTIFY_CHANNELS.map((channel) => (
        <ChannelRow
          key={channel}
          channel={channel}
          settings={settings}
          configured={status[channel]}
          open={channels.open === channel}
          onToggle={(next) => void channels.toggle(next)}
          onClose={channels.close}
          report={channels.report}
        />
      ))}
    </ul>
  );
}

/** D5: one row per channel (4: the backend has no Gmail adapter, R1). */
export function ChannelList({ report }: { report: ReportDirty }) {
  const settingsQuery = useQuery(notificationSettingsQueryOptions());
  const statusQuery = useQuery(channelStatusQueryOptions());
  const channels = useOpenChannel(report);
  // Ruling 40: no row before both answers, so "Nicht eingerichtet" never flashes.
  return (
    <SectionState query={settingsQuery}>
      {(settings) => (
        <SectionState query={statusQuery}>
          {(status) => <ChannelRows settings={settings} status={status} channels={channels} />}
        </SectionState>
      )}
    </SectionState>
  );
}
