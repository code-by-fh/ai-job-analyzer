"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Platform } from "@/api/platforms";
import { hostOf } from "@/domain/links";
import { scheduleOf } from "@/domain/schedule";
import { sourcesHref, sourceState } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import type { ActivityTask } from "@/realtime/activity";
import { cx } from "@/ui/cx";
import { scheduleText } from "./labels";
import { RunCell } from "./RunCell";
import { SourceIcon } from "./SourceIcon";
import { StatusTag } from "./StatusTag";
import { sourceLinkId } from "./useFocusFallback";

export interface SourceRowProps {
  platform: Platform;
  task: ActivityTask | null;
  /** The last-run cell while a crawl runs (inline progress with Abbrechen). */
  progress?: ReactNode;
  /** The action cell (Bearbeiten, Durchsuchen). */
  action?: ReactNode;
}

/** One focusable link per row (spec 4.3 #5); the actions sit in their own cell, never inside the link. */
export function SourceRow({ platform, task, progress, action }: SourceRowProps) {
  const { t } = useI18n();
  return (
    <li className="src-row">
      <NameCell platform={platform} />
      <Cell label="sources.col.schedule" className="src-schedule">
        {scheduleText(scheduleOf(platform), t)}
      </Cell>
      <Cell label="sources.col.lastRun" className="src-run">
        {task && progress ? progress : <RunCell platform={platform} />}
      </Cell>
      <Cell label="sources.col.status" className="src-state">
        <StatusTag state={sourceState(platform, task !== null)} />
      </Cell>
      <div className="src-cell src-action">{action}</div>
    </li>
  );
}

function NameCell({ platform }: { platform: Platform }) {
  return (
    <div className="src-cell src-name-cell">
      <SourceIcon platform={platform} />
      <Link
        id={sourceLinkId(platform.id)}
        className="src-name"
        href={sourcesHref({ sourceId: platform.id })}
        replace
        scroll={false}
      >
        {platform.name}
      </Link>
      <span className="src-host">{hostOf(platform.url) ?? platform.url}</span>
    </div>
  );
}

interface CellProps {
  label: MessageKey;
  className: string;
  children: ReactNode;
}

/**
 * The label shows in the narrow layout and is read by screen readers in both, because the column
 * head is aria-hidden.
 */
function Cell({ label, className, children }: CellProps) {
  const { t } = useI18n();
  return (
    <div className={cx("src-cell", className)}>
      <span className="src-label">{t(label)}: </span>
      {children}
    </div>
  );
}
