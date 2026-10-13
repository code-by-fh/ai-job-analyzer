"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import type { JobListItem } from "@/api/jobList";
import { platformsQueryOptions } from "@/api/platforms";
import { isApiDate } from "@/domain/calendar";
import { fitLine } from "@/domain/inbox";
import { hostOf } from "@/domain/links";
import { statusLabel } from "@/features/job/labels";
import { jobRoute } from "@/features/shell/routes";
import { formatRelativeDays } from "@/i18n/formatDate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { cx } from "@/ui/cx";
import { Monogram } from "@/ui/Monogram";
import { ScoreMeter } from "@/ui/ScoreMeter";

export interface InboxRowProps {
  item: JobListItem;
  selected?: boolean;
  /** Set from 1200 px: the click selects instead of navigating (decision D2). */
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  actions?: ReactNode;
}

/** Spec 4.2 compact row; the title link stretches over the row (spec 4.3 #5), buttons sit above it. */
export function InboxRow({ item, selected = false, onOpen, actions }: InboxRowProps) {
  const fit = fitLine(item.reasoning);
  return (
    <li className={cx("jrow", selected && "is-selected")}>
      <Monogram name={item.company} />
      <div className="jrow-main">
        <RowLink item={item} selected={selected} onOpen={onOpen} />
        <RowMeta item={item} />
        {fit ? <p className="jrow-fit">{fit}</p> : null}
      </div>
      <RowScore score={item.match_score} />
      {actions ? <div className="jrow-actions">{actions}</div> : null}
    </li>
  );
}

function RowLink({ item, selected, onOpen }: Omit<InboxRowProps, "actions">) {
  const { t } = useI18n();
  return (
    <Link
      className="jrow-link"
      href={jobRoute(item.id)}
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
    >
      {item.title ?? t("job.untitled")}
    </Link>
  );
}

function RowMeta({ item }: { item: JobListItem }) {
  const { t } = useI18n();
  const now = useNow();
  const source = useSourceName(item);
  const found =
    item.created_at && isApiDate(item.created_at)
      ? formatRelativeDays(item.created_at, t, { now })
      : null;
  // A former application in "Von dir aussortiert" says which phase it had (decision D13).
  const phase = item.status === "OPEN" ? null : t(statusLabel(item.status));
  const parts = [item.company ?? t("job.unknownCompany"), found, source, phase];
  return <p className="jrow-sub">{parts.filter(Boolean).join(" · ")}</p>;
}

/** The source's own name, else the posting's host (imported jobs have no source). */
function useSourceName(item: JobListItem): string | null {
  const platforms = useQuery(platformsQueryOptions());
  const platform = platforms.data?.find((entry) => entry.id === item.platform_id);
  return platform?.name ?? hostOf(item.url);
}

function RowScore({ score }: { score: number | null | undefined }) {
  const { t } = useI18n();
  if (typeof score === "number") return <ScoreMeter score={score} />;
  return (
    <span className="score unscored" title={t("job.unscored")}>
      <span className="score-n" aria-hidden="true">
        –
      </span>
      <span className="sr-only">{t("job.unscored")}</span>
    </span>
  );
}
